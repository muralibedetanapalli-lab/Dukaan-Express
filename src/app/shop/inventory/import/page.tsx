import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/misc";
import { ImportClient } from "./import-client";

export const metadata = { title: "Excel upload" };

export default function InventoryImportPage() {
  return (
    <div>
      <PageHeader
        title="Update inventory with Excel"
        description="Change prices and stock, or add many products at once."
        actions={
          <Button asChild variant="ghost">
            <Link href="/shop/inventory">
              <ArrowLeft /> Inventory
            </Link>
          </Button>
        }
      />
      <ImportClient />
    </div>
  );
}
