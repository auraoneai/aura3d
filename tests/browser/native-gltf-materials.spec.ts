import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { retainTemporalFrame } from "./root-temporal-evidence";

type Backend = "webgl2" | "webgpu";
type Frame = { id: string; pixels: number[]; drawCalls: number; lastError: string | null };
type MaterialResult = {
  unsupported?: string;
  backend?: string;
  adapter?: unknown;
  size?: number;
  extensions?: string[];
  frames?: Frame[];
  variantResults?: string[];
  animationResults?: Array<{ materialTracksApplied: number; missingTargets: string[]; unsupportedTracks: string[] }>;
  disposed?: boolean;
};

/**
 * Independently authored glTF 2.0 triangle, with two material variants and an
 * actual KHR_animation_pointer sampler. Each capture uses the same mesh,
 * camera and renderer. The fixture tests imported material behavior, not an
 * inferred material value or a screenshot of a mock scene.
 */
test.describe("native glTF material pixels", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const backend of ["webgl2", "webgpu"] as const) {
    test(`${backend} renders emissive strength, variant switching and pointer animation`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await openPage(page, server.origin);
      const result = await renderFixture(page, backend);
      if (result.unsupported) { test.skip(true, result.unsupported); return; }
      expect(result.backend).toBe(backend);
      expect(result.extensions).toEqual(expect.arrayContaining(["KHR_materials_variants", "KHR_materials_emissive_strength", "KHR_animation_pointer"]));
      expect(result.variantResults).toEqual(["applied", "variant-unknown", "applied"]);
      expect(result.disposed).toBe(true);
      expect(errors).toEqual([]);
      const size = result.size;
      if (!size || !result.frames) throw new Error("Material fixture returned no frames");
      const byId = new Map(result.frames.map((frame) => [frame.id, frame]));
      const get = (id: string): Frame => {
        const frame = byId.get(id);
        if (!frame) throw new Error(`Missing glTF material frame ${id}`);
        expect(frame.drawCalls, id).toBeGreaterThan(0);
        expect(frame.lastError, id).toBeNull();
        expect(frame.pixels).toHaveLength(size * size * 4);
        return frame;
      };
      for (const frame of result.frames) {
        const artifact = retainTemporalFrame(testInfo.outputPath(`${backend}-${frame.id}.png`), size, size, frame.pixels,
          backend === "webgl2" ? "bottom-left" : "top-left");
        await testInfo.attach(`${backend}-${frame.id}`, { path: artifact.path, contentType: "image/png" });
      }
      const base = get("base"), boosted = get("boosted"), unknown = get("unknown"), restored = get("restored");
      const low = get("animation-low"), high = get("animation-high");
      const controls = { variant: difference(base, boosted), unknown: difference(boosted, unknown), restored: difference(base, restored), animation: difference(low, high) };
      await testInfo.attach(`${backend}-gltf-material-report`, { body: JSON.stringify({ backend, adapter: result.adapter, controls, animationResults: result.animationResults }, null, 2), contentType: "application/json" });
      for (const [name, diff] of [["variant", controls.variant], ["animation", controls.animation]] as const) {
        expect(diff.changedPixels, name).toBeGreaterThan(300);
        expect(diff.meanDelta, name).toBeGreaterThan(0.5);
        expect(diff.cornerDelta, name).toBe(0);
      }
      expect(controls.unknown.changedPixels).toBe(0);
      expect(controls.restored.changedPixels).toBe(0);
      expect(subjectRed(boosted, size)).toBeGreaterThan(subjectRed(base, size) + 10);
      expect(subjectRed(high, size)).toBeGreaterThan(subjectRed(low, size) + 10);
      expect(result.animationResults).toHaveLength(2);
      for (const applied of result.animationResults ?? []) {
        expect(applied.materialTracksApplied).toBe(1);
        expect(applied.missingTargets).toEqual([]);
        expect(applied.unsupportedTracks).toEqual([]);
      }
    });
  }
});

async function openPage(page: Page, origin: string): Promise<void> {
  const url = `${origin}/__native_gltf_materials__.html`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto(url);
}

async function renderFixture(page: Page, backend: Backend): Promise<MaterialResult> {
  return page.evaluate(async (selectedBackend) => {
    const paths = ["/packages/assets/src/browser-index.ts", "/packages/rendering/src/index.ts"];
    const [{ GLTFLoader, LoadContext, createGLTFRenderResources, createGLTFSceneAnimationRuntime }, { Renderer }] = await Promise.all(paths.map((path) => import(path)));
    const canvas = document.createElement("canvas");
    const size = 96;
    canvas.width = canvas.height = size;
    document.body.append(canvas);
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (selectedBackend === "webgpu" && !gpu) { canvas.remove(); return { unsupported: "navigator.gpu is unavailable" }; }
    if (selectedBackend === "webgpu" && !await gpu!.requestAdapter()) { canvas.remove(); return { unsupported: "WebGPU adapter unavailable" }; }
    if (selectedBackend === "webgl2" && !canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true })) {
      canvas.remove(); return { unsupported: "WebGL2 context unavailable" };
    }
    // 3 positions, 3 normals, 2 times and 2 animated scalar values.
    const data = new Float32Array([-0.8, -0.8, 0, 0.8, -0.8, 0, 0, 0.8, 0,
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0.25, 3]);
    const bytes = new Uint8Array(data.buffer);
    const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    const gltf = {
      asset: { version: "2.0", generator: "Aura3D independently authored material acceptance fixture" },
      extensionsUsed: ["KHR_materials_variants", "KHR_materials_emissive_strength", "KHR_animation_pointer"],
      extensions: { KHR_materials_variants: { variants: [{ name: "boosted" }] } },
      buffers: [{ uri: `data:application/octet-stream;base64,${encoded}`, byteLength: bytes.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 },
        { buffer: 0, byteOffset: 72, byteLength: 8 }, { buffer: 0, byteOffset: 80, byteLength: 8 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.8, -0.8, 0], max: [0.8, 0.8, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
        { bufferView: 3, componentType: 5126, count: 2, type: "SCALAR" }],
      materials: [1, 4].map((strength, index) => ({ name: index === 0 ? "BaseGlow" : "BoostedGlow", doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
        emissiveFactor: [0.12, 0.06, 0.03], extensions: { KHR_materials_emissive_strength: { emissiveStrength: strength } } })),
      meshes: [{ name: "MaterialTriangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0,
        extensions: { KHR_materials_variants: { mappings: [{ material: 1, variants: [0] }] } } }] }],
      nodes: [{ name: "MaterialPanel", mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
      animations: [{ name: "glow", samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: {
          pointer: "/materials/0/extensions/KHR_materials_emissive_strength/emissiveStrength" } } } }] }]
    };
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` }, new LoadContext());
    const resources = await createGLTFRenderResources(asset);
    const runtime = createGLTFSceneAnimationRuntime({ scene: resources.scene, clips: asset.animations,
      resolveAnimationMaterial: (name: string) => {
        const found = [...resources.materialLibrary.values()].find((material: { name: string }) => material.name === name) as { name: string; setParameter(key: string, value: unknown): void } | undefined;
        return found ? { name: found.name, setAnimationParameter: (key: string, value: unknown) => found.setParameter(key, value) } : undefined;
      } });
    const renderer = await Renderer.create({ backend: selectedBackend, canvas, width: size, height: size,
      clearColor: [0, 0, 0, 1], antialias: false, preserveDrawingBuffer: true });
    const target = renderer.device.createRenderTarget({ width: size, height: size, format: "rgba8", depth: true, label: "native-gltf-material" });
    const frames: Frame[] = [];
    const capture = async (id: string): Promise<void> => {
      const source = resources.toRenderSource({ qualityPreset: "default", cameraPolicy: "identity", environmentLighting: false, postprocess: false, frustumCulling: false });
      const diagnostics = await renderer.renderAsync({ ...source, renderTarget: target });
      renderer.device.setRenderTarget(target);
      const pixels = selectedBackend === "webgpu" ? await renderer.device.readPixelsAsync(0, 0, size, size) : renderer.device.readPixels(0, 0, size, size);
      frames.push({ id, pixels: Array.from(pixels as Uint8Array), drawCalls: diagnostics.drawCalls, lastError: diagnostics.lastError ?? null });
    };
    let result: MaterialResult | undefined;
    try {
      await capture("base");
      const selected = await resources.setMaterialVariant("boosted");
      await capture("boosted");
      const unknown = await resources.setMaterialVariant("missing");
      await capture("unknown");
      const restored = await resources.setMaterialVariant(null);
      await capture("restored");
      const low = runtime.applyClipByName("glow", 0);
      await capture("animation-low");
      const high = runtime.applyClipByName("glow", 1);
      await capture("animation-high");
      result = { backend: renderer.device.kind, adapter: renderer.device.info, size, extensions: asset.loaderDiagnostics.extensionsUsed,
        frames, variantResults: [selected, unknown, restored], animationResults: [low, high], disposed: false };
    } finally {
      runtime.dispose();
      for (const material of new Set(resources.materialLibrary.values()) as Set<{ dispose(): void }>) material.dispose();
      resources.dispose(); resources.scene.dispose(); loader.dispose(asset); target.dispose(); renderer.dispose(); canvas.remove();
      if (result) result.disposed = target.disposed && renderer.device.disposed && !canvas.isConnected;
    }
    if (!result) throw new Error("Material workload did not return a result");
    return result;
  }, backend);
}

function difference(a: Frame, b: Frame): { changedPixels: number; meanDelta: number; cornerDelta: number } {
  expect(a.pixels).toHaveLength(b.pixels.length);
  let changedPixels = 0, sum = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    const delta = [0, 1, 2].reduce((total, channel) => total + Math.abs(a.pixels[i + channel]! - b.pixels[i + channel]!), 0);
    if (delta > 6) changedPixels += 1;
    sum += delta;
  }
  const cornerDelta = [0, 1, 2, 3].reduce((total, channel) => total + Math.abs(a.pixels[channel]! - b.pixels[channel]!), 0);
  return { changedPixels, meanDelta: sum / (a.pixels.length / 4 * 3), cornerDelta };
}

function subjectRed(frame: Frame, size: number): number {
  let sum = 0, count = 0;
  for (let y = Math.floor(size * 0.4); y < Math.floor(size * 0.55); y += 1) for (let x = Math.floor(size * 0.4); x < Math.floor(size * 0.6); x += 1) {
    sum += frame.pixels[(y * size + x) * 4]!; count += 1;
  }
  return sum / count;
}
