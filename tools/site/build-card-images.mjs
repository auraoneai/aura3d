#!/usr/bin/env node
// Builds showcase card previews from the evidence frames named in docs/workflows/game-inventory.json.
// Output: public/previews/showcase-index/<slug>.webp (720x450) and <slug>@2x.webp (1440x900), each <= 200 KB.
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const inventory = JSON.parse(readFileSync(join(repoRoot, "docs", "workflows", "game-inventory.json"), "utf8"));
const outDir = join(repoRoot, "public", "previews", "showcase-index");
const MAX = 200 * 1024;
// marketing/public/previews shadows public/previews in the marketing build, so both must carry the same card files.
const marketingOutDir = join(repoRoot, "marketing", "public", "previews", "showcase-index");
mkdirSync(outDir, { recursive: true });
mkdirSync(marketingOutDir, { recursive: true });

async function write(source, width, height, file) {
  for (let quality = 82; quality >= 40; quality -= 6) {
    await sharp(source).resize(width, height, { fit: "cover", position: "centre" }).webp({ quality }).toFile(file);
    if (statSync(file).size <= MAX) return quality;
  }
  throw new Error(`${file} exceeds ${MAX} bytes even at quality 40`);
}

const rows = [];
for (const game of inventory.games.filter((g) => g.status === "live")) {
  if (!game.screens?.card) throw new Error(`${game.slug}: no card frame in ${game.evidenceFolder}`);
  const source = join(repoRoot, game.screens.dir, game.screens.card);
  const q1 = await write(source, 720, 450, join(outDir, `${game.slug}.webp`));
  const q2 = await write(source, 1440, 900, join(outDir, `${game.slug}@2x.webp`));
  for (const name of [`${game.slug}.webp`, `${game.slug}@2x.webp`]) copyFileSync(join(outDir, name), join(marketingOutDir, name));
  rows.push(`${game.slug.padEnd(30)} ${game.screens.set.padEnd(11)} 1x q${q1} ${(statSync(join(outDir, `${game.slug}.webp`)).size / 1024).toFixed(0)} KB  2x q${q2} ${(statSync(join(outDir, `${game.slug}@2x.webp`)).size / 1024).toFixed(0)} KB`);
}
console.log(rows.join("\n"));
