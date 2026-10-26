import Link from "next/link";
import { Download, Paperclip, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { AddExpense, DeleteExpenseButton, MileageForms } from "@/components/business/expense-widgets";
import { byCategory, deductibleAmount } from "@/lib/business/expenses";
import { aiConfigured } from "@/lib/ai/client";
import { listExpenses, taxYearSummary } from "@/lib/services/expenses";
import { formatLocalDate, today } from "@/lib/time";
import { cn, formatUsd } from "@/lib/utils";

export const metadata = { title: "Expenses" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n: number) => formatUsd(n, { cents: true });

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const t = today();
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : t.slice(0, 7);
  const year = m.slice(0, 4);
  const [rows, ytd] = await Promise.all([listExpenses({ month: m }), taxYearSummary(year)]);
  const cats = byCategory(rows);
  const monthTotal = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <PageHeader
        title="Expenses & mileage"
        description={`${year} so far: ${money(ytd.totalSpent)} spent · ${money(ytd.totalDeductible)} deductible · ${ytd.businessMiles} business miles (${money(ytd.mileageDeduction)} at $${ytd.mileageRate}/mi)${aiConfigured() ? "" : " · receipt reading turns on with the Anthropic key"}`}
        actions={<AddExpense today={t} />}
      />
      <nav aria-label="Month" className="mb-3 flex gap-1 overflow-x-auto">
        {MONTHS.map((label, i) => {
          const k = `${year}-${String(i + 1).padStart(2, "0")}`;
          if (k > t.slice(0, 7)) return null;
          return <Link key={k} href={`/business/expenses?month=${k}`} aria-current={k === m ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-sm", k === m ? "border-primary bg-primary/15" : "border-border text-muted-foreground hover:text-foreground")}>{label}</Link>;
        })}
      </nav>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2 lg:self-start">
          <CardHeader><CardTitle>{MONTHS[Number(m.slice(5)) - 1]} {year} · {money(monthTotal)}</CardTitle></CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState icon={Receipt} title="No expenses this month" description="Snap a receipt and Life OS reads the vendor, date, total, and category for you to confirm." />
            ) : (
              <ul className="divide-y divide-border" data-testid="expense-list">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">{formatLocalDate(e.date)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{e.vendor}</span><span className="block truncate text-xs text-muted-foreground">{e.category}{e.deductiblePct < 100 ? ` · ${e.deductiblePct}% deductible` : ""}{e.notes ? ` · ${e.notes}` : ""}</span></span>
                    {e.receiptId && <a href={`/api/receipts/${e.receiptId}`} target="_blank" rel="noreferrer" aria-label={`Receipt for ${e.vendor}`}><Paperclip className="size-4 text-muted-foreground" /></a>}
                    <span className="w-20 text-right tabular-nums">{money(e.amount)}</span>
                    <DeleteExpenseButton id={e.id} label={`${e.vendor} ${money(e.amount)}`} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>By category</CardTitle></CardHeader>
            <CardContent>
              {cats.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
                <ul className="space-y-1.5 text-sm">{cats.map((c) => <li key={c.category} className="flex justify-between gap-2"><span>{c.category} <span className="text-xs text-muted-foreground">×{c.count}</span></span><span className="tabular-nums">{money(c.total)}</span></li>)}</ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Deductible this month: {money(rows.reduce((s, r) => s + deductibleAmount(r), 0))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Mileage</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <MileageForms vehicles={ytd.vehicles.map((v) => ({ id: v.id, name: v.name }))} today={t} rate={ytd.mileageRate} />
              {ytd.trips.length > 0 && (
                <ul className="divide-y divide-border border-t border-border text-sm" data-testid="trip-list">
                  {ytd.trips.slice(0, 8).map((tr) => <li key={tr.id} className="flex justify-between gap-2 py-1.5"><span className="min-w-0 truncate">{formatLocalDate(tr.date)} · {tr.purpose}</span><span className="shrink-0 tabular-nums">{tr.miles} mi</span></li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Check the IRS standard mileage rate each January and update it here.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>For your accountant</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm"><a href={`/api/expenses/export?year=${year}&kind=expenses`}><Download /> {year} expenses CSV</a></Button>
              <Button asChild variant="outline" size="sm"><a href={`/api/expenses/export?year=${year}&kind=mileage`}><Download /> {year} mileage CSV</a></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
