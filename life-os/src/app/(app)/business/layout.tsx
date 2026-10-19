import { BusinessTabs } from "@/components/business/business-tabs";
import { leadCounts } from "@/lib/services/leads";

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const counts = await leadCounts();
  return (
    <>
      <BusinessTabs unansweredLeads={counts.unanswered} lateLeads={counts.late} />
      {children}
    </>
  );
}
