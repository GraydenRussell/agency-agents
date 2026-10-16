import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shell/page-header";
import { BillForm, CategoryForm, RowActions, TransactionForm } from "@/components/life/money-forms";
import { monthOf, monthSummary } from "@/lib/services/money";
import { formatLocalDate, isoWeekday, today } from "@/lib/time";
import { cn, formatUsd } from "@/lib/utils";

export const metadata = { title: "Money" };

function shift(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MoneyPage({ searchParams }: PageProps<"/money">) {
  const sp = await searchParams;
  const ym = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(today());
  const s = await monthSummary(ym);
  const label = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const pace = s.totalLimit ? (s.dayOfMonth / s.daysInMonth) * 100 : 0;
  const firstDow = isoWeekday(`${ym}-01`);
  const cells = [...Array.from({ length: firstDow - 1 }, () => null), ...Array.from({ length: s.daysInMonth }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];

  return (
    <>
      <PageHeader
        title="Money"
        description="Manual entry for now; the data model is ready for a Plaid import later."
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon-sm" aria-label="Previous month">
              <Link href={`/money?month=${shift(ym, -1)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="w-36 text-center font-heading text-xl tracking-wide">{label}</span>
            <Button asChild variant="outline" size="icon-sm" aria-label="Next month">
              <Link href={`/money?month=${shift(ym, 1)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Spent", formatUsd(s.totalSpent, { cents: true })],
          ["Budget", formatUsd(s.totalLimit)],
          ["Left", formatUsd(Math.max(0, s.totalLimit - s.totalSpent))],
          ["Bills / month", formatUsd(s.billsTotal)],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{k}</p>
              <p className="mt-1 font-display text-3xl">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Budget</CardTitle>
            <span className="text-xs text-muted-foreground">
              day {s.dayOfMonth} of {s.daysInMonth} ({Math.round(pace)}% of month)
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.budget.map((c) => {
              const pct = c.limit ? (c.spent / c.limit) * 100 : 0;
              const over = c.spent > c.limit;
              const ahead = !over && pct > pace + 15;
              return (
                <div key={c.id} data-testid="budget-row">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span>{c.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                      {over && (
                        <Badge variant="danger">
                          <AlertTriangle className="size-3" /> over
                        </Badge>
                      )}
                      {ahead && <Badge variant="warning">ahead of pace</Badge>}
                      {formatUsd(c.spent, { cents: true })} / {formatUsd(c.limit)}
                    </span>
                  </div>
                  <Progress value={pct} indicatorClassName={over ? "bg-red-500" : undefined} />
                </div>
              );
            })}
            {s.uncategorized > 0 && <p className="text-xs text-muted-foreground">Uncategorized: {formatUsd(s.uncategorized, { cents: true })}</p>}
            <div className="border-t border-border pt-3">
              <CategoryForm />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bills calendar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="text-muted-foreground">
                  {d}
                </span>
              ))}
              {cells.map((d, i) => {
                const due = d ? s.bills.filter((b) => b.due === d) : [];
                return (
                  <span
                    key={i}
                    title={due.map((b) => `${b.name} ${formatUsd(b.amount)}${b.paid ? " (paid)" : ""}`).join("\n") || undefined}
                    className={cn("grid aspect-square place-items-center rounded", d === today() && "ring-1 ring-brand-cyan", due.length && (due.every((b) => b.paid) ? "bg-emerald-500/20" : due.some((b) => b.overdue) ? "bg-red-500/25" : "bg-primary/25"))}
                  >
                    {d ? Number(d.slice(8)) : ""}
                  </span>
                );
              })}
            </div>
            <ul className="divide-y divide-border text-sm" data-testid="bill-list">
              {s.bills.map((b) => (
                <li key={b.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{b.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatLocalDate(b.due)} · {formatUsd(b.amount)} {b.autopay && "· autopay"}
                    </span>
                  </span>
                  {b.paid ? <Badge variant="success">paid</Badge> : b.overdue ? <Badge variant="danger">overdue</Badge> : null}
                  <RowActions kind="bill" id={b.id} month={ym} paid={b.paid} />
                </li>
              ))}
            </ul>
            <BillForm />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TransactionForm date={ym === monthOf(today()) ? today() : `${ym}-01`} categories={s.budget.map((c) => ({ id: c.id, name: c.name }))} />
            {s.transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions this month.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="tx-list">
                {s.transactions.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatLocalDate(t.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{t.merchant}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{t.category?.name ?? "Uncategorized"}</span>
                    <span className="w-20 text-right tabular-nums">{formatUsd(t.amount, { cents: true })}</span>
                    <RowActions kind="tx" id={t.id} />
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
