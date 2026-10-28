import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jatahin!",
    short_name: "Jatahin!",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#f4f6fa",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
