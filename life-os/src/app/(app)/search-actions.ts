"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export type SearchHit = {
  type: "task" | "note" | "person" | "project";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

export async function searchEverything(query: string): Promise<SearchHit[]> {
  await requireUser();
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const [tasks, notes, people, projects] = await Promise.all([
    db.task.findMany({ where: { deletedAt: null, OR: [{ title: contains }, { notes: contains }] }, take: 6, orderBy: { updatedAt: "desc" } }),
    db.note.findMany({ where: { OR: [{ title: contains }, { body: contains }] }, take: 6, orderBy: { updatedAt: "desc" } }),
    db.person.findMany({ where: { OR: [{ name: contains }, { company: contains }, { notes: contains }] }, take: 4 }),
    db.project.findMany({ where: { OR: [{ name: contains }, { description: contains }] }, take: 4 }),
  ]);
  return [
    ...tasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, subtitle: t.status === "DONE" ? "done" : t.area.toLowerCase(), href: `/tasks?task=${t.id}` })),
    ...notes.map((n) => ({ type: "note" as const, id: n.id, title: n.title, subtitle: n.isJournal ? "journal" : "note", href: `/notes/${n.id}` })),
    ...people.map((p) => ({ type: "person" as const, id: p.id, title: p.name, subtitle: p.relation ?? undefined, href: `/people?person=${p.id}` })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, title: p.name, subtitle: p.status.toLowerCase(), href: `/projects?project=${p.id}` })),
  ];
}
