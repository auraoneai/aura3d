// tests/qr/prd14/bank-shot/evidence-strip.test.ts — §14.1 P0: the legacy
// route's `.evidence-strip` debug overlay leaked into captures; it was removed
// from markup and styles, and its `ui.setText` writes with it (`ui.setText`
// throws on missing elements, so a dangling write would crash the frame loop).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const legacyMain = readFileSync(
  fileURLToPath(new URL("../../../../apps/showcase-bank-shot/src/legacy/main.ts", import.meta.url)),
  "utf8"
);
const legacyStyles = readFileSync(
  fileURLToPath(new URL("../../../../apps/showcase-bank-shot/src/legacy/styles.css", import.meta.url)),
  "utf8"
);
const indexHtml = readFileSync(
  fileURLToPath(new URL("../../../../apps/showcase-bank-shot/index.html", import.meta.url)),
  "utf8"
);

describe("bank-shot .evidence-strip removal", () => {
  it("is gone from markup, styles and the legacy boot", () => {
    for (const src of [legacyMain, legacyStyles, indexHtml]) {
      expect(src).not.toContain("evidence-strip");
      expect(src).not.toContain("evidenceStrip");
    }
  });

  it("left no ui.setText writes to strip elements behind", () => {
    const writes = legacyMain.match(/setText\("#evidence[^)]*\)/g) ?? [];
    expect(writes).toHaveLength(0);
    expect(legacyMain).not.toContain("#evidence-strip");
  });
});
