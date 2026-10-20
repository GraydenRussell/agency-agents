import { redirect } from "next/navigation";

/** Moved to its own sidebar section. */
export default function OldDashboardTab() {
  redirect("/dashboard");
}
