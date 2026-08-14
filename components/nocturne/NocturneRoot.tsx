import type { CSSProperties, ReactNode } from "react";
import {
  themeOverrideCss,
  type Density,
  type ThemeName,
  type ThemeOverrides,
} from "./theme";

import "./nocturne.css";
import "./tokens.css";
import "./primitives.css";

/**
 * The scope root for every Nocturne surface.
 *
 * Three jobs:
 *
 *   1. It carries the `.noct` class, which is what activates the entire token
 *      and component layer. None of `nocturne.css`, `tokens.css` or
 *      `primitives.css` matches anything outside this element, so the existing
 *      signed-off screens are untouched by construction rather than by care.
 *
 *   2. It sets `data-theme` and `data-density`, the two attributes the token
 *      layer reads. Both may also be set on any descendant to create an island
 *      in the other theme — the token layer's selectors are written for that.
 *
 *   3. It emits the tenant's runtime role overrides as a scoped style block.
 *      This is the mechanism that makes the token layer swappable: no tenant is
 *      named in any stylesheet, and a tenant's brand reaches the page as data.
 *
 * A server component. It reads nothing — the caller resolves the tenant and
 * hands the values in, which keeps this file usable from the gallery (no
 * tenant), the landing page (platform defaults) and a tenant workspace alike.
 */

/**
 * FNV-1a over the override payload. A content hash rather than a counter or a
 * random id so that the server and client markup agree, and so two roots with
 * identical overrides share one style block instead of emitting two.
 */
function scopeIdFor(overrides: ThemeOverrides | undefined): string {
  const source = JSON.stringify(overrides ?? {});
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `n${hash.toString(36)}`;
}

export type NocturneRootProps = {
  children: ReactNode;
  /** Defaults to the platform's dark ground. */
  theme?: ThemeName;
  /** Defaults to the design system's own 0.70× scale. */
  density?: Density;
  /** Tenant role values. Validated in `theme.ts`; invalid entries are dropped. */
  overrides?: ThemeOverrides;
  /** Extra classes on the scope root. `.noct` is always present. */
  className?: string;
  style?: CSSProperties;
};

export default function NocturneRoot({
  children,
  theme = "dark",
  density = "comfortable",
  overrides,
  className,
  style,
}: NocturneRootProps) {
  const scopeId = scopeIdFor(overrides);
  const css = themeOverrideCss(scopeId, overrides);

  return (
    <div
      className={className ? `noct ${className}` : "noct"}
      data-theme={theme}
      data-density={density}
      data-noct-scope={css ? scopeId : undefined}
      style={style}
    >
      {/* `themeOverrideCss` allowlists the property names and requires every
          value to be a plain hex colour, so the string here cannot contain
          markup or escape its own block. See `sanitizeRoleValues`. */}
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {children}
    </div>
  );
}
