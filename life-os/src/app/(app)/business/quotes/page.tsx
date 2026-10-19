import Link from "next/link";
import { FileText, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { QUOTE_STATUS_VARIANT } from "@/components/business/quote-status";
import { isExpired, listQuotes, quoteStats, usd } from "@/lib/services/quotes";
import { formatLocalDate, localDateOf, relativeDayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Quotes" };

const FILTERS = [
  ["", "All"],
  ["OPEN", "Open"],
  ["SENT", "Sent"],
  ["ACCEPTED", "Won"],
  ["DECLINED", "Lost"],
] as const;

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const filter = FILTERS.find((f) => f[0] === status)?.[0] ?? "";
  const [all, rows] = await Promise.all([listQuotes({ take: 1000 }), listQuotes({ status: filter || undefined })]);
  const s = quoteStats(all);
  return (
    <>
      <PageHeader
        title="Quotes"
        description={`${s.openCount} open worth ${usd(s.openValue)} · ${usd(s.wonValue)} won${s.closeRate === null ? "" : ` · ${Math.round(s.closeRate * 100)}% close rate`}`}
        actions={
          <>
            <Button asChild variant="outline"><Link href="/business/quotes/pricing"><SlidersHorizontal /> Pricing</Link></Button>
            <Button asChild><Link href="/business/quotes/new"><Plus /> New quote</Link></Button>
          </>
        }
      />
      <nav aria-label="Filter quotes" className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map(([v, l]) => (
          <Link key={l} href={v ? `/business/quotes?status=${v}` : "/business/quotes"} aria-current={filter === v ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-sm", filter === v ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{l}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={filter ? "No quotes here" : "No quotes yet"} description="Build one in under a minute: counts in, price out, branded PDF ready to text or email." action={<Button asChild><Link href="/business/quotes/new">New quote</Link></Button>} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border" data-testid="quotes-list">
              {rows.map((q) => (
                <li key={q.id}>
                  <Link href={`/business/quotes/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-accent/40">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">#{q.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{q.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{q.address ?? "No address"} · {relativeDayLabel(localDateOf(q.createdAt))}</span>
                    </span>
                    {isExpired(q) ? <Badge variant="warning">expired {formatLocalDate(q.validUntil)}</Badge> : <Badge variant={QUOTE_STATUS_VARIANT[q.status]}>{q.status === "ACCEPTED" ? "won" : q.status === "DECLINED" ? "lost" : q.status.toLowerCase()}</Badge>}
                    <span className="w-20 text-right font-medium tabular-nums">{usd(q.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
