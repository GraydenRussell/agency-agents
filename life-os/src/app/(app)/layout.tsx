import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ShellProvider } from "@/components/shell/shell-context";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { TopBar } from "@/components/shell/top-bar";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShortcutSheet } from "@/components/shell/shortcut-sheet";
import { GlobalHotkeys } from "@/components/shell/global-hotkeys";
import { QuickCapture } from "@/components/capture/quick-capture";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

export const dynamic = "force-dynamic";

async function navBadges(): Promise<Partial<Record<string, number>>> {
  const [approvals, needsReply] = await Promise.all([
    db.pendingApproval.count({ where: { status: "PENDING" } }),
    db.emailThread.count({ where: { needsReply: true, inInbox: true } }),
  ]);
  return { "/approvals": approvals, "/inbox": needsReply };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const badges = await navBadges();
  return (
    <ShellProvider>
      <div className="flex min-h-dvh">
        <Sidebar badges={badges} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-24 md:px-6 lg:pt-8 lg:pb-10">{children}</main>
        </div>
      </div>
      <MobileNav badges={badges} />
      <CommandPalette />
      <ShortcutSheet />
      <QuickCapture />
      <AssistantPanel />
      <GlobalHotkeys />
    </ShellProvider>
  );
}
