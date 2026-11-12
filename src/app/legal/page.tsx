import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { POLICIES } from "./_lib/context";

export const metadata = { title: "Policies" };

export default function LegalIndex() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold sm:text-3xl">Policies</h1>
      <Card className="mt-5 gap-0 divide-y p-0">
        {POLICIES.map((p) => (
          <Link key={p.slug} href={`/legal/${p.slug}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/50">
            <span className="font-medium">{p.title}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
