import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Note } from "@/generated/prisma/client";
import { isoWeekday, today, type LocalDate } from "@/lib/time";

// No .default() here: in Zod 4, .partial() still applies defaults, which would wipe fields on update.
export const noteUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
  pinned: z.boolean(),
}).partial();
export const noteInputSchema = noteUpdateSchema.required({ title: true });
export type NoteInput = z.input<typeof noteInputSchema>;

export const JOURNAL_PROMPTS = [
  "What's one thing you'd do differently today?",
  "What are you proud of today?",
  "What drained your energy, and what gave you energy?",
  "Who helped you today, and how can you thank them?",
  "What's the one thing that would make tomorrow great?",
  "What did a customer teach you this week?",
  "What are you avoiding, and why?",
] as const;

/** Deterministic daily prompt so it doesn't change on refresh. */
export function journalPromptFor(date: LocalDate): string {
  const n = Number(date.replaceAll("-", ""));
  return JOURNAL_PROMPTS[(n + isoWeekday(date)) % JOURNAL_PROMPTS.length] ?? JOURNAL_PROMPTS[0];
}

export function parseTags(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,\s#]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
}

export async function listNotes(opts: { q?: string; tag?: string; journal?: boolean; limit?: number } = {}): Promise<Note[]> {
  const q = opts.q?.trim();
  if (q) return searchNotes(q, { journal: opts.journal, limit: opts.limit });
  return db.note.findMany({
    where: { isJournal: opts.journal ?? false, ...(opts.tag ? { tags: { has: opts.tag } } : {}) },
    orderBy: opts.journal ? [{ journalDate: "desc" }] : [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: opts.limit ?? 200,
  });
}

/**
 * Full-text search (Postgres websearch syntax: quotes, OR, -exclude) ranked by relevance,
 * falling back to substring match for short/partial words.
 */
export async function searchNotes(q: string, opts: { journal?: boolean; limit?: number } = {}): Promise<Note[]> {
  const limit = opts.limit ?? 50;
  const ids = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Note"
    WHERE (${opts.journal ?? null}::boolean IS NULL OR "isJournal" = ${opts.journal ?? null}::boolean)
      AND to_tsvector('english', title || ' ' || body || ' ' || array_to_string(tags, ' ')) @@ websearch_to_tsquery('english', ${q})
    ORDER BY ts_rank(to_tsvector('english', title || ' ' || body), websearch_to_tsquery('english', ${q})) DESC
    LIMIT ${limit}`;
  const ftsIds = ids.map((r) => r.id);
  const contains = { contains: q, mode: "insensitive" as const };
  const substring = await db.note.findMany({
    where: { id: { notIn: ftsIds }, OR: [{ title: contains }, { body: contains }], ...(opts.journal === undefined ? {} : { isJournal: opts.journal }) },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
  const fts = ftsIds.length ? await db.note.findMany({ where: { id: { in: ftsIds } } }) : [];
  const rank = new Map(ftsIds.map((id, i) => [id, i]));
  fts.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...fts, ...substring].slice(0, limit);
}

export async function getNote(id: string) {
  return db.note.findUnique({ where: { id } });
}

export async function createNote(input: NoteInput) {
  return db.note.create({ data: noteInputSchema.parse(input) });
}

export async function updateNote(id: string, input: Partial<NoteInput>) {
  return db.note.update({ where: { id }, data: noteUpdateSchema.parse(input) });
}

export async function deleteNote(id: string) {
  return db.note.delete({ where: { id } });
}

export async function allTags(): Promise<Array<{ tag: string; count: number }>> {
  const rows = await db.$queryRaw<Array<{ tag: string; count: bigint }>>`
    SELECT unnest(tags) AS tag, count(*) AS count FROM "Note" WHERE "isJournal" = false GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50`;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

/** One journal entry per day; created on first write. */
export async function getJournal(date: LocalDate = today()) {
  return db.note.findFirst({ where: { isJournal: true, journalDate: date } });
}

export async function saveJournal(date: LocalDate, body: string) {
  const existing = await getJournal(date);
  if (existing) return db.note.update({ where: { id: existing.id }, data: { body } });
  return db.note.create({ data: { title: "Journal", body, isJournal: true, journalDate: date, prompt: journalPromptFor(date) } });
}

export async function appendJournal(date: LocalDate, text: string) {
  const existing = await getJournal(date);
  return saveJournal(date, existing?.body ? `${existing.body}\n\n${text}` : text);
}
