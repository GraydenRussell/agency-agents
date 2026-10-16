import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NoteEditor } from "@/components/notes/note-editor";
import { getNote } from "@/lib/services/notes";

export const metadata = { title: "Note" };

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={note.isJournal ? "/notes?tab=journal" : "/notes"} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {note.isJournal ? "Journal" : "Notes"}
      </Link>
      <NoteEditor note={note} />
    </div>
  );
}
