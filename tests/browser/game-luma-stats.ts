/**
 * GL_META v2 and GL_PAIR pixel statistics for tests/browser/game-luma-capture.spec.ts (GU47 lane E-I, WP-9).
 *
 * `glMetaInPage` and `glPairInPage` run INSIDE the page: Playwright serialises a page function with
 * Function.prototype.toString and calls it with one argument, so each one is self-contained (no imports, no module
 * constants, no closures over this file). The optional second parameter `decode` exists only for the unit tests
 * (tests/unit/gu47/ei/game-luma-stats.test.ts), which feed RGBA pixels without a browser; in the page it is undefined
 * and the PNG screenshot is decoded with createImageBitmap on a 2D canvas, which also encodes the logged JPEG.
 *
 * GL_META v1 fields (mean, p5, p50, p95, darkFrac, clipFrac, grid) are computed exactly as the 4.6 spec computed them
 * (rounded Rec.709 luma of the sRGB values, the same histogram percentiles and 3x3 cell split), so
 * evidence/audit-fix/e5/decode-luma.mjs and compare-luma.mjs read v2 rows unchanged. v2 adds, per frame, per cell and
 * per named crop: luma stddev, p1/p99, mean RGB, chroma-weighted circular mean HSV hue (`hue`, null on a grey region)
 * with its concentration `hueR` (0..1), mean chroma (0..255) and mean HSV saturation (0..1), the variance of the
 * 4-neighbour Laplacian of luma (`lap`, a sharpness measure) and the edge density (`edge`, the fraction of pixels with a
 * Laplacian magnitude >= 32). The frame and each crop also carry a 32-bin luma histogram (`hist`, fractions) and a
 * 12-bin chroma-weighted hue histogram (`hueHist`, bins centred on 0, 30, ..., 330 deg). Decoder:
 * tools/look-metrics/region-luma.mjs.
 *
 * Crop contract (games): publish `window.__AURA_QA__ = { crops }`, or a `crops` extra on the game's QA hook
 * (`installQaHooks("<name>", { extras: { crops } })`, read from `window.__AURA_<NAME>__.crops`). `crops` is an array, or
 * a function returning one, of `{ name, x, y, w, h }`: `name` matches /^[a-z0-9][a-z0-9_-]{0,31}$/ and the rect is
 * normalised 0..1 to the game's main canvas (the largest canvas on the page), origin top-left. It is read right after
 * every screenshot, so a function can project a moving subject's box. At most 16 crops; hooks win over a target's static
 * `crops` on a name clash; problems are reported in `cropErrors`, never thrown.
 */

/** A named crop rect, normalised 0..1 to the game's main canvas, origin top-left. */
export interface GameLumaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Statistics of one region (the frame, a 3x3 cell or a crop). Luma values are 0..255. */
export interface LumaRegionStats {
  readonly mean: number;
  readonly std: number;
  readonly p1: number;
  readonly p5: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly darkFrac: number;
  readonly clipFrac: number;
  readonly rgb: readonly [number, number, number];
  readonly hue: number | null;
  readonly hueR: number;
  readonly chroma: number;
  readonly sat: number;
  readonly lap: number;
  readonly edge: number;
}

export interface LumaHistograms {
  /** 32 luma bins of 8 levels each, as fractions of the region's pixels. */
  readonly hist: readonly number[];
  /** 12 chroma-weighted hue bins centred on 0, 30, ..., 330 deg (fractions); null when the region has no chroma. */
  readonly hueHist: readonly number[] | null;
}

/** A crop resolved to screenshot pixels. */
export interface LumaPixelRect {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** `target`, `__AURA_QA__` or the `__AURA_<NAME>__` hook the crop came from. */
  readonly from: string;
}

export type LumaCropStats = LumaRegionStats & LumaHistograms & LumaPixelRect;

/** The GL_META v1 fields, in their original order. */
export interface GlMetaV1 {
  readonly mean: number;
  readonly p5: number;
  readonly p50: number;
  readonly p95: number;
  readonly darkFrac: number;
  readonly clipFrac: number;
  readonly grid: readonly number[];
}

/** Fields GL_META v2 appends after `info`. */
export interface GlMetaV2 extends LumaHistograms {
  readonly gl: 2;
  readonly w: number;
  readonly h: number;
  /** The main canvas in screenshot pixels (crops are relative to it). */
  readonly canvas: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Black or single-colour frame: discard it (lessons V1 and V8; often an LFS pointer stub behind RENDERER_MOUNT_FAILED). */
  readonly blank: boolean;
  readonly std: number;
  readonly p1: number;
  readonly p99: number;
  readonly rgb: readonly [number, number, number];
  readonly hue: number | null;
  readonly hueR: number;
  readonly chroma: number;
  readonly sat: number;
  readonly lap: number;
  readonly edge: number;
  /** The 3x3 cells, row-major (0 top-left, 8 bottom-right), same split as `grid`. */
  readonly cells: readonly LumaRegionStats[];
  readonly crops: Readonly<Record<string, LumaCropStats>>;
  readonly cropErrors?: readonly string[];
}

export interface DecodedFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
  /** Base64 JPEG (no data-URL prefix) of the same pixels. */
  readonly jpeg?: (quality: number) => string;
}

export type FrameDecoder = (pngBase64: string) => Promise<DecodedFrame>;

export interface GlMetaInput {
  /** Base64 PNG screenshot of the viewport. */
  readonly png: string;
  /** The target's static crops (hook crops win on a name clash). */
  readonly crops?: readonly GameLumaCrop[];
  readonly jpegQuality?: number;
}

export interface GlMetaResult {
  readonly v1: GlMetaV1;
  readonly v2: GlMetaV2;
  /** Crops resolved to pixels; pass them to glPairInPage so a pair compares the same regions. */
  readonly rects: readonly LumaPixelRect[];
  readonly jpeg: string;
}

export interface PairDiffStats {
  /** Mean |dY| (luma levels). */
  readonly meanAbsY: number;
  /** Mean of |dR|, |dG|, |dB| / 3. */
  readonly meanAbsRGB: number;
  /** Fraction of pixels with |dY| >= 8. */
  readonly changedFrac: number;
  /** Mean SSIM of luma over 8x8 blocks inside the region; null when the region holds no whole block. */
  readonly ssim: number | null;
}

export interface GlPairDiff extends PairDiffStats {
  readonly maxAbsY: number;
  readonly cells: readonly PairDiffStats[];
  readonly crops: Readonly<Record<string, PairDiffStats>>;
}

export interface GlPairInput {
  /** First and second base64 PNG screenshots. */
  readonly a: string;
  readonly b: string;
  /** Crop rects from the first shot's glMetaInPage result. */
  readonly rects: readonly LumaPixelRect[];
  readonly jpegQuality?: number;
}

export interface GlPairResult {
  readonly diff: GlPairDiff;
  /** JPEG of the second shot. */
  readonly jpeg: string;
}

/** GL_META v1 and v2 statistics of one PNG screenshot, plus the crops resolved to pixels and the JPEG of the frame. */
export async function glMetaInPage(input: GlMetaInput, decode?: FrameDecoder): Promise<GlMetaResult> {
  const fromPng: FrameDecoder = decode ?? (async (b64: string): Promise<DecodedFrame> => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      jpeg: (q: number) => canvas.toDataURL("image/jpeg", q).slice("data:image/jpeg;base64,".length)
    };
  });
  const frame = await fromPng(input.png);
  const W = frame.width;
  const H = frame.height;
  const N = W * H;
  const d = frame.data;
  const fix = (v: number, k: number): number => +v.toFixed(k);
  const Y = new Uint8Array(N);
  for (let p = 0, i = 0; p < N; p++, i += 4) Y[p] = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
  // Hue vectors from a 0.1-degree table (error <= 0.05 deg, cheaper than two trig calls per pixel).
  const COS = new Float64Array(3600);
  const SIN = new Float64Array(3600);
  for (let k = 0; k < 3600; k++) { COS[k] = Math.cos((k * Math.PI) / 1800); SIN[k] = Math.sin((k * Math.PI) / 1800); }

  interface Acc { n: number; sum: number; sum2: number; dark: number; clip: number; r: number; g: number; b: number; vx: number; vy: number; c: number; s: number; ln: number; l: number; l2: number; edges: number; hist: Uint32Array; hue: Float64Array }
  const empty = (): Acc => ({ n: 0, sum: 0, sum2: 0, dark: 0, clip: 0, r: 0, g: 0, b: 0, vx: 0, vy: 0, c: 0, s: 0, ln: 0, l: 0, l2: 0, edges: 0, hist: new Uint32Array(256), hue: new Float64Array(12) });
  const accumulate = (x0: number, y0: number, x1: number, y1: number): Acc => {
    const a = empty();
    for (let y = y0; y < y1; y++) {
      for (let x = x0, p = y * W + x0; x < x1; x++, p++) {
        const i = p * 4;
        const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!, yy = Y[p]!;
        a.hist[yy]!++; a.n++; a.sum += yy; a.sum2 += yy * yy;
        if (yy <= 8) a.dark++;
        if (yy >= 250) a.clip++;
        a.r += r; a.g += g; a.b += b;
        const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
        const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
        const c = mx - mn;
        if (c > 0) {
          let h = mx === r ? (g - b) / c : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
          if (h < 0) h += 6;
          const deg = h * 60;
          const k = Math.round(deg * 10) % 3600;
          a.vx += c * COS[k]!; a.vy += c * SIN[k]!; a.c += c; a.s += c / mx;
          a.hue[Math.floor(((deg + 15) % 360) / 30)]! += c;
        }
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
          const l = 4 * yy - Y[p - 1]! - Y[p + 1]! - Y[p - W]! - Y[p + W]!;
          a.ln++; a.l += l; a.l2 += l * l;
          if (l >= 32 || l <= -32) a.edges++;
        }
      }
    }
    return a;
  };
  const merge = (list: readonly Acc[]): Acc => {
    const m = empty();
    for (const a of list) {
      m.n += a.n; m.sum += a.sum; m.sum2 += a.sum2; m.dark += a.dark; m.clip += a.clip; m.r += a.r; m.g += a.g; m.b += a.b;
      m.vx += a.vx; m.vy += a.vy; m.c += a.c; m.s += a.s; m.ln += a.ln; m.l += a.l; m.l2 += a.l2; m.edges += a.edges;
      for (let v = 0; v < 256; v++) m.hist[v]! += a.hist[v]!;
      for (let k = 0; k < 12; k++) m.hue[k]! += a.hue[k]!;
    }
    return m;
  };
  const pct = (a: Acc, q: number): number => { let acc = 0; for (let v = 0; v < 256; v++) { acc += a.hist[v]!; if (acc >= q * a.n) return v; } return 255; };
  const finish = (a: Acc): LumaRegionStats => {
    const n = Math.max(1, a.n);
    const mean = a.sum / n;
    const mag = Math.hypot(a.vx, a.vy);
    const lapMean = a.ln ? a.l / a.ln : 0;
    return {
      mean: fix(mean, 2), std: fix(Math.sqrt(Math.max(0, a.sum2 / n - mean * mean)), 2),
      p1: pct(a, 0.01), p5: pct(a, 0.05), p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99),
      darkFrac: fix(a.dark / n, 4), clipFrac: fix(a.clip / n, 4),
      rgb: [fix(a.r / n, 1), fix(a.g / n, 1), fix(a.b / n, 1)],
      hue: a.c > 0 && mag > 1e-9 ? fix(((Math.atan2(a.vy, a.vx) * 180) / Math.PI + 360) % 360, 1) : null,
      hueR: a.c > 0 ? fix(mag / a.c, 3) : 0, chroma: fix(a.c / n, 1), sat: fix(a.s / n, 3),
      lap: a.ln ? fix(Math.max(0, a.l2 / a.ln - lapMean * lapMean), 1) : 0, edge: a.ln ? fix(a.edges / a.ln, 4) : 0
    };
  };
  const histograms = (a: Acc): LumaHistograms => {
    const n = Math.max(1, a.n);
    const hist: number[] = [];
    for (let k = 0; k < 32; k++) { let s = 0; for (let v = k * 8; v < k * 8 + 8; v++) s += a.hist[v]!; hist.push(fix(s / n, 4)); }
    return { hist, hueHist: a.c > 0 ? Array.from(a.hue, (v) => fix(v / a.c, 3)) : null };
  };

  // 3x3 cells: pixel x belongs to column min(2, floor(3x / W)), exactly as the v1 grid.
  const xs = [0, Math.ceil(W / 3), Math.ceil((2 * W) / 3), W];
  const ys = [0, Math.ceil(H / 3), Math.ceil((2 * H) / 3), H];
  const cellAcc: Acc[] = [];
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) cellAcc.push(accumulate(xs[gx]!, ys[gy]!, xs[gx + 1]!, ys[gy + 1]!));
  const whole = merge(cellAcc);
  const fs = finish(whole);

  // Crops: hooks first (__AURA_QA__, then every __AURA_<NAME>__ QA hook), then the target's static crops.
  const cropErrors: string[] = [];
  const wanted: { name: string; x: number; y: number; w: number; h: number; from: string }[] = [];
  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const take = (raw: unknown, from: string): void => {
    const c = raw as Partial<GameLumaCrop> | null;
    if (!c || typeof c !== "object") { cropErrors.push(`${from}: a crop is not an object`); return; }
    if (typeof c.name !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(c.name)) { cropErrors.push(`${from}: bad crop name ${JSON.stringify(c.name)}`); return; }
    if (wanted.some((w) => w.name === c.name)) return;
    if (![c.x, c.y, c.w, c.h].every((v) => typeof v === "number" && Number.isFinite(v))) { cropErrors.push(`${from}: crop ${c.name} needs finite x, y, w, h`); return; }
    if (wanted.length >= 16) { cropErrors.push(`${from}: crop ${c.name} dropped (at most 16 crops)`); return; }
    const x = clamp01(c.x!), y = clamp01(c.y!), x2 = clamp01(c.x! + c.w!), y2 = clamp01(c.y! + c.h!);
    if (x2 <= x || y2 <= y) { cropErrors.push(`${from}: crop ${c.name} is empty inside 0..1`); return; }
    wanted.push({ name: c.name, x, y, w: x2 - x, h: y2 - y, from });
  };
  const readHook = (holder: unknown, from: string): void => {
    try {
      if (!holder || (typeof holder !== "object" && typeof holder !== "function")) return;
      let list = (holder as { crops?: unknown }).crops;
      if (typeof list === "function") list = (list as () => unknown).call(holder);
      if (list === undefined || list === null) return;
      if (!Array.isArray(list)) { cropErrors.push(`${from}.crops is not an array`); return; }
      for (const c of list) take(c, from);
    } catch (error) {
      cropErrors.push(`${from}.crops threw: ${String(error).slice(0, 120)}`);
    }
  };
  const g = globalThis as unknown as Record<string, unknown>;
  readHook(g.__AURA_QA__, "__AURA_QA__");
  for (const key of Object.keys(g)) if (key !== "__AURA_QA__" && /^__AURA_[A-Z0-9_]+__$/.test(key)) readHook(g[key], key);
  for (const c of input.crops ?? []) take(c, "target");

  // The main canvas (largest canvas on the page) in screenshot pixels; the whole frame without a DOM.
  let cx = 0, cy = 0, cw = W, ch = H;
  if (typeof document !== "undefined" && typeof innerWidth === "number" && innerWidth > 0 && innerHeight > 0) {
    let best: DOMRect | null = null;
    let area = 0;
    for (const el of Array.from(document.querySelectorAll("canvas"))) {
      const r = el.getBoundingClientRect();
      const a = Math.max(0, r.width) * Math.max(0, r.height);
      if (a > area) { area = a; best = r; }
    }
    if (best) {
      const sx = W / innerWidth, sy = H / innerHeight;
      const left = Math.max(0, Math.round(best.left * sx)), top = Math.max(0, Math.round(best.top * sy));
      const right = Math.min(W, Math.round(best.right * sx)), bottom = Math.min(H, Math.round(best.bottom * sy));
      if (right - left >= 1 && bottom - top >= 1) { cx = left; cy = top; cw = right - left; ch = bottom - top; }
    }
  }
  const rects: LumaPixelRect[] = [];
  const crops: Record<string, LumaCropStats> = {};
  for (const c of wanted) {
    const x0 = Math.min(W - 1, cx + Math.round(c.x * cw)), y0 = Math.min(H - 1, cy + Math.round(c.y * ch));
    const x1 = Math.min(W, Math.max(x0 + 1, cx + Math.round((c.x + c.w) * cw))), y1 = Math.min(H, Math.max(y0 + 1, cy + Math.round((c.y + c.h) * ch)));
    const rect = { name: c.name, x: x0, y: y0, w: x1 - x0, h: y1 - y0, from: c.from };
    rects.push(rect);
    const acc = accumulate(x0, y0, x1, y1);
    crops[c.name] = { ...rect, ...finish(acc), ...histograms(acc) };
  }

  const v1: GlMetaV1 = {
    mean: fs.mean, p5: fs.p5, p50: fs.p50, p95: fs.p95, darkFrac: fs.darkFrac, clipFrac: fs.clipFrac,
    grid: cellAcc.map((a) => +(a.sum / Math.max(1, a.n)).toFixed(1))
  };
  const v2: GlMetaV2 = {
    gl: 2, w: W, h: H, canvas: { x: cx, y: cy, w: cw, h: ch }, blank: fs.p95 <= 8 || fs.p95 - fs.p5 <= 1,
    std: fs.std, p1: fs.p1, p99: fs.p99, rgb: fs.rgb, hue: fs.hue, hueR: fs.hueR, chroma: fs.chroma, sat: fs.sat, lap: fs.lap, edge: fs.edge,
    ...histograms(whole),
    cells: cellAcc.map(finish), crops,
    ...(cropErrors.length ? { cropErrors } : {})
  };
  return { v1, v2, rects, jpeg: frame.jpeg ? frame.jpeg(input.jpegQuality ?? 0.7) : "" };
}

/** GL_PAIR: the difference between two screenshots of the same target, per frame, 3x3 cell and crop. */
export async function glPairInPage(input: GlPairInput, decode?: FrameDecoder): Promise<GlPairResult> {
  const fromPng: FrameDecoder = decode ?? (async (b64: string): Promise<DecodedFrame> => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      jpeg: (q: number) => canvas.toDataURL("image/jpeg", q).slice("data:image/jpeg;base64,".length)
    };
  });
  const A = await fromPng(input.a);
  const B = await fromPng(input.b);
  if (A.width !== B.width || A.height !== B.height) throw new Error(`GL_PAIR shots differ in size (${A.width}x${A.height} vs ${B.width}x${B.height})`);
  const W = A.width, H = A.height, N = W * H;
  const a = A.data, b = B.data;
  const fix = (v: number, k: number): number => +v.toFixed(k);
  const YA = new Uint8Array(N), YB = new Uint8Array(N);
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    YA[p] = Math.round(0.2126 * a[i]! + 0.7152 * a[i + 1]! + 0.0722 * a[i + 2]!);
    YB[p] = Math.round(0.2126 * b[i]! + 0.7152 * b[i + 1]! + 0.0722 * b[i + 2]!);
  }
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let maxAbsY = 0;
  const region = (x0: number, y0: number, x1: number, y1: number): PairDiffStats => {
    let n = 0, sy = 0, srgb = 0, changed = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0, p = y * W + x0; x < x1; x++, p++) {
        const dy = Math.abs(YA[p]! - YB[p]!);
        const i = p * 4;
        n++; sy += dy;
        if (dy >= 8) changed++;
        if (dy > maxAbsY) maxAbsY = dy;
        srgb += (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!)) / 3;
      }
    }
    let ssum = 0, blocks = 0;
    for (let by = y0; by + 8 <= y1; by += 8) {
      for (let bx = x0; bx + 8 <= x1; bx += 8) {
        let ma = 0, mb = 0, va = 0, vb = 0, cov = 0;
        for (let y = by; y < by + 8; y++) {
          for (let x = bx, q = y * W + bx; x < bx + 8; x++, q++) {
            const pa = YA[q]!, pb = YB[q]!;
            ma += pa; mb += pb; va += pa * pa; vb += pb * pb; cov += pa * pb;
          }
        }
        ma /= 64; mb /= 64; va = va / 64 - ma * ma; vb = vb / 64 - mb * mb; cov = cov / 64 - ma * mb;
        ssum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
        blocks++;
      }
    }
    const m = Math.max(1, n);
    return { meanAbsY: fix(sy / m, 3), meanAbsRGB: fix(srgb / m, 3), changedFrac: fix(changed / m, 4), ssim: blocks ? fix(ssum / blocks, 4) : null };
  };
  const xs = [0, Math.ceil(W / 3), Math.ceil((2 * W) / 3), W];
  const ys = [0, Math.ceil(H / 3), Math.ceil((2 * H) / 3), H];
  const frame = region(0, 0, W, H);
  const frameMax = maxAbsY;
  const cells: PairDiffStats[] = [];
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) cells.push(region(xs[gx]!, ys[gy]!, xs[gx + 1]!, ys[gy + 1]!));
  const crops: Record<string, PairDiffStats> = {};
  for (const r of input.rects) {
    const x0 = Math.max(0, Math.min(W - 1, r.x)), y0 = Math.max(0, Math.min(H - 1, r.y));
    crops[r.name] = region(x0, y0, Math.min(W, Math.max(x0 + 1, r.x + r.w)), Math.min(H, Math.max(y0 + 1, r.y + r.h)));
  }
  return { diff: { ...frame, maxAbsY: frameMax, cells, crops }, jpeg: B.jpeg ? B.jpeg(input.jpegQuality ?? 0.7) : "" };
}
