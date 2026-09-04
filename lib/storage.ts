import { mkdir } from "node:fs/promises";
import path from "node:path";

export function storageRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || "./storage");
}

export async function ensureDir(sub: string): Promise<string> {
  const dir = path.join(storageRoot(), sub);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";
}
