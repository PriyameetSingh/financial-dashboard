import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, moduleByCode, type ModuleTier } from "@/lib/entitlements/catalog";
import { PUBLIC_AUTH_PATHS, PUBLIC_CONTENT_PATHS } from "@/lib/entitlements/public-paths";
import { resolveRouteModule } from "@/lib/entitlements/route-modules";
import {
  PLANNED_MODULES,
  PLATFORM_FIGURES,
  PLANS,
  RESOLVED_PLANS,
  SELLABLE_MODULES,
  TOUR_CODES,
  TOUR_MODULES,
} from "@/lib/platform/landing";
import { landingLinks } from "@/lib/platform/links";
import { withNextBasePath } from "@/lib/next-base-path";

/**
 * S1 — the public landing.
 *
 * Two properties are worth a test here, and they are of different kinds.
 *
 * The first is DRIFT. A marketing page is the one surface nobody re-reads after
 * it ships, so a module list written into it goes stale silently — it looks
 * right the day it is written and is wrong the first time the catalog changes.
 * Everything the page says about the product is therefore derived from
 * `MODULE_CATALOG`, and these tests assert the derivation is total: no module
 * without copy, no copy without a module, no tier belonging to no plan, no
 * count that is not counted.
 *
 * The second is EXPOSURE. This is the only page in the application reachable
 * without a session. `PUBLIC_CONTENT_PATHS` in the proxy is what makes it so,
 * and the invariant that keeps it safe — every path in that set maps to a core
 * module — is asserted here rather than trusted, because the failure mode is a
 * public 404 for the entire internet with no way for anyone outside the team to
 * notice why.
 */

describe("the landing's module copy is total over the catalog", () => {
  const sellableCodes = MODULE_CATALOG.filter((m) => m.enforcement !== "roadmap").map((m) => m.code);

  it("describes every sellable module, and only those", () => {
    // `SELLABLE_MODULES` throws at construction on a missing key, so reaching
    // this line already proves the forward direction. This pins the reverse:
    // copy for a module that no longer exists.
    expect(SELLABLE_MODULES.map((m) => m.code).sort()).toEqual([...sellableCodes].sort());
  });

  it("gives every module a summary and exactly three highlights", () => {
    for (const mod of SELLABLE_MODULES) {
      expect(mod.copy.summary.length, mod.code).toBeGreaterThan(20);
      expect(mod.copy.highlights, mod.code).toHaveLength(3);
      for (const point of mod.copy.highlights) {
        expect(point.length, `${mod.code}: "${point}"`).toBeGreaterThan(10);
      }
    }
  });

  it("does not describe roadmap modules as if they were buyable", () => {
    const sellable = new Set(SELLABLE_MODULES.map((m) => m.code));
    for (const planned of PLANNED_MODULES) {
      expect(sellable.has(planned.code), planned.code).toBe(false);
      expect(planned.enforcement).toBe("roadmap");
    }
  });

  it("accounts for every catalog row exactly once", () => {
    expect(SELLABLE_MODULES.length + PLANNED_MODULES.length).toBe(MODULE_CATALOG.length);
  });
});

describe("the module tour", () => {
  it("names only real, sellable modules", () => {
    for (const code of TOUR_CODES) {
      expect(moduleByCode(code), code).toBeDefined();
      expect(SELLABLE_MODULES.some((m) => m.code === code), code).toBe(true);
    }
  });

  it("is a selection, not the whole catalog — the full grid below it is", () => {
    expect(TOUR_MODULES.length).toBeGreaterThan(2);
    expect(TOUR_MODULES.length).toBeLessThan(SELLABLE_MODULES.length);
  });

  it("has no duplicates", () => {
    expect(new Set(TOUR_CODES).size).toBe(TOUR_CODES.length);
  });
});

describe("plans are derived from the catalog's tiers", () => {
  it("claims every tier present in the catalog, exactly once", () => {
    // The failure this prevents: a new tier is added to the catalog, no plan
    // includes it, and the modules on that tier quietly appear in no plan at
    // all — visible on the page as a module nobody can buy.
    const inCatalog = new Set(
      MODULE_CATALOG.map((m) => m.tier).filter((t): t is ModuleTier => t !== null),
    );
    const claimed = PLANS.flatMap((p) => p.adds);
    expect(new Set(claimed).size, "a tier is claimed by two plans").toBe(claimed.length);
    for (const tier of inCatalog) {
      expect(claimed.includes(tier), `no plan includes tier "${tier}"`).toBe(true);
    }
  });

  it("is cumulative — each plan contains everything the one below it does", () => {
    for (let i = 1; i < RESOLVED_PLANS.length; i += 1) {
      const below = new Set(RESOLVED_PLANS[i - 1].modules.map((m) => m.code));
      const here = new Set(RESOLVED_PLANS[i].modules.map((m) => m.code));
      for (const code of below) {
        expect(here.has(code), `${RESOLVED_PLANS[i].name} drops ${code}`).toBe(true);
      }
      expect(here.size, `${RESOLVED_PLANS[i].name} adds nothing`).toBeGreaterThan(below.size);
    }
  });

  it("puts every sellable module in the top plan", () => {
    const top = RESOLVED_PLANS[RESOLVED_PLANS.length - 1];
    expect(top.modules.length).toBe(SELLABLE_MODULES.length);
  });

  it("quotes no price — the design's call to action is a quote request", () => {
    for (const plan of RESOLVED_PLANS) {
      const text = `${plan.summary} ${plan.notes}`;
      expect(text, plan.name).not.toMatch(/[₹$€£]\s?\d/);
      expect(text, plan.name).not.toMatch(/\bper (user|month|year|seat)\b/i);
    }
  });
});

describe("the figures the page quotes about itself", () => {
  it("counts rather than asserts", () => {
    expect(PLATFORM_FIGURES.sellableModules).toBe(
      MODULE_CATALOG.filter((m) => m.enforcement !== "roadmap").length,
    );
    expect(PLATFORM_FIGURES.gatedModules).toBe(
      MODULE_CATALOG.filter((m) => m.enforcement === "gated").length,
    );
    expect(PLATFORM_FIGURES.plannedModules).toBe(
      MODULE_CATALOG.filter((m) => m.enforcement === "roadmap").length,
    );
  });
});

describe("the public surface", () => {
  it("maps every public-content path to a CORE module", () => {
    // The proxy passes `null` for the tenant on this branch, so a core module
    // short-circuits before any database access and anything else fails closed.
    // A gated mapping here would 404 the public internet.
    for (const path of PUBLIC_CONTENT_PATHS) {
      const resolved = resolveRouteModule(path);
      // `toBeDefined` would pass on null, which is exactly the unmapped case.
      expect(resolved, `${path} maps to no module`).not.toBeNull();
      expect(resolved?.enforcement, `${path} → ${resolved?.module}`).toBe("core");
    }
  });

  it("keeps the two public sets disjoint", () => {
    // They behave differently for a signed-in visitor — one redirects onward,
    // the other renders. A path in both would take whichever branch runs first,
    // which is not a thing anyone should have to know.
    for (const path of PUBLIC_CONTENT_PATHS) {
      expect(PUBLIC_AUTH_PATHS.has(path), `${path} is in both public sets`).toBe(false);
    }
  });

  it("is small, and every entry is deliberate", () => {
    // Not a style rule. Every path here is one more thing served to anonymous
    // callers, so the set growing should be a decision someone makes, not a
    // diff someone skims.
    expect([...PUBLIC_CONTENT_PATHS].sort()).toEqual(["/auth/error", "/onboarding", "/platform"]);
  });
});

describe("landing links", () => {
  const original = process.env.AIRAWAT_DEMO_URL;

  /** Sets the env var for one call and always puts it back. */
  function withDemoUrl<T>(value: string | undefined, fn: () => T): T {
    if (value === undefined) delete process.env.AIRAWAT_DEMO_URL;
    else process.env.AIRAWAT_DEMO_URL = value;
    try {
      return fn();
    } finally {
      if (original === undefined) delete process.env.AIRAWAT_DEMO_URL;
      else process.env.AIRAWAT_DEMO_URL = original;
    }
  }

  it("falls back to this deployment's sign-in when no demo host is configured", () => {
    withDemoUrl(undefined, () => {
      const links = landingLinks();
      expect(links.demo).toBe(withNextBasePath("/login"));
      expect(links.demoIsExternal).toBe(false);
    });
  });

  it("uses a configured absolute URL and marks it external", () => {
    withDemoUrl("https://demo.airawat.example/hudd-dashboard", () => {
      const links = landingLinks();
      expect(links.demo).toBe("https://demo.airawat.example/hudd-dashboard");
      expect(links.demoIsExternal).toBe(true);
    });
  });

  it("ignores anything that is not an http(s) URL", () => {
    // The value comes from deployment configuration, but a `javascript:` URL
    // reaching an href is a stored-XSS shape whatever its provenance, and the
    // cost of rejecting it is one line.
    for (const bad of ["javascript:alert(1)", "not a url", "/relative/path", "data:text/html,x"]) {
      withDemoUrl(bad, () => {
        const links = landingLinks();
        expect(links.demo, bad).toBe(withNextBasePath("/login"));
        expect(links.demoIsExternal, bad).toBe(false);
      });
    }
  });

  it("puts the base path on every same-origin link", () => {
    withDemoUrl(undefined, () => {
      const links = landingLinks();
      expect(links.platform).toBe(withNextBasePath("/platform"));
      expect(links.demo).toBe(withNextBasePath("/login"));
      expect(links.onboarding).toBe(withNextBasePath("/onboarding"));
      expect(links.signIn).toBe(withNextBasePath("/login"));
    });
  });
});
