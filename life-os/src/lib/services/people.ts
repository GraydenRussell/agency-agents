import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { endOfLocalDay, today, type LocalDate } from "@/lib/time";

export const personSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relation: z.string().max(60).nullish(),
  company: z.string().max(120).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.string().email().nullish().or(z.literal("").transform(() => null)),
  notes: z.string().max(10_000).nullish(),
  birthday: z.string().regex(/^\d{2}-\d{2}$/, "Birthday as MM-DD").nullish().or(z.literal("").transform(() => null)),
  followUpDays: z.coerce.number().int().min(1).max(365).nullish(),
});
export type PersonInput = z.input<typeof personSchema>;

const DAY = 86_400_000;

export async function listPeople(q?: string) {
  const contains = q?.trim() ? { contains: q.trim(), mode: "insensitive" as const } : undefined;
  return db.person.findMany({
    where: contains ? { OR: [{ name: contains }, { company: contains }, { notes: contains }, { relation: contains }] } : {},
    orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    include: { interactions: { orderBy: { date: "desc" }, take: 5 } },
  });
}

export async function createPerson(input: PersonInput) {
  const d = personSchema.parse(input);
  return db.person.create({ data: { ...d, nextFollowUpAt: d.followUpDays ? new Date(Date.now() + d.followUpDays * DAY) : null } });
}

export async function updatePerson(id: string, input: Partial<PersonInput>) {
  const d = personSchema.partial().parse(input);
  const p = await db.person.findUniqueOrThrow({ where: { id } });
  const followUpDays = d.followUpDays === undefined ? p.followUpDays : d.followUpDays;
  const base = p.lastContactedAt ?? new Date();
  return db.person.update({ where: { id }, data: { ...d, nextFollowUpAt: followUpDays ? new Date(base.getTime() + followUpDays * DAY) : null } });
}

export async function deletePerson(id: string) {
  return db.person.delete({ where: { id } });
}

/** Logs a touchpoint; resets the follow-up clock. */
export async function logInteraction(personId: string, input: { channel: string; summary: string; date?: Date }) {
  const date = input.date ?? new Date();
  const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
  await db.interaction.create({ data: { personId, channel: input.channel.slice(0, 30), summary: input.summary.slice(0, 2000), date } });
  return db.person.update({ where: { id: personId }, data: { lastContactedAt: date, nextFollowUpAt: p.followUpDays ? new Date(date.getTime() + p.followUpDays * DAY) : null } });
}

export async function dueFollowUps(date: LocalDate = today()) {
  return db.person.findMany({ where: { nextFollowUpAt: { lt: endOfLocalDay(date) } }, orderBy: { nextFollowUpAt: "asc" }, take: 20 });
}

/** Pure: birthdays (MM-DD) falling within the next `days` days. */
export function upcomingBirthdays(people: Array<{ name: string; birthday: string | null }>, from: LocalDate, days = 14) {
  const out: Array<{ name: string; date: string; inDays: number }> = [];
  const start = new Date(`${from}T12:00:00Z`).getTime();
  for (const p of people) {
    if (!p.birthday) continue;
    for (const y of [Number(from.slice(0, 4)), Number(from.slice(0, 4)) + 1]) {
      const t = new Date(`${y}-${p.birthday}T12:00:00Z`).getTime();
      const diff = Math.round((t - start) / DAY);
      if (diff >= 0 && diff <= days) {
        out.push({ name: p.name, date: `${y}-${p.birthday}`, inDays: diff });
        break;
      }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}
