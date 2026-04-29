type KeycloakAdminToken = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type KeycloakUserRepresentation = {
  id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
};

type KeycloakClientRepresentation = {
  id: string;
  clientId: string;
};

type KeycloakClientRoleRepresentation = {
  id: string;
  name: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
};

export type CreateKeycloakUserInput = {
  username: string;
  email: string;
  fullName: string;
  password: string;
};

export class KeycloakClientRoleNotFoundError extends Error {
  constructor(clientId: string, roleCode: string) {
    super(`Role '${roleCode}' was not found in Keycloak client '${clientId}'`);
    this.name = "KeycloakClientRoleNotFoundError";
  }
}

type KeycloakConfig = {
  issuer: string;
  realm: string;
  adminClientId: string;
  adminClientSecret: string;
  adminBaseUrl: string;
  appClientId: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getKeycloakConfig(): KeycloakConfig {
  const issuer = requiredEnv("KEYCLOAK_ISSUER").replace(/\/+$/, "");
  const adminClientId = requiredEnv("KEYCLOAK_ADMIN_CLIENT_ID");
  const adminClientSecret = requiredEnv("KEYCLOAK_ADMIN_CLIENT_SECRET");
  const appClientId = (process.env.KEYCLOAK_ROLE_CLIENT_ID?.trim() || requiredEnv("KEYCLOAK_CLIENT_ID")).trim();

  const marker = "/realms/";
  const markerIndex = issuer.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("KEYCLOAK_ISSUER must include /realms/<realm>");
  }

  const issuerRealm = issuer.slice(markerIndex + marker.length).split("/")[0];
  const realm = (process.env.KEYCLOAK_REALM?.trim() || issuerRealm).replace(/^\/+|\/+$/g, "");
  const adminBaseUrl = issuer.slice(0, markerIndex);

  if (!realm) {
    throw new Error("Unable to resolve Keycloak realm from KEYCLOAK_ISSUER/KEYCLOAK_REALM");
  }

  return {
    issuer,
    realm,
    adminClientId,
    adminClientSecret,
    adminBaseUrl,
    appClientId,
  };
}

async function getAdminAccessToken(config: KeycloakConfig): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.adminClientId,
    client_secret: config.adminClientSecret,
  });

  const response = await fetch(`${config.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Keycloak admin token request failed (${response.status}): ${detail || "unknown error"}`);
  }

  const token = (await response.json()) as KeycloakAdminToken;
  if (!token.access_token) {
    throw new Error("Keycloak admin token response missing access_token");
  }
  return token.access_token;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");
  if (parts.length <= 1) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function findKeycloakUserByUsername(
  accessToken: string,
  config: KeycloakConfig,
  username: string,
): Promise<KeycloakUserRepresentation | null> {
  const url = new URL(`${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users`);
  url.searchParams.set("username", username);
  url.searchParams.set("exact", "true");
  url.searchParams.set("max", "1");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    method: "GET",
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as KeycloakUserRepresentation[];
  return rows[0] ?? null;
}

async function findKeycloakUserByEmail(
  accessToken: string,
  config: KeycloakConfig,
  email: string,
): Promise<KeycloakUserRepresentation | null> {
  const url = new URL(`${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users`);
  url.searchParams.set("email", email);
  url.searchParams.set("exact", "true");
  url.searchParams.set("max", "1");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    method: "GET",
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as KeycloakUserRepresentation[];
  return rows[0] ?? null;
}

function parseUserIdFromLocationHeader(location: string | null): string | null {
  if (!location) return null;
  const cleaned = location.replace(/\/+$/, "");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] || null;
}

async function getClientInternalId(accessToken: string, config: KeycloakConfig, clientId: string): Promise<string> {
  const baseUrl = `${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/clients`;

  async function fetchClients(params: Record<string, string>): Promise<KeycloakClientRepresentation[]> {
    const url = new URL(baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Keycloak client lookup failed (${response.status}): ${detail || "unknown error"}`);
    }
    return (await response.json()) as KeycloakClientRepresentation[];
  }

  let clients = await fetchClients({ clientId, max: "20" });
  if (!clients.length) {
    clients = await fetchClients({ search: clientId, max: "100" });
  }
  if (!clients.length) {
    clients = await fetchClients({ max: "300" });
  }

  const target = clientId.trim().toLowerCase();
  const client = clients.find((c) => c.clientId?.trim().toLowerCase() === target);
  if (!client?.id) {
    throw new Error(
      `Keycloak client '${clientId}' was not found in realm '${config.realm}'. ` +
      `Set KEYCLOAK_ROLE_CLIENT_ID correctly and ensure admin client '${config.adminClientId}' has client query permissions.`,
    );
  }
  return client.id;
}

async function getClientRole(
  accessToken: string,
  config: KeycloakConfig,
  clientInternalId: string,
  roleCode: string,
): Promise<KeycloakClientRoleRepresentation> {
  const response = await fetch(
    `${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/clients/${encodeURIComponent(clientInternalId)}/roles/${encodeURIComponent(roleCode)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (response.status === 404) {
    throw new KeycloakClientRoleNotFoundError(config.appClientId, roleCode);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Keycloak client role lookup failed (${response.status}): ${detail || "unknown error"}`);
  }
  return (await response.json()) as KeycloakClientRoleRepresentation;
}

export async function assignKeycloakClientRole(userId: string, roleCode: string): Promise<void> {
  const config = getKeycloakConfig();
  const accessToken = await getAdminAccessToken(config);
  const clientInternalId = await getClientInternalId(accessToken, config, config.appClientId);
  const role = await getClientRole(accessToken, config, clientInternalId, roleCode);

  const response = await fetch(
    `${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(clientInternalId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          id: role.id,
          name: role.name,
          composite: role.composite ?? false,
          clientRole: role.clientRole ?? true,
          containerId: role.containerId ?? clientInternalId,
        },
      ]),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Keycloak client role mapping failed (${response.status}): ${detail || "unknown error"}`);
  }
}

async function listUserClientRoles(
  accessToken: string,
  config: KeycloakConfig,
  userId: string,
  clientInternalId: string,
): Promise<KeycloakClientRoleRepresentation[]> {
  const response = await fetch(
    `${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(clientInternalId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Keycloak client role listing failed (${response.status}): ${detail || "unknown error"}`);
  }
  return (await response.json()) as KeycloakClientRoleRepresentation[];
}

async function removeKeycloakClientRoles(
  accessToken: string,
  config: KeycloakConfig,
  userId: string,
  clientInternalId: string,
  roles: KeycloakClientRoleRepresentation[],
): Promise<void> {
  if (!roles.length) return;

  const response = await fetch(
    `${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(clientInternalId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        roles.map((role) => ({
          id: role.id,
          name: role.name,
          composite: role.composite ?? false,
          clientRole: role.clientRole ?? true,
          containerId: role.containerId ?? clientInternalId,
        })),
      ),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Keycloak client role removal failed (${response.status}): ${detail || "unknown error"}`);
  }
}

export async function replaceKeycloakClientRole(userId: string, roleCode: string): Promise<void> {
  const config = getKeycloakConfig();
  const accessToken = await getAdminAccessToken(config);
  const clientInternalId = await getClientInternalId(accessToken, config, config.appClientId);
  const targetRole = await getClientRole(accessToken, config, clientInternalId, roleCode);
  const existingRoles = await listUserClientRoles(accessToken, config, userId, clientInternalId);

  await removeKeycloakClientRoles(accessToken, config, userId, clientInternalId, existingRoles);

  const assignResponse = await fetch(
    `${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(clientInternalId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          id: targetRole.id,
          name: targetRole.name,
          composite: targetRole.composite ?? false,
          clientRole: targetRole.clientRole ?? true,
          containerId: targetRole.containerId ?? clientInternalId,
        },
      ]),
    },
  );

  if (!assignResponse.ok) {
    const detail = await assignResponse.text().catch(() => "");
    throw new Error(`Keycloak client role mapping failed (${assignResponse.status}): ${detail || "unknown error"}`);
  }
}

export async function findKeycloakUserIdByIdentity(input: { username?: string | null; email?: string | null }): Promise<string | null> {
  const config = getKeycloakConfig();
  const accessToken = await getAdminAccessToken(config);

  const normalizedUsername = input.username?.trim();
  if (normalizedUsername) {
    const byUsername = await findKeycloakUserByUsername(accessToken, config, normalizedUsername);
    if (byUsername?.id) return byUsername.id;
  }

  const normalizedEmail = input.email?.trim().toLowerCase();
  if (normalizedEmail) {
    const byEmail = await findKeycloakUserByEmail(accessToken, config, normalizedEmail);
    if (byEmail?.id) return byEmail.id;
  }

  return null;
}

export async function deleteKeycloakUserById(userId: string): Promise<void> {
  const config = getKeycloakConfig();
  const accessToken = await getAdminAccessToken(config);

  const response = await fetch(
    `${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.status === 404) return;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Keycloak user delete failed (${response.status}): ${detail || "unknown error"}`);
  }
}

export async function createOrFindKeycloakUser(input: CreateKeycloakUserInput): Promise<{ id: string; created: boolean }> {
  const config = getKeycloakConfig();
  const accessToken = await getAdminAccessToken(config);
  const { firstName, lastName } = splitFullName(input.fullName);

  const createResponse = await fetch(`${config.adminBaseUrl}/admin/realms/${encodeURIComponent(config.realm)}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: input.username,
      email: input.email,
      enabled: true,
      emailVerified: false,
      firstName,
      lastName: lastName || undefined,
      credentials: [
        {
          type: "password",
          value: input.password,
          temporary: true,
        },
      ],
      requiredActions: ["UPDATE_PASSWORD"],
    }),
  });

  if (createResponse.status === 201) {
    const createdId = parseUserIdFromLocationHeader(createResponse.headers.get("location"));
    if (createdId) return { id: createdId, created: true };

    const found = await findKeycloakUserByUsername(accessToken, config, input.username);
    if (found?.id) return { id: found.id, created: true };

    throw new Error("Keycloak user created but ID could not be resolved");
  }

  if (createResponse.status === 409) {
    const byUsername = await findKeycloakUserByUsername(accessToken, config, input.username);
    if (byUsername?.id) return { id: byUsername.id, created: false };

    const byEmail = await findKeycloakUserByEmail(accessToken, config, input.email);
    if (byEmail?.id) return { id: byEmail.id, created: false };

    throw new Error("Keycloak reported conflict, but existing user could not be found");
  }

  const detail = await createResponse.text().catch(() => "");
  throw new Error(`Keycloak user create failed (${createResponse.status}): ${detail || "unknown error"}`);
}
