"use client";

import { useState } from "react";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import {
  Button,
  InlineAlert,
  StatTile,
  StatusTag,
  Tag,
  TextField,
  Toast,
  checkRoleContrast,
  contrastRatio,
  formatContrastRatio,
  THEME_ROLES,
  type RoleValues,
  type ThemeName,
  type ThemeOverrides,
  type ThemeRole,
} from "@/components/nocturne";
import { withNextBasePath } from "@/lib/next-base-path";

/**
 * The design-system configurator.
 *
 * THE SECURITY-RELEVANT PART, stated first because it is the reason this screen
 * needed a gate of its own: every value edited here ends up inside a `<style>`
 * element on every page this tenant renders. This is where the injection
 * boundary built at Gate A finally meets untrusted input.
 *
 * Nothing on this screen is trusted to be safe. The colour inputs are
 * `type="color"`, which can only produce `#rrggbb` — but that is a convenience,
 * not a control, because the `PUT` behind them can be issued by hand with any
 * body at all. The control is on the server: `validateConfigValue` runs the same
 * allowlist the generator uses (known role names, plain hex, nothing else) and
 * REJECTS anything it would have to drop, rather than silently saving a
 * half-empty theme.
 *
 * THE PREVIEW is a nested `NocturneRoot` carrying the unsaved values. It is the
 * same component, the same generator and the same sanitiser the real pages use,
 * so what it shows is what saving would produce — not an approximation drawn
 * with inline styles.
 *
 * THE AI KEY is write-only, in both directions. This component never receives
 * it; it is handed `llmApiKeySet` and nothing more. After a save it shows the
 * key as set and clears its own field, because holding a credential in React
 * state after it has been delivered has no purpose.
 */

/** The two grounds a role is measured against, per theme. */
const GROUND: Record<ThemeName, string> = { dark: "#161826", light: "#eef0f8" };

const ROLE_DEFAULTS: Record<ThemeName, Record<string, string>> = {
  dark: {
    "--color-accent": "#9184d9",
    "--color-bg": "#161826",
    "--color-surface": "#232532",
    "--color-text": "#e9e9ed",
    "--dv-cat-1": "#9184d9",
  },
  light: {
    "--color-accent": "#5d5294",
    "--color-bg": "#eef0f8",
    "--color-surface": "#f8f9fd",
    "--color-text": "#232532",
    "--dv-cat-1": "#9184d9",
  },
};

export default function DesignSystemConfigurator({
  initialOverrides,
  llmApiKeySet,
  productName,
}: {
  initialOverrides: ThemeOverrides;
  llmApiKeySet: boolean;
  productName: string;
}) {
  const [overrides, setOverrides] = useState<ThemeOverrides>(initialOverrides);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState(llmApiKeySet);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active: RoleValues = overrides[theme] ?? {};

  function valueFor(role: ThemeRole): string {
    return active[role] ?? ROLE_DEFAULTS[theme][role] ?? "#000000";
  }

  function setRole(role: ThemeRole, value: string) {
    setOverrides((current) => ({
      ...current,
      [theme]: { ...(current[theme] ?? {}), [role]: value },
    }));
  }

  function clearRole(role: ThemeRole) {
    setOverrides((current) => {
      const next = { ...(current[theme] ?? {}) };
      delete next[role];
      return { ...current, [theme]: next };
    });
  }

  async function put(key: string, value: unknown, note: string) {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch(withNextBasePath("/api/v1/admin/tenant-config"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // The server's own reason, verbatim. It names the offending role and
        // says what was wrong with it, which is more useful than anything this
        // component could invent.
        setError(payload?.detail ?? "Could not save. Try again.");
        return false;
      }
      setSaved(note);
      return true;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveTheme() {
    await put("themeOverrides", overrides, "Theme saved. Your users see it on their next page load.");
  }

  async function saveKey() {
    if (apiKey.trim().length === 0) return;
    const ok = await put("llmApiKey", apiKey, "API key stored. It is not shown again.");
    if (ok) {
      setKeySet(true);
      // Cleared as soon as it is delivered. There is no reason for this
      // component to keep holding a credential.
      setApiKey("");
    }
  }

  return (
    <div className="ax-cfg">
      <div>
        <p className="ax-section-title">Design system</p>
        <h1 className="ax-lp-h2">Your organization&rsquo;s colours</h1>
        <p className="ax-wz-hint">
          These apply everywhere {productName} renders — screens, report packs and invitation
          emails. Change them any day; nothing else has to be rebuilt.
        </p>
      </div>

      <div className="ax-row" role="group" aria-label="Which theme you are editing">
        {(["dark", "light"] as const).map((name) => (
          <Button
            key={name}
            variant={theme === name ? "primary" : "secondary"}
            aria-pressed={theme === name}
            onClick={() => setTheme(name)}
          >
            {name === "dark" ? "Dark theme" : "Light theme"}
          </Button>
        ))}
        <span className="ax-wz-hint" style={{ fontSize: 12, margin: 0 }}>
          Both are saved. Your users see whichever they have chosen.
        </span>
      </div>

      <div className="ax-cfg-split">
        <div style={{ display: "grid", gap: 12 }}>
          {THEME_ROLES.map((role) => {
            const value = valueFor(role.token);
            const against = valueFor(role.contrastAgainst as ThemeRole) || GROUND[theme];
            const verdict = checkRoleContrast(role.token, value, against);
            const overridden = active[role.token] !== undefined;
            const inputId = `role-${role.token.replace(/[^a-z0-9]+/gi, "-")}`;

            return (
              <div className="ax-cfg-group" key={role.token}>
                <div className="ax-row" style={{ justifyContent: "space-between" }}>
                  <label htmlFor={inputId} className="ax-panel-title" style={{ fontSize: 14 }}>
                    {role.label}
                  </label>
                  {overridden ? <Tag tone="accent">Changed</Tag> : <Tag tone="neutral">Platform default</Tag>}
                </div>
                <p className="ax-cap-desc">{role.description}</p>
                <div className="ax-row">
                  <input
                    id={inputId}
                    type="color"
                    value={value}
                    onChange={(event) => setRole(role.token, event.target.value)}
                    style={{ width: 44, height: 32, padding: 0, border: 0, background: "transparent" }}
                  />
                  <code style={{ fontSize: 12 }}>{value}</code>
                  {/* Announced, not merely painted: an administrator changing a
                      colour needs to hear the verdict change. */}
                  <span role="status">
                    {verdict.ratio === null ? (
                      <Tag tone="outline">Not measurable</Tag>
                    ) : (
                      <StatusTag status={verdict.passes ? "ok" : "breach"}>
                        {formatContrastRatio(verdict.ratio)} against {roleLabel(role.contrastAgainst)}
                        {verdict.passes ? "" : ` — needs ${role.minRatio}:1`}
                      </StatusTag>
                    )}
                  </span>
                  {overridden ? (
                    <Button variant="ghost" onClick={() => clearRole(role.token)}>
                      Reset
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="ax-cfg-aside" aria-label="Preview">
          <p className="ax-panel-title">Live preview</p>
          {/* A nested scope root carrying the UNSAVED values. Same component,
              same generator, same sanitiser as the real pages. */}
          <NocturneRoot theme={theme} overrides={overrides} className="ax-preview">
            <div className="nav" style={{ gap: 8, padding: "10px 14px" }}>
              <span className="ax-lp-mark" style={{ width: 15, height: 15 }} aria-hidden="true" />
              <span className="nav-brand" style={{ fontSize: 12 }}>
                {productName}
              </span>
            </div>
            <div className="ax-preview-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <StatTile kicker="Utilization" value="68.4%" percent={68.4} meterLabel="Preview only" />
                <StatTile kicker="Released" value="₹ 4,812 cr" footnote="of ₹ 7,040 cr" />
              </div>
              <div className="ax-row">
                <Button variant="primary" style={{ fontSize: 12 }}>
                  Export report
                </Button>
                <StatusTag status="risk">At risk</StatusTag>
              </div>
            </div>
          </NocturneRoot>
          <p className="ax-cap-desc">
            A preview of your own workspace. Figures are illustrative.
          </p>
        </aside>
      </div>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {saved ? <Toast>{saved}</Toast> : null}

      <div className="ax-cfg-bar">
        <Button variant="primary" onClick={saveTheme} disabled={saving}>
          {saving ? "Saving…" : "Save theme"}
        </Button>
        <Button variant="secondary" onClick={() => setOverrides(initialOverrides)} disabled={saving}>
          Discard changes
        </Button>
      </div>

      <section className="ax-cfg-group" aria-labelledby="ai-key-head">
        <h2 className="ax-panel-title" id="ai-key-head" style={{ fontSize: 14 }}>
          AI provider key
        </h2>
        <p className="ax-cap-desc">
          {keySet
            ? "A key is stored. It is never displayed again — not to us, and not to you. Paste a new one to replace it."
            : "No key is stored. The assistant runs on Airawat's own models until you add one."}
        </p>
        <div style={{ maxWidth: "34rem" }}>
          <TextField
            id="llm-api-key"
            label="API key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            hint="Stored encrypted. Replacing it takes effect immediately."
          />
        </div>
        <div className="ax-row">
          <Button variant="primary" onClick={saveKey} disabled={saving || apiKey.trim().length === 0}>
            {keySet ? "Replace the key" : "Store the key"}
          </Button>
          <span role="status">{keySet ? <Tag tone="neutral">✓ Key set</Tag> : <Tag tone="outline">Not set</Tag>}</span>
        </div>
      </section>
    </div>
  );
}

function roleLabel(token: string): string {
  return THEME_ROLES.find((role) => role.token === token)?.label ?? token;
}

/** Re-exported for the tests, which check the preview and the page agree. */
export { contrastRatio };
