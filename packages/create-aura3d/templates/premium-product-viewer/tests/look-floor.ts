/**
 * PRD-13 T3.12/T3.13 — the shared template look floor.
 *
 * Every create-aura3d template's `tests/screenshot.spec.ts` calls
 * `assertTemplateLookFloor(page, ...)` after readiness: the same five checks
 * everywhere (PRD §6.5/T3.12):
 *
 *   1. non-blank — sampled WebGL pixels are lit and varied (not a uniform
 *      clear/void frame);
 *   2. `diagnostics().look.lint` carries no `severity === "error"` finding
 *      (empty when A3D_QR_LOOKS is off — the check never silently skips);
 *   3. `appliedLook.environment.specularIntensity > 0` — an environment map
 *      actually reached the frame;
 *   4. `appliedLook.shadows.strength >= 0.8` when the look declares a shadow
 *      caster (a null ShadowReport means the renderer produced no shadow
 *      evidence — recorded, not failed);
 *   5. `appliedLook.pixelRatio >= min(devicePixelRatio, tierCap)` — the
 *      renderer used the display density up to the tier cap (2).
 *
 * …plus the optional §T3.12 subject check: the lit-pixel bounding box of the
 * canvas' central region must sit within `tolerance` of the expected subject
 * bounds (default ±10% of frame).
 *
 * Templates that mount through `createAuraApp` surface `appliedLook`/`look`
 * via the global `__AURA3D_LIVE_APPS__` registry — no per-template wiring.
 * `skipAppDiagnostics` covers the bespoke-renderer template (animation-studio),
 * which reports its stage environment through its own readiness evidence.
 */

import { expect, type Page } from "@playwright/test";

/** Normalized canvas-space bounds the lit subject mass is expected to occupy. */
export interface LookFloorSubjectBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LookFloorOptions {
  /** Expected subject bounds in normalized canvas units. Omit to skip. */
  readonly subject?: LookFloorSubjectBounds;
  /** Fractional tolerance on each bound axis. Default 0.1 (±10%). */
  readonly tolerance?: number;
  /** Template has no `__AURA3D_LIVE_APPS__` app (bespoke renderer). */
  readonly skipAppDiagnostics?: boolean;
}

export interface LookFloorReport {
  readonly sampledPixels: number;
  readonly brightPixels: number;
  readonly uniqueBuckets: number;
  readonly subjectBounds: LookFloorSubjectBounds | null;
  readonly appliedLook: {
    readonly specularIntensity: number;
    readonly shadowStrength: number | null;
    readonly pixelRatio: number;
    readonly renderPath: string;
    readonly background: string | null;
  } | null;
  readonly lookLintErrors: readonly string[];
  readonly devicePixelRatio: number;
}

const MIN_BRIGHT_FRACTION = 0.02;
const MIN_UNIQUE_BUCKETS = 8;

export async function assertTemplateLookFloor(page: Page, options: LookFloorOptions = {}): Promise<LookFloorReport> {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();

  /*
   * Deterministic frame before profiling: pause every live app, rewind its
   * runtime clock and step a fixed 45 frames at 1/60 — through `stepAsync`,
   * not the synchronous registry `settle()`. The production renderer mounts
   * asynchronously, so a sync step loop renders nothing while the mount is in
   * flight and never yields for it to finish (the failure mode on software-GL
   * runners: blank frames, `environment.intensity` still NaN in diagnostics).
   * Awaiting each step also lets pending environment/IBL/asset promises resolve
   * between frames, and one final dt=0 step re-renders the same simulated
   * instant once that work has applied.
   */
  const report = await page.evaluate(async (): Promise<LookFloorReport> => {
    interface LiveApp {
      pause?: () => void;
      resetRuntimeClock?: () => void;
      step?: (dt?: number) => void;
      stepAsync?: (dt?: number) => Promise<unknown>;
      diagnostics?: () => Record<string, unknown>;
    }
    const empty = (code: string): LookFloorReport => ({
      sampledPixels: 0,
      brightPixels: 0,
      uniqueBuckets: 0,
      subjectBounds: null,
      appliedLook: null,
      lookLintErrors: [code],
      devicePixelRatio: globalThis.devicePixelRatio ?? 1
    });
    const registry = (globalThis as { __AURA3D_LIVE_APPS__?: { all?: () => readonly LiveApp[] } }).__AURA3D_LIVE_APPS__;
    const apps = [...(registry?.all?.() ?? [])];
    const stepApp = async (app: LiveApp, dt: number): Promise<void> => {
      if (app.stepAsync) {
        try {
          await Promise.race([
            app.stepAsync(dt),
            new Promise((resolvePromise) => setTimeout(resolvePromise, 30_000))
          ]);
          return;
        } catch {
          // synchronous step fallback below
        }
      }
      app.step?.(dt);
    };
    /*
     * Wall-clock bound on the settle loop: on software-GL CI runners a single
     * stepped render of a heavy scene costs several seconds, so an unbounded
     * 45-step loop outlives the test budget and fails with a bare timeout and
     * no report. Cap the stepping and always take the dt=0 settle frame — a
     * partially settled scene still yields a readable floor report.
     */
    const STEP_WALLCLOCK_BUDGET_MS = 420_000;
    const settleStartedAt = Date.now();
    for (const app of apps) {
      app.pause?.();
      app.resetRuntimeClock?.();
      for (let index = 0; index < 45; index += 1) {
        if (Date.now() - settleStartedAt > STEP_WALLCLOCK_BUDGET_MS) break;
        await stepApp(app, 1 / 60);
      }
      await stepApp(app, 0);
    }
    /*
     * Renderers outside the liveApps registry (bespoke renderers, e.g.
     * animation-studio's A3DRenderer) cannot be stepped. Two animation
     * frames guarantee at least one full app render finished inside this
     * evaluate task, so the readPixels below sees a real presented frame
     * instead of a compositor-cleared buffer.
     */
    if (apps.length === 0) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }

    const diagnostics = apps[0]?.diagnostics?.() as
      | { appliedLook?: { environment?: { specularIntensity?: number; background?: string }; shadows?: { strength?: number | null } | null; pixelRatio?: number; renderPath?: string }; look?: { lint?: readonly { severity?: string; code?: string }[] } }
      | undefined;
    const appliedLook = diagnostics?.appliedLook
      ? {
          specularIntensity: diagnostics.appliedLook.environment?.specularIntensity ?? 0,
          shadowStrength: diagnostics.appliedLook.shadows?.strength ?? null,
          pixelRatio: diagnostics.appliedLook.pixelRatio ?? 0,
          renderPath: diagnostics.appliedLook.renderPath ?? "unknown",
          background: diagnostics.appliedLook.environment?.background ?? null
        }
      : null;
    const lookLintErrors = (diagnostics?.look?.lint ?? [])
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code ?? "unknown");
    const devicePixelRatio = globalThis.devicePixelRatio ?? 1;

    /*
     * The app's WebGL context is not preserveDrawingBuffer, so readPixels must
     * run in the same task as the stepped render, before compositing clears the
     * drawing buffer. That also removes the composited element screenshot that
     * software-GL runners could not produce inside a test timeout.
     */
    const target = [...document.querySelectorAll("canvas")]
      .map((element) => ({
        element,
        gl: (element.getContext("webgl2") ?? element.getContext("webgl")) as WebGL2RenderingContext | WebGLRenderingContext | null
      }))
      .find((entry) => entry.gl !== null);
    if (!target?.gl) return { ...empty("no-webgl-context"), appliedLook, lookLintErrors };
    const gl = target.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (width === 0 || height === 0) return { ...empty("empty-drawing-buffer"), appliedLook, lookLintErrors };
    // readPixels reads the currently bound framebuffer: renderers that end a
    // frame with an offscreen target bound (shadow/post FBOs — e.g.
    // animation-studio's bespoke renderer) would return that target's pixels
    // instead of the canvas backbuffer. Rebind the default framebuffer first;
    // every renderer rebinds its own targets at the start of its next frame.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const BRIGHT_LUMA = 48;
    const stride = 4; // pixels — 16×16 sample grid
    let sampled = 0;
    let bright = 0;
    const buckets = new Set<number>();
    // Central-region lit-pixel bbox: edges carry floor/backdrop, the subject
    // mass is what every §6.4 template frames mid-frame.
    const x0 = Math.floor(width * 0.1);
    const x1 = Math.floor(width * 0.9);
    const y0 = Math.floor(height * 0.1);
    const y1 = Math.floor(height * 0.9);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const offset = (y * width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        sampled += 1;
        buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma > BRIGHT_LUMA) {
          bright += 1;
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
    }
    // readPixels rows run bottom-up; report `y` in the same top-down
    // convention the composited-screenshot path produced so stored
    // expectations stay comparable across the switch.
    const subjectBounds = Number.isFinite(minX)
      ? { x: minX / width, y: 1 - maxY / height, width: (maxX - minX) / width, height: (maxY - minY) / height }
      : null;

    return {
      sampledPixels: sampled,
      brightPixels: bright,
      uniqueBuckets: buckets.size,
      subjectBounds,
      appliedLook,
      lookLintErrors,
      devicePixelRatio
    };
  });

  // 1. Non-blank.
  expect(report.brightPixels / Math.max(1, report.sampledPixels)).toBeGreaterThan(MIN_BRIGHT_FRACTION);
  expect(report.uniqueBuckets).toBeGreaterThan(MIN_UNIQUE_BUCKETS);

  if (!options.skipAppDiagnostics) {
    // 2–5. Renderer/look evidence via __AURA3D_LIVE_APPS__.
    expect(report.appliedLook, "appliedLook diagnostics missing — is the app mounted via createAuraApp?").not.toBeNull();
    expect(report.lookLintErrors).toEqual([]);
      expect(report.appliedLook!.specularIntensity).toBeGreaterThan(0);
    if (report.appliedLook!.shadowStrength !== null) {
      expect(report.appliedLook!.shadowStrength!).toBeGreaterThanOrEqual(0.8);
    }
    expect(report.appliedLook!.pixelRatio).toBeGreaterThanOrEqual(Math.min(report.devicePixelRatio, 2));
  }

  // 6. Subject bounds ±10%.
  if (options.subject) {
    const tolerance = options.tolerance ?? 0.1;
    const measured = `measured ${JSON.stringify(report.subjectBounds)}`;
    expect(report.subjectBounds, "no lit subject mass in the central frame").not.toBeNull();
    expect(Math.abs(report.subjectBounds!.x - options.subject.x), measured).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(report.subjectBounds!.y - options.subject.y), measured).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(report.subjectBounds!.width - options.subject.width), measured).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(report.subjectBounds!.height - options.subject.height), measured).toBeLessThanOrEqual(tolerance);
  }

  return report;
}
