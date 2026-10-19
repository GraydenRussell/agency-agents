import { Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { RebookRow } from "@/components/business/rebook-row";
import { customerSmsReady } from "@/lib/notify/customer";
import { rebookList, type RebookRow as Row } from "@/lib/services/rebook";
import { getSetting } from "@/lib/services/settings";
import { formatLocalDate, parseLocalDate } from "@/lib/time";
import { formatUsd } from "@/lib/utils";

export const metadata = { title: "Re-book" };

const SECTIONS: Array<[Row["bucket"], string, string]> = [
  ["overdue", "Overdue", "Past their usual interval"],
  ["due", "Due now", "Within the next two weeks"],
  ["soon", "Coming up", "Within about six weeks"],
];

export default async function RebookPage() {
  const [rows, def] = await Promise.all([rebookList(), getSetting("business.rebookDefaultMonths")]);
  const label = (d: string) => `${formatLocalDate(d)}, ${parseLocalDate(d).y}`;
  const smsReady = customerSmsReady();
  const repeatValue = rows.filter((r) => r.bucket !== "soon").reduce((s, r) => s + r.lastTotal, 0);
  return (
    <>
      <PageHeader title="Re-book" description={`${rows.filter((r) => r.bucket !== "soon").length} customers due · about ${formatUsd(repeatValue)} of repeat work · default interval ${def} months (set per customer on their page)`} />
      {!smsReady && <p className="mb-3 rounded-lg border border-border bg-muted/50 p-3 text-sm">Texting is off until Twilio is set up on the Setup page. You can still see who&apos;s due and call them.</p>}
      {rows.length === 0 ? (
        <EmptyState icon={Repeat} title="Nobody is due right now" description="Customers show up here as they approach their next cleaning (based on their last completed job). Customers with a job already scheduled are left off." />
      ) : (
        <div className="space-y-4">
          {SECTIONS.map(([bucket, title, sub]) => {
            const list = rows.filter((r) => r.bucket === bucket);
            if (!list.length) return null;
            return (
              <Card key={bucket}>
                <CardHeader><CardTitle>{title} ({list.length})</CardTitle><span className="text-xs text-muted-foreground">{sub}</span></CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {list.map((r) => (
                      <RebookRow key={r.customerId} smsReady={smsReady} r={{ customerId: r.customerId, name: r.name, city: r.city, lastCleanedLabel: label(r.lastCleaned), dueLabel: label(r.dueDate), daysUntil: r.daysUntil, bucket: r.bucket, lastTotal: formatUsd(r.lastTotal), intervalMonths: r.intervalMonths, canText: r.canText, draft: r.draft }} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
