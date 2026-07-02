import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

let lastSyncTime = 0;
let lastFileMtime = 0;

interface JsonEntry {
  id?: string;
  type: "NEW_FEATURE" | "FIX" | "IMPROVEMENT" | "BREAKING_CHANGE";
  title: string;
  description?: string | null;
}

interface JsonRelease {
  id?: string;
  version: string;
  isCurrent: boolean;
  createdAt: string;
  entries: JsonEntry[];
}

export async function syncReleases() {
  const filePath = path.join(process.cwd(), "data/releases.json");
  if (!fs.existsSync(filePath)) {
    return;
  }

  const stats = fs.statSync(filePath);
  const mtime = stats.mtimeMs;

  // Only sync if file was modified or if it hasn't been checked yet
  if (mtime === lastFileMtime && lastSyncTime > 0) {
    return;
  }

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const jsonReleases: JsonRelease[] = JSON.parse(fileContent);

    await prisma.$transaction(async (tx) => {
      // Get all current releases in database
      const dbReleases = await tx.release.findMany();

      // Find releases in database that are NOT in JSON, and delete them
      const jsonVersions = jsonReleases.map((r: JsonRelease) => r.version);
      const toDelete = dbReleases.filter((r: any) => !jsonVersions.includes(r.version));

      if (toDelete.length > 0) {
        await tx.release.deleteMany({
          where: {
            id: { in: toDelete.map((r: any) => r.id) },
          },
        });
      }

      // Upsert releases from JSON
      for (const jsonRelease of jsonReleases) {
        const existing = dbReleases.find((r: any) => r.version === jsonRelease.version);

        let releaseId = existing?.id;

        if (existing) {
          // Update existing release (except ID, but update isCurrent and createdAt)
          await tx.release.update({
            where: { id: existing.id },
            data: {
              isCurrent: jsonRelease.isCurrent,
              createdAt: new Date(jsonRelease.createdAt),
            },
          });
        } else {
          // Create new release
          const created = await tx.release.create({
            data: {
              id: jsonRelease.id || undefined,
              version: jsonRelease.version,
              isCurrent: jsonRelease.isCurrent,
              createdAt: new Date(jsonRelease.createdAt),
            },
          });
          releaseId = created.id;
        }

        // Always replace/update entries for this release
        // First delete all entries for this release
        await tx.changelogEntry.deleteMany({
          where: { releaseId },
        });

        // Insert new entries
        if (jsonRelease.entries && jsonRelease.entries.length > 0) {
          await tx.changelogEntry.createMany({
            data: jsonRelease.entries.map((e) => ({
              id: e.id || undefined,
              releaseId: releaseId as string,
              type: e.type,
              title: e.title,
              description: e.description || null,
            })),
          });
        }
      }
    });

    lastFileMtime = mtime;
    lastSyncTime = Date.now();
  } catch (error) {
    console.error("Error syncing releases from JSON file:", error);
  }
}
