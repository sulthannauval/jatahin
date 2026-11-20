"use client";

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import type { CardRead } from "@/lib/emoney";

/** The native side of the Android app (android/app/src/main/java/app/jatahin). In a browser these do nothing. */

export type NfcState = "on" | "off" | "none";

interface EMoneyPlugin {
  status(): Promise<{ nfc: NfcState }>;
  /** Reads every card tapped until stop(); rejects with code "off" or "none" when NFC can't be used. */
  start(): Promise<void>;
  stop(): Promise<void>;
  openSettings(): Promise<void>;
  addListener(event: "reading", fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: "card", fn: (read: CardRead) => void): Promise<PluginListenerHandle>;
}

interface UpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  /** Rejects with code "permission", "checksum", "download", "bad_url" or "no_checksum". */
  install(o: { url: string; sha256?: string; shaUrl?: string }): Promise<void>;
  addListener(event: "progress", fn: (p: { received: number; total: number }) => void): Promise<PluginListenerHandle>;
}

export const EMoney = registerPlugin<EMoneyPlugin>("EMoney");
export const Updater = registerPlugin<UpdaterPlugin>("Updater");

const never = () => () => {};

/** True inside the Android app, false in a browser and while rendering on the server. */
export function useNativeApp(): boolean {
  return useSyncExternalStore(never, () => Capacitor.isNativePlatform(), () => false);
}

/** The code a plugin call rejected with. */
export function errorCode(e: unknown): string | undefined {
  return e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : undefined;
}
