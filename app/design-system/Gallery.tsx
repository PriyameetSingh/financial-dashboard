"use client";

import { useState } from "react";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import {
  Button,
  ButtonLink,
  DataTable,
  DialogSurface,
  EmptyState,
  FileDrop,
  InlineAlert,
  LoadingRow,
  LockedModuleRow,
  Modal,
  ModuleToggle,
  RadioGroup,
  SegmentedControl,
  StatTile,
  StatusTag,
  Stepper,
  Tabs,
  Tag,
  TextField,
  Toast,
  contrastRatio,
  formatContrastRatio,
  type Density,
  type ThemeName,
  type ThemeOverrides,
} from "@/components/nocturne";

/**
 * The component gallery's body.
 *
 * A client component because most of what a gallery is for is showing states,
 * and half the primitives here (tabs, switches, the modal, the choice controls)
 * only have states because they have handlers.
 *
 * The specimen content is invented — scheme names, figures, a fictional
 * upgrade tier. That is what a gallery is: the surfaces this design system is
 * for are forbidden mock data, but the page whose whole subject is "here is
 * what a stat tile looks like when it is at risk" has to have something in the
 * tile. Nothing here reads a database, a session or a tenant, and nothing here
 * is importable by a shipped surface.
 */

/**
 * Where the page currently is, and the two links that move it.
 *
 * The hrefs arrive as strings rather than as a builder function: a function
 * cannot cross the server/client boundary, and the page that renders this is a
 * server component.
 */
type ViewProps = {
  theme: ThemeName;
  density: Density;
  /** URL for this page with the other theme selected. */
  themeHref: string;
  /** URL for this page with the other density selected. */
  densityHref: string;
};

/**
 * A sample tenant brand, used only to demonstrate that role values reach the
 * page as data. The real values arrive from tenant config at Gate D; the point
 * of the demonstration is that no tenant is named in any stylesheet.
 */
const SAMPLE_TENANT_BRAND: ThemeOverrides = {
  dark: { "--color-accent": "#5fa8a0", "--dv-cat-1": "#5fa8a0" },
  light: { "--color-accent": "#2b5a54", "--dv-cat-1": "#3f847c" },
};

const SCHEME_ROWS = [
  { id: "r1", scheme: "Riverfront embankment II", released: "₹ 612 cr", status: "ok" as const, statusLabel: "On track" },
  { id: "r2", scheme: "Transit housing block C", released: "₹ 176 cr", status: "breach" as const, statusLabel: "Lapse risk" },
  { id: "r3", scheme: "Ward sanitation upgrade", released: "₹ 48 cr", status: "risk" as const, statusLabel: "At risk" },
];

const COLOR_ROLES = [
  { token: "--color-bg", note: "page ground" },
  { token: "--color-surface", note: "cards, panels" },
  { token: "--color-text", note: "primary text" },
  { token: "--color-accent", note: "tenant brand · lines and marks" },
];

export default function Gallery({ theme, density, themeHref, densityHref }: ViewProps) {
  const [tab, setTab] = useState("tab-overview");
  const [kpiOn, setKpiOn] = useState(true);
  const [notifOn, setNotifOn] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [accent, setAccent] = useState("#9184d9");

  const ratio = contrastRatio(accent, theme === "dark" ? "#161826" : "#eef0f8");

  return (
    <div className="ax-page">
      <header className="ax-topbar">
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width: 20,
            height: 20,
            borderRadius: 6,
            border: "1px solid var(--color-accent)",
            background: "linear-gradient(140deg, color-mix(in srgb, var(--color-accent) 45%, transparent), transparent 70%)",
          }}
        />
        <h1 style={{ fontSize: 15, margin: 0 }}>Airawat design system</h1>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Nocturne · every value swappable at runtime
        </span>
        {/* Links, not buttons: the state lives in the URL, so the audit can
            load either theme directly and a reader can bookmark one. */}
        <nav aria-label="Gallery display" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <ButtonLink href={densityHref} style={{ fontSize: 12 }}>
            Density: {density === "compact" ? "Compact" : "Comfortable"}
          </ButtonLink>
          <ButtonLink href={themeHref} style={{ fontSize: 12 }}>
            Theme: {theme === "dark" ? "Dark" : "Light"}
          </ButtonLink>
        </nav>
      </header>

      <main className="ax-main">
        {/* ── colour roles ─────────────────────────────────────────────── */}
        <section aria-labelledby="s-color">
          <h2 className="ax-section-title" id="s-color">
            Colour roles
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {COLOR_ROLES.map((role) => (
              <div className="ax-swatch" key={role.token}>
                <div className="ax-swatch-chip" style={{ background: `var(${role.token})` }} />
                <div className="ax-swatch-label">
                  <code>{role.token}</code>
                  <span className="ax-swatch-note">{role.note}</span>
                </div>
              </div>
            ))}
            <div className="ax-swatch">
              <div
                className="ax-swatch-chip"
                style={{
                  background:
                    "linear-gradient(to right, transparent, var(--color-divider) 30%, var(--color-divider) 70%, transparent), var(--color-surface)",
                }}
              />
              <div className="ax-swatch-label">
                <code>--color-divider</code>
                <span className="ax-swatch-note">rules fade at their ends</span>
              </div>
            </div>
          </div>
          <div className="ax-row" style={{ marginTop: 14 }}>
            <span className="text-muted" style={{ fontSize: 11, marginRight: 4 }}>
              Status is never hue alone — every status tag carries a mark and a word:
            </span>
            <StatusTag status="ok">On track</StatusTag>
            <StatusTag status="risk">At risk</StatusTag>
            <StatusTag status="breach">Breached</StatusTag>
          </div>
        </section>

        {/* ── data-viz ─────────────────────────────────────────────────── */}
        <section aria-labelledby="s-dataviz">
          <h2 className="ax-section-title" id="s-dataviz">
            Data-viz palette
          </h2>
          <div className="ax-grid" style={{ ["--ax-grid-min" as string]: "260px" }}>
            <div className="ax-panel">
              <p className="ax-panel-title">Categorical · 6 series max</p>
              <div className="ax-ramp">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <span key={n} style={{ background: `var(--dv-cat-${n})` }} />
                ))}
              </div>
              <p className="text-muted" style={{ fontSize: 10, margin: 0 }}>
                Series 1 follows the tenant accent; the rest stay fixed for recognition.
              </p>
            </div>
            <div className="ax-panel">
              <p className="ax-panel-title">Sequential · low → high</p>
              <div className="ax-ramp">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} style={{ background: `var(--dv-seq-${n})` }} />
                ))}
              </div>
              <p className="text-muted" style={{ fontSize: 10, margin: 0 }}>
                One-hue lightness ramp — the order reads without colour vision.
              </p>
            </div>
            <div className="ax-panel">
              <p className="ax-panel-title">Diverging · deficit → surplus</p>
              <div className="ax-ramp">
                <span style={{ background: "var(--dv-div-neg)" }} />
                <span style={{ background: "color-mix(in srgb, var(--dv-div-neg) 45%, var(--dv-div-mid))" }} />
                <span style={{ background: "var(--dv-div-mid)" }} />
                <span style={{ background: "color-mix(in srgb, var(--dv-div-pos) 45%, var(--dv-div-mid))" }} />
                <span style={{ background: "var(--dv-div-pos)" }} />
              </div>
              <p className="text-muted" style={{ fontSize: 10, margin: 0 }}>
                Rose–teal pair, distinguishable under deutan and protan vision.
              </p>
            </div>
          </div>
        </section>

        {/* ── type, spacing, elevation, actions ────────────────────────── */}
        <section aria-labelledby="s-foundations">
          <h2 className="ax-section-title" id="s-foundations">
            Type, spacing, elevation
          </h2>
          <div className="ax-grid">
            <div className="ax-panel">
              <span style={{ fontSize: 42, fontFamily: "var(--font-heading)", lineHeight: 1.1 }}>Display 42</span>
              <span style={{ fontSize: 25, fontFamily: "var(--font-heading)" }}>Heading 25</span>
              <span style={{ fontSize: 17, fontFamily: "var(--font-heading)" }}>Title 17</span>
              <span style={{ fontSize: 15 }}>
                Body 15 — Inter over Inter; hierarchy is size and space, never weight past 500.
              </span>
              <span className="text-muted" style={{ fontSize: 11 }}>
                Caption 11 · KPI KICKERS ARE 10 UPPERCASE TRACKED
              </span>
            </div>

            <div className="ax-panel">
              <p className="ax-panel-title">Spacing scale · density {density}</p>
              <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                {(["1", "2", "3", "4", "6", "8"] as const).map((n, i) => (
                  <span
                    key={n}
                    style={{
                      width: `var(--space-${n})`,
                      height: 34,
                      display: "block",
                      background: i < 2 ? "var(--color-accent-700)" : i < 4 ? "var(--color-accent-600)" : "var(--color-accent)",
                    }}
                  />
                ))}
              </div>
              <p className="text-muted" style={{ fontSize: 10, margin: 0 }}>
                Switch density in the header — spacing moves, type sizes hold.
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                {(["sm", "md", "lg"] as const).map((step) => (
                  <span
                    key={step}
                    className={`elev-${step}`}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-surface)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 10,
                    }}
                  >
                    elev-{step}
                  </span>
                ))}
              </div>
            </div>

            <div className="ax-panel">
              <p className="ax-panel-title">Buttons &amp; tags</p>
              <div className="ax-row">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
              </div>
              <div className="ax-row">
                <Tag tone="accent">Accent</Tag>
                <Tag tone="neutral">Neutral</Tag>
                <Tag tone="outline">Outline</Tag>
              </div>
              <p className="text-muted" style={{ fontSize: 10, margin: 0 }}>
                Primary is an accent outline, never a fill; focus is the 2px accent ring.
              </p>
            </div>
          </div>
        </section>

        {/* ── components and states ────────────────────────────────────── */}
        <section aria-labelledby="s-components">
          <h2 className="ax-section-title" id="s-components">
            Components &amp; states
          </h2>
          <div className="ax-grid">
            <div className="ax-panel">
              <p className="ax-panel-title">Form fields · default, error, disabled</p>
              <TextField id="g-scheme" label="Scheme name" placeholder="e.g. Ward sanitation upgrade" />
              <TextField
                id="g-amount"
                label="Sanctioned amount"
                defaultValue="₹ 46,2O0"
                error="Contains a letter O — check the figure."
              />
              <TextField id="g-head" label="Head code (locked after approval)" defaultValue="4217-60-051" disabled />
              <div className="ax-row" style={{ gap: 14 }}>
                <SegmentedControl
                  name="g-den"
                  legend="Row density"
                  options={[
                    { value: "comfortable", label: "Comfortable" },
                    { value: "compact", label: "Compact" },
                  ]}
                  defaultValue="comfortable"
                />
                <RadioGroup
                  name="g-tenancy"
                  legend="Database tenancy"
                  visuallyHiddenLegend
                  options={[
                    { value: "shared", label: "Shared" },
                    { value: "isolated", label: "Isolated" },
                  ]}
                  defaultValue="shared"
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <div className="ax-panel">
                <p className="ax-panel-title">KPI stat tile · default and at-risk</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatTile kicker="Utilization" value="68.4%" percent={68.4} meterLabel="Utilization, 68.4 percent" />
                  <StatTile
                    kicker="Approvals age"
                    value="19 d"
                    flagged
                    badge={<StatusTag status="breach">Over threshold</StatusTag>}
                    footnote="threshold 14 d"
                  />
                </div>
              </div>
              <div className="ax-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <p className="ax-panel-title" style={{ margin: 0 }}>
                    Chart card · categorical series
                  </p>
                  <span className="text-muted" style={{ fontSize: 10 }}>
                    ₹ cr
                  </span>
                </div>
                <svg
                  viewBox="0 0 300 80"
                  width="100%"
                  height="90"
                  role="img"
                  aria-label="Released against sanctioned, two series across six periods, both rising"
                >
                  <line x1="0" y1="68" x2="300" y2="68" stroke="var(--color-divider)" />
                  {[
                    [16, 30, 38, 44, 24],
                    [66, 24, 44, 38, 30],
                    [116, 34, 34, 42, 26],
                    [166, 18, 50, 30, 38],
                    [216, 26, 42, 22, 46],
                    [266, 12, 56, 18, 50],
                  ].map(([x, y1, h1, y2, h2]) => (
                    <g key={x}>
                      <rect x={x} y={y1} width="14" height={h1} fill="var(--dv-cat-1)" />
                      <rect x={x + 16} y={y2} width="14" height={h2} fill="var(--dv-cat-2)" />
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            <div className="ax-panel">
              <p className="ax-panel-title">Filter bar + data table states</p>
              <div className="ax-row">
                <label htmlFor="g-search" className="text-muted" style={{ fontSize: 11 }}>
                  Search
                </label>
                <input id="g-search" className="input" placeholder="Search schemes…" style={{ maxWidth: 160, minHeight: 32 }} />
                <Tag tone="accent">Water works ×</Tag>
                <Tag tone="neutral">FY 2026–27 ×</Tag>
                <Button variant="ghost" style={{ fontSize: 12 }}>
                  Clear
                </Button>
              </div>
              <DataTable
                caption="Schemes matching the current filters"
                columns={[
                  { key: "scheme", header: "Scheme", sort: "descending", cell: (r) => r.scheme },
                  { key: "released", header: "Released", cell: (r) => r.released },
                  {
                    key: "status",
                    header: "Status",
                    cell: (r) => <StatusTag status={r.status}>{r.statusLabel}</StatusTag>,
                  },
                ]}
                rows={SCHEME_ROWS}
                rowKey={(r) => r.id}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <EmptyState>No schemes match these filters.</EmptyState>
                <LoadingRow>Loading rows…</LoadingRow>
              </div>
            </div>

            <div className="ax-panel">
              <p className="ax-panel-title">Stepper, tabs, module toggle</p>
              <Stepper
                label="Onboarding progress"
                steps={[
                  { label: "Organisation", state: "done" },
                  { label: "Modules", state: "current" },
                  { label: "Branding", state: "upcoming" },
                ]}
              />
              <Tabs
                label="Workspace sections"
                selectedId={tab}
                onSelect={setTab}
                tabs={[
                  { id: "tab-overview", label: "Overview", panelId: "panel-overview" },
                  { id: "tab-financials", label: "Financials", panelId: "panel-financials" },
                  { id: "tab-kpis", label: "KPIs", panelId: "panel-kpis" },
                ]}
              />
              <div
                id={tab.replace("tab-", "panel-")}
                role="tabpanel"
                aria-labelledby={tab}
                tabIndex={0}
                className="text-muted"
                style={{ fontSize: 11 }}
              >
                {tab === "tab-overview" && "Overview panel content."}
                {tab === "tab-financials" && "Financials panel content."}
                {tab === "tab-kpis" && "KPIs panel content."}
              </div>
              <ModuleToggle
                id="g-mod-kpi"
                label="KPI Monitoring"
                hint="Thresholds and status"
                checked={kpiOn}
                onChange={setKpiOn}
              />
              <ModuleToggle
                id="g-mod-notif"
                label="Notifications"
                hint="Digest and escalation mail"
                checked={notifOn}
                onChange={setNotifOn}
              />
              <LockedModuleRow
                label="Single sign-on"
                hint="Above your tier"
                action={
                  <Button variant="ghost" style={{ fontSize: 11 }}>
                    Tier 3 ↗
                  </Button>
                }
              />
              {/* The contrast validator that Gate D's colour picker will use. */}
              <div className="ax-row">
                <label htmlFor="g-accent" style={{ fontSize: 11 }}>
                  Accent
                </label>
                <input
                  id="g-accent"
                  type="color"
                  value={accent}
                  onChange={(event) => setAccent(event.target.value)}
                  style={{ width: 34, height: 26, padding: 0, border: 0, background: "transparent" }}
                />
                {ratio === null ? (
                  <Tag tone="outline">not measurable</Tag>
                ) : (
                  <Tag tone={ratio >= 3 ? "neutral" : "outline"}>
                    {ratio >= 3 ? "✓ " : "! "}
                    {formatContrastRatio(ratio)}
                  </Tag>
                )}
                <span className="text-muted" style={{ fontSize: 10 }}>
                  measured against the page ground; 3:1 is the floor for chrome
                </span>
              </div>
            </div>

            <div className="ax-panel">
              <p className="ax-panel-title">Dialog, toast, file upload</p>
              <div
                style={{
                  borderRadius: "var(--radius-md)",
                  background: "color-mix(in srgb, var(--color-neutral-900) 50%, transparent)",
                  padding: 18,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {/* The surface, not the modal — a specimen, so it must not trap
                    focus or announce itself as an open dialog. */}
                <DialogSurface
                  titleId="g-dialog-specimen"
                  title="Remove sample data?"
                  actions={
                    <>
                      <Button style={{ fontSize: 12 }}>Cancel</Button>
                      <Button variant="primary" style={{ fontSize: 12 }}>
                        Remove
                      </Button>
                    </>
                  }
                >
                  The demonstration portfolio is deleted permanently. Your own entries are untouched.
                </DialogSurface>
              </div>
              <Button variant="secondary" onClick={() => setModalOpen(true)} style={{ fontSize: 12 }}>
                Open the real modal
              </Button>
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                titleId="g-dialog-live"
                title="Remove sample data?"
                actions={
                  <>
                    <Button style={{ fontSize: 12 }} onClick={() => setModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" style={{ fontSize: 12 }} onClick={() => setModalOpen(false)}>
                      Remove
                    </Button>
                  </>
                }
              >
                Focus is trapped, Escape closes, and the page behind is inert — all from the native dialog element.
              </Modal>
              <Toast>✓ Theme saved. Your users see it on next sign-in.</Toast>
              <FileDrop id="g-logo" label="Drop your logo here" hint="SVG or PNG · 2 MB max" accept="image/svg+xml,image/png" />
              <InlineAlert>
                Couldn&rsquo;t reach the treasury feed. Figures show the last good sync.{" "}
                <a href="#s-components">Retry</a>
              </InlineAlert>
            </div>
          </div>
        </section>

        {/* ── both themes, one component set ───────────────────────────── */}
        <section aria-labelledby="s-themes">
          <h2 className="ax-section-title" id="s-themes">
            Both themes · one component set
          </h2>
          <p className="text-muted" style={{ fontSize: 13, maxWidth: "44rem", marginBottom: 18 }}>
            The same fragment twice, built from the same primitives. The left island is the platform
            theme on the dark ground; the right is the light peer with an example tenant&rsquo;s role
            values handed in as data. Nothing below is a screenshot and no tenant is named in any
            stylesheet — the only difference between the two is the token values in scope.
          </p>
          <div className="ax-grid" style={{ ["--ax-grid-min" as string]: "340px" }}>
            <ThemeIsland theme="dark" caption="Platform theme · dark ground" />
            <ThemeIsland theme="light" caption="Example tenant · light ground" overrides={SAMPLE_TENANT_BRAND} />
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * One themed island. A nested `NocturneRoot`, which is what proves the scope
 * root is genuinely re-enterable: two of them on one page, each with its own
 * theme and its own role overrides, neither leaking into the other.
 */
function ThemeIsland({
  theme,
  caption,
  overrides,
}: {
  theme: ThemeName;
  caption: string;
  overrides?: ThemeOverrides;
}) {
  return (
    <NocturneRoot
      theme={theme}
      overrides={overrides}
      style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-md)" }}
    >
      <div className="nav" style={{ gap: 8, padding: "10px 14px" }}>
        <span
          aria-hidden="true"
          style={{ width: 15, height: 15, borderRadius: 4, border: "1px solid var(--color-accent)", display: "block" }}
        />
        <span className="nav-brand" style={{ fontSize: 12 }}>
          {caption}
        </span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <StatTile kicker="Utilization" value="68.4%" percent={68.4} meterLabel="Utilization, 68.4 percent" />
          <StatTile kicker="Released" value="₹ 4,812 cr" footnote="of ₹ 7,040 cr" />
        </div>
        <svg viewBox="0 0 300 54" width="100%" height="54" preserveAspectRatio="none" role="img" aria-label="Release trend, rising across six periods">
          <path d="M0 44 L60 38 L120 33 L180 26 L240 18 L300 8 L300 54 L0 54 Z" fill="var(--color-accent)" opacity="0.15" />
          <path d="M0 44 L60 38 L120 33 L180 26 L240 18 L300 8" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        </svg>
        <div className="ax-row">
          <Button variant="primary" style={{ fontSize: 12 }}>
            Export report
          </Button>
          <StatusTag status="risk">At risk</StatusTag>
        </div>
      </div>
    </NocturneRoot>
  );
}
