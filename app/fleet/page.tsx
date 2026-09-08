import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { Card, StatusTag, Tag, InlineAlert } from "@/components/nocturne";
import { getDbUserBySession } from "@/lib/server-rbac";
import { isPlatformOperator } from "@/lib/platform/operators";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant-context";
import { buildTenantExportPayload, type TenantExportPayload } from "@/lib/entitlements/export";
import { readTenantConfigEntries } from "@/lib/tenant-config/store";
import { ODISHA_DEFAULTS } from "@/lib/tenant-config";
import { buildConfigEntriesReport } from "@/lib/tenant-config/registry";

/**
 * Phase 5 — Fleet Console.
 *
 * NOT under `app/admin/*`: every screen there implicitly renders inside the
 * CURRENT request's resolved tenant (`getTenantContext()`), which is the
 * opposite of what this page does — it deliberately iterates every tenant
 * inside one request. `app/platform` was ruled out too: it is the public,
 * unauthenticated marketing page and must stay that way. `app/fleet` is a
 * new top-level group precisely so it inherits neither framing.
 *
 * ACCESS: two independent checks, both required.
 *   1. An ordinary resolved session (`getDbUserBySession`) — this still
 *      resolves against the CALLER's own tenant-scoped User/Role rows,
 *      because that is the only kind of identity this codebase has. There is
 *      no platform-staff account type (see docs/plan.md, Phase 5 §0).
 *   2. `PlatformOperator` membership — a minimal global allowlist, deliberately
 *      NOT a new Role/Permission (RBAC has no way to express an authority that
 *      isn't any one tenant's to grant). See `lib/platform/operators.ts`.
 * A session that fails either check gets 404, not 403 — same posture as
 * `TenantResolutionError` elsewhere in this codebase: the route's existence
 * is not confirmed to a caller who cannot use it.
 *
 * DATA: no new computation. `prisma.tenant.findMany()` already returns every
 * tenant (`Tenant` is a GLOBAL_MODEL). For each tenant,
 * `withTenantContext(tenant.id, …)` wraps a call to `buildTenantExportPayload`
 * (Phase 1's capability + config snapshot) and `buildConfigEntriesReport`
 * (Phase 2's customized-vs-default report) — the exact functions the
 * single-tenant admin surfaces already use, reused verbatim. Safe to loop
 * per `tests/tenant-context-loop-isolation.test.ts`, written and passing
 * before this route existed.
 *
 * DEPLOY / SHA / CI STATUS: explicitly not shown. No such signal reaches the
 * app today (docs/plan.md, Phase 5 §0) — building it is a Jenkins + new
 * small endpoint, out of scope for this first cut.
 */
export const metadata: Metadata = {
  title: "Fleet console — Airawat",
};

type TenantRow = { id: string; slug: string; name: string; status: string; createdAt: Date };

type TenantFleetState =
  | { tenant: TenantRow; ok: true; payload: TenantExportPayload; customizedKeys: string[] }
  | { tenant: TenantRow; ok: false; error: string };

async function loadFleetState(tenant: TenantRow): Promise<TenantFleetState> {
  try {
    const { payload, customizedKeys } = await withTenantContext(tenant.id, async () => {
      const exportPayload = await buildTenantExportPayload(tenant.id);
      const rows = await readTenantConfigEntries(tenant.id);
      const { customizedKeys: keys } = buildConfigEntriesReport(ODISHA_DEFAULTS, rows);
      return { payload: exportPayload, customizedKeys: keys };
    });
    return { tenant, ok: true, payload, customizedKeys };
  } catch (e) {
    return { tenant, ok: false, error: e instanceof Error ? e.message : "failed to load tenant state" };
  }
}

export default async function FleetConsolePage() {
  const user = await getDbUserBySession();
  if (!user) redirect("/login");
  if (!(await isPlatformOperator(user.id))) notFound();

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, status: true, createdAt: true },
  });

  const fleet = await Promise.all(tenants.map(loadFleetState));

  return (
    <NocturneRoot>
      <div className="ax-lp-root">
        <header className="ax-lp-header">
          <div className="ax-lp-shell ax-lp-bar">
            <span className="ax-lp-brand">
              <span className="ax-lp-mark" aria-hidden="true" />
              <span className="ax-lp-wordmark">Fleet console</span>
              <span className="ax-lp-suffix">
                {tenants.length} tenant{tenants.length === 1 ? "" : "s"}
              </span>
            </span>
          </div>
        </header>

        <main className="ax-lp-shell ax-lp-section">
          <p className="ax-section-title">Deploy / SHA / CI status</p>
          <InlineAlert assertive={false}>
            Not available in this first cut. No per-deployment signal reaches the app today —
            tracked as a follow-up, not part of Fleet Console&rsquo;s initial scope.
          </InlineAlert>

          <p className="ax-section-title" style={{ marginTop: 28 }}>
            Tenants
          </p>
          <div className="ax-lp-cards" style={{ marginTop: 12 }}>
            {fleet.map((state) => (
              <FleetTenantCard key={state.tenant.id} state={state} />
            ))}
          </div>
        </main>
      </div>
    </NocturneRoot>
  );
}

function FleetTenantCard({ state }: { state: TenantFleetState }) {
  const { tenant } = state;
  const statusTone = tenant.status === "active" ? "ok" : "breach";

  if (!state.ok) {
    return (
      <Card
        kicker={tenant.slug}
        title={tenant.name}
        elevation="sm"
        meta={<StatusTag status={statusTone}>{tenant.status}</StatusTag>}
      >
        <InlineAlert>Could not load fleet state — {state.error}</InlineAlert>
      </Card>
    );
  }

  const { payload, customizedKeys } = state;
  const enabledCapabilities = payload.capabilities.filter((c) => c.enabled);

  return (
    <Card
      kicker={tenant.slug}
      title={tenant.name}
      elevation="sm"
      meta={<StatusTag status={statusTone}>{tenant.status}</StatusTag>}
    >
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
        Plan tier: {payload.tenant.planTier}
      </p>

      <p className="ax-panel-title" style={{ marginBottom: 6 }}>
        Capabilities ({enabledCapabilities.length} of {payload.capabilities.length} enabled)
      </p>
      <div className="ax-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {enabledCapabilities.length > 0 ? (
          enabledCapabilities.map((c) => (
            <Tag key={c.code} tone="neutral">
              {c.name}
            </Tag>
          ))
        ) : (
          <Tag tone="outline">None enabled</Tag>
        )}
      </div>

      <p className="ax-panel-title" style={{ marginBottom: 6 }}>
        Config drift from defaults ({customizedKeys.length} key{customizedKeys.length === 1 ? "" : "s"})
      </p>
      <div className="ax-row" style={{ flexWrap: "wrap", gap: 6 }}>
        {customizedKeys.length > 0 ? (
          customizedKeys.map((key) => (
            <Tag key={key} tone="accent-2">
              {key}
            </Tag>
          ))
        ) : (
          <Tag tone="outline">Fully default</Tag>
        )}
      </div>
    </Card>
  );
}
