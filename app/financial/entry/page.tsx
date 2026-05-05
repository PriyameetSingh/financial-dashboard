"use client";

import Link from "next/link";
import { IndianRupee, BarChart3 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useRequireRole } from "@/src/lib/route-guards";
import { UserRole } from "@/lib/auth";

export default function FinancialEntryLanding() {
  useRequireRole([UserRole.FA, UserRole.TASU], "/");

  return (
    <AppShell title="Financial Data Entry">
      <div className="px-6 py-10 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--text-muted)]">Finance Desk</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Financial Entry</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Choose the type of data you want to enter for this period.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/financial/entry/scheme"
            className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 transition hover:border-[var(--text-primary)] hover:shadow-lg"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
              <IndianRupee size={22} className="text-[var(--text-primary)]" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Per scheme</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Scheme-wise Entry</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Enter SO and IFMS expenditure data for individual schemes. Update annual budgets and select subschemes where applicable.
            </p>
            <span className="mt-4 inline-block text-xs text-[var(--text-primary)] underline underline-offset-4 opacity-70 group-hover:opacity-100">
              Open →
            </span>
          </Link>

          <Link
            href="/financial/entry/summary"
            className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 transition hover:border-[var(--text-primary)] hover:shadow-lg"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
              <BarChart3 size={22} className="text-[var(--text-primary)]" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Aggregate</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Summary Entry</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Enter aggregate financial data across Plan Type, Transfer, and Admin Expenditure heads for the current period.
            </p>
            <span className="mt-4 inline-block text-xs text-[var(--text-primary)] underline underline-offset-4 opacity-70 group-hover:opacity-100">
              Open →
            </span>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
