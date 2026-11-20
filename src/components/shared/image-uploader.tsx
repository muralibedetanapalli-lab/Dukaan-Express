"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api-client";
import { isGeneratedArt } from "@/lib/product-art";
import { uploadPhoto } from "@/components/shared/photo-picker";
import { cn } from "@/lib/utils";

/** Multi-image uploader backed by POST /api/v1/uploads. Value is the ordered list of URLs. */
export function ImageUploader({
  value,
  onChange,
  folder,
  max = 6,
  className,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  folder: "products" | "shops" | "categories" | "banners" | "platform" | "payouts";
  max?: number;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    // A real photo replaces the auto-generated icon rather than sitting behind it.
    const next = value.filter((u) => !isGeneratedArt(u));
    try {
      for (const f of Array.from(files).slice(0, max - next.length)) {
        next.push(await uploadPhoto(f, folder));
      }
      onChange(next);
    } catch (e) {
      toast.error(errorMessage(e));
      onChange(next);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {value.map((url, i) => (
        <div key={url} className="group relative size-20 overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full object-cover" />
          {i === 0 && (
            <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[10px] text-white">{isGeneratedArt(url) ? "Auto icon" : "Cover"}</span>
          )}
          <button
            type="button"
            onClick={() => onChange(value.filter((u) => u !== url))}
            className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
            aria-label="Remove image"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {value.filter((u) => !isGeneratedArt(u)).length < max && (
        <>
          <button
            type="button"
            onClick={() => camera.current?.click()}
            disabled={busy}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} Take photo
          </button>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />} Upload
          </button>
        </>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={max > 1} hidden onChange={(e) => upload(e.target.files)} />
    </div>
  );
}
