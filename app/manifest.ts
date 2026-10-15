import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "xprtn",
    short_name: "xprtn",
    description: "Workplace learning, practice, and support",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F9FC",
    theme_color: "#0F2347",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
