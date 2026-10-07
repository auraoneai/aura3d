/**
 * PRD-15 T4.5 — `renderer-mode` codemod fixture tests (C-39).
 *
 * Fixtures are verbatim copies of real 15-owned consumers:
 *   before/createAuraApp-postprocess-contract-harness.ts  ← tests/browser/…
 *   before/createAuraApp-production-bridge-harness.ts     ← tests/browser/…
 * The `after/` copies are the expected output: `mode`/`fallback` removed from
 * `renderer:` option objects while diagnostic `renderer:` payloads on
 * `window.__AURA3D_*` globals stay untouched.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRendererModeCodemod } from "../../../packages/aura3d-cli/src/codemods/renderer-mode";

const codemod = createRendererModeCodemod();

const CASES: ReadonlyArray<{ readonly before: string; readonly after: string; readonly name: string }> = [
  {
    name: "postprocess-contract-harness",
    before: "tests/qr/prd15/fixtures/renderer-mode/before/createAuraApp-postprocess-contract-harness.ts",
    after: "tests/qr/prd15/fixtures/renderer-mode/after/createAuraApp-postprocess-contract-harness.ts"
  },
  {
    name: "production-bridge-harness",
    before: "tests/qr/prd15/fixtures/renderer-mode/before/createAuraApp-production-bridge-harness.ts",
    after: "tests/qr/prd15/fixtures/renderer-mode/after/createAuraApp-production-bridge-harness.ts"
  }
];

describe("renderer-mode codemod (PRD-15 T4.5)", () => {
  it("is registered on C-39 alongside `renderer-imports`", async () => {
    const { codemodFor } = await import("../../../packages/aura3d-cli/src/contracts/commands");
    await import("../../../packages/aura3d-cli/src/commands/prd15/index");
    expect(codemodFor("renderer-mode")?.name).toBe("renderer-mode");
    expect(codemodFor("renderer-imports")?.name).toBe("renderer-imports");
  });

  for (const c of CASES) {
    it(`rewrites ${c.name} to the approved fixture`, () => {
      const before = readFileSync(c.before, "utf8");
      const after = readFileSync(c.after, "utf8");
      const { code } = codemod.transform(before, c.before);
      expect(code).toBe(after);
    });
  }

  it("removes mode/fallback from renderer options and drops an emptied object", () => {
    const src = [
      'createAuraApp(el, { scene, renderer: { mode: "safe-basic", fallback: "safe-basic" } });',
      'createGameApp(el, { scene, renderer: { mode: "production", textureBudgetBytes: 1 } });',
      'const report = { renderer: { mode: "production", backend: "webgl2" } };'
    ].join("\n");
    const { code, rows } = codemod.transform(src, "sample.ts");
    expect(code).toContain("{ scene }");
    expect(code).toContain("{ scene, renderer: {  textureBudgetBytes: 1 } }");
    // Diagnostics payloads are not options — untouched.
    expect(code).toContain('report = { renderer: { mode: "production", backend: "webgl2" } }');
    expect(rows.filter((r) => r.mapping === "exact")).toHaveLength(4);
  });

  it("reports AuraRendererMode type references without rewriting them", () => {
    const src = 'const m: AuraRendererMode = "production"; const f: AuraRendererFallbackMode = "safe-basic";';
    const { code, rows } = codemod.transform(src, "types.ts");
    expect(code).toBe(src);
    expect(rows.filter((r) => r.mapping === "none")).toHaveLength(2);
  });
});
