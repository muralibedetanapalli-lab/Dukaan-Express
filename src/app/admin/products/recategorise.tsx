"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api-client";

/** Inline category/subcategory editor for the admin product list. */
export function RecategoriseSelect({
  productId,
  categoryId,
  subcategoryId,
  categories,
}: {
  productId: string;
  categoryId: string;
  subcategoryId: string | null;
  categories: { id: string; name: string; subs: { id: string; name: string }[] }[];
}) {
  const router = useRouter();
  const value = subcategoryId ? `${categoryId}:${subcategoryId}` : `${categoryId}:`;
  return (
    <Select
      value={value}
      onValueChange={async (v) => {
        const [cat, sub] = v.split(":");
        try {
          await api(`/admin/products/${productId}`, { method: "PATCH", body: { categoryId: cat, subcategoryId: sub || null } });
          toast.success("Category updated");
          router.refresh();
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }}
    >
      <SelectTrigger size="sm" className="w-48 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {categories.map((c) => (
          <SelectGroup key={c.id}>
            <SelectLabel>{c.name}</SelectLabel>
            <SelectItem value={`${c.id}:`}>{c.name} (no subcategory)</SelectItem>
            {c.subs.map((s) => (
              <SelectItem key={s.id} value={`${c.id}:${s.id}`}>
                {c.name} › {s.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
