"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      description={error.message || "An unexpected error occurred while loading this page."}
      action={
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
