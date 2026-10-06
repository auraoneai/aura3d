/**
 * PRD-15 T4.7 — `lean-imports` codemod fixture tests.
 *
 * Fixtures are verbatim copies of the lane-13 templates:
 *   before/product-viewer.main.ts  ← templates/product-viewer/src/main.ts
 *   before/mini-game.main.ts       ← templates/mini-game/src/main.ts
 *   before/mini-game.aura-assets.ts← templates/mini-game/src/aura-assets.ts
 * The `after/` copies are the expected codemod output: every specifier lands on
 * `@aura3d/engine`, and the two lean-only type names arrive as
 * `type X as X_lean` aliases so local references keep compiling.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLeanImportsCodemod } from "../../../packages/aura3d-cli/src/codemods/lean-imports";

const codemod = createLeanImportsCodemod();

const CASES: ReadonlyArray<{ readonly before: string; readonly after: string; readonly name: string }> = [
  {
    name: "product-viewer",
    before: "tests/qr/prd15/fixtures/lean-imports/before/product-viewer.main.ts",
    after: "tests/qr/prd15/fixtures/lean-imports/after/product-viewer.main.ts"
  },
  {
    name: "mini-game",
    before: "tests/qr/prd15/fixtures/lean-imports/before/mini-game.main.ts",
    after: "tests/qr/prd15/fixtures/lean-imports/after/mini-game.main.ts"
  },
  {
    name: "mini-game-aura-assets",
    before: "tests/qr/prd15/fixtures/lean-imports/before/mini-game.aura-assets.ts",
    after: "tests/qr/prd15/fixtures/lean-imports/after/mini-game.aura-assets.ts"
  }
];

describe("lean-imports codemod (PRD-15 T4.7)", () => {
  it("is registered on C-39 alongside the `codemod` CLI command", async () => {
    const { codemodFor, cliCommandFor } = await import("../../../packages/aura3d-cli/src/contracts/commands");
    await import("../../../packages/aura3d-cli/src/commands/prd15/index");
    expect(codemodFor("lean-imports")?.name).toBe("lean-imports");
    expect(cliCommandFor("codemod")?.owner).toBe("prd15");
  });

  for (const c of CASES) {
    it(`rewrites ${c.name} to the approved fixture`, () => {
      const before = readFileSync(c.before, "utf8");
      const after = readFileSync(c.after, "utf8");
      const { code } = codemod.transform(before, c.before);
      expect(code).toBe(after);
    });
  }

  it("rewrites all three lean specifiers, and reports exact vs renamed bindings", () => {
    const src = [
      'import { createAuraApp, scene, type AuraLeanNodeBuilder } from "@aura3d/lean";',
      'import { game, defineAuraAssets, LeanGameInputOptions } from "@aura3d/lean/game";',
      'import { environments, interactions } from "@aura3d/lean/product";'
    ].join("\n");
    const { code, rows } = codemod.transform(src, "sample.ts");
    expect(code).not.toContain("@aura3d/lean");
    expect(code.match(/from "@aura3d\/engine"/g)?.length).toBe(3);
    expect(code).toContain("type AuraNodeBuilder as AuraLeanNodeBuilder");
    expect(code).toContain("GameInputOptions as LeanGameInputOptions");
    expect(rows.filter((r) => r.mapping === "exact").length).toBe(6);
    expect(rows.filter((r) => r.mapping === "approximate").length).toBe(2);
    expect(rows.every((r) => r.target?.startsWith("@aura3d/engine"))).toBe(true);
  });

  it("reports lean-only APIs as mapping:none and leaves them for manual migration", () => {
    const src = [
      'import { createAuraAppWithRenderer, type AuraLeanApp, createLeanPlatformer, type SdfTextLayout } from "@aura3d/lean/game";'
    ].join("\n");
    const { code, rows } = codemod.transform(src, "sample.ts");
    // Module specifier still migrates — the report rows force a human decision.
    expect(code).toContain('from "@aura3d/engine"');
    expect(rows.every((r) => r.mapping === "none")).toBe(true);
    expect(rows.map((r) => r.construct).join(" ")).toContain("createAuraAppWithRenderer");
    expect(rows.map((r) => r.construct).join(" ")).toContain("createLeanPlatformer");
    expect(rows.map((r) => r.construct).join(" ")).toContain("SdfTextLayout");
  });

  it("reports namespace and bare side-effect imports without rewriting them", () => {
    const src = [
      'import * as lean from "@aura3d/lean";',
      'import "@aura3d/lean/game";'
    ].join("\n");
    const { code, rows } = codemod.transform(src, "sample.ts");
    // Namespace specifier rewrites (the module itself), but the construct is flagged.
    expect(rows.filter((r) => r.mapping === "none").length).toBe(2);
    expect(code).toContain('import * as lean from "@aura3d/engine"');
    // Bare side-effect import stays on lean — its only effect IS the deprecation warn.
    expect(code).toContain('import "@aura3d/lean/game";');
  });
});
