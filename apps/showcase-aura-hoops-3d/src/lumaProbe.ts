/**
 * Frame-luminance probe (`?qaLuma=1`, measurement only): every rendered frame the canvas is drawn into a 48x27 2D
 * canvas and its mean Rec.709 luma (0-255) is recorded. A frame-to-frame jump at or above `spikeAt` logs one
 * `[hoops-luma]` console line with the game context of the frames around it, so a white flash on a camera swing can be
 * traced to its cause (trail, lightning, burst, flash overlay, camera cut). The pure series maths is unit tested.
 */

/** Mean Rec.709 luma (0-255) of RGBA pixels. */
export function meanLuma(rgba: ArrayLike<number>): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

export interface LumaJumpStats {
  readonly frames: number;
  /** Largest |mean(i) - mean(i-1)|. */
  readonly maxJump: number;
  /** Largest upward jump that comes back down within `flashFrames` (a flash, not a lasting change such as a cut to a brighter court). */
  readonly maxFlash: number;
  readonly flashes: number;
}

/**
 * Frame-to-frame jump statistics of a mean-luma series. A flash is a rise of at least `flashAt` that falls back by at
 * least half of it within `flashFrames` frames (a <= 0.25 s white pop at 60 fps is <= 15 frames).
 */
export function lumaJumpStats(series: readonly number[], opts: { readonly flashAt?: number; readonly flashFrames?: number } = {}): LumaJumpStats {
  const flashAt = opts.flashAt ?? 8;
  const flashFrames = opts.flashFrames ?? 15;
  let maxJump = 0;
  let maxFlash = 0;
  let flashes = 0;
  for (let i = 1; i < series.length; i++) {
    const d = series[i]! - series[i - 1]!;
    maxJump = Math.max(maxJump, Math.abs(d));
    // a flash: the frame rises above the frame before it, then the series drops back within flashFrames
    let peak = series[i]!;
    const base = series[i - 1]!;
    for (let j = i; j < Math.min(series.length, i + flashFrames); j++) peak = Math.max(peak, series[j]!);
    const rise = peak - base;
    if (rise < 1) continue;
    let back = false;
    for (let j = i + 1; j < Math.min(series.length, i + flashFrames + 1); j++) {
      if (series[j]! <= base + rise / 2 && peak - series[j]! >= rise / 2) { back = true; break; }
    }
    if (!back) continue;
    if (rise > maxFlash) maxFlash = rise;
    if (rise >= flashAt && d > 0 && series[i]! >= base + flashAt / 2) flashes += 1;
  }
  return { frames: series.length, maxJump, maxFlash, flashes };
}

export interface LumaProbe {
  sample(context: () => Record<string, unknown>): void;
  stats(): LumaJumpStats & { readonly mean: number };
}

/** Browser probe over the canvas `getCanvas` returns (looked up per frame: the renderer may swap its canvas); `log` receives one line per spike (default console.log). */
export function createLumaProbe(getCanvas: () => HTMLCanvasElement | null, opts: { readonly spikeAt?: number; readonly shots?: number; readonly width?: number; readonly log?: (line: string) => void } = {}): LumaProbe {
  const spikeAt = opts.spikeAt ?? 6;
  const log = opts.log ?? ((line: string) => console.log(line));
  const W = opts.width ?? 256, H = Math.round(W * 9 / 16);
  // two W x H frames, ping-ponged, so a spike can dump the frame before it and the spike frame (`?qaLumaShots=N`)
  const frames = [document.createElement("canvas"), document.createElement("canvas")];
  for (const f of frames) { f.width = W; f.height = H; }
  const ctxs = frames.map((f) => f.getContext("2d", { willReadFrequently: true }));
  let cur = 0;
  let shotsLeft = opts.shots ?? 0;
  const series: number[] = [];
  const contexts: Record<string, unknown>[] = [];
  const t0 = performance.now();
  let failed = false;
  return {
    sample(context) {
      const canvas = getCanvas();
      cur ^= 1;
      const ctx = ctxs[cur];
      if (!ctx || !canvas || canvas.width === 0) return;
      try {
        ctx.drawImage(canvas, 0, 0, W, H);
        const m = meanLuma(ctx.getImageData(0, 0, W, H).data);
        const c = context();
        series.push(m);
        contexts.push(c);
        if (series.length > 7200) { series.shift(); contexts.shift(); }
        const n = series.length;
        if (n % 120 === 0) {
          const st = lumaJumpStats(series.slice(-120));
          log(`[hoops-luma-beat] ${JSON.stringify({ t: Number(((performance.now() - t0) / 1000).toFixed(2)), n, mean: Number(m.toFixed(1)), maxJump: Number(st.maxJump.toFixed(1)), maxFlash: Number(st.maxFlash.toFixed(1)), ph: c.ph, venue: c.venue })}`);
        }
        if (n >= 2 && Math.abs(series[n - 1]! - series[n - 2]!) >= spikeAt) {
          log(`[hoops-luma] ${JSON.stringify({ t: Number(((performance.now() - t0) / 1000).toFixed(2)), from: Number(series[n - 2]!.toFixed(1)), to: Number(series[n - 1]!.toFixed(1)), prev: contexts[n - 3] ?? null, at: contexts[n - 2], now: c })}`);
          if (shotsLeft > 0) {
            shotsLeft -= 1;
            log(`[hoops-luma-shot] ${JSON.stringify({ t: Number(((performance.now() - t0) / 1000).toFixed(2)), before: frames[cur ^ 1]!.toDataURL("image/jpeg", 0.8), spike: frames[cur]!.toDataURL("image/jpeg", 0.8) })}`);
          }
        }
      } catch (err) { if (!failed) { failed = true; log(`[hoops-luma] probe failed: ${String(err)}`); } }
    },
    stats() {
      const s = lumaJumpStats(series);
      return { ...s, mean: series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0 };
    }
  };
}
