import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, monthRange, parseLocalDate, today, type LocalDate } from "@/lib/time";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const month = z.string().regex(/^\d{4}-\d{2}$/);

export const transactionSchema = z.object({
  date: localDate,
  amount: z.coerce.number().positive().max(1_000_000),
  merchant: z.string().trim().min(1).max(120),
  categoryId: z.string().nullish(),
  notes: z.string().max(500).nullish(),
});
export const categorySchema = z.object({ name: z.string().trim().min(1).max(60), monthlyLimit: z.coerce.number().min(0).max(1_000_000), color: z.string().max(20).nullish() });
export const billSchema = z.object({ name: z.string().trim().min(1).max(80), amount: z.coerce.number().min(0).max(1_000_000), dueDay: z.coerce.number().int().min(1).max(31), autopay: z.boolean().optional(), notes: z.string().max(500).nullish() });

export async function addTransaction(input: z.input<typeof transactionSchema>) {
  return db.transaction.create({ data: transactionSchema.parse(input) });
}
export async function deleteTransaction(id: string) {
  return db.transaction.delete({ where: { id } });
}
export async function upsertCategory(input: z.input<typeof categorySchema> & { id?: string }) {
  const d = categorySchema.parse(input);
  return input.id ? db.budgetCategory.update({ where: { id: input.id }, data: d }) : db.budgetCategory.create({ data: d });
}
export async function deleteCategory(id: string) {
  return db.budgetCategory.delete({ where: { id } });
}
export async function addBill(input: z.input<typeof billSchema>) {
  return db.bill.create({ data: billSchema.parse(input) });
}
export async function deleteBill(id: string) {
  return db.bill.update({ where: { id }, data: { active: false } });
}

export function monthOf(date: LocalDate) {
  return date.slice(0, 7);
}

/** Pure: a bill's due date within a month, clamping day 31 to short months. */
export function dueDateIn(ym: string, dueDay: number): LocalDate {
  const last = Number(monthRange(`${ym}-01`).end.slice(8));
  return `${ym}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
}

export function isPaid(bill: { paidThrough: string | null; autopay: boolean }, ym: string, todayDate: LocalDate, due: LocalDate) {
  if (bill.paidThrough && bill.paidThrough >= ym) return true;
  return bill.autopay && due <= todayDate; // autopay counts as paid once the date passes
}

export async function markBillPaid(id: string, ym: string) {
  month.parse(ym);
  return db.bill.update({ where: { id }, data: { paidThrough: ym } });
}

export async function monthSummary(ym: string = monthOf(today())) {
  month.parse(ym);
  const { start, end } = monthRange(`${ym}-01`);
  const [cats, txs, bills] = await Promise.all([
    db.budgetCategory.findMany({ orderBy: { name: "asc" } }),
    db.transaction.findMany({ where: { date: { gte: start, lte: end } }, include: { category: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.bill.findMany({ where: { active: true }, orderBy: { dueDay: "asc" } }),
  ]);
  const spentBy = new Map<string, number>();
  for (const t of txs) spentBy.set(t.categoryId ?? "uncategorized", (spentBy.get(t.categoryId ?? "uncategorized") ?? 0) + t.amount);
  const t = today();
  const billRows = bills.map((b) => {
    const due = dueDateIn(ym, b.dueDay);
    return { ...b, due, paid: isPaid(b, ym, t, due), overdue: !isPaid(b, ym, t, due) && due < t };
  });
  const budget = cats.map((c) => ({ id: c.id, name: c.name, color: c.color, limit: c.monthlyLimit, spent: spentBy.get(c.id) ?? 0 }));
  const { d } = parseLocalDate(t);
  return {
    month: ym,
    budget,
    uncategorized: spentBy.get("uncategorized") ?? 0,
    totalSpent: txs.reduce((n, x) => n + x.amount, 0),
    totalLimit: cats.reduce((n, c) => n + c.monthlyLimit, 0),
    transactions: txs,
    bills: billRows,
    billsTotal: bills.reduce((n, b) => n + b.amount, 0),
    dayOfMonth: ym === monthOf(t) ? d : Number(end.slice(8)),
    daysInMonth: Number(end.slice(8)),
  };
}

/** Unpaid bills due within `days` (incl. overdue this month) — used by Today and the daily brief. */
export async function upcomingBills(days = 7, from: LocalDate = today()) {
  const bills = await db.bill.findMany({ where: { active: true } });
  const horizon = addDays(from, days);
  const out: Array<{ id: string; name: string; amount: number; due: LocalDate; autopay: boolean }> = [];
  for (const ym of [...new Set([monthOf(from), monthOf(horizon)])]) {
    for (const b of bills) {
      const due = dueDateIn(ym, b.dueDay);
      if (due <= horizon && !isPaid(b, ym, from, due) && (due >= from || ym === monthOf(from))) out.push({ id: b.id, name: b.name, amount: b.amount, due, autopay: b.autopay });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
