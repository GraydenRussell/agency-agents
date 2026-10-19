import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { ReplyEditor, RequestActions, ReviewLinkForm, Stars, SyncReviewsButton } from "@/components/business/review-widgets";
import { gbpConfigured } from "@/lib/integrations/gbp";
import { isMock } from "@/lib/integrations/mode";
import { customerSmsReady } from "@/lib/notify/customer";
import { reviewsOverview } from "@/lib/services/reviews";
import { getSetting } from "@/lib/services/settings";
import { formatDateTime, formatLocalDate, localDateOf } from "@/lib/time";

export const metadata = { title: "Reviews" };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card><CardContent className="p-4"><p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p><div className="mt-1 font-display text-3xl">{value}</div>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</CardContent></Card>
  );
}

export default async function ReviewsPage() {
  const [o, link] = await Promise.all([reviewsOverview(), getSetting("business.reviewLink")]);
  const max = Math.max(1, ...o.monthly.map((m) => m.count));
  const smsReady = customerSmsReady();
  return (
    <>
      <PageHeader
        title="Reviews"
        description={<span className="flex flex-wrap items-center gap-2">Google reviews, replies, and review requests after every job{isMock() && <Badge variant="warning">sample data</Badge>}</span>}
        actions={gbpConfigured() ? <SyncReviewsButton /> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Rating" value={o.average == null ? "–" : <span className="flex items-baseline gap-2">{o.average.toFixed(1)} <Stars n={Math.round(o.average)} className="text-base" /></span>} />
        <Kpi label="Reviews" value={o.total} sub={`+${o.gained30} in the last 30 days`} />
        <Kpi label="Requests sent" value={o.sent30} sub="last 30 days" />
        <Kpi label="Need a reply" value={o.unreplied.length} sub={o.unreplied.some((r) => r.rating <= 3) ? "includes a low rating" : undefined} />
      </div>

      {!gbpConfigured() && <p className="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-sm">Google reviews aren&apos;t connected yet (Setup → Google reviews). Review requests still work once you add your review link below.</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Need a reply ({o.unreplied.length})</CardTitle></CardHeader>
            <CardContent>
              {o.unreplied.length === 0 ? (
                <EmptyState icon={Star} title="All caught up" description="Every review has a reply. New ones show up here with a drafted response." />
              ) : (
                <ul className="divide-y divide-border" data-testid="reviews-unreplied">
                  {o.unreplied.map((r) => (
                    <li key={r.id} className="py-4 first:pt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars n={r.rating} />
                        <span className="font-medium">{r.author}</span>
                        <span className="text-xs text-muted-foreground">{formatLocalDate(localDateOf(r.reviewedAt))}</span>
                        {r.rating <= 3 && <Badge variant="danger">needs care</Badge>}
                      </div>
                      <p className="mt-1 text-sm">{r.comment ?? <span className="text-muted-foreground">Rating only, no text.</span>}</p>
                      <ReplyEditor id={r.id} author={r.author} draft={r.draftReply ?? ""} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {o.replied.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Replied</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {o.replied.slice(0, 10).map((r) => (
                    <li key={r.id} className="py-3 text-sm first:pt-0">
                      <div className="flex flex-wrap items-center gap-2"><Stars n={r.rating} /><span className="font-medium">{r.author}</span><span className="text-xs text-muted-foreground">{formatLocalDate(localDateOf(r.reviewedAt))}</span></div>
                      {r.comment && <p className="mt-1">{r.comment}</p>}
                      <p className="mt-1 border-l-2 border-primary/50 pl-3 text-muted-foreground">{r.replyText}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>New reviews per month</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-1" role="img" aria-label={o.monthly.map((m) => `${MON[Number(m.month.slice(5)) - 1]}: ${m.count} reviews${m.average ? `, ${m.average} stars` : ""}`).join("; ")}>
                {o.monthly.map((m) => (
                  <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${m.count} reviews${m.average ? ` · avg ${m.average}★` : ""}`}>
                    {m.count > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{m.count}</span>}
                    <div className="w-full rounded-t-[4px] bg-primary" style={{ height: `${(m.count / max) * 90}px`, minHeight: m.count ? 4 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1">{o.monthly.map((m) => <span key={m.month} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground">{MON[Number(m.month.slice(5)) - 1]?.[0]}</span>)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Review requests</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">After each completed job, a “would you leave us a review?” text is queued here and in Approvals (switch on auto-approve in Settings to send them automatically between 9 AM and 7 PM). Customers asked in the last 6 months are skipped.</p>
              <ReviewLinkForm link={link} />
              {!smsReady && <p className="text-xs text-muted-foreground">Texting is off until Twilio is set up.</p>}
              {o.requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing waiting.</p>
              ) : (
                <ul className="divide-y divide-border" data-testid="review-requests">
                  {o.requests.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">{r.status === "FAILED" ? `Failed: ${r.error}` : `queued ${formatDateTime(r.createdAt)}${r.approvalId ? " · in Approvals" : ""}`}</span>
                      </span>
                      <RequestActions id={r.id} name={r.name} canSend={Boolean(link) && smsReady} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
