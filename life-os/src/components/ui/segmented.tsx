"use client";
import { cn } from "@/lib/utils";

/** Accessible button group for view switches (Radix Tabs requires matching panels; these are just toggles). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode; ariaLabel?: string }>; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.value)}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring", value === o.value && "bg-background text-foreground shadow-sm")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
