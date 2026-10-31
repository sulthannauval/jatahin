import { monthLabel } from "@/lib/dates";
import type { TrendRow } from "@/lib/finance";
import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Table, Td, Th, TotalRow } from "./table";

export function TrendTable({ rows, month }: { rows: TrendRow[]; month: string }) {
  return (
    <Table>
      <thead>
        <tr><Th>Bulan</Th><Th num>Pemasukan</Th><Th num>Pengeluaran</Th><Th num>Selisih</Th><Th num>Kantong lain</Th><Th num>Saldo awal</Th><Th num>Saldo akhir</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.month} className={cn(r.month === month && "[&>td]:font-medium")}>
            <Td className={cn(r.month === month && "font-medium")}>{monthLabel(r.month)}</Td>
            <Td num>{rp(r.income)}</Td>
            <Td num>{rp(r.expense)}</Td>
            <Td num className={cn(r.net < 0 && "text-neg")}>{r.net >= 0 ? "+" : ""}{rp(r.net)}</Td>
            <Td num className={cn(!r.moved && "text-muted")}>{r.moved > 0 ? "+" : r.moved < 0 ? "−" : ""}{rp(Math.abs(r.moved))}</Td>
            <Td num className="text-ink-2">{r.opening === null ? <span className="text-muted">—</span> : rp(r.opening)}</Td>
            <Td num className="font-bold">{r.closing === null ? <span className="font-normal text-muted">—</span> : rp(r.closing)}</Td>
          </tr>
        ))}
        <TotalRow>
          <Td>Total</Td>
          <Td num>{rp(rows.reduce((s, r) => s + r.income, 0))}</Td>
          <Td num>{rp(rows.reduce((s, r) => s + r.expense, 0))}</Td>
          <Td num>{rp(rows.reduce((s, r) => s + r.net, 0))}</Td>
          <Td num>{rp(rows.reduce((s, r) => s + r.moved, 0))}</Td>
          <Td /><Td />
        </TotalRow>
      </tbody>
    </Table>
  );
}
