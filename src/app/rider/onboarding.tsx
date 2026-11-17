"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Clock, FileWarning, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const DOCS = [
  { key: "aadhaarFront", label: "Aadhaar — front" },
  { key: "aadhaarBack", label: "Aadhaar — back" },
  { key: "license", label: "Driving licence" },
  { key: "rc", label: "Vehicle RC" },
] as const;
type DocKey = (typeof DOCS)[number]["key"];

const VEHICLES = [
  { value: "BIKE", label: "Bike" },
  { value: "SCOOTER", label: "Scooter" },
  { value: "CYCLE", label: "Cycle" },
  { value: "OTHER", label: "Other" },
];

export interface OnboardingState {
  riderId: string;
  status: "NOT_SUBMITTED" | "PENDING" | "REJECTED";
  note: string | null;
  area: string | null;
  uploaded: Record<DocKey, boolean>;
  aadhaarLast4: string | null;
  licenseNumber: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
}

/** New rider: upload documents and submit for approval; then wait for the dealer / admin. */
export function RiderOnboarding({ s }: { s: OnboardingState }) {
  const router = useRouter();
  const [uploaded, setUploaded] = useState(s.uploaded);
  const [version, setVersion] = useState(() => Date.now());
  const [aadhaar, setAadhaar] = useState("");
  const [license, setLicense] = useState(s.licenseNumber ?? "");
  const [vehicleType, setVehicleType] = useState(s.vehicleType ?? "BIKE");
  const [vehicleNumber, setVehicleNumber] = useState(s.vehicleNumber ?? "");
  const [busy, setBusy] = useState(false);
  const pending = s.status === "PENDING";
  const allDocs = DOCS.every((d) => uploaded[d.key]);
  const aadhaarDigits = aadhaar.replace(/\D/g, "");
  const canSubmit = !pending && allDocs && aadhaarDigits.length === 12 && license.trim().length >= 6 && vehicleNumber.trim().length >= 6 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/rider/kyc", { body: { aadhaarNumber: aadhaarDigits, licenseNumber: license, vehicleType, vehicleNumber } });
      toast.success("Submitted! We'll notify you once you're approved.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {pending ? (
        <Card className="flex-row items-start gap-3 border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <Clock className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Documents under review</p>
            <p>Your dealer or our team will verify them soon. You&apos;ll get a notification as soon as you&apos;re approved — then switch Online to start delivering.</p>
          </div>
        </Card>
      ) : s.status === "REJECTED" ? (
        <Card className="flex-row items-start gap-3 border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <FileWarning className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Please fix your documents</p>
            <p>{s.note}</p>
            <p className="mt-1 text-xs">Re-upload what&apos;s needed below and submit again.</p>
          </div>
        </Card>
      ) : (
        <Card className="flex-row items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold">Verify your identity to start delivering</p>
            <p className="text-muted-foreground">Upload clear photos of your Aadhaar (both sides), driving licence and vehicle RC. Your documents are stored privately and only your dealer and our team can see them.</p>
          </div>
        </Card>
      )}

      {s.area && (
        <p className="text-sm text-muted-foreground">
          Area: <b className="text-foreground">{s.area}</b>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {DOCS.map((d) => (
          <DocTile
            key={d.key}
            riderId={s.riderId}
            doc={d.key}
            label={d.label}
            uploaded={uploaded[d.key]}
            locked={pending}
            version={version}
            onUploaded={() => {
              setUploaded((u) => ({ ...u, [d.key]: true }));
              setVersion(Date.now());
            }}
          />
        ))}
      </div>

      <Card className="gap-3 p-4">
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="aadhaar">Aadhaar number</Label>
            <Input
              id="aadhaar"
              inputMode="numeric"
              value={pending && s.aadhaarLast4 ? `•••• •••• ${s.aadhaarLast4}` : aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/[^\d ]/g, "").slice(0, 14))}
              placeholder={s.aadhaarLast4 ? `On file: •••• ${s.aadhaarLast4} — re-enter to resubmit` : "1234 5678 9012"}
              disabled={pending}
              autoComplete="off"
              className="h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dl">Driving licence number</Label>
            <Input id="dl" value={license} onChange={(e) => setLicense(e.target.value.toUpperCase())} disabled={pending} maxLength={20} placeholder="KA0120201234567" className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Vehicle</Label>
              <Select value={vehicleType} onValueChange={setVehicleType} disabled={pending}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vno">Vehicle number</Label>
              <Input id="vno" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} disabled={pending} maxLength={14} placeholder="KA01AB1234" className="h-11" />
            </div>
          </div>
          {!pending && (
            <>
              <Button type="submit" size="lg" disabled={!canSubmit}>
                {busy && <Loader2 className="animate-spin" />} Submit for approval
              </Button>
              {!allDocs && <p className="-mt-1 text-center text-xs text-muted-foreground">Upload all 4 photos to submit.</p>}
            </>
          )}
        </form>
      </Card>
    </div>
  );
}

function DocTile({
  riderId,
  doc,
  label,
  uploaded,
  locked,
  version,
  onUploaded,
}: {
  riderId: string;
  doc: DocKey;
  label: string;
  uploaded: boolean;
  locked: boolean;
  version: number;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("doc", doc);
      form.set("file", file);
      await api("/rider/kyc/document", { body: form });
      onUploaded();
      toast.success(`${label} uploaded`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <button
      type="button"
      disabled={locked || busy}
      onClick={() => input.current?.click()}
      className={cn("relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border-2 border-dashed text-center", uploaded ? "border-emerald-300" : "border-muted-foreground/30 hover:bg-muted/50")}
    >
      {uploaded ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/v1/riders/${riderId}/documents/${doc}?v=${version}`} alt={label} className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 px-2 text-xs text-muted-foreground">
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
          Tap to add
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/90 px-2 py-1 text-xs font-medium">
        {uploaded && <CheckCircle2 className="size-3.5 text-emerald-600" />} {label}
        {busy && uploaded && <Loader2 className="size-3.5 animate-spin" />}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </button>
  );
}
