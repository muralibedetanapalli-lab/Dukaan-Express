import { PageHeader } from "@/components/shared/misc";
import { InventoryForm } from "../inventory-form";

export const metadata = { title: "Add product" };

export default function NewInventoryPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/shop/inventory", label: "Inventory" }} title="Add product" />
      <InventoryForm />
    </div>
  );
}
