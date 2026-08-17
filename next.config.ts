import type { NextConfig } from "next";
import { NEXTJS_BASE_PATH } from "./lib/next-base-path";

/**
 * `basePath` is the supported way to host under a sub-path (Next.js docs:
 * do not use `assetPrefix` for that). Empty `NEXT_PUBLIC_BASE_PATH` → app at
 * `/`. Set `NEXT_PUBLIC_BASE_PATH=/hudd-dashboard` at `next dev` / `next build`
 * to restore the historical Odisha nginx location. `assetPrefix` stays unset:
 * Next already serves `/_next/*` under `basePath` when one is configured.
 */
const nextConfig: NextConfig = {
  /* config options here */
  ...(NEXTJS_BASE_PATH ? { basePath: NEXTJS_BASE_PATH } : {}),
  trailingSlash: false,
  /**
   * @react-pdf/renderer is ESM-only and must not be bundled by webpack/turbopack.
   * Listing it here tells Next.js to leave it as a native Node.js import in Route Handlers.
   */
  serverExternalPackages: ["@react-pdf/renderer"],
  /** Default 10 MB would truncate large multipart uploads before route handlers run; align with meeting materials (50 MB + overhead). */
  experimental: {
    proxyClientMaxBodySize: "55mb",
  },
  turbopack: {
    root: process.cwd(),
  },
  /**
   * DEV SERVER ONLY. Next 16 refuses to serve `/_next/*` to a page loaded from a
   * hostname other than the one the dev server was started on, which is a sane
   * default and exactly wrong for this application: tenants are addressed by
   * host, so every local run of the real thing is "cross-origin" by design.
   *
   * The symptom is silent and worth recording. The HTML document still arrives,
   * so a page looks fine and even renders its content — client components are
   * server-rendered — while no JavaScript ever attaches. The accessibility leg
   * spent two runs auditing markup with no behaviour behind it before the dev
   * server's own warning explained why the onboarding wizard could not be
   * driven.
   *
   * `allowedDevOrigins` has no effect on a production build.
   */
  allowedDevOrigins: ["odisha.airawat.test", "demo.airawat.test", "*.airawat.test"],
};

export default nextConfig;
