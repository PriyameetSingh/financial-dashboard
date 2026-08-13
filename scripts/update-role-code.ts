import { PrismaClient } from '@prisma/client';

/** Phase 2: this script runs outside any request, so it addresses the tenant
 * explicitly (default: the Odisha tenant; override with SEED_TENANT_ID). */
const SCRIPT_TENANT_ID = process.env.SEED_TENANT_ID || '00000000-0000-4000-8000-000000000001';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting role code update from PROGRAMME_MANAGER to VERTICAL_HEAD...');

  // Find the role with code PROGRAMME_MANAGER
  const programmeManagerRole = await prisma.role.findFirst({
    where: { tenantId: SCRIPT_TENANT_ID, code: 'PROGRAMME_MANAGER' },
  });

  if (!programmeManagerRole) {
    console.log('No role found with code PROGRAMME_MANAGER. Exiting.');
    return;
  }

  console.log('Found role:', programmeManagerRole);

  // Check if VERTICAL_HEAD already exists
  const existingVerticalHead = await prisma.role.findFirst({
    where: { code: 'VERTICAL_HEAD' },
  });

  if (existingVerticalHead) {
    console.log('A role with code VERTICAL_HEAD already exists. Please resolve this conflict manually.');
    console.log('Existing role:', existingVerticalHead);
    return;
  }

  // Update the role code and name
  const updatedRole = await prisma.role.update({
    where: { tenantId_code: { tenantId: SCRIPT_TENANT_ID, code: 'PROGRAMME_MANAGER' } },
    data: {
      code: 'VERTICAL_HEAD',
      name: 'Vertical Head',
    },
  });

  console.log('Successfully updated role:', updatedRole);
  console.log('Role code changed from PROGRAMME_MANAGER to VERTICAL_HEAD');
}

main()
  .catch((e) => {
    console.error('Error updating role code:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
