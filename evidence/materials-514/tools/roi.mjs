// usage: node roi.mjs <png> x0,y0,x1,y1 [x0,y0,x1,y1 ...]  -> per-box luma stddev and mean abs difference from the box's surrounding ring
import fs from "node:fs"; import zlib from "node:zlib";
function dec(p) { const b = fs.readFileSync(p); let o = 8, w, h, ct, idat = []; while (o < b.length) { const l = b.readUInt32BE(o), t = b.toString("ascii", o + 4, o + 8); if (t === "IHDR") { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12); ct = b[o + 17]; } if (t === "IDAT") idat.push(b.subarray(o + 8, o + 8 + l)); o += 12 + l; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = ct === 6 ? 4 : 3, st = w * bpp; const px = Buffer.alloc(h * st); let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], line = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), cur = px.subarray(y * st, (y + 1) * st);
    for (let x = 0; x < st; x++) { const a = x >= bpp ? cur[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } cur[x] = v & 255; } prev = cur; }
  return { w, h, bpp, px }; }
const img = dec(process.argv[2]);
const luma = (x, y) => { const i = (y * img.w + x) * img.bpp; return 0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2]; };
for (const spec of process.argv.slice(3)) {
  const [x0, y0, x1, y1] = spec.split(",").map(Number);
  let n = 0, s = 0, s2 = 0, rn = 0, rs = 0; const pad = 14;
  for (let y = y0 - pad; y < y1 + pad; y++) for (let x = x0 - pad; x < x1 + pad; x++) {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue; const l = luma(x, y);
    if (x >= x0 && x < x1 && y >= y0 && y < y1) { n++; s += l; s2 += l * l; } else { rn++; rs += l; } }
  const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean)), ring = rs / rn;
  console.log(JSON.stringify({ box: spec, lumaStdDev: +sd.toFixed(1), boxMean: +mean.toFixed(1), ringMean: +ring.toFixed(1), meanContrastToSurround: +Math.abs(mean - ring).toFixed(1) }));
}
