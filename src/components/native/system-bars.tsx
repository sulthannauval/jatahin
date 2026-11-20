"use client";

import { useEffect } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { useTheme } from "@/components/theme-toggle";

/** In the Android app, the status and navigation bar icons follow Jatahin's theme rather than the phone's. */
export function NativeSystemBars() {
  const theme = useTheme();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }, [theme]);
  return null;
}
