import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { installedAuraPackageAliases, type InstalledPackageAlias } from "./installed-package-resolve";

// The consumer root must come from the source phase's validated candidate
// archives. Phase A authors this spec; only Phase B executes it in a browser.
const moduleName = "virtual:aura3d-native-camera-depth-fixture";
const resolvedModuleName = `\0${moduleName}`;
const fixture = String.raw`
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

const stage = document.querySelector("#stage");
const glow = (color) => material.emissive({ color, emissive: color, emissiveIntensity: 1 });
const addBox = (builder, color, x, y, z, width, height, thickness) =>
  builder.add(primitives.box({ size: [width, height, thickness], material: glow(color) }).position(x, y, z));
const depthOption = (mode, allowFallback) => ({ mode, allowFallback });

function rangeScene(mode, allowFallback, infiniteFar = false) {
  const builder = scene({
    camera: camera.perspective({ position: [0, 0, 0], target: [0, 0, -1], fov: 60, near: 1, far: infiniteFar ? Infinity : 1000, depth: depthOption(mode, allowFallback) }),
    background: "#000000"
  });
  const tangent = Math.tan(Math.PI / 6);
  const panel = (color, ndcX, ndcY, distance) => addBox(builder, color, ndcX * distance * tangent, ndcY * distance * tangent, -distance, distance * 0.16, distance * 0.26, distance * 0.01);
  panel("#ff1111", -0.55, 0, 2);
  panel("#11ff11", 0, 0, 50);
  panel("#1111ff", 0.55, 0, 500);
  // These must fail the near and far tests. The infinite-far scene admits the latter.
  panel("#ff11ff", -0.85, 0, 0.5);
  panel("#11ffff", 0.85, 0, 1500);
  // Deliberately add the far occluder first; red at 2 must win regardless of draw order.
  panel("#1111ff", 0, -0.55, 500);
  panel("#11ff11", 0, -0.55, 50);
  panel("#ff1111", 0, -0.55, 2);
  return builder;
}

function orthographicRangeScene(mode) {
  const builder = scene({ camera: camera.orthographic({ position: [0, 0, 0], target: [0, 0, -1], orthographicSize: 1.6, near: mode === "logarithmic" ? 0.1 : 0, far: 10000, depth: depthOption(mode, false) }), background: "#000000" });
  addBox(builder, "#ff1111", -0.9, 0.5, -2, 0.5, 0.5, 0.2);
  addBox(builder, "#11ff11", 0, 0.5, -100, 0.5, 0.5, 0.2);
  addBox(builder, "#1111ff", 0.9, 0.5, -8000, 0.5, 0.5, 0.2);
  // The near red box must win over the later far blue draw.
  addBox(builder, "#ff1111", 0, -0.6, -2, 0.5, 0.5, 0.2);
  addBox(builder, "#1111ff", 0, -0.6, -8000, 0.5, 0.5, 0.2);
  return builder;
}

function tileScene(mode, allowFallback, projection, viewOffset) {
  const opts = { position: [0, 0, 10], target: [0, 0, 0], near: 0.1, far: 100, depth: depthOption(mode, allowFallback), ...(viewOffset ? { viewOffset } : {}) };
  const view = projection === "orthographic" ? camera.orthographic({ ...opts, orthographicSize: 3 }) : camera.perspective({ ...opts, fov: 40 });
  const builder = scene({ camera: view, background: "#000000" });
  for (let i = 0; i < 7; i++) addBox(builder, ["#ff2020", "#20ff20", "#2020ff", "#ffff20", "#20ffff", "#ff20ff", "#eeeeee"][i], (i - 3) * 1.15, i % 2 ? 0.5 : -0.5, 0, 0.7, 1.7, 0.2);
  // A bar crosses the join to make an incorrect seam visible.
  addBox(builder, "#ff66cc", 0, -1.7, 0.1, 1.7, 0.4, 0.1);
  return builder;
}

function lensScene(options) {
  const builder = scene({ camera: camera.perspective({ position: [0, 0, 8], target: [0, 0, 0], near: 0.1, far: 100, ...options }), background: "#000000" });
  addBox(builder, "#ff1111", 0, 0, 0, 2, 2, 0.2);
  addBox(builder, "#11ff11", 1.8, 0, -1, 1, 1, 0.2);
  return builder;
}

function effectScene(mode, allowFallback, dof) {
  const builder = scene({ camera: camera.perspective({ position: [0, 0, 0], target: [0, 0, -1], fov: 45, near: 0.1, far: 40, depth: depthOption(mode, allowFallback) }), background: "#000000" });
  for (let i = 0; i < 16; i++) addBox(builder, i % 2 ? "#11ff11" : "#113311", -2.4 + i * 0.3, 0, -8, 0.3, 4, 0.1);
  addBox(builder, "#ff1111", 0, 0, -3, 0.7, 1.5, 0.1);
  if (dof) builder.add(effects.depthOfField({ focusDistance: 3, focalLength: 100, fStop: 0.5, maxBlur: 8, intensity: 1 }));
  return builder;
}

function shadowScene(mode, allowFallback, enabled) {
  return scene({ camera: camera.perspective({ position: [4, 6, 8], target: [0, 0.6, 0], fov: 40, near: 0.1, far: 40, depth: depthOption(mode, allowFallback) }), background: "#080808" })
    .add(primitives.plane({ name: "receiver", size: [9, 1, 9], material: material.pbr({ color: "#eeeeee", roughness: 1 }), receiveShadow: true, castShadow: false }))
    .add(primitives.box({ name: "caster", size: [2, 2, 2], position: [0, 1.05, 0], material: material.pbr({ color: "#dd3322" }), castShadow: true }))
    .add(lights.ambient({ intensity: 0.15 }))
    .add(lights.directional({ position: [4, 7, 3], intensity: 2.5, shadow: enabled }));
}

function readFrame(app) {
  const diagnostics = app.diagnostics();
  if (diagnostics.errors.length) throw new Error(diagnostics.errors.join("; "));
  const canvas = app.canvas;
  const gl = canvas?.getContext("webgl2");
  if (!canvas || !gl) throw new Error("The candidate did not create a WebGL2 canvas");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return {
    width: canvas.width, height: canvas.height, pixels: Array.from(pixels),
    backend: diagnostics.renderer?.runtime?.backend, drawCalls: diagnostics.drawCalls,
    depth: diagnostics.renderer?.depth, passes: diagnostics.renderer?.postprocess?.actualPasses ?? [],
    shadows: diagnostics.renderer?.shadows
  };
}
async function capture(builder, width = 192, height = 192) {
  stage.replaceChildren(); stage.style.width = width + "px"; stage.style.height = height + "px";
  const app = createAuraApp(stage, { autoStart: false, pixelRatio: 1, resize: false, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: builder });
  try { await app.ready(); app.step(1 / 60); return readFrame(app); }
  finally { await app.disposeAsync(); }
}
async function attempt(mode, allowFallback) {
  try { return { frame: await capture(rangeScene(mode, allowFallback)) }; }
  catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
async function resize(mode) {
  stage.replaceChildren(); stage.style.width = "192px"; stage.style.height = "192px";
  const app = createAuraApp(stage, { autoStart: false, pixelRatio: 1, resize: true, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: effectScene(mode, false, true) });
  try {
    await app.ready(); app.step(1 / 60);
    const before = readFrame(app);
    stage.style.width = "256px"; stage.style.height = "128px";
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    app.step(1 / 60);
    return { before, after: readFrame(app) };
  } finally { await app.disposeAsync(); }
}
function validate() {
  const reject = (fn) => { try { fn(); return false; } catch { return true; } };
  return {
    perspectiveZeroNear: reject(() => camera.perspective({ near: 0, far: 10 })),
    perspectiveNegativeNear: reject(() => camera.perspective({ near: -1, far: 10 })),
    orthographicZeroNear: !reject(() => camera.orthographic({ near: 0, far: 10 })),
    orthographicInfiniteFar: reject(() => camera.orthographic({ near: 0, far: Infinity })),
    invertedRange: reject(() => camera.perspective({ near: 10, far: 1 }))
  };
}
window.__AURA3D_NATIVE_CAMERA_DEPTH__ = {
  attempt,
  range: (mode, infiniteFar) => capture(rangeScene(mode, false, infiniteFar)),
  orthographicRange: (mode) => capture(orthographicRangeScene(mode)),
  tile: (mode, projection, offset, width, height) => capture(tileScene(mode, false, projection, offset), width, height),
  lens: (options) => capture(lensScene(options)),
  effect: (mode, dof) => capture(effectScene(mode, false, dof)),
  shadow: (mode, enabled) => capture(shadowScene(mode, false, enabled)),
  resize,
  validate
};
`;

type Mode = "standard" | "reversed" | "logarithmic";
type Projection = "perspective" | "orthographic";
interface DepthReport { readonly mode: Mode; readonly requestedMode: Mode; readonly fallbackReason?: string }
interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pixels: number[];
  readonly backend?: string;
  readonly drawCalls?: number;
  readonly depth?: DepthReport;
  readonly passes: readonly string[];
  readonly shadows?: { readonly mapRendered?: boolean; readonly mapSampled?: boolean };
}
interface ViewOffset { fullWidth: number; fullHeight: number; x: number; y: number; width: number; height: number }
interface Harness {
  attempt(mode: Mode, allowFallback: boolean): Promise<{ frame?: Frame; error?: string }>;
  range(mode: Mode, infiniteFar: boolean): Promise<Frame>;
  orthographicRange(mode: Mode): Promise<Frame>;
  tile(mode: Mode, projection: Projection, offset: ViewOffset | null, width: number, height: number): Promise<Frame>;
  lens(options: Record<string, number>): Promise<Frame>;
  effect(mode: Mode, dof: boolean): Promise<Frame>;
  shadow(mode: Mode, enabled: boolean): Promise<Frame>;
  resize(mode: Mode): Promise<{ before: Frame; after: Frame }>;
  validate(): Record<string, boolean>;
}

function fixturePlugin(aliases: readonly InstalledPackageAlias[]): Plugin {
  const candidateExports = new Map(aliases.map((entry) => [entry.find, entry.replacement]));
  return {
    enforce: "pre",
    name: "aura3d-native-camera-depth-fixture",
    resolveId(id) {
      if (id === moduleName) return resolvedModuleName;
      if (!id.startsWith("@aura3d/")) return undefined;
      const target = candidateExports.get(id);
      if (!target) throw new Error(`Candidate consumer does not export required Aura package: ${id}`);
      return target;
    },
    load(id) { return id === resolvedModuleName ? fixture : undefined; },
    configureServer(server) {
      server.middlewares.use("/wp30-camera-depth.html", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><style>html,body{margin:0}#stage{width:192px;height:192px}</style><div id="stage"></div><script type="module" src="/@id/__x00__virtual:aura3d-native-camera-depth-fixture"></script>');
      });
    }
  };
}
let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
  const aliases = installedAuraPackageAliases();
  const candidateRoot = realpathSync(resolve(root));
  for (const alias of aliases) {
    const entry = realpathSync(alias.replacement);
    if (!entry.startsWith(`${candidateRoot}${sep}`)) throw new Error(`Candidate export resolves outside its installed consumer: ${alias.find}`);
  }
  const engine = aliases.find((entry) => entry.find === "@aura3d/engine");
  if (!engine || realpathSync(engine.replacement).includes("/packages/engine/src/")) throw new Error("The installed candidate must resolve @aura3d/engine to its packed entrypoint");
  server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] }, server: { fs: { allow: [process.cwd(), resolve(root)] } }, plugins: [fixturePlugin(aliases)] });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("The candidate test server has no local origin");
});
test.afterAll(async () => { await server?.close(); });
async function openHarness(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}wp30-camera-depth.html?capture=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_NATIVE_CAMERA_DEPTH__?: unknown }).__AURA3D_NATIVE_CAMERA_DEPTH__), undefined, { timeout: 90_000 }).catch((error) => {
    throw new Error(`Camera/depth fixture did not load: ${errors.join(" | ")}`, { cause: error });
  });
  expect(errors).toEqual([]);
}
function check(frame: Frame, mode: Mode): void {
  expect(frame.backend).toBe("production-runtime");
  expect(frame.drawCalls).toBeGreaterThan(0);
  expect(frame.depth).toMatchObject({ mode, requestedMode: mode });
  expect(frame.depth?.fallbackReason).toBeUndefined();
}
function colorCount(frame: Frame, channel: 0 | 1 | 2, x0: number, x1: number, y0: number, y1: number): number {
  let count = 0;
  for (let y = Math.floor(y0 * frame.height); y < Math.floor(y1 * frame.height); y++) for (let x = Math.floor(x0 * frame.width); x < Math.floor(x1 * frame.width); x++) {
    const i = 4 * (y * frame.width + x), primary = frame.pixels[i + channel] ?? 0;
    const other = Math.max(frame.pixels[i + (channel + 1) % 3] ?? 0, frame.pixels[i + (channel + 2) % 3] ?? 0);
    if (primary > 60 && primary > other * 1.5) count++;
  }
  return count;
}
function nonBlack(frame: Frame, x0: number, x1: number, y0: number, y1: number): number {
  let count = 0;
  for (let y = Math.floor(y0 * frame.height); y < Math.floor(y1 * frame.height); y++) for (let x = Math.floor(x0 * frame.width); x < Math.floor(x1 * frame.width); x++) {
    const i = 4 * (y * frame.width + x);
    if (Math.max(frame.pixels[i] ?? 0, frame.pixels[i + 1] ?? 0, frame.pixels[i + 2] ?? 0) > 40) count++;
  }
  return count;
}
function meanDelta(a: Frame, b: Frame): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0;
  for (let i = 0; i < a.pixels.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs((a.pixels[i + c] ?? 0) - (b.pixels[i + c] ?? 0));
  return sum / (a.width * a.height * 3);
}
function stitchedDelta(full: Frame, left: Frame, right: Frame, seamOnly = false): number {
  expect([full.width, full.height, left.width, left.height, right.width, right.height]).toEqual([256, 128, 128, 128, 128, 128]);
  let sum = 0, samples = 0;
  const start = seamOnly ? 126 : 0, end = seamOnly ? 130 : 256;
  for (let y = 0; y < full.height; y++) for (let x = start; x < end; x++) {
    const tile = x < 128 ? left : right, tx = x % 128, fullIndex = 4 * (y * 256 + x), tileIndex = 4 * (y * 128 + tx);
    for (let c = 0; c < 3; c++) { sum += Math.abs((full.pixels[fullIndex + c] ?? 0) - (tile.pixels[tileIndex + c] ?? 0)); samples++; }
  }
  return sum / samples;
}
function redCentroid(frame: Frame): number {
  let sum = 0, count = 0;
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const i = 4 * (y * frame.width + x);
    if ((frame.pixels[i] ?? 0) > 60 && (frame.pixels[i] ?? 0) > (frame.pixels[i + 1] ?? 0) * 1.5) { sum += x; count++; }
  }
  expect(count).toBeGreaterThan(100);
  return sum / count;
}

for (const mode of ["standard", "reversed", "logarithmic"] as const) {
  test(`${mode} depth negotiates explicitly and preserves near, far, ordering, effects, and shadows`, async ({ page }) => {
    test.setTimeout(600_000);
    await openHarness(page);
    const attempts = await page.evaluate(async (requested: Mode) => {
      const h = (window as unknown as { __AURA3D_NATIVE_CAMERA_DEPTH__: Harness }).__AURA3D_NATIVE_CAMERA_DEPTH__;
      const strict = await h.attempt(requested, false);
      const fallback = strict.error ? await h.attempt(requested, true) : undefined;
      const standard = requested === "standard" ? strict : await h.attempt("standard", false);
      if (strict.error) return { strict, fallback, standard };
      return { strict, standard, ortho: await h.orthographicRange(requested), effect: await h.effect(requested, true), noEffect: await h.effect(requested, false), shadow: await h.shadow(requested, true), noShadow: await h.shadow(requested, false), standardEffect: await h.effect("standard", true), standardShadow: await h.shadow("standard", true), resized: await h.resize(requested) };
    }, mode);
    expect(attempts.standard.frame, attempts.standard.error).toBeDefined();
    const standard = attempts.standard.frame!;
    check(standard, "standard");
    if (attempts.strict.error) {
      // A device may reject an unsupported full-pipeline mode, but only with
      // this explicit diagnostic; arbitrary rendering failures are not skips.
      expect(mode).not.toBe("standard");
      expect(attempts.strict.error).toContain("DEPTH_MODE_UNSUPPORTED");
      expect(attempts.fallback?.error).toBeUndefined();
      const fallback = attempts.fallback?.frame;
      expect(fallback?.backend).toBe("production-runtime");
      expect(fallback?.depth).toMatchObject({ mode: "standard", requestedMode: mode });
      expect(fallback?.depth?.fallbackReason).toContain(mode);
      expect(meanDelta(standard, fallback!)).toBeLessThan(2);
      return;
    }
    const frame = attempts.strict.frame!;
    check(frame, mode);
    expect(colorCount(frame, 0, 0.17, 0.28, 0.44, 0.56)).toBeGreaterThan(100);
    expect(colorCount(frame, 1, 0.44, 0.56, 0.44, 0.56)).toBeGreaterThan(100);
    expect(colorCount(frame, 2, 0.72, 0.83, 0.44, 0.56)).toBeGreaterThan(100);
    expect(nonBlack(frame, 0.02, 0.11, 0.42, 0.58)).toBeLessThan(5);
    expect(nonBlack(frame, 0.89, 0.98, 0.42, 0.58)).toBeLessThan(5);
    expect(colorCount(frame, 0, 0.44, 0.56, 0.17, 0.28)).toBeGreaterThan(100);
    expect(colorCount(frame, 2, 0.44, 0.56, 0.17, 0.28)).toBeLessThan(5);
    expect(meanDelta(standard, frame)).toBeLessThan(2);
    const { ortho, effect, noEffect, shadow, noShadow, standardEffect, standardShadow, resized } = attempts;
    expect(ortho).toBeDefined();
    check(ortho!, mode);
    expect(colorCount(ortho!, 0, 0.17, 0.27, 0.62, 0.69)).toBeGreaterThan(50);
    expect(colorCount(ortho!, 1, 0.45, 0.55, 0.62, 0.69)).toBeGreaterThan(50);
    expect(colorCount(ortho!, 2, 0.73, 0.83, 0.62, 0.69)).toBeGreaterThan(50);
    expect(colorCount(ortho!, 0, 0.45, 0.55, 0.28, 0.35)).toBeGreaterThan(50);
    expect(colorCount(ortho!, 2, 0.45, 0.55, 0.28, 0.35)).toBeLessThan(5);
    expect(effect).toBeDefined(); expect(noEffect).toBeDefined(); expect(shadow).toBeDefined(); expect(noShadow).toBeDefined(); expect(resized).toBeDefined();
    for (const item of [effect!, noEffect!, shadow!, noShadow!, resized!.before, resized!.after]) check(item, mode);
    expect(effect!.passes).toContain("depth-of-field");
    expect(meanDelta(effect!, noEffect!)).toBeGreaterThan(0.1);
    check(standardEffect!, "standard");
    expect(meanDelta(effect!, standardEffect!)).toBeLessThan(3);
    expect(shadow!.shadows?.mapRendered).toBe(true);
    expect(shadow!.shadows?.mapSampled).toBe(true);
    expect(meanDelta(shadow!, noShadow!)).toBeGreaterThan(0.1);
    check(standardShadow!, "standard");
    expect(meanDelta(shadow!, standardShadow!)).toBeLessThan(3);
    expect([resized!.before.width, resized!.before.height, resized!.after.width, resized!.after.height]).toEqual([192, 192, 256, 128]);
    expect(resized!.after.passes).toContain("depth-of-field");
    expect(nonBlack(resized!.after, 0.2, 0.8, 0.2, 0.8)).toBeGreaterThan(100);
  });
}

test("tiled perspective and orthographic projections meet at the same pixels", async ({ page }) => {
  test.setTimeout(600_000);
  await openHarness(page);
  const cases = await page.evaluate(async () => {
    const h = (window as unknown as { __AURA3D_NATIVE_CAMERA_DEPTH__: Harness }).__AURA3D_NATIVE_CAMERA_DEPTH__;
    const result: { mode: Mode; projection: Projection; full: Frame; left: Frame; right: Frame }[] = [];
    for (const mode of ["standard", "reversed", "logarithmic"] as const) {
      const support = await h.attempt(mode, false);
      if (support.error) {
        if (!support.error.includes("DEPTH_MODE_UNSUPPORTED")) throw new Error(support.error);
        continue;
      }
      for (const projection of ["perspective", "orthographic"] as const) {
        const offset = { fullWidth: 256, fullHeight: 128, y: 0, width: 128, height: 128 };
        result.push({ mode, projection, full: await h.tile(mode, projection, null, 256, 128), left: await h.tile(mode, projection, { ...offset, x: 0 }, 128, 128), right: await h.tile(mode, projection, { ...offset, x: 128 }, 128, 128) });
      }
    }
    return result;
  });
  expect(cases.filter((entry) => entry.mode === "standard").map((entry) => entry.projection)).toEqual(["perspective", "orthographic"]);
  for (const item of cases) {
    for (const frame of [item.full, item.left, item.right]) check(frame, item.mode);
    expect(nonBlack(item.full, 0.49, 0.51, 0.1, 0.9), `${item.mode}/${item.projection} seam probe`).toBeGreaterThan(2);
    expect(stitchedDelta(item.full, item.left, item.right), `${item.mode}/${item.projection} tiled image`).toBeLessThan(2);
    expect(stitchedDelta(item.full, item.left, item.right, true), `${item.mode}/${item.projection} seam`).toBeLessThan(4);
  }
});

test("physical lens controls, infinite far, and projection-specific clipping validate through the root API", async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const results = await page.evaluate(async () => {
    const h = (window as unknown as { __AURA3D_NATIVE_CAMERA_DEPTH__: Harness }).__AURA3D_NATIVE_CAMERA_DEPTH__;
    const fov = 2 * Math.atan(35 / (2 * 50)) * 180 / Math.PI;
    return {
      validation: h.validate(),
      lens: await h.lens({ focalLength: 50, filmGauge: 35, fov: 100 }),
      equivalent: await h.lens({ fov }),
      shifted: await h.lens({ focalLength: 50, filmGauge: 35, filmOffset: 8 }),
      infinite: await h.range("standard", true)
    };
  });
  expect(results.validation).toEqual({ perspectiveZeroNear: true, perspectiveNegativeNear: true, orthographicZeroNear: true, orthographicInfiniteFar: true, invertedRange: true });
  for (const frame of [results.lens, results.equivalent, results.shifted, results.infinite]) check(frame, "standard");
  expect(meanDelta(results.lens, results.equivalent)).toBeLessThan(2);
  expect(Math.abs(redCentroid(results.shifted) - redCentroid(results.lens))).toBeGreaterThan(10);
  expect(nonBlack(results.infinite, 0.89, 0.98, 0.42, 0.58)).toBeGreaterThan(30);
  expect(nonBlack(results.infinite, 0.02, 0.11, 0.42, 0.58)).toBeLessThan(5);
});
