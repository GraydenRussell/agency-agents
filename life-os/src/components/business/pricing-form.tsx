"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/ui/use-action";
import { saveBusinessProfileAction, savePricingAction } from "@/app/(app)/business/actions";
import type { PricingRules } from "@/lib/business/pricing";

type Profile = { name: string; legalName: string; city: string; phone: string; email: string; website: string };

const RULES: Array<[keyof PricingRules, string, string]> = [
  ["pane", "Per pane, outside", "$"],
  ["inside", "Add for inside, per pane", "$"],
  ["screen", "Per screen", "$"],
  ["track", "Per track / sill", "$"],
  ["hardWater", "Hard-water removal, per pane", "$"],
  ["solarScreen", "Per solar screen", "$"],
  ["story2Pct", "2-story surcharge", "%"],
  ["story3Pct", "3-story surcharge", "%"],
  ["minimum", "Minimum charge", "$"],
  ["validDays", "Quote valid for", "days"],
];

export function PricingForm({ rules: initial, profile: initialProfile }: { rules: PricingRules; profile: Profile }) {
  const pricing = useAction();
  const prof = useAction();
  const [rules, setRules] = useState(initial);
  const [profile, setProfile] = useState(initialProfile);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader><CardTitle>Prices</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); pricing.run(() => savePricingAction(rules), { success: "Pricing saved" }); }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {RULES.map(([k, label, unit]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`r-${k}`}>{label} <span className="text-xs text-muted-foreground">({unit})</span></Label>
                  <Input id={`r-${k}`} type="number" min={0} step={unit === "days" ? 1 : 0.25} required value={rules[k]} onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value) })} />
                </div>
              ))}
            </div>
            <Button type="submit" disabled={pricing.pending}>Save pricing</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>On your quotes</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); prof.run(() => saveBusinessProfileAction(profile), { success: "Business details saved" }); }}>
            {([["name", "Business name"], ["legalName", "Legal name"], ["city", "City"], ["phone", "Phone"], ["email", "Email"], ["website", "Website"]] as Array<[keyof Profile, string]>).map(([k, label]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`p-${k}`}>{label}</Label>
                <Input id={`p-${k}`} required={k === "name"} value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
              </div>
            ))}
            <Button type="submit" disabled={prof.pending}>Save details</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
