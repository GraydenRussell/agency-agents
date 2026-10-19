"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Phone, Plus, RefreshCw, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { createLeadAction, replyLeadAction, rescoreLeadAction, setLeadStatusAction } from "@/app/(app)/business/actions";
import { cn } from "@/lib/utils";

type Channel = "SMS" | "EMAIL";

export function LeadReply({ id, reach, smsReady, draft, answered }: { id: string; reach: Channel[]; smsReady: boolean; draft: string; answered: boolean }) {
  const { pending, run } = useAction();
  const usable = reach.filter((c) => c !== "SMS" || smsReady);
  const [via, setVia] = useState<Channel>(usable[0] ?? "SMS");
  const [body, setBody] = useState(draft);
  return (
    <Card>
      <CardHeader><CardTitle>{answered ? "Send another message" : "Reply"}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {reach.length === 0 ? (
          <p className="text-sm text-muted-foreground">No phone or email on this lead. Call them if you have a number, then mark them contacted.</p>
        ) : (
          <>
            <Segmented<Channel> label="Send by" value={via} onChange={setVia} options={reach.map((c) => ({ value: c, label: c === "SMS" ? "Text" : "Email" }))} />
            {via === "SMS" && !smsReady && <p className="text-xs text-muted-foreground">Twilio isn&apos;t set up yet (Setup page), so texting is off.</p>}
            <Label htmlFor="lead-reply" className="sr-only">Reply message</Label>
            <Textarea id="lead-reply" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{body.length} characters · you&apos;re sending this, nothing goes out on its own</span>
              <Button disabled={pending || !body.trim() || (via === "SMS" && !smsReady)} onClick={() => run(() => replyLeadAction(id, via, body), { success: (m) => m })}>
                <Send /> Send
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function LeadStatusButtons({ id, status }: { id: string; status: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <Button asChild><Link href={`/business/quotes/new?lead=${id}`}><FileText /> Make a quote</Link></Button>
      {status === "NEW" && <Button variant="outline" disabled={pending} onClick={() => run(() => setLeadStatusAction(id, "CONTACTED"), { success: "Marked contacted" })}><Phone /> I called them</Button>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={pending || status === "WON"} onClick={() => run(() => setLeadStatusAction(id, "WON"), { success: "Won" })}><ThumbsUp /> Won</Button>
        <Button variant="outline" disabled={pending || status === "LOST"} onClick={() => run(() => setLeadStatusAction(id, "LOST"), { success: "Marked lost" })}><ThumbsDown /> Lost</Button>
      </div>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => rescoreLeadAction(id), { success: (s) => `Re-scored: ${s}` })}><RefreshCw className={cn(pending && "animate-spin")} /> Re-score</Button>
    </div>
  );
}

export function AddLeadButton() {
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", phone: "", email: "", address: "", message: "", source: "PHONE" as "PHONE" | "REFERRAL" | "OTHER", sourceDetail: "" });
  const field = (k: "name" | "phone" | "email" | "address" | "sourceDetail", label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`l-${k}`}>{label}</Label>
      <Input id={`l-${k}`} type={type} required={k === "name"} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Add lead</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add a lead</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => createLeadAction(v), { success: "Lead added", onSuccess: (id) => { setOpen(false); router.push(`/business/leads/${id}`); } }); }}>
            {field("name", "Name")}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field("phone", "Phone", "tel")}
              {field("email", "Email", "email")}
            </div>
            {field("address", "Address")}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="l-source">How they found you</Label>
                <NativeSelect id="l-source" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value as typeof v.source })}>
                  <option value="PHONE">Called me</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="OTHER">Other</option>
                </NativeSelect>
              </div>
              {field("sourceDetail", v.source === "REFERRAL" ? "Referred by" : "Detail (optional)")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-message">What they need</Label>
              <Textarea id="l-message" rows={3} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
            </div>
            <DialogFooter><Button type="submit" disabled={pending}>Add lead</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
