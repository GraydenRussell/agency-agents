import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ChatView } from "@/components/assistant/chat-view";
import { aiConfigured, spentToday } from "@/lib/ai/client";
import { conversationView, recentConversations } from "@/lib/assistant/view";
import { getSetting } from "@/lib/services/settings";
import { formatDateTime } from "@/lib/time";
import { cn, formatUsd } from "@/lib/utils";

export const metadata = { title: "Assistant" };

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const sp = await searchParams;
  const id = typeof sp.c === "string" ? sp.c : null;
  const [conversations, items, spent, cap] = await Promise.all([recentConversations(), id ? conversationView(id) : Promise.resolve([]), spentToday(), getSetting("ai.dailySpendCapUsd")]);
  return (
    <>
      <PageHeader
        title="Assistant"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {aiConfigured() ? <Badge variant="success">Claude connected</Badge> : <Badge variant="warning">Offline demo mode</Badge>}
            <span>
              Today: {formatUsd(spent, { cents: true })} of {formatUsd(cap, { cents: true })} cap
            </span>
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/assistant">
              <MessageSquarePlus /> New chat
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Conversations" className="hidden space-y-1 lg:block">
          {conversations.length === 0 && <p className="text-sm text-muted-foreground">No conversations yet.</p>}
          {conversations.map((c) => (
            <Link key={c.id} href={`/assistant?c=${c.id}`} className={cn("block rounded-md px-2 py-1.5 text-sm hover:bg-accent/50", c.id === id && "bg-accent")}>
              <span className="block truncate">{c.title ?? "Untitled"}</span>
              <span className="text-[11px] text-muted-foreground">{formatDateTime(c.updatedAt)}</span>
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          <ChatView key={id ?? "new"} initialConversationId={id} initialItems={items} />
        </div>
      </div>
    </>
  );
}
