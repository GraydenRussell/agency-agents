"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import { Bot, CheckSquare, FileText, FolderGit2, Keyboard, LogOut, Mail, Moon, Plus, Search, User, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV } from "@/lib/nav";
import { useShell } from "./shell-context";
import { searchEverything, type SearchHit } from "@/app/(app)/search-actions";

const HIT_ICON: Record<SearchHit["type"], React.ComponentType<{ className?: string }>> = {
  task: CheckSquare,
  note: FileText,
  person: User,
  project: FolderGit2,
  email: Mail,
};

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen, openCapture } = useShell();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => setHits(await searchEverything(q)));
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  const visibleHits = query.trim().length >= 2 ? hits : [];
  const onOpenChange = (v: boolean) => {
    if (!v) {
      setQuery("");
      setHits([]);
    }
    setOpen("palette", v);
  };

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog open={open.palette} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command label="Command palette" shouldFilter className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Type a command, search, or capture…"
              className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            {pending && <span className="text-xs text-muted-foreground">searching…</span>}
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-1 pb-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </Command.Empty>

            {visibleHits.length > 0 && (
              <Command.Group heading="Results" forceMount>
                {visibleHits.map((h) => (
                  <Item key={`${h.type}-${h.id}`} value={`${h.type} ${h.title} ${h.id}`} icon={HIT_ICON[h.type]} hint={h.subtitle} onSelect={() => run(() => router.push(h.href))} forceMount>
                    {h.title}
                  </Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Create">
              <Item value="new task quick capture" icon={Plus} shortcut="C" onSelect={() => run(() => openCapture())}>
                Quick capture
              </Item>
              <Item value="ask assistant chat" icon={Bot} shortcut="⌘J" onSelect={() => run(() => setOpen("assistant", true))}>
                Ask the assistant
              </Item>
            </Command.Group>

            <Command.Group heading="Go to">
              {NAV.map((n) => (
                <Item key={n.href} value={`go ${n.label}`} icon={n.icon} shortcut={n.chord ? `G ${n.chord.toUpperCase()}` : undefined} onSelect={() => run(() => router.push(n.href))}>
                  {n.label}
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading="App">
              <Item value="toggle theme dark light" icon={Moon} onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
                Toggle {resolvedTheme === "dark" ? "light" : "dark"} mode
              </Item>
              <Item value="keyboard shortcuts help" icon={Keyboard} shortcut="?" onSelect={() => run(() => setOpen("shortcuts", true))}>
                Keyboard shortcuts
              </Item>
              <Item
                value="sign out logout"
                icon={LogOut}
                onSelect={() =>
                  run(() => {
                    void fetch("/auth/signout", { method: "POST" }).then(() => router.push("/login"));
                  })
                }
              >
                Sign out
              </Item>
            </Command.Group>
            {/* Always available, but force-mounted with a non-matching value so real matches rank first. */}
            {query.trim() && (
              <Command.Group heading="Capture" forceMount>
                <Item value="__capture__" icon={Zap} forceMount onSelect={() => run(() => openCapture(query))}>
                  Capture “{query}”
                </Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Item({
  children,
  icon: Icon,
  shortcut,
  hint,
  ...props
}: React.ComponentProps<typeof Command.Item> & { icon: React.ComponentType<{ className?: string }>; shortcut?: string; hint?: string }) {
  return (
    <Command.Item
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
      {...props}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      {shortcut && <kbd>{shortcut}</kbd>}
    </Command.Item>
  );
}
