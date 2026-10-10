import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
// @ts-expect-error plain .js config file without declarations
import ruleset from "../../../eslint/qr/no-route-capture-flags.js";

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const linter = new Linter();

const languageOptions = { parser: tsParser, ecmaVersion: 2022, sourceType: "module", globals: { window: "readonly", document: "readonly", URLSearchParams: "readonly" } };

const lint = (code: string, filename: string) =>
  linter.verify(code, [{ languageOptions }, ...ruleset], filename);

describe("eslint/qr/no-route-capture-flags", () => {
  it("warns on apps/showcase-bank-shot/src/legacy/main.ts capture read (unmigrated legacy route)", () => {
    // Bank-shot's main.ts is now a PRD-14 flag dispatcher; the route-local
    // ?capture read moved into src/legacy/main.ts (visualReviewCapture).
    const main = readFileSync(join(repoRoot, "apps/showcase-bank-shot/src/legacy/main.ts"), "utf8");
    const captureLine = main.split("\n").findIndex((l) => l.includes('searchParams.get') || l.includes('.get("capture")')) + 1;
    expect(captureLine).toBeGreaterThan(0);
    const messages = lint(main, "apps/showcase-bank-shot/src/legacy/main.ts");
    const hits = messages.filter((m) => m.line === captureLine);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((m) => m.severity === 1)).toBe(true);
    expect(hits.some((m) => m.message.includes("aura3d/no-route-capture-flags"))).toBe(true);
  });

  it("reports zero on the patched scratch file (no capture reads)", () => {
    const patched = `const url = new URLSearchParams(window.location.search);\nconst seed = url.get("seed");\n`;
    const messages = lint(patched, "apps/showcase-bank-shot/src/main.ts");
    expect(messages).toEqual([]);
  });

  it("flags capture reads in create-aura3d templates and capture-flag identifiers", () => {
    const tpl = `const v = new URLSearchParams(window.location.search).get("capture");\n`;
    const ident = `const visualCaptureCamera = true;\n`;
    expect(lint(tpl, "packages/create-aura3d/templates/game/src/main.ts").some((m) => m.severity === 1)).toBe(true);
    expect(lint(ident, "apps/showcase-x/src/main.ts").some((m) => m.message.includes("aura3d/no-route-capture-flags"))).toBe(true);
  });

  it("errors on @aura3d/game/capture imports outside src/scenarios", () => {
    const bad = `import { captureFromUrl } from "@aura3d/game/capture";\n`;
    const ok = `import { captureFromUrl } from "@aura3d/game/capture";\n`;
    expect(lint(bad, "apps/showcase-x/src/main.ts").some((m) => m.severity === 2)).toBe(true);
    expect(lint(ok, "apps/showcase-x/src/scenarios/pocket.ts")).toEqual([]);
  });
});
