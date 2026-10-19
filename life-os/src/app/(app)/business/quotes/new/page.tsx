import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { QuoteBuilder } from "@/components/business/quote-builder";
import { db } from "@/lib/db";
import { getQuote } from "@/lib/services/quotes";
import { getSetting } from "@/lib/services/settings";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customer?: string; edit?: string }> }) {
  const { customer, edit } = await searchParams;
  const [rules, c, existing] = await Promise.all([getSetting("business.pricing"), customer ? db.customer.findUnique({ where: { id: customer } }) : null, edit ? getQuote(edit) : null]);
  const editable = existing && (existing.status === "DRAFT" || existing.status === "SENT") ? existing : null;
  const initial = editable
    ? { customerId: editable.customerId, name: editable.name, phone: editable.phone ?? "", email: editable.email ?? "", address: editable.address ?? "", notes: editable.notes ?? "" }
    : { customerId: c?.id ?? null, name: c?.name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", address: c?.address ?? "", notes: "" };
  return (
    <>
      <Link href={editable ? `/business/quotes/${editable.id}` : "/business/quotes"} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {editable ? `Quote #${editable.number}` : "Quotes"}
      </Link>
      <PageHeader title={editable ? `Edit quote #${editable.number}` : "New quote"} description={c ? `For ${c.name}` : "Prices come from your pricing rules; change them under Pricing."} />
      <QuoteBuilder rules={rules} initial={initial} initialInputs={editable?.inputs} quoteId={editable?.id} />
    </>
  );
}
