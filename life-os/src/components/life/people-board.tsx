"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Mail, MessageSquarePlus, Phone, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { addDays, atLocalMinutes, formatDateTime, fromLocalInput, localDateOf, relativeDayLabel, today } from "@/lib/time";
import { cn } from "@/lib/utils";
import { createPersonAction, deletePersonAction, logInteractionAction, remindFollowUpAction, updatePersonAction } from "@/app/(app)/people/actions";

export type PersonView = {
  id: string;
  name: string;
  relation: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  birthday: string | null;
  followUpDays: number | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  interactions: Array<{ id: string; date: string; channel: string; summary: string }>;
};

const day = (iso: string | null) => (iso ? relativeDayLabel(localDateOf(new Date(iso))) : "never");

export function PeopleBoard({ people }: { people: PersonView[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const open = people.find((p) => p.id === params.get("person")) ?? null;
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("person", id);
    else next.delete("person");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const [now] = useState(() => Date.now());
  const shown = people.filter((p) => !q || `${p.name} ${p.company ?? ""} ${p.relation ?? ""} ${p.notes ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-4 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="max-w-xs" />
        <div className="flex-1" />
        <Button onClick={() => setAdding(true)}>
          <Plus /> Add person
        </Button>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Users} title="No people yet" description="Keep notes on customers, partners, vendors, and family, with follow-up reminders." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const due = p.nextFollowUpAt && new Date(p.nextFollowUpAt).getTime() < now + 86_400_000;
            return (
              <button key={p.id} type="button" onClick={() => setOpen(p.id)} className="text-left" data-testid="person-card">
                <Card className={cn("h-full transition-colors hover:border-primary/60", due && "border-amber-500/40")}>
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{p.name}</p>
                      {due && <Badge variant="warning">follow up</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{[p.relation, p.company].filter(Boolean).join(" · ") || "–"}</p>
                    <p className="text-xs text-muted-foreground">
                      Last contact {day(p.lastContactedAt)}
                      {p.nextFollowUpAt && ` · next ${day(p.nextFollowUpAt)}`}
                    </p>
                    {p.notes && <p className="line-clamp-2 text-sm">{p.notes}</p>}
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="overflow-y-auto p-5">{open && <PersonDetail key={open.id} p={open} onDeleted={() => setOpen(null)} />}</SheetContent>
      </Sheet>
      <PersonDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function PersonDetail({ p, onDeleted }: { p: PersonView; onDeleted: () => void }) {
  const { pending, run } = useAction();
  const [v, setV] = useState({ relation: p.relation ?? "", company: p.company ?? "", phone: p.phone ?? "", email: p.email ?? "", birthday: p.birthday ?? "", followUpDays: p.followUpDays?.toString() ?? "", notes: p.notes ?? "" });
  const [channel, setChannel] = useState("Call");
  const [summary, setSummary] = useState("");
  const [remindAt, setRemindAt] = useState(`${addDays(today(), 1)}T09:00`);
  const save = () =>
    run(() => updatePersonAction(p.id, { relation: v.relation || null, company: v.company || null, phone: v.phone || null, email: v.email || null, birthday: v.birthday || null, followUpDays: v.followUpDays ? Number(v.followUpDays) : null, notes: v.notes || null }), { success: "Saved" });
  return (
    <div className="space-y-4">
      <div className="pr-8">
        <SheetTitle className="font-heading text-3xl tracking-wide">{p.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          Last contact {day(p.lastContactedAt)}
          {p.nextFollowUpAt && ` · follow up ${day(p.nextFollowUpAt)}`}
        </SheetDescription>
      </div>
      <div className="flex gap-2">
        {p.phone && (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${p.phone}`}>
              <Phone /> Call
            </a>
          </Button>
        )}
        {p.email && (
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${p.email}`}>
              <Mail /> Email
            </a>
          </Button>
        )}
      </div>
      <form
        className="space-y-2 rounded-lg border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (summary.trim()) run(() => logInteractionAction(p.id, channel, summary), { success: "Logged", onSuccess: () => setSummary("") });
        }}
      >
        <p className="text-sm font-medium">Log a touchpoint</p>
        <div className="flex gap-2">
          <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)} className="w-28" aria-label="Channel">
            {["Call", "Text", "Email", "In person", "Meeting"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happened?" aria-label="Interaction summary" />
          <Button type="submit" size="icon" disabled={pending} aria-label="Log interaction">
            <MessageSquarePlus />
          </Button>
        </div>
      </form>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Remind me to follow up
          <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="mt-1" />
        </label>
        <Button variant="outline" disabled={pending} onClick={() => run(() => remindFollowUpAction(p.id, (fromLocalInput(remindAt) ?? atLocalMinutes(addDays(today(), 1), 540)).toISOString()), { success: (n) => `Reminder set for ${n}` })}>
          <Bell /> Remind
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["relation", "Relation"],
            ["company", "Company"],
            ["phone", "Phone"],
            ["email", "Email"],
            ["birthday", "Birthday (MM-DD)"],
            ["followUpDays", "Follow up every (days)"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="text-xs text-muted-foreground">
            {label}
            <Input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={save} className="mt-1" />
          </label>
        ))}
      </div>
      <label className="block text-xs text-muted-foreground">
        Notes
        <Textarea rows={5} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} onBlur={save} className="mt-1" />
      </label>
      <div>
        <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">History</p>
        {p.interactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No touchpoints logged.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {p.interactions.map((i) => (
              <li key={i.id}>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(new Date(i.date))} · {i.channel}
                </span>
                <p>{i.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="ghost" className="text-red-400" onClick={() => confirm(`Delete ${p.name}?`) && run(() => deletePersonAction(p.id), { success: "Deleted", onSuccess: onDeleted })}>
        <Trash2 /> Delete
      </Button>
    </div>
  );
}

function PersonDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { pending, run } = useAction();
  const [v, setV] = useState({ name: "", relation: "", company: "", phone: "", email: "", followUpDays: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createPersonAction({ name: v.name, relation: v.relation || null, company: v.company || null, phone: v.phone || null, email: v.email || null, followUpDays: v.followUpDays ? Number(v.followUpDays) : null }), {
              success: "Added",
              onSuccess: () => {
                onOpenChange(false);
                setV({ name: "", relation: "", company: "", phone: "", email: "", followUpDays: "" });
              },
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pp-name">Name</Label>
            <Input id="pp-name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp-rel">Relation</Label>
              <Input id="pp-rel" value={v.relation} onChange={(e) => setV({ ...v, relation: e.target.value })} placeholder="Customer, vendor…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-co">Company</Label>
              <Input id="pp-co" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-phone">Phone</Label>
              <Input id="pp-phone" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-email">Email</Label>
              <Input id="pp-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-fu">Follow up every (days)</Label>
              <Input id="pp-fu" type="number" min={1} value={v.followUpDays} onChange={(e) => setV({ ...v, followUpDays: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
