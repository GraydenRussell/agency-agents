import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { PricingForm } from "@/components/business/pricing-form";
import { getSetting } from "@/lib/services/settings";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const [rules, profile] = await Promise.all([getSetting("business.pricing"), getSetting("business.profile")]);
  return (
    <>
      <Link href="/business/quotes" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Quotes
      </Link>
      <PageHeader title="Pricing" description="New quotes use these prices. Quotes you already made keep the prices they were made with." />
      <PricingForm rules={rules} profile={profile} />
    </>
  );
}
