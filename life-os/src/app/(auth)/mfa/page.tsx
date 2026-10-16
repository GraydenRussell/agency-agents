import { redirect } from "next/navigation";
import { isDevAuth } from "@/lib/auth/config";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Two-factor" };
export const dynamic = "force-dynamic";

export default function MfaPage() {
  if (isDevAuth()) redirect("/today");
  return <MfaForm />;
}
