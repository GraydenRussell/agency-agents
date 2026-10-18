"use client";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { updateCustomerAction } from "@/app/(app)/business/actions";

/** Life OS–owned fields (never overwritten by Housecall Pro sync). */
export function CustomerEditor({ id, rebookMonths, notes: initialNotes }: { id: string; rebookMonths: number | null; notes: string }) {
  const { run } = useAction();
  const [notes, setNotes] = useState(initialNotes);
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="space-y-1.5">
        <Label htmlFor="rebook">Re-book every</Label>
        <NativeSelect id="rebook" defaultValue={rebookMonths ?? ""} onChange={(e) => run(() => updateCustomerAction(id, { rebookMonths: e.target.value ? Number(e.target.value) : null }), { success: "Saved" })}>
          <option value="">Business default</option>
          {[3, 4, 6, 12].map((m) => (
            <option key={m} value={m}>{m} months</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cnotes">Notes</Label>
        <Textarea id="cnotes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== initialNotes && run(() => updateCustomerAction(id, { notes: notes || null }), { success: "Notes saved" })} placeholder="Gate code, dog, hard-water spots on the back slider…" />
      </div>
    </div>
  );
}
