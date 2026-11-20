"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { X } from "lucide-react";
import { pickUpdate, RELEASES_API, type Update } from "@/lib/app-update";
import { Button, Progress } from "@/components/ui";
import { Updater, errorCode } from "./plugins";

type State =
  | { at: "none" }
  | { at: "offer"; u: Update }
  | { at: "download"; u: Update; done: number }
  | { at: "permission"; u: Update }
  | { at: "installer"; u: Update }
  | { at: "failed"; u: Update; message: string };

/** Checked once per launch of the app (a page load); "Nanti" also lasts until the next launch. */
let check: Promise<Update | null> | null = null;
let dismissed = false;

async function findUpdate(): Promise<Update | null> {
  const [{ version }, res] = await Promise.all([App.getInfo(), fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" })]);
  return res.ok ? pickUpdate(await res.json(), version) : null;
}

/**
 * Android app only: asks this repository's latest GitHub release for a newer version and offers it. "Perbarui" downloads
 * it in the app and opens Android's installer, where the user confirms.
 */
export function AppUpdate() {
  const [s, setS] = useState<State>({ at: "none" });

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || dismissed) return;
    let live = true;
    (check ??= findUpdate().catch(() => null)).then((u) => {
      if (live && u && !dismissed) setS({ at: "offer", u });
    });
    return () => { live = false; };
  }, []);

  if (s.at === "none") return null;
  const { u } = s;

  async function install() {
    if (!(await Updater.canInstall()).allowed) return setS({ at: "permission", u });
    setS({ at: "download", u, done: 0 });
    const sub = await Updater.addListener("progress", (p) => {
      const total = p.total > 0 ? p.total : u.size;
      setS({ at: "download", u, done: total > 0 ? p.received / total : 0 });
    });
    try {
      await Updater.install({ url: u.apkUrl, sha256: u.sha256, shaUrl: u.shaUrl });
      setS({ at: "installer", u });
    } catch (e) {
      if (errorCode(e) === "permission") setS({ at: "permission", u });
      else setS({ at: "failed", u, message: e instanceof Error ? e.message : "Gagal mengunduh update." });
    } finally {
      sub.remove();
    }
  }

  const later = () => {
    dismissed = true;
    setS({ at: "none" });
  };

  const note = u.notes.split("\n").find((l) => l.trim())?.replace(/^[-*#\s]+/, "");

  return (
    <section aria-live="polite" className="mb-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">
            {s.at === "installer" ? "Lanjutkan di layar pemasangan" : s.at === "download" ? `Mengunduh Jatahin ${u.version}…` : "Update tersedia"}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {s.at === "offer" && <>Jatahin {u.version}{note ? ` · ${note}` : ""}</>}
            {s.at === "download" && `${Math.round(s.done * 100)}%`}
            {s.at === "permission" && "Izinkan Jatahin memasang aplikasi, lalu kembali ke sini dan tap Perbarui lagi."}
            {s.at === "installer" && "Tap Update di layar Android. Catatanmu tetap aman di akun."}
            {s.at === "failed" && s.message}
          </p>
        </div>
        {(s.at === "offer" || s.at === "failed" || s.at === "installer") && (
          <button type="button" onClick={later} aria-label="Tutup" className="-mt-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised">
            <X className="size-4" />
          </button>
        )}
      </div>
      {s.at === "download" && <Progress value={s.done} hue label="Unduhan update" className="mt-3" />}
      {(s.at === "offer" || s.at === "failed") && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={install}>{s.at === "failed" ? "Coba lagi" : "Perbarui"}</Button>
          <Button size="sm" variant="ghost" onClick={later}>Nanti</Button>
        </div>
      )}
      {s.at === "permission" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => Updater.openInstallSettings()}>Buka pengaturan</Button>
          <Button size="sm" onClick={install}>Perbarui</Button>
        </div>
      )}
    </section>
  );
}
