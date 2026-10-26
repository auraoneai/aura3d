// Re-rigs a four-legged mesh that shipped on a humanoid template skeleton as a bounding body: rear half on Hips, front half on Chest, head on Head,
// smooth blends along the spine, and authored Idle_Loop / Walk_Loop clips (bob, spine flex, head counter-pitch). Usage:
//   node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/skin-fixes/bounding-quadruped.ts <in.glb> <out.glb>
import { GlbEditor } from "../../packages/aura3d-cli/src/skin/glbEdit.ts";
import { buildHierarchy, loadSkins, readGlbFile, writeGlbFile, type GltfAnimation, type Quat, type Vec3 } from "../../packages/aura3d-cli/src/skin/gltf.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: bounding-quadruped.ts <in.glb> <out.glb>");
const glb = readGlbFile(input);
const h = buildHierarchy(glb);
const skin = loadSkins(glb, h)[0];
if (!skin) throw new Error("no skinned mesh");
const jointIndex = (name: string): number => skin.jointNames.indexOf(name);
const need = ["Root", "Hips", "Spine", "Chest", "Head"].map((n) => { const k = jointIndex(n); if (k < 0) throw new Error(`joint ${n} missing`); return k; }) as [number, number, number, number, number];
const [kRoot, kHips, kSpine, kChest, kHead] = need;

// body frame from the mesh: long axis +Z (forward), centre of mass height
let zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity;
for (const p of skin.primitives) for (const v of p.pos) { zmin = Math.min(zmin, v[2]); zmax = Math.max(zmax, v[2]); ymin = Math.min(ymin, v[1]); ymax = Math.max(ymax, v[1]); }
const L = zmax - zmin, H = ymax - ymin, zc = (zmin + zmax) / 2, yc = ymin + 0.55 * H;
const world: Record<number, Vec3> = {
  [kRoot]: [0, 0, 0],
  [kHips]: [0, yc, zc - 0.21 * L],
  [kSpine]: [0, yc + 0.02 * H, zc],
  [kChest]: [0, yc + 0.04 * H, zc + 0.19 * L],
  [kHead]: [0, yc + 0.18 * H, zc + 0.33 * L]
};
const parentOf = (k: number): number => skin.joints.indexOf(h.parent[skin.joints[k] as number] ?? -1);
const worldOf = (k: number): Vec3 => world[k] ?? worldOf(parentOf(k));
const editor = new GlbEditor(glb);
skin.joints.forEach((node, k) => {
  const pk = parentOf(k);
  const w = worldOf(k), pw = pk >= 0 ? worldOf(pk) : ([0, 0, 0] as Vec3);
  const n = editor.json.nodes[node] as { translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] };
  delete n.matrix;
  n.translation = [w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]];
  n.rotation = [0, 0, 0, 1];
  n.scale = [1, 1, 1];
});
const ibm: number[] = [];
skin.joints.forEach((_, k) => { const w = worldOf(k); ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1); });
(editor.json.skins?.[skin.index] as { inverseBindMatrices?: number }).inverseBindMatrices = editor.addAccessor(ibm, 5126, "MAT4", undefined);

const sstep = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (const prim of skin.primitives) {
  const J: number[] = [], W: number[] = [];
  for (const p of prim.pos) {
    const u = (p[2] - zc) / L; // -0.5 rear .. 0.5 front
    const head = sstep(0.22, 0.34, u) * sstep(0.05, 0.18, (p[1] - yc) / H);
    const front = sstep(0.0, 0.2, u) * (1 - head);
    const rear = 1 - sstep(-0.3, -0.05, u);
    const mid = Math.max(0, 1 - rear - front - head);
    const ws: [number, number][] = [[kHips, rear], [kSpine, mid], [kChest, front], [kHead, head]];
    const sum = ws.reduce((a, [, w]) => a + w, 0) || 1;
    for (let i = 0; i < 4; i += 1) { J.push(ws[i]?.[0] ?? 0); W.push((ws[i]?.[1] ?? 0) / sum); }
  }
  const primitive = editor.primitive(prim.meshIndex, prim.primitiveIndex);
  primitive.attributes.JOINTS_0 = editor.addAccessor(J, 5123, "VEC4", 34962);
  primitive.attributes.WEIGHTS_0 = editor.addAccessor(W, 5126, "VEC4", 34962);
}

// authored clips (rotation about the lateral X axis, translation of Hips)
const qx = (deg: number): Quat => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
const qz = (deg: number): Quat => { const a = (deg * Math.PI) / 360; return [0, 0, Math.sin(a), Math.cos(a)]; };
const mul = (a: Quat, b: Quat): Quat => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
interface ClipSpec { name: string; dur: number; hipsY: (p: number) => number; pitch: Record<number, (p: number) => number>; roll: (p: number) => number }
const TAU = Math.PI * 2;
const clips: ClipSpec[] = [
  { name: "Idle_Loop", dur: 2.4, hipsY: (p) => 0.006 * Math.sin(TAU * p), pitch: { [kChest]: (p) => 1.2 * Math.sin(TAU * p), [kHead]: (p) => 2.4 * Math.sin(TAU * p + 0.9), [kHips]: () => 0 }, roll: () => 0 },
  { name: "Walk_Loop", dur: 0.9, hipsY: (p) => 0.028 * Math.abs(Math.sin(TAU * p)), pitch: { [kHips]: (p) => 4.5 * Math.sin(TAU * p), [kChest]: (p) => -6 * Math.sin(TAU * p + 0.7), [kHead]: (p) => 3.5 * Math.sin(TAU * p + 1.6) }, roll: (p) => 3 * Math.sin(TAU * p + 0.4) }
];
const outAnims: GltfAnimation[] = [];
for (const c of clips) {
  const fps = 30, frames = Math.round(c.dur * fps) + 1;
  const times: number[] = []; for (let f = 0; f < frames; f += 1) times.push(Math.min(c.dur, f / fps));
  const timeAcc = editor.addAccessor(times, 5126, "SCALAR", undefined);
  const ta = editor.json.accessors[timeAcc] as { min?: number[]; max?: number[] };
  ta.min = [0]; ta.max = [c.dur];
  const samplers: GltfAnimation["samplers"] = [], channels: GltfAnimation["channels"] = [];
  for (const kStr of Object.keys(c.pitch)) {
    const k = Number(kStr);
    const rot: number[] = [];
    for (const t of times) { const p = t / c.dur; const q = k === kHips ? mul(qz(c.roll(p)), qx(c.pitch[k]!(p))) : qx(c.pitch[k]!(p)); rot.push(q[0], q[1], q[2], q[3]); }
    samplers.push({ input: timeAcc, output: editor.addAccessor(rot, 5126, "VEC4", undefined), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: skin.joints[k] as number, path: "rotation" } });
  }
  const base = editor.json.nodes[skin.joints[kHips] as number]?.translation as number[];
  const pos: number[] = []; for (const t of times) { const p = t / c.dur; pos.push(base[0] as number, (base[1] as number) + c.hipsY(p), base[2] as number); }
  samplers.push({ input: timeAcc, output: editor.addAccessor(pos, 5126, "VEC3", undefined), interpolation: "LINEAR" });
  channels.push({ sampler: samplers.length - 1, target: { node: skin.joints[kHips] as number, path: "translation" } });
  outAnims.push({ name: c.name, samplers, channels });
}
editor.json.animations = outAnims;
writeGlbFile(output, editor.finish());
console.log(`wrote ${output}`);
