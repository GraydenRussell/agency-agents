"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useOpenTask() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("task", id);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
}
