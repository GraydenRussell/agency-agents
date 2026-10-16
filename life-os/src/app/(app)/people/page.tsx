import { PageHeader } from "@/components/shell/page-header";
import { PeopleBoard } from "@/components/life/people-board";
import { dueFollowUps, listPeople } from "@/lib/services/people";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const [people, due] = await Promise.all([listPeople(), dueFollowUps()]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <>
      <PageHeader title="People" description={`${people.length} people · ${due.length} follow-up${due.length === 1 ? "" : "s"} due`} />
      <PeopleBoard people={people.map((p) => ({ ...p, lastContactedAt: iso(p.lastContactedAt), nextFollowUpAt: iso(p.nextFollowUpAt), interactions: p.interactions.map((i) => ({ ...i, date: i.date.toISOString() })) }))} />
    </>
  );
}
