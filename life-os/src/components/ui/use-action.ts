"use client";
import { useTransition } from "react";
import { toast } from "sonner";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a server action in a transition and toasts errors (and optional success). */
export function useAction() {
  const [pending, start] = useTransition();
  function run<T>(fn: () => Promise<Result<T>>, opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void } = {}) {
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(res.data) : opts.success);
        opts.onSuccess?.(res.data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }
  return { pending, run };
}
