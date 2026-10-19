"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, Eye, Pencil, Send, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { sendQuoteAction, setQuoteStatusAction } from "@/app/(app)/business/actions";

type Channel = "SMS" | "EMAIL";

export function QuoteActions({ quote, reach, smsReady, link, defaults }: { quote: { id: string; number: number; status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED"; phone: string | null; email: string | null }; reach: Channel[]; smsReady: boolean; link: string; defaults: { sms: string; email: string; subject: string } }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [via, setVia] = useState<Channel[]>(reach.includes("SMS") && smsReady ? ["SMS"] : reach.includes("EMAIL") ? ["EMAIL"] : []);
  const [sms, setSms] = useState(defaults.sms);
  const [email, setEmail] = useState(defaults.email);
  const final = quote.status === "ACCEPTED" || quote.status === "DECLINED";
  const toggle = (c: Channel, on: boolean) => setVia(on ? [...new Set([...via, c])] : via.filter((x) => x !== c));

  return (
    <Card>
      <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!final && (
          <Button onClick={() => setOpen(true)} disabled={reach.length === 0}>
            <Send /> {quote.status === "SENT" ? "Send again" : "Send to customer"}
          </Button>
        )}
        {!final && reach.length === 0 && <p className="text-xs text-muted-foreground">Add a mobile number or email to send this quote.</p>}
        <Button asChild variant="outline"><a href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer"><Eye /> Preview PDF</a></Button>
        <Button asChild variant="outline"><a href={`/api/quotes/${quote.id}/pdf?download`}><Download /> Download PDF</a></Button>
        <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success("Customer link copied"); } catch { toast.error(link); } }}><Copy /> Copy customer link</Button>
        {!final && <Button asChild variant="outline"><Link href={`/business/quotes/new?edit=${quote.id}`}><Pencil /> Edit</Link></Button>}
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
          {final ? (
            <Button variant="ghost" className="col-span-2" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quote.id, "DRAFT"), { success: "Reopened" })}><Undo2 /> Reopen</Button>
          ) : (
            <>
              <Button variant="outline" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quote.id, "ACCEPTED"), { success: `Quote #${quote.number} won` })}><ThumbsUp /> Won</Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quote.id, "DECLINED"), { success: `Quote #${quote.number} marked lost` })}><ThumbsDown /> Lost</Button>
            </>
          )}
        </div>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send quote #{quote.number}</DialogTitle>
            <DialogDescription>Check the message. Nothing goes out until you press Send.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={via.includes("SMS")} disabled={!reach.includes("SMS") || !smsReady} onCheckedChange={(v) => toggle("SMS", v === true)} aria-label="Send by text" /> Text {quote.phone ?? ""}
              </label>
              {!reach.includes("SMS") && <p className="text-xs text-muted-foreground">No textable mobile number on this quote.</p>}
              {reach.includes("SMS") && !smsReady && <p className="text-xs text-muted-foreground">Twilio isn&apos;t set up yet (Setup page), so texting is off.</p>}
              {via.includes("SMS") && (
                <>
                  <Label htmlFor="sms-body" className="sr-only">Text message</Label>
                  <Textarea id="sms-body" rows={4} value={sms} onChange={(e) => setSms(e.target.value)} />
                  <p className="text-right text-xs text-muted-foreground">{sms.length} characters{sms.length > 320 ? " (sends as several texts)" : ""}</p>
                </>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={via.includes("EMAIL")} disabled={!reach.includes("EMAIL")} onCheckedChange={(v) => toggle("EMAIL", v === true)} aria-label="Send by email" /> Email {quote.email ?? ""} <span className="font-normal text-muted-foreground">(PDF attached)</span>
              </label>
              {via.includes("EMAIL") && (
                <>
                  <p className="text-xs text-muted-foreground">Subject: {defaults.subject}</p>
                  <Label htmlFor="email-body" className="sr-only">Email message</Label>
                  <Textarea id="email-body" rows={8} value={email} onChange={(e) => setEmail(e.target.value)} />
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button disabled={pending || via.length === 0} onClick={() => run(() => sendQuoteAction(quote.id, via, { sms, email }), { success: (m) => m, onSuccess: () => setOpen(false) })}>
              <Check /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
