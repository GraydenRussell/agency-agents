import { PhasePlaceholder } from "@/components/shell/phase-placeholder";

export const metadata = { title: "Assistant" };

export default function Page() {
  return <PhasePlaceholder title="Assistant" phase={5} description="Full-page assistant chat with tools and memory." />;
}
