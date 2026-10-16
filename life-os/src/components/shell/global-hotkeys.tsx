"use client";
import { useRouter } from "next/navigation";
import { NAV } from "@/lib/nav";
import { useHotkeys, type Hotkey } from "./hotkeys";
import { useShell } from "./shell-context";

export function GlobalHotkeys() {
  const router = useRouter();
  const { toggle, setOpen, openCapture } = useShell();
  const keys: Hotkey[] = [
    { combo: "mod+k", handler: () => toggle("palette"), allowInInputs: true },
    { combo: "mod+j", handler: () => toggle("assistant"), allowInInputs: true },
    { combo: "c", handler: () => openCapture() },
    { combo: "/", handler: () => setOpen("palette", true) },
    { combo: "?", handler: () => setOpen("shortcuts", true) },
    ...NAV.filter((n) => n.chord).map((n) => ({ combo: `g ${n.chord}`, handler: () => router.push(n.href) })),
  ];
  useHotkeys(keys);
  return null;
}
