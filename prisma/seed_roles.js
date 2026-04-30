/**
 * Seed roles and permissions, plus one bootstrap TASU admin user for the admin UI.
 * Override email: BOOTSTRAP_TASU_EMAIL=user@example.com node prisma/seed_roles.js
 *
 * Run: node prisma/seed_roles.js
 * Or:  npm run db:seed:roles
 */

const { PrismaClient } = require("@prisma/client");
const {
  seedRolesAndPermissions,
  ensureBootstrapTasuAdmin,
  ensureKnownUserRoleLinks,
} = require("./seed_roles_core.cjs");

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

async function main() {
  await seedRolesAndPermissions(prisma);
  console.log("Roles and permissions seeded.");
  const { email } = await ensureBootstrapTasuAdmin(prisma);
  console.log(`Bootstrap TASU admin: ${email} (MANAGE_USERS, MANAGE_PERMISSIONS — map this email in Keycloak if needed).`);
  await ensureKnownUserRoleLinks(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
