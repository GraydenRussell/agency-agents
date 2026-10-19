import Link from "next/link";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { AddLeadButton } from "@/components/business/lead-forms";
import { ScorePill, WaitBadge } from "@/components/business/lead-bits";
import { waitingMinutes } from "@/lib/business/leads";
import { isMock } from "@/lib/integrations/mode";
import { leadCounts, listLeads, SOURCE_LABEL, type LeadFilter } from "@/lib/services/leads";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leads" };

const FILTERS: Array<[LeadFilter, string]> = [["OPEN", "Open"], ["NEW", "New"], ["CONTACTED", "Contacted"], ["QUOTED", "Quoted"], ["WON", "Won"], ["LOST", "Lost"], ["ALL", "All"]];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f[0] === status)?.[0] ?? "OPEN";
  const [rows, counts] = await Promise.all([listLeads(filter), leadCounts()]);
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Leads"
        description={<span className="flex flex-wrap items-center gap-2">{counts.unanswered ? `${counts.unanswered} waiting for a reply${counts.late ? `, ${counts.late} past ${counts.nudgeMinutes} min` : ""}` : "Everyone has a reply. Nice."} · website forms, Meta lead ads, email, and calls in one place{isMock() && <Badge variant="warning">sample mode</Badge>}</span>}
        actions={<AddLeadButton />}
      />
      <nav aria-label="Filter leads" className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map(([v, l]) => (
          <Link key={v} href={v === "OPEN" ? "/business/leads" : `/business/leads?status=${v}`} aria-current={filter === v ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-sm", filter === v ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{l}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={filter === "OPEN" ? "No open leads" : "Nothing here"} description="New leads from your website form, Meta lead ads, and lead emails show up here with a score and a drafted reply. Connect them on the Setup page, or add a phone lead yourself." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border" data-testid="leads-list">
              {rows.map((l) => (
                <li key={l.id}>
                  <Link href={`/business/leads/${l.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40">
                    <ScorePill score={l.score} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{l.name}</span>
                        <WaitBadge minutes={waitingMinutes(l, now)} threshold={counts.nudgeMinutes} />
                        {l.status !== "NEW" && <Badge variant="outline">{l.status.toLowerCase()}</Badge>}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{l.message ?? l.scoreReason ?? "No message"}</span>
                      <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[l.source]}{l.sourceDetail ? ` · ${l.sourceDetail}` : ""} · {formatDateTime(l.receivedAt)}</span>
                    </span>
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
