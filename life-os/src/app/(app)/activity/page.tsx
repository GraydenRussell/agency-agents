import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Activity Log" };

export default function Page() {
  return <PhasePlaceholder title="Activity Log" phase={5} description="Everything the assistant and automations did, with undo." />;
}
