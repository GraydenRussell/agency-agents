import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { ApprovalButtons } from "@/components/assistant/approval-buttons";
import { db } from "@/lib/db";
import { APPROVAL_ACTIONS } from "@/lib/assistant/policy";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Approvals" };

const STATUS_VARIANT = { APPROVED: "success", REJECTED: "secondary", EXPIRED: "outline", FAILED: "danger", PENDING: "warning" } as const;

export default async function ApprovalsPage() {
  const [pending, history] = await Promise.all([
    db.pendingApproval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    db.pendingApproval.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 50 }),
  ]);
  return (
    <>
      <PageHeader title="Approvals" description="Actions the assistant wants to take that need your OK. Auto-approve per type in Settings (all off by default)." />
      {pending.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing waiting" description="When the assistant wants to send an email, delete something, or invite people, it shows up here." />
      ) : (
        <div className="space-y-3">
          {pending.map((a) => (
            <Card key={a.id} className="border-amber-500/40" data-testid="approval-item">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="warning">{APPROVAL_ACTIONS[a.risk] ?? a.actionType}</Badge>
                  <span>requested {formatDateTime(a.createdAt)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{a.summary}</p>
                <ApprovalButtons id={a.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">History</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {history.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                <Badge variant={STATUS_VARIANT[a.status]}>{a.status.toLowerCase()}</Badge>
                <span className="min-w-0 flex-1 truncate">{a.summary.split("\n")[0]}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{a.decidedAt ? formatDateTime(a.decidedAt) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
