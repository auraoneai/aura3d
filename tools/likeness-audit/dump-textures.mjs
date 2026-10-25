#!/usr/bin/env node
// Dumps the base-colour (and emissive) texture of every GLB under the given roots onto labelled contact sheets so a
// reviewer can look for photographic faces, lettering and brand marks. Usage:
//   node tools/likeness-audit/dump-textures.mjs <out-dir> <root> [<root>...]
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [, , outDir, ...roots] = process.argv;
if (!outDir || roots.length === 0) { console.error("usage: dump-textures.mjs <out-dir> <root>..."); process.exit(2); }
mkdirSync(outDir, { recursive: true });

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".glb")) yield p;
  }
}

const files = roots.flatMap((r) => [...walk(r)]).sort();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Fallback for GLBs gltf-transform cannot open (webp, spec-gloss, external images): read the JSON chunk and pull images directly.
function manualImages(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const out = [];
  const used = new Set();
  for (const m of json.materials ?? []) {
    const t = m.pbrMetallicRoughness?.baseColorTexture ?? m.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseTexture;
    if (t) used.add(t.index);
  }
  for (const ti of used) {
    const tex = json.textures?.[ti];
    const src = tex?.source ?? tex?.extensions?.EXT_texture_webp?.source;
    const im = json.images?.[src];
    if (!im) continue;
    if (im.bufferView !== undefined) {
      const bv = json.bufferViews[im.bufferView];
      out.push({ label: im.name ?? `img${src}`, data: buf.subarray(binStart + (bv.byteOffset ?? 0), binStart + (bv.byteOffset ?? 0) + bv.byteLength) });
    } else if (im.uri?.startsWith("data:")) {
      out.push({ label: im.name ?? `img${src}`, data: Buffer.from(im.uri.split(",")[1], "base64") });
    }
  }
  return out;
}
const CELL = 192, COLS = 6, ROWS = 5, LABEL = 28;
const cells = [];
const report = [];

for (const f of files) {
  const buf = readFileSync(f);
  if (buf.length < 1000 || buf.subarray(0, 4).toString() !== "glTF") { report.push({ file: f, note: "not a GLB (LFS pointer?)" }); continue; }
  let doc;
  try { doc = await io.readBinary(new Uint8Array(buf)); } catch (e) {
    const rec = { file: f, bytes: buf.length, textures: [], note: `fallback parser (${e.message.slice(0, 60)})` };
    let k = 0;
    for (const im of manualImages(buf)) {
      try {
        const meta = await sharp(im.data).metadata();
        rec.textures.push({ material: im.label, w: meta.width, h: meta.height, format: meta.format });
        const png = await sharp(im.data).resize(CELL, CELL - LABEL, { fit: "contain", background: "#222" }).flatten({ background: "#222" }).png().toBuffer();
        cells.push({ png, label: `${path.basename(f).replace(/\.glb$/, "").slice(0, 26)}${k ? "#" + k : ""}` });
        k += 1;
        if (k >= 3) break;
      } catch (e2) { rec.textures.push({ material: im.label, note: `decode failed: ${e2.message}` }); }
    }
    report.push(rec);
    continue;
  }
  const tex = new Map();
  for (const m of doc.getRoot().listMaterials()) {
    const t = m.getBaseColorTexture();
    if (t && !tex.has(t)) tex.set(t, `${m.getName()}`);
  }
  const rec = { file: f, bytes: buf.length, textures: [] };
  let i = 0;
  for (const [t, label] of tex) {
    const img = t.getImage();
    if (!img) continue;
    try {
      const meta = await sharp(Buffer.from(img)).metadata();
      rec.textures.push({ material: label, w: meta.width, h: meta.height, format: meta.format });
      const png = await sharp(Buffer.from(img)).resize(CELL, CELL - LABEL, { fit: "contain", background: "#222" }).flatten({ background: "#222" }).png().toBuffer();
      cells.push({ png, label: `${path.basename(f).replace(/\.glb$/, "").slice(0, 26)}${i ? "#" + i : ""}` });
      i += 1;
      if (i >= 3) break;
    } catch (e) { rec.textures.push({ material: label, note: `decode failed: ${e.message}` }); }
  }
  if (rec.textures.length === 0) rec.note = "no base-colour texture (flat colours)";
  report.push(rec);
}

const per = COLS * ROWS;
for (let s = 0; s * per < cells.length; s += 1) {
  const slice = cells.slice(s * per, (s + 1) * per);
  const rows = Math.ceil(slice.length / COLS);
  const comps = [];
  for (let k = 0; k < slice.length; k += 1) {
    const x = (k % COLS) * CELL, y = Math.floor(k / COLS) * CELL;
    comps.push({ input: slice[k].png, left: x, top: y + LABEL });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#000"/><text x="4" y="19" font-size="13" fill="#fff" font-family="monospace">${slice[k].label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`;
    comps.push({ input: Buffer.from(svg), left: x, top: y });
  }
  await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: "#111" } })
    .composite(comps).png().toFile(path.join(outDir, `sheet-${String(s + 1).padStart(2, "0")}.png`));
}
writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`${files.length} GLBs, ${cells.length} textures, ${Math.ceil(cells.length / per)} sheets -> ${outDir}`);
