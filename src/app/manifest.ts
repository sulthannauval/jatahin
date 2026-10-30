import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jatahin!",
    short_name: "Jatahin!",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f8",
    theme_color: "#f7f8f8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    // Shown when the installed app's icon is held down. File names start with "icon" so the proxy serves them signed out.
    shortcuts: [
      { name: "Catat pengeluaran", short_name: "Pengeluaran", url: "/?catat=pengeluaran", icons: [{ src: "/icon-catat-pengeluaran.png", sizes: "192x192", type: "image/png" }] },
      { name: "Catat pemasukan", short_name: "Pemasukan", url: "/?catat=pemasukan", icons: [{ src: "/icon-catat-pemasukan.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
