import { BusinessTabs } from "@/components/business/business-tabs";

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BusinessTabs />
      {children}
    </>
  );
}
