"use client";

import { shortDate } from "@/lib/dates";
import { rp } from "@/lib/money";
import type { TxRow } from "@/lib/queries";
import { Table, Td, Th, TotalRow } from "./table";
import { Dot } from "./ui";
import { useTx } from "./tx-context";

/** Daily Log style table. Click a row to edit it. */
export function TxTable({ rows }: { rows: TxRow[] }) {
  const { openTx } = useTx();
  const income = rows.reduce((s, r) => s + (r.kind === "income" ? r.amount : 0), 0);
  const expense = rows.reduce((s, r) => s + (r.kind === "expense" ? r.amount : 0), 0);
  // Oldest first, like the sheet.
  const sorted = [...rows].reverse();
  return (
    // Fixed layout so it always fits the column: the description takes what's left and truncates.
    <Table className="min-w-[560px] table-fixed">
      <colgroup>
        <col className="w-[76px]" />
        <col className="w-[30%]" />
        <col />
        <col className="w-[112px]" />
        <col className="w-[124px]" />
      </colgroup>
      <thead>
        <tr><Th>Tanggal</Th><Th>Kategori</Th><Th>Deskripsi</Th><Th num>Pemasukan</Th><Th num>Pengeluaran</Th></tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr
            key={r.id}
            tabIndex={0}
            onClick={() => openTx({ id: r.id, kind: r.kind, categoryId: r.categoryId, potId: r.potId, date: r.date, amount: r.amount, description: r.description })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click()}
            className="cursor-pointer transition hover:bg-raised/60 focus-visible:bg-raised"
          >
            <Td className="num text-ink-2">{shortDate(r.date).replace(/ \d{4}$/, "")}</Td>
            <Td className="truncate"><span className="inline-flex items-center gap-2"><Dot group={r.group} />{r.categoryName}</span></Td>
            <Td className="truncate text-ink-2" title={[r.potName, r.description].filter(Boolean).join(" · ")}>{[r.potName, r.description].filter(Boolean).join(" · ")}</Td>
            <Td num className="text-pos">{r.kind === "income" ? rp(r.amount) : ""}</Td>
            <Td num>{r.kind === "expense" ? rp(r.amount) : ""}</Td>
          </tr>
        ))}
        <TotalRow>
          <Td colSpan={3}>Total ({rows.length} transaksi)</Td>
          <Td num className="text-pos">{rp(income)}</Td>
          <Td num>{rp(expense)}</Td>
        </TotalRow>
      </tbody>
    </Table>
  );
}
