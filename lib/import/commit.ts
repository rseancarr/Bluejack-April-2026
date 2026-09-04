// Commit a pending ImportBatch: write FinancialSnapshot rows exactly as parsed.
import { prisma } from "../db";
import type { ParsedWorkbook } from "./parser";
import { resolveWorkbook, type UserResolutions } from "./match";
import { reconcile } from "./reconcile";
import { bucketForAssetClass } from "../constants";

export class CommitError extends Error {}

const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

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
  const fundRes = resolved.funds[0];
  const fundRow = parsed.funds[0];
  const asOfDate = new Date(`${parsed.asOfDate}T00:00:00Z`);

  // One committed batch per fund per as-of date.
  const dup = await prisma.importBatch.findFirst({ where: { status: "committed", asOfDate, fundId: fundRes.fundId! } });
  if (dup) throw new CommitError(`A committed import already exists for this fund as of ${parsed.asOfDate} (${dup.fileName}). Discard it first if this is a restatement.`);

  const variances = reconcile(parsed);
  let createdInvestments = 0;
  let snapshots = 0;

  await prisma.$transaction(async (tx) => {
    await tx.financialSnapshot.create({
      data: {
        batchId,
        asOfDate,
        level: "fund",
        fundId: fundRes.fundId!,
        cost: fundRow.fields.cost,
        contributions: fundRow.fields.contributions,
        distributions: fundRow.fields.distributions,
        nav: fundRow.fields.nav,
        irr: fundRow.fields.irr,
        moic: fundRow.fields.moic,
        commitments: fundRow.fundFields.commitments,
        redemptions: fundRow.fundFields.redemptions,
        totalValue: fundRow.fundFields.totalValue,
        irrGross: fundRow.fundFields.irrGross,
        moicGross: fundRow.fundFields.moicGross,
        irrNet: fundRow.fundFields.irrNet,
        moicNet: fundRow.fundFields.moicNet,
        classJson: JSON.stringify(fundRow.classes),
        exposureJson: parsed.exposure ? JSON.stringify(parsed.exposure) : null,
        extraJson: Object.keys(fundRow.extra).length ? JSON.stringify(fundRow.extra) : null,
        sourcesJson: JSON.stringify(fundRow.sources),
        sourceSheet: fundRow.sheet,
        sourceRow: fundRow.row,
        sourceName: fundRow.name,
      },
    });
    snapshots++;

    for (const i of resolved.investments) {
      const row = parsed.investments[i.index];
      let investmentId = i.investmentId;
      if (!investmentId) {
        if (!i.createNew || !i.fundId) throw new CommitError(`Row ${row.row} (${row.name}) is unresolved`);
        const created = await tx.investment.create({
          data: {
            name: row.name,
            fundId: i.fundId,
            bucket: i.bucket ?? bucketForAssetClass(row.assetClass),
            assetClass: row.assetClass,
            externalId: null,
            status: row.realized ? "realized" : "active",
            sector: typeof row.extra["Investment Type"] === "string" ? (row.extra["Investment Type"] as string) : null,
          },
        });
        investmentId = created.id;
        createdInvestments++;
        await tx.nameMapping.upsert({
          where: { sourceName: row.name },
          create: { sourceName: row.name, level: "investment", investmentId },
          update: { investmentId, level: "investment", fundId: null },
        });
      }
      if (row.realized) await tx.investment.updateMany({ where: { id: investmentId, status: "active" }, data: { status: "realized" } });
      if (row.assetClass) await tx.investment.update({ where: { id: investmentId }, data: { assetClass: row.assetClass } });
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
          valuationDate: toDate(row.valuationDate),
          holdingStatus: row.holdingStatus,
          extraJson: Object.keys(row.extra).length ? JSON.stringify(row.extra) : null,
          sourcesJson: JSON.stringify(row.sources),
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
        fundId: fundRes.fundId!,
        fundName: fundRow.name,
        rowCount: snapshots,
        varianceJson: JSON.stringify(variances),
        parsedJson: null,
        resolutionsJson: null,
      },
    });
  });

  return { snapshots, createdInvestments };
}
