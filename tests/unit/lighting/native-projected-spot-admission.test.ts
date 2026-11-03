import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RendererOptions } from "../../../packages/rendering/src/Renderer";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { normalizeCreateAppRendererOptions } from "../../../packages/engine/src/agent-api/app/rendererOptions";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeSceneRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { unsupportedLightModulationDegradations } from "../../../packages/engine/src/agent-api/compiler/observations";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraAssetRef, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function pvr(): Uint8Array {
  const bytes = new Uint8Array(52 + 16);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x03525650, true);
  header.setUint32(8, 0x61626772, true);
  header.setUint32(12, 0x08080808, true);
  header.setUint32(16, 1, true);
  header.setUint32(24, 2, true);
  header.setUint32(28, 2, true);
  header.setUint32(32, 1, true);
  header.setUint32(36, 1, true);
  header.setUint32(40, 1, true);
  header.setUint32(44, 1, true);
  bytes.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255], 52);
  return bytes;
}

function textureAsset(bytes = pvr()): AuraAssetRef<"texture"> {
  return defineAuraAssets({ pattern: {
    type: "texture", format: "pvr", url: "https://assets.example.test/projection.pvr",
    hash: `sha256-${createHash("sha256").update(bytes).digest("hex")}`
  } }).pattern;
}

const profile = {
  profile: { format: "ies-lm63", photometricType: "C", verticalAngles: [0, 180], horizontalAngles: [0], candela: [1, 1], symmetry: "rotational" }
} as never;

function snapshot(asset?: AuraAssetRef<"texture">): AuraSceneSnapshot {
  const builder = scene().add(primitives.box());
  if (asset) builder.add(lights.spot({ name: "projection", projectedImage: { texture: asset } }).runtime({ id: "projection" }));
  return builder.toJSON() as AuraSceneSnapshot;
}

function flags(compiler: boolean) {
  return resolveQrFlags({ options: { A3D_QR_COMPILER: compiler, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } });
}

function mockRenderer(options: { readonly admission?: boolean; readonly backend?: "webgl2" | "webgpu"; readonly fence?: boolean } = {}) {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://assets.example.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
  const create = Renderer.create.bind(Renderer);
  let admission: RendererOptions["projectedSpotImages"];
  vi.spyOn(Renderer, "create").mockImplementation(async (rendererOptions = {}) => {
    admission = rendererOptions.projectedSpotImages;
    const renderer = await create({ ...rendererOptions, backend: "mock", requiredFeatures: [] });
    Object.defineProperty(renderer.device, "kind", { value: options.backend ?? "webgl2" });
    Object.defineProperty(renderer.device, "info", { value: { ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets", "native-render-pipeline", "canvas-surface"] } });
    Object.defineProperty(renderer.device, "generation", { value: 1 });
    Object.defineProperty(renderer.device, "onDeviceLost", { value: () => () => {} });
    Object.defineProperty(renderer.device, "waitForSubmittedWork", { value: () => Promise.resolve() });
    Object.defineProperty(renderer.device, "supportsSubmittedWorkCompletion", { value: () => options.fence !== false });
    Object.defineProperty(renderer, "projectedSpotImageAdmissionEnabled", { value: () => options.admission !== false });
    return renderer;
  });
  return () => admission;
}

async function mount(requested: boolean | undefined, strict: boolean, asset?: AuraAssetRef<"texture">, compiler = true, onDegradation = vi.fn(), backend: "webgl2" | "webgpu" = "webgl2") {
  const input = snapshot(asset);
  const qrFlags = flags(compiler);
  const registry = createAuraRuntimeNodeRegistry(input, { flags: qrFlags });
  try {
    const controller = await createProductionRuntimeSceneRenderer(
      new FakeCanvas() as unknown as HTMLCanvasElement, input,
      { ...(requested === undefined ? {} : { projectedSpotImages: requested }), backend },
      registry, qrFlags, { strict, onDegradation }
    );
    return { controller, registry, onDegradation };
  } catch (error) {
    registry.dispose();
    throw error;
  }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("projected spotlight opt-in and diagnostics", () => {
  it("defaults off and rejects non-boolean values before mounting", () => {
    expect(normalizeCreateAppRendererOptions(undefined).projectedSpotImages).toBe(false);
    expect(normalizeCreateAppRendererOptions({ projectedSpotImages: false }).projectedSpotImages).toBe(false);
    expect(normalizeCreateAppRendererOptions({ projectedSpotImages: true }).projectedSpotImages).toBe(true);
    for (const value of [null, 1, "true", {}]) {
      expect(() => normalizeCreateAppRendererOptions({ projectedSpotImages: value } as never)).toThrow(/renderer\.projectedSpotImages/);
    }
  });

  it("defers projected and photometric intent independently", () => {
    const node = lights.spot({ projectedImage: { texture: textureAsset() }, photometricProfile: profile }).toJSON();
    const original = unsupportedLightModulationDegradations([node]);
    expect(original[0]!.message).toContain("photometricProfile and projectedImage");
    const projected = unsupportedLightModulationDegradations([node], { deferProjectedSpotImages: true });
    expect(projected[0]!.message).toContain("photometricProfile");
    expect(projected[0]!.message).not.toContain("projectedImage");
    const photometric = unsupportedLightModulationDegradations([node], { deferPhotometricProfiles: true });
    expect(photometric[0]!.message).toContain("projectedImage");
    expect(unsupportedLightModulationDegradations([node], { deferPhotometricProfiles: true, deferProjectedSpotImages: true })).toEqual([]);
  });

  it.each([undefined, false])("keeps the scalar fallback observable with opt-in %s", async (requested) => {
    const admission = mockRenderer();
    const mounted = await mount(requested, false, textureAsset());
    expect(admission()).toBeUndefined();
    expect(mounted.onDegradation).toHaveBeenCalledWith(expect.objectContaining({ code: "capability-degraded", message: expect.stringContaining("projectedImage") }));
    expect(mounted.controller.diagnostics.warnings.some((warning) => warning.includes("LIGHT_MODULATION_UNSUPPORTED") && warning.includes("projectedImage"))).toBe(true);
    mounted.controller.dispose(); mounted.registry.dispose();
    await mounted.controller.whenDisposed?.();
  });

  it("rejects the same default-off unsupported light in strict mode", async () => {
    mockRenderer();
    await expect(mount(undefined, true, textureAsset())).rejects.toThrow(/LIGHT_MODULATION_UNSUPPORTED.*projectedImage/);
  });

  it.each([
    ["renderer did not admit the callback", { admission: false }, true],
    ["device completion is unavailable", { fence: false }, true],
    ["scene compiler is disabled", {}, false]
  ] as const)("does not defer diagnostics when %s", async (_case, renderer, compiler) => {
    const admission = mockRenderer(renderer);
    const mounted = await mount(true, false, textureAsset(), compiler);
    expect(admission()).toBeDefined();
    expect(admission()!.resolveResource(textureAsset())).toBeUndefined();
    expect(mounted.controller.diagnostics.warnings.some((warning) => warning.includes("LIGHT_MODULATION_UNSUPPORTED") && warning.includes("projectedImage"))).toBe(true);
    mounted.controller.dispose(); mounted.registry.dispose();
    await mounted.controller.whenDisposed?.();
  });

  it("does not defer projected diagnostics on WebGPU", async () => {
    const admission = mockRenderer({ backend: "webgpu" });
    const mounted = await mount(true, false, textureAsset(), true, vi.fn(), "webgpu");
    expect(admission()).toBeDefined();
    expect(mounted.controller.diagnostics.warnings.some((warning) => warning.includes("LIGHT_MODULATION_UNSUPPORTED") && warning.includes("projectedImage"))).toBe(true);
    mounted.controller.dispose(); mounted.registry.dispose();
    await mounted.controller.whenDisposed?.();
  });

  it("rejects strict mount if the renderer has not admitted the projected route", async () => {
    mockRenderer({ admission: false });
    await expect(mount(true, true, textureAsset())).rejects.toThrow(/projectedImage/);
  });

  it("resolves only the loaded exact typed asset after real compiler admission", async () => {
    const bytes = pvr();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer)));
    const source = textureAsset(bytes);
    const admission = mockRenderer();
    const mounted = await mount(true, true, source);
    const resource = admission()!.resolveResource(source);
    expect(resource?.matchesAsset(source)).toBe(true);
    expect(admission()!.resolveResource(textureAsset(bytes))).toBeUndefined();
    expect(mounted.controller.diagnostics.warnings.some((warning) => warning.includes("LIGHT_MODULATION_UNSUPPORTED") && warning.includes("projectedImage"))).toBe(false);
    mounted.controller.dispose(); mounted.registry.dispose();
    await mounted.controller.whenDisposed?.();
    expect(admission()!.resolveResource(source)).toBeUndefined();
  });

  it("keeps a sanitized per-view failure visible and routes it to the non-strict sink", async () => {
    const admission = mockRenderer();
    const mounted = await mount(true, false);
    admission()!.onUnsupported({ viewId: "main", frameIndex: 4, reason: "clustered", message: "Cannot sample https://assets.example.test/pvr?token=private" });
    admission()!.onUnsupported({ viewId: "probe:0", frameIndex: 5, reason: "material", message: "Unsupported material" });
    admission()!.onUnsupported({ viewId: "main", frameIndex: 3, reason: "clustered", message: "older frame" });
    mounted.controller.update!(1000);
    const warnings = mounted.controller.diagnostics.warnings.filter((warning) => warning.includes("PROJECTED_SPOT_UNSUPPORTED"));
    expect(warnings).toHaveLength(2);
    expect(warnings.some((warning) => warning.includes("view main, frame 4, clustered"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("view probe:0, frame 5, material"))).toBe(true);
    expect(warnings.join(" ")).not.toContain("private");
    expect(mounted.onDegradation).toHaveBeenCalledWith(expect.objectContaining({ code: "capability-degraded", frame: 4, message: expect.stringContaining("PROJECTED_SPOT_UNSUPPORTED") }));
    mounted.controller.dispose(); mounted.registry.dispose();
    await mounted.controller.whenDisposed?.();
    expect(() => admission()!.onUnsupported({ viewId: "main", frameIndex: 6, reason: "late", message: "late" })).toThrow(/PROJECTED_SPOT_ADMISSION_DISPOSED/);
  });

  it("throws a strict per-view degradation and rejects malformed reports", async () => {
    const admission = mockRenderer();
    const mounted = await mount(true, true);
    expect(() => admission()!.onUnsupported({ viewId: "main", frameIndex: 2, reason: "material", message: "Unsupported material" })).toThrow(/PROJECTED_SPOT_UNSUPPORTED/);
    expect(() => admission()!.onUnsupported({ viewId: "main", frameIndex: -1, reason: "bad", message: "bad" })).toThrow(/Invalid projected spot admission report/);
    mounted.controller.dispose(); mounted.registry.dispose();
    await mounted.controller.whenDisposed?.();
  });
});
