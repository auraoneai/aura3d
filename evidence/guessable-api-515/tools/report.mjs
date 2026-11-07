// Per-game verdict + mean absolute difference table. usage (from frames/games): node ../../tools/report.mjs <game> ...
// noise = base vs base2 (same origin/main build captured twice); base-branch = origin/main vs lane/515-guessable-api.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const games = process.argv.slice(2);
const raw = async (p) => sharp(p).extract({ left: 0, top: 0, width: 1280, height: 640 }).removeAlpha().raw().toBuffer();
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return +(s / a.length).toFixed(4); };
const rows = [];
for (const g of games) {
  const v = {};
  for (const t of ["base", "base2", "branch"]) { const f = `verdicts.${t}.${g}.json`; if (fs.existsSync(f)) v[t] = JSON.parse(fs.readFileSync(f)).slice(-1)[0]; }
  const [a, b, c] = await Promise.all(["base", "base2", "branch"].map((t) => raw(`${g}.${t}.png`).catch(() => null)));
  rows.push({ game: g, colours: [v.base?.colours, v.base2?.colours, v.branch?.colours], canvasReady: [v.base?.readyDetected, v.base2?.readyDetected, v.branch?.readyDetected], meanLuma: [v.base?.mean, v.base2?.mean, v.branch?.mean], noiseBaseVsBase2: a && b ? mad(a, b) : null, baseVsBranch: a && c ? mad(a, c) : null });
}
console.log(JSON.stringify(rows));
