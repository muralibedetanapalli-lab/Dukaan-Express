"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, PlusCircle, RefreshCw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductPhotoChanger } from "@/components/shared/photo-picker";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface RowResult {
  row: number;
  name: string;
  action: "create" | "update" | "unchanged" | "error";
  message?: string;
  changes?: string[];
  inventoryId?: string;
  imageUrl?: string | null;
}
interface ImportResult {
  dryRun: boolean;
  summary: { create: number; update: number; unchanged: number; error: number };
  rows: RowResult[];
}

const TONE = {
  create: { label: "New", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  update: { label: "Update", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  unchanged: { label: "No change", cls: "bg-muted text-muted-foreground" },
  error: { label: "Problem", cls: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
};

export function ImportClient() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [drag, setDrag] = useState(false);

  async function send(f: File, dryRun: boolean) {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("dryRun", String(dryRun));
    return api<ImportResult>("/shop/inventory/import", { body: fd });
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error("Choose an Excel .xlsx file");
      return;
    }
    setFile(f);
    setDone(null);
    setPreview(null);
    setBusy("preview");
    try {
      setPreview(await send(f, true));
    } catch (e) {
      toast.error(errorMessage(e));
      setFile(null);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function apply() {
    if (!file) return;
    setBusy("apply");
    try {
      const r = await send(file, false);
      setDone(r);
      setPreview(null);
      toast.success(`Saved: ${r.summary.create} added, ${r.summary.update} updated`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const reset = () => {
    setFile(null);
    setPreview(null);
    setDone(null);
  };

  if (done) return <Done result={done} onAgain={reset} />;

  const toSave = preview ? preview.summary.create + preview.summary.update : 0;

  return (
    <div className="space-y-4">
      {/* Step 1 */}
      <Card className="flex-row flex-wrap items-center gap-4 p-5">
        <Step n={1} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Download your inventory sheet</p>
          <p className="text-sm text-muted-foreground">It lists everything you sell now. Edit prices and stock, or add new products as new rows at the bottom.</p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/v1/shop/inventory/export" download>
            <Download /> Download Excel
          </a>
        </Button>
      </Card>

      {/* Step 2 */}
      <Card className="gap-4 p-5">
        <div className="flex items-center gap-4">
          <Step n={2} />
          <div>
            <p className="font-semibold">Upload the edited file</p>
            <p className="text-sm text-muted-foreground">We&apos;ll show you what will change before anything is saved.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void choose(e.dataTransfer.files[0]);
          }}
          disabled={!!busy}
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            drag ? "border-primary bg-secondary" : "hover:border-primary/60 hover:bg-muted/40",
          )}
        >
          {busy === "preview" ? <Loader2 className="size-8 animate-spin text-primary" /> : <FileSpreadsheet className="size-8 text-primary" />}
          {file ? (
            <span className="font-medium">{file.name}</span>
          ) : (
            <>
              <span className="font-medium">Tap to choose your Excel file</span>
              <span className="text-xs text-muted-foreground">or drag it here · .xlsx, up to 1,000 rows</span>
            </>
          )}
        </button>
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => choose(e.target.files?.[0])} />
      </Card>

      {/* Step 3: preview */}
      {preview && (
        <Card className="gap-4 p-5">
          <div className="flex items-center gap-4">
            <Step n={3} />
            <div>
              <p className="font-semibold">Check and save</p>
              <p className="text-sm text-muted-foreground">Rows with problems are skipped; fix them in Excel and upload again any time.</p>
            </div>
          </div>
          <Summary s={preview.summary} />
          <RowList rows={preview.rows} />
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={apply} disabled={!toSave || !!busy}>
              {busy === "apply" ? <Loader2 className="animate-spin" /> : <Upload />}
              {toSave ? `Save ${toSave} ${toSave === 1 ? "change" : "changes"}` : "Nothing to save"}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={!!busy}>
              <X /> Cancel
            </Button>
            {preview.summary.create > 0 && <p className="text-xs text-muted-foreground">New products get a picture automatically. You can replace it with a photo after saving.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function Done({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  const created = result.rows.filter((r) => r.action === "create" && r.inventoryId);
  const problems = result.rows.filter((r) => r.action === "error");
  return (
    <div className="space-y-4">
      <Card className="items-center gap-3 p-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-7" />
        </span>
        <p className="text-lg font-semibold">Inventory updated</p>
        <Summary s={result.summary} />
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button asChild>
            <Link href="/shop/inventory">View inventory</Link>
          </Button>
          <Button variant="outline" onClick={onAgain}>
            <RefreshCw /> Upload another file
          </Button>
        </div>
      </Card>

      {created.length > 0 && (
        <Card className="gap-4 p-5">
          <div>
            <p className="font-semibold">New products</p>
            <p className="text-sm text-muted-foreground">We made a picture for each one. Tap a picture to take a photo or upload your own.</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {created.map((r) => (
              <li key={r.inventoryId} className="flex flex-col items-center gap-2 rounded-xl border p-3 text-center">
                <ProductPhotoChanger inventoryId={r.inventoryId!} src={r.imageUrl ?? null} alt={r.name} editable={!r.message} className="size-24" />
                <p className="line-clamp-2 text-sm font-medium">{r.name}</p>
                {r.message && <p className="text-[11px] text-muted-foreground">Catalogue photo</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {problems.length > 0 && (
        <Card className="gap-3 p-5">
          <p className="flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-300">
            <AlertCircle className="size-4" /> {problems.length} {problems.length === 1 ? "row was" : "rows were"} skipped
          </p>
          <RowList rows={problems} />
        </Card>
      )}
    </div>
  );
}

function Summary({ s }: { s: ImportResult["summary"] }) {
  const items = [
    { n: s.create, label: "new", icon: PlusCircle, cls: TONE.create.cls },
    { n: s.update, label: "updated", icon: RefreshCw, cls: TONE.update.cls },
    { n: s.unchanged, label: "no change", icon: CheckCircle2, cls: TONE.unchanged.cls },
    { n: s.error, label: s.error === 1 ? "problem" : "problems", icon: AlertCircle, cls: TONE.error.cls },
  ].filter((x) => x.n > 0 || x.label === "new");
  return (
    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
      {items.map((x) => (
        <span key={x.label} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", x.cls)}>
          <x.icon className="size-4" /> <span className="font-bold tabular-nums">{x.n}</span> {x.label}
        </span>
      ))}
    </div>
  );
}

function RowList({ rows }: { rows: RowResult[] }) {
  // Problems first, then new and updated rows; unchanged rows are summarised, not listed.
  const order = { error: 0, create: 1, update: 2, unchanged: 3 };
  const shown = rows.filter((r) => r.action !== "unchanged").sort((a, b) => order[a.action] - order[b.action] || a.row - b.row);
  if (!shown.length) return <p className="text-sm text-muted-foreground">Everything in the sheet already matches your inventory.</p>;
  return (
    <ul className="max-h-[28rem] divide-y overflow-y-auto rounded-xl border">
      {shown.map((r) => (
        <li key={`${r.row}-${r.action}`} className="flex items-start gap-3 px-3 py-2.5 text-sm">
          <span className="w-12 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">Row {r.row}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.name}</p>
            {r.changes?.length ? <p className="text-xs text-muted-foreground">{r.changes.join(" · ")}</p> : null}
            {r.message && <p className={cn("text-xs", r.action === "error" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground")}>{r.message}</p>}
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", TONE[r.action].cls)}>{TONE[r.action].label}</span>
        </li>
      ))}
    </ul>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span>;
}
