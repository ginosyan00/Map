import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
