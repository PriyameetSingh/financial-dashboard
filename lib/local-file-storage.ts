import { promises as fs } from "fs";
import path from "path";
import { withNextBasePath } from "@/lib/next-base-path";

/**
 * Local file storage for meeting materials.
 * Files are stored in `data/meeting-materials/` relative to the project root.
 */

const STORAGE_BASE = path.join(process.cwd(), "data", "meeting-materials");

/**
 * Ensure the storage directory exists.
 */
async function ensureStorageDir(): Promise<void> {
  try {
    await fs.mkdir(STORAGE_BASE, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Save a file to local storage.
 * @param buffer File buffer
 * @param storagePath Relative path (e.g., `{meetingId}/{randomId}-{fileName}`)
 * @returns Full file path
 */
export async function saveFile(buffer: Buffer, storagePath: string): Promise<string> {
  await ensureStorageDir();

  const fullPath = path.join(STORAGE_BASE, storagePath);
  const dir = path.dirname(fullPath);

  // Ensure subdirectory exists
  await fs.mkdir(dir, { recursive: true });

  // Save file
  await fs.writeFile(fullPath, buffer);

  return fullPath;
}

/**
 * Get the full file path for a stored file.
 * @param storagePath Relative path (e.g., `{meetingId}/{randomId}-{fileName}`)
 * @returns Full file path
 */
export function getFilePath(storagePath: string): string {
  return path.join(STORAGE_BASE, storagePath);
}

/**
 * Check if a file exists.
 * @param storagePath Relative path
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    await fs.access(getFilePath(storagePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a file from local storage.
 * @param storagePath Relative path
 */
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await fs.unlink(getFilePath(storagePath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    // File doesn't exist, ignore
  }
}

/**
 * Get the public URL path for a stored file (for direct downloads via API route).
 * @param storagePath Relative path
 * @returns Public URL path
 */
export function getPublicUrlPath(storagePath: string): string {
  return withNextBasePath(`/api/v1/meeting-materials/${encodeURIComponent(storagePath)}`);
}
