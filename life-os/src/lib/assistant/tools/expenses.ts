import "server-only";
import { z } from "zod";
import { CATEGORY_KEYS } from "@/lib/business/expenses";
import { createExpense, createTrip, suggestCategory, taxYearSummary } from "@/lib/services/expenses";
import { db } from "@/lib/db";
import { today } from "@/lib/time";
import { defineTool } from "../registry";

export const expenseTools = [
  defineTool({
    name: "expense_add",
    description: "Log a Rapid Window Cleaning business expense (e.g. 'spent $64 on squeegee channels at Home Depot'). Category is guessed from the vendor if omitted. Meals are 50% deductible automatically.",
    schema: z.object({ vendor: z.string().min(1), amount: z.number().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), category: z.enum(CATEGORY_KEYS).optional(), notes: z.string().optional() }),
    actionType: "expense.add",
    kind: "write",
    summarize: (i) => `Log expense: $${i.amount} at ${i.vendor}`,
    run: async (i) => {
      const e = await createExpense({ vendor: i.vendor, amount: i.amount, date: i.date ?? today(), category: i.category ?? suggestCategory(i.vendor), notes: i.notes });
      return { result: { id: e.id, category: e.category, deductiblePct: e.deductiblePct }, summary: `Logged $${e.amount} at ${e.vendor} (${e.category})`, undo: { actionType: "expense.delete", payload: { id: e.id } } };
    },
  }),
  defineTool({
    name: "mileage_log",
    description: "Log a business (or personal) drive in miles for a vehicle. vehicleName must match one of the vehicles on the Expenses page.",
    schema: z.object({ vehicleName: z.string().min(1), miles: z.number().positive(), purpose: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), business: z.boolean().optional() }),
    actionType: "mileage.log",
    kind: "write",
    summarize: (i) => `Log ${i.miles} mi (${i.purpose})`,
    run: async (i) => {
      const vs = await db.vehicle.findMany({ where: { active: true } });
      const q = i.vehicleName.toLowerCase();
      const exact = vs.find((x) => x.name.toLowerCase() === q);
      const partial = vs.filter((x) => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()));
      const v = exact ?? (partial.length === 1 ? partial[0] : undefined);
      if (!v) throw new Error(`No vehicle named "${i.vehicleName}". Vehicles: ${vs.map((x) => x.name).join(", ") || "none yet"}`);
      const t = await createTrip({ vehicleId: v.id, miles: i.miles, purpose: i.purpose, date: i.date ?? today(), business: i.business ?? true });
      return { result: { id: t.id, vehicle: v.name }, summary: `Logged ${t.miles} mi in ${v.name}`, undo: { actionType: "trip.delete", payload: { id: t.id } } };
    },
  }),
  defineTool({
    name: "tax_summary",
    description: "Year-to-date business expenses by category, deductible total, business miles and the mileage deduction at the saved IRS rate.",
    schema: z.object({ year: z.string().regex(/^\d{4}$/).optional() }),
    actionType: "tax.summary",
    kind: "read",
    summarize: () => "Tax summary",
    run: async (i) => {
      const s = await taxYearSummary(i.year);
      return { result: { year: s.year, totalSpent: s.totalSpent, totalDeductible: s.totalDeductible, byCategory: s.categories, businessMiles: s.businessMiles, mileageRate: s.mileageRate, mileageDeduction: s.mileageDeduction } };
    },
  }),
];
