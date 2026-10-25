import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readGlb } from "../../../tools/aura-fc/glb.mjs";
import { loadSkinnedMesh, triangleStretch } from "../../../tools/aura-fc/skin.mjs";

/**
 * The Meshy auto-rig leaves bridging triangles between independently moving body parts (thigh to thigh across the shorts
 * seam, hand to hip). In a stride or a kick they stretch into pale slabs and flaps at the hips. The shipped GLBs smooth the
 * skin weights around those triangles (tools/aura-fc/skin.mjs): no geometry is removed, and nothing the game plays stretches
 * past 6x any more across the whole mesh, every material primitive included (the unsmoothed repainted meshes reach 90x and more).
 */
const manifest = readFileSync("apps/showcase-aura-fc-3d/src/aura-assets-v2.ts", "utf8");
const glbPath = (key: string) => `public${/url: "([^"]+)"/.exec(manifest.slice(manifest.indexOf(`${key}: {`)))![1]}`;
const ORIGINAL: Record<string, string> = { fcSoccerStrikerMeshy: "public/aura-assets/fcSoccerStrikerClean.2e335ee3.glb", fcGoalkeeperMeshy: "public/aura-assets/fcGoalkeeperClean.4194514e.glb" };

/** Stretch over every material primitive of the mesh (the shipped file has one primitive per kit part). */
function wholeMesh(path: string) {
  const glb = readGlb(path);
  let tris = 0;
  let max = 0;
  let past2 = 0;
  let past4 = 0;
  for (let i = 0; i < glb.json.meshes[0].primitives.length; i += 1) {
    const mesh = loadSkinnedMesh(glb, i);
    const worst = triangleStretch(glb, mesh);
    tris += mesh.indices.length / 3;
    past2 += worst.filter((r: number) => r > 2).length;
    past4 += worst.filter((r: number) => r > 4).length;
    max = Math.max(max, ...worst);
  }
  return { tris, past2, past4, max };
}

describe.each(["fcSoccerStrikerMeshy", "fcGoalkeeperMeshy"])("%s skinned mesh", (key) => {
  it("shipped weights: at most 200 triangles past 2x and none past 6x over the whole mesh in any played pose; no triangle is dropped", () => {
    const now = wholeMesh(glbPath(key));
    const original = wholeMesh(ORIGINAL[key]!);
    console.log("SKIN_REPAIR", JSON.stringify({ key, now, original }));
    // the repaint splits edges along region boundaries (clean hems and face features), so triangles are only ever added
    expect(now.tris).toBeGreaterThanOrEqual(original.tris);
    expect(now.past2).toBeLessThanOrEqual(200);
    expect(now.max).toBeLessThanOrEqual(6);
  }, 180_000);

  it("the original weights did have the bridging triangles (the defect this repair removes)", () => {
    const original = wholeMesh(ORIGINAL[key]!);
    expect(original.past4).toBeGreaterThan(100);
    expect(original.max).toBeGreaterThan(10);
  }, 180_000);
});
