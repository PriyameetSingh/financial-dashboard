import type { Metadata } from "next";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { getTenantContext } from "@/lib/tenant-context";
import { readTenantConfigEntries } from "@/lib/tenant-config/store";
import { ODISHA_DEFAULTS } from "@/lib/tenant-config";
import { overlayConfigEntries } from "@/lib/tenant-config/registry";
import DesignSystemConfigurator from "./Configurator";

/**
 * S3 — the design-system configurator.
 *
 * A tenant administrator's screen for the organization's own colours and its AI
 * credential. Reached inside the product, so it is behind the normal session and
 * the `MANAGE_TENANT_CONFIG` permission — enforced by the API it writes to, not
 * by this page, because the API is what an attacker would call.
 *
 * The current values are read here, server-side, through the sanctioned config
 * accessor, and handed to the client component as its starting state. That is
 * also the proof the phase asks for: the page renders inside a `NocturneRoot`
 * carrying the tenant's STORED overrides, so what an administrator sees when
 * they arrive is what they saved last time, not a default the screen invented.
 *
 * The AI key is not read. It cannot be — the store returns rows and the secret
 * class is never overlaid into `TenantConfig`, so the only thing this page can
 * know about it is whether a row exists.
 */
export const metadata: Metadata = {
  title: "Design system — Airawat",
};

export default async function DesignSystemAdminPage() {
  const { tenantId } = await getTenantContext();
  const rows = await readTenantConfigEntries(tenantId);
  const config = overlayConfigEntries(ODISHA_DEFAULTS, rows);
  // Presence only. `readTenantConfigEntries` returns the raw row, so this page
  // takes care never to pass the value anywhere near the client boundary.
  const llmApiKeySet = rows.some((row) => row.key === "llmApiKey");

  return (
    <NocturneRoot overrides={config.themeOverrides}>
      <div className="ax-lp-root">
        <a href="#configurator" className="btn btn-secondary ax-skip">
          Skip to the configurator
        </a>
        <header className="ax-lp-header">
          <div className="ax-lp-shell ax-lp-bar">
            <span className="ax-lp-brand">
              <span className="ax-lp-mark" aria-hidden="true" />
              <span className="ax-lp-wordmark">{config.productName}</span>
              <span className="ax-lp-suffix">Design system</span>
            </span>
          </div>
        </header>
        <main id="configurator">
          <DesignSystemConfigurator
            initialOverrides={config.themeOverrides}
            llmApiKeySet={llmApiKeySet}
            productName={config.productName}
          />
        </main>
      </div>
    </NocturneRoot>
  );
}
