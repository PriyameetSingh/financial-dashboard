import { notFound } from "next/navigation";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { isDensity, isThemeName, type Density, type ThemeName } from "@/components/nocturne/theme";
import Gallery from "./Gallery";

/**
 * The component gallery — a dev/internal surface, not a product page.
 *
 * It exists for three jobs:
 *
 *   1. It is where the primitives are looked at. A design system whose only
 *      rendering is inside the features that use it cannot be reviewed.
 *   2. It is the fixture the accessibility audit runs against
 *      (`scripts/check-a11y.mjs`, golden leg 10). Every primitive appears here
 *      in every state, so an axe pass over this one URL covers the whole set —
 *      which is why a primitive that is not in the gallery is a primitive
 *      nothing checks.
 *   3. It renders both themes at once, which is the only cheap way to catch a
 *      value that is legible on one ground and not the other. Three of the
 *      contrast corrections in `tokens.css` were found exactly this way.
 *
 * DEV-ONLY, by the same mechanism as the dev session route: Next inlines
 * `process.env.NODE_ENV` at build time, so in a production build this comparison
 * folds to a constant and the branch below becomes an unconditional `notFound()`.
 * The gallery cannot be reached on a deployed artifact.
 *
 * Theme and density come from the query string rather than from client state so
 * that the audit can request either directly, without driving the UI.
 */
export const metadata = {
  title: "Airawat design system",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DesignSystemPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const themeParam = first(params.theme);
  const densityParam = first(params.density);

  const theme: ThemeName = isThemeName(themeParam) ? themeParam : "dark";
  const density: Density = isDensity(densityParam) ? densityParam : "comfortable";

  // Built from the validated values, never from the raw query, so an unexpected
  // parameter cannot survive a round trip through the toggle links.
  const hrefFor = (next: { theme?: ThemeName; density?: Density }) =>
    `?theme=${next.theme ?? theme}&density=${next.density ?? density}`;

  return (
    <NocturneRoot theme={theme} density={density} style={{ minHeight: "100vh" }}>
      <Gallery
        theme={theme}
        density={density}
        themeHref={hrefFor({ theme: theme === "dark" ? "light" : "dark" })}
        densityHref={hrefFor({ density: density === "compact" ? "comfortable" : "compact" })}
      />
    </NocturneRoot>
  );
}
