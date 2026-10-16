"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Maximize2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useShell } from "@/components/shell/shell-context";
import { latestConversationAction } from "@/app/(app)/assistant/actions";
import { ChatView, type ChatItem } from "./chat-view";

export function AssistantPanel() {
  const { open, setOpen } = useShell();
  const [state, setState] = useState<{ id: string | null; items: ChatItem[]; key: number } | null>(null);

  useEffect(() => {
    if (!open.assistant || state) return;
    let cancelled = false;
    latestConversationAction().then((r) => {
      if (cancelled) return;
      setState(r.ok && r.data ? { id: r.data.id, items: r.data.items as ChatItem[], key: Date.now() } : { id: null, items: [], key: Date.now() });
    });
    return () => {
      cancelled = true;
    };
  }, [open.assistant, state]);

  return (
    <Sheet open={open.assistant} onOpenChange={(v) => setOpen("assistant", v)}>
      <SheetContent className="flex flex-col gap-3 p-4 sm:max-w-lg">
        <div className="flex items-center gap-2 pr-8">
          <SheetTitle className="flex flex-1 items-center gap-2 font-heading text-3xl tracking-wider">
            <Bot className="size-6 text-brand-cyan" /> Assistant
          </SheetTitle>
          <SheetDescription className="sr-only">Chat with your assistant</SheetDescription>
          <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={() => setState({ id: null, items: [], key: Date.now() })}>
            <Plus />
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Open full page">
            <Link href={state?.id ? `/assistant?c=${state.id}` : "/assistant"} onClick={() => setOpen("assistant", false)}>
              <Maximize2 />
            </Link>
          </Button>
        </div>
        {state ? <ChatView key={state.key} compact initialConversationId={state.id} initialItems={state.items} onConversation={(id) => setState((s) => (s ? { ...s, id } : s))} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </SheetContent>
    </Sheet>
  );
}
