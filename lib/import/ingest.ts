// Upload → parse → pending batch (or failed batch for the log). No snapshots are written here.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db";
import { ensureDir, safeFileName } from "../storage";
import { parseWorkbook, ParseError } from "./parser";

export interface IngestResult {
  batchId: string;
  status: "pending" | "failed";
  problems?: string[];
}

export async function ingestWorkbook(buffer: Buffer, fileName: string, uploadedBy: string | null): Promise<IngestResult> {
  const dir = await ensureDir("imports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = path.join(dir, `${stamp}_${safeFileName(fileName)}`);
  await writeFile(storagePath, buffer);

  try {
    const parsed = await parseWorkbook(buffer);
    const batch = await prisma.importBatch.create({
      data: {
        fileName,
        storagePath,
        uploadedBy,
        status: "pending",
        asOfDate: new Date(`${parsed.asOfDate}T00:00:00Z`),
        fundName: parsed.funds[0].name,
        parsedJson: JSON.stringify(parsed),
        rowCount: parsed.funds.length + parsed.investments.length,
      },
    });
    return { batchId: batch.id, status: "pending" };
  } catch (e) {
    const problems = e instanceof ParseError ? e.problems : [(e as Error).message];
    const batch = await prisma.importBatch.create({
      data: { fileName, storagePath, uploadedBy, status: "failed", errorMessage: problems.join("\n") },
    });
    return { batchId: batch.id, status: "failed", problems };
  }
}
