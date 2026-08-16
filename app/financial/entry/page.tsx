"use client";

import Link from "next/link";
import { IndianRupee, BarChart3, Layers } from "lucide-react";
import AppShell from "@/components/AppShell";
import { hasPermission, Permission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";

export default function FinancialEntryLanding() {
  const user = useRequireAnyPermission([Permission.ENTER_FINANCIAL_DATA, Permission.MANAGE_FINANCIAL_DATA], "/");
  const showBulk = user && hasPermission(user, Permission.MANAGE_FINANCIAL_DATA);

  return (
    <AppShell title="Financial Data Entry">
      <div className="px-6 py-10 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--ax-muted)]">Finance Desk</p>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Financial Entry</h1>
          <p className="mt-1 text-sm text-[var(--ax-muted)]">Choose the type of data you want to enter for this period.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/financial/entry/scheme"
            className="group rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 transition hover:border-[var(--color-text)] hover:shadow-lg"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]">
              <IndianRupee size={22} className="text-[var(--color-text)]" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Per scheme</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--color-text)]">Scheme-wise Entry</h2>
            <p className="mt-2 text-sm text-[var(--ax-muted)]">
              Enter SO and IFMS expenditure data for individual schemes. Update annual budgets and select subschemes where applicable.
            </p>
            <span className="mt-4 inline-block text-xs text-[var(--color-text)] underline underline-offset-4 opacity-70 group-hover:opacity-100">
              Open →
            </span>
          </Link>

          <Link
            href="/financial/entry/summary"
            className="group rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 transition hover:border-[var(--color-text)] hover:shadow-lg"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]">
              <BarChart3 size={22} className="text-[var(--color-text)]" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Aggregate</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--color-text)]">Summary Entry</h2>
            <p className="mt-2 text-sm text-[var(--ax-muted)]">
              Enter aggregate financial data across Plan Type, Transfer, and Admin Expenditure heads for the current period.
            </p>
            <span className="mt-4 inline-block text-xs text-[var(--color-text)] underline underline-offset-4 opacity-70 group-hover:opacity-100">
              Open →
            </span>
          </Link>

          {showBulk && (
            <Link
              href="/financial/entry/bulk"
              className="group rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 transition hover:border-[var(--color-text)] hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]">
                <Layers size={22} className="text-[var(--color-text)]" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">All schemes at once</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--color-text)]">Bulk Entry</h2>
              <p className="mt-2 text-sm text-[var(--ax-muted)]">
                Update SO, IFMS, and Budget for all schemes and components in one spreadsheet-style view. Select a meeting or date for the snapshot.
              </p>
              <span className="mt-4 inline-block text-xs text-[var(--color-text)] underline underline-offset-4 opacity-70 group-hover:opacity-100">
                Open →
              </span>
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
