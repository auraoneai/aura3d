import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { type Plugin, type ViteDevServer } from "vite";
import { createServer } from "./native-vite-server";
import { installedAuraPackageAliases, type InstalledPackageAlias } from "./installed-package-resolve";

/*
 * These cases deliberately import the installed candidate's root package. The
 * acceptance runner supplies A3D_INSTALLED_PACKAGE_ROOT from its validated
 * source-phase consumer; a workspace alias would not test the shipped API.
 * This spec is authored in Phase A and executed only after CODE_COMPLETE_GO.
 */
const moduleName = "virtual:aura3d-native-clipping-fixture";
const resolvedModuleName = `\0${moduleName}`;
const fixture = String.raw`
import { camera, clipping, createAuraApp, defineAuraAssets, effects, instances, lights, lines, material, model, points, primitives, scene, sprites } from "@aura3d/engine";

const stage = document.querySelector("#stage");
// Independently generated CC0 morph triangle and a CC-BY-4.0 skinned actor
// already admitted by Aura3D; the test checks the exact bytes before serving.
const animationAssets = defineAuraAssets({
  runner: { type: "model", format: "glb", url: "/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb", hash: "sha256-9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f", bounds: [199.856, 199.701, 199.028], sizeBytes: 16354836 },
  morph: { type: "model", format: "gltf", url: "/aura-assets/showcaseMorphExpression.7617880e.gltf", hash: "sha256-7617880e389ad59912ac1efaced7d127e50372aaeb3b1ab8dceefe4bdca39474", bounds: [1.1, 1.25, 0.25], sizeBytes: 2853 }
});
const red = (clip) => material.emissive({ color: "#ff1414", emissive: "#ff1414", emissiveIntensity: 1, ...(clip ? { clipping: clip } : {}) });
const cameraForProbe = () => camera.orthographic({ position: [0, 0, 5], target: [0, 0, 0], orthographicSize: 2, near: 0, far: 20 });
const group = (options) => clipping.global(options);

function makeProbe(name) {
  let global;
  let local;
  let translated = false;
  if (name === "global") global = group({ planes: [[1, 0, 0, 0]] });
  if (name === "local") local = clipping.material({ planes: [[0, 1, 0, 0]], space: "local" });
  if (name === "intersection") global = group({ planes: [[1, 0, 0, 0], [0, 1, 0, 0]], combine: "intersection" });
  if (name === "union") global = group({ planes: [[1, 0, 0, 0], [0, 1, 0, 0]], combine: "union" });
  if (name === "composed") {
    global = group({ planes: [[1, 0, 0, 0]] });
    local = clipping.material({ planes: [[0, 1, 0, 0]], space: "local" });
  }
  if (name === "translated" || name === "translated-control") {
    translated = true;
    if (name === "translated") local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
  }
  const builder = scene({ camera: cameraForProbe(), background: "#000000", ...(global ? { clipping: global } : {}) });
  builder.add(primitives.box({ name: "clip-probe", size: [2, 2, 0.2], material: red(local) }).position(translated ? 0.8 : 0, 0, 0));
  return builder;
}

function primitiveProbe(kind, clipped) {
  const global = group({ planes: [[1, 0, 0, 0]], enabled: clipped });
  const builder = scene({ camera: cameraForProbe(), background: "#000000", clipping: global });
  if (kind === "line") builder.add(lines.fat({ points: [[-1, 0, 0], [1, 0, 0]], width: 10, material: red() }));
  if (kind === "point") builder.add(points({ positions: [[-0.7, 0, 0], [0.7, 0, 0]], size: 20, sizeAttenuation: false, material: red() }));
  if (kind === "sprite") builder.add(sprites.sprite({ position: [0, 0, 0], scale: [2, 2, 1], color: "#ff1414", material: red() }));
  return builder;
}

function instanceProbe(which) {
  const local = which === "local" ? clipping.material({ planes: [[1, 0, 0, 0]], space: "local" }) : undefined;
  const global = which === "world" ? group({ planes: [[1, 0, 0, 0]] }) : undefined;
  return scene({ camera: cameraForProbe(), background: "#000000", ...(global ? { clipping: global } : {}) })
    .add(instances.box({ name: "clip-instances", size: [1, 1, 0.2], transforms: [{ position: [-1, 0, 0] }, { position: [1, 0, 0] }], material: material.pbr({ color: "#ff1111", roughness: 1, ...(local ? { clipping: local } : {}) }) }))
    .add(lights.ambient({ intensity: 2 }));
}

function shadowProbe(clipShadows, shadows) {
  const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local", clipShadows });
  return scene({
    camera: camera.perspective({ position: [4, 6, 8], target: [0, 0.6, 0], fov: 40, near: 0.1, far: 30 }),
    background: "#080808"
  })
    .add(primitives.plane({ name: "receiver", size: [9, 1, 9], material: material.pbr({ color: "#eeeeee", roughness: 1 }), receiveShadow: true, castShadow: false }))
    .add(primitives.box({ name: "caster", size: [2, 2, 2], position: [0, 1.05, 0], material: material.pbr({ color: "#e33322", clipping: local }), castShadow: true }))
    .add(lights.ambient({ intensity: 0.15 }))
    .add(lights.directional({ name: "key", position: [4, 7, 3], intensity: 2.5, shadow: shadows }));
}

function depthProbe(front, clipped, dof) {
  const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "world" });
  const builder = scene({
    camera: camera.perspective({ position: [0, 0, 5], target: [0, 0, 0], fov: 40, near: 0.1, far: 30 }),
    background: "#000000"
  });
  // Alternating narrow high-contrast bands make defocus observable. All sit
  // behind the red foreground, so its discarded half must expose their depth.
  for (let i = 0; i < 14; i += 1) {
    const color = i % 2 ? "#11ff11" : "#113311";
    builder.add(primitives.box({ size: [0.18, 3, 0.1], material: material.emissive({ color, emissive: color, emissiveIntensity: 1 }) }).position(-1.2 + i * 0.18, 0, -3));
  }
  if (front) builder.add(primitives.box({ size: [2, 2, 0.2], material: red(clipped ? local : undefined) }));
  if (dof) builder.add(effects.depthOfField({ focusDistance: 5, focalLength: 100, fStop: 0.5, maxBlur: 8, intensity: 1 }));
  return builder;
}

async function capture(builder) {
  stage.replaceChildren();
  const app = createAuraApp(stage, { autoStart: false, pixelRatio: 1, resize: false, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: builder });
  try {
    await app.ready();
    app.step(1 / 60);
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length) throw new Error(diagnostics.errors.join("; "));
    const canvas = app.canvas;
    if (!canvas) throw new Error("No canvas from root application");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("Clipping fixture requires the WebGL2 candidate backend");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { width: canvas.width, height: canvas.height, pixels: Array.from(pixels), backend: diagnostics.renderer?.runtime?.backend, drawCalls: diagnostics.drawCalls, instanced: diagnostics.renderer?.runtime?.nativeInstancedSubmissions, shadows: diagnostics.renderer?.shadows, passes: diagnostics.renderer?.postprocess?.actualPasses ?? [] };
  } finally { await app.disposeAsync(); }
}

async function deformation(kind) {
  const isRunner = kind === "skinned";
  const clip = group({ planes: [[1, 0, 0, 0]], enabled: false, clipShadows: true });
  const subject = model(isRunner ? animationAssets.runner : animationAssets.morph, {
    name: kind + " clip probe", targetHeight: isRunner ? 2 : 1.5, scaleMode: "fit", castShadow: true
  }).runtime({ id: "deform-probe" });
  if (isRunner) subject.animate({ clip: "OffensiveIdle", loop: true, captureTime: 0.2, speed: 1 });
  const builder = scene({ camera: camera.orthographic({ position: [0, 1, 5], target: [0, 1, 0], orthographicSize: 1.7, near: 0, far: 20 }), background: "#000000", clipping: clip })
    .add(subject)
    .add(lights.ambient({ intensity: 1 }))
    .add(lights.directional({ position: [4, 7, 5], intensity: 2 }));
  stage.replaceChildren();
  const app = createAuraApp(stage, { autoStart: false, pixelRatio: 1, resize: false, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: builder });
  try {
    await app.ready();
    const canvas = app.canvas, gl = canvas?.getContext("webgl2");
    if (!canvas || !gl) throw new Error("No WebGL2 canvas for deforming clipping fixture");
    const node = app.nodes.require("deform-probe");
    const frame = (pose, enabled) => {
      clip.setEnabled(enabled);
      if (isRunner) node.play("OffensiveIdle", { loop: true, captureTime: pose ? 1.2 : 0.2, speed: 1 });
      else node.setMorphTarget("target-0", pose);
      // Keep both clipped and unclipped captures at the same simulation time.
      app.step(0);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { width: canvas.width, height: canvas.height, pixels: Array.from(pixels) };
    };
    const first = frame(0, false), cutFirst = frame(0, true), second = frame(1, false), cutSecond = frame(1, true);
    return { first, cutFirst, second, cutSecond, evidence: node.importedAssetEvidence(), errors: app.diagnostics().errors };
  } finally { await app.disposeAsync(); }
}

async function mutate() {
  const clip = group({ planes: [[1, 0, 0, 0]], enabled: false });
  stage.replaceChildren();
  const app = createAuraApp(stage, { autoStart: false, pixelRatio: 1, resize: false, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: scene({ camera: cameraForProbe(), background: "#000000", clipping: clip }).add(primitives.box({ size: [2, 2, 0.2], material: red() })) });
  try {
    await app.ready();
    const canvas = app.canvas;
    const gl = canvas?.getContext("webgl2");
    if (!canvas || !gl) throw new Error("No WebGL2 canvas for clipping mutation");
    const frame = () => {
      app.step(1 / 60);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { width: canvas.width, height: canvas.height, pixels: Array.from(pixels) };
    };
    const disabled = frame();
    clip.setEnabled(true);
    const enabled = frame();
    clip.update({ planes: [[1, 0, 0, -0.5]] });
    const moved = frame();
    clip.setEnabled(false);
    const restored = frame();
    return { disabled, enabled, moved, restored, diagnostics: app.diagnostics() };
  } finally { await app.disposeAsync(); }
}

window.__AURA3D_NATIVE_CLIPPING__ = {
  probe: async (name) => capture(makeProbe(name)),
  primitive: async (kind, clipped) => capture(primitiveProbe(kind, clipped)),
  instance: async (which) => capture(instanceProbe(which)),
  shadow: async (clipShadows, shadows) => capture(shadowProbe(clipShadows, shadows)),
  depth: async (front, clipped, dof) => capture(depthProbe(front, clipped, dof)),
  mutate,
  deformation,
  invalid: () => {
    try { group({ planes: [[0, 0, 0, 1]] }); return false; } catch { return true; }
  }
};
`;

interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pixels: number[];
  readonly backend?: string;
  readonly drawCalls?: number;
  readonly instanced?: number;
  readonly shadows?: { readonly mapRendered?: boolean; readonly mapSampled?: boolean };
  readonly passes?: readonly string[];
}
interface Harness {
  probe(name: string): Promise<Frame>;
  primitive(kind: string, clipped: boolean): Promise<Frame>;
  instance(which: string): Promise<Frame>;
  shadow(clipShadows: boolean, shadows: boolean): Promise<Frame>;
  depth(front: boolean, clipped: boolean, dof: boolean): Promise<Frame>;
  deformation(kind: "skinned" | "morph"): Promise<{ first: Frame; cutFirst: Frame; second: Frame; cutSecond: Frame; evidence?: { skinnedRenderItemCount?: number; skinningPalette?: { updated?: boolean }; morphRenderItemCount?: number; activeMorphTargets?: Record<string, number> }; errors: string[] }>;
  mutate(): Promise<{ disabled: Frame; enabled: Frame; moved: Frame; restored: Frame; diagnostics: { errors: readonly string[] } }>;
  invalid(): boolean;
}

function fixturePlugin(aliases: readonly InstalledPackageAlias[]): Plugin {
  const candidateExports = new Map(aliases.map((entry) => [entry.find, entry.replacement]));
  return {
    enforce: "pre",
    name: "aura3d-native-clipping-fixture",
    resolveId(id) {
      if (id === moduleName) return resolvedModuleName;
      if (!id.startsWith("@aura3d/")) return undefined;
      const target = candidateExports.get(id);
      if (!target) throw new Error(`Candidate consumer does not export required Aura package: ${id}`);
      return target;
    },
    load(id) { return id === resolvedModuleName ? fixture : undefined; },
    configureServer(server) {
      server.middlewares.use("/wp30-clipping.html", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><style>html,body{margin:0}#stage{width:192px;height:192px}</style><div id="stage"></div><script type="module" src="/@id/__x00__virtual:aura3d-native-clipping-fixture"></script>');
      });
    }
  };
}

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
  const fixtures = [
    ["public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb", "9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f"],
    ["public/aura-assets/showcaseMorphExpression.7617880e.gltf", "7617880e389ad59912ac1efaced7d127e50372aaeb3b1ab8dceefe4bdca39474"]
  ] as const;
  for (const [path, expected] of fixtures) {
    const digest = createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
    if (digest !== expected) throw new Error(`Clipping fixture digest mismatch: ${path}`);
  }
  const aliases = installedAuraPackageAliases();
  const candidateRoot = realpathSync(resolve(root));
  for (const alias of aliases) {
    const entry = realpathSync(alias.replacement);
    if (!entry.startsWith(`${candidateRoot}${sep}`)) throw new Error(`Candidate export resolves outside its installed consumer: ${alias.find}`);
  }
  const engine = aliases.find((entry) => entry.find === "@aura3d/engine");
  if (!engine || realpathSync(engine.replacement).includes("/packages/engine/src/")) {
    throw new Error("The installed candidate must resolve @aura3d/engine to its packed entrypoint");
  }
  server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] }, server: { fs: { allow: [process.cwd(), resolve(root)] } }, plugins: [fixturePlugin(aliases)] });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("The candidate test server has no local origin");
});
test.afterAll(async () => { await server?.close(); });

async function openHarness(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}wp30-clipping.html?capture=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_NATIVE_CLIPPING__?: unknown }).__AURA3D_NATIVE_CLIPPING__), undefined, { timeout: 90_000 }).catch((error) => {
    throw new Error(`Clipping fixture did not load: ${errors.join(" | ")}`, { cause: error });
  });
  expect(errors).toEqual([]);
}

function redPixels(frame: Frame, x0: number, x1: number, y0: number, y1: number): number {
  let count = 0;
  for (let y = Math.floor(y0 * frame.height); y < Math.floor(y1 * frame.height); y++) {
    for (let x = Math.floor(x0 * frame.width); x < Math.floor(x1 * frame.width); x++) {
      const i = 4 * (y * frame.width + x);
      if ((frame.pixels[i] ?? 0) > 60 && (frame.pixels[i] ?? 0) > 1.5 * (frame.pixels[i + 1] ?? 0)) count++;
    }
  }
  return count;
}
function quadrants(frame: Frame): number[] {
  return [redPixels(frame, 0.3, 0.48, 0.3, 0.48), redPixels(frame, 0.52, 0.7, 0.3, 0.48), redPixels(frame, 0.3, 0.48, 0.52, 0.7), redPixels(frame, 0.52, 0.7, 0.52, 0.7)];
}
function visiblePixels(frame: Frame, x0: number, x1: number): number {
  let count = 0;
  for (let y = 0; y < frame.height; y++) for (let x = Math.floor(x0 * frame.width); x < Math.floor(x1 * frame.width); x++) {
    const i = 4 * (y * frame.width + x);
    if (Math.max(frame.pixels[i] ?? 0, frame.pixels[i + 1] ?? 0, frame.pixels[i + 2] ?? 0) > 18) count++;
  }
  return count;
}
function meanDelta(a: Frame, b: Frame, x0 = 0, x1 = 1, y0 = 0, y1 = 1): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let total = 0, samples = 0;
  for (let y = Math.floor(y0 * a.height); y < Math.floor(y1 * a.height); y++) for (let x = Math.floor(x0 * a.width); x < Math.floor(x1 * a.width); x++) {
    const i = 4 * (y * a.width + x);
    for (let channel = 0; channel < 3; channel++) { total += Math.abs((a.pixels[i + channel] ?? 0) - (b.pixels[i + channel] ?? 0)); samples++; }
  }
  return total / samples;
}
function verifyFrame(frame: Frame): void {
  expect(frame.backend).toBe("production-runtime");
  expect(frame.drawCalls).toBeGreaterThan(0);
  expect([frame.width, frame.height]).toEqual([192, 192]);
}

test("global and material planes retain the declared half-spaces and update in a live scene", async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const result = await page.evaluate(async () => {
    const h = (window as unknown as { __AURA3D_NATIVE_CLIPPING__: Harness }).__AURA3D_NATIVE_CLIPPING__;
    const probes: Record<string, Frame> = {};
    for (const name of ["baseline", "global", "local", "intersection", "union", "composed", "translated-control", "translated"]) probes[name] = await h.probe(name);
    return { probes, mutation: await h.mutate(), invalid: h.invalid() };
  });
  expect(result.invalid).toBe(true);
  for (const frame of Object.values(result.probes)) verifyFrame(frame);
  const baseline = quadrants(result.probes.baseline!);
  for (const count of baseline) expect(count).toBeGreaterThan(300);
  const expected: Record<string, readonly boolean[]> = {
    global: [false, true, false, true], local: [false, false, true, true],
    intersection: [false, false, false, true], union: [false, true, true, true], composed: [false, false, false, true]
  };
  for (const [name, retained] of Object.entries(expected)) {
    quadrants(result.probes[name]!).forEach((count, i) => {
      if (retained[i]) expect(count, `${name} quadrant ${i}`).toBeGreaterThan(baseline[i]! * 0.8);
      else expect(count, `${name} quadrant ${i}`).toBeLessThan(baseline[i]! * 0.05);
    });
  }
  const control = result.probes["translated-control"]!, transformed = result.probes.translated!;
  const leftBefore = redPixels(control, 0.5, 0.68, 0.35, 0.65), rightBefore = redPixels(control, 0.72, 0.9, 0.35, 0.65);
  expect(leftBefore).toBeGreaterThan(300); expect(rightBefore).toBeGreaterThan(300);
  expect(redPixels(transformed, 0.5, 0.68, 0.35, 0.65)).toBeLessThan(leftBefore * 0.05);
  expect(redPixels(transformed, 0.72, 0.9, 0.35, 0.65)).toBeGreaterThan(rightBefore * 0.8);
  const { disabled, enabled, moved, restored, diagnostics } = result.mutation;
  expect(diagnostics.errors).toEqual([]);
  const count = (frame: Frame) => redPixels(frame, 0.2, 0.8, 0.2, 0.8);
  expect(count(enabled)).toBeGreaterThan(count(disabled) * 0.4);
  expect(count(enabled)).toBeLessThan(count(disabled) * 0.6);
  expect(count(moved)).toBeGreaterThan(count(enabled) * 0.35);
  expect(count(moved)).toBeLessThan(count(enabled) * 0.65);
  expect(meanDelta(disabled, restored)).toBeLessThan(0.5);
});

test("material-local planes follow each native instance while global planes remain in world space", async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const frames = await page.evaluate(async () => {
    const h = (window as unknown as { __AURA3D_NATIVE_CLIPPING__: Harness }).__AURA3D_NATIVE_CLIPPING__;
    return { baseline: await h.instance("baseline"), local: await h.instance("local"), world: await h.instance("world") };
  });
  for (const frame of Object.values(frames)) { verifyFrame(frame); expect(frame.instanced).toBeGreaterThan(0); }
  const regions = [[0.15, 0.23], [0.27, 0.35], [0.65, 0.73], [0.77, 0.85]] as const;
  const counts = (frame: Frame) => regions.map(([x0, x1]) => redPixels(frame, x0, x1, 0.4, 0.6));
  const baseline = counts(frames.baseline), local = counts(frames.local), world = counts(frames.world);
  baseline.forEach((count) => expect(count).toBeGreaterThan(80));
  for (const index of [0, 2]) expect(local[index]).toBeLessThan(baseline[index]! * 0.1);
  for (const index of [1, 3]) expect(local[index]).toBeGreaterThan(baseline[index]! * 0.7);
  for (const index of [0, 1]) expect(world[index]).toBeLessThan(baseline[index]! * 0.1);
  for (const index of [2, 3]) expect(world[index]).toBeGreaterThan(baseline[index]! * 0.7);
});

test("clipping follows skinned and morphed geometry across animated poses", async ({ page }) => {
  test.setTimeout(600_000);
  await openHarness(page);
  for (const kind of ["skinned", "morph"] as const) {
    const result = await page.evaluate(async (value: "skinned" | "morph") => {
      const h = (window as unknown as { __AURA3D_NATIVE_CLIPPING__: Harness }).__AURA3D_NATIVE_CLIPPING__;
      return h.deformation(value);
    }, kind);
    expect(result.errors).toEqual([]);
    if (kind === "skinned") {
      expect(result.evidence?.skinnedRenderItemCount).toBeGreaterThan(0);
      expect(result.evidence?.skinningPalette?.updated).toBe(true);
    } else {
      expect(result.evidence?.morphRenderItemCount).toBeGreaterThan(0);
      expect(Object.values(result.evidence?.activeMorphTargets ?? {})).toContain(1);
    }
    for (const [before, cut] of [[result.first, result.cutFirst], [result.second, result.cutSecond]] as const) {
      const left = visiblePixels(before, 0, 0.49), right = visiblePixels(before, 0.51, 1);
      expect(left, `${kind} uncut left`).toBeGreaterThan(30);
      expect(right, `${kind} uncut right`).toBeGreaterThan(30);
      expect(visiblePixels(cut, 0, 0.49), `${kind} cut left`).toBeLessThan(left * 0.1);
      expect(visiblePixels(cut, 0.51, 1), `${kind} cut right`).toBeGreaterThan(right * 0.8);
      expect(meanDelta(before, cut, 0.51, 1, 0, 1), `${kind} retained region`).toBeLessThan(1);
    }
    expect(meanDelta(result.first, result.second, 0.51, 1, 0, 1), `${kind} pose changes subject pixels`).toBeGreaterThan(0.01);
    expect(meanDelta(result.cutFirst, result.cutSecond, 0.51, 1, 0, 1), `${kind} clipped geometry still deforms`).toBeGreaterThan(0.01);
  }
});

test("clipping applies to lines, points, and sprites", async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const pairs = await page.evaluate(async () => {
    const h = (window as unknown as { __AURA3D_NATIVE_CLIPPING__: Harness }).__AURA3D_NATIVE_CLIPPING__;
    const out: Record<string, [Frame, Frame]> = {};
    for (const kind of ["line", "point", "sprite"]) out[kind] = [await h.primitive(kind, false), await h.primitive(kind, true)];
    return out;
  });
  for (const [kind, [before, after]] of Object.entries(pairs)) {
    verifyFrame(before); verifyFrame(after);
    const left = redPixels(before, 0.2, 0.48, 0.2, 0.8), right = redPixels(before, 0.52, 0.8, 0.2, 0.8);
    expect(left, `${kind} baseline left`).toBeGreaterThan(30); expect(right, `${kind} baseline right`).toBeGreaterThan(30);
    expect(redPixels(after, 0.2, 0.48, 0.2, 0.8), `${kind} discarded`).toBeLessThan(left * 0.1);
    expect(redPixels(after, 0.52, 0.8, 0.2, 0.8), `${kind} retained`).toBeGreaterThan(right * 0.7);
  }
});

test("clipped casters participate in shadow and sampled depth passes", async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const frames = await page.evaluate(async () => {
    const h = (window as unknown as { __AURA3D_NATIVE_CLIPPING__: Harness }).__AURA3D_NATIVE_CLIPPING__;
    return {
      shadowFull: await h.shadow(false, true), shadowClipped: await h.shadow(true, true),
      noShadowFull: await h.shadow(false, false), noShadowClipped: await h.shadow(true, false),
      depthReference: await h.depth(false, false, true), depthCut: await h.depth(true, true, true),
      depthUncut: await h.depth(true, false, true), noDof: await h.depth(false, false, false)
    };
  });
  for (const frame of Object.values(frames)) verifyFrame(frame);
  expect(frames.shadowFull.shadows?.mapRendered).toBe(true);
  expect(frames.shadowFull.shadows?.mapSampled).toBe(true);
  expect(frames.shadowClipped.shadows?.mapRendered).toBe(true);
  expect(meanDelta(frames.noShadowFull, frames.noShadowClipped)).toBeLessThan(0.5);
  expect(meanDelta(frames.shadowFull, frames.shadowClipped)).toBeGreaterThan(0.1);
  expect(frames.depthCut.passes).toContain("depth-of-field");
  expect(meanDelta(frames.depthReference, frames.noDof, 0.3, 0.42, 0.3, 0.7)).toBeGreaterThan(0.5);
  expect(meanDelta(frames.depthReference, frames.depthUncut, 0.3, 0.42, 0.3, 0.7)).toBeGreaterThan(10);
  expect(meanDelta(frames.depthReference, frames.depthCut, 0.3, 0.42, 0.3, 0.7)).toBeLessThan(3);
});
