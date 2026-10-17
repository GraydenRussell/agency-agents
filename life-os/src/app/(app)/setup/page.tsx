import { CheckCircle2, Circle, ExternalLink, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shell/page-header";
import { SetupTestButton } from "@/components/setup/test-button";
import { db } from "@/lib/db";
import { checklist, summary } from "@/lib/setup/checklist";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Setup" };

const STATUS = {
  ready: { icon: CheckCircle2, label: "Connected", variant: "success", color: "text-emerald-400" },
  missing: { icon: Circle, label: "Not set up", variant: "outline", color: "text-muted-foreground" },
  invalid: { icon: XCircle, label: "Needs a fix", variant: "danger", color: "text-red-400" },
} as const;

/** Inline `code` spans in step text. */
function Step({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return <>{parts.map((p, i) => (p.startsWith("`") ? <code key={i} className="rounded bg-muted px-1 py-0.5 text-xs">{p.slice(1, -1)}</code> : p))}</>;
}

export default async function SetupPage() {
  const env = process.env;
  const items = checklist(env);
  const s = summary(env);
  const [google, lastJob] = await Promise.all([
    db.integrationAccount.findFirst({ where: { provider: "GOOGLE" }, select: { status: true, accountEmail: true } }),
    db.jobRun.findFirst({ orderBy: { startedAt: "desc" }, select: { job: true, startedAt: true, ok: true } }),
  ]);
  const mock = env.INTEGRATION_MODE !== "live";

  return (
    <>
      <PageHeader title="Setup" description="Connect your accounts, in order. Everything works on sample data until you do; nothing here is needed to try the app." />

      <Card className="mb-4">
        <CardContent className="min-w-0 space-y-3 p-4 [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">
              {s.ready} of {s.total} connected · {s.requiredReady} of {s.requiredTotal} required
            </p>
            <Badge variant={mock ? "warning" : "success"}>{mock ? "Sample data (mock mode)" : "Live mode"}</Badge>
          </div>
          <Progress value={(s.ready / s.total) * 100} label="Setup progress" />
          <p className="text-sm text-muted-foreground">
            Same checks from a terminal: <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run doctor -- --live</code>. Secrets you can generate yourself: <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run setup:secrets</code>. Full guide: docs/DEPLOY.md.
          </p>
          <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <li>Google account: {google ? `${google.accountEmail ?? "connected"} (${google.status === "CONNECTED" ? "active" : "needs reconnect"})` : "not connected yet"}</li>
            <li>Scheduled jobs: {lastJob ? `last ran ${lastJob.job} ${formatDateTime(lastJob.startedAt)}${lastJob.ok === false ? " (failed)" : ""}` : "no runs yet"}</li>
          </ul>
        </CardContent>
      </Card>

      <ol className="space-y-3" data-testid="setup-list">
        {items.map((it, idx) => {
          const st = STATUS[it.status];
          const Icon = st.icon;
          return (
            <li key={it.id}>
              <Card data-testid={`setup-${it.id}`}>
                <CardContent className="min-w-0 space-y-3 p-4 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className={`size-5 shrink-0 ${st.color}`} aria-hidden="true" />
                    <h2 className="font-medium">
                      {idx + 1}. {it.name}
                    </h2>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    {it.required ? <Badge variant="secondary">Required</Badge> : <Badge variant="outline">Optional</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{it.powers}</p>
                  {it.missing.length ? (
                    <p className="text-sm">
                      Missing:{" "}
                      {it.missing.map((m) => (
                        <code key={m} className="mr-1 rounded bg-muted px-1 py-0.5 text-xs">
                          {m}
                        </code>
                      ))}
                    </p>
                  ) : null}
                  {it.problems.length ? (
                    <ul className="list-disc pl-5 text-sm text-red-400">
                      {it.problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                  {it.status !== "ready" ? (
                    <ol className="list-decimal space-y-1 pl-5 text-sm">
                      {it.steps.map((step) => (
                        <li key={step}>
                          <Step text={step} />
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SetupTestButton id={it.id} name={it.name} />
                    {it.link ? (
                      <a href={it.link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary-text underline-offset-4 hover:underline">
                        {it.link.label} <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
