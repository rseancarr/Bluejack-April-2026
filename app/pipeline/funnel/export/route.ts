import { computeFunnel, funnelToCsv, type FunnelFilters } from "@/lib/queries/funnel";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filters: FunnelFilters = {
    fund: url.searchParams.get("fund") ?? undefined,
    bucket: url.searchParams.get("bucket") ?? undefined,
    sourceType: url.searchParams.get("sourceType") ?? undefined,
    owner: url.searchParams.get("owner") ?? undefined,
    view: url.searchParams.get("view") === "same" ? "same" : "full",
  };
  const data = await computeFunnel(filters);
  const csv = funnelToCsv(data);
  const name = `funnel_${data.view}_${data.through.toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
