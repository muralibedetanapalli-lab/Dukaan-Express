"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUploader } from "@/components/shared/image-uploader";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { ProductThumb } from "@/components/shared/misc";
import { api, errorMessage } from "@/lib/api-client";
import { discountPercent, toPaise } from "@/lib/money";

interface Category {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
}
interface Master {
  id: string;
  name: string;
  brand: string | null;
  unit: string;
  unitValue: number | null;
  images: { url: string }[];
  category: { name: string };
}

export interface InventoryFormValue {
  id?: string;
  productId?: string | null;
  canEditProduct: boolean;
  product: {
    name: string;
    description: string;
    brand: string;
    categoryId: string;
    subcategoryId: string;
    sku: string;
    barcode: string;
    unit: string;
    unitValue: string;
    weightGrams: string;
    lengthCm: string;
    breadthCm: string;
    heightCm: string;
    images: string[];
  };
  variantName: string;
  shopSku: string;
  mrp: string;
  sellingPrice: string;
  stock: string;
  lowStockThreshold: string;
  maxPerOrder: string;
  isAvailable: boolean;
}

const emptyInventory: InventoryFormValue = {
  canEditProduct: true,
  product: { name: "", description: "", brand: "", categoryId: "", subcategoryId: "", sku: "", barcode: "", unit: "pcs", unitValue: "", weightGrams: "500", lengthCm: "15", breadthCm: "10", heightCm: "8", images: [] },
  variantName: "",
  shopSku: "",
  mrp: "",
  sellingPrice: "",
  stock: "10",
  lowStockThreshold: "5",
  maxPerOrder: "10",
  isAvailable: true,
};

export function InventoryForm({ initial = emptyInventory }: { initial?: InventoryFormValue }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mode, setMode] = useState<"existing" | "new">(initial.id ? "new" : "existing");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Master[]>([]);
  const [picked, setPicked] = useState<Master | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = !!initial.id;

  useEffect(() => {
    api<{ categories: Category[] }>("/catalog/categories").then((r) => setCategories(r.categories)).catch(() => {});
  }, []);
  useEffect(() => {
    if (mode !== "existing" || search.trim().length < 2) return;
    const t = setTimeout(() => {
      api<{ products: Master[] }>(`/shop/products/search?q=${encodeURIComponent(search)}`).then((r) => setResults(r.products)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [search, mode]);

  const setP = (k: keyof InventoryFormValue["product"], val: unknown) => setV((p) => ({ ...p, product: { ...p.product, [k]: val } }));
  const set = (k: keyof InventoryFormValue, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const cat = categories.find((c) => c.id === v.product.categoryId);
  const mrpP = toPaise(Number(v.mrp) || 0);
  const priceP = toPaise(Number(v.sellingPrice) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (priceP > mrpP) return toast.error("Selling price cannot exceed MRP");
    setBusy(true);
    try {
      const pricing = {
        mrp: mrpP,
        sellingPrice: priceP,
        stock: Number(v.stock) || 0,
        lowStockThreshold: Number(v.lowStockThreshold) || 0,
        maxPerOrder: Number(v.maxPerOrder) || 1,
        isAvailable: v.isAvailable,
        shopSku: v.shopSku || null,
      };
      const productDetails = {
        name: v.product.name,
        description: v.product.description || null,
        brand: v.product.brand || null,
        barcode: v.product.barcode || null,
        weightGrams: Number(v.product.weightGrams) || 1,
        lengthCm: Number(v.product.lengthCm) || 1,
        breadthCm: Number(v.product.breadthCm) || 1,
        heightCm: Number(v.product.heightCm) || 1,
        images: v.product.images,
      };
      if (editing) {
        await api(`/shop/inventory/${initial.id}`, {
          method: "PATCH",
          body: { ...pricing, ...(v.canEditProduct ? { product: { ...productDetails, subcategoryId: v.product.subcategoryId || null } } : {}) },
        });
        toast.success("Product updated");
      } else {
        await api("/shop/inventory", {
          body: {
            ...pricing,
            variantName: v.variantName || null,
            ...(mode === "existing" && picked
              ? { productId: picked.id }
              : {
                  product: {
                    ...productDetails,
                    categoryId: v.product.categoryId,
                    subcategoryId: v.product.subcategoryId || null,
                    sku: v.product.sku || null,
                    unit: v.product.unit,
                    unitValue: v.product.unitValue ? Number(v.product.unitValue) : null,
                  },
                }),
          },
        });
        toast.success("Product added to your inventory");
      }
      router.push("/shop/inventory");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!editing && (
        <div className="flex gap-2 rounded-xl bg-muted p-1">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === m ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              {m === "existing" ? "Pick from catalogue" : "Create new product"}
            </button>
          ))}
        </div>
      )}

      {!editing && mode === "existing" && (
        <Card className="gap-3 p-4">
          <p className="text-sm text-muted-foreground">Selling something other shops also sell? Pick it from the shared catalogue — you set your own price and stock.</p>
          {picked ? (
            <div className="flex items-center gap-3 rounded-xl border border-primary bg-secondary/40 p-3">
              <ProductThumb src={picked.images[0]?.url} alt={picked.name} className="size-12" />
              <div className="flex-1 text-sm">
                <p className="font-semibold">{picked.name}</p>
                <p className="text-xs text-muted-foreground">{picked.category.name}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, brand or barcode" className="pl-9" autoFocus />
              </div>
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {(search.trim().length >= 2 ? results : []).map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setPicked(r)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted">
                      <ProductThumb src={r.images[0]?.url} alt={r.name} className="size-10" />
                      <span className="text-sm">
                        <span className="font-medium">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.brand ? `${r.brand} · ` : ""}
                          {r.category.name}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {search.length >= 2 && results.length === 0 && (
                  <li className="p-2 text-sm text-muted-foreground">
                    Not found.{" "}
                    <button type="button" className="font-semibold text-primary" onClick={() => setMode("new")}>
                      Create a new product
                    </button>
                  </li>
                )}
              </ul>
            </>
          )}
        </Card>
      )}

      {(mode === "new" || editing) && (
        <Card className="gap-4 p-4">
          <p className="font-semibold">Product details</p>
          {editing && !v.canEditProduct && <p className="text-xs text-muted-foreground">This is a shared catalogue product. Only its creator or an admin can edit these details.</p>}
          <fieldset disabled={editing && !v.canEditProduct} className="grid gap-3 disabled:opacity-60">
            <F label="Product name *">
              <Input value={v.product.name} onChange={(e) => setP("name", e.target.value)} required minLength={2} />
            </F>
            <F label="Description">
              <Textarea value={v.product.description} onChange={(e) => setP("description", e.target.value)} rows={2} />
            </F>
            <div className="grid grid-cols-2 gap-3">
              <F label="Category *">
                <Select value={v.product.categoryId} onValueChange={(x) => setV((p) => ({ ...p, product: { ...p.product, categoryId: x, subcategoryId: "" } }))} disabled={editing}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
              <F label="Subcategory">
                <Select value={v.product.subcategoryId} onValueChange={(x) => setP("subcategoryId", x)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {cat?.subcategories.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <F label="Brand">
                <Input value={v.product.brand} onChange={(e) => setP("brand", e.target.value)} />
              </F>
              <F label="SKU">
                <Input value={v.product.sku} onChange={(e) => setP("sku", e.target.value)} disabled={editing} />
              </F>
              <F label="Barcode">
                <Input value={v.product.barcode} onChange={(e) => setP("barcode", e.target.value)} />
              </F>
              <F label="Unit *">
                <div className="flex gap-1">
                  <Input value={v.product.unitValue} onChange={(e) => setP("unitValue", e.target.value)} inputMode="decimal" placeholder="500" className="w-20" disabled={editing} />
                  <Select value={v.product.unit} onValueChange={(x) => setP("unit", x)} disabled={editing}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["pcs", "g", "kg", "ml", "l", "pack", "dozen"].map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </F>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <F label="Weight (g) *">
                <Input value={v.product.weightGrams} onChange={(e) => setP("weightGrams", e.target.value)} inputMode="numeric" required />
              </F>
              <F label="Length (cm)">
                <Input value={v.product.lengthCm} onChange={(e) => setP("lengthCm", e.target.value)} inputMode="decimal" />
              </F>
              <F label="Breadth (cm)">
                <Input value={v.product.breadthCm} onChange={(e) => setP("breadthCm", e.target.value)} inputMode="decimal" />
              </F>
              <F label="Height (cm)">
                <Input value={v.product.heightCm} onChange={(e) => setP("heightCm", e.target.value)} inputMode="decimal" />
              </F>
            </div>
            <F label="Images">
              <ImageUploader value={v.product.images} onChange={(u) => setP("images", u)} folder="products" />
            </F>
          </fieldset>
        </Card>
      )}

      <Card className="gap-4 p-4">
        <p className="font-semibold">Your price & stock</p>
        {!editing && (
          <F label="Variant / pack size (optional)">
            <Input value={v.variantName} onChange={(e) => set("variantName", e.target.value)} placeholder="e.g. 500 ml, 1 kg, Large" />
          </F>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <F label="MRP (₹) *">
            <Input value={v.mrp} onChange={(e) => set("mrp", e.target.value)} inputMode="decimal" required />
          </F>
          <F label="Selling price (₹) *">
            <Input value={v.sellingPrice} onChange={(e) => set("sellingPrice", e.target.value)} inputMode="decimal" required />
          </F>
          <div className="grid gap-1.5">
            <Label className="text-xs">Discount</Label>
            <p className="flex h-9 items-center text-sm font-semibold text-primary">{mrpP && priceP ? `${discountPercent(mrpP, priceP)}% off` : "—"}</p>
          </div>
          <F label="Stock quantity *">
            <Input value={v.stock} onChange={(e) => set("stock", e.target.value)} inputMode="numeric" required />
          </F>
          <F label="Low-stock alert at">
            <Input value={v.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} inputMode="numeric" />
          </F>
          <F label="Max per order">
            <Input value={v.maxPerOrder} onChange={(e) => set("maxPerOrder", e.target.value)} inputMode="numeric" />
          </F>
          <F label="Shop SKU">
            <Input value={v.shopSku} onChange={(e) => set("shopSku", e.target.value)} />
          </F>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <Switch checked={v.isAvailable} onCheckedChange={(x) => set("isAvailable", x)} /> Available for customers
        </label>
      </Card>

      <div className="flex flex-wrap justify-between gap-2">
        {editing ? (
          <ConfirmButton
            variant="ghost"
            destructive
            title="Remove this product from your shop?"
            description="Customers will no longer see it. Past orders are not affected."
            confirmLabel="Remove"
            onConfirm={async () => {
              await api(`/shop/inventory/${initial.id}`, { method: "DELETE" });
              router.push("/shop/inventory");
              router.refresh();
            }}
          >
            <Trash2 /> Remove
          </ConfirmButton>
        ) : (
          <span />
        )}
        <Button type="submit" size="lg" disabled={busy || (!editing && mode === "existing" && !picked)}>
          {busy && <Loader2 className="animate-spin" />} {editing ? "Save changes" : "Add to inventory"}
        </Button>
      </div>
    </form>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
