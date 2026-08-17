"use client";

import { useEffect, useState } from "react";
import {
  Button,
  InlineAlert,
  LoadingRow,
  LockedModuleRow,
  ModuleToggle,
  Tag,
  Toast,
} from "@/components/nocturne";
import { withNextBasePath } from "@/lib/next-base-path";
import {
  CAPABILITY_COUNT,
  PLATFORM_STANDARD,
  groupsForModule,
  type Capability,
} from "@/lib/menu-card/capabilities";

/**
 * The menu-card configurator.
 *
 * Composes the tenant's build, module by module, showing what each one actually
 * contains so the decision is made against capabilities rather than names.
 *
 * THE CEILING IS NOT ENFORCED HERE. This component reads it from the API and
 * uses it to render a module as a toggle or as locked, which is a courtesy to
 * the administrator, not a control: the `PUT` behind these switches can be
 * issued by hand with any list of codes. The server intersects whatever it
 * receives with `Tenant.planTier` and reports what it dropped — and this screen
 * shows that report, so an administrator who tries anyway is told plainly
 * rather than watching a switch spring back.
 *
 * Capability rows are presentational. Entitlement in this product is per
 * module; the rows say what a module gets you. Their lifecycle dots — available,
 * in development, on the roadmap — are information, not switches, and each
 * carries its status as text as well as colour.
 */
type ModuleRow = {
  code: string;
  name: string;
  enforcement: "core" | "gated" | "roadmap";
  tier: string | null;
  status: string;
  enabled: boolean;
  withinPlan: boolean;
  locked: boolean;
};

const PLAN_NAMES: Record<string, string> = {
  core: "Essential",
  standard: "Governance",
  premium: "Institution",
  addon: "Institution",
};

const STATUS_WORDS: Record<Capability["status"], string> = {
  live: "Available now",
  dev: "In development",
  plan: "On the roadmap",
};

export default function MenuCardConfigurator() {
  const [modules, setModules] = useState<ModuleRow[] | null>(null);
  const [planTier, setPlanTier] = useState<string>("core");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [denied, setDenied] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(withNextBasePath("/api/v1/admin/entitlements"));
        if (!response.ok) {
          if (!cancelled) setError("Could not load your menu card. You may not have permission to change it.");
          return;
        }
        const payload = await response.json();
        if (cancelled) return;
        setModules(payload.modules ?? []);
        setPlanTier(payload.planTier ?? "core");
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(code: string, on: boolean) {
    setModules((current) =>
      current ? current.map((mod) => (mod.code === code ? { ...mod, enabled: on } : mod)) : current,
    );
  }

  async function save() {
    if (!modules) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const wanted = modules.filter((m) => m.enforcement === "gated" && m.enabled).map((m) => m.code);
      const response = await fetch(withNextBasePath("/api/v1/admin/entitlements"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modules: wanted }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.detail ?? "Could not save your menu card.");
        return;
      }
      // Re-render from what the SERVER says is enabled, not from what was
      // clicked. If the ceiling dropped something, the screen has to show the
      // state that actually exists.
      const enabled = new Set<string>(payload.enabled ?? []);
      setModules((current) =>
        current ? current.map((mod) => ({ ...mod, enabled: mod.enforcement === "core" || enabled.has(mod.code) })) : current,
      );
      setDenied(payload.denied ?? []);
      setSaved("Menu card saved. Your officers see the change on their next page load.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !modules) {
    return (
      <div className="ax-cfg">
        <InlineAlert>{error}</InlineAlert>
      </div>
    );
  }

  if (!modules) {
    return (
      <div className="ax-cfg">
        <LoadingRow>Loading your menu card…</LoadingRow>
      </div>
    );
  }

  const gated = modules.filter((m) => m.enforcement === "gated");
  const core = modules.filter((m) => m.enforcement === "core");
  const enabledCount = gated.filter((m) => m.enabled).length;

  return (
    <div className="ax-cfg">
      <div>
        <p className="ax-section-title">Product catalogue</p>
        <h1 className="ax-lp-h2">Your menu card</h1>
        <p className="ax-wz-hint">
          The platform standard is always included. Add the monitoring and intelligence your mandate
          needs — {CAPABILITY_COUNT} capabilities across {core.length + gated.length} modules.
        </p>
        <div className="ax-row" style={{ marginTop: 14 }}>
          <Tag tone="accent">{PLAN_NAMES[planTier] ?? planTier} plan</Tag>
          <Tag tone="neutral">
            {enabledCount} of {gated.filter((m) => m.withinPlan).length} optional modules on
          </Tag>
        </div>
      </div>

      <div className="ax-legend">
        <span>
          <span className="ax-dot ax-dot-live" aria-hidden="true" />
          Available now
        </span>
        <span>
          <span className="ax-dot ax-dot-dev" aria-hidden="true" />
          In development
        </span>
        <span>
          <span className="ax-dot ax-dot-plan" aria-hidden="true" />
          On the roadmap
        </span>
      </div>

      <section className="ax-cfg-group" aria-labelledby="mc-standard">
        <div className="ax-cfg-group-head">
          <span className="ax-cfg-badge" aria-hidden="true">
            PS
          </span>
          <div>
            <h2 className="ax-panel-title" id="mc-standard" style={{ fontSize: 14 }}>
              Platform standard
            </h2>
            <p className="ax-cap-id" style={{ margin: 0 }}>
              Mandatory · identity, access, audit, shell
            </p>
          </div>
        </div>
        <div className="ax-cap-grid">
          {PLATFORM_STANDARD.map((capability) => (
            <CapabilityCard key={capability.id} capability={capability} included />
          ))}
        </div>
      </section>

      {gated.map((mod) => {
        const groups = groupsForModule(mod.code);
        const capabilities = groups.flatMap((group) => group.capabilities);
        return (
          <section className="ax-cfg-group" key={mod.code} aria-labelledby={`mc-${mod.code}`}>
            <div className="ax-cfg-group-head">
              <span className="ax-cfg-badge" aria-hidden="true">
                {groups[0]?.code ?? mod.code.replace("MOD-", "")}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="ax-panel-title" id={`mc-${mod.code}`} style={{ fontSize: 14 }}>
                  {mod.name}
                </h2>
                <p className="ax-cap-id" style={{ margin: 0 }}>
                  {groups[0]?.summary ?? `${capabilities.length} capabilities`}
                </p>
              </div>
            </div>

            {mod.withinPlan ? (
              <ModuleToggle
                id={`mc-toggle-${mod.code}`}
                label={`Include ${mod.name}`}
                hint={`${capabilities.length} capabilities`}
                checked={mod.enabled}
                onChange={(on) => toggle(mod.code, on)}
              />
            ) : (
              <LockedModuleRow
                label={`Include ${mod.name}`}
                hint="Above your plan — talk to Airawat to add it."
                action={<Tag tone="outline">Not in this plan</Tag>}
              />
            )}

            {capabilities.length > 0 ? (
              <div className="ax-cap-grid">
                {capabilities.map((capability) => (
                  <CapabilityCard key={capability.id} capability={capability} included={mod.enabled} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      {denied.length > 0 ? (
        <InlineAlert>
          {denied.length} module{denied.length === 1 ? " was" : "s were"} not switched on because your
          plan does not include {denied.length === 1 ? "it" : "them"}: {denied.join(", ")}.
        </InlineAlert>
      ) : null}
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {saved ? <Toast>{saved}</Toast> : null}

      <div className="ax-cfg-bar">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save menu card"}
        </Button>
      </div>
    </div>
  );
}

function CapabilityCard({ capability, included }: { capability: Capability; included: boolean }) {
  return (
    <div className={included ? "ax-cap ax-cap-included" : "ax-cap"}>
      <div className="ax-row" style={{ gap: 7 }}>
        <span className={`ax-dot ax-dot-${capability.status}`} aria-hidden="true" />
        <span className="ax-cap-id">{capability.id}</span>
        {/* The dot's meaning, in words. A status carried by fill alone is a
            1.4.1 failure and is also invisible in a printed menu card. */}
        <span className="ax-sr-only">{STATUS_WORDS[capability.status]}</span>
      </div>
      <div className="ax-cap-name">{capability.name}</div>
      <p className="ax-cap-desc">{capability.description}</p>
    </div>
  );
}
