import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Settings" };

export default function Page() {
  return <PhasePlaceholder title="Settings" phase={5} description="Integrations, auto-approve policies, spend cap, notifications." />;
}
