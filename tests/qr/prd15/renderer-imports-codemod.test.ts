/**
 * PRD-15 T2.11 — `renderer-imports` codemod fixture tests.
 *
 * Fixtures are verbatim copies of real consumers:
 *   before/loader-gltf-variants.main.ts  ← apps/loader-gltf-variants/src/main.ts
 *   before/wow-common.showcase.ts        ← apps/wow-common/src/showcase.ts
 * The `after/` copies are the expected codemod output. The wow-common file has
 * no imports from the four deprecated subpaths, so its after-copy is the
 * identity transform — the pair documents the codemod's scope boundary.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRendererImportsCodemod } from "../../../packages/aura3d-cli/src/codemods/renderer-imports";

const codemod = createRendererImportsCodemod();

const CASES: ReadonlyArray<{ readonly before: string; readonly after: string; readonly name: string }> = [
  {
    name: "loader-gltf-variants",
    before: "tests/qr/prd15/fixtures/renderer-imports/before/loader-gltf-variants.main.ts",
    after: "tests/qr/prd15/fixtures/renderer-imports/after/loader-gltf-variants.main.ts"
  },
  {
    name: "wow-common-showcase",
    before: "tests/qr/prd15/fixtures/renderer-imports/before/wow-common.showcase.ts",
    after: "tests/qr/prd15/fixtures/renderer-imports/after/wow-common.showcase.ts"
  }
];

describe("renderer-imports codemod (PRD-15 T2.11)", () => {
  it("is registered on C-39 alongside the `codemod` CLI command", async () => {
    const { codemodFor, cliCommandFor } = await import("../../../packages/aura3d-cli/src/contracts/commands");
    await import("../../../packages/aura3d-cli/src/commands/prd15/index");
    expect(codemodFor("renderer-imports")?.name).toBe("renderer-imports");
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

  it("rewrites the subpath, renames A3DRenderer, and maps renderFrame to a3dRenderFrame", () => {
    const src = [
      'import { A3DRenderer, type A3DRendererOptions } from "@aura3d/engine/advanced-runtime";',
      'import { createProductViewer } from "@aura3d/engine/production-runtime";',
      "const r = await A3DRenderer.create({} as A3DRendererOptions);",
      "const out = r.renderFrame({ source, camera });",
      "const proof = r.captureProof({ source });",
      "const feats = r.getFeatures();",
      "const sh = r.getShadowEvidence();"
    ].join("\n");
    const { code, rows } = codemod.transform(src, "sample.ts");
    expect(code).toContain('from "@aura3d/engine/renderer"');
    expect(code).not.toContain("@aura3d/engine/advanced-runtime");
    expect(code).toContain("a3dRenderFrame(r, { source, camera })");
    expect(code).toContain("rendererProofCapture(r, { source })");
    expect(code).toContain("rendererFeatureReport(r)");
    expect(code).toContain("rendererShadowReport(r)");
    expect(code).toContain("Renderer.create({} as RendererOptions)");
    // production-runtime names not on ./renderer stay on the deprecated subpath
    expect(code).toContain('import { createProductViewer } from "@aura3d/engine/production-runtime";');
    expect(rows.some((r) => r.construct === "A3DRenderer" && r.mapping === "exact")).toBe(true);
    expect(rows.some((r) => r.mapping === "none" && r.construct.includes("createProductViewer"))).toBe(true);
  });

  it("does not rewrite zero-arg viewer.renderFrame() (non-renderer receiver guard)", () => {
    const src = [
      'import { createCurrentRoutesFlagshipViewer } from "@aura3d/engine/threejs-example-parity";',
      "const snap = await viewer.renderFrame();"
    ].join("\n");
    const { code, rows } = codemod.transform(src, "viewer.ts");
    expect(code).toContain("viewer.renderFrame()");
    expect(rows.filter((r) => r.mapping === "approximate")).toHaveLength(0);
  });
});
