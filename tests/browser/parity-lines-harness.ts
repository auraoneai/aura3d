import {
  camera,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  helpers,
  lines,
  points,
  scene,
  sprites,
  type AuraApp
} from "@aura3d/engine";

/**
 * threejs-parity lane L6 browser fixture (docs/workflows/threejs-parity-gaps.md
 * §5.6, L6-01..L6-04 + the `parity-lines` acceptance fixture). Remote-only —
 * never run under local Playwright.
 *
 * Proves, against real GPU frames captured through `app.capture()` (C-05):
 *  1. `lines.fat({width})` keeps its CSS-pixel stroke width across
 *     devicePixelRatio 1 and 2 (screen-space projection, AD-08).
 *  2. `dashed` lines lose stroke coverage vs a solid stroke (dash gaps render).
 *  3. `points` shrink with camera distance when `sizeAttenuation` is on and
 *     stay constant when off (SG-07, three's PointsMaterial semantics) —
 *     measured per-region: the near point sits left, the far point right.
 *  4. `sprites.sprite` billboards + honours `center`/`spriteRotation` (SG-08).
 *  5. `helpers.*` glyphs are real line nodes — every helper draws pixels.
 *  6. Flag-off mounts fail closed with `parity-not-implemented` (B-01 rule).
 */

interface PixelStats {
  readonly filledPixels: number;
  readonly widestRun: number;
  readonly bbox: readonly [number, number, number, number];
}

interface ParityLinesEvidence {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly dprStability?: {
    readonly dpr1: PixelStats;
    readonly dpr2: PixelStats;
    readonly cssWidthRequested: number;
    readonly dpr1MeasuredCss: number;
    readonly dpr2MeasuredCss: number;
    readonly maxCssDeviation: number;
    readonly pass: boolean;
  };
  readonly dashes?: {
    readonly solid: PixelStats;
    readonly dashed: PixelStats;
    readonly coverageDropped: boolean;
  };
  readonly pointAttenuation?: {
    readonly attenuatedNear: number;
    readonly attenuatedFar: number;
    readonly fixedNear: number;
    readonly fixedFar: number;
    readonly attenuatedRatio: number;
    readonly fixedRatio: number;
    readonly farShrank: boolean;
    readonly fixedStayed: boolean;
  };
  readonly sprite?: {
    readonly rendered: PixelStats;
    readonly rotated: PixelStats;
    readonly rendersPixels: boolean;
    readonly rotationChangesShape: boolean;
  };
  readonly helpers?: Record<string, number>;
  readonly flagOff?: { readonly threwParityNotImplemented: boolean; readonly error?: string };
  /** §8 route-health: the port's snapshot names the parity IDs it exercised. */
  readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
}

declare global {
  interface Window {
    __A3D_PARITY_LINES__?: ParityLinesEvidence;
    __A3D_PARITY_LINES_ERROR__?: string;
  }
}

const mountEl = document.querySelector<HTMLElement>("#mount");

async function decodeShot(app: AuraApp): Promise<ImageData> {
  // C-05 sanctioned readback — app.screenshot()'s toDataURL is unreliable on
  // preserveDrawingBuffer:false contexts (reads a cleared buffer).
  const img = await app.capture({ type: "image-bitmap" }) as ImageBitmap;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

const isInk = (px: Uint8ClampedArray, i: number): boolean =>
  Math.max(px[i]!, px[i + 1]!, px[i + 2]!) > 40 && (px[i + 3] ?? 0) > 40;

function stats(data: ImageData, x0 = 0, x1 = data.width): PixelStats {
  const { width, height, data: px } = data;
  let filled = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let widestRun = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      if (isInk(px, i)) {
        filled += 1;
        run += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        if (run > widestRun) widestRun = run;
        run = 0;
      }
    }
    if (run > widestRun) widestRun = run;
  }
  return { filledPixels: filled, widestRun, bbox: [minX, minY, maxX + 1, maxY + 1] };
}

function canvasFor(cssWidth: number, cssHeight: number, pixelRatio: number, id: string): HTMLCanvasElement {
  const figure = document.createElement("figure");
  const caption = document.createElement("figcaption");
  caption.textContent = id;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssWidth * pixelRatio);
  canvas.height = Math.round(cssHeight * pixelRatio);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  figure.append(caption, canvas);
  mountEl?.append(figure);
  return canvas;
}

/** §8 route-health: IDs this fixture proves against real GPU frames. */
const PARITY_LINE_IDS = ["AD-08", "SG-07", "SG-08", "SC-03", "B-01"] as const;

async function captureScene(
  id: string,
  pixelRatio: number,
  build: () => ReturnType<typeof scene>,
  css = 320
): Promise<{ stats: PixelStats; image: ImageData; app: AuraApp; routeHealth?: { status: string; parityIds: readonly string[] } }> {
  const canvas = canvasFor(css, css, pixelRatio, id);
  const app = createAuraApp(canvas, {
    scene: build(),
    pixelRatio,
    resize: false,
    qualityRebuild: { flags: ["A3D_PARITY_LINES"], allowUrlFlags: false }
  });
  await app.ready();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const image = await decodeShot(app);
  // Snapshot route-health inside the live app before disposal (§8 parityIds).
  const routeHealth = id === "fat-dpr1"
    ? createAuraRouteHealthSnapshot(app, { parityIds: PARITY_LINE_IDS })
    : undefined;
  const out = { stats: stats(image), image, app, routeHealth };
  app.dispose();
  return out;
}

void run().catch((error: unknown) => {
  window.__A3D_PARITY_LINES_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  window.__A3D_PARITY_LINES__ = { status: "error", error: window.__A3D_PARITY_LINES_ERROR__ };
});

async function run(): Promise<void> {
  const evidence: ParityLinesEvidence = { status: "ready" };
  const cam = (d: number) => camera.perspective({ position: [0, 0, d], target: [0, 0, 0], fov: 50 });

  // ── 1/2. fat width × DPR + dashes ──────────────────────────────────────────
  const WIDTH_CSS = 8;
  const fatScene = (dash: { dashSize?: number; gapSize?: number; dashed?: boolean } = {}) =>
    scene()
      .background("#0a0c10")
      .camera(cam(4))
      .add(
        lines.fat({
          points: [[0, -1, 0], [0, 1, 0]],
          width: WIDTH_CSS,
          material: { color: "#ffd060" },
          ...dash
        })
      );
  const dpr1 = await captureScene("fat-dpr1", 1, () => fatScene());
  evidence.routeHealth = dpr1.routeHealth;
  const dpr2 = await captureScene("fat-dpr2", 2, () => fatScene());
  const dpr1Css = dpr1.stats.widestRun;
  const dpr2Css = dpr2.stats.widestRun / 2;
  const maxCssDeviation = Math.max(Math.abs(dpr1Css - WIDTH_CSS), Math.abs(dpr2Css - WIDTH_CSS)) / WIDTH_CSS;
  evidence.dprStability = {
    dpr1: dpr1.stats,
    dpr2: dpr2.stats,
    cssWidthRequested: WIDTH_CSS,
    dpr1MeasuredCss: dpr1Css,
    dpr2MeasuredCss: dpr2Css,
    maxCssDeviation,
    pass: dpr1.stats.widestRun > 0 && dpr2.stats.widestRun > 0 && maxCssDeviation <= 0.35
  };

  const solid = await captureScene("dash-solid", 1, () => fatScene());
  const dashed = await captureScene("dash-dashed", 1, () => fatScene({ dashed: true, dashSize: 0.2, gapSize: 0.2 }));
  evidence.dashes = {
    solid: solid.stats,
    dashed: dashed.stats,
    coverageDropped: dashed.stats.filledPixels < solid.stats.filledPixels * 0.75 && dashed.stats.filledPixels > 0
  };

  // ── 3. point size attenuation ─────────────────────────────────────────────
  // Camera at z=4, fov 50 on a 320px canvas. Near point at x=-1.5, z=0 (view
  // depth 4 → NDC x≈-0.80 → pixel x≈32, safely left-half); far point at
  // x=+0.8, z=-12 (depth 16 → pixel x≈177, right-half). Attenuated device
  // sizes: near 4·160/4 = 160px, far 4·160/16 = 40px (≈6% of near's ink);
  // fixed: both 4px → equal ink.
  const pointsScene = (attenuate: boolean) =>
    scene()
      .background("#0a0c10")
      .camera(cam(4))
      .add(points({
        positions: [[-1.5, 0, 0], [0.8, 0, -12]],
        size: 4,
        sizeAttenuation: attenuate,
        material: { color: "#60d0ff" }
      }));
  const att = await captureScene("points-attenuated", 1, () => pointsScene(true));
  const fix = await captureScene("points-fixed", 1, () => pointsScene(false));
  const mid = Math.floor(att.image.width / 2);
  const attNear = stats(att.image, 0, mid).filledPixels;
  const attFar = stats(att.image, mid, att.image.width).filledPixels;
  const fixNear = stats(fix.image, 0, mid).filledPixels;
  const fixFar = stats(fix.image, mid, fix.image.width).filledPixels;
  const attenuatedRatio = attFar / Math.max(attNear, 1);
  const fixedRatio = fixFar / Math.max(fixNear, 1);
  evidence.pointAttenuation = {
    attenuatedNear: attNear,
    attenuatedFar: attFar,
    fixedNear: fixNear,
    fixedFar: fixFar,
    attenuatedRatio,
    fixedRatio,
    farShrank: attFar > 0 && attenuatedRatio < fixedRatio * 0.5,
    fixedStayed: fixedRatio > 0.5
  };

  // ── 4. sprite billboard + rotation ────────────────────────────────────────
  const spriteScene = (rotation: number) =>
    scene()
      .background("#0a0c10")
      .camera(cam(4))
      .add(
        sprites.sprite({ scale: [2, 0.6, 1], spriteRotation: rotation, color: "#ff7090" })
      );
  const sprite0 = await captureScene("sprite-r0", 1, () => spriteScene(0));
  const spriteR = await captureScene("sprite-rot", 1, () => spriteScene(Math.PI / 4));
  evidence.sprite = {
    rendered: sprite0.stats,
    rotated: spriteR.stats,
    rendersPixels: sprite0.stats.filledPixels > 50,
    rotationChangesShape:
      Math.abs((spriteR.stats.bbox[2] - spriteR.stats.bbox[0]) - (sprite0.stats.bbox[2] - sprite0.stats.bbox[0])) > 2
      || Math.abs((spriteR.stats.bbox[3] - spriteR.stats.bbox[1]) - (sprite0.stats.bbox[3] - sprite0.stats.bbox[1])) > 2
  };

  // ── 5. helpers render (each helper = real line nodes) ──────────────────────
  const helperCaps: Record<string, number> = {};
  for (const [id, builder] of Object.entries({
    axes: helpers.axes({ size: 1.5 }),
    grid: helpers.grid({ size: 4, divisions: 4 }),
    polarGrid: helpers.polarGrid({ radius: 2, sectors: 8, rings: 3, division: 24 }),
    box: helpers.box({ size: 1.5, color: "#ffff00" }),
    arrow: helpers.arrow({ dir: [0.4, 1, 0.2], length: 1.6 }),
    camera: helpers.camera({ fov: 40, near: 0.5, far: 3 }),
    directionalLight: helpers.directionalLight({ size: 1 }),
    spotLight: helpers.spotLight({ angle: Math.PI / 5, distance: 2.5 }),
    pointLight: helpers.pointLight({ sphereSize: 0.8 }),
    skeleton: helpers.skeleton({ positions: [[-0.5, -1, 0], [-0.5, 0, 0], [-0.5, 0.8, 0], [-0.1, 1.2, 0]] })
  })) {
    const cap = await captureScene(`helper-${id}`, 1, () =>
      scene().background("#0a0c10").camera(cam(5)).add(builder));
    helperCaps[id] = cap.stats.filledPixels;
  }
  evidence.helpers = helperCaps;

  // ── 6. flag-off fails closed (strict: mount errors propagate) ──────────────
  try {
    const canvas = canvasFor(160, 160, 1, "flag-off");
    const app = createAuraApp(canvas, {
      scene: scene().background("#0a0c10").camera(cam(4)).add(lines.line({ points: [[0, 0, 0], [1, 1, 0]] })),
      pixelRatio: 1,
      resize: false,
      strict: true,
      qualityRebuild: { flags: [], allowUrlFlags: false }
    });
    await app.ready();
    await new Promise((r) => requestAnimationFrame(r));
    evidence.flagOff = { threwParityNotImplemented: false, error: "mounted without a parity error" };
    app.dispose();
  } catch (error) {
    // strict mount wraps the parity throw as `renderer-mount-failed` with the
    // real AuraRuntimeError on `.cause` — walk the chain for the code.
    const hasParityCode = (e: unknown): boolean => {
      let cur: unknown = e;
      for (let i = 0; i < 4 && cur instanceof Error; i += 1) {
        if ((cur as { code?: string }).code === "parity-not-implemented") return true;
        cur = (cur as { cause?: unknown }).cause;
      }
      return false;
    };
    evidence.flagOff = {
      threwParityNotImplemented:
        error instanceof Error &&
        (error.message.includes("parity-not-implemented") || hasParityCode(error)),
      error: error instanceof Error ? error.message : String(error)
    };
  }

  window.__A3D_PARITY_LINES__ = evidence;
}
