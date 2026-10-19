import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { LeadReply, LeadStatusButtons } from "@/components/business/lead-forms";
import { ScorePill, WaitBadge } from "@/components/business/lead-bits";
import { QUOTE_STATUS_VARIANT } from "@/components/business/quote-status";
import { waitingMinutes } from "@/lib/business/leads";
import { db } from "@/lib/db";
import { customerSmsReady } from "@/lib/notify/customer";
import { getLead, leadReach, SOURCE_LABEL } from "@/lib/services/leads";
import { getSetting } from "@/lib/services/settings";
import { formatDateTime } from "@/lib/time";
import { formatPhone, formatUsd } from "@/lib/utils";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await getLead(id);
  if (!l) notFound();
  const [nudge, pending] = await Promise.all([getSetting("leads.nudgeMinutes"), db.pendingApproval.findFirst({ where: { actionType: "lead_reply", status: "PENDING", payload: { path: ["leadId"], equals: l.id } } })]);
  return (
    <>
      <Link href="/business/leads" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Leads
      </Link>
      <PageHeader
        title={l.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{SOURCE_LABEL[l.source]}{l.sourceDetail ? ` · ${l.sourceDetail}` : ""}</Badge>
            <span>received {formatDateTime(l.receivedAt)}</span>
            <WaitBadge minutes={waitingMinutes(l)} threshold={nudge} />
            {l.status !== "NEW" && <Badge variant={l.status === "WON" ? "success" : l.status === "LOST" ? "danger" : "cyan"}>{l.status.toLowerCase()}</Badge>}
            {l.firstResponseAt && <span>· first reply {formatDateTime(l.firstResponseAt)}</span>}
          </span>
        }
      />
      {pending && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
          <Clock className="size-4 shrink-0" /> The assistant drafted a reply for your approval. <Link href="/approvals" className="font-medium underline">Review it in Approvals</Link>
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>What they said</CardTitle>
              <span className="flex items-center gap-2 text-sm"><ScorePill score={l.score} /><span className="text-muted-foreground">{l.scoredBy === "ai" ? "AI score" : l.scoredBy ? "rule score" : ""}</span></span>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm whitespace-pre-wrap" data-testid="lead-message">{l.message ?? "No message."}</p>
              {l.scoreReason && <p className="rounded-lg bg-muted p-3 text-sm"><span className="font-medium">Why this score:</span> {l.scoreReason}</p>}
            </CardContent>
          </Card>
          <LeadReply id={l.id} reach={leadReach(l)} smsReady={customerSmsReady()} draft={l.draftReply ?? ""} answered={Boolean(l.firstResponseAt)} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {l.phone && <a href={`tel:${l.phone}`} className="flex items-center gap-2 hover:underline"><Phone className="size-4 text-muted-foreground" />{formatPhone(l.phone)}</a>}
              {l.email && <a href={`mailto:${l.email}`} className="flex items-center gap-2 [overflow-wrap:anywhere] hover:underline"><Mail className="size-4 shrink-0 text-muted-foreground" />{l.email}</a>}
              {l.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline"><MapPin className="size-4 shrink-0 text-muted-foreground" />{l.address}</a>}
              {l.customer && <p>Existing customer: <Link className="underline" href={`/business/customers/${l.customer.id}`}>{l.customer.name}</Link></p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Next step</CardTitle></CardHeader>
            <CardContent><LeadStatusButtons id={l.id} status={l.status} /></CardContent>
          </Card>
          {l.quotes.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Quotes</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {l.quotes.map((q) => (
                    <li key={q.id}><Link href={`/business/quotes/${q.id}`} className="flex items-center justify-between gap-2 hover:underline"><span>#{q.number} · {formatUsd(q.total, { cents: q.total % 1 !== 0 })}</span><Badge variant={QUOTE_STATUS_VARIANT[q.status]}>{q.status.toLowerCase()}</Badge></Link></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
