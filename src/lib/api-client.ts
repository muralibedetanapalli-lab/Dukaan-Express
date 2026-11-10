"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Body = object | FormData | null | undefined;

/** Typed fetch for /api/v1 that unwraps `{ data }` and throws ApiError for `{ error }`. */
export async function api<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: Body; headers?: Record<string, string> } = {},
): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { ...(isForm || !opts.body ? {} : { "Content-Type": "application/json" }), ...(opts.headers ?? {}) },
    body: isForm ? (opts.body as FormData) : opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string; details?: unknown } } | null;
  if (!res.ok || json?.error) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      const staff = window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/shop");
      window.location.href = `${staff ? "/login/staff" : "/login"}?next=${next}`;
    }
    throw new ApiError(res.status, json?.error?.code ?? "HTTP_ERROR", json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  }
  return json?.data as T;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
