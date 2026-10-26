import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { readReceiptWithAi, type ReadReceipt } from "@/lib/ai/receipt";
import { byCategory, CATEGORY_KEYS, deductibleAmount, defaultDeductible, guessCategory, toCsv } from "@/lib/business/expenses";
import { routeDay } from "@/lib/services/routes";
import { getSetting } from "@/lib/services/settings";
import { today } from "@/lib/time";

const MAX_RECEIPT = 6 * 1024 * 1024;
const RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const expenseInput = z.object({
  date: ymd,
  vendor: z.string().trim().min(1, "Who was it paid to?").max(200),
  amount: z.coerce.number().positive("Amount must be more than $0").max(1_000_000),
  category: z.enum(CATEGORY_KEYS),
  deductiblePct: z.coerce.number().int().min(0).max(100).optional(),
  paymentMethod: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  receiptId: z.string().optional().nullable(),
  workspace: z.enum(["RAPID", "GREYVO"]).default("RAPID"),
});
export type ExpenseInput = z.input<typeof expenseInput>;

/** Stores a receipt file and (when AI is on) reads it. Returns the draft to confirm. */
export async function uploadReceipt(file: { name: string; type: string; bytes: Buffer }): Promise<{ receiptId: string; draft: Partial<ExpenseInput>; read: ReadReceipt | null }> {
  const mime = file.type || "application/octet-stream";
  if (/heic|heif/i.test(mime) || /\.hei[cf]$/i.test(file.name)) throw new Error("iPhone HEIC photos can't be read. Choose “Most Compatible” in Camera settings, or take a screenshot of the photo.");
  if (!RECEIPT_TYPES.has(mime)) throw new Error("Use a photo (JPG, PNG, WebP) or a PDF");
  if (file.bytes.length > MAX_RECEIPT) throw new Error("That file is over 6 MB. Take the photo at a lower resolution.");
  const r = await db.receiptFile.create({ data: { mime, size: file.bytes.length, data: new Uint8Array(file.bytes) } });
  const read = await readReceiptWithAi(file.bytes, mime);
  const draft: Partial<ExpenseInput> = read?.isReceipt
    ? { vendor: read.vendor, amount: read.total || undefined, date: /^\d{4}-\d{2}-\d{2}$/.test(read.date) ? read.date : today(), category: read.category, paymentMethod: read.paymentMethod || null, notes: read.summary || null, receiptId: r.id }
    : { date: today(), receiptId: r.id };
  return { receiptId: r.id, draft, read };
}

export async function createExpense(raw: ExpenseInput, extracted?: ReadReceipt | null) {
  const v = expenseInput.parse(raw);
  return db.businessExpense.create({ data: { ...v, deductiblePct: v.deductiblePct ?? defaultDeductible(v.category), paymentMethod: v.paymentMethod ?? null, notes: v.notes ?? null, receiptId: v.receiptId ?? null, extracted: extracted ? (JSON.parse(JSON.stringify(extracted)) as object) : undefined } });
}

export async function updateExpense(id: string, raw: Partial<ExpenseInput>) {
  const v = expenseInput.partial().parse(raw);
  return db.businessExpense.update({ where: { id }, data: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) });
}

export async function deleteExpense(id: string) {
  const e = await db.businessExpense.delete({ where: { id } });
  if (e.receiptId) await db.receiptFile.delete({ where: { id: e.receiptId } }).catch(() => undefined);
  return e;
}

export const suggestCategory = guessCategory;

export async function listExpenses(opts: { month?: string; year?: string; workspace?: string } = {}) {
  const prefix = opts.month ?? opts.year ?? today().slice(0, 7);
  return db.businessExpense.findMany({ where: { workspace: opts.workspace ?? "RAPID", date: { startsWith: prefix } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: { id: true, date: true, vendor: true, amount: true, category: true, deductiblePct: true, paymentMethod: true, notes: true, receiptId: true } });
}

export async function getReceipt(id: string) {
  return db.receiptFile.findUnique({ where: { id } });
}

// ───────────── mileage ─────────────

export const vehicleInput = z.object({ name: z.string().trim().min(1, "Name the vehicle").max(80), kind: z.enum(["WORK", "PERSONAL"]).default("WORK"), plate: z.string().max(20).optional().nullable() });
export async function createVehicle(raw: z.input<typeof vehicleInput>) {
  return db.vehicle.create({ data: vehicleInput.parse(raw) });
}
export const tripInput = z.object({ vehicleId: z.string().min(1, "Pick a vehicle"), date: ymd, miles: z.coerce.number().positive("Miles must be more than 0").max(2000), purpose: z.string().trim().min(1, "What was the trip for?").max(300), business: z.boolean().default(true) });
export async function createTrip(raw: z.input<typeof tripInput>, source: "MANUAL" | "ROUTE" = "MANUAL") {
  return db.trip.create({ data: { ...tripInput.parse(raw), source } });
}

/** Logs the day's job route (home → stops → home) as one business trip. Once per vehicle per day. */
export async function logRouteMiles(date: string, vehicleId: string) {
  const r = await routeDay(date);
  if (!r.stops.length) throw new Error("No mapped jobs that day");
  const existing = await db.trip.findFirst({ where: { date, vehicleId, source: "ROUTE" } });
  if (existing) throw new Error("That day's route is already logged for this vehicle");
  return createTrip({ vehicleId, date, miles: r.driveMiles, purpose: `Job route: ${r.stops.map((s) => s.label).join(", ")}`, business: true }, "ROUTE");
}

/** Year to date: expenses by category, deductible totals, business miles × IRS rate. */
export async function taxYearSummary(year: string = today().slice(0, 4), workspace = "RAPID") {
  const [expenses, trips, rate, vehicles] = await Promise.all([
    db.businessExpense.findMany({ where: { workspace, date: { startsWith: year } }, select: { category: true, amount: true, deductiblePct: true } }),
    db.trip.findMany({ where: { date: { startsWith: year } }, include: { vehicle: { select: { name: true } } }, orderBy: { date: "desc" } }),
    getSetting("taxes.mileageRate"),
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const businessMiles = Math.round(trips.filter((t) => t.business).reduce((s, t) => s + t.miles, 0) * 10) / 10;
  const categories = byCategory(expenses);
  return {
    year,
    categories,
    totalSpent: Math.round(expenses.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    totalDeductible: Math.round(expenses.reduce((s, e) => s + deductibleAmount(e), 0) * 100) / 100,
    businessMiles,
    mileageRate: rate,
    mileageDeduction: Math.round(businessMiles * rate * 100) / 100,
    trips: trips.slice(0, 50),
    vehicles,
  };
}

export async function exportYearCsv(year: string, workspace = "RAPID") {
  const [rows, trips, rate] = await Promise.all([
    db.businessExpense.findMany({ where: { workspace, date: { startsWith: year } }, orderBy: { date: "asc" } }),
    db.trip.findMany({ where: { date: { startsWith: year } }, include: { vehicle: true }, orderBy: { date: "asc" } }),
    getSetting("taxes.mileageRate"),
  ]);
  const expenses = toCsv(["Date", "Vendor", "Category", "Amount", "Deductible %", "Deductible amount", "Payment", "Notes", "Has receipt"], rows.map((e) => [e.date, e.vendor, e.category, e.amount.toFixed(2), e.deductiblePct, deductibleAmount(e).toFixed(2), e.paymentMethod ?? "", e.notes ?? "", e.receiptId ? "yes" : "no"]));
  const mileage = toCsv(["Date", "Vehicle", "Miles", "Business", "Purpose", `Deduction @ $${rate}/mi`], trips.map((t) => [t.date, t.vehicle.name, t.miles, t.business ? "yes" : "no", t.purpose, t.business ? (t.miles * rate).toFixed(2) : "0.00"]));
  return { expenses, mileage };
}
