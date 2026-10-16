import { PageHeader } from "@/components/shell/page-header";
import { RoutinesEditor } from "@/components/routines/routines-editor";
import { db } from "@/lib/db";
import { habitsWithStatus } from "@/lib/services/habits";
import { listTemplates } from "@/lib/services/routines";

export const metadata = { title: "Routines & Habits" };

export default async function RoutinesPage() {
  const [templates, checklists, habits] = await Promise.all([
    listTemplates(),
    db.checklist.findMany({ include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } }),
    habitsWithStatus(),
  ]);
  return (
    <>
      <PageHeader title="Routines & Habits" description="Recurring time blocks show on your Today timeline and calendar. Weekday vs weekend templates apply automatically." />
      <RoutinesEditor templates={templates} checklists={checklists} habits={habits} />
    </>
  );
}
