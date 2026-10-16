import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Goals" };

export default function Page() {
  return <PhasePlaceholder title="Goals" phase={2} description="Yearly, quarterly, and weekly goals with progress." />;
}
