#!/usr/bin/env tsx

import { prisma } from '../lib/prisma';

/**
 * Script to clear KPI progress data from the database
 * This will reset progressStatus, workflowStatus, and escalationFlag for all KPI measurements
 */

async function clearKpiProgress() {
  console.log('Starting to clear KPI progress data...');
  
  try {
    // Get count before clearing
    const countBefore = await prisma.kpiMeasurement.count();
    console.log(`Total KPI measurements found: ${countBefore}`);
    
    // Clear progress data by resetting the relevant fields
    const result = await prisma.kpiMeasurement.updateMany({
      where: {}, // Update all records
      data: {
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
    console.log('KPI progress data has been cleared successfully');
    
  } catch (error) {
    console.error('Error clearing KPI progress data:', error);
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
    await clearKpiProgress();
  } else {
    console.log('Usage: tsx clear-kpi-progress.ts [clear|delete]');
    console.log('  clear  - Reset progress fields to default values (default)');
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

export { clearKpiProgress, deleteAllKpiMeasurements };
