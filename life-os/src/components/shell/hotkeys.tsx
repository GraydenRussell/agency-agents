"use client";
import { useEffect, useLayoutEffect, useRef } from "react";

export type Hotkey = {
  /** "mod+k", "?", "c", or a chord "g t" (space separated). */
  combo: string;
  handler: (e: KeyboardEvent) => void;
  /** Fire even while focus is in a text field (only sensible for mod+ combos). */
  allowInInputs?: boolean;
};

const CHORD_TIMEOUT_MS = 1200;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function normalize(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && e.key.length > 1) parts.push("shift");
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
  return parts.join("+");
}

/** Matches a keydown against a combo given the pending chord prefix. Exported for tests. */
export function matchCombo(combo: string, pressed: string, pending: string | null): "match" | "prefix" | null {
  const steps = combo.split(" ");
  if (steps.length === 1) return !pending && (steps[0] === pressed || (combo === "?" && pressed === "?")) ? "match" : null;
  if (pending === null) return steps[0] === pressed ? "prefix" : null;
  return steps[0] === pending && steps[1] === pressed ? "match" : null;
}

export function useHotkeys(hotkeys: Hotkey[]) {
  const ref = useRef(hotkeys);
  useLayoutEffect(() => {
    ref.current = hotkeys;
  });

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const pressed = normalize(e);
      const typing = isTypingTarget(e.target);
      let sawPrefix = false;
      for (const hk of ref.current) {
        if (typing && !hk.allowInInputs) continue;
        const result = matchCombo(hk.combo, pressed, pending);
        if (result === "match") {
          e.preventDefault();
          pending = null;
          clearTimeout(timer);
          hk.handler(e);
          return;
        }
        if (result === "prefix") sawPrefix = true;
      }
      if (sawPrefix) {
        pending = pressed;
        clearTimeout(timer);
        timer = setTimeout(() => (pending = null), CHORD_TIMEOUT_MS);
      } else {
        pending = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, []);
}
