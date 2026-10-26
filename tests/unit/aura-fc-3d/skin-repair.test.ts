import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clipDuration, forward, localPose, readGlb } from "../../../tools/aura-fc/glb.mjs";
import { loadSkinnedMesh, skinnedPositions, triangleStretch } from "../../../tools/aura-fc/skin.mjs";

/**
 * The Meshy mesh is modelled mid-stride (knee bent, thigh swung forward, thigh surface made of a few huge triangles) but bound
 * to a straight skeleton, so every clip rotated the legs about joints 10 to 20 cm from the limbs and tore the shorts and thighs
 * into shards. The shipped GLBs have the lower body rebuilt in the straight pose (tools/aura-fc/rebuild-legs.mjs): thigh and
 * shin skin, thigh shorts, a pelvis skirt and ankle socks are tubes around the real bone axes with smooth hip, knee and ankle
 * weights, and the boots are straightened. No triangle of any material stretches past 1.6x in any clip the game plays.
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
  it("shipped mesh: no triangle of any material stretches past 1.75x in any played pose", () => {
    const now = wholeMesh(glbPath(key));
    const original = wholeMesh(ORIGINAL[key]!);
    console.log("SKIN_REPAIR", JSON.stringify({ key, now, original }));
    expect(now.max).toBeLessThanOrEqual(1.75);
    expect(now.past2).toBe(0);
    expect(now.shortsMax).toBeLessThanOrEqual(1.75);
  }, 180_000);

  it("the legs are bound where they are: every leg-owned skin vertex is within 15 cm of its bone segment in the rest pose", () => {
    const glb = readGlb(glbPath(key));
    const rest = forward(glb, localPose(glb, null, 0));
    const P = (n: string) => rest.pos[rest.id(n)] as number[];
    const segs: Record<string, number[][]> = {
      LeftUpperLeg: [P("LeftUpperLeg"), P("LeftLowerLeg")], LeftLowerLeg: [P("LeftLowerLeg"), P("LeftFoot")],
      RightUpperLeg: [P("RightUpperLeg"), P("RightLowerLeg")], RightLowerLeg: [P("RightLowerLeg"), P("RightFoot")]
    };
    const dseg = (p: number[], [a, b]: number[][]) => {
      const ab = b.map((x, i) => x - a[i]!), ap = p.map((x, i) => x - a[i]!);
      const t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2)));
      return Math.hypot(...p.map((x, i) => x - (a[i]! + ab[i]! * t)));
    };
    let worst = 0;
    const prims = glb.json.meshes[0].primitives;
    for (let i = 0; i < prims.length; i += 1) {
      if (!/skin|shorts/.test(glb.json.materials[prims[i].material]?.name ?? "")) continue;
      const mesh = loadSkinnedMesh(glb, i);
      for (let v = 0; v < mesh.pos.length; v += 1) {
        let top = 0, joint = "";
        for (let k = 0; k < 4; k += 1) if (mesh.weights[v][k] > top) { top = mesh.weights[v][k]; joint = mesh.jointNames[mesh.joints[v][k]]; }
        const seg = segs[joint];
        if (seg && top > 0.9 && mesh.pos[v][1] > 0.2) worst = Math.max(worst, dseg(mesh.pos[v], seg));
      }
    }
    expect(worst).toBeLessThanOrEqual(0.15);
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
