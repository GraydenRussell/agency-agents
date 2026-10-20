import { PageHeader } from "@/components/shell/page-header";
import { DashboardFrame } from "@/components/business/dashboard-frame";
import { getSetting } from "@/lib/services/settings";

export const metadata = { title: "Rapid Dashboard" };

export default async function RapidDashboardPage() {
  const url = await getSetting("business.dashboardUrl");
  return (
    <>
      <PageHeader title="Rapid Dashboard" description="Everything on your Rapid Window Cleaning dashboard, in its own space. Full screen hides Life OS entirely." />
      <DashboardFrame url={url} />
    </>
  );
}
