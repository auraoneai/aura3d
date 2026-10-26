import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clipDuration, forward, localPose, readGlb } from "../../../tools/aura-fc/glb.mjs";
import { loadSkinnedMesh, skinnedPositions, triangleStretch } from "../../../tools/aura-fc/skin.mjs";

/**
 * The Meshy auto-rig leaves bridging triangles between independently moving body parts (thigh to thigh across the shorts
 * seam, hand to hip) and, in the shorts mesh, 15 to 65 cm thin flaps. In a stride or a kick they draw jagged white shards.
 * The shipped GLBs have those cut from the shorts mesh (tools/aura-fc/bridge-cut.mjs --sliver 0.1 --keep-stretch skin):
 * the skin mesh keeps its triangles because the legs are built from them (cutting them tears the thighs, verified in the
 * game render), so the skin stays under the older 6x ceiling.
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
  let shortsMax = 0;
  for (let i = 0; i < glb.json.meshes[0].primitives.length; i += 1) {
    const mesh = loadSkinnedMesh(glb, i);
    const worst = triangleStretch(glb, mesh);
    tris += mesh.indices.length / 3;
    past2 += worst.filter((r: number) => r > 2).length;
    past4 += worst.filter((r: number) => r > 4).length;
    max = Math.max(max, ...worst);
    if (/shorts/.test(glb.json.materials[glb.json.meshes[0].primitives[i].material]?.name ?? "")) shortsMax = Math.max(shortsMax, ...worst);
  }
  return { tris, past2, past4, max, shortsMax };
}

describe.each(["fcSoccerStrikerMeshy", "fcGoalkeeperMeshy"])("%s skinned mesh", (key) => {
  it("shipped mesh: the shorts never stretch past 1.75x in any played pose and the whole mesh stays under 6x with at most 200 triangles past 2x", () => {
    const now = wholeMesh(glbPath(key));
    const original = wholeMesh(ORIGINAL[key]!);
    console.log("SKIN_REPAIR", JSON.stringify({ key, now, original }));
    expect(now.shortsMax).toBeLessThanOrEqual(1.75);
    expect(now.max).toBeLessThanOrEqual(6);
    expect(now.past2).toBeLessThanOrEqual(200);
  }, 180_000);

  it("no shorts triangle is longer than 20 cm in a run or sprint pose (the rest-pose flaps that read as white shards are cut)", () => {
    const glb = readGlb(glbPath(key));
    let longest = 0;
    for (let i = 0; i < glb.json.meshes[0].primitives.length; i += 1) {
      if (!/shorts/.test(glb.json.materials[glb.json.meshes[0].primitives[i].material]?.name ?? "")) continue;
      const mesh = loadSkinnedMesh(glb, i);
      for (const clip of ["Run", "Sprint_Loop"]) {
        const anim = glb.json.animations.find((a: { name: string }) => a.name === clip);
        const dur = clipDuration(glb, anim);
        for (let s = 0; s < 8; s += 1) {
          const out = skinnedPositions(mesh, forward(glb, localPose(glb, anim, (dur * s) / 8)));
          for (let t = 0; t < mesh.indices.length; t += 3) {
            for (let e = 0; e < 3; e += 1) {
              const a = out[mesh.indices[t + e]], b = out[mesh.indices[t + ((e + 1) % 3)]];
              longest = Math.max(longest, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
            }
          }
        }
      }
    }
    expect(longest).toBeLessThanOrEqual(0.2);
  }, 180_000);

  it("the original weights did have the bridging triangles (the defect this repair removes)", () => {
    const original = wholeMesh(ORIGINAL[key]!);
    expect(original.past4).toBeGreaterThan(100);
    expect(original.max).toBeGreaterThan(10);
  }, 180_000);
});
