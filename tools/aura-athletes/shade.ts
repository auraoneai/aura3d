/**
 * CPU close-up of a rigged palette athlete in a clip pose: palette colour per vertex UV, flat Lambert, painter-sorted triangles,
 * orthographic camera from the front-left and above (the owner's Hoops view). No GPU.
 *   node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/aura-athletes/shade.ts <in.glb> <out.png> [clip=Idle_Loop] [t01=0] [yaw=35] [pitch=25] [px=900] [focus=arms|body|full]
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { samplePoses } from "../../packages/aura3d-cli/src/skin/analysis.ts";
import { buildHierarchy, loadSkins, readAccessor, readGlbFile, skinnedPositions, localPose, forward, clipDuration } from "../../packages/aura3d-cli/src/skin/gltf.ts";

const [inPath, outPath, clipArg = "Idle_Loop", tArg = "0", yawArg = "35", pitchArg = "25", pxArg = "900", focus = "full"] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error("usage: shade.ts in.glb out.png [clip] [t01] [yaw] [pitch] [px] [focus]");
const glb = readGlbFile(inPath);
const h = buildHierarchy(glb);
const skin = loadSkins(glb, h)[0]!;
const img = glb.json.images?.[0];
let data: Buffer = Buffer.alloc(0), info = { width: 1, height: 1, channels: 3 };
if (img?.bufferView !== undefined) {
  const bv = glb.json.bufferViews[img.bufferView]!;
  const bytes = glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  const r = await sharp(bytes).raw().toBuffer({ resolveWithObject: true }); data = r.data; info = r.info as typeof info;
}
const colorAt = (u: number, v: number): [number, number, number] => {
  const x = Math.min(info.width - 1, Math.floor(u * info.width)), y = Math.min(info.height - 1, Math.floor(v * info.height));
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};
const posAll: number[][][] = [], uvAll: number[][][] = [], facMat: ([number, number, number] | null)[] = [];
for (const pr of skin.primitives) {
  const pj = glb.json.meshes![pr.meshIndex]!.primitives[pr.primitiveIndex]!;
  uvAll.push(pj.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, pj.attributes.TEXCOORD_0).rows : []);
  const f = glb.json.materials?.[pj.material ?? -1]?.pbrMetallicRoughness?.baseColorFactor;
  facMat.push(pj.attributes.TEXCOORD_0 === undefined && f ? [Math.round(f[0]! ** (1 / 2.2) * 255), Math.round(f[1]! ** (1 / 2.2) * 255), Math.round(f[2]! ** (1 / 2.2) * 255)] : null);
}
void posAll;
const anim = (glb.json.animations ?? []).find((a: { name?: string }) => a.name === clipArg) ?? null;
const pose = forward(localPose(glb, anim, anim ? clipDuration(glb, anim) * Number(tArg) : 0, h), h);
const posByPrim = skin.primitives.map((pr) => skinnedPositions(skin, pr, pose));
const prim0 = skin.primitives[0]!;
const pos = posByPrim.flat();
const yaw = (Number(yawArg) * Math.PI) / 180, pitch = (Number(pitchArg) * Math.PI) / 180;
// camera: looks at the model from front-left and above; model forward is +Z
const rot = (p: number[]): [number, number, number] => {
  const x1 = Math.cos(yaw) * p[0]! - Math.sin(yaw) * p[2]!, z1 = Math.sin(yaw) * p[0]! + Math.cos(yaw) * p[2]!;
  const y2 = Math.cos(pitch) * p[1]! - Math.sin(pitch) * z1, z2 = Math.sin(pitch) * p[1]! + Math.cos(pitch) * z1;
  return [x1, y2, z2];
};
const R = pos.map((p) => rot(p));
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
const topY = prim0.pos.reduce((m, p) => Math.max(m, p[1]), -1e9);
const keep = (i: number): boolean => focus === "full" || (focus === "head" ? pos[i]![1] > topY - 0.4 : false) || (focus === "head" ? false : focus === "arms" ? pos[i]![1] > prim0.pos.reduce((m, p) => Math.min(m, p[1]), 1e9) + 1.05 && pos[i]![1] < prim0.pos.reduce((m, p) => Math.max(m, p[1]), -1e9) - 0.2 : pos[i]![1] > 0.35 - 0.95);
for (let i = 0; i < R.length; i += 1) { if (!keep(i)) continue; minX = Math.min(minX, R[i]![0]); maxX = Math.max(maxX, R[i]![0]); minY = Math.min(minY, R[i]![1]); maxY = Math.max(maxY, R[i]![1]); }
const W = Number(pxArg), H = Number(pxArg);
const scale = Math.min(W / (maxX - minX), H / (maxY - minY)) * 0.9;
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
const sx = (p: number[]): number => W / 2 + (p[0]! - cx) * scale, sy = (p: number[]): number => H / 2 - (p[1]! - cy) * scale;
const rgb = Buffer.alloc(W * H * 3, 34);
const zbuf = new Float32Array(W * H).fill(-1e9);
const light = [0.3, 0.7, 0.65]; const ll = Math.hypot(...light); const L = light.map((x) => x / ll);
const offsets: number[] = []; { let o = 0; for (const pr of skin.primitives) { offsets.push(o); o += pr.pos.length; } }
const tris: { ids: number[]; pi: number }[] = [];
skin.primitives.forEach((pr, pi) => { for (let t = 0; t < pr.indices.length; t += 3) tris.push({ ids: [pr.indices[t]! + offsets[pi]!, pr.indices[t + 1]! + offsets[pi]!, pr.indices[t + 2]! + offsets[pi]!], pi }); });
for (const { ids, pi } of tris) {
  if (!ids.some(keep)) continue;
  const P = ids.map((i) => pos[i]!), Q = ids.map((i) => R[i]!);
  const u = [P[1]![0]! - P[0]![0]!, P[1]![1]! - P[0]![1]!, P[1]![2]! - P[0]![2]!], w = [P[2]![0]! - P[0]![0]!, P[2]![1]! - P[0]![1]!, P[2]![2]! - P[0]![2]!];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]; const nl = Math.hypot(...n) || 1; n = n.map((x) => x / nl);
  // camera-space normal facing: backfaces drawn darker so holes and inverted shells show
  const qn = rot(n);
  const lam = Math.abs(n[0]! * L[0]! + n[1]! * L[1]! + n[2]! * L[2]!);
  const back = qn[2]! < 0;
  const uvs = uvAll[pi]!; const l0 = ids[0]! - offsets[pi]!, l1 = ids[1]! - offsets[pi]!, l2 = ids[2]! - offsets[pi]!;
  const col = facMat[pi] ?? colorAt((uvs[l0]![0]! + uvs[l1]![0]! + uvs[l2]![0]!) / 3, (uvs[l0]![1]! + uvs[l1]![1]! + uvs[l2]![1]!) / 3);
  const shade = back ? 0.25 : 0.35 + 0.65 * lam;
  const x0 = Math.max(0, Math.floor(Math.min(...Q.map(sx)))), x1 = Math.min(W - 1, Math.ceil(Math.max(...Q.map(sx))));
  const y0 = Math.max(0, Math.floor(Math.min(...Q.map(sy)))), y1 = Math.min(H - 1, Math.ceil(Math.max(...Q.map(sy))));
  const [ax, ay] = [sx(Q[0]!), sy(Q[0]!)], [bx, by] = [sx(Q[1]!), sy(Q[1]!)], [cx2, cy2] = [sx(Q[2]!), sy(Q[2]!)];
  const den = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2);
  if (Math.abs(den) < 1e-9) continue;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const l1 = ((by - cy2) * (x + 0.5 - cx2) + (cx2 - bx) * (y + 0.5 - cy2)) / den, l2 = ((cy2 - ay) * (x + 0.5 - cx2) + (ax - cx2) * (y + 0.5 - cy2)) / den, l3 = 1 - l1 - l2;
    if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
    const z = l1 * Q[0]![2] + l2 * Q[1]![2] + l3 * Q[2]![2];
    if (z <= zbuf[y * W + x]!) continue; // the camera sits on +z: larger z is nearer
    zbuf[y * W + x] = z;
    const o = (y * W + x) * 3;
    rgb[o] = Math.min(255, col[0] * shade); rgb[o + 1] = Math.min(255, col[1] * shade); rgb[o + 2] = Math.min(255, col[2] * shade);
  }
}
const crcT = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, d: Buffer): Buffer => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y += 1) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(outPath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote", outPath);
