import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Inbox" };

export default function Page() {
  return <PhasePlaceholder title="Inbox" phase={4} description="Gmail with AI triage and drafted replies." />;
}
