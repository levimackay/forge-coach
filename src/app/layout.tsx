import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

// Portrait launch images, produced by scripts/generate-icons.mjs: [css width, css height, pixel ratio].
const LAUNCH_SCREENS: [number, number, number][] = [
  [440, 956, 3],
  [420, 912, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
];

export const metadata: Metadata = {
  title: { default: "FORGE", template: "%s | FORGE" },
  description: "A training log that works offline and adjusts your next workout from what you actually lifted.",
  applicationName: "FORGE",
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    title: "FORGE",
    statusBarStyle: "black",
    startupImage: LAUNCH_SCREENS.map(([w, h, ratio]) => ({
      url: `/splash/splash-${w * ratio}x${h * ratio}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* The only typeface, so it is requested with the document rather than when the CSS is parsed. */}
        <link
          rel="preload"
          href="/fonts/SofiaSansSemiCondensed-wght.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
