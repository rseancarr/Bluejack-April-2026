// Commit a pending ImportBatch: write FinancialSnapshot rows exactly as parsed.
import { prisma } from "../db";
import type { ParsedWorkbook } from "./parser";
import { resolveWorkbook, type UserResolutions } from "./match";
import { reconcile } from "./reconcile";

export class CommitError extends Error {}

export async function commitBatch(batchId: string): Promise<{ snapshots: number; createdInvestments: number }> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new CommitError("Import batch not found");
  if (batch.status !== "pending") throw new CommitError(`Batch is ${batch.status}, not pending`);
  if (!batch.parsedJson) throw new CommitError("Batch has no parsed data");
  const parsed = JSON.parse(batch.parsedJson) as ParsedWorkbook;
  const user = batch.resolutionsJson ? (JSON.parse(batch.resolutionsJson) as UserResolutions) : { funds: {}, investments: {} };
  const resolved = await resolveWorkbook(parsed, user);
  if (resolved.unresolvedCount > 0) {
    throw new CommitError(`${resolved.unresolvedCount} row(s) are still unmatched. Map or create them before committing.`);
  }

  // Refuse a second batch for the same as-of date: snapshots are one-per-month.
  const dup = await prisma.importBatch.findFirst({ where: { status: "committed", asOfDate: new Date(`${parsed.asOfDate}T00:00:00Z`) } });
  if (dup) throw new CommitError(`A committed import already exists for ${parsed.asOfDate} (${dup.fileName}). Discard it first if this is a restatement.`);

  const asOfDate = new Date(`${parsed.asOfDate}T00:00:00Z`);
  const variances = reconcile(parsed.funds, parsed.investments);
  let createdInvestments = 0;
  let snapshots = 0;

  await prisma.$transaction(async (tx) => {
    for (const f of resolved.funds) {
      const row = parsed.funds[f.index];
      await tx.financialSnapshot.create({
        data: {
          batchId,
          asOfDate,
          level: "fund",
          fundId: f.fundId!,
          cost: row.fields.cost,
          contributions: row.fields.contributions,
          distributions: row.fields.distributions,
          nav: row.fields.nav,
          irr: row.fields.irr,
          moic: row.fields.moic,
          extraJson: Object.keys(row.extra).length ? JSON.stringify(row.extra) : null,
          sourceSheet: row.sheet,
          sourceRow: row.row,
          sourceName: row.name,
        },
      });
      snapshots++;
      // Learn the external ID if the fund had none and the workbook supplies one.
      if (row.externalId && f.matchedBy !== "externalId") {
        const fund = await tx.fund.findUnique({ where: { id: f.fundId! } });
        if (fund && !fund.externalId) await tx.fund.update({ where: { id: f.fundId! }, data: { externalId: row.externalId } });
      }
    }
    for (const i of resolved.investments) {
      const row = parsed.investments[i.index];
      let investmentId = i.investmentId;
      if (!investmentId) {
        if (!i.createNew || !i.fundId) throw new CommitError(`Row ${row.row} (${row.name}) is unresolved`);
        const created = await tx.investment.create({
          data: { name: row.name, fundId: i.fundId, bucket: i.bucket ?? "LMM PE", externalId: row.externalId ?? null, status: "active" },
        });
        investmentId = created.id;
        createdInvestments++;
        if (!row.externalId) {
          await tx.nameMapping.upsert({
            where: { sourceName: row.name },
            create: { sourceName: row.name, level: "investment", investmentId },
            update: { investmentId, level: "investment", fundId: null },
          });
        }
      } else if (row.externalId && i.matchedBy !== "externalId") {
        const inv = await tx.investment.findUnique({ where: { id: investmentId } });
        if (inv && !inv.externalId) await tx.investment.update({ where: { id: investmentId }, data: { externalId: row.externalId } });
      }
      await tx.financialSnapshot.create({
        data: {
          batchId,
          asOfDate,
          level: "investment",
          investmentId,
          cost: row.fields.cost,
          contributions: row.fields.contributions,
          distributions: row.fields.distributions,
          nav: row.fields.nav,
          irr: row.fields.irr,
          moic: row.fields.moic,
          extraJson: Object.keys(row.extra).length ? JSON.stringify(row.extra) : null,
          sourceSheet: row.sheet,
          sourceRow: row.row,
          sourceName: row.name,
        },
      });
      snapshots++;
    }
    await tx.importBatch.update({
      where: { id: batchId },
      data: {
        status: "committed",
        committedAt: new Date(),
        asOfDate,
        rowCount: snapshots,
        varianceJson: JSON.stringify(variances),
        parsedJson: null,
        resolutionsJson: null,
      },
    });
  });

  return { snapshots, createdInvestments };
}
