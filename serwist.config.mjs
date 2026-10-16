import { serwist } from "@serwist/next/config";

// Runs after `next build` (see the build script). Precaches the hashed static
// assets and every prerendered route so the app shell opens with no network.
export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  globIgnores: [
    // iOS fetches launch images itself at startup; caching them would only bloat the install.
    "public/splash/**",
    // /dev answers 404 in production, and one non-2xx precache response fails the whole install.
    ".next/server/app/dev.html",
    // OAuth consent stays NetworkOnly like the rest of /oauth/*.
    ".next/server/app/oauth/**",
  ],
});
