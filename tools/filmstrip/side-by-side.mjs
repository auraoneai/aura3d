#!/usr/bin/env node
/**
 * tools/filmstrip/side-by-side.mjs — pair each user reference screenshot with
 * the after filmstrip (12 evenly spaced frames) into one comparison contact
 * sheet per game, plus a webm/mp4 from the frames when available.
 *
 * Usage: node tools/filmstrip/side-by-side.mjs --films <afterDir> --out <outDir>
 *   afterDir contains <game>/film-NN.png (+ film.mp4) from capture-films.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const arg = (n, f) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : f; };
const FILMS = path.resolve(arg("films", ".local-evidence/user-feedback-2026-10-20/after"));
const OUT = path.resolve(arg("out", path.join(FILMS, "side-by-side")));

const REF = {
  hoops: ["01-hoops-not-dribbling.png", "Aura Hoops 3D"],
  diamond: ["02-diamond-not-carrying-bat.png", "Aura Diamond 3D"],
  fc: ["03-fc-uniforms-a.png", "Aura FC 3D (kits)"],
  links: ["05-links-weak-swing-unrealistic-golfer.png", "Aura Links 3D"],
  siege: ["06-siege-no-pull-back.png", "Slingshot Siege"]
};
const REF_DIR = path.resolve(FILMS, "..");
const LABEL_H = 46;
const PAD = 10;

async function compose(game) {
  const gameDir = path.join(FILMS, game);
  if (!fs.existsSync(gameDir)) { console.log(`skip ${game}: no films`); return; }
  const frames = fs.readdirSync(gameDir).filter((f) => /^film-\d+\.png$/.test(f)).sort();
  if (frames.length < 12) { console.log(`skip ${game}: only ${frames.length} frames`); return; }
  const ref = REF[game];
  const refPath = ref ? path.join(REF_DIR, ref[0]) : null;
  const hasRef = refPath && fs.existsSync(refPath);

  const picks = Array.from({ length: 12 }, (_, i) => frames[Math.round((i * (frames.length - 1)) / 11)]);
  const THUMB_W = 470;
  const thumb = async (p) => sharp(p).resize({ width: THUMB_W }).png().toBuffer({ resolveWithObject: true });

  const refImg = hasRef ? await sharp(refPath).resize({ width: THUMB_W }).png().toBuffer({ resolveWithObject: true }) : null;
  const frameImgs = [];
  for (const p of picks) frameImgs.push(await thumb(path.join(gameDir, p)));
  const rowH = Math.max(...frameImgs.map((f) => f.info.height), refImg?.info.height ?? 0);

  const cols = hasRef ? 1 + 4 : 4; // ref + 12 frames in a 4-col grid (3 rows)
  const rows = Math.ceil((frameImgs.length + (hasRef ? 1 : 0)) / cols);
  const W = cols * (THUMB_W + PAD) + PAD;
  const H = rows * (rowH + PAD + LABEL_H) + PAD + LABEL_H + 40;

  const composites = [];
  const svgText = (text, x, y, w, size = 22, fill = "#111") => ({
    input: Buffer.from(`<svg width="${w}" height="${size + 8}"><rect width="100%" height="100%" fill="white"/><text x="6" y="${size}" font-family="Helvetica" font-size="${size}" fill="${fill}">${text}</text></svg>`),
    left: x, top: y
  });
  composites.push(svgText(`${ref ? ref[1] : game} — BEFORE (user screenshot) | AFTER: ${frames.length}-frame real-time filmstrip, live page, normal speed`, PAD, PAD, W - 2 * PAD, 26));
  let idx = 0;
  const slots = cols * rows;
  for (let s = 0; s < slots; s++) {
    const col = s % cols, row = Math.floor(s / cols);
    const x = PAD + col * (THUMB_W + PAD);
    const y = PAD + LABEL_H + 40 + row * (rowH + PAD + LABEL_H);
    if (hasRef && s === 0) {
      composites.push({ input: refImg.data, left: x, top: y + LABEL_H });
      composites.push(svgText("BEFORE (user)", x, y, THUMB_W, 20, "#b00"));
    } else {
      const fi = idx++;
      if (fi >= frameImgs.length) continue;
      composites.push({ input: frameImgs[fi].data, left: x, top: y + LABEL_H });
      composites.push(svgText(`AFTER ${String(fi + 1).padStart(2, "0")}/12`, x, y, THUMB_W, 20, "#060"));
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const outPath = path.join(OUT, `${game}-before-after.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite(composites).png().toFile(outPath);
  const mp4 = path.join(gameDir, "film.mp4");
  if (fs.existsSync(mp4)) fs.copyFileSync(mp4, path.join(OUT, `${game}-after.mp4`));
  console.log("wrote", outPath);
}

for (const game of Object.keys(REF)) await compose(game);
for (const game of ["ironcrown", "fc-kick"]) {
  // fc also has a second reference (04) — compose fc films again labeled for kick physics
  if (game === "fc-kick" && fs.existsSync(path.join(FILMS, "fc"))) {
    REF[game] = ["04-fc-uniforms-b-kick-physics.png", "Aura FC 3D (kick physics)"];
  }
  await compose(game);
}
