import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Approvals" };

export default function Page() {
  return <PhasePlaceholder title="Approvals" phase={5} description="Actions waiting for your one-tap approval." />;
}
