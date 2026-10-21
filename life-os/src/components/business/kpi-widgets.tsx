"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/components/ui/use-action";
import { addAdSpendAction, saveRevenueGoalAction, syncAdSpendAction } from "@/app/(app)/business/actions";
import { cn } from "@/lib/utils";

export function GoalForm({ goal }: { goal: number }) {
  const { pending, run } = useAction();
  const [v, setV] = useState(String(goal));
  return (
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => saveRevenueGoalAction(Math.max(0, Number(v) || 0)), { success: "Goal saved" }); }}>
      <div className="space-y-1.5"><Label htmlFor="goal">Monthly revenue goal ($)</Label><Input id="goal" type="number" min={0} step={500} className="w-36" value={v} onChange={(e) => setV(e.target.value)} /></div>
      <Button type="submit" variant="outline" disabled={pending}>Save</Button>
    </form>
  );
}

export function SpendForm({ today, metaReady }: { today: string; metaReady: boolean }) {
  const add = useAction();
  const sync = useAction();
  const [v, setV] = useState({ date: today, source: "GOOGLE_ADS" as "GOOGLE_ADS" | "DOOR_HANGERS" | "NEXTDOOR" | "OTHER", amount: "", note: "" });
  return (
    <div className="space-y-3">
      <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); add.run(() => addAdSpendAction({ ...v, amount: Number(v.amount) || 0 }), { success: "Spend added", onSuccess: () => setV({ ...v, amount: "", note: "" }) }); }}>
        <div className="space-y-1.5"><Label htmlFor="sp-date">Date</Label><Input id="sp-date" type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="sp-amt">Amount ($)</Label><Input id="sp-amt" type="number" min={0} step="0.01" required value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></div>
        <div className="col-span-2 space-y-1.5"><Label htmlFor="sp-src">Where</Label><NativeSelect id="sp-src" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value as typeof v.source })}><option value="GOOGLE_ADS">Google Ads / LSA</option><option value="DOOR_HANGERS">Door hangers / print</option><option value="NEXTDOOR">Nextdoor</option><option value="OTHER">Other</option></NativeSelect></div>
        <Button type="submit" className="col-span-2" variant="outline" disabled={add.pending}>Add spend</Button>
      </form>
      {metaReady && <Button variant="ghost" size="sm" disabled={sync.pending} onClick={() => sync.run(() => syncAdSpendAction(), { success: (m) => m })}><RefreshCw className={cn(sync.pending && "animate-spin")} /> Pull Meta ad spend now</Button>}
    </div>
  );
}
