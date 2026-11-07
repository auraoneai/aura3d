// Mean absolute per-channel difference (0..255) between two PNGs, top 1280x640 only (the headless window chrome below
// is black in every capture). usage: node diff.mjs <a.png> <b.png> [more pairs ...]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
async function raw(p) { const { data, info } = await sharp(p).extract({ left: 0, top: 0, width: 1280, height: 640 }).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, info }; }
const args = process.argv.slice(2);
const out = [];
for (let i = 0; i + 1 < args.length; i += 2) {
  const [a, b] = [await raw(args[i]), await raw(args[i + 1])];
  let sum = 0, max = 0, changed = 0;
  for (let k = 0; k < a.data.length; k++) { const d = Math.abs(a.data[k] - b.data[k]); sum += d; if (d > max) max = d; if (d > 8) changed++; }
  out.push({ a: args[i], b: args[i + 1], meanAbsDiff: +(sum / a.data.length).toFixed(4), maxChannelDiff: max, pixelsOver8: +(changed / (a.data.length / 3) * 100).toFixed(3) + "%" });
}
console.log(JSON.stringify(out, null, 1));
