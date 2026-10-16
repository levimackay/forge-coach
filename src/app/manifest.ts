import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FORGE",
    short_name: "FORGE",
    description: "A training log that works offline and adjusts your next workout from what you actually lifted.",
    id: "/",
    start_url: "/",
    scope: "/",
    // standalone, never minimal-ui: iOS drops storage for minimal-ui apps after a week.
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
