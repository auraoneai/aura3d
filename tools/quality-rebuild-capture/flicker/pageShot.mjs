/*
 * Composited-page metrics for the flicker probe: decodes a Playwright PNG screenshot (8-bit,
 * non-interlaced, RGB/RGBA as Chromium emits) and returns mean luma, clipped fraction and mean
 * absolute difference vs the previous page frame on a 4-px subsample grid. Unlike the canvas
 * readback this includes DOM overlays (HUD, DOM flash/vignette fallbacks).
 */
import { inflateSync } from "node:zlib";

export function decodeLumaGrid(buffer, step = 4) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8; let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; let interlace = 0;
  const idat = [];
  while (off < buffer.length) {
    const len = buffer.readUInt32BE(off); const type = buffer.toString("ascii", off + 4, off + 8);
    const data = buffer.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (bitDepth !== 8 || !channels || interlace !== 0) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const cur = Buffer.alloc(stride); const prev = Buffer.alloc(stride);
  const gw = Math.ceil(width / step); const gh = Math.ceil(height / step);
  const luma = new Float32Array(gw * gh);
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1); const filter = raw[base];
    for (let x = 0; x < stride; x++) {
      const v = raw[base + 1 + x];
      const a = x >= channels ? cur[x - channels] : 0; const b = prev[x]; const c = x >= channels ? prev[x - channels] : 0;
      let r;
      switch (filter) {
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: r = v;
      }
      cur[x] = r & 0xff;
    }
    if (y % step === 0) {
      const row = (y / step) * gw;
      for (let gx = 0; gx < gw; gx++) {
        const i = gx * step * channels;
        luma[row + gx] = 0.2126 * cur[i] + 0.7152 * cur[i + 1] + 0.0722 * cur[i + 2];
      }
    }
    cur.copy(prev);
  }
  return { width, height, luma };
}

export function pageStats(grid, prevGrid) {
  const l = grid.luma; const n = l.length;
  let sum = 0; let clip = 0; let diff = 0;
  const comparable = prevGrid && prevGrid.luma.length === n;
  for (let i = 0; i < n; i++) {
    sum += l[i];
    if (l[i] >= 250) clip++;
    if (comparable) diff += Math.abs(l[i] - prevGrid.luma[i]);
  }
  return { pageLuma: +(sum / n).toFixed(3), pageClip: +(clip / n).toFixed(5), pageMad: comparable ? +(diff / n).toFixed(4) : null };
}
