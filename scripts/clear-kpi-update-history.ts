#!/usr/bin/env tsx

import { prisma } from '../lib/prisma';

/**
 * Script to clear KPI update history from the database
 * This will delete all KpiMeasurement records to remove update history
 * Users will only see denominator values from KpiTarget with 0 numerator
 */

async function clearKpiUpdateHistory() {
  console.log('Starting to clear KPI update history...');
  
  try {
    // Get count before deletion
    const countBefore = await prisma.kpiMeasurement.count();
    console.log(`Total KPI measurements (update history) to be deleted: ${countBefore}`);
    
    // Show sample of what will be deleted
    const sampleMeasurements = await prisma.kpiMeasurement.findMany({
      select: {
        id: true,
        measuredAt: true,
        numeratorValue: true,
        yesValue: true,
        progressStatus: true,
        workflowStatus: true,
        kpiTarget: {
          select: {
            denominatorValue: true,
            kpiDefinition: {
              select: {
                description: true
              }
            }
          }
        }
      },
      take: 3
    });
    
    console.log('Sample measurements that will be deleted:');
    sampleMeasurements.forEach(m => {
      console.log(`  ${m.kpiTarget.kpiDefinition.description}`);
      console.log(`    Measured: ${m.measuredAt.toISOString().split('T')[0]}`);
      console.log(`    Value: ${m.numeratorValue || 0} / ${m.kpiTarget.denominatorValue || 0}`);
      console.log(`    Status: ${m.progressStatus}/${m.workflowStatus}`);
      console.log('');
    });
    
    // Delete all KPI measurements (this removes the update history)
    const result = await prisma.kpiMeasurement.deleteMany({});
    
    console.log(`Deleted ${result.count} KPI measurements`);
    console.log('KPI update history has been cleared successfully');
    
    // Verify KPI targets still exist (these contain the denominator values)
    const targetCount = await prisma.kpiTarget.count();
    console.log(`KPI targets (with denominator values) preserved: ${targetCount}`);
    
    // Show sample of what remains (targets only)
    const sampleTargets = await prisma.kpiTarget.findMany({
      select: {
        denominatorValue: true,
        kpiDefinition: {
          select: {
            description: true
          }
        },
        financialYear: {
          select: {
            label: true
          }
        }
      },
      take: 3
    });
    
    console.log('Sample KPI targets that remain (users will see these with 0 numerator):');
    sampleTargets.forEach(t => {
      console.log(`  ${t.kpiDefinition.description} (${t.financialYear.label})`);
      console.log(`    Target: 0 / ${t.denominatorValue || 0}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error clearing KPI update history:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
async function main() {
  await clearKpiUpdateHistory();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

export { clearKpiUpdateHistory };
