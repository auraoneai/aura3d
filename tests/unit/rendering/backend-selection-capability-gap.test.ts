import { describe, expect, it, vi } from "vitest";
import { createSelectedProductionRenderer as publicSelect } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess";

// Internal hooks (kept off the emitted .d.ts so 5.0.x declarations stay byte-identical).
const createSelectedProductionRenderer = (publicSelect as unknown as Record<symbol, (...args: unknown[]) => ReturnType<typeof publicSelect>>)[
  Symbol.for("@aura3d/root-renderer/select-with-webgpu-gap/v1")] as (...args: unknown[]) => ReturnType<typeof publicSelect>;
void createProductionRuntimePostprocess;
import { resolveBackendOptions } from "../../../packages/engine/src/agent-api/app/rendererOptions";
import { Renderer } from "../../../packages/rendering/src/Renderer";

const gap = () => ({ code: "DEPTH_POSTPROCESS_UNSUPPORTED", missing: ["depth-textures"] });
const fakeCreate = () => {
  const requests: string[] = [];
  const create = vi.fn(async (options: { backend?: string }) => {
    requests.push(options.backend!);
    return { device: { kind: options.backend, info: { capabilities: ["native-render-pipeline", "canvas-surface"] } }, dispose() {} } as never;
  });
  return { create, requests };
};

describe("backend selection: scene capability the WebGPU device cannot provide", () => {
  it("falls back to WebGL2 without touching the WebGPU canvas when fallback is allowed", async () => {
    const { create, requests } = fakeCreate();
    const result = await createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "auto" } as never), create as never, gap);
    expect(requests).toEqual(["webgl2"]);
    expect(result.selection).toMatchObject({ requested: "auto", active: "webgl2", fallbackReason: "DEPTH_POSTPROCESS_UNSUPPORTED", missingFeatures: ["depth-textures"] });
  });

  it("honors allowFallback: true on an explicit webgpu request", async () => {
    const { create, requests } = fakeCreate();
    const result = await createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "webgpu", allowFallback: true } as never), create as never, gap);
    expect(requests).toEqual(["webgl2"]);
    expect(result.selection.active).toBe("webgl2");
  });

  it("throws the capability code, creating nothing, when fallback is not allowed", async () => {
    const { create } = fakeCreate();
    await expect(createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "webgpu" } as never), create as never, gap))
      .rejects.toMatchObject({ code: "DEPTH_POSTPROCESS_UNSUPPORTED" });
    await expect(createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "auto", allowFallback: false } as never), create as never, gap))
      .rejects.toMatchObject({ code: "DEPTH_POSTPROCESS_UNSUPPORTED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps WebGPU when the scene has no gap, and never consults the gate for a WebGL2 request", async () => {
    const { create, requests } = fakeCreate();
    const gate = vi.fn(() => undefined);
    const result = await createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "auto" } as never), create as never, gate);
    expect(requests).toEqual(["webgpu"]);
    expect(result.selection.active).toBe("webgpu");
    const strict = vi.fn(gap);
    await createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "webgl2" } as never), create as never, strict);
    expect(strict).not.toHaveBeenCalled();
  });
});

describe("backend selection: fallback is announced and native DoF combinations are pre-checked", () => {
  it("warns once with the requested backend, code and missing features on a capability-gap fallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { create } = fakeCreate();
      await createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "webgpu", allowFallback: true } as never), create as never, gap);
      expect(warn.mock.calls.filter(([line]) => String(line).includes("BACKEND_FALLBACK"))).toEqual([
        ["[aura3d] BACKEND_FALLBACK: requested webgpu, using webgl2 (DEPTH_POSTPROCESS_UNSUPPORTED: depth-textures)"]
      ]);
    } finally { warn.mockRestore(); }
  });

  it("warns when WebGPU initialization fails and WebGL2 takes over", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const create = vi.fn(async (options: { backend?: string }) => {
        if (options.backend === "webgpu") throw Object.assign(new Error("no adapter"), { code: "WEBGPU_ADAPTER_UNAVAILABLE" });
        return { device: { kind: "webgl2", info: { capabilities: [] } }, dispose() {} } as never;
      });
      const result = await createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "auto" } as never), create as never);
      expect(result.selection).toMatchObject({ active: "webgl2", fallbackReason: "WEBGPU_ADAPTER_UNAVAILABLE" });
      expect(warn).toHaveBeenCalledWith("[aura3d] BACKEND_FALLBACK: requested auto, using webgl2 (WEBGPU_ADAPTER_UNAVAILABLE)");
    } finally { warn.mockRestore(); }
  });

  it("reports the native DoF combination gap from the final post bag before any WebGPU context", () => {
    const dofGap = (Renderer as unknown as Record<symbol, (post: unknown) => { code: string; missing: string[] } | undefined>)[
      Symbol.for("@aura3d/rendering/webgpu-dof-gap/v1")];
    const dof = { focusDistance: 4, aperture: 2.8 };
    const base = { v2: true, pipeline: { antiAliasing: "off", dof } };
    expect(dofGap(base)).toBeUndefined();
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "msaa", dof, vignette: { intensity: 0.3 }, filmGrain: { intensity: 0.1 } } })).toEqual({
      code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED", missing: ["anti-aliasing-msaa", "film-grain", "vignette"]
    });
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "off", dof }, outline: { color: [1, 1, 1, 1] } })).toMatchObject({ missing: ["outline"] });
    expect(dofGap({ v2: true, pipeline: { antiAliasing: "off" } })).toBeUndefined();
    expect(dofGap({ pipeline: { dof } })).toBeUndefined();
  });
});

describe("backend selection: the gap check sees context recorded synchronously after the mount starts", () => {
  it("evaluates the WebGPU gap only after a microtask, so post context recorded right after createAuraApp is visible", async () => {
    const { create, requests } = fakeCreate();
    let recorded = false;
    const lateGap = vi.fn(() => recorded ? { code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED", missing: ["vignette"] } : undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const pending = createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "webgpu", allowFallback: true } as never), create as never, lateGap);
      recorded = true; // what the C-38 post extension does synchronously after the mount begins
      const result = await pending;
      expect(lateGap).toHaveBeenCalledTimes(1);
      expect(requests).toEqual(["webgl2"]);
      expect(result.selection).toMatchObject({ active: "webgl2", fallbackReason: "WEBGPU_DOF_COMBINATION_UNSUPPORTED", missingFeatures: ["vignette"] });
    } finally { warn.mockRestore(); }
  });
});
