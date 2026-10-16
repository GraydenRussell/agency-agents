"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { formatUsd } from "@/lib/utils";
import { deleteMemoryAction, saveMemoryAction, saveSettingAction } from "@/app/(app)/settings/actions";

type Props = {
  aiConfigured: boolean;
  cap: number;
  perMinute: number;
  perDay: number;
  effort: "low" | "medium" | "high" | "xhigh";
  autoApprove: Record<string, boolean>;
  autoSendCategories: string[];
  approvalActions: Record<string, string>;
  usage: { today: number; week: number; byPurpose: Array<{ purpose: string; cost: number }> };
};

const CATEGORIES = ["CUSTOMER", "LEAD", "VENDOR", "PERSONAL", "OTHER"];

export function AssistantSettings(p: Props) {
  const { pending, run } = useAction();
  const [cap, setCap] = useState(String(p.cap));
  const [perMinute, setPerMinute] = useState(String(p.perMinute));
  const [perDay, setPerDay] = useState(String(p.perDay));
  const [auto, setAuto] = useState(p.autoApprove);
  const [cats, setCats] = useState(p.autoSendCategories);

  return (
    <Card id="assistant">
      <CardHeader>
        <div>
          <CardTitle className="text-foreground">Assistant</CardTitle>
          <CardDescription className="mt-1">{p.aiConfigured ? "Claude is connected." : "Offline demo mode: set ANTHROPIC_API_KEY and INTEGRATION_MODE=live."}</CardDescription>
        </div>
        {p.aiConfigured ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Demo</Badge>}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="font-display text-xl">{formatUsd(p.usage.today, { cents: true })}</p>
            <p className="text-xs text-muted-foreground">spent today</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="font-display text-xl">{formatUsd(p.usage.week, { cents: true })}</p>
            <p className="text-xs text-muted-foreground">last 7 days</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="font-display text-xl">{formatUsd(p.cap, { cents: true })}</p>
            <p className="text-xs text-muted-foreground">daily cap</p>
          </div>
        </div>

        <form
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                for (const r of [await saveSettingAction("ai.dailySpendCapUsd", Number(cap)), await saveSettingAction("ai.maxToolCallsPerMinute", Number(perMinute)), await saveSettingAction("ai.maxToolCallsPerDay", Number(perDay))]) if (!r.ok) return r;
                return { ok: true as const, data: undefined };
              },
              { success: "Limits saved" },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cap">Daily cap ($)</Label>
            <Input id="cap" type="number" step="0.5" min={0} value={cap} onChange={(e) => setCap(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm">Tool calls / min</Label>
            <Input id="pm" type="number" min={1} value={perMinute} onChange={(e) => setPerMinute(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pd">Tool calls / day</Label>
            <Input id="pd" type="number" min={1} value={perDay} onChange={(e) => setPerDay(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline" disabled={pending} className="w-full">
              Save limits
            </Button>
          </div>
        </form>

        <div className="space-y-1.5">
          <Label htmlFor="effort">Reasoning effort</Label>
          <NativeSelect id="effort" defaultValue={p.effort} onChange={(e) => run(() => saveSettingAction("ai.effort", e.target.value as Props["effort"]), { success: "Saved" })} className="max-w-56">
            <option value="low">Low (fastest, cheapest)</option>
            <option value="medium">Medium (default)</option>
            <option value="high">High</option>
            <option value="xhigh">Extra high</option>
          </NativeSelect>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">Auto-approve (skip the Approvals queue)</p>
          <p className="mb-3 text-xs text-muted-foreground">All off by default. Every action is still written to the Activity Log.</p>
          <ul className="space-y-2">
            {Object.entries(p.approvalActions).map(([key, label]) => (
              <li key={key} className="flex items-center gap-3 text-sm">
                <Switch
                  checked={Boolean(auto[key])}
                  aria-label={label}
                  onCheckedChange={(v) => {
                    const next = { ...auto, [key]: v };
                    setAuto(next);
                    run(() => saveSettingAction("approvals.autoApprove", next), { success: v ? `Auto-approve on: ${label}` : `Auto-approve off: ${label}` });
                  }}
                />
                {label}
              </li>
            ))}
          </ul>
          {auto["email.send"] && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 text-xs">Auto-send replies only for these email categories:</p>
              <div className="flex flex-wrap gap-3">
                {CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={cats.includes(c)}
                      onCheckedChange={(v) => {
                        const next = v ? [...cats, c] : cats.filter((x) => x !== c);
                        setCats(next);
                        run(() => saveSettingAction("approvals.autoSendCategories", next));
                      }}
                    />
                    {c.toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type Memory = { key: string; value: string; kind: "FACT" | "PREFERENCE" | "STYLE" | "PERSON"; source: string | null };

export function MemoryEditor({ memories }: { memories: Memory[] }) {
  const { pending, run } = useAction();
  const [draft, setDraft] = useState<Memory>({ key: "", value: "", kind: "FACT", source: null });
  return (
    <Card id="memory">
      <CardHeader>
        <div>
          <CardTitle className="text-foreground">Assistant memory</CardTitle>
          <CardDescription className="mt-1">Read before every conversation. The assistant adds to this too; edit or delete anything.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5">
          {memories.map((m) => (
            <li key={m.key} className="group flex items-start gap-2 rounded-md border border-border/60 p-2 text-sm">
              <Badge variant="outline" className="shrink-0">
                {m.kind.toLowerCase()}
              </Badge>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDraft(m)}>
                <span className="block text-xs text-muted-foreground">
                  {m.key}
                  {m.source ? ` · ${m.source}` : ""}
                </span>
                <span className="block break-words">{m.value}</span>
              </button>
              <button type="button" aria-label={`Delete ${m.key}`} className="text-muted-foreground opacity-0 group-hover:opacity-100 max-lg:opacity-60" onClick={() => run(() => deleteMemoryAction(m.key), { success: "Forgotten" })}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveMemoryAction(draft), { success: "Saved", onSuccess: () => setDraft({ key: "", value: "", kind: "FACT", source: null }) });
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="key, e.g. preference.meetings" aria-label="Memory key" />
            <NativeSelect value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Memory["kind"] })} aria-label="Kind" className="w-auto">
              <option value="FACT">Fact</option>
              <option value="PREFERENCE">Preference</option>
              <option value="STYLE">Style</option>
              <option value="PERSON">Person</option>
            </NativeSelect>
          </div>
          <Textarea rows={2} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="What should the assistant remember?" aria-label="Memory value" />
          <Button type="submit" size="sm" disabled={pending || !draft.key || !draft.value}>
            Save memory
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
