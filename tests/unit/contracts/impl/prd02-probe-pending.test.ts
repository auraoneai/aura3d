/**
 * ENVIRONMENT_PROBE_PENDING (L4, qr flags `all`): an HDRI environment request
 * whose C-09 factory resolved to the pending stub rejected inside an
 * un-awaited upgrade promise with `ENVIRONMENT_PROBE_PENDING:fromEquirect`.
 * That surfaced as an unhandled rejection or page error on a frame that was
 * already drawing the neutral floor. As three.js PMREM does async, the floor
 * keeps rendering until the probe is ready. The failure is handled (one
 * warning, never an error), the loader resolves the factory when the load
 * runs, and the caller is told the failure is retryable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import {
  environmentProbeFactorySlot,
  isEnvironmentProbeFactoryPending,
  type EnvironmentProbe
} from "../../../../packages/rendering/src/contracts/environment";
import { createEnvironmentProbeFactory } from "../../../../packages/rendering/src/environment/EnvironmentProbeFactory";
import { EnvironmentCache, defaultProbeLoader } from "../../../../packages/rendering/src/environment/EnvironmentCache";
import {
  bindPrd02EnvironmentProbe,
  isEnvironmentProbePendingError
} from "../../../../packages/engine/src/agent-api/compiler/environment";

const HDR = "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";
// Lighting off: the slot always hands out the pending stub, whether or not
// the lane has provided it. A3D_QR_LIGHTING is default-on (#1238), so "off"
// must be explicit.
const LIGHTING_OFF = resolveQrFlags({ options: ["-lighting"] });
const HDRI_RESOLUTION = {
  kind: "neutral-room" as const, probe: { hdri: "studio.hdr" },
  intensity: 1, diffuseIntensity: 1, specularIntensity: 1, rotation: 0,
  background: false as const, ambient: null
};

function stubHdrFetch() {
  const bytes = readFileSync(HDR);
  const fetchSpy = vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("environment probe pending: the floor renders, nothing throws into the frame", () => {
  it("the stub is identifiable, and its HDRI load rejects before fetching", async () => {
    const device = new MockRenderDevice();
    const stub = environmentProbeFactorySlot.get(LIGHTING_OFF)(device);
    expect(isEnvironmentProbeFactoryPending(stub)).toBe(true);
    expect(isEnvironmentProbeFactoryPending(createEnvironmentProbeFactory(device))).toBe(false);
    const fetchSpy = stubHdrFetch();
    await expect(defaultProbeLoader(stub)({ url: "studio.hdr", tier: "medium" })).rejects.toThrow("ENVIRONMENT_PROBE_PENDING:fromEquirect");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a getter loader uses the factory current at load time (late provider)", async () => {
    stubHdrFetch();
    const device = new MockRenderDevice();
    const stub = environmentProbeFactorySlot.get(LIGHTING_OFF)(device);
    let current = stub;
    const loader = defaultProbeLoader(() => current);
    await expect(loader({ url: "studio.hdr", tier: "medium" })).rejects.toSatisfy(isEnvironmentProbePendingError);
    current = createEnvironmentProbeFactory(device);
    const probe = await loader({ url: "studio.hdr", tier: "medium" });
    expect(probe.source).toBe("hdri");
    expect(probe.mipCount).toBeGreaterThan(1);
  });

  it("bind keeps the neutral floor, warns once, never errors, and reports a retryable failure", async () => {
    stubHdrFetch();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const device = new MockRenderDevice();
      const failures: boolean[] = [];
      const upgraded: EnvironmentProbe[] = [];
      for (let frame = 0; frame < 3; frame += 1) {
        const binding = bindPrd02EnvironmentProbe(HDRI_RESOLUTION, {
          device, tier: "medium", flags: LIGHTING_OFF,
          onUpgrade: (p) => upgraded.push(p),
          onUpgradeFailed: (_e, retryable) => failures.push(retryable)
        });
        // The frame draws with the floor immediately.
        expect(binding.probe.source).toBe("neutral");
        expect(binding.probe.specularCube).toBeTruthy();
        await expect(binding.pending!).rejects.toSatisfy(isEnvironmentProbePendingError);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(upgraded).toEqual([]);
      expect(failures).toEqual([true, true, true]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("neutral floor");
      expect(error).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("a capture request with the pending factory binds the floor instead of calling fromScene", () => {
    const device = new MockRenderDevice();
    const cache = new EnvironmentCache(device, environmentProbeFactorySlot.get(LIGHTING_OFF)(device));
    const binding = bindPrd02EnvironmentProbe(
      { ...HDRI_RESOLUTION, probe: { capture: {} } } as never,
      { device, tier: "low", flags: LIGHTING_OFF, cache, captureRequest: { resolution: 128, renderFace: () => {} } }
    );
    expect(binding.probe.source).toBe("neutral");
    expect(binding.pending).toBeNull();
  });
});
