"use client";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { saveJournalAction } from "@/app/(app)/notes/actions";
import { useAutosave } from "./use-autosave";

export function JournalEditor({ date, prompt, initial }: { date: string; prompt: string; initial: string }) {
  const [body, setBody] = useState(initial);
  const status = useAutosave(body, (v) => saveJournalAction(date, v));
  return (
    <div className="space-y-2">
      <p className="font-heading text-2xl tracking-wide text-brand-cyan">{prompt}</p>
      <Textarea aria-label="Today's journal" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="A few lines is plenty." />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save" : "Autosaves"}
      </p>
    </div>
  );
}
