import { OfficerType, PrismaClient } from "@prisma/client";

/** Phase 2: this script runs outside any request, so it addresses the tenant
 * explicitly (default: the Odisha tenant; override with SEED_TENANT_ID). */
const SCRIPT_TENANT_ID = process.env.SEED_TENANT_ID || "00000000-0000-4000-8000-000000000001";
import {
  createOrFindKeycloakUser,
  replaceKeycloakClientRole,
  setKeycloakUserTemporaryPassword,
} from "@/lib/keycloak-admin";

type UserRoleCode = "ACS" | "VERTICAL_HEAD" | "FA" | "TASU" | "NODAL_OFFICER";

type ReferenceOption = { id: string; name: string };

type SeedDraftRow = {
  name: string;
  department: string;
  email: string;
  phone: string;
  defaultPassword: string;
  designationRaw: string;
  organisationRaw: string;
  sectionRaw: string;
  ulbRaw: string;
  officerTypeRaw: string;
  roleRaw: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function usernameDigitsFromPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^,+$/.test(line))
    .map(splitCsvLine);
}

function headerIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeText);
  return headers.findIndex((h) => normalizedAliases.includes(normalizeText(h)));
}

function fuzzyMatchOptionId(rawValue: string, options: ReferenceOption[]): string | null {
  const normalizedRaw = normalizeText(rawValue);
  if (!normalizedRaw) return null;
  const exact = options.find((option) => normalizeText(option.name) === normalizedRaw);
  if (exact) return exact.id;
  const partial = options.find((option) => {
    const name = normalizeText(option.name);
    return name.includes(normalizedRaw) || normalizedRaw.includes(name);
  });
  return partial?.id ?? null;
}

function fuzzyMatchManyOptionIds(rawValue: string, options: ReferenceOption[]): string[] {
  const chunks = rawValue
    .split(/[,/;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const ids = chunks.map((chunk) => fuzzyMatchOptionId(chunk, options)).filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids));
}

function parseOfficerType(rawValue: string): OfficerType | null {
  const normalized = normalizeText(rawValue);
  if (normalized === "government") return OfficerType.GOVERNMENT;
  if (normalized === "pmu") return OfficerType.PMU;
  return null;
}

function parseRole(rawValue: string): UserRoleCode {
  const normalized = normalizeText(rawValue);
  if (normalized.includes("vertical head")) return "VERTICAL_HEAD";
  if (normalized.includes("acs")) return "ACS";
  if (normalized.includes("fa")) return "FA";
  if (normalized.includes("tasu")) return "TASU";
  return "NODAL_OFFICER";
}

function mapCsvRowToSeedDraft(headers: string[], row: string[]): SeedDraftRow | null {
  const get = (aliases: string[]) => {
    const idx = headerIndex(headers, aliases);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  const nodalName = get(["Nodal Officer/ Nodal Person Name", "Nodal Officer Nodal Person Name"]);
  const verticalName = get(["Name of the Vertical Head"]);
  const name = nodalName || verticalName;
  const department = get(["Department", "Deapratment"]);
  const email = get(["Personal Email Id"]);
  const phone = get(["Phone No. (Whatsapp)", "Phone No Whatsapp"]);
  const defaultPassword = get(["Temporary Passwords", "Temporary passwords"]);
  const designationRaw = get(["Designation"]);
  const organisationRaw = get(["Organaisation", "Organisation", "Name of the Scheme"]);
  const sectionRaw = get(["Concerned Section"]);
  const ulbRaw = get(["ULB"]);
  const officerTypeRaw = get(["Officer Type"]);
  const roleRaw = get(["Role"]);

  if (!name || !department || !email || !phone || !defaultPassword) {
    return null;
  }

  return {
    name,
    department,
    email: email.toLowerCase(),
    phone,
    defaultPassword,
    designationRaw,
    organisationRaw,
    sectionRaw,
    ulbRaw,
    officerTypeRaw,
    roleRaw,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const csvPaths = process.argv
    .slice(2)
    .filter((arg) => arg !== "--dry-run" && !arg.startsWith("-"));
  const files =
    csvPaths.length > 0
      ? csvPaths
      : [
          "UsersSeedData/Dashboard Login - Annexure -1.csv",
          "UsersSeedData/Dashboard Login - Annexure -2-2.csv",
        ];

  const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const prisma = new PrismaClient(
    datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl,
            },
          },
        }
      : undefined,
  );

  try {
    const fs = await import("node:fs/promises");
    const seedRows: SeedDraftRow[] = [];

    for (const file of files) {
      const text = await fs.readFile(file, "utf8");
      const parsedRows = parseCsvRows(text);
      if (parsedRows.length < 2) continue;
      const headers = parsedRows[0];
      for (const row of parsedRows.slice(1)) {
        const mapped = mapCsvRowToSeedDraft(headers, row);
        if (mapped) seedRows.push(mapped);
      }
    }

    if (seedRows.length === 0) {
      console.log("No valid users found in provided CSV files.");
      return;
    }

    const [roles, designations, organisations, sections, ulbs] = await Promise.all([
      prisma.role.findMany({ select: { id: true, code: true } }),
      prisma.designation.findMany({ select: { id: true, name: true } }),
      prisma.organisation.findMany({ select: { id: true, name: true } }),
      prisma.section.findMany({ select: { id: true, name: true } }),
      prisma.ulb.findMany({ select: { id: true, name: true } }),
    ]);

    const roleByCode = new Map(roles.map((r) => [r.code, r.id]));
    const designationOptions: ReferenceOption[] = designations;
    const organisationOptions: ReferenceOption[] = organisations;
    const sectionOptions: ReferenceOption[] = sections;
    const ulbOptions: ReferenceOption[] = ulbs;

    let successCount = 0;
    let failedCount = 0;
    let unmatchedDropdownCount = 0;

    for (const row of seedRows) {
      const username = usernameDigitsFromPhone(row.phone);
      if (username.length < 10) {
        failedCount += 1;
        console.warn(`Skipping ${row.email}: phone must have at least 10 digits.`);
        continue;
      }

      const phoneRegex = /^[+\-() \s\d]+$/;
      if (!phoneRegex.test(row.phone)) {
        failedCount += 1;
        console.warn(`Skipping ${row.email}: phone contains invalid characters.`);
        continue;
      }

      const designationId = fuzzyMatchOptionId(row.designationRaw, designationOptions);
      const organisationIds = fuzzyMatchManyOptionIds(row.organisationRaw, organisationOptions);
      const sectionIds = fuzzyMatchManyOptionIds(row.sectionRaw, sectionOptions);
      const ulbId = fuzzyMatchOptionId(row.ulbRaw, ulbOptions);
      const officerType = parseOfficerType(row.officerTypeRaw);
      const roleCode = parseRole(row.roleRaw);
      const roleId = roleByCode.get(roleCode);

      if (!roleId) {
        failedCount += 1;
        console.warn(`Skipping ${row.email}: role ${roleCode} not present in DB.`);
        continue;
      }

      if ((row.designationRaw && !designationId) || (row.ulbRaw && !ulbId)) unmatchedDropdownCount += 1;

      try {
        if (!dryRun) {
          const keycloak = await createOrFindKeycloakUser({
            username,
            email: row.email,
            fullName: row.name,
            password: row.defaultPassword,
          });
          await setKeycloakUserTemporaryPassword(keycloak.id, row.defaultPassword);
          await replaceKeycloakClientRole(keycloak.id, roleCode);
        }

        if (!dryRun) {
          await prisma.$transaction(async (tx) => {
            const user = await tx.user.upsert({
              where: { tenantId_email: { tenantId: SCRIPT_TENANT_ID, email: row.email } },
              update: {
                name: row.name,
                code: username,
                department: row.department,
                designationId,
                ulbId,
                officerType,
                isActive: true,
              },
              create: {
                name: row.name,
                email: row.email,
                code: username,
                department: row.department,
                designationId,
                ulbId,
                officerType,
                isActive: true,
              },
            });

            await tx.userRole.deleteMany({ where: { userId: user.id } });
            await tx.userRole.create({ data: { userId: user.id, roleId } });

            await tx.userOrganisation.deleteMany({ where: { userId: user.id } });
            if (organisationIds.length > 0) {
              await tx.userOrganisation.createMany({
                data: organisationIds.map((organisationId) => ({ userId: user.id, organisationId })),
                skipDuplicates: true,
              });
            }

            await tx.userSection.deleteMany({ where: { userId: user.id } });
            if (sectionIds.length > 0) {
              await tx.userSection.createMany({
                data: sectionIds.map((sectionId) => ({ userId: user.id, sectionId })),
                skipDuplicates: true,
              });
            }
          });
        }
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : "unknown error";
        console.warn(`Failed for ${row.email}: ${message}`);
      }
    }

    console.log(`${dryRun ? "[DRY RUN] " : ""}Processed ${seedRows.length} rows.`);
    console.log(`Success: ${successCount}, Failed: ${failedCount}`);
    console.log(
      `Dropdown fields were fuzzy-matched; unmatched values were left empty. Rows with some unmatched dropdown values: ${unmatchedDropdownCount}`,
    );
    console.log(
      dryRun
        ? "Dry run skips Keycloak operations. Actual run will create/find Keycloak users, set temporary passwords, and replace client roles."
        : "Temporary passwords were pushed to Keycloak as temporary credentials (UPDATE_PASSWORD required on first login).",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
