/**
 * First-contact program warm (real-GPU QA: a one-frame black outfield right after the first bat contact).
 *
 * Measured on Chrome/WebGPU (Apple Metal): the first contact of a session dropped the draw calls from ~311 to ~181 for one
 * frame while ~48 programs compiled (diagnostics().programs.compiled 98 -> 146), and the frame showed only the sky and the
 * ball trail; the first home run did the same for the grass and the clay (+16 programs, draw calls ~315 -> ~240, two
 * frames). The cause is the crack and home-run presets' transient flash light (art/vfx.ts `light` layers) plus the first
 * spark flipbook: a new point light changes every lit material's program, and the renderer skips a draw whose program is
 * still compiling. Later contacts reuse the compiled variants and never blank.
 *
 * The game therefore fires those effects once while it is still loading, behind a still of the last rendered frame, and
 * waits until the draw calls are back and the compiled-program count has stopped moving. The rule is pure so tests can
 * drive it.
 */

/** One frame's renderer counters while the warm runs. */
export interface ContactWarmSample {
  /** `app.diagnostics().drawCalls`. */
  readonly drawCalls: number;
  /** `app.diagnostics().programs.compiled`. */
  readonly compiled: number;
  /** Milliseconds since the warm effects fired. */
  readonly elapsedMs: number;
}

/**
 * minMs: the home-run flash light lives 0.5 s (art/vfx.ts), so its "one light" and "no light" variants are both drawn
 * before the cover lifts. maxMs: the cover never holds the boot longer than this. stableFrames: frames in a row with the
 * same compiled count and recovered draws. drawRecovery: share of the pre-warm draw calls that counts as recovered.
 */
export const CONTACT_WARM = { minMs: 700, maxMs: 2500, stableFrames: 3, drawRecovery: 0.9 } as const;

/** True once the warm may end: draws recovered and no program compiled for `stableFrames` frames, or the time cap hit. */
export function contactWarmSettled(baselineDrawCalls: number, samples: readonly ContactWarmSample[], rule: typeof CONTACT_WARM = CONTACT_WARM): boolean {
  const last = samples[samples.length - 1];
  if (!last) return false;
  if (last.elapsedMs >= rule.maxMs) return true;
  if (last.elapsedMs < rule.minMs || samples.length < rule.stableFrames) return false;
  const tail = samples.slice(-rule.stableFrames);
  const compiled = tail[0]!.compiled;
  return tail.every((s) => s.compiled === compiled && s.drawCalls >= baselineDrawCalls * rule.drawRecovery);
}

/** Minimal app surface the warm needs (`app.diagnostics`, `app.screenshotAsync`). */
export interface ContactWarmApp {
  diagnostics?(): { drawCalls?: unknown; programs?: { compiled?: unknown } } | undefined;
  screenshotAsync?(): Promise<{ dataUrl?: string } | undefined>;
}

function counters(app: ContactWarmApp): { drawCalls: number; compiled: number } {
  const d = app.diagnostics?.();
  return { drawCalls: Number(d?.drawCalls) || 0, compiled: Number(d?.programs?.compiled) || 0 };
}

/** The next rendered frame, or 100 ms when frames are not running (a hidden tab), so the warm never holds the boot. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Covers the canvas with a still of the current frame, runs `fire` (the effects to warm), and waits for
 * `contactWarmSettled`. Without a still (no screenshot API) the warm still runs; it is only ever called while loading.
 */
export async function warmContactPrograms(app: ContactWarmApp, fire: () => void, doc: Document = document): Promise<{ frames: number; ms: number; covered: boolean }> {
  // No renderer counters (headless stub, no GPU): nothing compiles, so nothing to warm.
  if (!(counters(app).drawCalls > 0)) return { frames: 0, ms: 0, covered: false };
  await nextFrame();
  let cover: HTMLImageElement | null = null;
  try {
    const shot = await app.screenshotAsync?.();
    if (shot?.dataUrl) {
      const img = doc.createElement("img");
      img.id = "diamond-warm-cover";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;object-fit:fill;pointer-events:none;z-index:1;";
      img.src = shot.dataUrl;
      await img.decode().catch(() => undefined);
      doc.body.appendChild(img);
      cover = img;
    }
  } catch {
    cover = null;
  }
  const baseline = counters(app).drawCalls;
  const started = performance.now();
  const samples: ContactWarmSample[] = [];
  try {
    fire();
    while (!contactWarmSettled(baseline, samples)) {
      await nextFrame();
      samples.push({ ...counters(app), elapsedMs: performance.now() - started });
    }
  } finally {
    cover?.remove();
  }
  return { frames: samples.length, ms: Math.round(performance.now() - started), covered: cover !== null };
}
