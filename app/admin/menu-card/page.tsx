import type { Metadata } from "next";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { getTenantContext } from "@/lib/tenant-context";
import { readTenantConfigEntries } from "@/lib/tenant-config/store";
import { ODISHA_DEFAULTS } from "@/lib/tenant-config";
import { overlayConfigEntries } from "@/lib/tenant-config/registry";
import MenuCardConfigurator from "./Configurator";

/**
 * S3 — the menu-card configurator.
 *
 * Where a tenant administrator composes their build: which modules are on,
 * inside the plan their organization bought.
 *
 * The ceiling is NOT read here. The page renders the screen; the API decides
 * what may be enabled, against `Tenant.planTier`, on every write. A page that
 * computed the ceiling and handed it to the client would be describing a rule
 * rather than enforcing one — the toggle is a `PUT` anybody with the permission
 * can issue by hand.
 */
export const metadata: Metadata = {
  title: "Menu card — Airawat",
};

export default async function MenuCardAdminPage() {
  const { tenantId } = await getTenantContext();
  const rows = await readTenantConfigEntries(tenantId);
  const config = overlayConfigEntries(ODISHA_DEFAULTS, rows);

  return (
    <NocturneRoot overrides={config.themeOverrides}>
      <div className="ax-lp-root">
        <a href="#menu-card" className="btn btn-secondary ax-skip">
          Skip to the menu card
        </a>
        <header className="ax-lp-header">
          <div className="ax-lp-shell ax-lp-bar">
            <span className="ax-lp-brand">
              <span className="ax-lp-mark" aria-hidden="true" />
              <span className="ax-lp-wordmark">{config.productName}</span>
              <span className="ax-lp-suffix">Menu card</span>
            </span>
          </div>
        </header>
        <main id="menu-card">
          <MenuCardConfigurator />
        </main>
      </div>
    </NocturneRoot>
  );
}
