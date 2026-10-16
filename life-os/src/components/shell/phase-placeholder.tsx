import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "./page-header";

/** Honest placeholder for modules scheduled in a later build phase (see PLAN.md). */
export function PhasePlaceholder({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={Construction} title={`Arrives in Phase ${phase}`} description={description} />
    </>
  );
}
