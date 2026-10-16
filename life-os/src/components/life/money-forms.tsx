"use client";
import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/ui/use-action";
import { addBillAction, addTransactionAction, deleteBillAction, deleteTransactionAction, markBillPaidAction, upsertCategoryAction } from "@/app/(app)/money/actions";

export function TransactionForm({ date, categories }: { date: string; categories: Array<{ id: string; name: string }> }) {
  const { pending, run } = useAction();
  const [v, setV] = useState({ date, amount: "", merchant: "", categoryId: categories[0]?.id ?? "" });
  return (
    <form
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addTransactionAction({ date: v.date, amount: Number(v.amount), merchant: v.merchant, categoryId: v.categoryId || null }), { success: "Expense added", onSuccess: () => setV({ ...v, amount: "", merchant: "" }) });
      }}
    >
      <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} aria-label="Date" />
      <Input value={v.merchant} onChange={(e) => setV({ ...v, merchant: e.target.value })} placeholder="Merchant" aria-label="Merchant" required />
      <Input type="number" step="0.01" min="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="$" aria-label="Amount" required />
      <NativeSelect value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })} aria-label="Category">
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" disabled={pending}>
        <Plus /> Add
      </Button>
    </form>
  );
}

export function CategoryForm() {
  const { pending, run } = useAction();
  const [v, setV] = useState({ name: "", monthlyLimit: "" });
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => upsertCategoryAction({ name: v.name, monthlyLimit: Number(v.monthlyLimit) }), { success: "Category added", onSuccess: () => setV({ name: "", monthlyLimit: "" }) });
      }}
    >
      <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="New category" aria-label="Category name" required />
      <Input type="number" min="0" value={v.monthlyLimit} onChange={(e) => setV({ ...v, monthlyLimit: e.target.value })} placeholder="Monthly $" aria-label="Monthly limit" required className="w-32" />
      <Button type="submit" variant="outline" disabled={pending}>
        Add
      </Button>
    </form>
  );
}

export function BillForm() {
  const { pending, run } = useAction();
  const [v, setV] = useState({ name: "", amount: "", dueDay: "1", autopay: false });
  return (
    <form
      className="grid grid-cols-2 items-center gap-2 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addBillAction({ name: v.name, amount: Number(v.amount), dueDay: Number(v.dueDay), autopay: v.autopay }), { success: "Bill added", onSuccess: () => setV({ name: "", amount: "", dueDay: "1", autopay: false }) });
      }}
    >
      <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Bill name" aria-label="Bill name" required />
      <Input type="number" step="0.01" min="0" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="$" aria-label="Bill amount" required />
      <Input type="number" min={1} max={31} value={v.dueDay} onChange={(e) => setV({ ...v, dueDay: e.target.value })} aria-label="Due day of month" />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={v.autopay} onCheckedChange={(autopay) => setV({ ...v, autopay })} /> Autopay
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        <Plus /> Bill
      </Button>
    </form>
  );
}

export function RowActions({ kind, id, month, paid }: { kind: "tx" | "bill"; id: string; month?: string; paid?: boolean }) {
  const { pending, run } = useAction();
  return (
    <span className="flex gap-1">
      {kind === "bill" && !paid && month && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => markBillPaidAction(id, month), { success: "Marked paid" })}>
          <Check /> Paid
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" disabled={pending} aria-label="Delete" onClick={() => run(() => (kind === "tx" ? deleteTransactionAction(id) : deleteBillAction(id)), { success: "Deleted" })}>
        <Trash2 />
      </Button>
    </span>
  );
}
