/**
 * Binds a new static athlete mesh (a Meshy text-to-3D generation in an A-pose) to the shared 15-bone athlete rig of a rigged base GLB.
 * The base GLB keeps its skeleton, clips, node tree and material slot; the mesh, its UVs and its albedo are replaced. Skin weights are
 * transferred from a clean donor athlete (already on the same skeleton) by nearest vertices after fitting the new mesh to the donor's
 * height and centre, then smoothed over the new mesh. Run split-bridges.ts afterwards to settle any remaining stretched triangle.
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/aura-athletes/rebind.ts \
 *     <base-rigged.glb> <new-static.glb> <weight-donor.glb> <out.glb> [--donor-dy 0.952] [--texture 1024] [--target-height 1.897] [--dx -0.0245]
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { GlbEditor } from "../../packages/aura3d-cli/src/skin/glbEdit.ts";
import { buildHierarchy, jointBindPositions, loadSkins, readAccessor, readGlbFile, writeGlbFile, type GlbData } from "../../packages/aura3d-cli/src/skin/gltf.ts";

type V = [number, number, number];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [basePath, newPath, donorPath, outPath] = args;
  if (!basePath || !newPath || !donorPath || !outPath) throw new Error("usage: rebind.ts <base.glb> <new.glb> <donor.glb> <out.glb> [options]");
  const flag = (name: string, d: number): number => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : d; };
  const donorDy = flag("--donor-dy", 0);
  const texSize = flag("--texture", 1024);
  const dxShift = flag("--dx", 0);

  const base = readGlbFile(basePath);
  const baseSkin = loadSkins(base, buildHierarchy(base))[0];
  const basePrim = baseSkin?.primitives[0];
  if (!baseSkin || !basePrim) throw new Error("base has no skinned primitive");
  const donor = readGlbFile(donorPath);
  const donorSkin = loadSkins(donor, buildHierarchy(donor))[0];
  const donorPrim = donorSkin?.primitives[0];
  if (!donorSkin || !donorPrim) throw new Error("donor has no skinned primitive");
  if (donorSkin.jointNames.join() !== baseSkin.jointNames.join()) throw new Error("donor and base skeletons differ");

  // the new static mesh
  const src = readGlbFile(newPath);
  const mesh = src.json.meshes?.[0];
  if (!mesh) throw new Error("new GLB has no mesh");
  const pos: V[] = [], nrm: V[] = [], uv: number[][] = [], idx: number[] = [];
  for (const p of mesh.primitives) {
    const off = pos.length;
    pos.push(...(readAccessor(src, p.attributes.POSITION as number).rows as V[]).map((v) => [v[0], v[1], v[2]] as V));
    nrm.push(...(p.attributes.NORMAL !== undefined ? (readAccessor(src, p.attributes.NORMAL).rows as V[]).map((v) => [v[0], v[1], v[2]] as V) : pos.slice(off).map(() => [0, 1, 0] as V)));
    uv.push(...(p.attributes.TEXCOORD_0 !== undefined ? readAccessor(src, p.attributes.TEXCOORD_0).rows.map((r) => [r[0] ?? 0, r[1] ?? 0]) : pos.slice(off).map(() => [0, 0])));
    const ids = p.indices !== undefined ? readAccessor(src, p.indices).rows.map((r) => r[0] ?? 0) : pos.slice(off).map((_, i) => i);
    for (const i of ids) idx.push(i + off);
  }
  const imageFrom = args.indexOf("--image-from") >= 0 ? readGlbFile(args[args.indexOf("--image-from") + 1] as string) : src;
  const srcImg = imageFrom.json.images?.[0];
  if (!srcImg || srcImg.bufferView === undefined) throw new Error("no embedded albedo to use");
  const bv = imageFrom.json.bufferViews[srcImg.bufferView]!;
  const imageBytes = imageFrom.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  const keepImage = args.includes("--keep-image");

  // fit to the donor: same height, feet on the donor's feet, centred on the donor's x/z centroid
  let minY = Infinity, maxY = -Infinity;
  for (const p of pos) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  let dMinY = Infinity, dMaxY = -Infinity, cx = 0, cz = 0;
  for (const p of donorPrim.pos) { dMinY = Math.min(dMinY, p[1]); dMaxY = Math.max(dMaxY, p[1]); cx += p[0]; cz += p[2]; }
  cx /= donorPrim.pos.length; cz /= donorPrim.pos.length;
  const targetHeight = flag("--target-height", dMaxY - dMinY);
  const scale = targetHeight / (maxY - minY);
  let ncx = 0, ncz = 0;
  for (const p of pos) { ncx += p[0]; ncz += p[2]; }
  ncx /= pos.length; ncz /= pos.length;
  // donor frame: feet at dMinY. new mesh in donor frame first (for the weight transfer), then moved by donorDy into the base frame
  const fitted: V[] = pos.map((p) => [(p[0] - ncx) * scale + cx, (p[1] - minY) * scale + dMinY, (p[2] - ncz) * scale + cz] as V);

  // weight transfer from the k nearest donor vertices (spatial hash)
  const cell = 0.05;
  const keyOf = (x: number, y: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  donorPrim.pos.forEach((p, i) => { const k = keyOf(p[0], p[1], p[2]); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
  const nearest = (p: V, k: number): { i: number; d: number }[] => {
    for (let r = 1; r < 12; r += 1) {
      const cands: { i: number; d: number }[] = [];
      const [gx, gy, gz] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
      for (let x = gx - r; x <= gx + r; x += 1) for (let y = gy - r; y <= gy + r; y += 1) for (let z = gz - r; z <= gz + r; z += 1) {
        for (const i of grid.get(`${x},${y},${z}`) ?? []) { const q = donorPrim.pos[i]!; cands.push({ i, d: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) }); }
      }
      if (cands.length >= k) { cands.sort((a, b) => a.d - b.d); if (cands[k - 1]!.d <= r * cell || r > 6) return cands.slice(0, k); }
    }
    return [{ i: 0, d: 0 }];
  };
  const nJ = baseSkin.jointNames.length;
  const bindPos = jointBindPositions(baseSkin) as V[];
  const jn = (n: string): number => baseSkin.jointNames.indexOf(n);
  type Seg = { j: number; a: V; b: V; r: number };
  const segs: Seg[] = [];
  const addSeg = (name: string, a: V, b: V, r: number): void => { if (jn(name) >= 0) segs.push({ j: jn(name), a, b, r }); };
  const at = (n: string): V => bindPos[jn(n)] as V;
  const sub3 = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add3 = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul3 = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
  addSeg("Hips", at("Hips"), at("Spine"), 0.17);
  addSeg("Spine", at("Spine"), at("Chest"), 0.17);
  addSeg("Chest", at("Chest"), at("Head"), 0.18);
  addSeg("Head", at("Head"), add3(at("Head"), [0, 0.2, 0]), 0.12);
  for (const side of ["Left", "Right"]) {
    addSeg(`${side}UpperLeg`, at(`${side}UpperLeg`), at(`${side}LowerLeg`), 0.1);
    addSeg(`${side}LowerLeg`, at(`${side}LowerLeg`), at(`${side}Foot`), 0.075);
    addSeg(`${side}Foot`, at(`${side}Foot`), add3(at(`${side}Foot`), [0, -0.08, 0.14]), 0.085);
    addSeg(`${side}UpperArm`, at(`${side}UpperArm`), at(`${side}Forearm`), 0.075);
    addSeg(`${side}Forearm`, at(`${side}Forearm`), add3(at(`${side}Forearm`), mul3(sub3(at(`${side}Forearm`), at(`${side}UpperArm`)), 0.95)), 0.065);
  }
  const segDist = (p: V, s: Seg): number => {
    const ab = sub3(s.b, s.a), ap = sub3(p, s.a);
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1)));
    const q = add3(s.a, mul3(ab, t));
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  const exact = args.includes("--exact");
  const srcJoints: number[][] = [], srcWeights: number[][] = [];
  if (exact) for (const p of mesh.primitives) {
    srcJoints.push(...readAccessor(src, p.attributes.JOINTS_0 as number).rows.map((r) => [...r]));
    srcWeights.push(...readAccessor(src, p.attributes.WEIGHTS_0 as number).rows.map((r) => [...r]));
  }
  const proximity = args.includes("--proximity");
  const baseFrame = (p: V): V => [p[0] + dxShift, p[1] + donorDy, p[2]];
  let dense: Map<number, number>[] = proximity ? fitted.map((fp) => {
    const p = baseFrame(fp);
    const m = new Map<number, number>();
    for (const sg of segs) { const d = segDist(p, sg) / sg.r; const w = Math.exp(-3 * d * d); if (w > 0.002) m.set(sg.j, (m.get(sg.j) ?? 0) + w); }
    if (m.size === 0) { let best = segs[0]!; let bd = Infinity; for (const sg of segs) { const d = segDist(p, sg); if (d < bd) { bd = d; best = sg; } } m.set(best.j, 1); }
    return m;
  }) : fitted.map((p) => {
    const m = new Map<number, number>();
    for (const { i, d } of nearest(p, 4)) {
      const wt = 1 / (d + 0.004);
      (donorPrim.joints[i] ?? []).forEach((j, k) => { const w = donorPrim.weights[i]?.[k] ?? 0; if (w > 0 && j < nJ) m.set(j, (m.get(j) ?? 0) + w * wt); });
    }
    return m;
  });
  // smooth over the new mesh's welded adjacency
  const weld = new Map<string, number>();
  const rep: number[] = fitted.map((p, i) => { const k = `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)},${Math.round(p[2] * 1000)}`; const r = weld.get(k); if (r === undefined) { weld.set(k, i); return i; } return r; });
  const adj: Set<number>[] = Array.from({ length: pos.length }, () => new Set<number>());
  for (let t = 0; t + 2 < idx.length; t += 3) for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) if (a !== b) adj[rep[idx[t + a]!]!]!.add(rep[idx[t + b]!]!);
  for (let it = 0; it < flag("--smooth", 3); it += 1) {
    const next = dense.map((m) => new Map(m));
    for (let v = 0; v < pos.length; v += 1) {
      const nb = [...(adj[rep[v]!] ?? [])];
      if (nb.length === 0) continue;
      const m = new Map<number, number>();
      for (const [j, w] of dense[v]!) m.set(j, 0.5 * w);
      for (const n of nb) for (const [j, w] of dense[n]!) m.set(j, (m.get(j) ?? 0) + (0.5 * w) / nb.length);
      next[v] = m;
    }
    dense = next;
  }
  const joints: number[][] = [], weights: number[][] = [];
  if (exact) { joints.push(...srcJoints); weights.push(...srcWeights); } else for (const m of dense) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, w]) => a + w, 0) || 1;
    joints.push([0, 1, 2, 3].map((k) => top[k]?.[0] ?? 0));
    weights.push([0, 1, 2, 3].map((k) => (top[k] ? top[k][1] / sum : 0)));
  }

  // write into the base GLB: mesh data in the base frame, albedo replaced, same skeleton and clips
  const finalPos = fitted.map((p) => [p[0] + dxShift, p[1] + donorDy, p[2]] as V);
  const ed = new GlbEditor(base);
  const prim = ed.primitive(basePrim.meshIndex, basePrim.primitiveIndex);
  prim.attributes.POSITION = ed.addAccessor(finalPos.flat(), 5126, "VEC3", 34962, true);
  prim.attributes.NORMAL = ed.addAccessor(nrm.flat(), 5126, "VEC3", 34962);
  prim.attributes.TEXCOORD_0 = ed.addAccessor(uv.flat(), 5126, "VEC2", 34962);
  prim.attributes.JOINTS_0 = ed.addAccessor(joints.flat(), 5123, "VEC4", 34962);
  prim.attributes.WEIGHTS_0 = ed.addAccessor(weights.flat(), 5126, "VEC4", 34962);
  prim.indices = ed.addAccessor(idx, finalPos.length > 65535 ? 5125 : 5123, "SCALAR", 34963);
  const jpeg = keepImage ? Buffer.from(imageBytes) : await sharp(Buffer.from(imageBytes)).resize(texSize, texSize, { fit: "inside" }).jpeg({ quality: 86 }).toBuffer();
  const pad = (4 - (ed.bin.length % 4)) % 4;
  if (pad) ed.bin = Buffer.concat([ed.bin, Buffer.alloc(pad)]);
  const offset = ed.bin.length;
  ed.bin = Buffer.concat([ed.bin, jpeg]);
  ed.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: jpeg.length });
  const image = ed.json.images?.[0];
  if (!image) throw new Error("base has no image slot");
  image.bufferView = ed.json.bufferViews.length - 1;
  image.mimeType = keepImage ? (srcImg.mimeType ?? "image/png") : "image/jpeg";
  const out: GlbData = ed.finish();
  const { bytes } = writeGlbFile(outPath, out);
  console.log(`rebound ${pos.length} vertices, ${idx.length / 3} triangles, scale ${scale.toFixed(3)}, texture ${jpeg.length} bytes -> ${outPath} (${bytes} bytes)`);
  void writeFileSync;
}
void main();
