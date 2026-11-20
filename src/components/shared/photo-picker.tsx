"use client";

import { useRef, useState } from "react";
import { Camera, ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Folder = "products" | "shops" | "categories" | "banners" | "platform" | "payouts";

/** Phone photos are often 5–12 MB: scale to at most 1600 px and re-encode as JPEG before uploading. */
async function shrink(file: File, maxSide = 1600): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export async function uploadPhoto(file: File, folder: Folder) {
  const fd = new FormData();
  fd.set("file", await shrink(file));
  fd.set("folder", folder);
  return (await api<{ url: string }>("/uploads", { body: fd })).url;
}

/**
 * Two hidden file inputs: one opens the camera directly (capture), one opens the gallery / file picker.
 * Returns the trigger functions so any button or menu can use them.
 */
export function usePhotoPicker(onFile: (file: File) => void) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onFile(f);
  };
  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handle} />
    </>
  );
  return { takePhoto: () => camera.current?.click(), choosePhoto: () => gallery.current?.click(), inputs };
}

/**
 * A product's picture with a "change photo" menu (take a photo or upload one). Saves straight to the
 * inventory item; only for products the shop created (catalogue photos are shared by every shop).
 */
export function ProductPhotoChanger({
  inventoryId,
  src,
  alt,
  editable,
  className,
  onChanged,
}: {
  inventoryId: string;
  src: string | null;
  alt: string;
  editable: boolean;
  className?: string;
  onChanged?: (url: string) => void;
}) {
  const [url, setUrl] = useState(src);
  const [busy, setBusy] = useState(false);
  const { takePhoto, choosePhoto, inputs } = usePhotoPicker(async (file) => {
    setBusy(true);
    try {
      const next = await uploadPhoto(file, "products");
      await api(`/shop/inventory/${inventoryId}`, { method: "PATCH", body: { product: { images: [next] } } });
      setUrl(next);
      onChanged?.(next);
      toast.success("Photo updated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  });

  const thumb = (
    <span className={cn("relative block overflow-hidden rounded-xl bg-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="grid size-full place-items-center text-[10px] text-muted-foreground">No image</span>
      )}
      {editable && (
        <span className="absolute right-0.5 bottom-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white ring-2 ring-background">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
        </span>
      )}
    </span>
  );
  if (!editable) return thumb;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={busy}>
          <button type="button" className="shrink-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Change photo of ${alt}`}>
            {thumb}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={takePhoto}>
            <Camera /> Take photo
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={choosePhoto}>
            <ImageUp /> Upload photo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {inputs}
    </>
  );
}
