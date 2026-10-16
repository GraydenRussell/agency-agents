"use client";
import { Bot, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShell } from "./shell-context";

export function TopBar() {
  const { setOpen, openCapture } = useShell();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
      <div className="grid size-7 place-items-center rounded-md bg-primary font-display text-white">L</div>
      <span className="font-heading text-xl tracking-wider">Life OS</span>
      <div className="flex-1" />
      <Button variant="ghost" size="icon-sm" aria-label="Search" onClick={() => setOpen("palette", true)}>
        <Search />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Assistant" onClick={() => setOpen("assistant", true)}>
        <Bot />
      </Button>
      <Button size="icon-sm" aria-label="Quick capture" onClick={() => openCapture()}>
        <Plus />
      </Button>
    </header>
  );
}
