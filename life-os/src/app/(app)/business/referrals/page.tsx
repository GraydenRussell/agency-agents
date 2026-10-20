import Link from "next/link";
import { Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { AddReferralButton, ReferralActions, RewardForm } from "@/components/business/referral-widgets";
import { db } from "@/lib/db";
import { listReferrals } from "@/lib/services/referrals";
import { getSetting } from "@/lib/services/settings";
import { formatLocalDate, localDateOf } from "@/lib/time";
import { formatUsd } from "@/lib/utils";

export const metadata = { title: "Referrals" };

const VARIANT = { PENDING: "outline", EARNED: "warning", PAID: "success", VOID: "secondary" } as const;
const LABEL = { PENDING: "waiting to book", EARNED: "reward owed", PAID: "paid", VOID: "void" } as const;

export default async function ReferralsPage() {
  const [{ rows, stats }, reward, customers] = await Promise.all([listReferrals(), getSetting("business.referralReward"), db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const owed = rows.filter((r) => r.status === "EARNED");
  return (
    <>
      <PageHeader title="Referrals" description={`${stats.total} referrals · ${stats.converted} booked · ${formatUsd(stats.owedAmount)} in rewards owed · ${formatUsd(stats.paidAmount)} paid`} actions={<AddReferralButton customers={customers} />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Rewards owed ({owed.length})</CardTitle></CardHeader>
            <CardContent>
              {owed.length === 0 ? <p className="text-sm text-muted-foreground">Nothing owed right now.</p> : (
                <ul className="divide-y divide-border" data-testid="referrals-owed">
                  {owed.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1"><Link className="font-medium hover:underline" href={`/business/customers/${r.referrer.id}`}>{r.referrer.name}</Link> sent <span className="font-medium">{r.referredName}</span><span className="block text-xs text-muted-foreground">earned {r.earnedAt ? formatLocalDate(localDateOf(r.earnedAt)) : ""}</span></span>
                      <span className="tabular-nums">{formatUsd(r.reward)} {r.rewardKind}</span>
                      <ReferralActions id={r.id} status={r.status} label={`${r.referrer.name} → ${r.referredName}`} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>All referrals</CardTitle></CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <EmptyState icon={Gift} title="No referrals yet" description="Leads marked “Referral” with a customer's name become referrals automatically. You can also record one here. The reward is earned once they complete a job." />
              ) : (
                <ul className="divide-y divide-border" data-testid="referrals-all">
                  {rows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">{r.referrer.name} → {r.referredCustomer ? <Link className="hover:underline" href={`/business/customers/${r.referredCustomer.id}`}>{r.referredName}</Link> : r.lead ? <Link className="hover:underline" href={`/business/leads/${r.lead.id}`}>{r.referredName}</Link> : r.referredName}<span className="block text-xs text-muted-foreground">{formatLocalDate(localDateOf(r.createdAt))}{r.notes ? ` · ${r.notes}` : ""}</span></span>
                      <Badge variant={VARIANT[r.status]}>{LABEL[r.status]}</Badge>
                      <ReferralActions id={r.id} status={r.status} label={`${r.referrer.name} → ${r.referredName}`} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Top referrers</CardTitle></CardHeader>
            <CardContent>
              {stats.leaders.length === 0 ? <p className="text-sm text-muted-foreground">No referrers yet.</p> : (
                <ol className="space-y-2 text-sm">
                  {stats.leaders.map((l, i) => (
                    <li key={l.id} className="flex items-center gap-2"><span className="w-5 text-muted-foreground tabular-nums">{i + 1}.</span><Link className="min-w-0 flex-1 truncate hover:underline" href={`/business/customers/${l.id}`}>{l.name}</Link><span className="text-xs text-muted-foreground">{l.converted}/{l.sent} booked</span></li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Reward</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <RewardForm amount={reward.amount} kind={reward.kind} />
              <p className="text-xs text-muted-foreground">Applies to new referrals. You get a heads-up when one is earned.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
