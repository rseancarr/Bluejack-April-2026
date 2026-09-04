// Matching workbook rows to Fund / Investment records. Never creates anything.
import { prisma } from "../db";
import type { ParsedRow, ParsedWorkbook } from "./parser";

export type MatchedBy = "externalId" | "mapping" | "resolution" | "none";

export interface FundResolution {
  index: number;
  fundId: string | null;
  matchedBy: MatchedBy;
  suggestion: { id: string; name: string } | null;
}

export interface InvestmentResolution {
  index: number;
  investmentId: string | null;
  matchedBy: MatchedBy;
  createNew: boolean;
  /** bucket to use if createNew */
  bucket: string | null;
  /** the fund this row belongs to (resolved from Fund ID / Fund Name); needed for createNew */
  fundId: string | null;
  suggestion: { id: string; name: string } | null;
}

/** User decisions persisted on the pending batch (ImportBatch.resolutionsJson). */
export interface UserResolutions {
  funds: Record<number, { fundId: string }>;
  investments: Record<number, { investmentId: string } | { createNew: true; bucket: string }>;
}

export const emptyResolutions = (): UserResolutions => ({ funds: {}, investments: {} });

export interface ResolvedWorkbook {
  funds: FundResolution[];
  investments: InvestmentResolution[];
  unresolvedCount: number;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export async function resolveWorkbook(parsed: ParsedWorkbook, user: UserResolutions = emptyResolutions()): Promise<ResolvedWorkbook> {
  const [funds, investments, mappings] = await Promise.all([
    prisma.fund.findMany({ select: { id: true, name: true, externalId: true } }),
    prisma.investment.findMany({ select: { id: true, name: true, externalId: true, fundId: true } }),
    prisma.nameMapping.findMany(),
  ]);
  const fundByExt = new Map(funds.filter((f) => f.externalId).map((f) => [f.externalId!, f]));
  const fundByName = new Map(funds.map((f) => [norm(f.name), f]));
  const invByExt = new Map(investments.filter((i) => i.externalId).map((i) => [i.externalId!, i]));
  const fundMap = new Map(mappings.filter((m) => m.level === "fund" && m.fundId).map((m) => [norm(m.sourceName), m.fundId!]));
  const invMap = new Map(mappings.filter((m) => m.level === "investment" && m.investmentId).map((m) => [norm(m.sourceName), m.investmentId!]));

  const resolveFund = (externalId: string | null, name: string | null): { fundId: string | null; matchedBy: MatchedBy; suggestion: FundResolution["suggestion"] } => {
    if (externalId && fundByExt.has(externalId)) return { fundId: fundByExt.get(externalId)!.id, matchedBy: "externalId", suggestion: null };
    const mapped = fundMap.get(norm(name));
    if (mapped) return { fundId: mapped, matchedBy: "mapping", suggestion: null };
    const exact = fundByName.get(norm(name));
    return { fundId: null, matchedBy: "none", suggestion: exact ? { id: exact.id, name: exact.name } : null };
  };

  const fundRes: FundResolution[] = parsed.funds.map((row, index) => {
    const r = resolveFund(row.externalId, row.name);
    const u = user.funds[index];
    if (!r.fundId && u) return { index, fundId: u.fundId, matchedBy: "resolution", suggestion: r.suggestion };
    return { index, ...r };
  });

  const invRes: InvestmentResolution[] = parsed.investments.map((row: ParsedRow, index) => {
    const fund = resolveFund(row.fundExternalId, row.fundName);
    // fund may also be resolved by the user on the Funds sheet for the same name/ID
    let fundId = fund.fundId;
    if (!fundId) {
      const sameFund = parsed.funds.findIndex((f) => (row.fundExternalId && f.externalId === row.fundExternalId) || norm(f.name) === norm(row.fundName));
      if (sameFund >= 0) fundId = fundRes[sameFund].fundId;
    }
    let investmentId: string | null = null;
    let matchedBy: MatchedBy = "none";
    if (row.externalId && invByExt.has(row.externalId)) {
      investmentId = invByExt.get(row.externalId)!.id;
      matchedBy = "externalId";
    } else if (invMap.has(norm(row.name))) {
      investmentId = invMap.get(norm(row.name))!;
      matchedBy = "mapping";
    }
    const u = user.investments[index];
    let createNew = false;
    let bucket: string | null = null;
    if (!investmentId && u) {
      if ("createNew" in u) {
        createNew = true;
        bucket = u.bucket;
      } else {
        investmentId = u.investmentId;
      }
      matchedBy = "resolution";
    }
    const exact = investments.find((i) => norm(i.name) === norm(row.name) && (!fundId || i.fundId === fundId));
    return {
      index,
      investmentId,
      matchedBy,
      createNew,
      bucket,
      fundId,
      suggestion: exact ? { id: exact.id, name: exact.name } : null,
    };
  });

  const unresolvedCount =
    fundRes.filter((f) => !f.fundId).length + invRes.filter((i) => !i.investmentId && !(i.createNew && i.fundId)).length;
  return { funds: fundRes, investments: invRes, unresolvedCount };
}
