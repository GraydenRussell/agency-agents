import Link from "next/link";
import { AlertTriangle, Inbox, Mail, Newspaper, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaptureBox } from "@/components/today/capture-box";
import { ChecklistGroup } from "@/components/today/checklist-card";
import { HabitCheckins } from "@/components/today/habit-checkins";
import { RollOverButton } from "@/components/today/roll-over-button";
import { Timeline } from "@/components/today/timeline";
import { WeatherCard } from "@/components/today/weather-card";
import { TaskList } from "@/components/tasks/task-list";
import { getToday } from "@/lib/services/today";
import { Markdown } from "@/components/assistant/markdown";
import { RunJobButton } from "@/components/today/run-job-button";
import { formatLocalDate, greeting, relativeDayLabel } from "@/lib/time";
import { formatUsd, pluralize } from "@/lib/utils";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const d = await getToday();
  const { tasks } = d;
  const openTop3 = tasks.top3.filter((t) => t.status !== "DONE").length;

  return (
    <>
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">{formatLocalDate(d.date, { weekday: true })} · Chandler, AZ</p>
        <h1 className="font-heading text-4xl tracking-wider md:text-5xl">{greeting()}, Grayden</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pluralize(tasks.completedToday, "task")} done today
          {openTop3 > 0 ? ` · ${openTop3} of your Top 3 to go` : tasks.top3.length ? " · Top 3 complete 🎉" : ""}
          {tasks.overdue.length > 0 ? ` · ${tasks.overdue.length} overdue` : ""}
        </p>
      </div>

      <div className="mb-4">
        <CaptureBox />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="size-4" /> Daily brief
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {d.brief ? (
                <div className="[&_p.font-semibold]:mt-3 [&_p.font-semibold]:text-xs [&_p.font-semibold]:tracking-wider [&_p.font-semibold]:text-muted-foreground [&_p.font-semibold]:uppercase">
                  <Markdown text={d.brief.markdown} />
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground">Your brief arrives at 6:00 AM.</p>
                  <RunJobButton job="daily-brief" label="Generate now" />
                </div>
              )}
            </CardContent>
          </Card>

          {d.evening && (
            <Card>
              <CardHeader>
                <CardTitle>Evening wrap-up</CardTitle>
              </CardHeader>
              <CardContent className="text-sm [&_p.font-semibold]:mt-3 [&_p.font-semibold]:text-xs [&_p.font-semibold]:text-muted-foreground [&_p.font-semibold]:uppercase">
                <Markdown text={d.evening.markdown} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="size-4 text-amber-400" /> Top 3 priorities
              </CardTitle>
              <Badge variant="outline">{tasks.top3.length}/3</Badge>
            </CardHeader>
            <CardContent>
              {tasks.top3.length ? (
                <TaskList tasks={tasks.top3} />
              ) : (
                <p className="text-sm text-muted-foreground">Pin up to three tasks with the ☆ to make them today&apos;s priorities.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/calendar">Calendar</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <Timeline items={d.timeline} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Due today</CardTitle>
              <Badge variant="outline">{tasks.dueToday.length}</Badge>
            </CardHeader>
            <CardContent>
              <TaskList tasks={tasks.dueToday} emptyTitle="Nothing else due today" />
            </CardContent>
          </Card>

          {tasks.overdue.length > 0 && (
            <Card className="border-red-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="size-4" /> Overdue
                </CardTitle>
                <RollOverButton ids={tasks.overdue.map((t) => t.id)} to={d.date} />
              </CardHeader>
              <CardContent>
                <TaskList tasks={tasks.overdue} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <WeatherCard weather={d.weather} />

          {d.business && (
            <Card>
              <CardHeader>
                <CardTitle>Rapid Window Cleaning</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/business">Open</Link>
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-display text-xl">{formatUsd(d.business.revenue.today)}</p>
                  <p className="text-[11px] text-muted-foreground">today</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-display text-xl">{d.business.jobs.today.length}</p>
                  <p className="text-[11px] text-muted-foreground">jobs</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-display text-xl text-brand-cyan">{d.business.leads.new24h}</p>
                  <p className="text-[11px] text-muted-foreground">new leads</p>
                </div>
              </CardContent>
            </Card>
          )}

          {(d.headsUp.bills.length > 0 || d.headsUp.followUps.length > 0 || d.headsUp.birthdays.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Heads up</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm" data-testid="heads-up">
                {d.headsUp.bills.map((b) => (
                  <Link key={`${b.id}-${b.due}`} href="/money" className="flex justify-between gap-2 hover:underline">
                    <span>💵 {b.name}{b.autopay ? " (autopay)" : ""}</span>
                    <span className="text-muted-foreground">
                      {formatUsd(b.amount)} · {relativeDayLabel(b.due)}
                    </span>
                  </Link>
                ))}
                {d.headsUp.followUps.map((p) => (
                  <Link key={p.id} href={`/people?person=${p.id}`} className="block hover:underline">
                    👋 Follow up with {p.name}
                  </Link>
                ))}
                {d.headsUp.birthdays.map((b) => (
                  <p key={b.name}>
                    🎂 {b.name}&apos;s birthday {b.inDays === 0 ? "today" : `in ${b.inDays} day${b.inDays === 1 ? "" : "s"}`}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="size-4" /> Inbox
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/inbox">Open</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-display text-2xl">{d.inbox.unread}</p>
                  <p className="text-xs text-muted-foreground">unread</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-display text-2xl text-brand-cyan">{d.inbox.needsReply}</p>
                  <p className="text-xs text-muted-foreground">need a reply</p>
                </div>
              </div>
              {d.inbox.highPriority.map((m) => (
                <Link key={m.id} href={`/inbox?thread=${m.id}`} className="flex gap-2 rounded-md p-1.5 hover:bg-accent/40">
                  <Mail className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.subject}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.from}
                      {m.summary ? ` · ${m.summary}` : ""}
                    </span>
                  </span>
                </Link>
              ))}
              {d.inbox.unread === 0 && d.inbox.needsReply === 0 && <p className="text-xs text-muted-foreground">All caught up.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Habits</CardTitle>
            </CardHeader>
            <CardContent>
              <HabitCheckins habits={d.habits} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Routines</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/routines">Edit</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <ChecklistGroup checklists={d.checklists} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
