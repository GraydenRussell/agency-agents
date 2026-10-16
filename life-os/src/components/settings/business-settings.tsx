"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/ui/use-action";
import { saveQuickLinksAction } from "@/app/(app)/settings/actions";

export function BusinessSettings({ links: initial, adminConfigured, github, vercel }: { links: Array<{ label: string; url: string }>; adminConfigured: boolean; github: boolean; vercel: boolean }) {
  const { pending, run } = useAction();
  const [links, setLinks] = useState(initial);
  const set = (i: number, k: "label" | "url", v: string) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <Card id="business">
      <CardHeader>
        <div>
          <CardTitle className="text-foreground">Business & projects</CardTitle>
          <CardDescription className="mt-1">Connections are configured with environment variables (see README).</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2">Admin dashboard {adminConfigured ? <Badge variant="success">connected</Badge> : <Badge variant="warning">ADMIN_DASH_URL + LIFE_OS_API_TOKEN</Badge>}</li>
          <li className="flex items-center gap-2">GitHub {github ? <Badge variant="success">connected</Badge> : <Badge variant="warning">GITHUB_TOKEN</Badge>}</li>
          <li className="flex items-center gap-2">Vercel {vercel ? <Badge variant="success">connected</Badge> : <Badge variant="secondary">optional: VERCEL_TOKEN</Badge>}</li>
        </ul>
        <div>
          <p className="mb-2 text-sm font-medium">Quick links (Business page)</p>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                <Input value={l.label} onChange={(e) => set(i, "label", e.target.value)} aria-label="Link label" placeholder="Label" />
                <Input value={l.url} onChange={(e) => set(i, "url", e.target.value)} aria-label="Link URL" placeholder="https://…" type="url" />
                <Button variant="ghost" size="icon" aria-label={`Remove ${l.label}`} onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLinks([...links, { label: "", url: "" }])}>
              <Plus /> Add link
            </Button>
            <Button size="sm" disabled={pending} onClick={() => run(() => saveQuickLinksAction(links), { success: "Quick links saved" })}>
              Save links
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Tip: paste your exact GBP, Meta ad account, GA4 property, and Housecall Pro URLs so they open the right account.</p>
        </div>
      </CardContent>
    </Card>
  );
}
