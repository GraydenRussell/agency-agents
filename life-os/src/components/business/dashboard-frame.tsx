"use client";
import { useState } from "react";
import { ExternalLink, Pencil, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/ui/use-action";
import { saveDashboardUrlAction } from "@/app/(app)/business/actions";

export function DashboardFrame({ url }: { url: string }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(!url);
  const [v, setV] = useState(url);
  const [key, setKey] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <form className="flex min-w-0 flex-1 flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => saveDashboardUrlAction(v), { success: "Dashboard link saved", onSuccess: () => setEditing(false) }); }}>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="dash-url">Dashboard address</Label>
              <Input id="dash-url" type="url" placeholder="https://your-dashboard.vercel.app" value={v} onChange={(e) => setV(e.target.value)} />
            </div>
            <Button type="submit" disabled={pending}>Save</Button>
            {url && <Button type="button" variant="ghost" onClick={() => { setV(url); setEditing(false); }}>Cancel</Button>}
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{url}</span>
            <Button variant="outline" size="sm" onClick={() => setKey(key + 1)}><RotateCw /> Reload</Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil /> Change</Button>
            <Button asChild size="sm"><a href={url} target="_blank" rel="noreferrer">Open in new tab <ExternalLink /></a></Button>
          </>
        )}
      </div>
      {url && (
        <>
          <iframe
            key={key}
            src={url}
            title="Rapid Window Cleaning dashboard"
            className="h-[calc(100dvh-16rem)] min-h-[520px] w-full rounded-xl border border-border bg-white"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          />
          <p className="text-xs text-muted-foreground">
            Blank, or asking you to sign in every time? Some dashboards block being shown inside other apps, or keep logins separate inside a frame (browser privacy rules). Use “Open in new tab” then. Live numbers in your briefs need the small summary endpoint (Setup → Admin dashboard).
          </p>
        </>
      )}
    </div>
  );
}
