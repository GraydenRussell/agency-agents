"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as people from "@/lib/services/people";
import { createReminder } from "@/lib/services/reminders";

const done = <T,>(fn: () => Promise<T>) =>
  runAction(async () => {
    const r = await fn();
    revalidatePath("/people");
    revalidatePath("/today");
    return r;
  });

export async function createPersonAction(input: people.PersonInput) {
  return done(async () => (await people.createPerson(input)).id);
}
export async function updatePersonAction(id: string, input: Partial<people.PersonInput>) {
  return done(async () => void (await people.updatePerson(id, input)));
}
export async function deletePersonAction(id: string) {
  return done(async () => void (await people.deletePerson(id)));
}
export async function logInteractionAction(personId: string, channel: string, summary: string) {
  return done(async () => void (await people.logInteraction(personId, { channel, summary })));
}
export async function remindFollowUpAction(personId: string, atIso: string) {
  return done(async () => {
    const { db } = await import("@/lib/db");
    const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
    await createReminder({ title: `Follow up with ${p.name}`, body: p.notes?.slice(0, 200) ?? null, fireAt: atIso, channels: ["PUSH"], linkedType: "person", linkedId: p.id });
    return p.name;
  });
}
