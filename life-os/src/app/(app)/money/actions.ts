"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as money from "@/lib/services/money";

const done = <T,>(fn: () => Promise<T>) =>
  runAction(async () => {
    const r = await fn();
    revalidatePath("/money");
    return r;
  });

export async function addTransactionAction(input: { date: string; amount: number; merchant: string; categoryId?: string | null; notes?: string | null }) {
  return done(async () => void (await money.addTransaction(input)));
}
export async function deleteTransactionAction(id: string) {
  return done(async () => void (await money.deleteTransaction(id)));
}
export async function upsertCategoryAction(input: { id?: string; name: string; monthlyLimit: number }) {
  return done(async () => void (await money.upsertCategory(input)));
}
export async function deleteCategoryAction(id: string) {
  return done(async () => void (await money.deleteCategory(id)));
}
export async function addBillAction(input: { name: string; amount: number; dueDay: number; autopay?: boolean }) {
  return done(async () => void (await money.addBill(input)));
}
export async function deleteBillAction(id: string) {
  return done(async () => void (await money.deleteBill(id)));
}
export async function markBillPaidAction(id: string, month: string) {
  return done(async () => void (await money.markBillPaid(id, month)));
}
