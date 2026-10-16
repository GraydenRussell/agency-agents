import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { BarChart } from "@/components/charts/bar-chart";
import { DeleteWorkoutButton, SleepQuick, WaterQuick, WorkoutForm } from "@/components/life/health-forms";
import { HabitCheckins } from "@/components/today/habit-checkins";
import { habitsWithStatus } from "@/lib/services/habits";
import { healthSummary, SLEEP_TARGET_H, WATER_TARGET_OZ } from "@/lib/services/health";
import { formatLocalDate, relativeDayLabel, today } from "@/lib/time";

export const metadata = { title: "Health" };

export default async function HealthPage() {
  const t = today();
  const [s, habits] = await Promise.all([healthSummary(14, t), habitsWithStatus(t)]);
  const lastNight = s.sleep[s.sleep.length - 1];
  return (
    <>
      <PageHeader
        title="Health"
        description={`Avg sleep ${s.avgSleep ? s.avgSleep.toFixed(1) : "–"} h (14 days) · ${s.workoutsThisWeek} workouts this week · ${s.waterToday} oz water today`}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Water today</CardTitle>
          </CardHeader>
          <CardContent>
            <WaterQuick date={t} ounces={s.waterToday} target={WATER_TARGET_OZ} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sleep</CardTitle>
          </CardHeader>
          <CardContent>
            <SleepQuick date={t} hours={lastNight?.hours ?? null} quality={lastNight?.quality ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Habits</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/routines">Edit</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <HabitCheckins habits={habits} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sleep, last 14 days (hours)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart ariaLabel="Hours of sleep per night, last 14 days" unit="h" target={SLEEP_TARGET_H} targetLabel={`${SLEEP_TARGET_H} h goal`} data={s.sleep.map((d) => ({ key: d.date, label: formatLocalDate(d.date), value: d.hours, display: d.hours === null ? "not logged" : `${d.hours} h` }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Water, last 14 days (oz)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart ariaLabel="Ounces of water per day, last 14 days" unit="oz" target={WATER_TARGET_OZ} targetLabel={`${WATER_TARGET_OZ} oz goal`} data={s.water.map((d) => ({ key: d.date, label: formatLocalDate(d.date), value: d.ounces, display: `${d.ounces} oz` }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workout minutes per week</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart ariaLabel="Workout minutes per week, last 8 weeks" unit="min" target={150} targetLabel="150 min" data={s.weekly.map((w) => ({ key: w.week, label: `wk ${formatLocalDate(w.week)}`, value: w.minutes, display: `${w.minutes} min` }))} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="size-4" /> Workouts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkoutForm date={t} />
            {s.recentWorkouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="workout-list">
                {s.recentWorkouts.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{relativeDayLabel(w.date)}</span>
                    <span className="flex-1">
                      {w.type} · {w.durationMin} min{w.intensity ? ` · intensity ${w.intensity}` : ""}
                      {w.notes && <span className="block text-xs text-muted-foreground">{w.notes}</span>}
                    </span>
                    <DeleteWorkoutButton id={w.id} />
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
