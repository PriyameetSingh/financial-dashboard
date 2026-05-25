#!/usr/bin/env tsx

/**
 * Migrate all PROGRAMME_MANAGER role users and role definitions to VERTICAL_HEAD
 * 
 * This script:
 * 1. Updates all UserRole records from PROGRAMME_MANAGER to VERTICAL_HEAD
 * 2. Deletes the PROGRAMME_MANAGER Role record
 * 3. Transfers any unique permissions from PROGRAMME_MANAGER to VERTICAL_HEAD
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting PROGRAMME_MANAGER → VERTICAL_HEAD migration...\n");

  try {
    // Step 1: Find the PROGRAMME_MANAGER and VERTICAL_HEAD role records
    const programmeManagerRole = await prisma.role.findUnique({
      where: { code: "PROGRAMME_MANAGER" },
      include: { rolePermissions: { include: { permission: true } } },
    });

    const verticalHeadRole = await prisma.role.findUnique({
      where: { code: "VERTICAL_HEAD" },
      include: { rolePermissions: { include: { permission: true } } },
    });

    if (!programmeManagerRole) {
      console.log("✓ No PROGRAMME_MANAGER role found. Migration not needed.");
      return;
    }

    if (!verticalHeadRole) {
      console.error("✗ VERTICAL_HEAD role not found! Cannot proceed.");
      process.exit(1);
    }

    console.log(`Found PROGRAMME_MANAGER role: ${programmeManagerRole.name}`);
    console.log(`Found VERTICAL_HEAD role: ${verticalHeadRole.name}\n`);

    // Step 2: Count users with PROGRAMME_MANAGER role
    const usersWithProgrammeManager = await prisma.userRole.count({
      where: { roleId: programmeManagerRole.id },
    });

    console.log(`Users with PROGRAMME_MANAGER role: ${usersWithProgrammeManager}`);

    if (usersWithProgrammeManager === 0) {
      console.log("✓ No users have PROGRAMME_MANAGER role.\n");
    }

    // Step 3: Migrate permissions (if PROGRAMME_MANAGER has unique permissions)
    const pmPermissionCodes = new Set(
      programmeManagerRole.rolePermissions.map((rp) => rp.permission.code)
    );
    const vhPermissionCodes = new Set(
      verticalHeadRole.rolePermissions.map((rp) => rp.permission.code)
    );

    const uniquePmPermissions = [...pmPermissionCodes].filter(
      (code) => !vhPermissionCodes.has(code)
    );

    if (uniquePmPermissions.length > 0) {
      console.log(
        `\nPROGRAMME_MANAGER has ${uniquePmPermissions.length} unique permissions:`
      );
      uniquePmPermissions.forEach((code) => console.log(`  - ${code}`));
      console.log("\nTransferring these permissions to VERTICAL_HEAD...");

      for (const permCode of uniquePmPermissions) {
        const permission = await prisma.permission.findUnique({
          where: { code: permCode },
        });
        if (permission) {
          await prisma.rolePermission.create({
            data: {
              roleId: verticalHeadRole.id,
              permissionId: permission.id,
            },
          });
          console.log(`  ✓ Added ${permCode} to VERTICAL_HEAD`);
        }
      }
    } else {
      console.log(
        "\n✓ PROGRAMME_MANAGER has no unique permissions. VERTICAL_HEAD already has all permissions."
      );
    }

    // Step 4: Migrate users in a transaction
    if (usersWithProgrammeManager > 0) {
      console.log(`\nMigrating ${usersWithProgrammeManager} user(s)...`);

      await prisma.$transaction(async (tx) => {
        // Update all UserRole records from PROGRAMME_MANAGER to VERTICAL_HEAD
        await tx.userRole.updateMany({
          where: { roleId: programmeManagerRole.id },
          data: { roleId: verticalHeadRole.id },
        });

        console.log(`  ✓ Updated ${usersWithProgrammeManager} UserRole record(s)`);
      });
    }

    // Step 5: Delete RolePermission entries for PROGRAMME_MANAGER
    const deletedRolePermissions = await prisma.rolePermission.deleteMany({
      where: { roleId: programmeManagerRole.id },
    });
    console.log(
      `\n✓ Deleted ${deletedRolePermissions.count} RolePermission records for PROGRAMME_MANAGER`
    );

    // Step 6: Delete the PROGRAMME_MANAGER Role record
    await prisma.role.delete({
      where: { id: programmeManagerRole.id },
    });
    console.log("✓ Deleted PROGRAMME_MANAGER role record");

    console.log("\n✅ Migration completed successfully!");
    console.log("   All PROGRAMME_MANAGER users are now VERTICAL_HEAD");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
