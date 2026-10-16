"use client";
import { useEffect, useRef, useState } from "react";

/** Debounced autosave. Returns a status for the UI. Flushes on unmount. */
export function useAutosave<T>(value: T, save: (v: T) => Promise<{ ok: boolean }>, delay = 700) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const first = useRef(true);
  const latest = useRef(value);
  const dirty = useRef(false);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
    latest.current = value;
  });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    const t = setTimeout(async () => {
      setStatus("saving");
      const r = await saveRef.current(value);
      dirty.current = false;
      setStatus(r.ok ? "saved" : "error");
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  useEffect(
    () => () => {
      if (dirty.current) void saveRef.current(latest.current);
    },
    [],
  );
  return status;
}
