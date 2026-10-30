/**
 * Lane E3 wave 3 (handoff from G13, DD-10): `diagnostics().renderer.shadows` must report the shadow map the forward pass samples.
 * The row reads `mapRendered` from the device's `shadowRenderTargetsAllocated` counter, which counted only labels containing
 * "shadow" or the legacy `renderer-csm-*` cascades. The PRD-02 sun cascades are labelled `prd02-cascade-<i>`, so a game on that
 * path drew shadows while the row read `enabled: false, mapRendered: false, shadowRenderTargetsAllocated: 0`.
 */
import { describe, expect, it } from "vitest";
import { WebGL2Device } from "../../../packages/rendering/src";
import { createProductionRuntimeShadowObservation } from "../../../packages/engine/src/agent-api/compiler/observations";
import type { RenderDeviceDiagnostics } from "../../../packages/rendering/src/RenderDevice";

function device(): WebGL2Device {
  let nextId = 1;
  const constants = new Map<string, number>();
  const constant = (name: string): number => {
    let value = constants.get(name);
    if (value === undefined) {
      value = 0x10000 + constants.size;
      constants.set(name, value);
    }
    return value;
  };
  const overrides: Record<string, unknown> = {
    NO_ERROR: 0,
    NONE: 0,
    getError: () => 0,
    getExtension: (name: string) => (name === "EXT_color_buffer_float" ? {} : null),
    checkFramebufferStatus: () => constant("FRAMEBUFFER_COMPLETE"),
    getParameter: (pname: number) => (pname === constant("MAX_SAMPLES") ? 4 : pname === constant("ACTIVE_TEXTURE") ? constant("TEXTURE0") : null)
  };
  const gl = new Proxy({}, {
    get(_target, property) {
      const name = String(property);
      if (name in overrides) return overrides[name];
      if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
      if (name.startsWith("create")) return () => ({ id: nextId++ });
      return () => undefined;
    }
  }) as unknown as WebGL2RenderingContext;
  const canvas = {
    getContext: (type: string) => (type === "webgl2" ? gl : null),
    addEventListener() {},
    removeEventListener() {}
  } as unknown as HTMLCanvasElement;
  return WebGL2Device.create({ canvas });
}

const allocated = (d: WebGL2Device): number => d.getDiagnostics().shadowRenderTargetsAllocated ?? 0;

describe("E3 wave 3: shadowRenderTargetsAllocated counts the PRD-02 cascades", () => {
  it("counts prd02-cascade-* depth-only targets and their rgba8 fallback", () => {
    const d = device();
    d.createRenderTarget({ width: 512, height: 512, label: "prd02-cascade-0", depthOnly: true });
    d.createRenderTarget({ width: 512, height: 512, label: "prd02-cascade-1", format: "rgba8", depth: "texture" });
    expect(allocated(d)).toBe(2);
  });

  it("keeps counting the legacy labels and still ignores non-shadow targets", () => {
    const d = device();
    d.createRenderTarget({ width: 4, height: 4, label: "aura3d-root-production-default-2048px-shadow-map", format: "rgba8", depth: "texture" });
    d.createRenderTarget({ width: 4, height: 4, label: "renderer-csm-cascade-0", format: "rgba8", depth: "texture" });
    d.createRenderTarget({ width: 4, height: 4, label: "prd02-local-shadow-atlas", depthOnly: true });
    expect(allocated(d)).toBe(3);
    d.createRenderTarget({ width: 4, height: 4, label: "hdr-scene", format: "rgba16f", depth: false });
    d.createRenderTarget({ width: 4, height: 4, label: "my-prd02-cascade-preview", format: "rgba8", depth: false });
    d.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
    expect(allocated(d)).toBe(3);
  });

  it("the renderer shadow row reports mapRendered and mapSampled once a PRD-02 cascade exists", () => {
    const d = device();
    d.createRenderTarget({ width: 512, height: 512, label: "prd02-cascade-0", depthOnly: true });
    const diagnostics = { ...d.getDiagnostics(), nativeShadowMapBindings: 4 } as RenderDeviceDiagnostics;
    const observation = createProductionRuntimeShadowObservation(
      { enabled: true, size: 2048, label: "aura3d-prd02-high-2048px-2casc-shadow-map" },
      diagnostics,
      { lightMatrix: [], cascades: [{ index: 0 }] }
    );
    expect(observation.shadowRenderTargetsAllocated).toBe(1);
    expect(observation.mapRendered).toBe(true);
    expect(observation.mapSampled).toBe(true);
  });
});
