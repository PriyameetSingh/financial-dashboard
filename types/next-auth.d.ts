import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string;
      iat?: number;
      /** Tenant this session was minted for (Phase 2). See lib/tenant-session.ts. */
      tenantId?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    preferred_username?: string;
    role?: string;
    id_token?: string;
    iat?: number;
    /**
     * Tenant this token was minted for (Phase 2). Every request cross-checks it
     * against the tenant resolved from the Host, so a token cannot be replayed
     * against another tenant. Absent on pre-Phase-2 tokens, which are rejected.
     */
    tenantId?: string;
  }
}
