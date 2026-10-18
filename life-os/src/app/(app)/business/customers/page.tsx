import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { CustomerToolbar } from "@/components/business/customer-toolbar";
import { isMock } from "@/lib/integrations/mode";
import { housecallSyncState, listCustomers } from "@/lib/services/customers";
import { formatDateTime, localDateOf, relativeDayLabel } from "@/lib/time";
import { formatPhone, formatUsd } from "@/lib/utils";

export const metadata = { title: "Customers" };

const day = (d: Date | null) => (d ? relativeDayLabel(localDateOf(d)) : "–");

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [rows, sync] = await Promise.all([listCustomers({ q }), housecallSyncState()]);
  const owed = rows.reduce((s, r) => s + r.balanceDue, 0);
  const ltv = rows.reduce((s, r) => s + r.lifetimeValue, 0);
  return (
    <>
      <PageHeader
        title="Customers"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {rows.length} {q ? "matching" : "customers"} · {formatUsd(ltv)} lifetime · {formatUsd(owed)} owed
            {sync.configured ? <span>· {sync.lastSyncAt ? `Housecall Pro synced ${formatDateTime(sync.lastSyncAt)}` : "Housecall Pro not synced yet"}</span> : <span>· Housecall Pro not connected (Setup)</span>}
            {isMock() && <Badge variant="warning">sample data</Badge>}
          </span>
        }
      />
      {sync.status === "ERROR" && sync.lastError && <p role="alert" className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">Last Housecall Pro sync failed: {sync.lastError}</p>}
      <CustomerToolbar q={q} housecallReady={sync.configured} />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title={q ? "No customers match" : "No customers yet"} description={q ? "Try a different name, street, or phone number." : sync.configured ? "Press “Sync Housecall Pro” to pull in your customers and jobs, or add one by hand." : "Connect Housecall Pro on the Setup page, or add customers by hand."} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="customers-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">City</th>
                    <th className="px-3 py-2 text-right font-medium">Jobs</th>
                    <th className="px-3 py-2 text-right font-medium">Lifetime</th>
                    <th className="px-3 py-2 font-medium">Last cleaned</th>
                    <th className="px-3 py-2 font-medium">Next job</th>
                    <th className="px-4 py-2 text-right font-medium">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-2">
                        <Link href={`/business/customers/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                        <span className="block text-xs text-muted-foreground">{[r.company !== r.name ? r.company : null, r.phone && formatPhone(r.phone)].filter(Boolean).join(" · ") || (r.source === "MANUAL" ? "Added by hand" : "")}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.city ?? "–"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.jobCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUsd(r.lifetimeValue)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{day(r.lastCompletedAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{day(r.nextScheduledAt)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.balanceDue > 0 ? <span className="text-amber-500">{formatUsd(r.balanceDue)}</span> : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
