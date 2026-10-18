"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as customers from "@/lib/services/customers";

const refresh = () => revalidatePath("/business", "layout");

export async function syncHousecallAction() {
  return runAction(async () => {
    const r = await customers.syncHousecallPro();
    refresh();
    return `Synced ${r.customers.created + r.customers.updated} customers and ${r.jobs.created + r.jobs.updated} jobs (${r.customers.created} new customers)`;
  });
}
export async function createCustomerAction(input: customers.CustomerInput) {
  return runAction(async () => {
    const c = await customers.createCustomer(input);
    refresh();
    return c.id;
  });
}
export async function updateCustomerAction(id: string, input: Partial<customers.CustomerInput>) {
  return runAction(async () => {
    await customers.updateCustomer(id, input);
    refresh();
    return undefined;
  });
}
