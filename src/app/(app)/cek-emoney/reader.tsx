"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { Check, ChevronLeft, ChevronRight, Copy, SmartphoneNfc } from "lucide-react";
import { historyRows, maskCardId, type CardRead } from "@/lib/emoney";
import { RELEASES_PAGE } from "@/lib/app-update";
import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Button, Card, buttonClass } from "@/components/ui";
import { EMoney, errorCode, useNativeApp, type NfcState } from "@/components/native/plugins";

const CARDS = "TapCash · e-money · Flazz · Brizzi";
/** Card history rows per page. */
const PAGE = 7;

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const whenLabel = (d: Date) => when.format(d).replace(" pukul", ",");

export function EMoneyReader() {
  const native = useNativeApp();
  if (!native) {
    return (
      <Card className="p-5">
        <p className="text-[15px] font-medium">Hanya di aplikasi Android</p>
        <p className="mt-1 text-sm text-muted">Membaca kartu butuh NFC, yang tidak bisa dipakai dari browser. Pasang Jatahin untuk Android, lalu buka halaman ini dari sana.</p>
        <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className={cn(buttonClass("secondary", "sm"), "mt-4")}>Unduh untuk Android</a>
      </Card>
    );
  }
  return <Reader />;
}

function Reader() {
  const [nfc, setNfc] = useState<NfcState | null>(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<CardRead | null>(null);

  // Read cards while this page is open; check NFC again on returning from the phone's settings.
  useEffect(() => {
    let live = true;
    const subs: Promise<PluginListenerHandle>[] = [
      EMoney.addListener("reading", () => setReading(true)),
      EMoney.addListener("card", (r) => { setReading(false); setRead(r); }),
    ];
    const begin = () =>
      EMoney.start().then(
        () => live && setNfc("on"),
        (e) => live && setNfc(errorCode(e) === "none" ? "none" : "off"),
      );
    begin();
    const resume = App.addListener("resume", begin);
    return () => {
      live = false;
      EMoney.stop().catch(() => {});
      subs.forEach((s) => s.then((h) => h.remove()));
      resume.then((h) => h.remove());
    };
  }, []);

  if (nfc === "none") {
    return (
      <Card className="p-5">
        <p className="text-[15px] font-medium">HP ini tidak punya NFC</p>
        <p className="mt-1 text-sm text-muted">Cek E-Money butuh NFC untuk membaca kartu.</p>
      </Card>
    );
  }
  if (nfc === "off") {
    return (
      <Card className="p-5">
        <p className="text-[15px] font-medium">NFC sedang mati</p>
        <p className="mt-1 text-sm text-muted">Nyalakan NFC, lalu kembali ke sini.</p>
        <Button size="sm" className="mt-4" onClick={() => EMoney.openSettings()}>Buka pengaturan NFC</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {read?.card ? <Result read={read} /> : <Prompt reading={reading} read={read} />}
      {read?.card && (
        <p className={cn("text-center text-sm text-muted", reading && "text-ink")}>{reading ? "Membaca kartu…" : "Tempel kartu lagi untuk membaca ulang."}</p>
      )}
      {read && <RawData read={read} />}
    </div>
  );
}

/** Waiting for a card, reading one, or a card that could not be read. */
function Prompt({ reading, read }: { reading: boolean; read: CardRead | null }) {
  const failed = !reading && read && !read.card;
  return (
    <Card className="flex flex-col items-center px-5 py-10 text-center">
      <div className="relative grid size-24 place-items-center">
        {!failed && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30 [animation-duration:1.8s] motion-reduce:hidden" />}
        <span className={cn("relative grid size-16 place-items-center rounded-full", failed ? "bg-raised text-muted" : "bg-brand text-on-brand")}>
          <SmartphoneNfc className="size-7" strokeWidth={1.75} />
        </span>
      </div>
      <p className="mt-5 text-[17px] font-medium">{reading ? "Membaca kartu…" : failed ? "Kartu tidak terbaca" : "Tempelkan kartu"}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">
        {reading
          ? "Tahan kartu sampai selesai."
          : failed
            ? read.error
              ? "Kartu terlepas sebelum selesai dibaca. Tempel lagi dan tahan sebentar."
              : "Jenis kartu ini belum dikenali. Tempel lagi, atau kirim Data mentah di bawah supaya bisa ditambahkan."
            : "Tempel kartu e-money di belakang HP, dekat kamera, dan tahan sampai bergetar."}
      </p>
      <p className="mt-4 text-xs text-muted">{CARDS}</p>
    </Card>
  );
}

function Result({ read }: { read: CardRead }) {
  const card = read.card!;
  const rows = historyRows(card.history, card.readable ? card.balance : undefined);
  // A new tap starts again at the first page.
  const [paged, setPaged] = useState({ read, page: 0 });
  const pages = Math.ceil(rows.length / PAGE);
  const page = paged.read === read ? Math.min(paged.page, Math.max(pages - 1, 0)) : 0;
  const go = (p: number) => setPaged({ read, page: p });
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const idr = card.currency === "IDR";
  const money = (n: number) => (idr ? rp(n) : `${n.toLocaleString("id-ID")} ${card.currency}`);
  return (
    <>
      <Card className="p-5">
        <p className="text-sm text-muted">
          {card.name}
          {card.id && <span className="tabular-nums"> · {maskCardId(card.id)}</span>}
        </p>
        {card.readable && card.balance !== undefined ? (
          <p className="mt-1 text-[32px] leading-10 font-medium tracking-[-0.02em] tabular-nums">{money(card.balance)}</p>
        ) : (
          <p className="mt-1 text-[17px] font-medium">Saldo tidak terbaca</p>
        )}
      </Card>
      <Card>
        <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
          <h2 className="text-base font-medium">Riwayat di kartu</h2>
          {rows.length > 0 && <p className="text-xs text-muted tabular-nums">{rows.length} transaksi</p>}
        </div>
        {rows.length === 0 ? (
          <p className="px-5 pt-1 pb-5 text-sm text-muted">Kartu ini tidak menyimpan riwayat yang bisa dibaca.</p>
        ) : (
          <>
            <ul className="mt-2 px-5 pb-2">
              {shown.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 border-t border-rule py-3 first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-[15px]">{r.topUp ? "Isi ulang" : "Pembayaran"}</p>
                    <p className="truncate text-xs text-muted">{[r.at ? whenLabel(r.at) : null, r.where].filter(Boolean).join(" · ") || "Tanggal tidak terbaca"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-[15px] tabular-nums", r.topUp && "text-pos")}>
                      {r.topUp ? "+" : "−"}
                      {money(r.amount)}
                    </p>
                    {r.after !== undefined && <p className="text-xs text-muted tabular-nums">sisa {money(r.after)}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-rule px-2 py-1.5">
                <button type="button" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Halaman sebelumnya" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-raised disabled:pointer-events-none disabled:opacity-30">
                  <ChevronLeft className="size-5" strokeWidth={1.5} />
                </button>
                <p className="text-xs text-muted tabular-nums" aria-live="polite">
                  {page * PAGE + 1}–{page * PAGE + shown.length} dari {rows.length}
                </p>
                <button type="button" onClick={() => go(page + 1)} disabled={page >= pages - 1} aria-label="Halaman berikutnya" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-raised disabled:pointer-events-none disabled:opacity-30">
                  <ChevronRight className="size-5" strokeWidth={1.5} />
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}

/** What the reader saw, to send when a card is read wrongly or not at all. The card's full id is not included. */
function RawData({ read }: { read: CardRead }) {
  const [copied, setCopied] = useState(false);
  const text = rawText(read);
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm text-muted">
        Data mentah
        <span className="text-xs group-open:hidden">Untuk melaporkan kartu yang salah terbaca</span>
      </summary>
      <div className="border-t border-rule px-5 pt-3 pb-4">
        <pre className="max-h-72 overflow-auto rounded-xl bg-field p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all">{text}</pre>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {})}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Tersalin" : "Salin"}
        </Button>
      </div>
    </details>
  );
}

function rawText(read: CardRead): string {
  const c = read.card;
  const lines = [`Tech: ${read.tech?.join(", ") || "-"}`];
  if (read.error) lines.push(`Error: ${read.error}`);
  if (c) {
    lines.push(`Kartu: ${c.name} (${maskCardId(c.id)})`, `Saldo: ${c.balance ?? "tidak terbaca"} ${c.currency}`, `Riwayat: ${c.history.length}`);
    for (const t of c.history) lines.push(`  ${t.date} | ${t.type} | ${t.amount}${t.terminal ? ` | ${t.terminal}` : ""}`);
  }
  // The reader's log can include the card id; keep only its end.
  const id = c?.id.replace(/[^0-9a-f]/gi, "");
  const log = id && id.length > 4 ? (read.log ?? "").replace(new RegExp(id, "gi"), maskCardId(id)) : (read.log ?? "");
  lines.push("", log.trim() || "(log kosong)");
  return lines.join("\n");
}
