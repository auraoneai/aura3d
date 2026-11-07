// usage: node diff.mjs a.png b.png  -> mean abs diff (0..255 per channel), max diff, luma/non-black stats of A
import fs from "node:fs"; import zlib from "node:zlib";
function dec(p) { const b = fs.readFileSync(p); let o = 8, w, h, ct, idat = []; while (o < b.length) { const l = b.readUInt32BE(o), t = b.toString("ascii", o + 4, o + 8); if (t === "IHDR") { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12); ct = b[o + 17]; } if (t === "IDAT") idat.push(b.subarray(o + 8, o + 8 + l)); o += 12 + l; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = ct === 6 ? 4 : 3, st = w * bpp; const px = Buffer.alloc(h * st); let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], line = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), cur = px.subarray(y * st, (y + 1) * st);
    for (let x = 0; x < st; x++) { const a = x >= bpp ? cur[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } cur[x] = v & 255; } prev = cur; }
  return { w, h, bpp, px }; }
const A = dec(process.argv[2]), B = dec(process.argv[3]);
if (A.w !== B.w || A.h !== B.h) { console.log("SIZE MISMATCH"); process.exit(1); }
let sum = 0, n = 0, max = 0, lum = 0, nonblack = 0;
for (let i = 0; i < A.w * A.h; i++) for (let c = 0; c < 3; c++) { const d = Math.abs(A.px[i * A.bpp + c] - B.px[i * B.bpp + c]); sum += d; n++; if (d > max) max = d; }
for (let i = 0; i < A.w * A.h; i++) { const l = (A.px[i * A.bpp] + A.px[i * A.bpp + 1] + A.px[i * A.bpp + 2]) / 3; lum += l; if (l > 8) nonblack++; }
console.log(JSON.stringify({ meanAbsDiff: +(sum / n).toFixed(4), maxDiff: max, meanLumaA: +(lum / (A.w * A.h)).toFixed(1), nonBlackFracA: +(nonblack / (A.w * A.h)).toFixed(3) }));
