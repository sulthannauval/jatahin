"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteCategory, saveCategory, setCategoryArchived } from "@/app/actions";
import { Dialog, ErrorText, useFormAction } from "@/components/form-kit";
import { useTx } from "@/components/tx-context";
import { Badge, Button, Card, Input, Label, PanelHeader, Select } from "@/components/ui";
import { EXPENSE_GROUPS, INCOME_GROUPS } from "@/lib/finance";
import { cn } from "@/lib/cn";

type Cat = { id: number; name: string; kind: "income" | "expense"; group: string; archived: boolean; used: number };

const iconBtn = "grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised hover:text-ink";

/** Expense and income categories, each in its own card: add, rename, hide, and delete while unused. */
export function CategoryManager({ categories }: { categories: Cat[] }) {
  const [editing, setEditing] = useState<Partial<Cat> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { toast } = useTx();
  const [, start] = useTransition();
  const close = () => setEditing(null);
  const [state, action, pending] = useFormAction(saveCategory, close);
  const archivedCount = categories.filter((c) => c.archived).length;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {(["expense", "income"] as const).map((kind) => {
          const list = categories.filter((c) => c.kind === kind && (showArchived || !c.archived));
          return (
            <Card key={kind} className="self-start overflow-hidden">
              <PanelHeader
                title={kind === "expense" ? "Pengeluaran" : "Pemasukan"}
                note={String(list.filter((c) => !c.archived).length)}
                more={
                  <button onClick={() => setEditing({ kind, group: kind === "expense" ? "Wajib" : "Rutin" })} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-field px-3 text-[13px] text-ink-2 transition-colors hover:bg-active hover:text-ink">
                    <Plus className="size-3.5" strokeWidth={2} /> Tambah
                  </button>
                }
              />
              <ul className="divide-y divide-rule">
                {list.map((c) => (
                  <li key={c.id} className={cn("flex min-h-12 items-center gap-2 py-1.5 pr-3 pl-4 sm:pl-5", c.archived && "opacity-50")}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-5">{c.name}</span>
                      <span className="num block text-xs leading-4 text-muted">{c.used ? `${c.used} transaksi` : "Belum dipakai"}</span>
                    </span>
                    <Badge>{c.group}</Badge>
                    <button onClick={() => setEditing(c)} className={iconBtn} aria-label={`Ubah ${c.name}`}><Pencil className="size-3.5" /></button>
                    <button
                      onClick={() => start(async () => { const r = await setCategoryArchived(c.id, !c.archived); toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error"); })}
                      className={iconBtn}
                      aria-label={c.archived ? `Tampilkan lagi ${c.name}` : `Sembunyikan ${c.name}`}
                      title={c.archived ? "Tampilkan lagi" : "Sembunyikan (riwayat tetap aman)"}
                    >
                      {c.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="mt-3 h-8 cursor-pointer rounded-full px-1 text-[13px] text-muted hover:text-ink">
          {showArchived ? "Sembunyikan" : "Tampilkan"} {archivedCount} kategori tersembunyi
        </button>
      )}

      <Dialog open={!!editing} onClose={close} title={editing?.id ? "Ubah kategori" : "Kategori baru"}>
        {editing && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={editing.id ?? ""} />
            <input type="hidden" name="kind" value={editing.kind} />
            <div><Label htmlFor="cat-name">Nama</Label><Input id="cat-name" name="name" defaultValue={editing.name} required autoFocus maxLength={60} /></div>
            <div>
              <Label htmlFor="cat-group">Tipe</Label>
              <Select id="cat-group" name="group" defaultValue={editing.group}>
                {(editing.kind === "expense" ? EXPENSE_GROUPS : INCOME_GROUPS).map((g) => <option key={g}>{g}</option>)}
              </Select>
              <p className="mt-1.5 text-xs text-muted">Dipakai untuk mengelompokkan di Jatah dan Laporan.</p>
            </div>
            <ErrorText state={state} />
            <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Simpan</Button>
            {editing.id && <DeleteZone cat={editing as Cat} onDone={close} />}
          </form>
        )}
      </Dialog>
    </>
  );
}

/** Delete for good, only for a category no transaction uses. Two taps: the first asks, the second deletes. */
function DeleteZone({ cat, onDone }: { cat: Cat; onDone: () => void }) {
  const { toast } = useTx();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (cat.used > 0) {
    return <p className="border-t border-rule pt-4 text-center text-xs leading-5 text-muted">Dipakai di {cat.used} transaksi, jadi hanya bisa disembunyikan.</p>;
  }
  const remove = () => start(async () => {
    const r = await deleteCategory(cat.id);
    toast(r.ok ? r.message ?? "" : r.error, r.ok ? "ok" : "error");
    if (r.ok) onDone();
  });
  return (
    <div className="border-t border-rule pt-4">
      {asking ? (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setAsking(false)}>Batal</Button>
          <Button type="button" variant="danger" className="flex-1 bg-[var(--pill-neg-bg)]" disabled={pending} onClick={remove}>
            {pending && <Loader2 className="size-4 animate-spin" />} Hapus {cat.name}
          </Button>
        </div>
      ) : (
        <Button type="button" variant="danger" className="w-full" onClick={() => setAsking(true)}>
          <Trash2 className="size-4" strokeWidth={1.75} /> Hapus kategori
        </Button>
      )}
      <p className="mt-1.5 text-center text-xs leading-5 text-muted">Belum dipakai di transaksi mana pun. Jatahnya ikut terhapus.</p>
    </div>
  );
}
