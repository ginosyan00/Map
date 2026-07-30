import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ModelUploadInfo = {
  id: string;
  url: string;
  bytes: number;
  updatedAt: string;
};

export function isValidModelUploadId(id: string): boolean {
  return ID_RE.test(id);
}

export function modelUploadPath(id: string): string {
  return path.join(UPLOAD_DIR, `${id}.glb`);
}

export async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveModelUpload(bytes: Buffer): Promise<{ id: string; url: string }> {
  await ensureUploadDir();
  const id = randomUUID();
  await writeFile(modelUploadPath(id), bytes);
  return { id, url: `/api/models/${id}` };
}

export async function readModelUpload(id: string): Promise<Buffer | null> {
  if (!isValidModelUploadId(id)) return null;
  try {
    return await readFile(modelUploadPath(id));
  } catch {
    return null;
  }
}

export async function listModelUploads(): Promise<ModelUploadInfo[]> {
  await ensureUploadDir();
  const names = await readdir(UPLOAD_DIR);
  const items: ModelUploadInfo[] = [];

  for (const name of names) {
    if (!name.endsWith(".glb")) continue;
    const id = name.slice(0, -4);
    if (!isValidModelUploadId(id)) continue;
    try {
      const info = await stat(modelUploadPath(id));
      items.push({
        id,
        url: `/api/models/${id}`,
        bytes: info.size,
        updatedAt: info.mtime.toISOString(),
      });
    } catch {
      /* skip unreadable */
    }
  }

  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return items;
}
