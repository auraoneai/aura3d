import { afterEach, describe, expect, it, vi } from "vitest";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { normalizeCreateAppRendererOptions } from "../../../packages/engine/src/agent-api/app/rendererOptions";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeSceneRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { Renderer } from "../../../packages/rendering/src/Renderer";

const profile = {
  profile: {
    format: "ies-lm63", photometricType: "C", verticalAngles: [0, 180], horizontalAngles: [0],
    candela: [4, 4], symmetry: "rotational"
  }
} as never;
const projection = { texture: { kind: "aura-asset-ref", type: "texture", id: "pattern", url: "/pattern.png" } } as never;
const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } });

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function mockRootRenderer(ready: boolean) {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
  const create = Renderer.create.bind(Renderer);
  let admission: { onUnsupported(issue: { reason: string; message: string; viewId: string | number; frameIndex: number }): void } | undefined;
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    admission = options.photometricProfiles;
    const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
    Object.defineProperty(renderer.device, "info", { value: { ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"] } });
    Object.defineProperty(renderer, "photometricProfileAdmissionEnabled", { value: () => ready });
    return renderer;
  });
  return () => admission;
}

function litSnapshot(projected = false): AuraSceneSnapshot {
  return scene().add(primitives.box()).add(lights.spot({
    name: "profiled", photometricProfile: profile, ...(projected ? { projectedImage: projection } : {})
  }).runtime({ id: "profiled" })).toJSON() as AuraSceneSnapshot;
}

async function mount(requested: boolean | undefined, strict: boolean, projected = false, onDegradation = vi.fn()) {
  const snapshot = litSnapshot(projected);
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
  try {
    const controller = await createProductionRuntimeSceneRenderer(
      new FakeCanvas() as unknown as HTMLCanvasElement,
      snapshot,
      requested === undefined ? undefined : { photometricProfiles: requested },
      registry,
      flags,
      { strict, onDegradation }
    );
    return { controller, registry, onDegradation };
  } catch (error) {
    registry.dispose();
    throw error;
  }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("photometric profile renderer admission", () => {
  it("defaults off and validates the explicit boolean before mounting", () => {
    expect(normalizeCreateAppRendererOptions(undefined).photometricProfiles).toBe(false);
    expect(normalizeCreateAppRendererOptions({ photometricProfiles: true }).photometricProfiles).toBe(true);
    expect(normalizeCreateAppRendererOptions({ photometricProfiles: false }).photometricProfiles).toBe(false);
    for (const invalid of [null, 1, "true", {}]) {
      expect(() => normalizeCreateAppRendererOptions({ photometricProfiles: invalid } as never)).toThrow(/renderer\.photometricProfiles/);
    }
  });

  it("keeps the existing early warning when opt-in is absent", async () => {
    const admission = mockRootRenderer(true);
    const mounted = await mount(undefined, false);
    expect(admission()).toBeUndefined();
    expect(mounted.controller.diagnostics.warnings.some((warning) => warning.includes("photometricProfile"))).toBe(true);
    expect(mounted.onDegradation).toHaveBeenCalledWith(expect.objectContaining({ code: "capability-degraded" }));
    mounted.controller.dispose(); mounted.registry.dispose();
  });

  it("keeps the early warning when a renderer does not confirm the callback", async () => {
    const admission = mockRootRenderer(false);
    const mounted = await mount(true, false);
    expect(admission()).toBeDefined();
    expect(mounted.controller.diagnostics.warnings.some((warning) => warning.includes("photometricProfile"))).toBe(true);
    mounted.controller.dispose(); mounted.registry.dispose();
  });

  it("reports per-view failures through the app sink and keeps frame-specific warnings after updates", async () => {
    const admission = mockRootRenderer(true);
    const mounted = await mount(true, false);
    expect(mounted.controller.diagnostics.warnings.some((warning) => warning.includes("LIGHT_MODULATION_UNSUPPORTED"))).toBe(false);
    admission()!.onUnsupported({ viewId: "main", frameIndex: 4, reason: "clustered", message: "Clustered profiles are unavailable" });
    expect(mounted.onDegradation).toHaveBeenCalledWith(expect.objectContaining({
      code: "capability-degraded", frame: 4, message: expect.stringContaining("view main, frame 4")
    }));
    admission()!.onUnsupported({ viewId: "probe:0", frameIndex: 5, reason: "material", message: "Material is unavailable" });
    admission()!.onUnsupported({ viewId: "main", frameIndex: 3, reason: "clustered", message: "An older view finished later" });
    mounted.controller.update!(1000);
    const warnings = mounted.controller.diagnostics.warnings.filter((warning) => warning.includes("PHOTOMETRIC_PROFILE_UNSUPPORTED"));
    expect(warnings).toHaveLength(2);
    expect(warnings.some((warning) => warning.includes("view main, frame 4, clustered"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("view probe:0, frame 5, material"))).toBe(true);
    mounted.controller.dispose(); mounted.registry.dispose();
    expect(() => admission()!.onUnsupported({ viewId: "main", frameIndex: 6, reason: "late", message: "late" })).toThrow(/DISPOSED/);
  });

  it("throws on a strict per-view failure and retains independent projected-image diagnostics", async () => {
    const admission = mockRootRenderer(true);
    const mounted = await mount(true, true);
    expect(() => admission()!.onUnsupported({ viewId: "main", frameIndex: 2, reason: "material", message: "Material is unavailable" }))
      .toThrow(/PHOTOMETRIC_PROFILE_UNSUPPORTED/);
    mounted.controller.dispose(); mounted.registry.dispose();
    await expect(mount(true, true, true)).rejects.toThrow(/projectedImage/);
  });
});
