import Link from "next/link";
import { Zap } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-lime-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-white/20">
            <Zap className="size-5" />
          </span>
          Dukaan Express
        </Link>
        <div>
          <p className="text-4xl leading-tight font-extrabold">Your neighbourhood stores,<br />delivered in minutes.</p>
          <p className="mt-4 max-w-md text-white/80">Groceries, fresh produce, dairy, medicines and more from trusted local shops near you.</p>
        </div>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10" />
        <p className="text-sm text-white/70">© {new Date().getFullYear()} Dukaan Express</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-primary lg:hidden">
            <Zap className="size-5" /> Dukaan Express
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
