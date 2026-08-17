#!/usr/bin/env node
/**
 * One-shot compose init: create hudd_test, enable pgvector on both DBs,
 * migrate both, seed Odisha+roles+Suryapur on hudd_nexus, seed Odisha only
 * on hudd_test. Idempotent — safe to re-run.
 *
 * Never runs seed_demo_tenant.js against the test database.
 */
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

const NEXUS_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!NEXUS_URL) {
  console.error("docker-init: DATABASE_URL or DIRECT_URL is required");
  process.exit(1);
}

const TEST_DB = "hudd_test";

function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

const TEST_URL = withDatabase(NEXUS_URL, TEST_DB);

function run(cmd, args, extraEnv = {}) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

async function ensureDatabase(admin, name) {
  const rows = await admin.$queryRaw`
    SELECT 1 AS ok FROM pg_database WHERE datname = ${name}
  `;
  if (rows.length === 0) {
    console.log(`Creating database ${name}…`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } else {
    console.log(`Database ${name} already exists.`);
  }
}

async function ensureVector(url, label) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log(`pgvector extension ready on ${label}.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const admin = new PrismaClient({ datasources: { db: { url: NEXUS_URL } } });
  try {
    await ensureDatabase(admin, TEST_DB);
    await admin.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log("pgvector extension ready on hudd_nexus.");
  } finally {
    await admin.$disconnect();
  }

  await ensureVector(TEST_URL, TEST_DB);

  const testEnv = { DATABASE_URL: TEST_URL, DIRECT_URL: TEST_URL };

  // Test database first (AGENTS.md). Full Odisha seed; never the demo tenant.
  run("npx", ["prisma", "migrate", "deploy"], testEnv);
  run("npx", ["prisma", "db", "seed"], testEnv);

  // Dev/demo database: Odisha + TASU admin + Suryapur.
  run("npx", ["prisma", "migrate", "deploy"]);
  run("npx", ["prisma", "db", "seed"]);
  run("node", ["prisma/seed_roles.js"]);
  run("node", ["prisma/seed_demo_tenant.js"]);

  console.log("\n✓ docker-init complete (hudd_nexus seeded with Odisha + Suryapur; hudd_test Odisha only).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
