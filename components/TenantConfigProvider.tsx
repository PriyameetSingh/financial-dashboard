"use client";

/**
 * Seeds the browser-side tenant-config holder from the server-resolved config
 * (passed by the root layout). Runs during render, before children render, so
 * client components' sync `tenantConfig()`/format calls see the resolved
 * values. Browser only: on the server (SSR pass) this is a no-op —
 * `primeClientTenantConfig` refuses to touch shared module state there, and
 * server reads go through the request-scoped holder instead.
 */
import type { ReactNode } from "react";
import type { TenantConfig } from "@/lib/tenant-config";
import { primeClientTenantConfig } from "@/lib/tenant-config/request-store";

export default function TenantConfigProvider({
  config,
  children,
}: {
  config: TenantConfig;
  children: ReactNode;
}) {
  primeClientTenantConfig(config);
  return <>{children}</>;
}
