"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Panel = "palette" | "capture" | "assistant" | "shortcuts";

type ShellState = {
  open: Record<Panel, boolean>;
  setOpen: (panel: Panel, value: boolean) => void;
  toggle: (panel: Panel) => void;
  captureDefault: string;
  openCapture: (text?: string) => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = useState<Record<Panel, boolean>>({
    palette: false,
    capture: false,
    assistant: false,
    shortcuts: false,
  });
  const [captureDefault, setCaptureDefault] = useState("");

  const setOpen = useCallback((panel: Panel, value: boolean) => {
    setOpenState((s) => ({ ...s, [panel]: value }));
  }, []);
  const toggle = useCallback((panel: Panel) => {
    setOpenState((s) => ({ ...s, [panel]: !s[panel] }));
  }, []);
  const openCapture = useCallback((text = "") => {
    setCaptureDefault(text);
    setOpenState((s) => ({ ...s, palette: false, capture: true }));
  }, []);

  const value = useMemo(() => ({ open, setOpen, toggle, captureDefault, openCapture }), [open, setOpen, toggle, captureDefault, openCapture]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside ShellProvider");
  return ctx;
}
