/**
 * Centralized formatting helpers. Read the locale + currency symbol/unit from
 * tenant config so 126 inline `₹` / 35 inline `"en-IN"` literals become one
 * config lookup instead of independent hardcoded values.
 *
 * Output is bit-for-bit identical to today's Odisha build under defaults
 * (locale `en-IN`, symbol `₹`, unit `Cr`). The golden net pins exact strings.
 */

import { tenantConfig } from "./index";

type FormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Format a number using the tenant locale. Replaces inline
 * `value.toLocaleString("en-IN", { ... })`.
 */
export function formatNumber(
  value: number,
  opts: FormatOptions = {},
): string {
  const { locale } = tenantConfig();
  return value.toLocaleString(locale, {
    minimumFractionDigits: opts.minimumFractionDigits,
    maximumFractionDigits: opts.maximumFractionDigits,
  });
}

/**
 * Format a monetary value with the tenant currency symbol and unit.
 * `withUnit: true` (default) appends the currency unit (e.g. "Cr").
 *
 * Replaces inline `₹${value.toLocaleString("en-IN", {...})} Cr` patterns.
 * Output under defaults: `₹<locale-formatted> Cr`.
 */
export function formatCurrency(
  value: number,
  opts: FormatOptions & { withUnit?: boolean } = {},
): string {
  const { currencySymbol, currencyUnit } = tenantConfig();
  const { withUnit = true } = opts;
  const num = formatNumber(value, opts);
  return `${currencySymbol}${num}${withUnit ? ` ${currencyUnit}` : ""}`;
}

/** Tenant locale (e.g. "en-IN") for direct use with Intl/Date APIs. */
export function tenantLocale(): string {
  return tenantConfig().locale;
}

/** Tenant timezone (e.g. "Asia/Kolkata") for direct use with Intl APIs. */
export function tenantTimezone(): string {
  return tenantConfig().timezone;
}
