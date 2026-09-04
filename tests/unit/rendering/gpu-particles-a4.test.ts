import { describe, expect, it } from "vitest";
import {
  CollisionModule,
  ColorModule,
  SizeModule,
  WindModule,
  TurbulenceModule,
  createCurlNoiseLUT,
  sampleCurlNoiseLUT,
  HeightfieldSampler,
  createSineHeightfield,
  resolveHeightfieldContact,
  HeightfieldModule,
  computeLitParticleColor,
  LightingModule,
  SubEmitterModule,
  ParticleEmitter,
  ParticleSystem,
  collectGPUParticleEffects,
  TrailModule,
  buildTrailRibbon,
  decodeTrailRingBuffer,
  encodeTrailCaptureDepth,
  ParticleRenderer,
  computeSoftParticleFade,
  SOFT_PARTICLE_WGSL,
  createParticle,
  createLayeredParticleBudgetPlan,
  WebGPUParticleBackend,
  encodeGPUParticleEffects,
  createEffectsParticleComputeShader,
  createTrailRingInit,
  createBaseAttributeSnapshot,
  GPU_PARTICLE_EFFECT_WIND,
  GPU_PARTICLE_EFFECT_TURBULENCE,
  GPU_PARTICLE_EFFECT_PLANES,
  GPU_PARTICLE_EFFECT_HEIGHTFIELD,
  GPU_PARTICLE_EFFECT_SUB_EMITTERS,
  GPU_PARTICLE_EFFECT_LIFE_CURVES,
  GPU_PARTICLE_EFFECT_LIGHTING,
  GPU_PARTICLE_EFFECT_TRAILS,
  GPU_PARTICLE_EFFECT_SIZE_CURVES,
  GPU_PARTICLE_UNIFORM_BYTE_LENGTH,
  type GPUParticleEffectsInput,
} from "../../../packages/rendering/src";

function makeEffectsInput(overrides: Partial<GPUParticleEffectsInput> = {}): GPUParticleEffectsInput {
  return { time: 1.25, seed: 7, ...overrides };
}

describe("A4 curl-noise turbulence", () => {
  it("builds a deterministic 8^3 LUT with finite curl vectors", () => {
    const first = createCurlNoiseLUT(8);
    const second = createCurlNoiseLUT(8);
    expect(first.length).toBe(8 ** 3 * 4);
    expect(Array.from(first)).toEqual(Array.from(second));
    for (const value of first) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(first.some((value) => Math.abs(value) > 0.05)).toBe(true);
    expect(() => createCurlNoiseLUT(1)).toThrow(/resolution/);
  });

  it("wraps trilinear samples periodically", () => {
    const lut = createCurlNoiseLUT(8);
    const a = sampleCurlNoiseLUT(lut, 8, 0.13, 0.71, 0.37, { x: 0, y: 0, z: 0 });
    const b = sampleCurlNoiseLUT(lut, 8, 1.13, 1.71, 1.37, { x: 0, y: 0, z: 0 });
    expect(b.x).toBeCloseTo(a.x, 10);
    expect(b.y).toBeCloseTo(a.y, 10);
    expect(b.z).toBeCloseTo(a.z, 10);
  });

  it("pushes CPU velocity along the shared field", () => {
    const module = new TurbulenceModule({ strength: 2, scale: 1, flowSpeed: 0 });
    const particle = createParticle({ position: { x: 0.2, y: 0.3, z: 0.4 }, lifetime: 4 });
    const before = { ...particle.velocity };
    module.update(particle, { deltaTime: 0.5, elapsedTime: 1, normalizedAge: 0, random: () => 0.5 });
    const expected = sampleCurlNoiseLUT(module.getLUT(), 8, 0.2, 0.3, 0.4, { x: 0, y: 0, z: 0 });
    expect(particle.velocity.x).toBeCloseTo(before.x + expected.x * 2 * 0.5, 12);
    expect(particle.velocity.y).toBeCloseTo(before.y + expected.y * 2 * 0.5, 12);
    expect(module.toGPUTurbulence()).toMatchObject({ strength: 2, scale: 1, lutResolution: 8 });
  });
});

describe("A4 heightfield ground", () => {
  it("samples a flat field exactly and bounces particles", () => {
    const sampler = new HeightfieldSampler({
      cellSize: 1,
      columns: 4,
      rows: 4,
      heights: new Float32Array(16).fill(2),
    });
    expect(sampler.sampleHeight(99, -99)).toBe(2);
    const position = { x: 0.5, y: 1.9, z: 0.5 };
    const velocity = { x: 0, y: -4, z: 0 };
    expect(resolveHeightfieldContact(sampler, position, velocity, 0.5, false)).toBe(true);
    expect(position.y).toBe(2);
    expect(velocity.y).toBeCloseTo(2, 12);
    expect(resolveHeightfieldContact(sampler, { x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, 0.5, false)).toBe(false);
  });

  it("supports kill mode and sine-field construction", () => {
    const sampler = createSineHeightfield(8, 8, 0.5, 0.4, 1.2);
    expect(sampler.sampleHeight(0, 0)).toBeCloseTo(0, 12);
    const killer = new HeightfieldModule({ sampler, mode: "kill" });
    const particle = createParticle({ position: { x: 0, y: -5, z: 0 }, lifetime: 4 });
    killer.afterIntegrate(particle, { deltaTime: 0.1, elapsedTime: 0, normalizedAge: 0, random: () => 0 });
    expect(particle.alive).toBe(false);
    expect(killer.toGPUHeightfield()).toMatchObject({ columns: 8, rows: 8, killOnContact: true });
  });
});

describe("A4 wind", () => {
  it("applies steady wind and encodes GPU params", () => {
    const module = new WindModule({ direction: { x: 1, y: 0, z: 0 }, strength: 3, gustAmplitude: 0 });
    const particle = createParticle({ lifetime: 4 });
    module.update(particle, { deltaTime: 0.25, elapsedTime: 9, normalizedAge: 0, random: () => 0 });
    expect(particle.velocity.x).toBeCloseTo(0.75, 12);
    expect(module.toGPUWind()).toMatchObject({ strength: 3, gustAmplitude: 0 });
    expect(() => new WindModule({ direction: { x: 1, y: 0, z: 0 }, gustAmplitude: -1 })).toThrow(/gustAmplitude/);
  });
});

describe("A4 lit particles", () => {
  it("lights velocity-aligned motion and falls back to up when slow", () => {
    const options = { ambient: [0.3, 0.3, 0.3] as [number, number, number], keyDirection: { x: 0, y: 1, z: 0 } };
    const facing = computeLitParticleColor({ r: 1, g: 0.5, b: 0.25, a: 0.8 }, { x: 0, y: 2, z: 0 }, options);
    expect(facing.r).toBeCloseTo(1 * (0.3 + 0.85), 10);
    expect(facing.a).toBe(0.8);
    const against = computeLitParticleColor({ r: 1, g: 1, b: 1, a: 1 }, { x: 0, y: -2, z: 0 }, options);
    expect(against.r).toBeCloseTo(0.3, 10);
    const slow = computeLitParticleColor({ r: 1, g: 1, b: 1, a: 1 }, { x: 0, y: 0, z: 0 }, options);
    expect(slow.r).toBeCloseTo(0.3 + 0.85, 10);

    const module = new LightingModule(options);
    const particle = createParticle({ velocity: { x: 0, y: -1, z: 0 }, color: { r: 1, g: 1, b: 1, a: 1 }, lifetime: 2 });
    module.update(particle, { deltaTime: 0.1, elapsedTime: 0, normalizedAge: 0.5, random: () => 0 });
    expect(particle.color.r).toBeCloseTo(0.3, 10);
  });
});

describe("A4 sub-emitters", () => {
  function deathModule() {
    return new SubEmitterModule({
      trigger: "death",
      chance: 1,
      childrenPerEvent: 2,
      velocityInherit: 0.5,
      childEmitter: new ParticleEmitter({ seed: 3, emissionRate: 0, lifetime: 1, speed: 0 }),
    });
  }

  it("fires once on death and drains within capacity", () => {
    const module = deathModule();
    const particle = createParticle({ position: { x: 1, y: 2, z: 3 }, velocity: { x: 0, y: -1, z: 0 }, lifetime: 1 });
    module.afterIntegrate(particle, { deltaTime: 0.1, elapsedTime: 0, normalizedAge: 1, random: () => 0.99 });
    module.afterIntegrate(particle, { deltaTime: 0.1, elapsedTime: 0, normalizedAge: 1, random: () => 0 });
    expect(module.pendingSpawns).toHaveLength(1);
    const { children, dropped } = module.drainPendingSpawns(10);
    expect(children).toHaveLength(2);
    expect(dropped).toBe(0);
    expect(children[0]?.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(children[0]?.velocity.y).toBeCloseTo(-0.5, 10);
    expect(module.toGPUSubEmitter()).toEqual({ triggerAge: 1, chance: 1, childCount: 2 });
  });

  it("clamps midlife overflow and reports dropped", () => {
    const module = new SubEmitterModule({
      trigger: "midlife",
      chance: 1,
      childrenPerEvent: 3,
      childEmitter: new ParticleEmitter({ seed: 5, emissionRate: 0, lifetime: 1, speed: 0 }),
    });
    const particle = createParticle({ lifetime: 2 });
    module.afterIntegrate(particle, { deltaTime: 0.1, elapsedTime: 0, normalizedAge: 0.6, random: () => 0 });
    const { children, dropped } = module.drainPendingSpawns(2);
    expect(children).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it("spawns CPU children through ParticleSystem.update", () => {
    const system = new ParticleSystem({
      maxParticles: 10,
      emitters: [
        new ParticleEmitter({ seed: 9, emissionRate: 0, bursts: [{ time: 0, count: 1 }], lifetime: 0.2, speed: 0 }),
      ],
      modules: [deathModule()],
    });
    system.update(0.1);
    expect(system.particles).toHaveLength(1);
    system.update(0.2);
    expect(system.particles.length).toBeGreaterThanOrEqual(2);
    expect(system.getStats().spawnedCount).toBeGreaterThanOrEqual(3);
  });
});

describe("A4 soft-particle depth fade", () => {
  const depth = {
    enabled: true,
    fadeDistance: 1,
    sceneDepthAt: () => 5,
    particleDepthAt: (position: { x: number; y: number; z: number }) => position.z,
  };

  it("computes the fade ramp exactly", () => {
    expect(computeSoftParticleFade(5, 5, 1)).toBe(0);
    expect(computeSoftParticleFade(5, 4, 1)).toBe(1);
    expect(computeSoftParticleFade(5, 4.5, 1)).toBeCloseTo(0.5, 12);
    expect(computeSoftParticleFade(5, 99, 1)).toBe(0);
    expect(() => computeSoftParticleFade(5, 4, 0)).toThrow(/fadeDistance/);
    expect(SOFT_PARTICLE_WGSL).toContain("auraSoftParticleFade");
  });

  it("treats a missed scene ray as no attenuation", () => {
    const renderer = new ParticleRenderer();
    const particles = [createParticle({ id: 1, position: { x: 0, y: 5, z: 0 }, lifetime: 4 })];
    const batch = renderer.buildBatch(particles, {
      softParticles: {
        enabled: true,
        fadeDistance: 1,
        sceneDepthAt: () => Number.POSITIVE_INFINITY,
        particleDepthAt: () => 5,
      },
    });
    expect(batch.sprites[0]?.fade).toBe(1);
    expect(() =>
      renderer.buildBatch(particles, {
        softParticles: {
          enabled: true,
          fadeDistance: 1,
          sceneDepthAt: () => 5,
          particleDepthAt: () => Number.NaN,
        },
      }),
    ).toThrow(/particleDepthAt/);
  });

  it("shows a visible on/off delta in buildBatch", () => {
    const renderer = new ParticleRenderer();
    const particles = [
      createParticle({ id: 1, position: { x: 0, y: 0, z: 4.2 }, color: { r: 1, g: 1, b: 1, a: 1 }, lifetime: 4 }),
      createParticle({ id: 2, position: { x: 0, y: 0, z: 2 }, color: { r: 1, g: 1, b: 1, a: 1 }, lifetime: 4 }),
    ];
    const off = renderer.buildBatch(particles);
    const on = renderer.buildBatch(particles, { softParticles: depth });
    expect(off.sprites.map((sprite) => sprite.fade)).toEqual([1, 1]);
    expect(on.sprites[0]?.fade).toBeCloseTo(0.8, 10);
    expect(on.sprites[1]?.fade).toBe(1);
    expect(on.sprites[0]?.color.a).toBeCloseTo(0.8, 10);
    const delta = Math.abs((on.sprites[0]?.color.a ?? 0) - (off.sprites[0]?.color.a ?? 0));
    expect(delta).toBeGreaterThan(0.1);
  });
});

describe("A4 GPU ribbon trails", () => {
  it("stretches the head by velocity and fades to the tail", () => {
    const ribbon = buildTrailRibbon(
      [{ position: { x: -0.2, y: 0, z: 0 }, age: 0.4 }],
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      0.5,
      { stretchFactor: 0.1, fadePower: 1 },
    );
    expect(ribbon.headStretch).toBeCloseTo(0.4, 10);
    expect(ribbon.vertices[0]?.position.x).toBeCloseTo(0.4, 10);
    expect(ribbon.vertices[0]?.alpha).toBe(1);
    expect(ribbon.vertices[1]?.alpha).toBeCloseTo(0.2, 10);
    expect(ribbon.vertices[0]?.width ?? 0).toBeGreaterThan(ribbon.vertices[1]?.width ?? 0);

    const still = buildTrailRibbon([], { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }, 0.5);
    expect(still.headStretch).toBe(0);
    expect(still.vertices).toHaveLength(1);
  });

  it("validates ring depth and decodes rings newest-first minus expired", () => {
    expect(encodeTrailCaptureDepth(8)).toBe(8);
    expect(() => encodeTrailCaptureDepth(9)).toThrow(/depth/);
    const ring = new Float32Array([
      1, 0, 0, 0.1,
      0.9, 0, 0, 0.2,
      0, 0, 0, Number.POSITIVE_INFINITY,
    ]);
    const decoded = decodeTrailRingBuffer(ring, 1, 3, 0.5);
    // Oldest-first: slot 1 (age 0.2) precedes the head slot 0 (age 0.1).
    const ages = decoded[0]?.map((point) => point.age) ?? [];
    expect(ages).toHaveLength(2);
    expect(ages[0]).toBeCloseTo(0.2, 5);
    expect(ages[1]).toBeCloseTo(0.1, 5);
  });
});

describe("A4 overBudget diagnostics", () => {
  it("flags clamped budget plans with dropped counts", () => {
    const over = createLayeredParticleBudgetPlan({
      requestedParticles: 80_000,
      minParticles: 4_000,
      maxParticles: 50_000,
      layers: [{ name: "all", weight: 1 }],
      densityTiers: [{ threshold: 0, label: "base", mode: "base" }],
    });
    expect(over.overBudget).toBe(true);
    expect(over.droppedParticles).toBe(30_000);

    const within = createLayeredParticleBudgetPlan({
      requestedParticles: 10_000,
      minParticles: 4_000,
      maxParticles: 50_000,
      layers: [{ name: "all", weight: 1 }],
      densityTiers: [{ threshold: 0, label: "base", mode: "base" }],
    });
    expect(within.overBudget).toBe(false);
    expect(within.droppedParticles).toBe(0);
  });

  it("flags ParticleSystem overflow instead of clamping silently", () => {
    const system = new ParticleSystem({
      maxParticles: 2,
      emitters: [new ParticleEmitter({ seed: 1, emissionRate: 0, bursts: [{ time: 0, count: 5 }], lifetime: 4, speed: 0 })],
    });
    system.update(0.1);
    expect(system.particles).toHaveLength(2);
    expect(system.getStats().overBudget).toBe(true);
    expect(system.getStats().droppedCount).toBe(3);
  });
});

describe("A4 effects uniform encoder", () => {
  it("lays out header, wind, planes, subs, and flags at documented offsets", () => {
    const encoded = encodeGPUParticleEffects(
      makeEffectsInput({
        wind: {
          direction: { x: 1, y: 0, z: 0 },
          strength: 2,
          gustAmplitude: 0.5,
          gustDirection: { x: 0, y: 0, z: 1 },
          gustFrequency: 0.25,
          gustSpeed: 1,
        },
        planes: [{ normal: { x: 0, y: 1, z: 0 }, constant: 0.5, restitution: 0.3, killOnContact: false }],
        subEmitters: [{ triggerAge: 1, chance: 0.5, childCount: 3 }],
        trailPointsPerParticle: 4,
      }),
      0.016,
      100,
    );
    expect(encoded.uniform.byteLength).toBe(GPU_PARTICLE_UNIFORM_BYTE_LENGTH);
    const view = new DataView(encoded.uniform);
    expect(view.getFloat32(0, true)).toBeCloseTo(0.016, 6);
    expect(view.getUint32(4, true)).toBe(100);
    expect(view.getFloat32(8, true)).toBeCloseTo(1.25, 6);
    expect(view.getUint32(12, true)).toBe(
      GPU_PARTICLE_EFFECT_WIND | GPU_PARTICLE_EFFECT_PLANES | GPU_PARTICLE_EFFECT_SUB_EMITTERS | GPU_PARTICLE_EFFECT_TRAILS,
    );
    expect(view.getFloat32(16, true)).toBeCloseTo(2, 6);
    expect(view.getFloat32(28, true)).toBeCloseTo(0.5, 6);
    expect(view.getFloat32(80, true)).toBeCloseTo(0, 6);
    expect(view.getFloat32(84, true)).toBeCloseTo(1, 6);
    expect(view.getFloat32(92, true)).toBeCloseTo(0.5, 6);
    expect(view.getFloat32(96, true)).toBeCloseTo(0.3, 6);
    expect(view.getFloat32(176, true)).toBeCloseTo(1, 6);
    expect(view.getFloat32(180, true)).toBeCloseTo(0.5, 6);
    expect(view.getFloat32(184, true)).toBeCloseTo(3, 6);
    expect(view.getFloat32(64, true)).toBeCloseTo(4, 6);
    expect(encoded.trailDepth).toBe(4);
    expect(encoded.captureSpawnRequests).toBe(true);
    expect(encoded.captureAttributes).toBe(false);
    expect(encoded.captureTrails).toBe(true);
  });

  it("rejects oversized effect sets", () => {
    const plane = { normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.5, killOnContact: false };
    expect(() => encodeGPUParticleEffects(makeEffectsInput({ planes: [plane, plane, plane, plane] }), 0.1, 1)).toThrow(/planes/);
    expect(() => encodeGPUParticleEffects(makeEffectsInput({ trailPointsPerParticle: 9 }), 0.1, 1)).toThrow(/trail/);
    expect(() =>
      encodeGPUParticleEffects(
        makeEffectsInput({ turbulence: { strength: 1, scale: 1, flowSpeed: 0, lut: createCurlNoiseLUT(4), lutResolution: 4 } }),
        0.1,
        1,
      ),
    ).toThrow(/8\^3/);
    expect(() =>
      encodeGPUParticleEffects(makeEffectsInput({ lifeCurves: { stops: 4, colors: new Float32Array(16) } }), 0.1, 1),
    ).toThrow(/16/);
  });

  it("initializes trail rings and base snapshots deterministically", () => {
    const ring = createTrailRingInit(new Float32Array([1, 2, 3, 0.5]), 1, 3);
    expect(Array.from(ring.slice(0, 4))).toEqual([1, 2, 3, 0.5]);
    expect(ring[7]).toBe(Number.POSITIVE_INFINITY);
    const snapshot = createBaseAttributeSnapshot(undefined, 1);
    expect(Array.from(snapshot.slice(0, 5))).toEqual([1, 1, 1, 1, 1]);
  });

  it("ships an extended WGSL kernel with every A4 feature", () => {
    const shader = createEffectsParticleComputeShader();
    for (const symbol of [
      "fn main",
      "fn spawn_main",
      "aura_sample_turb",
      "aura_height_at",
      "aura_sample_color",
      "aura_sample_size",
      "aura_apply_light",
      "aura_hash",
      "spawnRequests",
      "trailRing",
      "attributes",
      "baseAttributes",
      "fieldData",
      "@binding(8)",
    ]) {
      expect(shader).toContain(symbol);
    }
  });
});

describe("A4 module collection", () => {
  it("covers GPU modules and overflows extras to CPU", () => {
    const wind = new WindModule({ direction: { x: 1, y: 0, z: 0 } });
    const extraWind = new WindModule({ direction: { x: 0, y: 1, z: 0 } });
    const planes = [
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0 }),
      new CollisionModule({ normal: { x: 1, y: 0, z: 0 }, constant: -2 }),
      new CollisionModule({ normal: { x: -1, y: 0, z: 0 }, constant: -2 }),
      new CollisionModule({ normal: { x: 0, y: 0, z: 1 }, constant: -2 }),
    ];
    const color = new ColorModule([{ time: 0, color: { r: 1, g: 0, b: 0, a: 1 } }]);
    const trail = new TrailModule({ maxPoints: 6 });
    const collected = collectGPUParticleEffects([wind, extraWind, ...planes, color, trail]);
    expect(collected?.effects.planes).toHaveLength(3);
    expect(collected?.gpuCovered.has(wind)).toBe(true);
    expect(collected?.gpuCovered.has(extraWind)).toBe(false);
    expect(collected?.gpuCovered.has(planes[3]!)).toBe(false);
    expect(collected?.gpuCovered.has(color)).toBe(true);
    expect(collected?.gpuCovered.has(trail)).toBe(true);
    expect(collected?.effects.trailPointsPerParticle).toBe(6);
    expect(collected?.effects.lifeCurves?.colors?.length).toBe(64);
    expect(collected?.effects.lifeCurves?.sizes).toBeUndefined();
  });

  it("returns undefined when no GPU-capable module is present", () => {
    expect(collectGPUParticleEffects([])).toBeUndefined();
  });
});

interface FakeBuffer {
  data: ArrayBuffer;
  mapAsync(): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface FakeBindGroup {
  entries: { binding: number; resource: { buffer: FakeBuffer } }[];
}

function writeBytes(buffer: FakeBuffer, offset: number, data: ArrayBuffer | ArrayBufferView): void {
  const source =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  new Uint8Array(buffer.data).set(source, offset);
}

/**
 * Node fake WebGPU device that mirrors the extended kernel's buffer contract:
 * same uniform offsets as encodeGPUParticleEffects, same binding order, and
 * the same per-feature math (reusing the real LUT sampler and heightfield
 * solver where the kernel duplicates them). It proves the host plumbing —
 * buffer order, sizes, offsets, slicing — while real-GPU numeric parity is
 * proven by the browser probe.
 */
function createEffectsFakeGPU() {
  const copies: { source: FakeBuffer; sourceOffset: number; destination: FakeBuffer; destinationOffset: number; size: number }[] = [];
  const calls: { entries: number; effects: boolean; kind: string }[] = [];
  let bindGroup: FakeBindGroup | null = null;
  let pipeline: { entry: string; effects: boolean } | null = null;

  function emulateLegacy(count: number, deltaTime: number): void {
    if (!bindGroup) return;
    const positions = new Float32Array(bindGroup.entries[0]!.resource.buffer.data);
    const velocities = new Float32Array(bindGroup.entries[1]!.resource.buffer.data);
    const accelerations = new Float32Array(bindGroup.entries[2]!.resource.buffer.data);
    const params = new DataView(bindGroup.entries[3]!.resource.buffer.data);
    const dt = params.getFloat32(0, true);
    const n = params.getUint32(4, true);
    void count;
    void deltaTime;
    for (let index = 0; index < n; index += 1) {
      const offset = index * 4;
      velocities[offset] += accelerations[offset] * dt;
      velocities[offset + 1] += accelerations[offset + 1] * dt;
      velocities[offset + 2] += accelerations[offset + 2] * dt;
      positions[offset] += velocities[offset] * dt;
      positions[offset + 1] += velocities[offset + 1] * dt;
      positions[offset + 2] += velocities[offset + 2] * dt;
      positions[offset + 3] += dt;
    }
  }

  function emulateEffects(): void {
    if (!bindGroup) return;
    const at = (index: number): Float32Array => new Float32Array(bindGroup!.entries[index]!.resource.buffer.data);
    const positions = at(0);
    const velocities = at(1);
    const accelerations = at(2);
    const params = new DataView(bindGroup.entries[3]!.resource.buffer.data);
    const fields = at(4);
    const spawn = new Uint32Array(bindGroup.entries[5]!.resource.buffer.data);
    const trail = at(6);
    const attributes = at(7);
    const base = at(8);
    const get = (offset: number): number => params.getFloat32(offset, true);
    const dt = get(0);
    const count = params.getUint32(4, true);
    const time = get(8);
    const flags = params.getUint32(12, true);
    // Shared field-data layout mirrors encodeGPUParticleEffects: LUT words,
    // height words, then 128 curve words.
    const lutWords = flags & GPU_PARTICLE_EFFECT_TURBULENCE ? 2048 : 4;
    const heightWords = flags & GPU_PARTICLE_EFFECT_HEIGHTFIELD ? Math.round(get(220)) * Math.round(get(224)) : 1;
    const lut = fields.slice(0, lutWords);
    const heightValues = fields.slice(lutWords, lutWords + heightWords);
    const curves = fields.slice(lutWords + heightWords, lutWords + heightWords + 128);

    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      let px = positions[offset]!;
      let py = positions[offset + 1]!;
      let pz = positions[offset + 2]!;
      let age = positions[offset + 3]!;
      let vx = velocities[offset]!;
      let vy = velocities[offset + 1]!;
      let vz = velocities[offset + 2]!;
      const lifetime = Math.max(velocities[offset + 3]!, 1e-6);
      let dead = false;

      if (flags & GPU_PARTICLE_EFFECT_WIND) {
        const along = px * get(32) + py * get(36) + pz * get(40);
        const gust = 1 + get(28) * Math.sin(along * get(44) + time * get(48));
        vx += get(16) * gust * dt;
        vy += get(20) * gust * dt;
        vz += get(24) * gust * dt;
      }
      if (flags & GPU_PARTICLE_EFFECT_TURBULENCE) {
        const scratch = sampleCurlNoiseLUT(lut, 8, px * get(56) + time * get(60), py * get(56), pz * get(56), { x: 0, y: 0, z: 0 });
        vx += scratch.x * get(52) * dt;
        vy += scratch.y * get(52) * dt;
        vz += scratch.z * get(52) * dt;
      }
      vx += accelerations[offset]! * dt;
      vy += accelerations[offset + 1]! * dt;
      vz += accelerations[offset + 2]! * dt;
      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;

      if (flags & GPU_PARTICLE_EFFECT_PLANES) {
        const numPlanes = Math.round(get(68));
        for (let plane = 0; plane < Math.min(numPlanes, 3); plane += 1) {
          if (dead) break;
          const baseOffset = 80 + plane * 32;
          const nx = get(baseOffset);
          const ny = get(baseOffset + 4);
          const nz = get(baseOffset + 8);
          const constant = get(baseOffset + 12);
          const restitution = get(baseOffset + 16);
          const kill = get(baseOffset + 20) > 0.5;
          const distance = nx * px + ny * py + nz * pz + constant;
          if (distance < 0) {
            if (kill) {
              dead = true;
            } else {
              px -= nx * distance;
              py -= ny * distance;
              pz -= nz * distance;
              const vn = vx * nx + vy * ny + vz * nz;
              if (vn < 0) {
                const impulse = -(1 + restitution) * vn;
                vx += nx * impulse;
                vy += ny * impulse;
                vz += nz * impulse;
              }
            }
          }
        }
      }
      if (!dead && flags & GPU_PARTICLE_EFFECT_HEIGHTFIELD) {
        const sampler = new HeightfieldSampler({
          originX: get(208),
          originZ: get(212),
          cellSize: get(216),
          columns: Math.round(get(220)),
          rows: Math.round(get(224)),
          heights: heightValues.slice(0, Math.round(get(220)) * Math.round(get(224))),
        });
        const position = { x: px, y: py, z: pz };
        const velocity = { x: vx, y: vy, z: vz };
        const contacted = resolveHeightfieldContact(sampler, position, velocity, get(228), get(232) > 0.5);
        px = position.x;
        py = position.y;
        pz = position.z;
        vx = velocity.x;
        vy = velocity.y;
        vz = velocity.z;
        if (contacted && get(232) > 0.5) {
          dead = true;
        }
      }
      if (!dead) {
        age += dt;
      }

      if (!dead && flags & GPU_PARTICLE_EFFECT_SUB_EMITTERS) {
        const subCount = Math.round(get(76));
        const hash = (extra: number): number => {
          const s = Math.sin(index * 12.9898 + (get(260) + extra) * 78.233) * 43758.5453;
          return s - Math.floor(s);
        };
        if (subCount >= 1 && (age - dt) / lifetime < get(176) && age / lifetime >= get(176) && hash(0) < get(180)) {
          spawn[index] = Math.round(get(184));
        }
        if (subCount >= 2 && (age - dt) / lifetime < get(188) && age / lifetime >= get(188) && hash(1.7) < get(192)) {
          spawn[index] = (spawn[index] ?? 0) + (Math.round(get(196)) << 16);
        }
      }

      if (flags & (GPU_PARTICLE_EFFECT_LIFE_CURVES | GPU_PARTICLE_EFFECT_LIGHTING | GPU_PARTICLE_EFFECT_SIZE_CURVES)) {
        const t = Math.min(1, Math.max(0, age / lifetime));
        let r = base[offset * 2]!;
        let g = base[offset * 2 + 1]!;
        let b = base[offset * 2 + 2]!;
        let a = base[offset * 2 + 3]!;
        let size = base[offset * 2 + 4]!;
        const sample = (slot: number): number => {
          const x = t * 15;
          const i = Math.min(15, Math.floor(x));
          const f = x - Math.floor(x);
          const lo = curves[(slot + i) * 4] ?? 0;
          const hi = curves[(slot + Math.min(i + 1, 15)) * 4] ?? 0;
          return lo + (hi - lo) * f;
        };
        if (flags & GPU_PARTICLE_EFFECT_LIFE_CURVES) {
          r = sample(0);
          g = sampleAlpha(1);
          b = sampleAlpha(2);
          a = sampleAlpha(3);
        }
        if (flags & GPU_PARTICLE_EFFECT_SIZE_CURVES) {
          size = sample(16);
        }
        if (flags & GPU_PARTICLE_EFFECT_LIGHTING) {
          const lit = computeLitParticleColor(
            { r, g, b, a },
            { x: vx, y: vy, z: vz },
            {
              ambient: [get(236), get(240), get(244)] as [number, number, number],
              keyDirection: { x: get(248), y: get(252), z: get(256) },
              diffuseStrength: get(204),
            },
          );
          r = lit.r;
          g = lit.g;
          b = lit.b;
          a = lit.a;
        }
        attributes[offset * 2] = r;
        attributes[offset * 2 + 1] = g;
        attributes[offset * 2 + 2] = b;
        attributes[offset * 2 + 3] = a;
        attributes[offset * 2 + 4] = size;
        function sampleAlpha(channel: number): number {
          const x = t * 15;
          const i = Math.min(15, Math.floor(x));
          const f = x - Math.floor(x);
          const lo = curves[i * 4 + channel] ?? 0;
          const hi = curves[Math.min(i + 1, 15) * 4 + channel] ?? 0;
          return lo + (hi - lo) * f;
        }
      }

      if (flags & GPU_PARTICLE_EFFECT_TRAILS) {
        const depth = Math.round(get(64));
        for (let slot = depth - 1; slot >= 1; slot -= 1) {
          const target = (index * depth + slot) * 4;
          const source = (index * depth + slot - 1) * 4;
          trail[target] = trail[source]!;
          trail[target + 1] = trail[source + 1]!;
          trail[target + 2] = trail[source + 2]!;
          trail[target + 3] = trail[source + 3]! + dt;
        }
        const head = (index * depth) * 4;
        trail[head] = px;
        trail[head + 1] = py;
        trail[head + 2] = pz;
        trail[head + 3] = age;
      }

      if (dead) {
        age = -1;
      }
      positions[offset] = px;
      positions[offset + 1] = py;
      positions[offset + 2] = pz;
      positions[offset + 3] = age;
      velocities[offset] = vx;
      velocities[offset + 1] = vy;
      velocities[offset + 2] = vz;
      velocities[offset + 3] = lifetime;
    }
  }

  function makeBuffer(size: number): FakeBuffer {
    return {
      data: new ArrayBuffer(size),
      async mapAsync(): Promise<void> {},
      getMappedRange(): ArrayBuffer {
        return this.data.slice(0);
      },
      unmap(): void {},
      destroy(): void {},
    };
  }

  const device = {
    queue: {
      writeBuffer(buffer: FakeBuffer, offset: number, data: ArrayBuffer | ArrayBufferView): void {
        writeBytes(buffer, offset, data);
      },
      submit(): void {},
    },
    createShaderModule(descriptor: { code: string }): { code: string; effects: boolean } {
      return { code: descriptor.code, effects: descriptor.code.includes("FxParams") };
    },
    createComputePipeline(descriptor: {
      compute: { module: { effects: boolean }; entryPoint: string };
    }): { getBindGroupLayout(): object; entry: string; effects: boolean } {
      return {
        getBindGroupLayout(): object {
          return {};
        },
        entry: descriptor.compute.entryPoint,
        effects: descriptor.compute.module.effects,
      };
    },
    createBuffer(descriptor: { size: number }): FakeBuffer {
      return makeBuffer(descriptor.size);
    },
    createBindGroup(descriptor: { entries: FakeBindGroup["entries"] }): FakeBindGroup {
      return { entries: descriptor.entries };
    },
    createCommandEncoder(): {
      beginComputePass(): {
        setPipeline(next: { entry: string; effects: boolean }): void;
        setBindGroup(_index: number, next: FakeBindGroup): void;
        dispatchWorkgroups(x: number): void;
        end(): void;
      };
      copyBufferToBuffer(source: FakeBuffer, sourceOffset: number, destination: FakeBuffer, destinationOffset: number, size: number): void;
      finish(): object;
    } {
      return {
        beginComputePass() {
          return {
            setPipeline(next: { entry: string; effects: boolean }): void {
              pipeline = next;
            },
            setBindGroup(_index: number, next: FakeBindGroup): void {
              bindGroup = next;
            },
            dispatchWorkgroups(): void {
              if (!bindGroup || !pipeline) return;
              calls.push({ entries: bindGroup.entries.length, effects: pipeline.effects, kind: pipeline.entry });
              if (pipeline.effects) {
                emulateEffects();
              } else if (pipeline.entry === "main") {
                emulateLegacy(0, 0);
              }
            },
            end(): void {},
          };
        },
        copyBufferToBuffer(source: FakeBuffer, sourceOffset: number, destination: FakeBuffer, destinationOffset: number, size: number): void {
          copies.push({ source, sourceOffset, destination, destinationOffset, size });
        },
        finish(): object {
          for (const copy of copies) {
            new Uint8Array(copy.destination.data).set(
              new Uint8Array(copy.source.data, copy.sourceOffset, copy.size),
              copy.destinationOffset,
            );
          }
          copies.length = 0;
          return {};
        },
      };
    },
    destroy(): void {},
  };

  return {
    gpu: {
      async requestAdapter(): Promise<{ requestDevice(): Promise<typeof device> }> {
        return {
          async requestDevice(): Promise<typeof device> {
            return device;
          },
        };
      },
    },
    calls,
  };
}

describe("A4 backend effects plumbing", () => {
  it("routes wind plus bounce planes through 11-binding dispatches", async () => {
    const { gpu, calls } = createEffectsFakeGPU();
    const backend = new WebGPUParticleBackend({ gpu: gpu as never });
    const result = await backend.update({
      count: 1,
      deltaTime: 0.5,
      positions: new Float32Array([0, 1, 0, 0]),
      velocities: new Float32Array([0, 0, 0, 2]),
      effects: makeEffectsInput({
        wind: {
          direction: { x: 2, y: 0, z: 0 },
          strength: 1,
          gustAmplitude: 0,
          gustDirection: { x: 1, y: 0, z: 0 },
          gustFrequency: 0.5,
          gustSpeed: 0.8,
        },
        planes: [{ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 1, killOnContact: false }],
      }),
    });
    expect(calls[calls.length - 1]).toMatchObject({ entries: 9, effects: true, kind: "main" });
    expect(result.workgroups).toBe(1);
    expect(result.positions[0]).toBeCloseTo(0.5, 4);
    expect(result.positions[1]).toBeCloseTo(1, 4);
    expect(result.positions[3]).toBeCloseTo(0.5, 6);
    expect(result.spawnRequests).toBeUndefined();
    expect(result.attributes).toBeUndefined();
    expect(result.trailPositions).toBeUndefined();
    backend.dispose();
  });

  it("signals compute kills with age -1 and the system retires them", async () => {
    const { gpu } = createEffectsFakeGPU();
    const backend = new WebGPUParticleBackend({ gpu: gpu as never });
    const system = new ParticleSystem({
      maxParticles: 4,
      emitters: [
        new ParticleEmitter({ seed: 21, emissionRate: 0, bursts: [{ time: 0, count: 2 }], lifetime: 4, speed: 0, shape: { type: "point", position: { x: 0, y: -3, z: 0 } } }),
      ],
      modules: [new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, mode: "kill" })],
    });
    await system.updateOnGPU(0.25, backend);
    expect(system.particles).toHaveLength(0);
    expect(system.getStats().killedCount).toBe(2);
    backend.dispose();
  });

  it("fires death-triggered sub-emitter requests into live children", async () => {
    const { gpu } = createEffectsFakeGPU();
    const backend = new WebGPUParticleBackend({ gpu: gpu as never });
    const system = new ParticleSystem({
      maxParticles: 16,
      emitters: [
        new ParticleEmitter({ seed: 31, emissionRate: 0, bursts: [{ time: 0, count: 1 }], lifetime: 0.5, speed: 0, shape: { type: "point" } }),
      ],
      modules: [
        new SubEmitterModule({
          trigger: "death",
          chance: 1,
          childrenPerEvent: 2,
          childEmitter: new ParticleEmitter({ seed: 33, emissionRate: 0, lifetime: 1, speed: 0 }),
        }),
      ],
    });
    await system.updateOnGPU(0.5, backend);
    const stats = system.getStats();
    expect(stats.gpuUpdates).toBe(1);
    expect(stats.gpuSpawns).toBe(2);
    expect(stats.spawnedCount).toBe(3);
    // The age-killed parent compacts away; its two children remain at age 0.
    expect(system.particles).toHaveLength(2);
    expect(system.particles.every((particle) => particle.age === 0)).toBe(true);
    backend.dispose();
  });

  it("applies GPU curve attributes and decodes trail rings", async () => {
    const { gpu } = createEffectsFakeGPU();
    const backend = new WebGPUParticleBackend({ gpu: gpu as never });
    const system = new ParticleSystem({
      maxParticles: 16,
      emitters: [
        new ParticleEmitter({ seed: 31, emissionRate: 0, bursts: [{ time: 0, count: 1 }], lifetime: 2, speed: 0, shape: { type: "point" } }),
      ],
      modules: [
        new ColorModule([
          { time: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
          { time: 1, color: { r: 0, g: 0, b: 1, a: 0 } },
        ]),
        new SizeModule([
          { time: 0, size: 0.1 },
          { time: 1, size: 0.5 },
        ]),
        new TrailModule({ maxPoints: 4, lifetime: 2 }),
      ],
    });
    await system.updateOnGPU(0.5, backend);
    expect(system.particles).toHaveLength(1);
    // t = 0.25 through the 16-stop LUT: r ~0.75, size ~0.2.
    expect(system.particles[0]?.color.r).toBeCloseTo(0.75, 2);
    expect(system.particles[0]?.color.b).toBeCloseTo(0.25, 2);
    expect(system.particles[0]?.size).toBeCloseTo(0.2, 2);
    const trail = system.particles[0]?.userData.trail as { age: number }[];
    expect(Array.isArray(trail)).toBe(true);
    expect(trail.length).toBe(2);
    backend.dispose();
  });

  it("accumulates trail history across system updates via ring feedback", async () => {
    const { gpu } = createEffectsFakeGPU();
    const backend = new WebGPUParticleBackend({ gpu: gpu as never });
    const system = new ParticleSystem({
      maxParticles: 4,
      emitters: [
        new ParticleEmitter({ seed: 51, emissionRate: 0, bursts: [{ time: 0, count: 1 }], lifetime: 4, speed: 0.5, shape: { type: "point" } }),
      ],
      modules: [new TrailModule({ maxPoints: 4, lifetime: 2 })],
    });
    await system.updateOnGPU(0.25, backend);
    const first = system.particles[0]?.userData.trail as { age: number }[];
    expect(first.length).toBe(2);
    await system.updateOnGPU(0.25, backend);
    const second = system.particles[0]?.userData.trail as { age: number }[];
    expect(second.length).toBe(3);
    // Oldest-first order: ages are non-increasing toward the head.
    expect(second[0]?.age ?? 0).toBeGreaterThanOrEqual(second[1]?.age ?? 0);
    expect(second[1]?.age ?? 0).toBeGreaterThanOrEqual(second[2]?.age ?? 0);
    backend.dispose();
  });

  it("keeps CPU hooks for backends without effects support", async () => {
    const { gpu } = createEffectsFakeGPU();
    void gpu;
    const legacy = {
      capabilities: { supported: true as const, backend: "webgpu" as const },
      calls: 0,
      async initialize(): Promise<void> {},
      async update(input: { positions: Float32Array; velocities: Float32Array; count: number; deltaTime: number }) {
        this.calls += 1;
        return { backend: "webgpu" as const, count: input.count, workgroups: 1, positions: input.positions.slice(), velocities: input.velocities.slice() };
      },
      dispose(): void {},
    };
    const color = new ColorModule([{ time: 0, color: { r: 0, g: 1, b: 0, a: 1 } }]);
    const system = new ParticleSystem({
      maxParticles: 2,
      emitters: [new ParticleEmitter({ seed: 41, emissionRate: 0, bursts: [{ time: 0, count: 1 }], lifetime: 2, speed: 0 })],
      modules: [color],
    });
    await system.updateOnGPU(0.5, legacy);
    expect(legacy.calls).toBe(1);
    expect(system.particles[0]?.color.g).toBe(1);
  });
});
