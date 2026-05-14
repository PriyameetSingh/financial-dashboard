import type { NextConfig } from "next";
import { NEXTJS_BASE_PATH } from "./lib/next-base-path";

const nextConfig: NextConfig = {
  /* config options here */
  basePath: NEXTJS_BASE_PATH,
  trailingSlash: false,
  /** Default 10 MB would truncate large multipart uploads before route handlers run; align with meeting materials (50 MB + overhead). */
  experimental: {
    proxyClientMaxBodySize: "55mb",
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
