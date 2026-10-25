// Removes real brand marks from the base-colour textures of specific GLBs and writes `<key>Clean.<sha8>.glb`.
// Usage: node tools/likeness-audit/clean-textures.mjs <recipe> (waymo | corvette | cybercab | formula | tsukuba | turbo-tsukuba)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ASSETS = "public/aura-assets";

async function decode(tex) {
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}
async function encode(px, mime) {
  const img = sharp(Buffer.from(px.data), { raw: { width: px.w, height: px.h, channels: 4 } });
  if (mime === "image/webp") return img.webp({ quality: 92 }).toBuffer();
  if (mime === "image/jpeg") return img.jpeg({ quality: 92 }).toBuffer();
  return img.png({ compressionLevel: 9 }).toBuffer();
}

// Normalised-convolution inpaint: replaces masked pixels with the box-blurred average of unmasked neighbours.
function inpaint(px, mask, radius, passes = 2) {
  const { data, w, h } = px;
  for (let pass = 0; pass < passes; pass++) {
    const wgt = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) wgt[i] = mask[i] ? 0 : 1;
    const chans = [0, 1, 2].map((c) => {
      const f = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) f[i] = data[i * 4 + c] * wgt[i];
      return f;
    });
    const blurs = chans.map((f) => boxBlur(f, w, h, radius));
    const bw = boxBlur(wgt, w, h, radius);
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      if (bw[i] < 1e-4) continue;
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(blurs[c][i] / bw[i])));
      mask[i] = 0;
    }
    // pixels with no unmasked neighbour in range stay masked for the next pass with the same radius
    if (!mask.some((m) => m)) break;
  }
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  const norm = (2 * r + 1) * (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / norm;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}
function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w) out[yy * w + xx] = 1;
    }
  }
  return out;
}
function median(vals) {
  const a = Array.from(vals).sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

// Paint detected dark/light "ink" inside a search window (coordinates are in a 1024-wide frame) with the surrounding body colour.
function eraseInk(px, windows, threshold = 18) {
  const S = px.w / 1024;
  const report = [];
  for (const [x0, y0, x1, y1] of windows) {
    const L = Math.round(x0 * S), T = Math.round(y0 * S), R = Math.round(x1 * S), B = Math.round(y1 * S);
    const rs = [], gs = [], bs = [];
    for (let y = T; y < B; y++) for (let x = L; x < R; x++) { const i = (y * px.w + x) * 4; rs.push(px.data[i]); gs.push(px.data[i + 1]); bs.push(px.data[i + 2]); }
    const bg = [median(rs), median(gs), median(bs)];
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let y = T; y < B; y++) for (let x = L; x < R; x++) {
      const i = (y * px.w + x) * 4;
      const d = Math.max(Math.abs(px.data[i] - bg[0]), Math.abs(px.data[i + 1] - bg[1]), Math.abs(px.data[i + 2] - bg[2]));
      if (d > threshold) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    if (maxX < 0) { report.push({ window: [x0, y0, x1, y1], found: false }); continue; }
    const pad = Math.round(2 * S);
    for (let y = Math.max(T, minY - pad); y <= Math.min(B - 1, maxY + pad); y++) for (let x = Math.max(L, minX - pad); x <= Math.min(R - 1, maxX + pad); x++) {
      const i = (y * px.w + x) * 4;
      px.data[i] = bg[0]; px.data[i + 1] = bg[1]; px.data[i + 2] = bg[2];
    }
    report.push({ window: [x0, y0, x1, y1], found: true, bbox: [minX, minY, maxX, maxY], bg });
  }
  return report;
}

async function blurMedian(tex, sigma, med) {
  const input = Buffer.from(tex.getImage());
  let img = sharp(input).blur(sigma);
  if (med) img = img.median(med);
  const mime = tex.getMimeType();
  const out = mime === "image/webp" ? await img.webp({ quality: 90 }).toBuffer() : mime === "image/jpeg" ? await img.jpeg({ quality: 90 }).toBuffer() : await img.png().toBuffer();
  tex.setImage(new Uint8Array(out));
}

const RECIPES = {
  waymo: {
    src: "teleopWaymoHero.6d2a9bfb.glb",
    out: "teleopWaymoClean",
    async run(doc) {
      const tex = doc.getRoot().listTextures().find((t) => /albedo/.test(t.getName()));
      const px = await decode(tex);
      const report = eraseInk(px, [
        [405, 178, 470, 198], // WAYMO, near side
        [166, 462, 236, 483], // WAYMO, far side
        [806, 544, 850, 563], // Jaguar leaper
        [798, 563, 853, 571], // JAGUAR, tailgate
        [712, 575, 750, 587], // I-PACE
        [900, 576, 946, 589], // WAYMO, tailgate
        [796, 203, 852, 214], // JAGUAR, front edge
        [817, 447, 837, 463], // roof pod mark, rear view
      ]);
      console.log(JSON.stringify(report));
      tex.setImage(new Uint8Array(await encode(px, tex.getMimeType())));
    },
  },
  corvette: {
    src: "teleopCorvette.e7009c34.glb",
    out: "teleopCorvetteClean",
    async run(doc) { await blurMedian(doc.getRoot().listTextures().find((t) => t.getName() === "albedo"), 4, 9); },
  },
  cybercab: {
    src: "teleopCybercab.08358a58.glb",
    out: "teleopCybercabClean",
    async run(doc) { await blurMedian(doc.getRoot().listTextures().find((t) => t.getName() === "albedo"), 4, 9); },
  },
  formula: {
    src: "showcaseCcByFormulaOpponent.5dba5c01.glb",
    out: "showcaseCcByFormulaOpponentClean",
    async run(doc) {
      const texs = doc.getRoot().listTextures();
      // livery: keep the base blue and the black panel, drop every decal
      const liv = texs[0];
      const px = await decode(liv);
      const base = [px.data[(5 * px.w + 5) * 4], px.data[(5 * px.w + 5) * 4 + 1], px.data[(5 * px.w + 5) * 4 + 2]];
      const S = px.w / 1024;
      const keep = [390 * S, 765 * S, 614 * S, 888 * S];
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
        if (x >= keep[0] && x < keep[2] && y >= keep[1] && y < keep[3]) continue;
        const i = (y * px.w + x) * 4;
        px.data[i] = base[0]; px.data[i + 1] = base[1]; px.data[i + 2] = base[2];
      }
      liv.setImage(new Uint8Array(await encode(px, liv.getMimeType())));
      // tyre sidewall: red lettering and ring to black
      const side = texs[2];
      const sp = await decode(side);
      for (let i = 0; i < sp.w * sp.h; i++) {
        const r = sp.data[i * 4], g = sp.data[i * 4 + 1], b = sp.data[i * 4 + 2];
        if (r > 120 && r > g * 1.8 && r > b * 1.8) { sp.data[i * 4] = 14; sp.data[i * 4 + 1] = 14; sp.data[i * 4 + 2] = 14; }
      }
      side.setImage(new Uint8Array(await encode(sp, side.getMimeType())));
    },
  },
};

for (const key of ["tsukuba", "turbo-tsukuba"]) {
  RECIPES[key] = {
    src: key === "tsukuba" ? "showcaseTsukubaCircuit.8c139a57.glb" : "turboTsukubaVisualTrack.ab53a493.glb",
    out: key === "tsukuba" ? "showcaseTsukubaCircuitClean" : "turboTsukubaVisualTrackClean",
    async run(doc) {
      const texs = doc.getRoot().listTextures();
      for (const idx of [0, 2, 3, 5, 9, 17]) {
        const t = texs[idx];
        const px = await decode(t);
        let mask = new Uint8Array(px.w * px.h);
        for (let i = 0; i < px.w * px.h; i++) {
          const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2];
          if (b > r + 22 && b > g + 18) mask[i] = 1; // logo violet-blue
        }
        mask = dilate(mask, px.w, px.h, 2);
        inpaint(px, mask, Math.max(4, Math.round(px.w / 64)), 3);
        t.setImage(new Uint8Array(await encode(px, t.getMimeType())));
      }
      // Dunlop arch: smear it beyond legibility
      await blurMedian(texs[6], 9, 0);
    },
  };
}

const ROOFTOP = [
  ["rooftopAthleteDefender", "rooftopAthleteDefender.c0947539.glb"],
  ["rooftopAthleteShooter", "rooftopAthleteShooter.49b62313.glb"],
  ["rooftopDefender", "rooftopDefender.6c43f9e1.glb"],
  ["rooftopDefenderV2", "rooftopDefenderV2.65bc306f.glb"],
  ["rooftopLayupScorer", "rooftopLayupScorer.03a093f2.glb"],
  ["rooftopShooterV2", "rooftopShooterV2.602fe28f.glb"],
  ["rooftopDefenderMeshy", "rooftopDefenderMeshy.c53681c7.glb"],
  ["rooftopShooterMeshyV1", "rooftopShooterMeshyV1.ed5a33b3.glb"]
];
if (process.argv[2] === "rooftop") {
  // Photographic face scans and marked jerseys: smear every base-colour texture beyond recognition.
  const io0 = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const map = {};
  for (const [key, src] of ROOFTOP) {
    const d = await io0.read(`${ASSETS}/${src}`);
    const bases = new Set();
    for (const m of d.getRoot().listMaterials()) { const t = m.getBaseColorTexture(); if (t) bases.add(t); }
    for (const t of bases) await blurMedian(t, 10, 7);
    const bytes0 = await io0.writeBinary(d);
    const sha0 = createHash("sha256").update(bytes0).digest("hex");
    const file0 = `${key}Clean.${sha0.slice(0, 8)}.glb`;
    writeFileSync(`${ASSETS}/${file0}`, bytes0);
    map[key] = file0;
    console.log(JSON.stringify({ key, file: file0, textures: bases.size, sizeBytes: bytes0.length, from: src }));
  }
  console.log("MAP " + JSON.stringify(map));
  process.exit(0);
}
const name = process.argv[2];
const recipe = RECIPES[name];
if (!recipe) { console.error("unknown recipe", name, Object.keys(RECIPES)); process.exit(2); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(`${ASSETS}/${recipe.src}`);
await recipe.run(doc);
const bytes = await io.writeBinary(doc);
const sha = createHash("sha256").update(bytes).digest("hex");
const file = `${ASSETS}/${recipe.out}.${sha.slice(0, 8)}.glb`;
writeFileSync(file, bytes);
console.log(JSON.stringify({ recipe: name, file, sha256: `sha256-${sha}`, sizeBytes: bytes.length, from: recipe.src }));
