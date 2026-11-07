// usage: node diff.mjs a.png b.png  -> {"meanAbsDiff":..,"lumA":..,"lumB":..}  (0-255 scale, RGB mean)
import sharp from "sharp";
const load = async (p) => { const { data, info } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, info }; };
const [a, b] = await Promise.all([load(process.argv[2]), load(process.argv[3])]);
if (a.data.length !== b.data.length) { console.log(JSON.stringify({ error: "size mismatch" })); process.exit(1); }
let d = 0, la = 0, lb = 0;
for (let i = 0; i < a.data.length; i++) { d += Math.abs(a.data[i] - b.data[i]); la += a.data[i]; lb += b.data[i]; }
const n = a.data.length;
console.log(JSON.stringify({ meanAbsDiff: +(d / n).toFixed(4), lumA: +(la / n).toFixed(2), lumB: +(lb / n).toFixed(2) }));
