"use client";
import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/components/ui/use-action";
import { createReferralAction, saveReferralRewardAction, setReferralStatusAction } from "@/app/(app)/business/actions";

export function AddReferralButton({ customers }: { customers: Array<{ id: string; name: string }> }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ referrerId: "", referredName: "", notes: "" });
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={customers.length === 0} title={customers.length === 0 ? "Add or sync customers first" : undefined}><Plus /> Referral</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record a referral</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => createReferralAction(v), { success: "Referral recorded", onSuccess: () => { setOpen(false); setV({ referrerId: "", referredName: "", notes: "" }); } }); }}>
            <div className="space-y-1.5">
              <Label htmlFor="ref-by">Referred by (customer)</Label>
              <NativeSelect id="ref-by" required value={v.referrerId} onChange={(e) => setV({ ...v, referrerId: e.target.value })}>
                <option value="">Choose a customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-who">Who they referred</Label>
              <Input id="ref-who" required value={v.referredName} onChange={(e) => setV({ ...v, referredName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-notes">Notes</Label>
              <Input id="ref-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="e.g. neighbor two doors down" />
            </div>
            <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReferralActions({ id, status, label }: { id: string; status: string; label: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-1">
      {status === "EARNED" && <Button size="sm" disabled={pending} onClick={() => run(() => setReferralStatusAction(id, "PAID"), { success: "Marked paid" })} aria-label={`Mark reward paid: ${label}`}><Check /> Paid</Button>}
      {status === "PENDING" && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setReferralStatusAction(id, "EARNED"), { success: "Marked earned" })} aria-label={`They booked: ${label}`}>They booked</Button>}
      {(status === "PENDING" || status === "EARNED") && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setReferralStatusAction(id, "VOID"), { success: "Removed" })} aria-label={`Void referral: ${label}`}><X /></Button>}
    </div>
  );
}

export function RewardForm({ amount, kind }: { amount: number; kind: "credit" | "cash" | "gift card" }) {
  const { pending, run } = useAction();
  const [a, setA] = useState(String(amount));
  const [k, setK] = useState(kind);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => saveReferralRewardAction(Number(a) || 0, k), { success: "Reward saved" }); }}>
      <div className="space-y-1.5"><Label htmlFor="rw-amt">Reward ($)</Label><Input id="rw-amt" type="number" min={0} className="w-24" value={a} onChange={(e) => setA(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="rw-kind">As</Label><NativeSelect id="rw-kind" value={k} onChange={(e) => setK(e.target.value as typeof k)}><option value="credit">credit</option><option value="cash">cash</option><option value="gift card">gift card</option></NativeSelect></div>
      <Button type="submit" variant="outline" disabled={pending}>Save</Button>
    </form>
  );
}
