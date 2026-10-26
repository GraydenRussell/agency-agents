"use client";
import { useRef, useState } from "react";
import { Camera, Plus, Route, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/components/ui/use-action";
import { createExpenseAction, createTripAction, createVehicleAction, deleteExpenseAction, logRouteMilesAction, saveMileageRateAction, uploadReceiptAction } from "@/app/(app)/business/actions";
import { EXPENSE_CATEGORIES, guessCategory, type ExpenseCategory } from "@/lib/business/expenses";
import type { ReadReceipt } from "@/lib/ai/receipt";

type Draft = { date: string; vendor: string; amount: string; category: ExpenseCategory; paymentMethod: string; notes: string; receiptId: string | null };

export function AddExpense({ today }: { today: string }) {
  const upload = useAction();
  const save = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<ReadReceipt | null>(null);
  const blank: Draft = { date: today, vendor: "", amount: "", category: "Supplies", paymentMethod: "", notes: "", receiptId: null };
  const [d, setD] = useState<Draft>(blank);
  const start = () => { setD(blank); setRead(null); setOpen(true); };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    setOpen(true);
    upload.run(() => uploadReceiptAction(fd), {
      success: (r) => (r.read?.isReceipt ? "Receipt read. Check the details." : r.read ? "That doesn't look like a receipt. Fill in the details." : "Receipt saved. Fill in the details."),
      onSuccess: (r) => { setRead(r.read); setD({ ...blank, date: r.draft.date ?? today, vendor: r.draft.vendor ?? "", amount: r.draft.amount ? String(r.draft.amount) : "", category: (r.draft.category as ExpenseCategory) ?? "Supplies", paymentMethod: r.draft.paymentMethod ?? "", notes: r.draft.notes ?? "", receiptId: r.receiptId }); },
    });
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" aria-label="Receipt photo" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <Button onClick={() => fileRef.current?.click()} disabled={upload.pending}><Camera /> {upload.pending ? "Reading receipt…" : "Snap receipt"}</Button>
        <Button variant="outline" onClick={start}><Plus /> Expense</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{d.receiptId ? "Confirm receipt" : "Add expense"}</DialogTitle></DialogHeader>
          {upload.pending ? <p className="text-sm text-muted-foreground">Reading the receipt…</p> : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.run(() => createExpenseAction({ date: d.date, vendor: d.vendor, amount: Number(d.amount), category: d.category, paymentMethod: d.paymentMethod || null, notes: d.notes || null, receiptId: d.receiptId }, read), { success: "Expense saved", onSuccess: () => setOpen(false) }); }}>
              {d.receiptId && <a href={`/api/receipts/${d.receiptId}`} target="_blank" rel="noreferrer" className="text-xs underline">View receipt</a>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="ex-date">Date</Label><Input id="ex-date" type="date" required value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="ex-amount">Amount ($)</Label><Input id="ex-amount" type="number" step="0.01" min="0.01" required value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ex-vendor">Vendor</Label><Input id="ex-vendor" required value={d.vendor} onChange={(e) => setD({ ...d, vendor: e.target.value })} onBlur={() => !d.receiptId && d.vendor && setD((x) => ({ ...x, category: guessCategory(x.vendor) === "Other" ? x.category : guessCategory(x.vendor) }))} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-cat">Category</Label>
                <NativeSelect id="ex-cat" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as ExpenseCategory })}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}{c.deductiblePct < 100 ? ` (${c.deductiblePct}% deductible)` : ""}</option>)}
                </NativeSelect>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="ex-pay">Paid with</Label><Input id="ex-pay" value={d.paymentMethod} onChange={(e) => setD({ ...d, paymentMethod: e.target.value })} placeholder="Business card" /></div>
                <div className="space-y-1.5"><Label htmlFor="ex-notes">What for</Label><Input id="ex-notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={save.pending}>Save expense</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteExpenseButton({ id, label }: { id: string; label: string }) {
  const { pending, run } = useAction();
  return <Button size="icon" variant="ghost" disabled={pending} aria-label={`Delete ${label}`} onClick={() => confirm(`Delete ${label}?`) && run(() => deleteExpenseAction(id), { success: "Deleted" })}><Trash2 /></Button>;
}

export function MileageForms({ vehicles, today, rate }: { vehicles: Array<{ id: string; name: string }>; today: string; rate: number }) {
  const a = useAction();
  const [veh, setVeh] = useState({ name: "", kind: "WORK" as "WORK" | "PERSONAL" });
  const [t, setT] = useState({ vehicleId: vehicles[0]?.id ?? "", date: today, miles: "", purpose: "", business: true });
  const [r, setR] = useState(String(rate));
  // The list can gain its first vehicle after this mounts; fall back to it.
  const vehicleId = vehicles.some((v) => v.id === t.vehicleId) ? t.vehicleId : (vehicles[0]?.id ?? "");
  return (
    <div className="space-y-4">
      {vehicles.length > 0 && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); a.run(() => createTripAction({ ...t, vehicleId, miles: Number(t.miles) }), { success: (m) => m, onSuccess: () => setT({ ...t, miles: "", purpose: "" }) }); }}>
          <p className="text-sm font-medium">Log a trip</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="tr-veh">Vehicle</Label><NativeSelect id="tr-veh" value={vehicleId} onChange={(e) => setT({ ...t, vehicleId: e.target.value })}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</NativeSelect></div>
            <div className="space-y-1"><Label htmlFor="tr-date">Date</Label><Input id="tr-date" type="date" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="tr-miles">Miles</Label><Input id="tr-miles" type="number" step="0.1" min="0.1" required value={t.miles} onChange={(e) => setT({ ...t, miles: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="tr-purpose">Purpose</Label><Input id="tr-purpose" required value={t.purpose} onChange={(e) => setT({ ...t, purpose: e.target.value })} placeholder="Supply run" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" size="sm" disabled={a.pending}>Log trip</Button>
            <Button type="button" variant="ghost" size="sm" disabled={a.pending || !vehicleId} onClick={() => a.run(() => logRouteMilesAction(t.date, vehicleId), { success: (m) => m })}><Route /> Log that day&apos;s job route</Button>
          </div>
        </form>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); a.run(() => createVehicleAction(veh), { success: "Vehicle added", onSuccess: () => setVeh({ name: "", kind: "WORK" }) }); }}>
        <div className="space-y-1"><Label htmlFor="v-name">Add vehicle</Label><Input id="v-name" required className="w-40" value={veh.name} onChange={(e) => setVeh({ ...veh, name: e.target.value })} placeholder="Work truck" /></div>
        <NativeSelect aria-label="Vehicle use" className="w-32" value={veh.kind} onChange={(e) => setVeh({ ...veh, kind: e.target.value as "WORK" | "PERSONAL" })}><option value="WORK">Work</option><option value="PERSONAL">Personal</option></NativeSelect>
        <Button type="submit" variant="outline" size="sm" disabled={a.pending}>Add</Button>
      </form>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); a.run(() => saveMileageRateAction(Number(r) || 0), { success: "Rate saved" }); }}>
        <div className="space-y-1"><Label htmlFor="rate">IRS rate ($/mile)</Label><Input id="rate" type="number" step="0.005" min="0" className="w-28" value={r} onChange={(e) => setR(e.target.value)} /></div>
        <Button type="submit" variant="ghost" size="sm" disabled={a.pending}>Save</Button>
      </form>
    </div>
  );
}
