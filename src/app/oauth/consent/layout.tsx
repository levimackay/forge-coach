import type { Metadata } from "next";
import type { ReactNode } from "react";

// The address carries the authorization id, so it must not be indexed or leaked through a referrer.
export const metadata: Metadata = {
  title: "Connect Claude",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConsentLayout({ children }: { children: ReactNode }) {
  return children;
}
