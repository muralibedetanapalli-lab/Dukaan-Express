import type { ReactNode } from "react";

/** Small prose primitives for the policy pages (no typography plugin in this project). */
export function Doc({ title, updated, intro, children }: { title: string; updated?: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <article className="min-w-0 max-w-3xl">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {updated && <p className="mt-1 text-sm text-muted-foreground">Last updated: {updated}</p>}
      {intro && <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-foreground/90">{intro}</div>}
      <div className="mt-2">{children}</div>
    </article>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>;
}

export function Callout({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border bg-muted/50 p-4 text-sm leading-relaxed">{children}</div>;
}

export function Mail({ to }: { to: string }) {
  return (
    <a href={`mailto:${to}`} className="font-medium text-primary hover:underline">
      {to}
    </a>
  );
}
