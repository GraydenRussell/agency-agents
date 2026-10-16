import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Today" };

export default function Page() {
  return <PhasePlaceholder title="Today" phase={2} description="Your schedule, priorities, inbox summary, habits, and weather." />;
}
