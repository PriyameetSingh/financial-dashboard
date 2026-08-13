/**
 * Official logo asset path. Sourced from tenant config so the logo is
 * tenant-configurable; the default equals the current Odisha HUDD logo.
 */
import { tenantConfig } from "@/lib/tenant-config";

export const HUDD_LOGO_PUBLIC_PATH: string = tenantConfig().logoPublicPath;
