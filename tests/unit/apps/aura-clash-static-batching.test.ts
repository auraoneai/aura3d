import { describe, expect, it } from "vitest";
import { createSideViewGameRenderPreset } from "@aura3d/engine/production-runtime";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * FS-104 groundwork: renderer-owned static batching on the Aura Clash arena source.
 *
 * The arena architecture is static, unskinned, and reuses geometry/material pairs across many nodes,
 * which is exactly what `batchStaticRenderItems` collapses. Measured on the mounted route, enabling it
 * took the baseline from **91 to 68 draw calls at 60 FPS** with a byte-comparable frame, widening
 * headroom under the route's own 160-draw contract from 69 to 92.
 *
 * The current textured arena is the live asset rather than a separate combined-scene façade. Its
 * 81 primitives leave enough room for both skinned fighters and effects inside the unchanged
 * 160-draw contract, while static batching still protects the authored set dressing.
 */
describe("Aura Clash arena enables renderer-owned static batching", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts"),
    "utf8"
  );

  it("requests static batching on the render source", () => {
    expect(source).toContain("staticBatching: true");
  });

  it("keeps the route's own draw-call budget contract unchanged", () => {
    /*
     * The ceiling is asserted against the render preset rather than grepped out of the route source.
     *
     * Defect 62 moved the thresholds into `createSideViewGameRenderPreset().performanceBudget`, because
     * the preset enabled shadows, bloom, fog and particles while declaring no cost, leaving the numbers
     * duplicated as literals in the route and in `performance-budget.spec.ts`. This test previously
     * searched the route text for `drawCalls <= 160`; asserting the budget value directly is both
     * stronger and immune to how the comparison is spelled.
     *
     * Batching is a real cost reduction; raising this ceiling to admit a heavier asset would not be.
     */
    expect(createSideViewGameRenderPreset().performanceBudget.maxDrawCalls).toBe(160);
    // The route must evaluate against the shared budget rather than re-typing a literal.
    expect(source).toContain("SIDE_VIEW_PERFORMANCE_BUDGET");
    expect(source).toContain("budget.maxDrawCalls");
  });

  it("keeps the backdrop excluded from camera auto-framing", () => {
    // A large typed stage that opts into auto-frame drags the frame volume out to the architecture's
    // bounds and pushes the fighters off-screen, so this must survive any arena swap.
    expect(source).toContain("includeInAutoFrame: false");
  });
});

/**
 * The current textured arena's batching floor is determined by its geometry.
 *
 * It has 81 mesh primitives with 81 distinct attribute sets. Renderer static batching groups by
 * geometry/material pairs, so the current GLB has an 81-primitive geometry floor even though its
 * texture-backed material set is a compact 19 definitions. This test pins the release asset rather
 * than retaining a performance contract for the retired prototype duel-stage GLB.
 */
describe("live textured arena geometry floor", () => {
  const glbPath = "apps/aura-clash-showcase/public/aura-assets/arenaNeonDowntownTextured.312f2320.glb";

  it("has far fewer distinct material definitions than slots, yet unique geometry per primitive", () => {
    const buffer = readFileSync(resolve(process.cwd(), glbPath));
    const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString("utf8")) as {
      readonly materials?: readonly Record<string, unknown>[];
      readonly meshes?: readonly { readonly primitives?: readonly { readonly attributes?: unknown }[] }[];
    };

    const materials = json.materials ?? [];
    const withoutName = (material: Record<string, unknown>): string => {
      const copy = { ...material };
      delete copy.name;
      return JSON.stringify(copy);
    };
    expect(materials.length).toBe(19);
    expect(new Set(materials.map(withoutName)).size).toBe(19);

    // ...but every primitive owns unique geometry, which is the actual batching floor.
    const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
    const attributeSets = new Set(primitives.map((primitive) => JSON.stringify(primitive.attributes)));
    expect(primitives.length).toBe(81);
    expect(attributeSets.size).toBe(primitives.length);
  });
});
