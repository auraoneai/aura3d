/**
 * threejs-parity lane L7 - runtime pixel lab (docs/workflows/threejs-parity-gaps.md
 * §5.7, task R-08). Remote-only: driven by tests/browser/parity-runtime.spec.ts.
 *
 * Every case renders real GPU frames and publishes measured pixel evidence on
 * `window.__AURA3D_PARITY_RUNTIME_LAB__`:
 *   fog          SR-02  `material.fog:false` mesh equals the no-fog baseline
 *   background   SG-10  texture/cube `scene.background` paints without IBL
 *   cubeCamera   SC-01  reflection moves when a coloured object moves
 *   mirror       AD-15  `surfaces.mirror` reflects the object
 *   layers       SR-04  `camera.layers` hides non-intersecting nodes
 *   renderTarget SH-06  `render({ target })` output sampled as a material map
 */
import {
  camera,
  cameras,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  effects,
  game,
  lights,
  material,
  resolveQrFlags,
  primitives,
  scene,
  surfaces,
  type AuraApp
} from "@aura3d/engine";
import { multiplyMat4, perspectiveMat4 } from "@aura3d/engine/scene";
import { createRenderTarget } from "@aura3d/engine/renderer";
import { CubeCameraReflectionCapture, Geometry, PBRMaterial, Renderer, TexturedUnlitMaterial, UnlitMaterial, createReflectionProbe } from "@aura3d/rendering";

type Rgb = readonly [number, number, number];

interface Shot {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

interface Region {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface LabState {
  status: "boot" | "ready" | "error";
  error?: string;
  fog?: Record<string, unknown>;
  background?: Record<string, unknown>;
  cubeCamera?: Record<string, unknown>;
  mirror?: Record<string, unknown>;
  layers?: Record<string, unknown>;
  renderTarget?: Record<string, unknown>;
  cubeCapture?: Record<string, unknown>;
  routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
}

declare global {
  interface Window {
    __AURA3D_PARITY_RUNTIME_LAB__?: LabState;
  }
}

const W = 320;
const H = 240;
const mountEl = document.querySelector<HTMLElement>("#mount");
const logEl = document.querySelector<HTMLElement>("#log");
const state: LabState = { status: "boot" };
window.__AURA3D_PARITY_RUNTIME_LAB__ = state;
const log = (message: string): void => {
  if (logEl) logEl.textContent = `${logEl.textContent ?? ""}\n${message}`;
};

function addCanvas(label: string, width = W, height = H): HTMLCanvasElement {
  const figure = document.createElement("figure");
  const caption = document.createElement("figcaption");
  caption.textContent = label;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  figure.append(caption, canvas);
  mountEl?.append(figure);
  return canvas;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function shot(app: AuraApp): Promise<Shot> {
  const image = (await app.capture?.({ type: "image-bitmap" })) as ImageBitmap;
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const { width, height, data } = ctx.getImageData(0, 0, c.width, c.height);
  return { width, height, data };
}

async function mount(label: string, build: () => ReturnType<typeof scene>): Promise<AuraApp> {
  const app = createAuraApp(addCanvas(label), { scene: build(), pixelRatio: 1, resize: false });
  await app.ready();
  const start = Date.now();
  while ((app.diagnostics().drawCalls ?? 0) === 0 && Date.now() - start < 45_000) {
    app.step(1 / 60);
    await sleep(60);
  }
  return app;
}

async function frames(app: AuraApp, count = 4): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    app.step(1 / 60);
    await sleep(40);
  }
}

const px = (s: Shot, x: number, y: number): Rgb => {
  const i = (y * s.width + x) * 4;
  return [s.data[i]!, s.data[i + 1]!, s.data[i + 2]!];
};

function meanRgb(s: Shot, r: Region): Rgb {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      const [pr, pg, pb] = px(s, x, y);
      sr += pr; sg += pg; sb += pb; n += 1;
    }
  }
  return [sr / n, sg / n, sb / n];
}

function meanAbsDiff(a: Shot, b: Shot, r: Region): number {
  let sum = 0, n = 0;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      const pa = px(a, x, y), pb = px(b, x, y);
      sum += Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]);
      n += 3;
    }
  }
  return sum / n;
}

const isRed = ([r, g, b]: Rgb): boolean => r > 110 && r > g * 2 && r > b * 2;
const isBlue = ([r, g, b]: Rgb): boolean => b > 90 && b > r * 1.6 && b > g * 1.2;

function count(s: Shot, pred: (c: Rgb) => boolean, r: Region = { x0: 0, y0: 0, x1: s.width, y1: s.height }): number {
  let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) for (let x = r.x0; x < r.x1; x += 1) if (pred(px(s, x, y))) n += 1;
  return n;
}

function centroidX(s: Shot, pred: (c: Rgb) => boolean, r: Region): number | null {
  let sum = 0, n = 0;
  for (let y = r.y0; y < r.y1; y += 1) for (let x = r.x0; x < r.x1; x += 1) if (pred(px(s, x, y))) { sum += x; n += 1; }
  return n === 0 ? null : sum / n;
}

function lowestRow(s: Shot, pred: (c: Rgb) => boolean): number {
  for (let y = s.height - 1; y >= 0; y -= 1) for (let x = 0; x < s.width; x += 1) if (pred(px(s, x, y))) return y;
  return -1;
}

const box = (cx: number, cy: number, half: number): Region => ({
  x0: Math.round(cx - half), y0: Math.round(cy - half), x1: Math.round(cx + half), y1: Math.round(cy + half)
});

const cam = (position: [number, number, number], extra: { layers?: number } = {}) =>
  camera.perspective({ position, target: [0, 0, 0], fov: 40, ...extra });

const dataUrl = (color: string, width = 32, height = 16): string => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return c.toDataURL("image/png");
};

// ── SR-02: per-material fog opt-out ──────────────────────────────────────────
async function fogCase(): Promise<Record<string, unknown>> {
  const build = (withFog: boolean) => {
    const s = scene()
      .background("#101018")
      .camera(cam([0, 0, 6]))
      .add(lights.ambient({ intensity: 1.2 }))
      .add(lights.directional({ position: [2, 3, 4], intensity: 2 }))
      .add(primitives.box({ name: "fogged", position: [-1.2, 0, 0], size: 1.4, material: material.pbr({ color: "#2a6cff", roughness: 0.9 }) }))
      .add(primitives.box({ name: "fog-off", position: [1.2, 0, 0], size: 1.4, material: material.pbr({ color: "#2a6cff", roughness: 0.9, fog: false }) }));
    if (withFog) s.add(effects.fog({ density: 0.3, color: "#ff3df0", intensity: 1 }));
    return s;
  };
  const baselineApp = await mount("fog-baseline", () => build(false));
  await frames(baselineApp);
  const baseline = await shot(baselineApp);
  baselineApp.dispose();
  const fogApp = await mount("fog-on", () => build(true));
  await frames(fogApp);
  const fogged = await shot(fogApp);
  state.routeHealth = createAuraRouteHealthSnapshot(fogApp, {
    parityIds: ["SH-06", "SR-02", "SG-10", "SC-01", "AD-15", "SR-04"]
  });
  fogApp.dispose();

  const foggedRegion = box(160 - 66, 120, 20);
  const offRegion = box(160 + 66, 120, 20);
  const evidence = {
    baselineFoggedBox: meanRgb(baseline, foggedRegion),
    baselineOffBox: meanRgb(baseline, offRegion),
    fogOnFoggedBox: meanRgb(fogged, foggedRegion),
    fogOnOffBox: meanRgb(fogged, offRegion),
    offBoxDiffVsBaseline: meanAbsDiff(baseline, fogged, offRegion),
    foggedBoxDiffVsBaseline: meanAbsDiff(baseline, fogged, foggedRegion)
  };
  log(`fog ${JSON.stringify(evidence)}`);
  return evidence;
}

// ── SG-10: texture / cube background without IBL ────────────────────────────
async function backgroundCase(): Promise<Record<string, unknown>> {
  const build = (background: Parameters<ReturnType<typeof scene>["background"]>[0], z = 6) =>
    scene()
      .background(background)
      .camera(cam([0, 0, z]))
      .add(lights.ambient({ intensity: 0.3 }))
      .add(lights.directional({ position: [2, 3, 4], intensity: 1.5 }))
      .add(primitives.sphere({ name: "probe-sphere", size: 1.6, material: material.pbr({ color: "#d0d0d0", metallic: 1, roughness: 0.15 }) }));
  const sphereRegion = box(160, 120, 14);
  const corner = (s: Shot): Rgb => meanRgb(s, { x0: 4, y0: 4, x1: 20, y1: 20 });
  const chroma = ([r, g, b]: Rgb): number => Math.max(r, g, b) - Math.min(r, g, b);
  // Image backgrounds decode asynchronously: step frames until the corner stops matching the clear colour.
  const settleBackground = async (app: AuraApp, clear: Rgb): Promise<Shot> => {
    let s = await shot(app);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const c = corner(s);
      if (Math.abs(c[0] - clear[0]) + Math.abs(c[1] - clear[1]) + Math.abs(c[2] - clear[2]) > 60) break;
      await frames(app, 2);
      s = await shot(app);
    }
    return s;
  };

  const plainApp = await mount("bg-plain", () => build("#101010"));
  await frames(plainApp);
  const plain = await shot(plainApp);
  plainApp.dispose();
  const clear = corner(plain);

  const texApp = await mount("bg-texture", () => build({ texture: dataUrl("#ff00ff") }));
  const tex = await settleBackground(texApp, clear);
  texApp.dispose();

  // Cube faces must be square and equal-sized (compiler/backgroundImage.ts).
  const faces = ["#ff0000", "#00ffff", "#00ff00", "#ff00ff", "#0000ff", "#ffff00"].map((color) => dataUrl(color, 16, 16));
  const cubeFront = await mount("bg-cube-front", () => build({ cube: { faces } }, 6));
  const cubeA = await settleBackground(cubeFront, clear);
  cubeFront.dispose();
  const cubeBack = await mount("bg-cube-back", () => build({ cube: { faces } }, -6));
  const cubeB = await settleBackground(cubeBack, clear);
  cubeBack.dispose();

  const [ca, cb] = [corner(cubeA), corner(cubeB)];
  const evidence = {
    clearCorner: clear,
    textureCorner: corner(tex),
    textureCornerChroma: chroma(corner(tex)),
    textureSphereDiffVsPlain: meanAbsDiff(plain, tex, sphereRegion),
    cubeCornerFront: ca,
    cubeCornerBack: cb,
    cubeFacesDiffer: Math.abs(ca[0] - cb[0]) + Math.abs(ca[1] - cb[1]) + Math.abs(ca[2] - cb[2]),
    cubeCornerChroma: [chroma(ca), chroma(cb)]
  };
  log(`background ${JSON.stringify(evidence)}`);
  return evidence;
}

// ── SC-01: cube camera reflection follows a moving object ───────────────────
async function cubeCameraCase(): Promise<Record<string, unknown>> {
  const build = (withEnvMap: boolean) =>
    scene()
      .background("#08090c")
      .camera(cam([0, 0, 6]))
      .add(lights.ambient({ intensity: 0.4 }))
      .add(cameras.cube({ name: "env", resolution: 128, position: [0, 0, 0], updateEvery: 1 }))
      .add(primitives.sphere({
        name: "mirror-ball",
        size: 1.6,
        material: material.pbr({
          color: "#ffffff",
          metallic: 1,
          roughness: 0.02,
          ...(withEnvMap ? { envMap: { cubeCamera: "env" } } : {})
        })
      }))
      .add(
        primitives
          .box({
            name: "red-cube",
            position: [2.4, 0, 0],
            size: 0.7,
            material: material.pbr({ color: "#ff0000", emissive: "#ff0000", emissiveIntensity: 3 })
          })
          .runtime(game.runtimeNode("red-cube"))
      );
  const window_: Region = { x0: 160 - 40, y0: 120 - 40, x1: 160 + 40, y1: 120 + 40 };

  const controlApp = await mount("cube-camera-control", () => build(false));
  await frames(controlApp, 6);
  const control = await shot(controlApp);
  controlApp.dispose();

  const app = await mount("cube-camera", () => build(true));
  await frames(app, 6);
  const before = await shot(app);
  app.nodes.require("red-cube").setPosition(-2.4, 0, 0);
  await frames(app, 6);
  const after = await shot(app);
  const warnings = [...app.diagnostics().warnings];
  const errors = [...app.diagnostics().errors];
  app.dispose();

  const evidence = {
    redBefore: count(before, isRed, window_),
    redAfter: count(after, isRed, window_),
    centroidBefore: centroidX(before, isRed, window_),
    centroidAfter: centroidX(after, isRed, window_),
    windowDiff: meanAbsDiff(before, after, window_),
    envMapVsControlDiff: meanAbsDiff(before, control, window_),
    sphereMeanBefore: meanRgb(before, window_),
    sphereMeanControl: meanRgb(control, window_),
    warnings,
    errors
  };
  log(`cubeCamera ${JSON.stringify(evidence)}`);
  return evidence;
}

// ── AD-15: planar mirror reflects the object ────────────────────────────────
async function mirrorCase(): Promise<Record<string, unknown>> {
  const build = (withMirror: boolean) => {
    const s = scene()
      .background("#0b0d12")
      .camera(camera.perspective({ position: [0, 2.2, 6], target: [0, 0.4, 0], fov: 40 }))
      .add(lights.ambient({ intensity: 0.6 }))
      .add(lights.directional({ position: [2, 4, 3], intensity: 1.5 }))
      .add(primitives.box({
        name: "red-cube",
        position: [0, 1, 0],
        size: 0.8,
        material: material.pbr({ color: "#ff0000", emissive: "#ff0000", emissiveIntensity: 3 })
      }));
    if (withMirror) s.add(surfaces.mirror({ name: "floor", size: [8, 8], position: [0, 0, 0], resolution: 256 }));
    else s.add(primitives.box({ name: "floor", position: [0, -0.02, 0], size: [8, 0.04, 8], material: material.pbr({ color: "#20242c", roughness: 0.9 }) }));
    return s;
  };
  const baseApp = await mount("mirror-baseline", () => build(false));
  await frames(baseApp);
  const baseline = await shot(baseApp);
  baseApp.dispose();
  const mirrorApp = await mount("mirror-on", () => build(true));
  await frames(mirrorApp, 6);
  const mirrored = await shot(mirrorApp);
  mirrorApp.dispose();

  const evidence = {
    baselineRedPixels: count(baseline, isRed),
    mirrorRedPixels: count(mirrored, isRed),
    baselineLowestRedRow: lowestRow(baseline, isRed),
    mirrorLowestRedRow: lowestRow(mirrored, isRed)
  };
  log(`mirror ${JSON.stringify(evidence)}`);
  return evidence;
}

// ── SR-04: camera layer mask hides non-intersecting nodes ───────────────────
async function layersCase(): Promise<Record<string, unknown>> {
  const run = async (label: string, layers: number | undefined): Promise<{ red: number; blue: number }> => {
    const app = await mount(label, () =>
      scene()
        .background("#101018")
        .camera(cam([0, 0, 6], layers === undefined ? {} : { layers }))
        .add(lights.ambient({ intensity: 1.2 }))
        .add(lights.directional({ position: [2, 3, 4], intensity: 2 }))
        .add(primitives.box({ name: "keep", position: [-1.5, 0, 0], size: 1.2, material: material.pbr({ color: "#ff1010", roughness: 0.9 }) }))
        .add(
          primitives
            .box({ name: "hidden", position: [1.5, 0, 0], size: 1.2, material: material.pbr({ color: "#1030ff", roughness: 0.9 }) })
            .runtime(game.runtimeNode("hidden"))
        ));
    app.nodes.require("hidden").layers.set(1); // mask 0b10; "keep" stays on layer 0 (mask 0b01)
    await frames(app, 4);
    const s = await shot(app);
    app.dispose();
    return { red: count(s, isRed), blue: count(s, isBlue) };
  };
  const unmasked = await run("layers-none", undefined);
  const layer0 = await run("layers-0", 0b01);
  const layer1 = await run("layers-1", 0b10);
  const evidence = { unmasked, layer0, layer1 };
  log(`layers ${JSON.stringify(evidence)}`);
  return evidence;
}

// ── SH-06: render({ target }) output sampled as a material map ──────────────
async function renderTargetCase(): Promise<Record<string, unknown>> {
  const canvas = addCanvas("render-target-map", 128, 128);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: 128,
    height: 128,
    clearColor: [0, 0, 0, 1],
    preserveDrawingBuffer: true
  });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  try {
    const drawn = createRenderTarget(renderer, { width: 64, height: 64, label: "lab-rt-drawn" });
    const blank = createRenderTarget(renderer, { width: 64, height: 64, label: "lab-rt-blank" });
    renderer.render({
      source: {
        renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial({ color: [0, 1, 0, 1] }), label: "lab-rt-source" }]
      },
      target: drawn
    });
    const consume = (target: typeof drawn): readonly number[] => {
      renderer.render(
        {
          renderItems: [{
            geometry: Geometry.texturedCube(1),
            material: new TexturedUnlitMaterial({ texture: target.colorTexture }),
            label: "lab-rt-consumer"
          }],
          frustumCulling: false,
          cameraPolicy: "require"
        },
        { viewProjectionMatrix: identity }
      );
      return Array.from(renderer.device.readPixels(64, 64, 1, 1));
    };
    const withTarget = consume(drawn);
    const baseline = consume(blank);
    const info = renderer.info;
    drawn.dispose();
    blank.dispose();
    const evidence = {
      targetSize: [64, 64],
      withTarget,
      baseline,
      rendererTargetsAfterDispose: renderer.info.memory.renderTargets ?? null,
      drawCalls: info.render.calls
    };
    log(`renderTarget ${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    renderer.dispose();
  }
}

// ── SC-01 diagnostic: what the cube capture actually holds on a real GPU ────
async function cubeCaptureCase(): Promise<Record<string, unknown>> {
  const canvas = addCanvas("cube-capture", 128, 128);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: 128,
    height: 128,
    clearColor: [0, 0, 0, 1],
    preserveDrawingBuffer: true
  });
  try {
    const translation = (x: number, y: number, z: number): Float32Array =>
      new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    const red = {
      geometry: Geometry.litCube(1),
      material: new UnlitMaterial({ color: [1, 0, 0, 1] }),
      modelMatrix: translation(3, 0, 0),
      includeInAutoFrame: false,
      label: "cube-capture-red"
    };
    const capture = new CubeCameraReflectionCapture(
      renderer.device,
      createReflectionProbe({ id: "diag", position: [0, 0, 0], radius: 50, intensity: 1 }),
      { resolution: 64, near: 0.1, far: 50 }
    );
    const result = capture.capture((face) => {
      renderer.renderProbeFace(
        { renderItems: [red], cameraPolicy: "require", cameraPosition: [...face.position] as [number, number, number], frustumCulling: true },
        face.index as 0 | 1 | 2 | 3 | 4 | 5,
        face.renderTarget,
        face.viewProjectionMatrix
      );
    });
    const faces = result.texture.cubeFaces.map((cubeFace) => {
      const data = cubeFace.mipLevels[0]!.data as Uint8Array;
      let redPixels = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! > 100 && data[i + 1]! < 60 && data[i + 2]! < 60) redPixels += 1;
      return { face: cubeFace.face, redPixels };
    });
    // Consume the capture on a metallic sphere at renderer level, with and without the app's static batching.
    const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -6, 1]);
    const viewProjectionMatrix = Float32Array.from(multiplyMat4(perspectiveMat4((Math.PI * 40) / 180, 1, 0.05, 100), view as never));
    const consume = (staticBatching: boolean): number => {
      renderer.render(
        {
          renderItems: [{
            geometry: Geometry.uvSphere(0.8, 48, 24),
            material: new PBRMaterial({ name: "cube-capture-ball", baseColor: [1, 1, 1, 1], metallic: 1, roughness: 0.02 }),
            modelMatrix: translation(0, 0, 0),
            includeInAutoFrame: false,
            environmentCube: result.binding,
            label: "cube-capture-ball"
          }],
          cameraPolicy: "require",
          staticBatching,
          frustumCulling: true,
          environmentLighting: { color: [1, 1, 1], intensity: 0, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }
        },
        { viewProjectionMatrix }
      );
      const px = renderer.device.readPixels(0, 0, 128, 128);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i]! > 110 && px[i]! > px[i + 1]! * 2 && px[i]! > px[i + 2]! * 2) n += 1;
      return n;
    };
    const consumed = { redWithoutBatching: consume(false), redWithBatching: consume(true) };
    capture.dispose();
    const evidence = { faces, changedFaceCount: result.changedFaceCount ?? null, consumed };
    log(`cubeCapture ${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    renderer.dispose();
  }
}

async function run(): Promise<void> {
  state.cubeCapture = await cubeCaptureCase();
  state.fog = await fogCase();
  state.background = await backgroundCase();
  state.cubeCamera = await cubeCameraCase();
  state.mirror = await mirrorCase();
  state.layers = await layersCase();
  state.renderTarget = await renderTargetCase();
  state.status = "ready";
}

void run().catch((error: unknown) => {
  state.status = "error";
  state.error = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
});
