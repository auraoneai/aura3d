import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectionalLight } from "@aura3d/scene";
import * as clusteredModule from "../../../packages/rendering/src/ClusteredForwardLighting";
import type { ClusteredForwardLightingResources } from "../../../packages/rendering/src/ClusteredForwardLighting";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import * as lightUniforms from "../../../packages/rendering/src/LightUniforms";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import {
  FORWARD_DIRECT_LIGHT_CAPACITY,
  resolveForwardClusteredLighting
} from "../../../packages/rendering/src/forward/Lighting";
import { rendererQrFlags, setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

const clusteredLights = (count = FORWARD_DIRECT_LIGHT_CAPACITY + 1) => Array.from(
  { length: count },
  (_, index) => collectLight(new DirectionalLight(`resolution-${index}`))
);

function texturesOf(clustered: ClusteredForwardLightingResources): readonly [Texture, Texture] {
  const data = clustered.lightData.texture;
  const indices = clustered.lightIndices.texture;
  if (!data || !indices) throw new Error("Expected both clustered textures");
  return [data, indices];
}

function thrownBy(action: () => unknown): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected the action to throw");
}

describe("forward clustered-lighting resolution ownership", () => {
  let previousFlags: QrFlags;
  let created: ClusteredForwardLightingResources[];

  beforeEach(() => {
    previousFlags = rendererQrFlags();
    created = [];
  });

  afterEach(() => {
    setRendererQrFlags(previousFlags);
    vi.restoreAllMocks();
    for (const clustered of created) clustered.dispose();
  });

  function observeCreation(onCreated?: (clustered: ClusteredForwardLightingResources) => void): void {
    const original = clusteredModule.createClusteredForwardLighting;
    vi.spyOn(clusteredModule, "createClusteredForwardLighting").mockImplementation((...args) => {
      const clustered = original(...args);
      created.push(clustered);
      onCreated?.(clustered);
      return clustered;
    });
  }

  it("retires both newly allocated textures when the global lighting flag callback throws", () => {
    const failure = new Error("lighting flag callback failed");
    const retirements = [0, 0];
    let liveAtFlag: boolean[] = [];
    let bytesAtFlag: number[] = [];
    observeCreation((clustered) => {
      texturesOf(clustered).forEach((texture, index) => {
        texture.onDispose(() => { retirements[index] = (retirements[index] ?? 0) + 1; });
      });
    });
    setRendererQrFlags({
      values: {},
      on() {
        if (created[0]) {
          const textures = texturesOf(created[0]);
          liveAtFlag = textures.map((texture) => !texture.disposed);
          bytesAtFlag = textures.map((texture) => texture.cpuByteLength);
        }
        throw failure;
      }
    });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(created).toHaveLength(1);
    const textures = texturesOf(created[0]!);
    expect(liveAtFlag).toEqual([true, true]);
    expect(bytesAtFlag).toEqual([17 * 6 * 4 * 4, 64 * 4 * 4]);
    expect(textures.map((texture) => texture.disposed)).toEqual([true, true]);
    expect(textures.map((texture) => texture.cpuByteLength)).toEqual([0, 0]);
    expect(retirements).toEqual([1, 1]);
  });

  it("cleans up before ForwardPass can assign a failed resolution", () => {
    const failure = new Error("flag failure inside ForwardPass");
    const pass = new ForwardPass({ items: [], lights: clusteredLights() });
    const device = new MockRenderDevice();
    observeCreation();
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });
    try {
      device.beginFrame(8, 8);
      expect(thrownBy(() => pass.execute({ device, width: 8, height: 8 }))).toBe(failure);
      expect(created).toHaveLength(1);
      expect((pass as unknown as { clusteredLighting: ClusteredForwardLightingResources | null }).clusteredLighting).toBeNull();
      expect(texturesOf(created[0]!).map((texture) => texture.disposed)).toEqual([true, true]);
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      device.dispose();
    }
  });

  it("also retires the textures if recording the lighting counters throws", () => {
    const failure = new Error("counter recording failed");
    observeCreation();
    vi.spyOn(lightUniforms, "recordAuraLightsCounters").mockImplementation(() => { throw failure; });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_LIGHTING: true }));

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(created).toHaveLength(1);
    expect(texturesOf(created[0]!).map((texture) => texture.disposed)).toEqual([true, true]);
  });

  it.each([
    { failed: 0, name: "light data" },
    { failed: 1, name: "light indices" }
  ])("keeps the original error and retires the other texture when $name disposal fails", ({ failed }) => {
    const failure = new Error("lighting flag callback failed");
    const cleanupFailure = new Error("texture disposal failed");
    let failedTexture!: Texture;
    let otherTexture!: Texture;
    let failedCalls = 0;
    let otherCalls = 0;
    let ownerCalls = 0;
    observeCreation((clustered) => {
      const textures = texturesOf(clustered);
      failedTexture = textures[failed]!;
      otherTexture = textures[1 - failed]!;
      const originalOwnerDispose = clustered.dispose.bind(clustered);
      const originalOtherDispose = otherTexture.dispose.bind(otherTexture);
      vi.spyOn(clustered, "dispose").mockImplementation(() => {
        ownerCalls += 1;
        originalOwnerDispose();
      });
      vi.spyOn(failedTexture, "dispose").mockImplementation(() => {
        failedCalls += 1;
        throw cleanupFailure;
      });
      vi.spyOn(otherTexture, "dispose").mockImplementation(() => {
        otherCalls += 1;
        originalOtherDispose();
      });
    });
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(ownerCalls).toBe(1);
    expect(failedCalls).toBeGreaterThanOrEqual(1);
    expect(failedTexture.disposed).toBe(false);
    expect(otherCalls).toBe(1);
    expect(otherTexture.disposed).toBe(true);
    expect(otherTexture.cpuByteLength).toBe(0);
  });

  it("retries an undisposed texture after a transient owner-disposal failure", () => {
    const failure = new Error("lighting flag callback failed");
    const cleanupFailure = new Error("transient disposal failure");
    let attempts = 0;
    observeCreation((clustered) => {
      const texture = texturesOf(clustered)[0];
      const originalDispose = texture.dispose.bind(texture);
      vi.spyOn(texture, "dispose").mockImplementation(() => {
        attempts += 1;
        if (attempts === 1) throw cleanupFailure;
        originalDispose();
      });
    });
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(attempts).toBe(2);
    expect(texturesOf(created[0]!).map((texture) => texture.disposed)).toEqual([true, true]);
  });

  it("attempts both textures and keeps the primary error when both disposals fail", () => {
    const failure = new Error("lighting flag callback failed");
    const attempts = [0, 0];
    observeCreation((clustered) => {
      texturesOf(clustered).forEach((texture, index) => {
        vi.spyOn(texture, "dispose").mockImplementation(() => {
          attempts[index] = (attempts[index] ?? 0) + 1;
          throw new Error(`texture ${index} disposal failed`);
        });
      });
    });
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(attempts[0]).toBeGreaterThanOrEqual(1);
    expect(attempts[1]).toBeGreaterThanOrEqual(1);
    expect(texturesOf(created[0]!).map((texture) => texture.disposed)).toEqual([false, false]);
  });

  it("attempts a shared texture only once during fallback, even if its disposal throws", () => {
    const failure = new Error("lighting flag callback failed");
    const cleanupFailure = new Error("owner disposal failed");
    const original = clusteredModule.createClusteredForwardLighting(clusteredLights(), 8, 8);
    created.push(original);
    const [shared, unrelated] = texturesOf(original);
    let attempts = 0;
    vi.spyOn(shared, "dispose").mockImplementation(() => {
      attempts += 1;
      throw cleanupFailure;
    });
    const dispose = vi.fn(() => { throw cleanupFailure; });
    const alias: ClusteredForwardLightingResources = {
      ...original,
      lightIndices: new TextureBinding({ name: "u_clusterLightIndices", texture: shared }),
      dispose
    };
    vi.spyOn(clusteredModule, "createClusteredForwardLighting").mockReturnValue(alias);
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(1);
    expect(unrelated.disposed).toBe(false);
  });

  it("does not dispose an already retired shared texture again after owner failure", () => {
    const failure = new Error("lighting flag callback failed");
    const cleanupFailure = new Error("owner disposal failed");
    const original = clusteredModule.createClusteredForwardLighting(clusteredLights(), 8, 8);
    created.push(original);
    const [shared, unrelated] = texturesOf(original);
    const disposeTexture = vi.spyOn(shared, "dispose");
    const alias: ClusteredForwardLightingResources = {
      ...original,
      lightIndices: new TextureBinding({ name: "u_clusterLightIndices", texture: shared }),
      dispose() {
        shared.dispose();
        throw cleanupFailure;
      }
    };
    vi.spyOn(clusteredModule, "createClusteredForwardLighting").mockReturnValue(alias);
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
    expect(shared.disposed).toBe(true);
    expect(unrelated.disposed).toBe(false);
  });

  it("preserves the original failure and tries the other texture if a binding is inaccessible", () => {
    const failure = new Error("lighting flag callback failed");
    const cleanupFailure = new Error("owner disposal failed");
    const original = clusteredModule.createClusteredForwardLighting(clusteredLights(), 8, 8);
    created.push(original);
    const [data, indices] = texturesOf(original);
    const inaccessible: ClusteredForwardLightingResources = {
      ...original,
      get lightData(): TextureBinding { throw new Error("binding unavailable"); },
      dispose() { throw cleanupFailure; }
    };
    vi.spyOn(clusteredModule, "createClusteredForwardLighting").mockReturnValue(inaccessible);
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(data.disposed).toBe(false);
    expect(indices.disposed).toBe(true);
  });

  it.each([false, true])("transfers a live cluster to its caller when the lighting flag is %s", (enabled) => {
    observeCreation();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_LIGHTING: enabled }));
    const previousCounters = lightUniforms.auraLightsCounters();

    const clustered = resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined);
    expect(clustered).toBe(created[0]);
    expect(clustered).not.toBeNull();
    expect(texturesOf(clustered!).map((texture) => texture.disposed)).toEqual([false, false]);
    if (enabled) {
      expect(lightUniforms.auraLightsCounters()).toEqual({ lightsEvaluated: 17, lightsDroppedByCap: 0 });
    } else {
      expect(lightUniforms.auraLightsCounters()).toBe(previousCounters);
    }
    clustered!.dispose();
    expect(texturesOf(clustered!).map((texture) => texture.disposed)).toEqual([true, true]);
  });

  it("does not retire a previously returned cluster when a later resolution fails", () => {
    observeCreation();
    setRendererQrFlags(createTrustedQrFlags({}));
    const earlier = resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined);
    const failure = new Error("later flag callback failed");
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(clusteredLights(), 8, 8, undefined))).toBe(failure);
    expect(created).toHaveLength(2);
    expect(earlier).toBe(created[0]);
    expect(texturesOf(earlier!).map((texture) => texture.disposed)).toEqual([false, false]);
    expect(texturesOf(created[1]!).map((texture) => texture.disposed)).toEqual([true, true]);
  });

  it("preserves non-Error flag failures when no cluster was allocated", () => {
    const failure = Symbol("lighting flag failure");
    observeCreation();
    setRendererQrFlags({ values: {}, on: () => { throw failure; } });

    expect(thrownBy(() => resolveForwardClusteredLighting(
      clusteredLights(FORWARD_DIRECT_LIGHT_CAPACITY), 8, 8, undefined
    ))).toBe(failure);
    expect(created).toHaveLength(0);
  });

  it("keeps the direct-light threshold and counters unchanged", () => {
    observeCreation();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_LIGHTING: true }));

    expect(resolveForwardClusteredLighting(clusteredLights(FORWARD_DIRECT_LIGHT_CAPACITY), 8, 8, undefined)).toBeNull();
    expect(created).toHaveLength(0);
    expect(lightUniforms.auraLightsCounters()).toEqual({ lightsEvaluated: 16, lightsDroppedByCap: 0 });
  });
});
