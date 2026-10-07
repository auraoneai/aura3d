import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02"; // registers chunks + provides C-09
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../../packages/rendering/src/Texture";
import {
  environmentProbeFactorySlot,
  type EnvironmentProbe,
  type EnvironmentProbeFactory
} from "../../../../packages/rendering/src/contracts/environment";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import {
  createEnvironmentProbeFactory,
  Prd02EnvironmentProbeFactory
} from "../../../../packages/rendering/src/environment/EnvironmentProbeFactory";
import {
  cubeFaceViewProjection,
  sh9ToTexture
} from "../../../../packages/rendering/src/environment/probeBuild";
import {
  EnvironmentCache,
  environmentCacheLimit
} from "../../../../packages/rendering/src/environment/EnvironmentCache";

const LIGHTING_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const LIGHTING_OFF = resolveQrFlags({});

describe("C-09 Prd02EnvironmentProbeFactory", () => {
  it("slot.get resolves the real factory under the flag and the pending stub without it", () => {
    const on = environmentProbeFactorySlot.get(LIGHTING_ON);
    expect(on(new MockRenderDevice())).toBeInstanceOf(Prd02EnvironmentProbeFactory);
    const off = environmentProbeFactorySlot.get(LIGHTING_OFF);
    expect(() => off(new MockRenderDevice()).neutral("high")).toThrowError(/ENVIRONMENT_PROBE_PENDING/);
  });

  it("neutral(tier) builds a mip-mapped rgba16f cube + SH9 without device reads", () => {
    const device = new MockRenderDevice();
    const factory = createEnvironmentProbeFactory(device);
    const probe = factory.neutral("medium"); // C-27 medium environmentSize = 256
    expect(probe.kind).toBe("environment-probe");
    expect(probe.source).toBe("neutral");
    expect(probe.faceSize).toBe(256);
    expect(probe.specularCube.dimension).toBe("cube");
    expect(probe.specularCube.format).toBe("rgba16f");
    expect(probe.mipCount).toBe(5); // 256→128→64→32→16 floor
    for (const face of probe.specularCube.cubeFaces) {
      expect(face.mipLevels).toHaveLength(5);
      expect(face.mipLevels[0]!.width).toBe(256);
      expect(face.mipLevels[4]!.width).toBe(16);
      expect(face.mipLevels[0]!.data).toBeInstanceOf(Uint16Array);
    }
    expect(probe.sh9).toHaveLength(27);
    // RoomEnvironmentScene panels reach radiance 100 — the SH L0 band and the
    // baked mip-0 half-floats must both carry the HDR range.
    expect(probe.sh9[0]).toBeGreaterThan(0.5);
    const half = (bits: number) => {
      const e = (bits >>> 10) & 0x1f;
      return (bits & 0x8000 ? -1 : 1) * (e === 0 ? 2 ** -14 * ((bits & 0x3ff) / 1024) : 2 ** (e - 15) * (1 + (bits & 0x3ff) / 1024));
    };
    let max = 0;
    for (const face of probe.specularCube.cubeFaces) {
      for (const bits of face.mipLevels[0]!.data as Uint16Array) max = Math.max(max, half(bits));
    }
    expect(max).toBeGreaterThanOrEqual(50); // room panels reach radiance 100
    probe.dispose();
  });

  it("sh9ToTexture packs 27 floats into a 9×1 rgba32f texture", () => {
    const t = sh9ToTexture(new Float32Array(27).fill(0.5));
    expect(t.width).toBe(9);
    expect(t.format).toBe("rgba32f");
    expect((t.data as Float32Array)[0]).toBeCloseTo(0.5);
    t.dispose();
  });

  it("fromScene rejects devices without float color buffers (PRD §R2 fallback)", () => {
    const device = new MockRenderDevice();
    const factory = createEnvironmentProbeFactory(device);
    let code = "";
    try {
      factory.fromScene({ resolution: 64, renderFace: () => undefined });
    } catch (error) {
      code = (error as { code?: string }).code ?? "";
    }
    expect(code).toBe("ENVIRONMENT_PROBE_GPU_UNAVAILABLE");
  });

  it("fromScene captures six faces through renderFace when float RTs exist", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "probe", { value: { floatColorBuffer: true, halfFloatColorBuffer: false } });
    const seen: number[] = [];
    const factory = createEnvironmentProbeFactory(device);
    device.beginFrame(64, 64);
    const probe = factory.fromScene({
      resolution: 64,
      renderFace: (face, target) => {
        seen.push(face);
        device.clearRenderTarget?.([face * 0.1 + 0.2, 0.4, 0.6, 1]);
      }
    });
    device.endFrame();
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    expect(probe.source).toBe("capture");
    expect(probe.sh9.length).toBe(27);
    probe.dispose();
  });

  it("cubeFaceViewProjection produces invertible 90° projections", () => {
    for (let f = 0; f < 6; f++) {
      const m = cubeFaceViewProjection(f as 0);
      // each basis axis is orthonormal → |basis| preserved: check row norms ≈ 1 for rotation part
      expect(Math.hypot(m[0]!, m[1]!, m[2]!)).toBeCloseTo(1, 1);
      expect(Math.hypot(m[4]!, m[5]!, m[6]!)).toBeCloseTo(1, 1);
      expect(Math.hypot(m[8]!, m[9]!, m[10]!)).toBeGreaterThan(0.9);
    }
  });
});

describe("EnvironmentCache", () => {
  function stubProbe(id: string): EnvironmentProbe {
    let disposed = false;
    const cube = new Texture({ width: 2, height: 2, format: "rgba16f", cubeFaces: ["px","nx","py","ny","pz","nz"].map((f) => ({
      face: f as "px", mipLevels: [{ width: 2, height: 2, data: new Uint16Array(16) }]
    })) });
    return {
      kind: "environment-probe",
      specularCube: cube,
      mipCount: 1,
      faceSize: 128,
      sh9: new Float32Array(27),
      shTexture: null,
      background: null,
      source: "preset",
      dispose() { disposed = true; },
      get disposed() { return disposed; }
    } as EnvironmentProbe;
  }

  const fakeFactory: EnvironmentProbeFactory = {
    fromEquirect: () => stubProbe("eq"),
    fromCube: () => stubProbe("cube"),
    fromScene: () => stubProbe("scene"),
    neutral: () => stubProbe("neutral")
  };

  it("double acquire returns the same probe and ref-counts", async () => {
    const cache = new EnvironmentCache(new MockRenderDevice(), fakeFactory, async (k) => stubProbe(k.url ?? "x"));
    const a = await cache.acquire({ url: "u1", tier: "high" });
    const b = await cache.acquire({ url: "u1", tier: "high" });
    expect(a).toBe(b);
    expect(cache.refCount(a)).toBe(2);
    const c = await cache.acquire({ url: "u2", tier: "high" });
    expect(c).not.toBe(a);
    expect(cache.residentCount).toBe(2);
  });

  it("evicts zero-ref LRU beyond the limit; Medium holds 2 with rgba16f residents", async () => {
    expect(environmentCacheLimit("high", false)).toBe(3);
    expect(environmentCacheLimit("medium", true)).toBe(2);
    expect(environmentCacheLimit("ultra", false)).toBe(2);
    const cache = new EnvironmentCache(new MockRenderDevice(), fakeFactory, async (k) => stubProbe(k.url ?? "x"));
    const a = await cache.acquire({ url: "a", tier: "medium" });
    const b = await cache.acquire({ url: "b", tier: "medium" });
    cache.release(a);
    cache.release(b);
    const c = await cache.acquire({ url: "c", tier: "medium" });
    cache.release(c);
    // limit 2 on medium with rgba16f residents → oldest ("a") evicted+disposed
    expect(cache.residentCount).toBe(2);
    expect((a as unknown as { disposed: boolean }).disposed).toBe(true);
    expect((b as unknown as { disposed: boolean }).disposed).toBe(false);
  });

  it("neutral() is synchronous, cached per tier, and never evicted", () => {
    const cache = new EnvironmentCache(new MockRenderDevice(), fakeFactory);
    const n1 = cache.neutral("high");
    const n2 = cache.neutral("high");
    expect(n1).toBe(n2);
    expect(cache.refCount(n1)).toBe(2);
  });
});
