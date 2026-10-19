import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { QuoteActions } from "@/components/business/quote-actions";
import { QUOTE_STATUS_VARIANT } from "@/components/business/quote-status";
import { db } from "@/lib/db";
import { customerSmsReady } from "@/lib/notify/customer";
import { getQuote, isExpired, quoteMessage, quoteReach, quoteUrl, usd } from "@/lib/services/quotes";
import { formatDateTime, formatLocalDate } from "@/lib/time";
import { formatPhone } from "@/lib/utils";

export const metadata = { title: "Quote" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getQuote(id);
  if (!q) notFound();
  const [msg, pending] = await Promise.all([quoteMessage(q), db.pendingApproval.findFirst({ where: { actionType: "quote_send", status: "PENDING", payload: { path: ["quoteId"], equals: q.id } } })]);
  const expired = isExpired(q);
  return (
    <>
      <Link href="/business/quotes" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Quotes
      </Link>
      <PageHeader
        title={`Quote #${q.number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={QUOTE_STATUS_VARIANT[q.status]}>{q.status === "ACCEPTED" ? "won" : q.status === "DECLINED" ? "lost" : q.status.toLowerCase()}</Badge>
            {expired ? <Badge variant="warning">expired {formatLocalDate(q.validUntil)}</Badge> : <span>valid through {formatLocalDate(q.validUntil)}</span>}
            {q.sentAt && <span>· sent {formatDateTime(q.sentAt)} by {q.sentVia.map((v) => (v === "SMS" ? "text" : "email")).join(" + ")}</span>}
          </span>
        }
      />
      {pending && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
          <Clock className="size-4 shrink-0" /> The assistant asked to send this quote. <Link href="/approvals" className="font-medium underline">Review it in Approvals</Link>
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{q.name}</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">{[q.address, q.phone && formatPhone(q.phone), q.email].filter(Boolean).join(" · ") || "No contact details"}{q.customerId && <> · <Link className="underline" href={`/business/customers/${q.customerId}`}>customer record</Link></>}</p>
            <ul className="divide-y divide-border text-sm" data-testid="quote-detail-lines">
              {q.lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">{l.label}{["panes", "insidePanes", "screens", "tracks", "hardWaterPanes", "solarScreens"].includes(l.key) && <span className="text-muted-foreground"> · {l.qty} × {usd(l.unit)}</span>}</span>
                  <span className={l.amount < 0 ? "text-emerald-500 tabular-nums" : "tabular-nums"}>{usd(l.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-medium">Total</span>
              <span className="font-display text-4xl" data-testid="quote-detail-total">{usd(q.total)}</span>
            </div>
            {q.notes && <p className="mt-3 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{q.notes}</p>}
          </CardContent>
        </Card>
        <QuoteActions
          quote={{ id: q.id, number: q.number, status: q.status, phone: q.phone, email: q.email }}
          reach={quoteReach(q)}
          smsReady={customerSmsReady()}
          link={quoteUrl(q.id)}
          defaults={{ sms: msg.sms, email: msg.email, subject: msg.subject }}
        />
      </div>
    </>
  );
}
