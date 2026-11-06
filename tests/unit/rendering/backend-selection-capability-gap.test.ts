import { describe, expect, it, vi } from "vitest";
import { createSelectedProductionRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { resolveBackendOptions } from "../../../packages/engine/src/agent-api/app/rendererOptions";

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
