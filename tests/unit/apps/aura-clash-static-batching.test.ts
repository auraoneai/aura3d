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
 * This matters for FS-104 because the typed arena candidates are far heavier than the current façade:
 * measured at 60 FPS but **230** draw calls for `auraClashDuelStage` and **300** for
 * `arenaNeonDowntown` (207 and 300 respectively with batching on). The draw-call contract, not frame
 * time, is what blocks the swap.
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
 * The typed arena swap is blocked by *geometry*, not materials.
 *
 * `auraClashDuelStage` declares 77 material slots that are only 13 distinct definitions once the name
 * field is ignored, so deduplicating materials looked like a route to the swap. Parsing the GLB proved
 * otherwise: its 85 mesh primitives have 85 distinct attribute sets, and renderer static batching
 * groups by (geometry, material) pairs — unique geometry means one draw per primitive regardless of
 * how few materials are shared. Measured with dedup enabled the stage still cost 207 draw calls.
 *
 * This test pins the measurement so the idea is not retried from scratch.
 */
describe("typed arena swap is geometry-bound, not material-bound", () => {
  const glbPath = "apps/aura-clash-showcase/public/aura-assets/auraClashDuelStage.09735d3b.glb";

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
    // Many slots, few real definitions: the duplication is genuine.
    expect(materials.length).toBeGreaterThan(50);
    expect(new Set(materials.map(withoutName)).size).toBeLessThan(20);

    // ...but every primitive owns unique geometry, which is the actual batching floor.
    const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
    const attributeSets = new Set(primitives.map((primitive) => JSON.stringify(primitive.attributes)));
    expect(primitives.length).toBeGreaterThan(50);
    expect(attributeSets.size).toBe(primitives.length);
  });
});
