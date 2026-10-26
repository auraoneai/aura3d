// Offline software rasteriser for skinned athlete GLBs: posed silhouette per clip/time to a PNG (no GPU, no browser).
//   node tools/aura-fc/raster.mjs <glb> <out.png> <clip> <t0..1> [view=side|front] [px=700]
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { readGlb, localPose, forward, clipDuration } from "./glb.mjs";
import { loadSkinnedMesh, skinnedPositions } from "./skin.mjs";

const COLOURS = { kit: [190, 50, 45], shorts: [245, 245, 235], socks: [190, 50, 45], skin: [196, 140, 100], dark: [25, 25, 30], eyes: [255, 255, 255] };

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
export function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** opts.pose: local TRS per node to use instead of the clip; opts.unit: metres per output unit (hero skeleton is in centimetres: 0.01); opts.raw: return { img, W, H } instead of a PNG. */
export function rasterise(glb, clip, t01, view = "side", px = 700, opts = {}) {
  const anim = glb.json.animations.find((a) => a.name === clip);
  const fk = forward(glb, opts.pose ?? localPose(glb, anim, anim ? clipDuration(glb, anim) * t01 : 0));
  const W = px, H = px, img = Buffer.alloc(W * H * 3, 38), depth = new Float32Array(W * H).fill(-1e9);
  // model forward is +Z; the side view looks down -X (screen right = +Z), the front view looks down -Z (screen right = -X)
  const pr = view === "front" ? (p) => [-p[0], p[1], -p[2]] : (p) => [p[2], p[1], p[0]];
  const scale = (px * Number(process.env.RSCALE ?? 0.45)) / 1.0, ox = px * 0.5, oy = px * Number(process.env.RBASE ?? 0.88);
  glb.json.meshes[0].primitives.forEach((p, pi) => {
    if (p.attributes.JOINTS_0 === undefined) return;
    const mesh = loadSkinnedMesh(glb, pi);
    const name = glb.json.materials[p.material]?.name?.split("-").pop() ?? "kit";
    const base = COLOURS[name] ?? [128, 128, 128];
    const out = skinnedPositions(mesh, fk).map((v) => pr(opts.unit ? [v[0] * opts.unit, v[1] * opts.unit, v[2] * opts.unit] : v));
    const flag = Number(process.env.FLAG_EDGE ?? 0);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      let col = base;
      if (flag) { let m = 0; for (let e = 0; e < 3; e++) { const A = mesh.pos[mesh.indices[t + e]], B = mesh.pos[mesh.indices[t + (e + 1) % 3]]; m = Math.max(m, Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])); } if (m > flag) col = [255, 0, 255]; }
      const a = out[mesh.indices[t]], b = out[mesh.indices[t + 1]], c = out[mesh.indices[t + 2]];
      const P = [a, b, c].map((v) => [ox + v[0] * scale, oy - v[1] * scale, v[2]]);
      const minx = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const miny = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const l1 = ((P[1][1] - P[2][1]) * (x + 0.5 - P[2][0]) + (P[2][0] - P[1][0]) * (y + 0.5 - P[2][1])) / den;
        const l2 = ((P[2][1] - P[0][1]) * (x + 0.5 - P[2][0]) + (P[0][0] - P[2][0]) * (y + 0.5 - P[2][1])) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * P[0][2] + l2 * P[1][2] + l3 * P[2][2];
        const i = y * W + x;
        if (z > depth[i]) { depth[i] = z; img[i * 3] = col[0]; img[i * 3 + 1] = col[1]; img[i * 3 + 2] = col[2]; }
      }
    }
  });
  if (process.env.SKELETON) {
    const sk = glb.json.skins[0].joints;
    const set = new Set(sk);
    const dot = (cx, cy, c) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = Math.round(cx) + dx, y = Math.round(cy) + dy; if (x >= 0 && y >= 0 && x < W && y < H) { const i = (y * W + x) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; } } };
    for (const j of sk) {
      const par = fk.parent[j];
      if (par < 0 || !set.has(par)) continue;
      const a = pr(fk.pos[par]), b = pr(fk.pos[j]);
      for (let t = 0; t <= 1; t += 0.01) dot(ox + (a[0] + (b[0] - a[0]) * t) * scale, oy - (a[1] + (b[1] - a[1]) * t) * scale, [255, 0, 255]);
    }
  }
  return opts.raw ? { img, W, H } : png(W, H, img);
}

if (process.argv[1]?.endsWith("raster.mjs") && process.argv[3]) {
  const [glb, out, clip, t, view, px] = process.argv.slice(2);
  writeFileSync(out, rasterise(readGlb(glb), clip, Number(t ?? 0), view ?? "side", Number(px ?? 700)));
}
