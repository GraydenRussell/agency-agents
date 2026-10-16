import Link from "next/link";
import { NotebookPen, Pin, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { JournalEditor } from "@/components/notes/journal-editor";
import { allTags, getJournal, journalPromptFor, listNotes } from "@/lib/services/notes";
import { formatLocalDate, today } from "@/lib/time";
import { cn, truncate } from "@/lib/utils";
import { createNoteAndOpen } from "./actions";

export const metadata = { title: "Notes & Journal" };

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const sp = await searchParams;
  const tab = sp.tab === "journal" ? "journal" : "notes";
  const q = typeof sp.q === "string" ? sp.q : "";
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const t = today();

  return (
    <>
      <PageHeader
        title="Notes & Journal"
        actions={
          <form action={createNoteAndOpen}>
            <Button type="submit">
              <Plus /> New note
            </Button>
          </form>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
          {(["notes", "journal"] as const).map((k) => (
            <Link key={k} href={k === "notes" ? "/notes" : "/notes?tab=journal"} className={cn("rounded-md px-3 py-1 capitalize", tab === k ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {k}
            </Link>
          ))}
        </div>
        <form className="min-w-48 flex-1" action="/notes">
          {tab === "journal" && <input type="hidden" name="tab" value="journal" />}
          <Input name="q" defaultValue={q} placeholder={tab === "journal" ? "Search journal" : "Search notes (supports \"phrases\" and -exclude)"} aria-label="Search" />
        </form>
      </div>
      {tab === "notes" ? <NotesTab q={q} tag={tag} /> : <JournalTab q={q} date={t} />}
    </>
  );
}

async function NotesTab({ q, tag }: { q: string; tag?: string }) {
  const [notes, tags] = await Promise.all([listNotes({ q, tag }), allTags()]);
  return (
    <>
      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link href="/notes">
            <Badge variant={tag ? "outline" : "default"}>All</Badge>
          </Link>
          {tags.map((t) => (
            <Link key={t.tag} href={`/notes?tag=${encodeURIComponent(t.tag)}`}>
              <Badge variant={tag === t.tag ? "default" : "outline"}>
                #{t.tag} <span className="text-muted-foreground">{t.count}</span>
              </Badge>
            </Link>
          ))}
        </div>
      )}
      {notes.length === 0 ? (
        <EmptyState icon={NotebookPen} title={q ? "No notes match" : "No notes yet"} description={q ? "Try different words." : "Capture ideas with C or “New note”."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notes.map((n) => (
            <Link key={n.id} href={`/notes/${n.id}`}>
              <Card className="h-full transition-colors hover:border-primary/60">
                <CardContent className="space-y-2 p-4">
                  <p className="flex items-center gap-1.5 font-medium">
                    {n.pinned && <Pin className="size-3.5 fill-current text-amber-400" />}
                    {n.title}
                  </p>
                  <p className="line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{truncate(n.body, 300) || "Empty note"}</p>
                  <div className="flex flex-wrap gap-1">
                    {n.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

async function JournalTab({ q, date }: { q: string; date: string }) {
  const [entry, past] = await Promise.all([getJournal(date), listNotes({ q, journal: true, limit: 60 })]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="p-5">
          <p className="mb-2 text-sm text-muted-foreground">{formatLocalDate(date, { weekday: true })}</p>
          <JournalEditor date={date} prompt={entry?.prompt ?? journalPromptFor(date)} initial={entry?.body ?? ""} />
        </CardContent>
      </Card>
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Past entries</p>
        {past.filter((p) => p.journalDate !== date).length === 0 && <p className="text-sm text-muted-foreground">No past entries{q ? " match" : " yet"}.</p>}
        {past
          .filter((p) => p.journalDate !== date)
          .map((p) => (
            <Link key={p.id} href={`/notes/${p.id}`} className="block rounded-lg border border-border p-3 hover:border-primary/60">
              <p className="text-xs text-muted-foreground">{p.journalDate ? formatLocalDate(p.journalDate, { weekday: true }) : ""}</p>
              {p.prompt && <p className="text-xs text-brand-cyan">{p.prompt}</p>}
              <p className="mt-1 line-clamp-3 text-sm">{p.body}</p>
            </Link>
          ))}
      </div>
    </div>
  );
}
