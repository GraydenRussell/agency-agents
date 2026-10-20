import { PageHeader } from "@/components/shell/page-header";
import { DashboardFrame } from "@/components/business/dashboard-frame";
import { getSetting } from "@/lib/services/settings";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const url = await getSetting("business.dashboardUrl");
  return (
    <>
      <PageHeader title="Dashboard" description="Your Rapid Window Cleaning dashboard, right here in Life OS." />
      <DashboardFrame url={url} />
    </>
  );
}
