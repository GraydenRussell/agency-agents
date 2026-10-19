"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { createQuoteAction, updateQuoteAction } from "@/app/(app)/business/actions";
import { priceQuote, type PricingRules, type QuoteInputs } from "@/lib/business/pricing";
import { formatUsd } from "@/lib/utils";

type Contact = { customerId: string | null; leadId?: string | null; name: string; phone: string; email: string; address: string; notes: string };

const COUNTS: Array<{ key: keyof QuoteInputs; label: string; rule: keyof PricingRules; hint?: string }> = [
  { key: "panes", label: "Panes, outside", rule: "pane", hint: "Count each glass pane" },
  { key: "insidePanes", label: "Panes, inside too", rule: "inside" },
  { key: "screens", label: "Screens", rule: "screen" },
  { key: "tracks", label: "Tracks / sills", rule: "track" },
  { key: "hardWaterPanes", label: "Hard-water panes", rule: "hardWater" },
  { key: "solarScreens", label: "Solar screens", rule: "solarScreen" },
];

const money = (n: number) => formatUsd(n, { cents: Math.round(n * 100) % 100 !== 0 });

export function QuoteBuilder({ rules, initial, initialInputs, quoteId }: { rules: PricingRules; initial: Contact; initialInputs?: QuoteInputs; quoteId?: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [c, setC] = useState<Contact>(initial);
  const [inputs, setInputs] = useState<QuoteInputs>(initialInputs ?? { panes: 0, insidePanes: 0, screens: 0, tracks: 0, hardWaterPanes: 0, solarScreens: 0, stories: 1, discountPct: 0 });
  const [saveCustomer, setSaveCustomer] = useState(true);
  const priced = useMemo(() => priceQuote(inputs, rules), [inputs, rules]);
  const num = (k: keyof QuoteInputs, v: string) => setInputs({ ...inputs, [k]: Math.max(0, Math.floor(Number(v) || 0)) });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { customerId: c.customerId, leadId: c.leadId ?? null, name: c.name, phone: c.phone, email: c.email, address: c.address, notes: c.notes, inputs, saveCustomer: !c.customerId && saveCustomer };
    run(() => (quoteId ? updateQuoteAction(quoteId, payload) : createQuoteAction(payload)), { success: quoteId ? "Quote updated" : "Quote saved", onSuccess: (id) => router.push(`/business/quotes/${id}`) });
  }

  const field = (k: keyof Omit<Contact, "customerId" | "leadId" | "notes">, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`q-${k}`}>{label}</Label>
      <Input id={`q-${k}`} type={type} required={k === "name"} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} autoComplete="off" />
    </div>
  );

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {field("name", "Name")}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field("phone", "Mobile (for texting)", "tel")}
              {field("email", "Email", "email")}
            </div>
            {field("address", "Service address")}
            {!c.customerId && !quoteId && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saveCustomer} onCheckedChange={(v) => setSaveCustomer(v === true)} aria-label="Also add to Customers" /> Also add to Customers
              </label>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>The job</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {COUNTS.map((it) => (
                <div key={it.key} className="space-y-1.5">
                  <Label htmlFor={`n-${it.key}`}>{it.label} <span className="text-xs text-muted-foreground">· {money(rules[it.rule])}</span></Label>
                  <Input id={`n-${it.key}`} type="number" inputMode="numeric" min={0} value={inputs[it.key] || ""} placeholder="0" onChange={(e) => num(it.key, e.target.value)} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="n-stories">Stories</Label>
                <NativeSelect id="n-stories" value={inputs.stories} onChange={(e) => setInputs({ ...inputs, stories: Number(e.target.value) })}>
                  <option value={1}>1 story</option>
                  <option value={2}>2 stories (+{rules.story2Pct}%)</option>
                  <option value={3}>3 stories (+{rules.story3Pct}%)</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-discount">Discount %</Label>
                <Input id="n-discount" type="number" min={0} max={100} value={inputs.discountPct || ""} placeholder="0" onChange={(e) => setInputs({ ...inputs, discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-notes">Notes on the quote (customer sees these)</Label>
              <Textarea id="q-notes" rows={3} value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} placeholder="e.g. Includes the sunroom skylights. Hard-water treatment on the back sliders." />
            </div>
          </CardContent>
        </Card>
      </div>
      <div>
        <Card className="lg:sticky lg:top-4">
          <CardHeader><CardTitle>Price</CardTitle></CardHeader>
          <CardContent>
            {priced.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Enter counts to see the price.</p>
            ) : (
              <ul className="space-y-1.5 text-sm" data-testid="quote-lines">
                {priced.lines.map((l) => (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span className="min-w-0 text-muted-foreground">{l.label}{["panes", "insidePanes", "screens", "tracks", "hardWaterPanes", "solarScreens"].includes(l.key) && ` × ${l.qty}`}</span>
                    <span className="tabular-nums">{money(l.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm font-medium">Total</span>
              <span className="font-display text-4xl" data-testid="quote-total">{money(priced.total)}</span>
            </div>
            {priced.minimumApplied && <p className="mt-1 text-xs text-muted-foreground">Your {money(rules.minimum)} minimum applies.</p>}
            <Button type="submit" className="mt-4 w-full" disabled={pending || priced.total <= 0}>{quoteId ? "Save changes" : "Save quote"}</Button>
            <p className="mt-2 text-xs text-muted-foreground">Saving doesn&apos;t send anything. You&apos;ll review the message before it goes out.</p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
