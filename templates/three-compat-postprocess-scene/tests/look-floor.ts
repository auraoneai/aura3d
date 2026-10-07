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
  } | null;
  readonly lookLintErrors: readonly string[];
  readonly devicePixelRatio: number;
}

const MIN_BRIGHT_FRACTION = 0.02;
const MIN_UNIQUE_BUCKETS = 8;

export async function assertTemplateLookFloor(page: Page, options: LookFloorOptions = {}): Promise<LookFloorReport> {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();

  // Deterministic frame before profiling: pause live apps and step a fixed
  // number of frames (the registry's settle path exists exactly for this —
  // profiling a free-running animation makes every bound drift run to run).
  await page.evaluate(() =>
    (globalThis as { __AURA3D_LIVE_APPS__?: { settle?: (steps?: number, dt?: number) => number } }).__AURA3D_LIVE_APPS__?.settle?.(45, 1 / 60)
  );

  // The element screenshot carries browser-composited pixels; the app's WebGL
  // context is not preserveDrawingBuffer, so a post-composite gl.readPixels
  // reads a cleared buffer. Profiling the composited frame keeps the same
  // assertions without depending on context attributes.
  // Software-GL runners present frames slowly (seconds each); the element
  // screenshot forces another composited frame, so give the capture real headroom
  // rather than the ~30 s action default.
  const png = await canvas.screenshot({ timeout: 180_000 });

  const report = await page.evaluate(async (dataUrl): Promise<LookFloorReport> => {
    const BRIGHT_LUMA = 48;
    const img = new Image();
    await new Promise<void>((resolvePromise, rejectPromise) => {
      img.onload = () => resolvePromise();
      img.onerror = () => rejectPromise(new Error("look-floor screenshot decode failed"));
      img.src = dataUrl;
    });
    const decode = document.createElement("canvas");
    decode.width = img.naturalWidth;
    decode.height = img.naturalHeight;
    const ctx = decode.getContext("2d");
    if (!ctx) {
      return {
        sampledPixels: 0,
        brightPixels: 0,
        uniqueBuckets: 0,
        subjectBounds: null,
        appliedLook: null,
        lookLintErrors: ["no-2d-context"],
        devicePixelRatio: globalThis.devicePixelRatio ?? 1
      };
    }
    ctx.drawImage(img, 0, 0);

    const width = decode.width;
    const height = decode.height;
    const pixels = ctx.getImageData(0, 0, width, height).data;

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
    const subjectBounds = Number.isFinite(minX)
      ? { x: minX / width, y: minY / height, width: (maxX - minX) / width, height: (maxY - minY) / height }
      : null;

    const liveApps = (globalThis as { __AURA3D_LIVE_APPS__?: { all(): readonly { diagnostics?(): Record<string, unknown> }[] } }).__AURA3D_LIVE_APPS__;
    const diagnostics = liveApps?.all?.()[0]?.diagnostics?.() as
      | { appliedLook?: { environment?: { specularIntensity?: number }; shadows?: { strength?: number | null } | null; pixelRatio?: number; renderPath?: string }; look?: { lint?: readonly { severity?: string; code?: string }[] } }
      | undefined;
    const appliedLook = diagnostics?.appliedLook
      ? {
          specularIntensity: diagnostics.appliedLook.environment?.specularIntensity ?? 0,
          shadowStrength: diagnostics.appliedLook.shadows?.strength ?? null,
          pixelRatio: diagnostics.appliedLook.pixelRatio ?? 0,
          renderPath: diagnostics.appliedLook.renderPath ?? "unknown"
        }
      : null;
    const lookLintErrors = (diagnostics?.look?.lint ?? [])
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code ?? "unknown");

    return {
      sampledPixels: sampled,
      brightPixels: bright,
      uniqueBuckets: buckets.size,
      subjectBounds,
      appliedLook,
      lookLintErrors,
      devicePixelRatio: globalThis.devicePixelRatio ?? 1
    };
  }, `data:image/png;base64,${png.toString("base64")}`);

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
