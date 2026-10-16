import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist, type PrecacheEntry, type RuntimeCaching } from "serwist";

// Injected by `serwist build`; the page lib types are DOM, so the worker scope is declared locally.
declare const self: { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined };

const SUPABASE_HOST = /\.supabase\.(co|in)$/;

// Data, auth and the MCP endpoint must always hit the network: a cached copy
// of any of them would be stale, and a cached OAuth response would be wrong.
const networkOnly: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      !sameOrigin
        ? SUPABASE_HOST.test(url.hostname)
        : url.pathname.startsWith("/api/") ||
          url.pathname.startsWith("/.well-known/") ||
          url.pathname.startsWith("/oauth/"),
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Strip every query parameter except Next's RSC marker, so /workout?id=... finds the
  // precached /workout shell offline while RSC payload requests still go to the network.
  precacheOptions: { ignoreURLParametersMatching: [/^(?!_rsc$)/], cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [...networkOnly, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
