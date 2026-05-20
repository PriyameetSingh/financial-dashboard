import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting role code update from PROGRAMME_MANAGER to VERTICAL_HEAD...');

  // Find the role with code PROGRAMME_MANAGER
  const programmeManagerRole = await prisma.role.findUnique({
    where: { code: 'PROGRAMME_MANAGER' },
  });

  if (!programmeManagerRole) {
    console.log('No role found with code PROGRAMME_MANAGER. Exiting.');
    return;
  }

  console.log('Found role:', programmeManagerRole);

  // Check if VERTICAL_HEAD already exists
  const existingVerticalHead = await prisma.role.findUnique({
    where: { code: 'VERTICAL_HEAD' },
  });

  if (existingVerticalHead) {
    console.log('A role with code VERTICAL_HEAD already exists. Please resolve this conflict manually.');
    console.log('Existing role:', existingVerticalHead);
    return;
  }

  // Update the role code and name
  const updatedRole = await prisma.role.update({
    where: { code: 'PROGRAMME_MANAGER' },
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
