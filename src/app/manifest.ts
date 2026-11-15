import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jatahin!",
    short_name: "Jatahin!",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f8",
    theme_color: "#f7f8f8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Full-bleed, so a launcher's own shape never cuts the coin.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Shown when the installed app's icon is held down. File names start with "icon" so the proxy serves them signed out.
    shortcuts: [
      { name: "Catat pengeluaran", short_name: "Pengeluaran", url: "/?catat=pengeluaran", icons: [{ src: "/icon-catat-pengeluaran.png", sizes: "192x192", type: "image/png" }] },
      { name: "Catat pemasukan", short_name: "Pemasukan", url: "/?catat=pemasukan", icons: [{ src: "/icon-catat-pemasukan.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
