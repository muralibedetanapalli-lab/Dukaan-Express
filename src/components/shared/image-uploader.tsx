"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
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
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const next = [...value];
    try {
      for (const f of Array.from(files).slice(0, max - value.length)) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("folder", folder);
        const r = await api<{ url: string }>("/uploads", { body: fd });
        next.push(r.url);
      }
      onChange(next);
    } catch (e) {
      toast.error(errorMessage(e));
      onChange(next);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {value.map((url, i) => (
        <div key={url} className="group relative size-20 overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full object-cover" />
          {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[10px] text-white">Cover</span>}
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
      {value.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="grid size-20 place-items-center rounded-xl border-2 border-dashed text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={max > 1} hidden onChange={(e) => upload(e.target.files)} />
    </div>
  );
}
