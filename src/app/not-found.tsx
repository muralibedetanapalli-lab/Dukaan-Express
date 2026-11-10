import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/misc";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        }
      />
    </div>
  );
}
