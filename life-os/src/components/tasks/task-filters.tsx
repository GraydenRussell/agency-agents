"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Columns3, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AREAS, AREA_META } from "@/lib/labels";

export function TaskFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set("q", q || null);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on q only
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="pl-8" aria-label="Search tasks" />
      </div>
      <NativeSelect className="w-auto" aria-label="Area" value={params.get("area") ?? ""} onChange={(e) => set("area", e.target.value || null)}>
        <option value="">All areas</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {AREA_META[a].label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className="w-auto" aria-label="Due" value={params.get("due") ?? ""} onChange={(e) => set("due", e.target.value || null)}>
        <option value="">Any due date</option>
        <option value="today">Due today</option>
        <option value="overdue">Overdue</option>
        <option value="week">Next 7 days</option>
        <option value="none">No due date</option>
      </NativeSelect>
      <NativeSelect className="w-auto" aria-label="Priority" value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value || null)}>
        <option value="">Any priority</option>
        {[1, 2, 3, 4].map((p) => (
          <option key={p} value={p}>
            P{p}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className="w-auto" aria-label="Status" value={params.get("status") ?? (params.get("view") === "board" ? "ALL" : "OPEN")} onChange={(e) => set("status", e.target.value)}>
        <option value="OPEN">Open</option>
        <option value="DONE">Done</option>
        <option value="ALL">All</option>
      </NativeSelect>
      <Tabs value={params.get("view") ?? "list"} onValueChange={(v) => set("view", v === "list" ? null : v)}>
        <TabsList>
          <TabsTrigger value="list" aria-label="List view">
            <List className="size-4" /> List
          </TabsTrigger>
          <TabsTrigger value="board" aria-label="Board view">
            <Columns3 className="size-4" /> Board
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
