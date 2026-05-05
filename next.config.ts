import type { NextConfig } from "next";
import { NEXTJS_BASE_PATH } from "./lib/next-base-path";

const nextConfig: NextConfig = {
  /* config options here */
  basePath: NEXTJS_BASE_PATH,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
