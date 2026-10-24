import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readGlb } from "../../../tools/aura-fc/glb.mjs";
import { loadSkinnedMesh, triangleStretch } from "../../../tools/aura-fc/skin.mjs";

/**
 * The Meshy auto-rig leaves bridging triangles between independently moving body parts (thigh to thigh across the shorts
 * seam, hand to hip). In a stride or a kick they stretch into pale slabs and flaps at the hips. The shipped GLBs smooth the
 * skin weights around those triangles (tools/aura-fc/skin.mjs): no geometry is removed, and nothing the game plays stretches
 * past 5x any more (the unsmoothed repainted meshes reach 10x and more).
 */
const manifest = readFileSync("apps/showcase-aura-fc-3d/src/aura-assets-v2.ts", "utf8");
const glbPath = (key: string) => `public${/url: "([^"]+)"/.exec(manifest.slice(manifest.indexOf(`${key}: {`)))![1]}`;
const ORIGINAL: Record<string, string> = { fcSoccerStrikerMeshy: "public/aura-assets/fcSoccerStrikerClean.2e335ee3.glb", fcGoalkeeperMeshy: "public/aura-assets/fcGoalkeeperClean.4194514e.glb" };

describe.each(["fcSoccerStrikerMeshy", "fcGoalkeeperMeshy"])("%s skinned mesh", (key) => {
  it("shipped weights: at most 40 triangles past 2x and none past 5x in any played pose; every triangle is kept", () => {
    const glb = readGlb(glbPath(key));
    const mesh = loadSkinnedMesh(glb);
    const worst = triangleStretch(glb, mesh);
    const past2 = worst.filter((r: number) => r > 2).length;
    const max = Math.max(...worst);
    const original = loadSkinnedMesh(readGlb(ORIGINAL[key]!));
    console.log("SKIN_REPAIR", JSON.stringify({ key, triangles: mesh.indices.length / 3, originalTriangles: original.indices.length / 3, past2x: past2, maxStretch: +max.toFixed(2) }));
    expect(mesh.indices.length).toBe(original.indices.length);
    expect(past2).toBeLessThanOrEqual(40);
    expect(max).toBeLessThanOrEqual(5);
  }, 120_000);

  it("the original weights did have the bridging triangles (the defect this repair removes)", () => {
    // the original joints and weights with the shipped clips (the original file has no kick clips)
    const glb = readGlb(glbPath(key));
    const originalMesh = loadSkinnedMesh(readGlb(ORIGINAL[key]!));
    const worst = triangleStretch(glb, originalMesh);
    expect(worst.filter((r: number) => r > 4).length).toBeGreaterThan(100);
    expect(Math.max(...worst)).toBeGreaterThan(10);
  }, 120_000);
});
