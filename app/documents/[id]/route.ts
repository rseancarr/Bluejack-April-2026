import { readFile } from "node:fs/promises";
import path from "node:path";
import { storageRoot } from "@/lib/storage";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  // Defence in depth: only ever read from inside the storage folder, whatever the database says.
  const resolved = path.resolve(doc.storagePath);
  if (!resolved.startsWith(storageRoot() + path.sep)) return new NextResponse("Not found", { status: 404 });
  let data: Uint8Array<ArrayBuffer>;
  try {
    const buf = await readFile(resolved);
    data = new Uint8Array(buf.byteLength);
    data.set(buf);
  } catch {
    return new NextResponse("File missing from storage", { status: 404 });
  }
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
