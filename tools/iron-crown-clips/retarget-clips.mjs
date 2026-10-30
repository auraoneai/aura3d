#!/usr/bin/env node
// IC-12: add Meshy `animate` clips to an admitted Iron Crown fighter GLB without touching its mesh, skin, textures or
// existing clips.
//
// The fighters' original Meshy rig tasks expired, so the new clips were generated on a fresh rig of the same remeshed
// mesh at the same height (`meshy rigging create --height-meters <h>`), then merged onto that rig with
// `aura3d assets merge-clips`. The fresh rig has the same 24 joint names but slightly different joint placement and
// rest orientation (Meshy auto-rigs each run), so copying the channels as-is would bend the admitted skin wrongly.
// This tool retargets through the bind pose instead: for every joint j and frame,
//   skin_j   = W_src(j, t) * IBM_src(j)          (how the fresh rig deforms the shared mesh)
//   W_tgt(j) = skin_j * inverse(IBM_tgt(j))      (the admitted joint pose that deforms the mesh the same way)
//   local_j  = inverse(W_tgt(parent)) * W_tgt(j) -> translation, rotation, scale keys at 30 fps
// so each admitted joint matrix equals the fresh rig's joint matrix for the same mesh. Only animations are added;
// textures (EXT_texture_webp atlases), geometry and the shipped clips are written back unchanged (position-accessor
// hash checked). Writes <out-dir>/<id>.<sha256-8>.glb and prints a JSON report.
//
// Usage (repo root):
//   node tools/iron-crown-clips/retarget-clips.mjs <admitted.glb> <merged-new-rig.glb> <out-dir> [Clip=start:end ...]
// `Clip=start:end` keeps only that time window of a source clip (seconds, re-timed to start at 0).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const FPS = 30;
const [targetFile, sourceFile, outDir, ...windowArgs] = process.argv.slice(2);
if (!targetFile || !sourceFile || !outDir) {
  console.error("usage: retarget-clips.mjs <admitted.glb> <merged-new-rig.glb> <out-dir> [Clip=start:end ...]");
  process.exit(2);
}
const windows = new Map(
  windowArgs.map((arg) => {
    const [name, range] = arg.split("=");
    const [start, end] = range.split(":").map(Number);
    if (!(end > start)) throw new Error(`bad window ${arg}`);
    return [name, { start, end }];
  })
);

/* ---------- column-major mat4 / quaternion helpers (glTF conventions) ---------- */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function normalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function slerp(a, b, u) {
  let [bx, by, bz, bw] = b;
  let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (c < 0) [c, bx, by, bz, bw] = [-c, -bx, -by, -bz, -bw];
  let s0 = 1 - u;
  let s1 = u;
  if (1 - c > 1e-6) {
    const o = Math.acos(c);
    const so = Math.sin(o);
    s0 = Math.sin((1 - u) * o) / so;
    s1 = Math.sin(u * o) / so;
  }
  return normalize([s0 * a[0] + s1 * bx, s0 * a[1] + s1 * by, s0 * a[2] + s1 * bz, s0 * a[3] + s1 * bw]);
}
function compose(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}
function multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = v;
  }
  return o;
}
function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d
  ];
}
function decompose(m) {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r00 = m[0] / sx, r01 = m[1] / sx, r02 = m[2] / sx, r10 = m[4] / sy, r11 = m[5] / sy, r12 = m[6] / sy, r20 = m[8] / sz, r21 = m[9] / sz, r22 = m[10] / sz;
  const trace = r00 + r11 + r22;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(r12 - r21) / s, (r20 - r02) / s, (r01 - r10) / s, 0.25 * s];
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    q = [0.25 * s, (r01 + r10) / s, (r20 + r02) / s, (r12 - r21) / s];
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    q = [(r01 + r10) / s, 0.25 * s, (r12 + r21) / s, (r20 - r02) / s];
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    q = [(r20 + r02) / s, (r12 + r21) / s, 0.25 * s, (r01 - r10) / s];
  }
  return { t: [m[12], m[13], m[14]], r: normalize(q), s: [sx, sy, sz] };
}

/* ---------- glTF sampling ---------- */
function sample(sampler, time) {
  const input = sampler.getInput().getArray();
  const output = sampler.getOutput().getArray();
  const n = input.length;
  const width = output.length / n;
  if (sampler.getInterpolation() === "CUBICSPLINE") throw new Error("CUBICSPLINE samplers are not supported");
  const at = (i) => Array.from(output.slice(i * width, (i + 1) * width));
  if (time <= input[0]) return at(0);
  if (time >= input[n - 1]) return at(n - 1);
  let i = 0;
  while (i < n - 2 && input[i + 1] < time) i++;
  if (sampler.getInterpolation() === "STEP") return at(i);
  const u = (time - input[i]) / (input[i + 1] - input[i]);
  const a = at(i);
  const b = at(i + 1);
  return width === 4 ? slerp(a, b, u) : a.map((v, k) => v + (b[k] - v) * u);
}
function poseAt(animation, time) {
  const pose = new Map();
  for (const channel of animation?.listChannels() ?? []) {
    const node = channel.getTargetNode();
    if (!node) continue;
    const entry = pose.get(node) ?? {};
    entry[channel.getTargetPath()] = sample(channel.getSampler(), time);
    pose.set(node, entry);
  }
  return pose;
}
function worldMatrices(doc, pose) {
  const out = new Map();
  const visit = (node, parent) => {
    const p = pose.get(node) ?? {};
    const world = multiply(parent, compose(p.translation ?? node.getTranslation(), p.rotation ?? node.getRotation(), p.scale ?? node.getScale()));
    out.set(node, world);
    for (const child of node.listChildren()) visit(child, world);
  };
  for (const scene of doc.getRoot().listScenes()) for (const node of scene.listChildren()) visit(node, IDENTITY);
  return out;
}
function duration(animation) {
  let d = 0;
  for (const s of animation.listSamplers()) d = Math.max(d, s.getInput().getMax([])[0]);
  return d;
}
function inverseBindMatrices(skin) {
  const array = skin.getInverseBindMatrices()?.getArray();
  return new Map(skin.listJoints().map((joint, i) => [joint.getName(), array ? Array.from(array.slice(i * 16, i * 16 + 16)) : IDENTITY]));
}
function parentOf(doc, node) {
  return doc.getRoot().listNodes().find((n) => n.listChildren().includes(node)) ?? null;
}
function positionsHash(doc) {
  const h = createHash("sha256");
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) h.update(Buffer.from(prim.getAttribute("POSITION").getArray().buffer));
  return h.digest("hex").slice(0, 16);
}

/* ---------- retarget ---------- */
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const targetBytes = readFileSync(targetFile);
const target = await io.readBinary(new Uint8Array(targetBytes));
const source = await io.read(sourceFile);
const positionsBefore = positionsHash(target);
const clipsBefore = target.getRoot().listAnimations().map((a) => a.getName());

const tSkin = target.getRoot().listSkins()[0];
const sSkin = source.getRoot().listSkins()[0];
const tIbm = inverseBindMatrices(tSkin);
const sIbm = inverseBindMatrices(sSkin);
const sJoints = new Map(sSkin.listJoints().map((j) => [j.getName(), j]));
const tJoints = tSkin.listJoints();
const missing = tJoints.map((j) => j.getName()).filter((name) => !sJoints.has(name));
if (missing.length > 0) throw new Error(`source rig lacks joints: ${missing.join(", ")}`);
const tParents = new Map(tJoints.map((j) => [j, parentOf(target, j)]));
const buffer = target.getRoot().listBuffers()[0];
// Non-joint ancestors (the Armature node) keep their rest transforms in the target.
const tRest = worldMatrices(target, new Map());
const report = [];

for (const animation of source.getRoot().listAnimations()) {
  const name = animation.getName();
  if (clipsBefore.includes(name)) throw new Error(`${name} already exists in ${targetFile}`);
  const full = duration(animation);
  const win = windows.get(name) ?? { start: 0, end: full };
  const span = Math.min(win.end, full) - win.start;
  const frames = Math.max(2, Math.round(span * FPS) + 1);
  const times = new Float32Array(frames);
  const keys = new Map(tJoints.map((j) => [j, { t: [], r: [], s: [] }]));
  let maxScaleError = 0;
  for (let f = 0; f < frames; f++) {
    const local = (span * f) / (frames - 1);
    times[f] = local;
    const sWorld = worldMatrices(source, poseAt(animation, win.start + local));
    const tWorld = new Map();
    for (const joint of tJoints) {
      const skinMatrix = multiply(sWorld.get(sJoints.get(joint.getName())), sIbm.get(joint.getName()));
      tWorld.set(joint, multiply(skinMatrix, invert(tIbm.get(joint.getName()))));
    }
    for (const joint of tJoints) {
      const parent = tParents.get(joint);
      const parentWorld = parent ? tWorld.get(parent) ?? tRest.get(parent) : IDENTITY;
      const { t, r, s } = decompose(multiply(invert(parentWorld), tWorld.get(joint)));
      const k = keys.get(joint);
      const prev = k.r.length ? k.r.slice(-4) : null;
      const q = prev && prev[0] * r[0] + prev[1] * r[1] + prev[2] * r[2] + prev[3] * r[3] < 0 ? r.map((v) => -v) : r;
      k.t.push(...t);
      k.r.push(...q);
      k.s.push(...s);
      maxScaleError = Math.max(maxScaleError, ...s.map((v) => Math.abs(v - 1)));
    }
  }
  const out = target.createAnimation(name);
  const input = target.createAccessor(`${name}_time`).setType("SCALAR").setArray(times).setBuffer(buffer);
  for (const joint of tJoints) {
    const k = keys.get(joint);
    for (const [pathName, type, values] of [["translation", "VEC3", k.t], ["rotation", "VEC4", k.r], ["scale", "VEC3", k.s]]) {
      const output = target.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
      const sampler = target.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
      out.addSampler(sampler);
      out.addChannel(target.createAnimationChannel().setTargetNode(joint).setTargetPath(pathName).setSampler(sampler));
    }
  }
  report.push({ name, sourceDuration: Number(full.toFixed(3)), window: [win.start, Number(Math.min(win.end, full).toFixed(3))], duration: Number(span.toFixed(3)), frames, channels: out.listChannels().length, maxScaleError: Number(maxScaleError.toExponential(2)) });
}

const written = Buffer.from(await io.writeBinary(target));
const check = await io.readBinary(new Uint8Array(written));
const hash = createHash("sha256").update(written).digest("hex");
const id = path.basename(targetFile).split(".")[0];
const fileName = `${id}.${hash.slice(0, 8)}.glb`;
writeFileSync(path.join(outDir, fileName), written);
const clipsAfter = check.getRoot().listAnimations().map((a) => a.getName());
const mimes = (doc) => doc.getRoot().listTextures().map((t) => `${t.getMimeType()}:${createHash("sha256").update(t.getImage()).digest("hex").slice(0, 12)}`).join(",");
console.log(
  JSON.stringify(
    {
      id,
      from: path.basename(targetFile),
      to: fileName,
      bytesBefore: targetBytes.length,
      bytesAfter: written.length,
      hash: `sha256-${hash}`,
      positionsBefore,
      positionsAfter: positionsHash(check),
      texturesUnchanged: mimes(check) === mimes(await io.readBinary(new Uint8Array(targetBytes))),
      clipsKept: clipsBefore.every((c, i) => clipsAfter[i] === c),
      clipsAdded: report
    },
    null,
    2
  )
);
