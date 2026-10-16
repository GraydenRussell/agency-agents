"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/utils";
import { deleteNoteAction, updateNoteAction } from "@/app/(app)/notes/actions";
import { useAutosave } from "./use-autosave";

function parseTagInput(raw: string) {
  return Array.from(new Set(raw.split(/[,\s#]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
}

export function NoteEditor({ note }: { note: { id: string; title: string; body: string; tags: string[]; pinned: boolean } }) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [pinned, setPinned] = useState(note.pinned);
  const { run } = useAction();
  const status = useAutosave({ title, body, tags }, (v) => updateNoteAction(note.id, { title: v.title.trim() || "Untitled", body: v.body, tags: parseTagInput(v.tags) }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input aria-label="Note title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-auto flex-1 border-transparent px-0 font-heading text-4xl tracking-wide shadow-none focus-visible:border-transparent focus-visible:ring-0" />
        <Button variant="ghost" size="icon" aria-label={pinned ? "Unpin" : "Pin"} onClick={() => { setPinned(!pinned); run(() => updateNoteAction(note.id, { pinned: !pinned })); }}>
          <Pin className={cn(pinned && "fill-current text-amber-400")} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Delete note" className="text-red-400" onClick={() => confirm("Delete this note?") && run(() => deleteNoteAction(note.id), { success: "Note deleted", onSuccess: () => router.push("/notes") })}>
          <Trash2 />
        </Button>
      </div>
      <Input aria-label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma separated" className="text-sm" />
      <Textarea aria-label="Note body" value={body} onChange={(e) => setBody(e.target.value)} rows={20} className="min-h-[50dvh] font-mono text-sm leading-relaxed" placeholder="Write in Markdown…" />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Will retry on next edit." : "Autosaves as you type"}
      </p>
    </div>
  );
}
