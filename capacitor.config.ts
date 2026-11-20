import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app: a shell around the live web app, plus native NFC for Cek E-Money and the in-app updater.
 * Pages come from production, so web changes reach the phone without a new APK. capacitor-www holds only
 * the page shown when production can't be reached.
 */
const config: CapacitorConfig = {
  appId: "app.jatahin",
  appName: "Jatahin!",
  webDir: "capacitor-www",
  backgroundColor: "#f7f8f8",
  server: {
    url: "https://jatahin-app.vercel.app",
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
};

export default config;
