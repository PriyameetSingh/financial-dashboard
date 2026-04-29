import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";

function normalizedBaseUrl(request: NextRequest): string {
  const configuredAuthUrl =
    process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();
  if (configuredAuthUrl) {
    const parsed = new URL(configuredAuthUrl);
    return `${parsed.protocol}//${parsed.host}`;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "http";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

function resolvePostLogoutRedirectUri(request: NextRequest): string {
  const configured = process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI?.trim();
  if (configured) return configured;
  const callbackParam = request.nextUrl.searchParams.get("callbackUrl") ?? "/login";
  const callbackPath = callbackParam.startsWith("/") ? callbackParam : "/login";
  return new URL(callbackPath, normalizedBaseUrl(request)).toString();
}

function buildKeycloakLogoutUrl(request: NextRequest, idTokenHint?: string): string | null {
  const issuer = process.env.KEYCLOAK_ISSUER?.replace(/\/+$/, "");
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  if (!issuer || !clientId) return null;

  const params = new URLSearchParams({
    post_logout_redirect_uri: resolvePostLogoutRedirectUri(request),
    client_id: clientId,
  });
  if (idTokenHint) {
    params.set("id_token_hint", idTokenHint);
  }
  return `${issuer}/protocol/openid-connect/logout?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const idTokenHint = typeof token?.id_token === "string" ? token.id_token : undefined;
  const keycloakLogoutUrl = buildKeycloakLogoutUrl(request, idTokenHint);

  if (keycloakLogoutUrl) {
    return NextResponse.redirect(keycloakLogoutUrl);
  }
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
}
