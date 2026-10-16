import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Health" };

export default function Page() {
  return <PhasePlaceholder title="Health" phase={9} description="Workouts, sleep, water, and habit streaks." />;
}
