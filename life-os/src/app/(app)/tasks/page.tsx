import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Tasks" };

export default function Page() {
  return <PhasePlaceholder title="Tasks" phase={2} description="Tasks with list and kanban views, subtasks, and recurrence." />;
}
