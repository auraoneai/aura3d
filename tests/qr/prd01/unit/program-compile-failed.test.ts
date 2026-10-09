/**
 * T0-03 / C-36 `program-compile-failed`.
 *
 * A failed generated program must:
 *  - emit one `program-compile-failed` degradation + one `console.error` per
 *    program key (repeat acquires reuse the failed entry, no re-report);
 *  - surface in `ProgramCache.stats().failed` (C-31 `programs.failed`);
 *  - under `A3D_QR_STRICT`, throw at draw time;
 *  - otherwise fall back to the legacy `shaderKey` draw (no skipped frame).
 *
 * Runs on MockRenderDevice: a device override rejects sources carrying the
 * generated-program marker only, so the legacy shaderKey path still compiles.
 */

import { describe, expect, it, vi, afterEach } from "vitest";

import {
  ForwardPass,
  GENERATED_PROGRAM_MARKER,
  Geometry,
  MockRenderDevice,
  ProgramCache,
  RenderDeviceError,
  UnlitMaterial,
  programDegradationLog,
  rendererProgramCachePeek,
  type RenderShaderProgram,
  type ShaderSources
} from "@aura3d/rendering";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";

const V2 = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const V2_STRICT = resolveQrFlags({ env: { A3D_QR_CORE: "v2", A3D_QR_STRICT: "1" } });
const OFF = resolveQrFlags({ env: {} });

class FailGeneratedDevice extends MockRenderDevice {
  override createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    if (sources.marker === GENERATED_PROGRAM_MARKER || sources.vertex.includes(GENERATED_PROGRAM_MARKER)) {
      throw new RenderDeviceError("mock: generated program rejected", "SHADER_LINK_FAILED", { label: sources.label });
    }
    return super.createShaderProgram(sources);
  }
}

function executeFrame(device: MockRenderDevice, pass: ForwardPass): void {
  device.beginFrame(16, 16);
  pass.execute({ device, width: 16, height: 16 });
  device.endFrame();
}

afterEach(() => {
  setRendererQrFlags(OFF);
  vi.restoreAllMocks();
});

describe("T0-03 program-compile-failed", () => {
  it("records one degradation + one console.error per failed key and reports stats().failed", () => {
    const device = new FailGeneratedDevice();
    const cache = new ProgramCache(device);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const loggedBefore = programDegradationLog.length;

    const features = normalizeProgramFeatures({ lighting: "unlit", pass: "forward" });
    const handle1 = cache.acquire(features);
    const handle2 = cache.acquire(features);

    expect(handle1.status).toBe("failed");
    expect(handle2.status).toBe("failed");
    expect(handle2.error).toBe(handle1.error);
    // once per key: two acquires of the same features still report exactly once.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("generated program failed to compile");
    const newEntries = programDegradationLog.slice(loggedBefore);
    expect(newEntries).toHaveLength(1);
    expect(newEntries[0]?.code).toBe("program-compile-failed");
    expect(cache.stats().failed).toBe(1);
    device.dispose();
  });

  it("falls back to the legacy shaderKey draw under core when a generated program fails", () => {
    setRendererQrFlags(V2);
    const device = new FailGeneratedDevice();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const item: RenderItem = { geometry: Geometry.box(), material: new UnlitMaterial({ name: "t0-03-fallback" }), label: "t0-03-fallback" };

    executeFrame(device, new ForwardPass({ items: [item] }));
    // The legacy path drew this frame (no async-skip for failed programs).
    expect(device.drawCommands.length).toBe(1);
    executeFrame(device, new ForwardPass({ items: [item] }));
    expect(device.drawCommands.length).toBe(1);
    const cache = rendererProgramCachePeek(device);
    expect(cache?.stats().failed).toBe(1);
    // still once per key across frames.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    device.dispose();
  });

  it("throws PROGRAM_COMPILE_FAILED under A3D_QR_STRICT", () => {
    setRendererQrFlags(V2_STRICT);
    const device = new FailGeneratedDevice();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const item: RenderItem = { geometry: Geometry.box(), material: new UnlitMaterial({ name: "t0-03-strict" }), label: "t0-03-strict" };

    expect(() => executeFrame(device, new ForwardPass({ items: [item] }))).toThrowError(/PROGRAM_COMPILE_FAILED|failed to compile/);
    device.dispose();
  });
});
