#!/usr/bin/env tsx

import { prisma } from '../lib/prisma';

/**
 * Script to clear all KPI measurement values from the database
 * This will reset numeratorValue, denominatorValue, and yesValue to zero/null
 */

async function clearKpiMeasurementValues() {
  console.log('Starting to clear KPI measurement values...');
  
  try {
    // Get count before clearing
    const countBefore = await prisma.kpiMeasurement.count();
    console.log(`Total KPI measurements found: ${countBefore}`);
    
    // Check current values before clearing
    const currentValues = await prisma.kpiMeasurement.findMany({
      select: {
        id: true,
        numeratorValue: true,
        yesValue: true,
        measuredAt: true,
      },
      take: 5 // Just show first 5 for verification
    });
    
    console.log('Sample current values:');
    currentValues.forEach(m => {
      console.log(`  ID: ${m.id}, numerator: ${m.numeratorValue}, yes: ${m.yesValue}, date: ${m.measuredAt}`);
    });
    
    // Clear measurement data by resetting the value fields
    const result = await prisma.kpiMeasurement.updateMany({
      where: {}, // Update all records
      data: {
        numeratorValue: null,
        yesValue: null,
        // Also reset progress-related fields
        progressStatus: 'on_track',
        workflowStatus: 'draft',
        escalationFlag: null,
        remarks: null,
        bottleneckReason: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null
      }
    });
    
    console.log(`Updated ${result.count} KPI measurements`);
    
    // Verify the changes
    const afterValues = await prisma.kpiMeasurement.findMany({
      select: {
        id: true,
        numeratorValue: true,
        yesValue: true,
        progressStatus: true,
        workflowStatus: true,
      },
      take: 5
    });
    
    console.log('Sample values after clearing:');
    afterValues.forEach(m => {
      console.log(`  ID: ${m.id}, numerator: ${m.numeratorValue}, yes: ${m.yesValue}, status: ${m.progressStatus}/${m.workflowStatus}`);
    });
    
    console.log('KPI measurement values have been cleared successfully');
    
  } catch (error) {
    console.error('Error clearing KPI measurement values:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Alternative: Completely delete all KPI measurements
async function deleteAllKpiMeasurements() {
  console.log('Starting to delete all KPI measurements...');
  
  try {
    // Get count before deletion
    const countBefore = await prisma.kpiMeasurement.count();
    console.log(`Total KPI measurements to be deleted: ${countBefore}`);
    
    // Delete all KPI measurements
    const result = await prisma.kpiMeasurement.deleteMany({});
    
    console.log(`Deleted ${result.count} KPI measurements`);
    console.log('All KPI measurements have been deleted successfully');
    
  } catch (error) {
    console.error('Error deleting KPI measurements:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const operation = args[0] || 'clear'; // Default to 'clear', can pass 'delete' to completely remove
  
  if (operation === 'delete') {
    await deleteAllKpiMeasurements();
  } else if (operation === 'clear') {
    await clearKpiMeasurementValues();
  } else {
    console.log('Usage: tsx clear-kpi-measurements.ts [clear|delete]');
    console.log('  clear  - Reset measurement values to null and status to defaults (default)');
    console.log('  delete - Completely delete all KPI measurements');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

export { clearKpiMeasurementValues, deleteAllKpiMeasurements };
