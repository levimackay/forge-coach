"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks an element's rendered width so SVG text stays at its real size instead of scaling with a viewBox.
 * Null until the first measurement, so callers can draw a scaled placeholder rather than overflow.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
