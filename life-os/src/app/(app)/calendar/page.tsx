import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Calendar" };

export default function Page() {
  return <PhasePlaceholder title="Calendar" phase={3} description="Day/week/month views with two-way Google Calendar sync." />;
}
