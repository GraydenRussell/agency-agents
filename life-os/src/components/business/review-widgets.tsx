"use client";
import { useState } from "react";
import { RefreshCw, Send, SkipForward, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { postReviewReplyAction, redraftReviewAction, saveReviewLinkAction, sendReviewRequestAction, skipReviewRequestAction, syncReviewsAction } from "@/app/(app)/business/actions";
import { cn } from "@/lib/utils";

export function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("text-amber-400 tracking-tight", className)} aria-label={`${n} out of 5 stars`} role="img">
      {"★".repeat(n)}
      <span className="text-muted-foreground/40">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function ReviewLinkForm({ link }: { link: string }) {
  const { pending, run } = useAction();
  const [v, setV] = useState(link);
  return (
    <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); run(() => saveReviewLinkAction(v), { success: "Review link saved" }); }}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="review-link">Your Google review link</Label>
        <Input id="review-link" type="url" placeholder="https://g.page/r/…/review" value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>Save link</Button>
    </form>
  );
}

export function RequestActions({ id, name, canSend }: { id: string; name: string; canSend: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-1">
      <Button size="sm" disabled={pending || !canSend} onClick={() => run(() => sendReviewRequestAction(id), { success: (m) => m })} aria-label={`Send review request to ${name}`}><Send /> Send</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => skipReviewRequestAction(id), { success: `Skipped ${name}` })} aria-label={`Skip review request for ${name}`}><SkipForward /></Button>
    </div>
  );
}

export function ReplyEditor({ id, author, draft }: { id: string; author: string; draft: string }) {
  const { pending, run } = useAction();
  const [text, setText] = useState(draft);
  return (
    <div className="mt-3 space-y-2">
      <Label htmlFor={`reply-${id}`} className="text-xs text-muted-foreground">Reply to {author} (public on Google)</Label>
      <Textarea id={`reply-${id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => redraftReviewAction(id), { success: "New draft ready", onSuccess: (d) => setText(d) })}><Sparkles /> Redraft</Button>
        <Button size="sm" disabled={pending || !text.trim()} onClick={() => run(() => postReviewReplyAction(id, text), { success: (m) => m })}><Send /> Post reply</Button>
      </div>
    </div>
  );
}

export function SyncReviewsButton() {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(() => syncReviewsAction(), { success: (m) => m })}>
      <RefreshCw className={cn(pending && "animate-spin")} /> Check for new reviews
    </Button>
  );
}
