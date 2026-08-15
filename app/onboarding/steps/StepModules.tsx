"use client";

import { LockedModuleRow, ModuleToggle, Tag } from "@/components/nocturne";
import { MODULE_CATALOG } from "@/lib/entitlements/catalog";
import { SELLABLE_MODULES } from "@/lib/platform/landing";
import type { StepProps } from "../types";
import { tierDisplayName, type CodeGrant } from "../CodeGate";

/**
 * Step 4 — which modules the workspace gets.
 *
 * Three things are true here at once and the screen has to show all of them:
 *
 *   - core modules are always on, and cannot be switched off. Gating the shell,
 *     roles or administration would make a workspace nobody can administer, so
 *     they are shown as included rather than as toggles that do not move;
 *   - gated modules within the plan's tier are the actual choice;
 *   - gated modules above it are shown, named, and locked — not hidden. A buyer
 *     comparing plans is entitled to see what the next one adds, and the
 *     product's own pricing page lists them anyway.
 *
 * The tier comes from the onboarding code, never from this screen. Whatever is
 * ticked here, the server enables only what the code's tier reaches — see
 * `provisionTenant`.
 */
export default function StepModules({ draft, update, grant }: StepProps & { grant: CodeGrant }) {
  const withinTier = new Set(grant.modules);
  const core = MODULE_CATALOG.filter((m) => m.enforcement === "core");
  const gated = SELLABLE_MODULES.filter((m) => m.enforcement === "gated");

  function toggle(code: string, on: boolean) {
    const next = new Set(draft.moduleCodes);
    if (on) next.add(code);
    else next.delete(code);
    update({ moduleCodes: [...next] });
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-6)" }}>
      <div className="ax-row">
        <Tag tone="accent">{tierDisplayName(grant.tier)} plan</Tag>
        <span className="ax-wz-hint" style={{ fontSize: 13, margin: 0 }}>
          {core.length} always-included modules, {withinTier.size} more you can switch on.
        </span>
      </div>

      <section aria-labelledby="wz-mod-core">
        <h2 className="ax-section-title" id="wz-mod-core">
          Always included
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {core.map((mod) => (
            <div className="ax-toggle-row" key={mod.code}>
              <span className="ax-toggle-label">
                {mod.name}
                <span className="ax-toggle-hint">
                  Part of every workspace — without it the workspace cannot be administered.
                </span>
              </span>
              <Tag tone="neutral">Included</Tag>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="wz-mod-choose">
        <h2 className="ax-section-title" id="wz-mod-choose">
          Your choice
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {gated.map((mod) => {
            const reachable = withinTier.has(mod.code);
            if (!reachable) {
              return (
                <LockedModuleRow
                  key={mod.code}
                  label={mod.name}
                  hint="Above your plan — available if you upgrade later."
                  action={<Tag tone="outline">Not in this plan</Tag>}
                />
              );
            }
            return (
              <ModuleToggle
                key={mod.code}
                id={`wz-mod-${mod.code}`}
                label={mod.name}
                hint={mod.copy.summary}
                checked={draft.moduleCodes.includes(mod.code)}
                onChange={(on) => toggle(mod.code, on)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
