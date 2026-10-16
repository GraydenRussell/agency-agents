"use client";
import { useState } from "react";
import { Droplet, Minus, Moon, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { useAction } from "@/components/ui/use-action";
import { addWaterAction, deleteWorkoutAction, logSleepAction, logWorkoutAction } from "@/app/(app)/health/actions";

export function WaterQuick({ date, ounces, target }: { date: string; ounces: number; target: number }) {
  const { pending, run } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="flex items-center gap-2 font-display text-3xl">
          <Droplet className="size-5 text-brand-cyan" /> {ounces} oz
        </p>
        <span className="text-xs text-muted-foreground">target {target} oz</span>
      </div>
      <Progress value={(ounces / target) * 100} />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={pending || ounces === 0} aria-label="Remove 8 oz" onClick={() => run(() => addWaterAction(date, -8))}>
          <Minus /> 8
        </Button>
        {[8, 16, 32].map((oz) => (
          <Button key={oz} variant="outline" size="sm" disabled={pending} onClick={() => run(() => addWaterAction(date, oz))}>
            <Plus /> {oz} oz
          </Button>
        ))}
      </div>
    </div>
  );
}

export function SleepQuick({ date, hours, quality }: { date: string; hours: number | null; quality: number | null }) {
  const { pending, run } = useAction();
  const [h, setH] = useState(hours?.toString() ?? "");
  const [q, setQ] = useState(quality?.toString() ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => logSleepAction(date, Number(h), q ? Number(q) : null), { success: "Sleep logged" });
      }}
    >
      <label className="flex flex-col text-xs text-muted-foreground">
        Hours last night
        <Input type="number" step="0.25" min={0} max={24} required value={h} onChange={(e) => setH(e.target.value)} className="mt-1 w-28" />
      </label>
      <label className="flex flex-col text-xs text-muted-foreground">
        Quality
        <NativeSelect value={q} onChange={(e) => setQ(e.target.value)} className="mt-1 w-28">
          <option value="">–</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "(rough)" : n === 5 ? "(great)" : ""}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit" size="sm" disabled={pending || !h}>
        <Moon /> Save
      </Button>
    </form>
  );
}

const WORKOUT_TYPES = ["Run", "Strength", "Hike", "Cycling", "Swim", "Mobility", "Sports", "Other"];

export function WorkoutForm({ date }: { date: string }) {
  const { pending, run } = useAction();
  const [v, setV] = useState({ date, type: "Strength", durationMin: "45", intensity: "3", notes: "" });
  return (
    <form
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => logWorkoutAction({ date: v.date, type: v.type, durationMin: Number(v.durationMin), intensity: Number(v.intensity), notes: v.notes || null }), { success: "Workout logged", onSuccess: () => setV({ ...v, notes: "" }) });
      }}
    >
      <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} aria-label="Date" />
      <NativeSelect value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} aria-label="Type">
        {WORKOUT_TYPES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </NativeSelect>
      <Input type="number" min={1} value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: e.target.value })} aria-label="Minutes" placeholder="min" />
      <NativeSelect value={v.intensity} onChange={(e) => setV({ ...v, intensity: e.target.value })} aria-label="Intensity">
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            Intensity {n}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" disabled={pending}>
        <Plus /> Log
      </Button>
      <Input className="col-span-2 sm:col-span-5" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Notes (optional)" aria-label="Notes" />
    </form>
  );
}

export function DeleteWorkoutButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="ghost" size="icon-sm" disabled={pending} aria-label="Delete workout" onClick={() => run(() => deleteWorkoutAction(id), { success: "Workout deleted" })}>
      <Trash2 />
    </Button>
  );
}
