import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { CustomerEditor } from "@/components/business/customer-editor";
import { getCustomer } from "@/lib/services/customers";
import { formatDateTime, formatLocalDate, localDateOf } from "@/lib/time";
import { formatPhone, formatUsd } from "@/lib/utils";

export const metadata = { title: "Customer" };

const STATUS_VARIANT = { COMPLETED: "success", SCHEDULED: "default", IN_PROGRESS: "default", CANCELED: "outline", UNSCHEDULED: "outline" } as const;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) notFound();
  return (
    <>
      <Link href="/business/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <PageHeader title={c.name} description={<span className="flex flex-wrap items-center gap-2">{c.company && c.company !== c.name ? c.company : null}{c.source === "HOUSECALL_PRO" ? <Badge variant="outline">Housecall Pro</Badge> : <Badge variant="outline">Added by hand</Badge>}{c.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</span>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Lifetime value", formatUsd(c.stats.lifetimeValue)], ["Completed jobs", String(c.stats.jobCount)], ["Last cleaned", c.stats.lastCompletedAt ? formatLocalDate(localDateOf(c.stats.lastCompletedAt)) : "–"], ["Owed", formatUsd(c.stats.balanceDue)]].map(([l, v]) => (
          <Card key={l}><CardContent className="p-4"><p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{l}</p><p className="mt-1 font-display text-2xl">{v}</p></CardContent></Card>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 hover:underline"><Phone className="size-4 text-muted-foreground" />{formatPhone(c.phone)}</a>}
            {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 [overflow-wrap:anywhere] hover:underline"><Mail className="size-4 shrink-0 text-muted-foreground" />{c.email}</a>}
            {c.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline"><MapPin className="size-4 shrink-0 text-muted-foreground" />{c.address}</a>}
            {!c.phone && !c.email && !c.address && <p className="text-muted-foreground">No contact details.</p>}
            <CustomerEditor id={c.id} rebookMonths={c.rebookMonths} notes={c.notes ?? ""} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Jobs ({c.jobs.length})</CardTitle></CardHeader>
          <CardContent>
            {c.jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="customer-jobs">
                {c.jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="w-36 shrink-0 text-xs text-muted-foreground">{j.scheduledStart ? formatDateTime(j.scheduledStart) : "Not scheduled"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{j.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[j.invoiceNumber && `Invoice #${j.invoiceNumber}`, j.crew.join(", ")].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Badge variant={STATUS_VARIANT[j.status]}>{j.status.toLowerCase().replace("_", " ")}</Badge>
                    <span className="w-20 text-right tabular-nums">{formatUsd(j.total)}{j.balanceDue > 0 && j.status !== "CANCELED" && <span className="block text-xs text-amber-500">{formatUsd(j.balanceDue)} owed</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
