"use client";

import { Database } from "lucide-react";
import AppShell from "@/components/AppShell";

type Props = {
  title?: string;
  heading?: string;
  description?: string;
};

export default function DatabaseUnavailableShell({
  title = "Unavailable",
  heading = "Can’t load data right now",
  description = "The app can’t reach the database. Check your connection or VPN, confirm Supabase is running, then refresh this page.",
}: Props) {
  return (
    <AppShell title={title}>
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--ax-muted)]">
          <Database className="h-7 w-7" strokeWidth={1.5} aria-hidden />
        </div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--ax-muted)]">Service unavailable</p>
        <h1 className="mt-3 text-xl font-semibold text-[var(--color-text)]">{heading}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ax-muted)]">{description}</p>
        <p className="mt-8 text-xs text-[var(--ax-muted)]">Error code 503 · Database connection</p>
      </div>
    </AppShell>
  );
}
