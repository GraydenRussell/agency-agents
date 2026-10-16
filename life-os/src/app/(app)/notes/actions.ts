"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import * as notes from "@/lib/services/notes";

export async function createNoteAndOpen() {
  await requireUser();
  const n = await notes.createNote({ title: "Untitled", body: "", tags: [] });
  revalidatePath("/notes");
  redirect(`/notes/${n.id}`);
}

export async function updateNoteAction(id: string, input: { title?: string; body?: string; tags?: string[]; pinned?: boolean }) {
  return runAction(async () => {
    await notes.updateNote(id, input);
    revalidatePath("/notes");
    return undefined;
  });
}

export async function deleteNoteAction(id: string) {
  return runAction(async () => {
    await notes.deleteNote(id);
    revalidatePath("/notes");
    return undefined;
  });
}

export async function saveJournalAction(date: string, body: string) {
  return runAction(async () => {
    await notes.saveJournal(date, body);
    revalidatePath("/notes");
    return undefined;
  });
}
