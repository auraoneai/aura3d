#!/usr/bin/env node
/*
 * Builds review contact sheets from a game-play-probe output directory.
 *
 * Reading one PNG per game would make a 17-game visual review cost 170+ looks.
 * A per-game sheet shows every capture step of one route at once, and the
 * cross-game sheet shows one hero frame per route so the whole set can be
 * judged as a set (the quality floor matters more than the best route).
 *
 *   node tools/showcase-library/game-contact-sheets.mjs \
 *     --in tests/reports/game-play-probe/current --out tests/reports/game-contact-sheets/current
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const inDir = resolve(repoRoot, arg("--in", "tests/reports/game-play-probe/full"));
const outDir = resolve(repoRoot, arg("--out", "tests/reports/game-contact-sheets/default"));
const tileWidth = Number(arg("--tile", "560"));
const hero = arg("--hero", "02-gameplay.png");

mkdirSync(outDir, { recursive: true });

function montage(files, out, title, cols) {
  if (!files.length) return null;
  // ImageMagick on this machine has no usable font, so `-label` aborts the whole
  // sheet. PIL's built-in bitmap font always renders, and keeping the whole
  // composition in one tool also lets the tiles be downscaled to a size that is
  // cheap to open repeatedly during review.
  const rows = Math.ceil(files.length / cols);
  const labelH = 22;
  const tw = tileWidth;
  const th = Math.round((tw * 9) / 16);
  const { img, draw, font } = pythonDraw(out, files, title, cols, rows, tw, th, labelH);
  void img; void draw; void font;
  return out;
}

function pythonDraw(out, files, title, cols, rows, tw, th, labelH) {
  const script = join(repoRoot, "tools/showcase-library/game-contact-sheets.py");
  execFileSync("python3", [script, "--out", out, "--title", title, "--cols", String(cols),
    "--rows", String(rows), "--tw", String(tw), "--th", String(th), "--labelh", String(labelH),
    ...files], { stdio: "inherit" });
  return {};
}

const routeDirs = readdirSync(inDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => !n.startsWith("$"))
  .sort();

const index = [];
for (const route of routeDirs) {
  const dir = join(inDir, route);
  const shots = readdirSync(dir).filter((f) => /^\d.*\.png$/.test(f)).sort();
  if (!shots.length) continue;
  const abs = shots.map((f) => join(dir, f));
  const cols = shots.length > 4 ? 4 : 2;
  const out = join(outDir, `${route}.sheet.png`);
  montage(abs, out, `${route} - ${shots.length} captures`, cols);
  const heroFile = abs.find((f) => basename(f) === hero) ?? abs[0];
  index.push({ route, hero: heroFile, shots: shots.length, sheet: out });
}

const grid = join(outDir, "ALL-ROUTES.png");
montage(index.map((i) => i.hero), grid, `cross-game review - ${index.length} routes - hero frame each`, 3);

const manifest = {
  generatedAt: new Date().toISOString(),
  source: inDir.replace(`${repoRoot}/`, ""),
  routes: index.map((i) => ({ ...i, sheet: i.sheet.replace(`${repoRoot}/`, ""), hero: i.hero.replace(`${repoRoot}/`, "") })),
  crossGameSheet: grid.replace(`${repoRoot}/`, ""),
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
if (!existsSync(grid)) manifest.crossGameSheet = null;
console.log(`contact sheets -> ${outDir} (${index.length} routes)`);
