import type { Metadata } from "next";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { Card, StatTile, StatusTag, Tag } from "@/components/nocturne";
import { isThemeName, type ThemeName } from "@/components/nocturne/theme";
import {
  PLANNED_MODULES,
  PLATFORM_FIGURES,
  RESOLVED_PLANS,
  SELLABLE_MODULES,
  TOUR_MODULES,
} from "@/lib/platform/landing";
import { landingLinks } from "@/lib/platform/links";

/**
 * S1 — the public landing page.
 *
 * PUBLIC, and the only page in this application that is. It reads no session,
 * no tenant and no database: the module list, the plan contents and every count
 * on the page are derived at build time from `MODULE_CATALOG` (see
 * `lib/platform/landing.ts`). That is not only a rule being obeyed — a page
 * reachable without a session that queried tenant rows would be an unscoped
 * cross-tenant read, and the Prisma chokepoint would (correctly) refuse it at
 * runtime. There is nothing here for it to refuse.
 *
 * SERVER-RENDERED, with no client component at all. The two pieces of state the
 * page has — the theme and which module the tour is showing — live in the query
 * string and move by ordinary links. That keeps the page fast, linkable and
 * indexable, and it means the tour works with JavaScript unavailable, which for
 * a page whose audience includes procurement officers on managed desktops is
 * not a hypothetical.
 *
 * THEME: the platform's own dark ground by default. This page is Airawat's, not
 * a tenant's, so it carries no tenant overrides — the whole point of the
 * landing is what the product looks like before anyone has configured it.
 */
export const metadata: Metadata = {
  title: "Airawat — finance and governance dashboards",
  description:
    "Track budget utilization, treasury releases, scheme progress and KPIs in one dashboard, under your own branding, locale and module set.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformLandingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const themeParam = first(params.theme);
  const theme: ThemeName = isThemeName(themeParam) ? themeParam : "dark";

  // The tour selection is validated against the catalog-derived list, so an
  // arbitrary query value falls back to the first module rather than rendering
  // an empty panel.
  const moduleParam = first(params.module);
  const active = TOUR_MODULES.find((m) => m.code === moduleParam) ?? TOUR_MODULES[0];

  const links = landingLinks();
  const otherTheme: ThemeName = theme === "dark" ? "light" : "dark";
  const href = (next: { theme?: ThemeName; module?: string }, hash = "") =>
    `?theme=${next.theme ?? theme}&module=${next.module ?? active.code}${hash}`;

  return (
    <NocturneRoot theme={theme}>
      <div className="ax-lp-root">
        <a href="#top" className="btn btn-secondary ax-skip">
          Skip to content
        </a>

        <header className="ax-lp-header">
          <div className="ax-lp-shell ax-lp-bar">
            <a href="#top" className="ax-lp-brand">
              <span className="ax-lp-mark" aria-hidden="true" />
              <span className="ax-lp-wordmark">Airawat</span>
              <span className="ax-lp-suffix">Finance Dashboard</span>
            </a>
            <nav className="ax-lp-nav" aria-label="Sections">
              <a href="#platform">Platform</a>
              <a href="#modules">Modules</a>
              <a href="#trust">Security</a>
              <a href="#plans">Plans</a>
            </nav>
            <div className="ax-row" style={{ gap: 8 }}>
              <a className="btn btn-secondary" href={href({ theme: otherTheme })} style={{ fontSize: 12 }}>
                {theme === "dark" ? "Light theme" : "Dark theme"}
              </a>
              <a
                className="btn btn-primary"
                href={links.demo}
                {...(links.demoIsExternal ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                See the live demo
                {links.demoIsExternal ? <span className="ax-sr-only"> (opens in a new tab)</span> : null}
              </a>
            </div>
          </div>
        </header>

        <main>
          {/* ── hero ─────────────────────────────────────────────────────── */}
          <section id="top" className="ax-lp-shell ax-lp-hero">
            <div style={{ maxWidth: "34rem" }}>
              <Tag tone="accent">Your brand · your modules · your locale</Tag>
              <h1 className="ax-lp-title">
                Every rupee, every scheme, every KPI on one dashboard your leadership trusts
              </h1>
              <p className="ax-lp-lede">
                Track budget utilization, treasury releases, scheme progress and KPIs in one place —
                under your logo, in your currency, on your fiscal year. We configure the platform
                for your organization, so you go live in days rather than budget cycles.
              </p>
              <div className="ax-lp-actions">
                <a
                  className="btn btn-primary"
                  href={links.demo}
                  {...(links.demoIsExternal ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  See the live demo
                  {links.demoIsExternal ? <span className="ax-sr-only"> (opens in a new tab)</span> : null}
                </a>
                <a className="btn btn-secondary" href={links.onboarding}>
                  Onboard your organization
                </a>
              </div>
              <p className="ax-lp-intro" style={{ fontSize: 13, marginTop: 20 }}>
                No custom development · WCAG 2.1 AA · hosted with us or in your environment
              </p>
            </div>

            {/*
              An illustration of the product, marked as one. The figures are
              invented and the caption says so, in the design's own words. The
              alternative — reading the demonstration tenant's real figures —
              would be a cross-tenant read from an unauthenticated page, which
              this phase forbids and the Prisma chokepoint would refuse anyway.
            */}
            <figure className="ax-lp-figure" style={{ margin: 0 }}>
              <div className="ax-lp-figure-head">
                <span className="ax-lp-mark" style={{ width: 16, height: 16 }} aria-hidden="true" />
                <span>A configured workspace</span>
                <span className="ax-lp-suffix" style={{ marginLeft: "auto", border: 0, padding: 0 }}>
                  Illustration
                </span>
              </div>
              <div className="ax-lp-figure-body">
                <div className="ax-lp-tiles">
                  <StatTile
                    kicker="Utilization"
                    value="68.4%"
                    percent={68.4}
                    meterLabel="Illustrative utilization, 68.4 percent"
                  />
                  <StatTile kicker="Released" value="₹ 4,812 cr" footnote="of ₹ 7,040 cr allotted" />
                  <StatTile kicker="Lapse risk" value="7" footnote="schemes flagged" flagged />
                </div>
                <div className="ax-stat">
                  <div className="ax-panel-title" style={{ marginBottom: 8 }}>
                    Treasury releases, 12 months
                  </div>
                  <svg
                    viewBox="0 0 320 74"
                    width="100%"
                    height="74"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Illustrative twelve-month treasury release trend, rising"
                  >
                    <defs>
                      <linearGradient id="lp-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 58 L29 52 L58 55 L87 44 L116 47 L145 36 L174 30 L203 34 L232 24 L261 18 L290 21 L320 9 L320 74 L0 74 Z"
                      fill="url(#lp-fill)"
                    />
                    <path
                      d="M0 58 L29 52 L58 55 L87 44 L116 47 L145 36 L174 30 L203 34 L232 24 L261 18 L290 21 L320 9"
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="1.6"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
                <div className="ax-row" style={{ fontSize: 11 }}>
                  <StatusTag status="ok">4 approvals pending</StatusTag>
                  <StatusTag status="breach">2 alerts</StatusTag>
                </div>
              </div>
              <figcaption style={{ padding: "0 14px 12px" }}>
                Illustration. The figures are invented — Airawat holds no real financial data on
                this page.
              </figcaption>
            </figure>
          </section>

          {/* ── the one saturated band ───────────────────────────────────── */}
          <div className="ax-lp-band">
            <div className="ax-lp-shell ax-lp-band-grid">
              <div>
                <div className="ax-lp-band-figure">{PLATFORM_FIGURES.sellableModules}</div>
                <div className="ax-lp-band-label">modules, toggled per organization</div>
              </div>
              <div>
                <div className="ax-lp-band-figure">Config-only</div>
                <div className="ax-lp-band-label">onboarding, no engineering</div>
              </div>
              <div>
                <div className="ax-lp-band-figure">Live in days</div>
                <div className="ax-lp-band-label">from profile to launched workspace</div>
              </div>
              <div>
                <div className="ax-lp-band-figure">AA</div>
                <div className="ax-lp-band-label">WCAG 2.1, light and dark</div>
              </div>
            </div>
          </div>

          {/* ── why ──────────────────────────────────────────────────────── */}
          <section id="platform" className="ax-lp-shell ax-lp-section" aria-labelledby="h-platform">
            <p className="ax-section-title">Why organizations choose Airawat</p>
            <h2 className="ax-lp-h2" id="h-platform" style={{ maxWidth: "26rem" }}>
              Configured for your organization, not rebuilt for it
            </h2>
            <p className="ax-lp-intro">
              You get your own branding, locale and module set. Every improvement we ship arrives in
              your workspace without an upgrade project.
            </p>
            <div className="ax-lp-cards">
              <Card kicker="Tenancy" title="Your organization, your identity" elevation="sm">
                Your logo, colours, typography, density and locale — set by your own administrators,
                applied everywhere, changeable any day.
              </Card>
              <Card kicker="Delivery" title="Live in days, without developers" elevation="sm">
                A guided setup covers your profile, branding, locale, modules, starter data and
                people. Pause and resume it as approvals come through.
              </Card>
              <Card kicker="Governance" title="Everyone sees exactly what they should" elevation="sm">
                Roles scoped to departments and schemes, and an audit trail that answers who changed
                or approved what, and when.
              </Card>
              <Card kicker="Coverage" title="One set of numbers, agreed across teams" elevation="sm">
                Utilization, releases against allotment, KPI thresholds and scheme progress come
                from one source, so no two reports disagree.
              </Card>
              <Card kicker="Outputs" title="Meeting packs in minutes" elevation="sm">
                Agenda, KPI summary, financials and action items assemble into a print-ready pack
                your office can circulate the same morning.
              </Card>
            </div>
          </section>

          {/* ── module tour ──────────────────────────────────────────────── */}
          <section id="modules" className="ax-lp-shell ax-lp-section" aria-labelledby="h-modules">
            <p className="ax-section-title">Module tour</p>
            <h2 className="ax-lp-h2" id="h-modules" style={{ maxWidth: "24rem" }}>
              What your teams see on day one
            </h2>

            {/*
              Links, not an ARIA tablist. A tablist is a JavaScript widget — it
              needs roving focus and arrow-key handling to be usable, and this
              page ships no JavaScript. Navigation with `aria-current` is the
              honest description of what these actually are: five links that
              each load a section of the page.
            */}
            <ul className="ax-lp-tour-nav" aria-label="Choose a module">
              {TOUR_MODULES.map((mod) => {
                const selected = mod.code === active.code;
                return (
                  <li key={mod.code}>
                    <a
                      className={selected ? "btn btn-primary" : "btn btn-secondary"}
                      href={href({ module: mod.code }, "#modules")}
                      aria-current={selected ? "true" : undefined}
                    >
                      {mod.name}
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="ax-lp-tour-panel">
              <div style={{ maxWidth: "26rem" }}>
                <h3 style={{ fontSize: 23 }}>{active.name}</h3>
                <p style={{ fontSize: 14, margin: 0 }}>{active.copy.summary}</p>
                <ul className="ax-lp-tour-points">
                  {active.copy.highlights.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="ax-panel-title">Included from</p>
                <p style={{ fontSize: 13, marginTop: 6 }}>
                  {RESOLVED_PLANS.find((plan) => plan.modules.some((m) => m.code === active.code))
                    ?.name ?? "Institution"}{" "}
                  and above.
                </p>
                <p className="ax-lp-intro" style={{ fontSize: 13, marginTop: 14 }}>
                  {active.enforcement === "core"
                    ? "Part of every workspace — it cannot be switched off, because without it the workspace cannot be administered."
                    : "Switched on or off per organization by your administrators, at any time."}
                </p>
              </div>
            </div>

            {/* The complete set, so the tour's five are visibly a selection
                rather than the whole product. */}
            <h3 style={{ fontSize: 17, margin: "40px 0 6px" }}>Every module</h3>
            <p className="ax-lp-intro" style={{ fontSize: 13 }}>
              {PLATFORM_FIGURES.sellableModules} available today,{" "}
              {PLATFORM_FIGURES.gatedModules} of them switchable per organization.
            </p>
            <div className="ax-lp-cards" style={{ marginTop: 18 }}>
              {SELLABLE_MODULES.map((mod) => (
                <Card
                  key={mod.code}
                  kicker={mod.enforcement === "core" ? "Always included" : "Optional"}
                  title={mod.name}
                  elevation="sm"
                  meta={<Tag tone="neutral">{mod.code}</Tag>}
                >
                  {mod.copy.summary}
                </Card>
              ))}
            </div>

            {PLANNED_MODULES.length > 0 ? (
              <>
                <h3 style={{ fontSize: 17, margin: "40px 0 6px" }}>On the roadmap</h3>
                <p className="ax-lp-intro" style={{ fontSize: 13 }}>
                  Named, planned, and not yet built. They are listed so you know what is coming, not
                  so you can buy them.
                </p>
                <div className="ax-row" style={{ marginTop: 14 }}>
                  {PLANNED_MODULES.map((mod) => (
                    <Tag key={mod.code} tone="outline">
                      {mod.name}
                    </Tag>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          {/* ── trust ────────────────────────────────────────────────────── */}
          <section id="trust" className="ax-lp-shell ax-lp-section" aria-labelledby="h-trust">
            <p className="ax-section-title">Security and isolation</p>
            <h2 className="ax-lp-h2" id="h-trust" style={{ maxWidth: "22rem" }}>
              Ready for audit, procurement and scrutiny
            </h2>
            <div className="ax-lp-trust">
              <div>
                <div className="ax-lp-trust-title">Role-based access</div>
                <p className="ax-lp-intro" style={{ fontSize: 13, margin: 0 }}>
                  Roles scoped by department, scheme and action, so officers see only what their
                  post requires.
                </p>
              </div>
              <div>
                <div className="ax-lp-trust-title">Per-organization data isolation</div>
                <p className="ax-lp-intro" style={{ fontSize: 13, margin: 0 }}>
                  Your data is separated from every other organization&rsquo;s, and that separation
                  is verified on every release.
                </p>
              </div>
              <div>
                <div className="ax-lp-trust-title">Audit trail</div>
                <p className="ax-lp-intro" style={{ fontSize: 13, margin: 0 }}>
                  A complete record of configuration changes, approvals and generated packs for your
                  auditors.
                </p>
              </div>
              <div>
                <div className="ax-lp-trust-title">Deployment options</div>
                <p className="ax-lp-intro" style={{ fontSize: 13, margin: 0 }}>
                  Hosted by us, or an isolated instance inside your own environment.
                </p>
              </div>
            </div>
          </section>

          {/* ── plans ────────────────────────────────────────────────────── */}
          <section id="plans" className="ax-lp-shell ax-lp-section" aria-labelledby="h-plans">
            <p className="ax-section-title">Plans</p>
            <h2 className="ax-lp-h2" id="h-plans" style={{ maxWidth: "24rem" }}>
              Choose the tier that matches your mandate
            </h2>
            <p className="ax-lp-intro">
              You can see every module we offer and enable more whenever your mandate grows. Pricing
              is quoted per organization.
            </p>
            <div className="ax-lp-cards">
              {RESOLVED_PLANS.map((plan) => (
                <Card
                  key={plan.id}
                  kicker={plan.rank}
                  title={plan.name}
                  elevation={plan.featured ? "md" : "sm"}
                  className={plan.featured ? "ax-lp-plan-featured" : undefined}
                  // The count and the button live outside `.card-body`: it is
                  // quieter than the rest of the card, and anything nested in it
                  // inherits that. See `Card`.
                  meta={
                    <span className="ax-lp-plan-count">
                      {plan.modules.length} modules · {plan.notes}
                    </span>
                  }
                  actions={
                    <a
                      className={plan.featured ? "btn btn-primary btn-block" : "btn btn-secondary btn-block"}
                      href={links.onboarding}
                    >
                      Request a quote
                    </a>
                  }
                >
                  {plan.summary}
                </Card>
              ))}
            </div>
          </section>

          {/* ── closing ──────────────────────────────────────────────────── */}
          <section className="ax-lp-shell" aria-labelledby="h-close">
            <div className="ax-lp-cta">
              <div>
                <h2 className="ax-lp-h2" id="h-close" style={{ maxWidth: "20rem", fontSize: "clamp(22px, 3vw, 32px)" }}>
                  See it on a working demonstration workspace
                </h2>
                <p className="ax-lp-intro" style={{ margin: 0, maxWidth: "28rem" }}>
                  A fully configured demonstration authority, with the same modules, dashboards and
                  report packs your organization would receive.
                </p>
              </div>
              <div className="ax-lp-actions" style={{ marginTop: 0 }}>
                <a
                  className="btn btn-primary"
                  href={links.demo}
                  {...(links.demoIsExternal ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  See the live demo
                  {links.demoIsExternal ? <span className="ax-sr-only"> (opens in a new tab)</span> : null}
                </a>
                <a className="btn btn-secondary" href={links.onboarding}>
                  Onboard your organization
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer className="ax-lp-footer">
          <div className="ax-lp-shell ax-lp-footer-grid">
            <div>
              <div className="ax-row" style={{ gap: 9 }}>
                <span className="ax-lp-mark" style={{ width: 18, height: 18 }} aria-hidden="true" />
                <span className="ax-lp-wordmark" style={{ fontSize: 15 }}>
                  Airawat
                </span>
              </div>
              <p className="ax-lp-intro" style={{ fontSize: 12, marginTop: 10 }}>
                Finance and governance dashboards for governments and large institutions.
              </p>
            </div>
            <nav className="ax-lp-footer-col" aria-label="Platform">
              <div className="ax-lp-footer-head">Platform</div>
              <a href="#modules">Modules</a>
              <a href="#platform">White-labelling</a>
              <a href="#plans">Plans</a>
            </nav>
            <nav className="ax-lp-footer-col" aria-label="Trust">
              <div className="ax-lp-footer-head">Trust</div>
              <a href="#trust">Security</a>
              <a href="#trust">Data isolation</a>
              <a href="#trust">Accessibility</a>
            </nav>
            <nav className="ax-lp-footer-col" aria-label="Organization">
              <div className="ax-lp-footer-head">Organization</div>
              <a href={links.onboarding}>Onboarding</a>
              <a href={links.signIn}>Sign in</a>
            </nav>
          </div>
          <div className="ax-lp-shell">
            <p className="ax-lp-fineprint">
              Figures shown belong to a demonstration organization. Airawat holds no real financial
              data on this page.
            </p>
          </div>
        </footer>
      </div>
    </NocturneRoot>
  );
}
