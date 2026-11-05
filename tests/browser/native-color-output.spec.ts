import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { type Plugin, type ViteDevServer } from "vite";
import { createServer } from "./native-vite-server";
import { installedAuraPackageAliases } from "./installed-package-resolve";

// The two PNGs are Aura3D-authored analytical fixtures registered by
// tools/root-textured-fixtures/index.ts. Their content hashes identify the
// exact bytes used here. This spec is authored in Phase A; it may run only
// against the installed frozen candidate after the global source gate.
const moduleName = "virtual:aura3d-native-color-output";
const moduleId = `\0${moduleName}`;
const script = `
import { camera, createAuraApp, defineAuraAssets, effects, lights, material, primitives, scene } from "@aura3d/engine";
const assets = defineAuraAssets({
  rgba: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-extension/generated/rgba.3b557885.png", hash: "sha256-3b5578856890800a6fd83bbfc80d73c850a23f48e3595d71adb7427a3f17cd33" },
  white: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-extension/generated/white.0ef49469.png", hash: "sha256-0ef494696c1d5792fde371da1ac80c500774fc1c2ced0dcef89ecbff584e405f" }
});
/** Read a presented canvas through the 2D API, encoded in the given color space. */
async function readPresented(app, colorSpace) {
  const shot = await app.screenshotAsync();
  const image = new Image(); image.src = shot.dataUrl; await image.decode();
  const copy = document.createElement("canvas"); copy.width = shot.width; copy.height = shot.height;
  const context = copy.getContext("2d", { colorSpace });
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, shot.width, shot.height, { colorSpace }).data;
  // Match the WebGL readPixels row order (bottom row first).
  const rows = new Uint8Array(data.length), stride = shot.width * 4;
  for (let y = 0; y < shot.height; y++) rows.set(data.subarray((shot.height - 1 - y) * stride, (shot.height - y) * stride), y * stride);
  return { width: shot.width, height: shot.height, pixels: rows };
}
window.runColorProbe = async ({ outputColorSpace, exposure, light, texture, backend = "webgl2" }) => {
  const stage = document.createElement("div");
  Object.assign(stage.style, { width: "96px", height: "96px" });
  document.body.append(stage);
  const builder = scene({ camera: camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 40 }), background: "#000000" })
    .add(primitives.box({ name: "color-card", material: material.pbr({ color: "#ffffff", texture: assets[texture], roughness: 1, metallic: 0 }) }).scale([1.8, 1.8, 1.8]))
    .add(lights.ambient({ color: "#ffffff", intensity: light }))
    .add(lights.directional({ color: "#ffffff", position: [0, 0, 4], intensity: light }))
    .add(effects.bloom({ intensity: 0.1, threshold: 0.9 }));
  const app = createAuraApp(stage, { autoStart: false, pixelRatio: 1, resize: false, preserveDrawingBuffer: true,
    renderer: { qualityProfile: "production", ...(backend === "webgpu" ? { backend: "webgpu", allowFallback: false } : {}),
      output: { outputColorSpace, exposure, toneMapping: "reinhard", dither: false } }, scene: builder });
  try {
    await app.ready();
    const deadline = performance.now() + 30000;
    let textured = false;
    while (performance.now() < deadline) {
      await app.stepAsync(1 / 60);
      textured = (app.diagnostics().renderer?.runtime.texturedMaterials ?? []).some((entry) => entry.nodeName === "color-card" && entry.pixelBacked);
      if (textured) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!textured) throw new Error("Texture upload never completed: " + JSON.stringify(app.diagnostics()));
    await app.stepAsync(1 / 60);
    const canvas = app.canvas;
    if (!canvas) throw new Error("No app canvas");
    if (backend === "webgpu") {
      // The configured canvas context is the presentation truth on WebGPU.
      const configured = canvas.getContext("webgpu")?.getConfiguration?.() ?? null;
      const drawingBufferColorSpace = configured ? configured.colorSpace ?? "srgb" : null;
      const read = await readPresented(app, drawingBufferColorSpace === "display-p3" ? "display-p3" : "srgb");
      const diagnostics = app.diagnostics();
      return { width: read.width, height: read.height, pixels: Array.from(read.pixels), drawCalls: diagnostics.drawCalls,
        errors: diagnostics.errors, runtimeBackend: diagnostics.renderer?.runtime.backend, deviceBackend: app.backend, textured,
        output: diagnostics.output, drawingBufferColorSpace, configuredAlphaMode: configured?.alphaMode ?? null };
    }
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 unavailable");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    const output = diagnostics.output;
    return { width: canvas.width, height: canvas.height, pixels: Array.from(pixels), drawCalls: diagnostics.drawCalls,
      errors: diagnostics.errors, runtimeBackend: diagnostics.renderer?.runtime.backend, deviceBackend: app.backend, textured,
      output, drawingBufferColorSpace: gl.drawingBufferColorSpace ?? "srgb" };
  } finally { await app.disposeAsync(); stage.remove(); }
};
`;

function fixturePlugin(): Plugin {
  return {
    name: "native-color-output-fixture",
    resolveId(id) { return id === moduleName ? moduleId : undefined; },
    load(id) { return id === moduleId ? script : undefined; },
    configureServer(server) {
      server.middlewares.use("/wp32-color.html", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><html><body><script type="module" src="/@id/__x00__virtual:aura3d-native-color-output"></script></body></html>');
      });
    }
  };
}

type Negotiation = { requested: "srgb" | "display-p3"; active: "srgb" | "display-p3"; supported: string[]; fallbackReason?: string };
type Capture = {
  width: number; height: number; pixels: number[]; drawCalls: number; errors: string[];
  runtimeBackend: string; deviceBackend: string; textured: boolean; output: { colorSpace?: Negotiation } | null;
  drawingBufferColorSpace: string | null; configuredAlphaMode?: string | null;
};
type ProbeInput = { outputColorSpace: "srgb" | "display-p3"; exposure: number; light: number; texture: "rgba" | "white"; backend?: "webgl2" | "webgpu" };

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
  const aliases = installedAuraPackageAliases();
  const engine = aliases.find((entry) => entry.find === "@aura3d/engine");
  if (!engine || realpathSync(engine.replacement).includes("/packages/engine/src/")) throw new Error("Expected the packed root engine entrypoint");
  server = await createServer({ root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] },
    server: { fs: { allow: [process.cwd(), resolve(root)] } }, plugins: [fixturePlugin()] });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("Candidate test server has no local origin");
});
test.afterAll(async () => { await server?.close(); });

/** Compare the central card, excluding edges and background. */
function centerMean(capture: Capture): number[] {
  const sum = [0, 0, 0, 0];
  let count = 0;
  for (let y = Math.floor(capture.height * 0.42); y < Math.ceil(capture.height * 0.58); y++) {
    for (let x = Math.floor(capture.width * 0.42); x < Math.ceil(capture.width * 0.58); x++) {
      const offset = (y * capture.width + x) * 4;
      for (let c = 0; c < 4; c++) sum[c] = sum[c]! + capture.pixels[offset + c]!;
      count++;
    }
  }
  return sum.map((value) => value / count);
}

function colorDistance(a: number[], b: number[]): number {
  return [0, 1, 2].reduce((sum, channel) => sum + Math.abs(a[channel]! - b[channel]!), 0);
}

/** Independent D65 sRGB-to-P3 reference for matching display-linear samples. */
function srgbBytesToP3(rgb: number[]): number[] {
  const linear = rgb.slice(0, 3).map((byte) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const matrix = [
    [0.8224619687, 0.1775380313, 0],
    [0.0331941989, 0.9668058011, 0],
    [0.0170826307, 0.0723974407, 0.9105199286]
  ];
  return matrix.map((row) => {
    const c = Math.max(0, Math.min(1, row.reduce((sum, value, i) => sum + value * linear[i]!, 0)));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  });
}

test("packed app renders color textures through lighting, post and negotiated presentation", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}wp32-color.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as unknown as { runColorProbe?: unknown }).runColorProbe === "function");
  const probe = (input: ProbeInput) => page.evaluate((options) =>
    (window as unknown as { runColorProbe(value: ProbeInput): Promise<Capture> }).runColorProbe(options), input);
  const base: ProbeInput = { outputColorSpace: "srgb", exposure: 1, light: 1, texture: "rgba" };
  const srgb = await probe(base);
  const white = await probe({ ...base, texture: "white" });
  const dim = await probe({ ...base, light: 0.08 });
  const underexposed = await probe({ ...base, exposure: 0.2 });
  const p3 = await probe({ ...base, outputColorSpace: "display-p3" });
  for (const capture of [srgb, white, dim, underexposed, p3]) {
    expect(capture.errors).toEqual([]);
    expect(capture.runtimeBackend).toBe("production-runtime");
    expect(capture.textured).toBe(true);
    expect(capture.drawCalls).toBeGreaterThan(0);
    expect(capture.pixels).toHaveLength(capture.width * capture.height * 4);
  }
  const sample = centerMean(srgb);
  expect(colorDistance(sample, centerMean(white))).toBeGreaterThan(8);
  expect(colorDistance(sample, centerMean(dim))).toBeGreaterThan(8);
  expect(colorDistance(sample, centerMean(underexposed))).toBeGreaterThan(8);
  expect(srgb.output?.colorSpace).toMatchObject({ requested: "srgb", active: "srgb" });
  expect(p3.output?.colorSpace?.requested).toBe("display-p3");
  expect(p3.output?.colorSpace?.active).toBe(p3.drawingBufferColorSpace);
  if (p3.output?.colorSpace?.active === "display-p3") {
    expect(p3.output.colorSpace.supported).toContain("display-p3");
    expect(colorDistance(centerMean(p3), srgbBytesToP3(sample))).toBeLessThan(18);
  } else {
    expect(p3.output?.colorSpace).toMatchObject({ active: "srgb" });
    expect(p3.output?.colorSpace?.fallbackReason).toBeTruthy();
    expect(colorDistance(centerMean(p3), sample)).toBeLessThan(8);
  }
  expect(errors).toEqual([]);
});

test("WebGPU presents negotiated Display-P3 on an opaque canvas or reports its sRGB fallback", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}wp32-color.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as unknown as { runColorProbe?: unknown }).runColorProbe === "function");
  // A missing adapter fails this required entry; it is never reported as a pass.
  const adapter = await page.evaluate(async () => Boolean(await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter()));
  expect(adapter, "WebGPU adapter available").toBe(true);
  const probe = (input: ProbeInput) => page.evaluate((options) =>
    (window as unknown as { runColorProbe(value: ProbeInput): Promise<Capture> }).runColorProbe(options), input);
  const base: ProbeInput = { outputColorSpace: "srgb", exposure: 1, light: 1, texture: "rgba", backend: "webgpu" };
  const srgb = await probe(base);
  const p3 = await probe({ ...base, outputColorSpace: "display-p3" });
  for (const capture of [srgb, p3]) {
    expect(capture.errors).toEqual([]);
    expect(capture.deviceBackend).toBe("webgpu");
    expect(capture.runtimeBackend).toBe("production-runtime");
    expect(capture.textured).toBe(true);
    expect(capture.drawCalls).toBeGreaterThan(0);
    expect(capture.pixels).toHaveLength(capture.width * capture.height * 4);
  }
  const sample = centerMean(srgb);
  expect(srgb.output?.colorSpace).toMatchObject({ requested: "srgb", active: "srgb" });
  expect(p3.output?.colorSpace?.requested).toBe("display-p3");
  // The reported active space is the one the canvas context was configured with.
  expect(p3.output?.colorSpace?.active).toBe(p3.drawingBufferColorSpace);
  if (p3.output?.colorSpace?.active === "display-p3") {
    expect(p3.configuredAlphaMode).toBe("opaque");
    expect(p3.output.colorSpace.supported).toContain("display-p3");
    expect(colorDistance(centerMean(p3), srgbBytesToP3(sample))).toBeLessThan(18);
  } else {
    expect(p3.output?.colorSpace).toMatchObject({ active: "srgb" });
    expect(p3.output?.colorSpace?.fallbackReason).toBeTruthy();
    expect(colorDistance(centerMean(p3), sample)).toBeLessThan(8);
  }
  expect(errors).toEqual([]);
});
