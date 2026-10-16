import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The d2 Spec rules that a source file can break. By default the check covers the foundation
// (primitives, shell, sign-in, consent, offline, dev, tokens). FORGE_SPEC_SCOPE=all widens it to every screen
// and component under src/app and src/components.
const ROOT = path.resolve(__dirname, "../../..");
const FOUNDATION = [
  "src/components/ui",
  "src/components/shell",
  "src/app/login",
  "src/app/oauth",
  "src/app/~offline",
  "src/app/dev",
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/app/manifest.ts",
];

function files(entry: string): string[] {
  const full = path.join(ROOT, entry);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(path.join(entry, name)));
}

const entries = process.env.FORGE_SPEC_SCOPE === "all" ? ["src/app", "src/components"] : FOUNDATION;
const sources = entries
  .flatMap(files)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes("database.types"))
  .map((f) => ({ file: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

// Optional third item limits a rule to files it matches, for rules about class names that the token file mentions on purpose.
const RULES: [string, RegExp, RegExp?][] = [
  ["a radius", /\brounded(-|\b)/],
  ["a shadow", /\b(drop-)?shadow(-|\b)/, /\.tsx?$/],
  ["a gradient", /gradient/],
  ["an old token", /\b(bg|text|border|outline|ring|fill|stroke)-(surface|raised|line|ember|danger|ok|ink-dim|ink-faint|on-ember)\b/],
  ["a weight heavier than 500", /\bfont-(semibold|bold|extrabold|black)\b/],
  ["uppercase text", /\b(uppercase|capitalize)\b/],
  ["a faded tone", /\b(opacity-\d+|animate-pulse)\b|\b(bg|text|border)-[a-z-]+\/\d+/],
  ["an em or en dash", /[–—]/],
  ["a colour outside the palette", /#(?!000000\b|000\b|f5f5f7\b|86868b\b|424245\b|d5001c\b)[0-9a-fA-F]{6}\b/],
];

describe("d2 Spec rules", () => {
  for (const [name, pattern, only] of RULES) {
    it(`no source uses ${name}`, () => {
      const hits = sources
        .filter(({ file, text }) => (only ? only.test(file) : true) && pattern.test(text))
        .map(({ file }) => file);
      expect(hits).toEqual([]);
    });
  }
});
