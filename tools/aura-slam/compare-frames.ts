// Compare native Aura Slam frames (from the integration run) with the live-game reference frames, side by side.
//   tsx tools/aura-slam/compare-frames.ts <nativeDir> <outDir>
// Pairs are by game state (see PAIRS); the native frames are taken at comparable but not identical simulation steps,
// so the numbers are indicative (G3 proper needs matched ticks: aura-slam-render.spec.ts).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { frameDistance, imageStats } from "../crayon-capture/heatsink-judge-lib";

const [nativeDir, outDir] = process.argv.slice(2) as [string, string];
mkdirSync(outDir, { recursive: true });
const REF = "evidence/aura-slam/frames-reference";
const PAIRS: Array<[string, string, string]> = [
  ["menu-1280", "menu__1280x720", "menu"],
  ["serve-1280", "serve-ready__1280x720", "serve"],
  ["rally-1280", "rally-near-net__1280x720", "rally"],
  ["point-1280", "point-won__1280x720", "point won"],
  ["results-1280", "match-over__1280x720", "match over"],
  ["serve-390", "rally-near-net__mobile-390x844", "mobile"]
];

async function rgba(file: string, width?: number, height?: number) {
  let img = sharp(file).removeAlpha().ensureAlpha();
  if (width && height) img = img.resize(width, height, { fit: "fill" });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

const rows: Array<Record<string, unknown>> = [];
const tiles: Buffer[] = [];
for (const [native, ref, label] of PAIRS) {
  const nativeFile = path.join(nativeDir, `${native}.jpg`);
  const refFile = path.join(REF, `${ref}.jpg`);
  if (!existsSync(nativeFile) || !existsSync(refFile)) { rows.push({ label, native, ref, missing: true }); continue; }
  const a = await rgba(refFile);
  const b = await rgba(nativeFile, a.width, a.height);
  const d = frameDistance(imageStats(a), imageStats(b));
  rows.push({ label, native, ref, width: a.width, height: a.height, lumaJsd: +d.lumaJsd.toFixed(4), rgbJsd: +d.rgbJsd.toFixed(4), paletteDistance: +d.paletteDistance.toFixed(4), edgeRatio: +d.edgeDensityRatio.toFixed(3), lumaMeanDelta: +d.lumaMeanDelta.toFixed(2) });
  const w = 640;
  const h = Math.round((a.height / a.width) * w);
  const left = await sharp(refFile).resize(w, h).jpeg({ quality: 82 }).toBuffer();
  const right = await sharp(nativeFile).resize(w, h).jpeg({ quality: 82 }).toBuffer();
  tiles.push(await sharp({ create: { width: w * 2 + 12, height: h, channels: 3, background: "#111" } }).composite([{ input: left, left: 0, top: 0 }, { input: right, left: w + 12, top: 0 }]).jpeg({ quality: 82 }).toBuffer());
}
if (tiles.length) {
  const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()));
  const height = metas.reduce((s, m) => s + (m.height ?? 0) + 12, 0);
  let top = 0;
  const composite = tiles.map((input, i) => { const c = { input, left: 0, top }; top += (metas[i]!.height ?? 0) + 12; return c; });
  await sharp({ create: { width: metas[0]!.width!, height, channels: 3, background: "#111" } }).composite(composite).jpeg({ quality: 82 }).toFile(path.join(outDir, "play-through-vs-live-sheet.jpg"));
}
writeFileSync(path.join(outDir, "play-through-vs-live-metrics.json"), JSON.stringify({ note: "left = live game reference, right = native build; native frames at comparable, not identical, simulation steps", rows }, null, 1) + "\n");
console.log(JSON.stringify(rows, null, 1));
