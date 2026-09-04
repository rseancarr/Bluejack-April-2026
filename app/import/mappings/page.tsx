import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { MappingForm, DeleteMappingButton } from "./MappingForm";

export const dynamic = "force-dynamic";

export default async function MappingsPage() {
  const [mappings, funds, investments] = await Promise.all([
    prisma.nameMapping.findMany({ include: { fund: true, investment: { include: { fund: true } } }, orderBy: { sourceName: "asc" } }),
    prisma.fund.findMany({ orderBy: { vintage: "asc" } }),
    prisma.investment.findMany({ orderBy: { name: "asc" }, include: { fund: true } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Name mappings" subtitle={<>Workbook names → records, used when a row has no accounting ID. Rows with an ID match by ID (set it on the fund / investment page). <Link href="/import" className="link">Back to import</Link></>} />
      <section className="card">
        <div className="card-h"><h2>Add / replace mapping</h2></div>
        <div className="card-b"><MappingForm funds={funds.map((f) => ({ id: f.id, name: f.name }))} investments={investments.map((i) => ({ id: i.id, name: `${i.name} · ${i.fund.name}` }))} /></div>
      </section>
      <div className="tbl-wrap">
        <table className="tbl compact">
          <thead><tr><th>Workbook name</th><th>Level</th><th>Maps to</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id}>
                <td className="font-medium">{m.sourceName}</td>
                <td>{m.level}</td>
                <td>{m.investment ? <Link href={`/investments/${m.investment.id}`} className="link">{m.investment.name} <span className="muted">· {m.investment.fund.name}</span></Link> : m.fund ? <Link href={`/funds/${m.fund.id}`} className="link">{m.fund.name}</Link> : <span className="text-neg">dangling</span>}</td>
                <td className="whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                <td className="text-right"><DeleteMappingButton id={m.id} /></td>
              </tr>
            ))}
            {mappings.length === 0 && <tr><td colSpan={5} className="muted text-center py-6">No mappings yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
