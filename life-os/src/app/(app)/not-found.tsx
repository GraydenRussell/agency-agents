import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <EmptyState
      title="Not found"
      description="That page or item doesn't exist (or was deleted)."
      action={
        <Button asChild variant="outline">
          <Link href="/today">Back to Today</Link>
        </Button>
      }
    />
  );
}
