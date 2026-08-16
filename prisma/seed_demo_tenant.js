/**
 * Demo tenant seed — Phase 2 Gate E.
 *
 * Creates the "Suryapur Development Authority" tenant: a WHOLLY FICTIONAL
 * organisation with its own branding, locale, currency and governance data.
 * No real government, place, scheme, officer or department names appear here.
 *
 * This is a SEED SCRIPT, never a migration: demo content must not reach
 * production (or the golden's migrations-only test database) through
 * `prisma migrate deploy`.
 *
 * Run:  node --env-file=.env.local prisma/seed_demo_tenant.js
 * Wipe: node --env-file=.env.local prisma/seed_demo_tenant.js --reset
 *
 * Resolution: the tenant is reachable at the `demo` slug (host
 * `demo.<your-domain>`), and locally via DEV_DEFAULT_TENANT_SLUG=demo, which
 * makes a fresh visitor land on Demo in development.
 */
const { PrismaClient } = require("@prisma/client");

const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined,
);

const DEMO_TENANT_ID = "00000000-0000-4000-8000-0000000000d0";
const DEMO_SLUG = "demo";
const PREFIX = "SDA_";

/**
 * Demo branding — deliberately different from Odisha's on EVERY presentation
 * key, so a surface that has not been primed with the resolved tenant config
 * shows up immediately as Odisha defaults instead of these values.
 */
const DEMO_CONFIG = {
  productName: "Suryapur Insights",
  logoPublicPath: "/suryapur-logo.svg",
  locale: "en-US",
  timezone: "America/Chicago",
  currencySymbol: "$",
  currencyUnit: "M",
  pdfHeaderLine: "Suryapur Development Authority",
  reportFilenamePrefix: "SURYAPUR",
  labels: {
    soExpenditure: "Sanctioned",
    ifmsExpenditure: "Disbursed",
    soExpenditureFormal: "Sanctioned",
    ifmsExpenditureFormal: "Disbursed",
  },
};

const VERTICALS = [
  { code: `${PREFIX}WATER`, name: "Water & Sanitation" },
  { code: `${PREFIX}TRANSIT`, name: "Transit & Mobility" },
  { code: `${PREFIX}HOUSING`, name: "Housing Renewal" },
];

const SCHEMES = [
  {
    code: `${PREFIX}RIVERWALK`,
    name: "Riverwalk Embankment Renewal",
    verticalName: "Water & Sanitation",
    sponsorshipType: "STATE",
    budgetM: 420.5,
    sanctionedM: 260.25,
    disbursedM: 198.75,
  },
  {
    code: `${PREFIX}TRANSITHUB`,
    name: "Northgate Transit Interchange",
    verticalName: "Transit & Mobility",
    sponsorshipType: "CENTRAL",
    budgetM: 610,
    sanctionedM: 355.5,
    disbursedM: 301.4,
  },
  {
    code: `${PREFIX}HOUSING`,
    name: "Millbrook Housing Renewal",
    verticalName: "Housing Renewal",
    sponsorshipType: "STATE",
    budgetM: 285.75,
    sanctionedM: 150,
    disbursedM: 121.6,
  },
];

const OFFICERS = [
  { code: `${PREFIX}DIR`, name: "Avery Lindqvist", email: "avery.lindqvist@suryapur.example", role: "ACS" },
  { code: `${PREFIX}NODAL1`, name: "Priya Okonkwo", email: "priya.okonkwo@suryapur.example", role: "NODAL_OFFICER" },
  { code: `${PREFIX}NODAL2`, name: "Tomas Beaumont", email: "tomas.beaumont@suryapur.example", role: "NODAL_OFFICER" },
];

/**
 * Fail early and legibly when the Phase 2 migrations have not been applied to
 * this database. Without it the first delete fails with a raw Prisma P2022
 * ("column kpi_measurements.tenantId does not exist"), which looks like a bug
 * in the seed rather than a missing migration step.
 */
async function assertTenancyMigrationsApplied() {
  const [{ ready }] = await prisma.$queryRaw`
    SELECT (
      EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'tenants')
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'kpi_measurements' AND column_name = 'tenantId')
    ) AS ready`;
  if (ready) return;
  console.error(
    [
      "",
      "✗  This database does not have the Phase 2 tenancy migrations applied.",
      "",
      "   Apply them first (test database before development, per the project policy):",
      "",
      "     npm run prisma:migrate:test",
      "     node --env-file=.env.local node_modules/.bin/prisma migrate deploy",
      "     node --env-file=.env.local scripts/check-tenant-integrity.mjs",
      "",
      "   Then re-run this seed. The migrations are additive and idempotent: they add",
      "   the tenants tables, backfill every existing row to the Odisha tenant, and",
      "   only then enforce NOT NULL.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

async function reset() {
  // Children first; every row is addressed by the demo tenant id, so this can
  // never touch another tenant's data.
  const where = { tenantId: DEMO_TENANT_ID };
  await prisma.kpiMeasurement.deleteMany({ where });
  await prisma.kpiTarget.deleteMany({ where });
  await prisma.kpiDefinitionPerformer.deleteMany({ where });
  await prisma.kpiDefinition.deleteMany({ where });
  await prisma.actionItemPerformer.deleteMany({ where });
  await prisma.actionItem.deleteMany({ where });
  await prisma.meetingTopic.deleteMany({ where });
  await prisma.financeExpenditureSnapshot.deleteMany({ where });
  await prisma.financeBudget.deleteMany({ where });
  await prisma.financeYearBudgetCategoryLine.deleteMany({ where });
  await prisma.financeYearBudgetAllocation.deleteMany({ where });
  await prisma.dashboardMeeting.deleteMany({ where });
  await prisma.schemeAssignment.deleteMany({ where });
  await prisma.subscheme.deleteMany({ where });
  await prisma.scheme.deleteMany({ where });
  await prisma.userRole.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.rolePermission.deleteMany({ where });
  await prisma.role.deleteMany({ where });
  await prisma.vertical.deleteMany({ where });
  await prisma.financialYear.deleteMany({ where });
  await prisma.tenantConfigEntry.deleteMany({ where });
  await prisma.tenantEntitlement.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: DEMO_TENANT_ID } });
  console.log("🧹  Demo tenant removed.");
}

/**
 * Phase 3 entitlements for the demo tenant.
 *
 * Unlike Odisha (all-on, backfilled by migration so the golden stays
 * byte-identical), Suryapur is deliberately provisioned as a PARTIAL tenant:
 * Notifications is OFF. That gives the enforcement a real, browsable
 * disabled-module case — `/admin/notifications` and `/api/v1/notifications/**`
 * return 404 by direct URL, and the nav item is absent — and it is what the
 * eventual menu-card demo will show.
 *
 * This lives in the seed, never in a migration: demo content must not reach
 * production or the golden's migrations-only test database.
 */
const DEMO_DISABLED_MODULES = ["MOD-NOTIF"];

async function seedEntitlements() {
  const modules = await prisma.module.findMany({
    where: { enforcement: { not: "roadmap" } },
    select: { id: true, code: true, tier: true },
  });
  if (modules.length === 0) {
    throw new Error(
      "No rows in `modules` — run `prisma migrate deploy` so the Phase 3 catalog is seeded before this script.",
    );
  }
  for (const m of modules) {
    await prisma.tenantEntitlement.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        moduleId: m.id,
        enabled: !DEMO_DISABLED_MODULES.includes(m.code),
        tier: m.tier,
      },
    });
  }
  const off = DEMO_DISABLED_MODULES.join(", ");
  console.log(
    `✅  Entitlements: ${modules.length - DEMO_DISABLED_MODULES.length} on, ${DEMO_DISABLED_MODULES.length} off (${off} — 404s by direct URL, hidden in nav)`,
  );
}

async function main() {
  await assertTenancyMigrationsApplied();

  if (process.argv.includes("--reset")) {
    await reset();
    return;
  }

  await reset(); // idempotent re-seed

  const tenant = await prisma.tenant.create({
    data: { id: DEMO_TENANT_ID, slug: DEMO_SLUG, name: "Suryapur Development Authority", status: "active" },
  });
  console.log(`✅  Tenant: ${tenant.name} (slug: ${tenant.slug})`);

  for (const [key, value] of Object.entries(DEMO_CONFIG)) {
    await prisma.tenantConfigEntry.create({ data: { tenantId: DEMO_TENANT_ID, key, value } });
  }
  console.log(`✅  Config: ${Object.keys(DEMO_CONFIG).length} keys (${DEMO_CONFIG.productName}, ${DEMO_CONFIG.currencySymbol}/${DEMO_CONFIG.currencyUnit}, ${DEMO_CONFIG.locale})`);

  await seedEntitlements();

  const fy = await prisma.financialYear.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      label: "FY 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  console.log(`✅  Financial year: ${fy.label} (calendar-year cycle — a different fiscal calendar from Odisha's)`);

  for (const v of VERTICALS) {
    await prisma.vertical.create({ data: { tenantId: DEMO_TENANT_ID, ...v } });
  }

  const roleIds = {};
  for (const code of ["ACS", "NODAL_OFFICER"]) {
    const role = await prisma.role.create({
      data: { tenantId: DEMO_TENANT_ID, code, name: code === "ACS" ? "Director" : "Programme Officer" },
    });
    roleIds[code] = role.id;
    /*
     * A realistic permission set, not a single view permission.
     *
     * Both roles previously got exactly one — VIEW_ALL_DATA for "Director",
     * VIEW_ASSIGNED_DATA for "Programme Officer" — which made every demo user
     * read-only and every data-entry screen unopenable in this tenant. That is
     * not what either role means: "Programme Officer" is seeded as
     * NODAL_OFFICER, whose job in the product is entering KPI data.
     *
     * These mirror the Odisha role definitions in `seed_roles_core.cjs` rather
     * than inventing a second set, so the two tenants cannot drift.
     */
    const permCodes =
      code === "ACS"
        ? [
            "VIEW_ALL_DATA",
            "ENTER_FINANCIAL_DATA",
            "ENTER_KPI_DATA",
            "CREATE_ACTION_ITEMS",
            "UPDATE_ACTION_ITEMS",
            "UPLOAD_PROOF",
            "EXPORT_REPORTS",
            "VIEW_COMMAND_CENTRE",
            "VIEW_ANALYTICS",
            "APPROVE_KPI",
            "APPROVE_ACTION_ITEMS",
            "FLAG_KPI_ESCALATION",
          ]
        : ["VIEW_ASSIGNED_DATA", "ENTER_KPI_DATA", "UPLOAD_PROOF", "VIEW_ANALYTICS", "FLAG_KPI_ESCALATION"];
    const perms = await prisma.permission.findMany({
      where: { code: { in: permCodes } },
      select: { id: true },
    });
    for (const p of perms) {
      await prisma.rolePermission.create({
        data: { tenantId: DEMO_TENANT_ID, roleId: role.id, permissionId: p.id },
      });
    }
  }

  const users = {};
  for (const o of OFFICERS) {
    const user = await prisma.user.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        code: o.code,
        name: o.name,
        email: o.email,
        isActive: true,
        userRoles: { create: [{ tenantId: DEMO_TENANT_ID, roleId: roleIds[o.role] }] },
      },
    });
    users[o.code] = user;
  }
  console.log(`✅  Officers: ${OFFICERS.map((o) => o.name).join(", ")}`);

  const meeting = await prisma.dashboardMeeting.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      meetingDate: new Date("2026-06-18"),
      title: "Suryapur Quarterly Programme Review",
      financialYearId: fy.id,
      createdById: users[`${PREFIX}DIR`].id,
    },
  });
  await prisma.meetingTopic.create({
    data: { tenantId: DEMO_TENANT_ID, meetingId: meeting.id, topic: "Embankment works — progress and bottlenecks" },
  });

  for (const [i, s] of SCHEMES.entries()) {
    const scheme = await prisma.scheme.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        code: s.code,
        name: s.name,
        verticalName: s.verticalName,
        sponsorshipType: s.sponsorshipType,
        sortOrder: i,
        createdById: users[`${PREFIX}DIR`].id,
      },
    });

    await prisma.schemeAssignment.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        schemeId: scheme.id,
        assignmentKind: "dashboard_owner",
        userId: users[i === 0 ? `${PREFIX}NODAL1` : `${PREFIX}NODAL2`].id,
      },
    });

    await prisma.financeBudget.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        schemeId: scheme.id,
        financialYearId: fy.id,
        budgetEstimateCr: s.budgetM,
        createdById: users[`${PREFIX}DIR`].id,
      },
    });

    await prisma.financeExpenditureSnapshot.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        schemeId: scheme.id,
        financialYearId: fy.id,
        meetingId: meeting.id,
        asOfDate: new Date("2026-06-15"),
        soExpenditureCr: s.sanctionedM,
        ifmsExpenditureCr: s.disbursedM,
        workflowStatus: "submitted",
        createdById: users[`${PREFIX}NODAL1`].id,
      },
    });

    const kpi = await prisma.kpiDefinition.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        schemeId: scheme.id,
        category: "STATE",
        description: `${s.name} — works completed against plan`,
        kpiType: "OUTPUT",
        numeratorUnit: "units",
        denominatorUnit: "units",
        createdById: users[`${PREFIX}DIR`].id,
        performers: {
          create: [{ tenantId: DEMO_TENANT_ID, userId: users[`${PREFIX}NODAL1`].id, sortOrder: 0 }],
        },
      },
    });
    const target = await prisma.kpiTarget.create({
      data: { tenantId: DEMO_TENANT_ID, kpiDefinitionId: kpi.id, financialYearId: fy.id, denominatorValue: 100 },
    });
    await prisma.kpiMeasurement.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        kpiTargetId: target.id,
        meetingId: meeting.id,
        measuredAt: new Date("2026-06-15"),
        numeratorValue: 55 + i * 10,
        progressStatus: "on_track",
        workflowStatus: "reviewed",
        createdById: users[`${PREFIX}NODAL1`].id,
      },
    });

    await prisma.actionItem.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        meetingId: meeting.id,
        schemeId: scheme.id,
        itemType: "action_item",
        title: `Publish quarterly progress note — ${s.name}`,
        description: "Circulate the progress note to the review committee.",
        priority: "High",
        dueDate: new Date("2026-07-31"),
        status: "OPEN",
        createdById: users[`${PREFIX}DIR`].id,
        performers: {
          create: [{ tenantId: DEMO_TENANT_ID, userId: users[`${PREFIX}NODAL2`].id, sortOrder: 0 }],
        },
      },
    });
  }
  console.log(`✅  Programmes: ${SCHEMES.length} with budgets, expenditure, KPIs and action items`);
  console.log(`\n🌊  Demo tenant ready. Reach it at the "${DEMO_SLUG}" slug, or set DEV_DEFAULT_TENANT_SLUG=${DEMO_SLUG} locally.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

module.exports = { DEMO_TENANT_ID, DEMO_SLUG, DEMO_CONFIG };
