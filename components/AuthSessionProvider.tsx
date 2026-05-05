"use client";

import { SessionProvider } from "next-auth/react";
import { authApiBasePath } from "@/lib/auth-api-path";

export default function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath={authApiBasePath()}>{children}</SessionProvider>;
}
