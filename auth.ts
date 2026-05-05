import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { authApiBasePath } from "@/lib/auth-api-path";
import { UserRole } from "@/types";

type KeycloakProfile = {
  preferred_username?: string;
  email?: string;
  name?: string;
  realm_access?: { roles?: unknown };
  resource_access?: Record<string, { roles?: unknown }>;
};

type RoleClaimSource = {
  realm_access?: { roles?: unknown };
  resource_access?: Record<string, { roles?: unknown }>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const USER_ROLE_VALUES = new Set<string>(Object.values(UserRole));

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> {
  if (!token) return {};
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed tokens and continue with other claim sources.
  }
  return {};
}

function extractRoleCandidates(claims: RoleClaimSource, clientId: string): string[] {
  const fromRealm = toStringArray(claims.realm_access?.roles);
  const fromClient = toStringArray(claims.resource_access?.[clientId]?.roles);
  return [...fromRealm, ...fromClient];
}

function pickKnownRole(roles: string[]): UserRole | undefined {
  for (const role of roles) {
    const normalized = role.trim().toUpperCase();
    if (USER_ROLE_VALUES.has(normalized)) {
      return normalized as UserRole;
    }
  }
  return undefined;
}

const keycloakClientId = requiredEnv("KEYCLOAK_CLIENT_ID");

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  basePath: authApiBasePath(),
  session: {
    strategy: "jwt",
  },
  providers: [
    Keycloak({
      issuer: requiredEnv("KEYCLOAK_ISSUER"),
      clientId: keycloakClientId,
      clientSecret: requiredEnv("KEYCLOAK_CLIENT_SECRET"),
    }),
  ],
  callbacks: {
    jwt({ token, profile, account }) {
      const keycloakProfile = (profile ?? {}) as KeycloakProfile;

      token.preferred_username = keycloakProfile.preferred_username ?? token.preferred_username;
      token.email = keycloakProfile.email ?? token.email;
      token.name = keycloakProfile.name ?? token.name;
      token.id_token = typeof account?.id_token === "string" ? account.id_token : token.id_token;

      const accessTokenClaims = decodeJwtPayload(
        typeof account?.access_token === "string" ? account.access_token : undefined,
      ) as RoleClaimSource;
      const idTokenClaims = decodeJwtPayload(typeof account?.id_token === "string" ? account.id_token : undefined) as RoleClaimSource;
      const roleCandidates = [
        ...extractRoleCandidates(keycloakProfile, keycloakClientId),
        ...extractRoleCandidates(accessTokenClaims, keycloakClientId),
        ...extractRoleCandidates(idTokenClaims, keycloakClientId),
      ];
      const existingRole = typeof token.role === "string" ? token.role : undefined;
      const resolvedRole = pickKnownRole(roleCandidates) ?? pickKnownRole(existingRole ? [existingRole] : []);

      if (!resolvedRole && roleCandidates.length > 0) {
        console.warn("[auth] Keycloak role claims did not match app roles", {
          roleCandidates,
          acceptedRoles: [...USER_ROLE_VALUES],
          subject: token.sub,
          username: token.preferred_username,
        });
      }

      token.role = resolvedRole;
      return token;
    },
    session({ session, token }) {
      const preferredId =
        (typeof token.preferred_username === "string" && token.preferred_username) ||
        (typeof token.email === "string" && token.email) ||
        token.sub;

      if (!session.user) {
        return session;
      }

      if (preferredId) {
        session.user.id = preferredId;
      }

      if (!session.user.email && typeof token.email === "string") {
        session.user.email = token.email;
      }

      if (!session.user.name && typeof token.name === "string") {
        session.user.name = token.name;
      }

      if (typeof token.role === "string") {
        session.user.role = token.role;
      }

      return session;
    },
    redirect({ url, baseUrl }) {
      const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
      // Prefer AUTH_URL so origin matches production even when `baseUrl` is only the host
      // (common with `trustHost` + reverse proxies).
      const authBase = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
      let appOrigin: string;
      try {
        appOrigin = authBase ? new URL(authBase).origin : new URL(baseUrl).origin;
      } catch {
        appOrigin = new URL(baseUrl).origin;
      }

      const withBasePath = (pathname: string) => {
        const p = pathname && pathname !== "" ? pathname : "/";
        if (!basePath) return p === "/" ? "/dashboard" : p;
        if (p === "/") return `${basePath}/dashboard`;
        if (p.startsWith(basePath)) return p;
        return `${basePath}${p.startsWith("/") ? p : `/${p}`}`;
      };

      if (/^https?:\/\//i.test(url)) {
        try {
          const target = new URL(url);
          if (target.origin === appOrigin) {
            target.pathname = withBasePath(target.pathname);
            return target.href;
          }
        } catch {
          /* fall through */
        }
        return `${appOrigin}${withBasePath("/dashboard")}`;
      }

      if (url.startsWith(baseUrl)) {
        const rest = url.slice(baseUrl.length) || "/";
        const pathOnly = rest.startsWith("/") ? rest : `/${rest}`;
        return `${appOrigin}${withBasePath(pathOnly)}`;
      }

      if (url.startsWith("/")) {
        return `${appOrigin}${withBasePath(url)}`;
      }

      return `${appOrigin}${withBasePath("/dashboard")}`;
    },
  },
});
