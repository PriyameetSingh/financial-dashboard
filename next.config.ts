import type { NextConfig } from "next";
import { NEXTJS_BASE_PATH } from "./lib/next-base-path";

const nextConfig: NextConfig = {
  /* config options here */
  basePath: NEXTJS_BASE_PATH,
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
};

export default nextConfig;
