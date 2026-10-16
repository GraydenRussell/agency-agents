import Link from "next/link";
import { Activity } from "lucide-react";
import type { Actor } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { UndoButton } from "@/components/assistant/undo-button";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity Log" };

const ACTORS: Actor[] = ["ASSISTANT", "AUTOMATION", "USER"];

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const actor = typeof sp.actor === "string" && ACTORS.includes(sp.actor as Actor) ? (sp.actor as Actor) : undefined;
  const rows = await db.activityLog.findMany({ where: actor ? { actor } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Activity Log" description="Everything the assistant and automations did. Undo where possible." />
      <div className="mb-4 flex gap-1.5 text-xs">
        <Link href="/activity" className={cn("rounded-full border px-2.5 py-0.5", !actor ? "border-primary bg-primary/15" : "border-border text-muted-foreground")}>
          All
        </Link>
        {ACTORS.map((a) => (
          <Link key={a} href={`/activity?actor=${a}`} className={cn("rounded-full border px-2.5 py-0.5 capitalize", actor === a ? "border-primary bg-primary/15" : "border-border text-muted-foreground")}>
            {a.toLowerCase()}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card/40" data-testid="activity-list">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
              <Badge variant={r.actor === "ASSISTANT" ? "cyan" : r.actor === "AUTOMATION" ? "secondary" : "outline"}>{r.actor.toLowerCase()}</Badge>
              <div className="min-w-0 flex-1">
                <p className={cn("break-words whitespace-pre-wrap", r.undoneAt && "text-muted-foreground line-through")}>{r.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {r.actionType} · {formatDateTime(r.createdAt)}
                  {!r.ok && <span className="text-red-400"> · failed: {r.error}</span>}
                  {r.undoneAt && ` · undone ${formatDateTime(r.undoneAt)}`}
                </p>
              </div>
              {r.undo && !r.undoneAt && r.ok ? <UndoButton id={r.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
