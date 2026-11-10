"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/misc";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description={`We couldn't load this page. ${error.digest ? `(ref ${error.digest})` : ""}`}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
