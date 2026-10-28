import { monthLabel } from "@/lib/dates";
import type { BudgetLine, TrendRow } from "@/lib/finance";
import { pct, rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Table, Td, Th, TotalRow } from "./table";

export function CategoryTable({ lines, names, budgetTotal, expense }: { lines: BudgetLine[]; names: Map<number, string>; budgetTotal: number; expense: number }) {
  const rows = lines.filter((l) => l.budget > 0 || l.actual > 0);
  return (
    <Table>
      <thead><tr><Th>Kategori</Th><Th num>Actual</Th><Th num>Budget</Th><Th num>% Budget</Th></tr></thead>
      <tbody>
        {rows.map((l) => {
          const over = l.budget > 0 ? l.actual > l.budget : l.actual > 0;
          return (
            <tr key={l.categoryId}>
              <Td>{names.get(l.categoryId)}</Td>
              <Td num className={cn(!l.actual && "text-muted")}>{rp(l.actual)}</Td>
              <Td num className={cn(l.budget ? "text-ink-2" : "text-muted")}>{l.budget ? rp(l.budget) : "—"}</Td>
              <Td num className={cn(over ? "text-neg" : "text-ink-2")}>{l.budget ? pct(l.used) : l.actual ? "tanpa budget" : "—"}</Td>
            </tr>
          );
        })}
        <TotalRow>
          <Td>Total</Td><Td num>{rp(expense)}</Td><Td num>{rp(budgetTotal)}</Td>
          <Td num className={cn(budgetTotal && expense > budgetTotal && "text-neg")}>{budgetTotal ? pct(expense / budgetTotal) : "—"}</Td>
        </TotalRow>
      </tbody>
    </Table>
  );
}

export function TrendTable({ rows, month }: { rows: TrendRow[]; month: string }) {
  return (
    <Table>
      <thead>
        <tr><Th>Bulan</Th><Th num>Pemasukan</Th><Th num>Pengeluaran</Th><Th num>Selisih</Th><Th num>Saldo awal</Th><Th num>Saldo akhir</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.month} className={cn(r.month === month && "[&>td]:font-medium")}>
            <Td className={cn(r.month === month && "font-medium")}>{monthLabel(r.month)}</Td>
            <Td num>{rp(r.income)}</Td>
            <Td num>{rp(r.expense)}</Td>
            <Td num className={cn(r.net < 0 && "text-neg")}>{r.net >= 0 ? "+" : ""}{rp(r.net)}</Td>
            <Td num className="text-ink-2">{r.opening === null ? <span className="text-muted">—</span> : rp(r.opening)}</Td>
            <Td num className="font-bold">{r.closing === null ? <span className="font-normal text-muted">—</span> : rp(r.closing)}</Td>
          </tr>
        ))}
        <TotalRow>
          <Td>Total</Td>
          <Td num>{rp(rows.reduce((s, r) => s + r.income, 0))}</Td>
          <Td num>{rp(rows.reduce((s, r) => s + r.expense, 0))}</Td>
          <Td num>{rp(rows.reduce((s, r) => s + r.net, 0))}</Td>
          <Td /><Td />
        </TotalRow>
      </tbody>
    </Table>
  );
}
