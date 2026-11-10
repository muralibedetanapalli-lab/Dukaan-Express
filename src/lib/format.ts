import { format, formatDistanceToNow } from "date-fns";

export const fmtDate = (d: string | Date | null | undefined) => (d ? format(new Date(d), "dd MMM yyyy") : "—");
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? format(new Date(d), "dd MMM yyyy, hh:mm a") : "—";
export const fmtTime = (d: string | Date | null | undefined) => (d ? format(new Date(d), "hh:mm a") : "—");
export const fmtAgo = (d: string | Date | null | undefined) =>
  d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "—";

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function unitLabel(unit: string, unitValue?: number | null) {
  if (!unitValue) return unit === "pcs" ? "1 pc" : unit;
  return `${unitValue} ${unit}`;
}

export const initials = (name?: string | null) =>
  (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
