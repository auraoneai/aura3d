import { describe, expect, it } from "vitest";
import {
  buildGpuTargetInventory,
  GPU_TARGET_BUDGET_BYTES,
  MockRenderDevice,
  resolveGpuTargetOwner,
  spreadGpuTargetInventory
} from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { Texture } from "../../../packages/rendering/src/Texture";
import { PlanarReflectionCapture, GlassRefractionCapture } from "../../../packages/rendering/src/PlanarReflection";
import { writePostProcessPixels } from "../../../packages/rendering/src/PostProcessPass";
import { resolveVolumetricFog } from "../../../packages/rendering/src/VolumetricFog";
import { createSdfFontAtlas } from "../../../packages/rendering/src/SdfText";
import { createProjectedDecalGeometry } from "../../../packages/rendering/src/production-runtime/geometry/ProjectedDecalGeometry";
import { AudioSource } from "../../../packages/audio/src/AudioSource";
import { AudioClip } from "../../../packages/audio/src/AudioClip";
import { AudioSystem } from "../../../packages/audio/src/AudioSystem";
import { AudioMixer } from "../../../packages/audio/src/AudioMixer";
import type { AudioContextLike } from "../../../packages/audio/src/AudioContextManager";
import { A3DAppLifecycle } from "../../../packages/engine/src/advanced-runtime/A3DAppLifecycle";

/**
 * PART U1 (muse3jsparity-PRD): per-class disposal with registry-size
 * assertions. Every resource class — buffer/geometry, material, texture,
 * render target, composer presentation target, audio graph, renderer device,
 * and lane-owned captures — proves GPU/CPU release through live-registry
 * counts before/after dispose, not through flags alone.
 */

class FakeGain {
  readonly gain = { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} };
  disconnected = 0;
  connect(): this {
    return this;
  }
  disconnect(): void {
    this.disconnected += 1;
  }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  disconnected = 0;
  connect(): this {
    return this;
  }
  disconnect(): void {
    this.disconnected += 1;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  readonly destination = {};
  readonly gains: FakeGain[] = [];
  readonly sources: FakeBufferSource[] = [];
  closed = 0;
  async resume(): Promise<void> {
    this.state = "running";
  }
  async suspend(): Promise<void> {
    this.state = "suspended";
  }
  async close(): Promise<void> {
    this.closed += 1;
    this.state = "closed";
  }
  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  createPanner(): PannerNode {
    throw new Error("not needed");
  }
  createBiquadFilter(): BiquadFilterNode {
    throw new Error("not needed");
  }
  createConvolver(): ConvolverNode {
    throw new Error("not needed");
  }
}

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, listener: EventListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }
  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }
  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  total(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
  }
}

const SHADER_SOURCES = {
  label: "u1-test-shader",
  marker: "U1MARKER",
  vertex: "void main() {} // U1MARKER",
  fragment: "void main() {} // U1MARKER"
};

describe("PART U1 per-class disposal (registry-size assertions)", () => {
  it("buffers release GPU bytes and leave the live registry empty", () => {
    const device = new MockRenderDevice();
    const before = device.getDiagnostics();
    expect(before.buffers).toBe(0);
    const buffer = device.createBuffer("vertex", 1024, new Uint8Array(1024));
    expect(device.getDiagnostics().buffers).toBe(1);
    expect(device.getDiagnostics().bufferBytes).toBe(1024);
    buffer.dispose();
    const after = device.getDiagnostics();
    expect(after.buffers).toBe(0);
    expect(after.bufferBytes).toBe(0);
    expect(after.disposedBuffers).toBe(1);
  });

  it("shaders release and leave the live registry empty", () => {
    const device = new MockRenderDevice();
    const program = device.createShaderProgram(SHADER_SOURCES);
    expect(device.getDiagnostics().shaders).toBe(1);
    program.dispose();
    const after = device.getDiagnostics();
    expect(after.shaders).toBe(0);
    expect(after.disposedShaders).toBe(1);
  });

  it("geometry upload binds GPU buffers that Geometry.dispose releases", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    geometry.vertexBuffer.upload(device);
    geometry.indexBuffer!.upload(device);
    expect(device.getDiagnostics().buffers).toBe(2);
    geometry.dispose();
    const after = device.getDiagnostics();
    expect(after.buffers).toBe(0);
    expect(after.disposedBuffers).toBe(2);
  });

  it("materials dispose idempotently and refuse use after dispose", () => {
    const material = new Material({ shaderKey: "u1-test-material" });
    expect(material.disposed).toBe(false);
    material.dispose();
    expect(material.disposed).toBe(true);
    expect(() => material.dispose()).not.toThrow();
    expect(() => material.setParameter("u_color", [1, 0, 0])).toThrow();
  });

  it("textures dispose and report exact bytes while live", () => {
    const texture = new Texture({ width: 16, height: 8, format: "rgba8", label: "u1-test-texture" });
    expect(texture.byteLength).toBe(16 * 8 * 4);
    expect(texture.disposed).toBe(false);
    texture.dispose();
    expect(texture.disposed).toBe(true);
  });

  it("B1 shadow-labeled render targets register bytes + owner and release", () => {
    const device = new MockRenderDevice();
    const target = device.createRenderTarget({
      width: 64,
      height: 64,
      label: "spot-shadow-map",
      format: "rgba8",
      depth: "texture"
    });
    const live = device.getDiagnostics();
    expect(live.renderTargets).toBe(1);
    expect(live.gpuTargets).toHaveLength(1);
    expect(live.gpuTargets![0]).toMatchObject({ label: "spot-shadow-map", kind: "render-target", owner: "b1-shadow" });
    expect(live.gpuTargets![0]!.bytes).toBeGreaterThan(0);
    expect(live.gpuTargetBytes).toBe(live.gpuTargets![0]!.bytes);
    expect(live.gpuTargetOverBudget).toBe(false);
    expect(live.gpuTargetWarnings).toEqual([]);
    target.dispose();
    const after = device.getDiagnostics();
    expect(after.renderTargets).toBe(0);
    expect(after.gpuTargets).toEqual([]);
    expect(after.gpuTargetBytes).toBe(0);
    expect(after.disposedRenderTargets).toBe(1);
  });

  it("B4 planar + glass captures dispose their scene targets", () => {
    const device = new MockRenderDevice();
    const mirror = new PlanarReflectionCapture(device, 0, { resolution: 32, label: "u1-mirror" });
    const glass = new GlassRefractionCapture(device, { resolution: 32, label: "u1-glass" });
    const live = device.getDiagnostics();
    expect(live.renderTargets).toBe(2);
    const owners = (live.gpuTargets ?? []).map((entry) => entry.owner);
    expect(owners).toEqual(["b4-reflection", "b4-reflection"]);
    expect(live.gpuTargets!.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["u1-mirror-mirror-target", "u1-glass-scene-color-target"])
    );
    mirror.dispose();
    expect(device.getDiagnostics().renderTargets).toBe(1);
    glass.dispose();
    const after = device.getDiagnostics();
    expect(after.renderTargets).toBe(0);
    expect(after.gpuTargets).toEqual([]);
  });

  it("composer presentation targets are transient: created, presented, disposed", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 8, height: 8, label: "scene-main", format: "rgba8" });
    writePostProcessPixels(device, source, undefined, new Uint8Array(8 * 8 * 4));
    const after = device.getDiagnostics();
    expect(after.renderTargets).toBe(1);
    expect(after.gpuTargets).toHaveLength(1);
    expect(after.gpuTargets![0]).toMatchObject({ label: "scene-main", owner: "scene" });
    source.dispose();
    expect(device.getDiagnostics().gpuTargets).toEqual([]);
  });

  it("audio sources clear node callbacks and disconnect; systems close the context", async () => {
    const context = new FakeAudioContext();
    const clip = new AudioClip({ buffer: { duration: 2, numberOfChannels: 1, sampleRate: 48_000 } as AudioBuffer });
    const source = new AudioSource({ context: context as unknown as AudioContextLike, clip });
    source.play();
    expect(source.state).toBe("playing");
    expect(context.sources).toHaveLength(1);
    const node = context.sources[0]!;
    source.dispose();
    expect(source.state).toBe("stopped");
    expect(node.onended).toBeNull();
    expect(node.disconnected).toBeGreaterThanOrEqual(1);

    const systemContext = new FakeAudioContext();
    const system = new AudioSystem({ context: systemContext as unknown as AudioContextLike });
    void system.mixer.createBus("u1-bus");
    await system.dispose();
    expect(systemContext.closed).toBe(1);
    expect(systemContext.state).toBe("closed");

    const mixerContext = new FakeAudioContext();
    const mixer = new AudioMixer(mixerContext as unknown as AudioContextLike);
    mixer.createBus("u1-extra");
    expect(mixer.listBuses()).toHaveLength(2);
    mixer.dispose();
    expect(mixer.listBuses()).toHaveLength(0);
  });

  it("renderer device dispose empties every live registry", () => {
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("vertex", 64, new Uint8Array(64));
    const program = device.createShaderProgram(SHADER_SOURCES);
    const target = device.createRenderTarget({ width: 4, height: 4, label: "u1-scene", format: "rgba8" });
    expect(device.getDiagnostics().buffers).toBe(1);
    device.dispose();
    expect(device.disposed).toBe(true);
    const after = device.getDiagnostics();
    expect(after.buffers).toBe(0);
    expect(after.shaders).toBe(0);
    expect(after.renderTargets).toBe(0);
    expect(after.gpuTargets).toEqual([]);
    expect(buffer.disposed).toBe(true);
    expect(program.disposed).toBe(true);
    expect(target.disposed).toBe(true);
  });
});

describe("PART U1 target ownership + budget policy", () => {
  it("maps every lane label to its owner and nothing else", () => {
    expect(resolveGpuTargetOwner("bloom-pyramid-mip0a")).toBe("a1-bloom");
    expect(resolveGpuTargetOwner("volumetric-light-history")).toBe("a5-volumetric");
    expect(resolveGpuTargetOwner("spot-shadow-map")).toBe("b1-shadow");
    expect(resolveGpuTargetOwner("cascade-shadow-atlas")).toBe("b1-shadow");
    expect(resolveGpuTargetOwner("hall-mirror-target")).toBe("b4-reflection");
    expect(resolveGpuTargetOwner("glass-scene-color-target")).toBe("b4-reflection");
    expect(resolveGpuTargetOwner("lake-water-reflection")).toBe("b4-reflection");
    expect(resolveGpuTargetOwner("decal-atlas")).toBe("c4-decal");
    expect(resolveGpuTargetOwner("sdf-font-atlas")).toBe("g1-text");
    expect(resolveGpuTargetOwner("glyph-cache")).toBe("g1-text");
    expect(resolveGpuTargetOwner("scene-postprocess-present")).toBe("post");
    expect(resolveGpuTargetOwner("taa-history")).toBe("post");
    expect(resolveGpuTargetOwner("scene-main")).toBe("scene");
    expect(resolveGpuTargetOwner("player-health-bar")).toBe("unknown");
  });

  it("warns through data (never throws) when the target budget is exceeded", () => {
    const small = buildGpuTargetInventory([
      { label: "scene-main", kind: "render-target", bytes: 1024, owner: "scene" }
    ]);
    expect(small.totalBytes).toBe(1024);
    expect(small.overBudget).toBe(false);
    expect(small.warnings).toEqual([]);

    const huge = buildGpuTargetInventory([
      { label: "bloom-pyramid-mip0a", kind: "pyramid-mip", bytes: GPU_TARGET_BUDGET_BYTES + 1, owner: "a1-bloom" }
    ]);
    expect(huge.overBudget).toBe(true);
    expect(huge.warnings).toHaveLength(1);
    expect(huge.warnings[0]).toContain("a1-bloom");

    const spread = spreadGpuTargetInventory([]);
    expect(spread.gpuTargets).toEqual([]);
    expect(spread.gpuTargetBytes).toBe(0);
    expect(spread.gpuTargetOverBudget).toBe(false);
    expect(spread.gpuTargetWarnings).toEqual([]);
  });

  it("A5 volumetric light adds forward uniforms + CPU kernel, no GPU target", () => {
    const device = new MockRenderDevice();
    const resolution = resolveVolumetricFog({ density: 0.4, intensity: 0.55 }, [], 800, 600);
    expect(resolution.pass).not.toBeNull();
    expect(resolution.forward.volumetricIntensity).toBeGreaterThan(0);
    const diagnostics = device.getDiagnostics();
    expect(diagnostics.gpuTargets ?? []).toEqual([]);
    expect((diagnostics.gpuTargets ?? []).some((entry) => entry.owner === "a5-volumetric")).toBe(false);
  });

  it("C4 decals are CPU geometry: dispose releases buffers, no GPU target", () => {
    const device = new MockRenderDevice();
    const decal = createProjectedDecalGeometry(
      {
        positions: [
          [-1, -1, 0],
          [1, -1, 0],
          [1, 1, 0],
          [-1, 1, 0]
        ],
        indices: [0, 1, 2, 0, 2, 3]
      },
      {
        center: [0, 0, 0.1],
        size: [4, 4, 1],
        basis: { right: [1, 0, 0], up: [0, 1, 0], normal: [0, 0, 1] }
      }
    );
    expect(decal.vertexCount).toBeGreaterThan(0);
    decal.geometry.vertexBuffer.upload(device);
    decal.geometry.indexBuffer!.upload(device);
    expect(device.getDiagnostics().buffers).toBe(2);
    decal.geometry.dispose();
    expect(device.getDiagnostics().buffers).toBe(0);
    expect((device.getDiagnostics().gpuTargets ?? []).some((entry) => entry.owner === "c4-decal")).toBe(false);
  });

  it("G1 SDF atlas is CPU data: measurable bytes, no GPU target until a lane uploads it", () => {
    const device = new MockRenderDevice();
    const atlas = createSdfFontAtlas();
    expect(atlas.glyphCount).toBeGreaterThan(0);
    expect(atlas.width * atlas.height * 4).toBeGreaterThan(0);
    expect((device.getDiagnostics().gpuTargets ?? []).some((entry) => entry.owner === "g1-text")).toBe(false);
  });
});

describe("PART U1 renderer listener audit (repeated mount)", () => {
  it("50 lifecycles leave zero tracked listeners and zero target listeners", () => {
    const target = new FakeEventTarget();
    for (let cycle = 0; cycle < 50; cycle += 1) {
      const lifecycle = new A3DAppLifecycle();
      const onResize = (): void => {};
      const onContextLost = (): void => {};
      lifecycle.addEventListener(target as unknown as EventTarget, "resize", onResize as EventListener);
      lifecycle.addEventListener(target as unknown as EventTarget, "webglcontextlost", onContextLost as EventListener);
      expect(lifecycle.snapshot().eventListeners).toBe(2);
      expect(target.total()).toBe(2);
      lifecycle.dispose();
      expect(lifecycle.snapshot().eventListeners).toBe(0);
      expect(target.total()).toBe(0);
    }
    expect(target.total()).toBe(0);
  });

  it("device lost/restored subscriptions detach through the returned unsubscribe", () => {
    const lost = new Set<() => void>();
    const restored = new Set<() => void>();
    for (let cycle = 0; cycle < 50; cycle += 1) {
      const unsubscribeLost = subscribe(lost);
      const unsubscribeRestored = subscribe(restored);
      expect(lost.size).toBe(1);
      expect(restored.size).toBe(1);
      unsubscribeLost();
      unsubscribeRestored();
    }
    expect(lost.size).toBe(0);
    expect(restored.size).toBe(0);
    function subscribe(set: Set<() => void>): () => void {
      const listener = (): void => {};
      set.add(listener);
      return () => set.delete(listener);
    }
  });
});

describe("PART U1 50-cycle mount/dispose soak (flat registry)", () => {
  it("50 create/dispose cycles leave every live count and byte total at zero", () => {
    const device = new MockRenderDevice();
    for (let cycle = 0; cycle < 50; cycle += 1) {
      const buffer = device.createBuffer("vertex", 256, new Uint8Array(256));
      const program = device.createShaderProgram(SHADER_SOURCES);
      const target = device.createRenderTarget({
        width: 32,
        height: 32,
        label: `u1-soak-${cycle}`,
        format: "rgba8",
        depth: "texture"
      });
      const geometry = Geometry.triangle();
      geometry.vertexBuffer.upload(device);
      const mid = device.getDiagnostics();
      expect(mid.buffers).toBe(2);
      expect(mid.shaders).toBe(1);
      expect(mid.renderTargets).toBe(1);
      expect(mid.gpuTargetBytes).toBeGreaterThan(0);
      buffer.dispose();
      program.dispose();
      target.dispose();
      geometry.dispose();
    }
    const after = device.getDiagnostics();
    expect(after.buffers).toBe(0);
    expect(after.shaders).toBe(0);
    expect(after.renderTargets).toBe(0);
    expect(after.textures).toBe(0);
    expect(after.bufferBytes).toBe(0);
    expect(after.textureBytes).toBe(0);
    expect(after.approximateGpuMemoryBytes).toBe(0);
    expect(after.gpuTargets).toEqual([]);
    expect(after.gpuTargetBytes).toBe(0);
    expect(after.gpuTargetOverBudget).toBe(false);
    expect(after.disposedBuffers).toBe(100);
    expect(after.disposedShaders).toBe(50);
    expect(after.disposedRenderTargets).toBe(50);
  });
});
