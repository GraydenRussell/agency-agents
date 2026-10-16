import type { EmailCategory } from "@/generated/prisma/enums";

export const CATEGORY_META: Record<EmailCategory, { label: string; className: string }> = {
  CUSTOMER: { label: "Customer", className: "bg-sky-500/15 text-sky-400" },
  LEAD: { label: "Lead", className: "bg-emerald-500/15 text-emerald-400" },
  VENDOR: { label: "Vendor", className: "bg-amber-500/15 text-amber-400" },
  PERSONAL: { label: "Personal", className: "bg-violet-500/15 text-violet-400" },
  NEWSLETTER: { label: "Newsletter", className: "bg-muted text-muted-foreground" },
  SPAM: { label: "Spam", className: "bg-red-500/15 text-red-400" },
  OTHER: { label: "Other", className: "bg-muted text-muted-foreground" },
};

export function priorityColor(p: number | null): string {
  if (p === null) return "bg-muted";
  if (p >= 80) return "bg-red-500";
  if (p >= 60) return "bg-amber-400";
  if (p >= 35) return "bg-sky-400";
  return "bg-muted-foreground/40";
}
