/**
 * Splits the bridging triangles of a Meshy-rigged athlete: triangles that stretch past the limit (or draw as thin long flaps) in the
 * shipped clips get their own vertices, skinned rigidly to the bone that owns most of them, so they keep their rest size instead of
 * stretching into slabs when a limb swings. The rest pose, skeleton, clips, UVs, texture and material are unchanged; POSITION, NORMAL,
 * TEXCOORD_0, JOINTS_0, WEIGHTS_0 and the index buffer are rewritten (new vertices are appended).
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/aura-athletes/split-bridges.ts <in.glb> <out.glb> [--split-from 1.6]
 */
import { writeFileSync } from "node:fs";
import { analyzeSkin, samplePoses, triangleStretch } from "../../packages/aura3d-cli/src/skin/analysis.ts";
import { GlbEditor } from "../../packages/aura3d-cli/src/skin/glbEdit.ts";
import { buildHierarchy, jointBindPositions, loadSkins, readAccessor, readGlbFile, writeGlbFile, type GlbData } from "../../packages/aura3d-cli/src/skin/gltf.ts";

type V = [number, number, number];
const ALIGN_BONES = ["LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg", "LeftUpperArm", "RightUpperArm", "Hips", "Spine", "Chest"];

function main(): void {
  const args = process.argv.slice(2);
  const [input, output] = args;
  if (!input || !output) throw new Error("usage: refit.ts <in.glb> <out.glb> [--limit 1.6] [--split-from 1.6]");
  const flag = (name: string, d: number): number => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : d; };
  const limit = flag("--limit", 1.6);
  const splitFrom = flag("--split-from", limit);
  const glb = readGlbFile(input);
  const hierarchy = buildHierarchy(glb);
  const skin = loadSkins(glb, hierarchy)[0];
  if (!skin) throw new Error("no skinned mesh");
  const bind = jointBindPositions(skin) as V[];
  const names = skin.jointNames;
  const idx = (n: string): number => names.indexOf(n);
  const prim = skin.primitives[0];
  if (!prim || skin.primitives.length !== 1) throw new Error("expected one skinned primitive");
  const json = glb.json.meshes?.[prim.meshIndex]?.primitives[prim.primitiveIndex];
  if (!json) throw new Error("no primitive json");
  const normals = json.attributes.NORMAL !== undefined ? readAccessor(glb, json.attributes.NORMAL).rows as V[] : null;
  const uvs = json.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, json.attributes.TEXCOORD_0).rows : null;
  const nV = prim.pos.length;
  let pos = prim.pos.map((p) => [p[0], p[1], p[2]] as V);
  let nrm = normals ? normals.map((n) => [n[0], n[1], n[2]] as V) : null;
  let joints = prim.joints.map((j) => [...j]);
  let weights = prim.weights.map((w) => [...w]);
  let indices = [...prim.indices];

  const report: string[] = [];
  const before = analyzeSkin(glb, {});
  report.push(`before: max stretch ${Math.max(...Object.values(before.materials).map((m) => m.maxStretch)).toFixed(2)}x over limit ${Object.values(before.materials).reduce((a, m) => a + m.trianglesOverLimit, 0)}`);

  if (args.includes("--align")) {
    // the mesh sits off the skeleton as a whole: shift it sideways/forward so its limbs straddle the bone axes (mean offset of the bone-owned vertices)
    let dx = 0, dz = 0, n = 0;
    for (const bn of ALIGN_BONES) {
      const b = names.indexOf(bn);
      if (b < 0) continue;
      let sx = 0, sz = 0, c = 0;
      for (let v = 0; v < nV; v += 1) (joints[v] as number[]).forEach((j, k) => { if (j === b && (weights[v] as number[])[k]! > 0.5) { sx += (pos[v] as V)[0]; sz += (pos[v] as V)[2]; c += 1; } });
      if (c < 40) continue;
      const jp = bind[b] as V;
      dx += jp[0] - sx / c; dz += jp[2] - sz / c; n += 1;
    }
    if (n > 0) { dx /= n; dz /= n; }
    report.push(`align: shift mesh by dx ${(dx * 100).toFixed(1)} cm, dz ${(dz * 100).toFixed(1)} cm (from ${n} bones)`);
    pos = pos.map((p) => [p[0] + dx, p[1], p[2] + dz] as V);
  }

  const edited = (): GlbData => {
    const ed = new GlbEditor(glb);
    const p = ed.primitive(prim.meshIndex, prim.primitiveIndex);
    p.attributes.POSITION = ed.addAccessor(pos.flat(), 5126, "VEC3", 34962, true);
    if (nrm) p.attributes.NORMAL = ed.addAccessor(nrm.flat(), 5126, "VEC3", 34962);
    if (uvs) p.attributes.TEXCOORD_0 = ed.addAccessor(uvs.flat(), 5126, "VEC2", 34962);
    p.attributes.JOINTS_0 = ed.addAccessor(joints.flat(), 5123, "VEC4", 34962);
    p.attributes.WEIGHTS_0 = ed.addAccessor(weights.flat(), 5126, "VEC4", 34962);
    p.indices = ed.addAccessor(indices, pos.length > 65535 ? 5125 : 5123, "SCALAR", 34963);
    return ed.finish();
  };

  // bridge split: measure on the refitted mesh, give every still-stretched triangle its own rigidly skinned vertices
  let current = edited();
  for (let round = 0; round < 3; round += 1) {
    const h2 = buildHierarchy(current);
    const s2 = loadSkins(current, h2)[0]!;
    const poses = samplePoses(current, h2, current.json.animations ?? [], 10).poses;
    const pr = s2.primitives[0]!;
    const { worst, flap } = triangleStretch(s2, pr, poses, 0.266, 0.2);
    const bad: number[] = [];
    for (let t = 0; t < worst.length; t += 1) if ((worst[t] as number) > splitFrom || flap[t]) bad.push(t);
    report.push(`round ${round}: ${bad.length} triangle(s) past ${splitFrom}x or flap`);
    if (bad.length === 0) break;
    for (const t of bad) {
      const ids = [0, 1, 2].map((k) => indices[t * 3 + k] as number);
      const tally = new Map<number, number>();
      for (const v of ids) (joints[v] as number[]).forEach((j, k) => tally.set(j, (tally.get(j) ?? 0) + ((weights[v] as number[])[k] ?? 0)));
      const owner = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      for (let k = 0; k < 3; k += 1) {
        const src = ids[k] as number;
        pos.push([...(pos[src] as V)] as V);
        if (nrm) nrm.push([...(nrm[src] as V)] as V);
        if (uvs) uvs.push([...(uvs[src] as number[])]);
        joints.push([owner, 0, 0, 0]);
        weights.push([1, 0, 0, 0]);
        indices[t * 3 + k] = pos.length - 1;
      }
    }
    current = edited();
  }
  const after = analyzeSkin(current, {});
  report.push(`after: max stretch ${Math.max(...Object.values(after.materials).map((m) => m.maxStretch)).toFixed(2)}x over limit ${Object.values(after.materials).reduce((a, m) => a + m.trianglesOverLimit, 0)} flaps ${Object.values(after.materials).reduce((a, m) => a + m.flaps, 0)} ok=${after.ok} codes=${after.reasonCodes.join(",")}`);
  const { bytes } = writeGlbFile(output, current);
  report.push(`wrote ${output} (${bytes} bytes), vertices ${nV} -> ${pos.length}`);
  console.log(report.join("\n"));
  void limit; void writeFileSync;
}
main();
