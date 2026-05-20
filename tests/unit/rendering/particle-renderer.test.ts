import { describe, expect, it } from "vitest";
import {
  MockRenderDevice,
  ParticleEmitter,
  ParticleRenderer,
  ParticleRenderPass,
  ParticleSystem,
  RenderGraph,
  UnsupportedGPUParticleBackend,
  createParticle,
  createParticleEffectPreset,
  type GPUParticleBackend,
  type GPUParticleSpawnInput,
  type GPUParticleUpdateInput,
  type ParticleRenderBatch
} from "../../../packages/rendering/src";

describe("ParticleRenderPass", () => {
  it("samples old-branch cone and circle emitter shapes deterministically", () => {
    const cone = new ParticleEmitter({
      seed: 515,
      emissionRate: 0,
      bursts: [{ time: 0, count: 6 }],
      lifetime: 1,
      speed: 1,
      shape: { type: "cone", origin: { x: 1, y: 2, z: -1 }, radius: 0.5, length: 2, angle: Math.PI / 6, emitFromVolume: true }
    });
    const coneSystem = new ParticleSystem({ maxParticles: 6, emitters: [cone] });
    coneSystem.update(0.01);

    expect(coneSystem.particles).toHaveLength(6);
    for (const particle of coneSystem.particles) {
      expect(particle.position.y).toBeGreaterThanOrEqual(2);
      expect(particle.position.y).toBeLessThanOrEqual(4);
      expect(Math.hypot(particle.position.x - 1, particle.position.z + 1)).toBeLessThanOrEqual(0.5);
      expect(particle.velocity.y).toBeGreaterThan(0);
    }

    const repeat = new ParticleSystem({
      maxParticles: 6,
      emitters: [
        new ParticleEmitter({
          seed: 515,
          emissionRate: 0,
          bursts: [{ time: 0, count: 6 }],
          lifetime: 1,
          speed: 1,
          shape: { type: "cone", origin: { x: 1, y: 2, z: -1 }, radius: 0.5, length: 2, angle: Math.PI / 6, emitFromVolume: true }
        })
      ]
    });
    repeat.update(0.01);
    expect(repeat.particles.map((particle) => particle.position)).toEqual(coneSystem.particles.map((particle) => particle.position));

    const circle = new ParticleEmitter({
      seed: 616,
      emissionRate: 0,
      bursts: [{ time: 0, count: 5 }],
      lifetime: 1,
      speed: 0,
      shape: { type: "circle", center: { x: -1, y: 0.25, z: 2 }, radius: 0.75, arc: Math.PI }
    });
    const circleSystem = new ParticleSystem({ maxParticles: 5, emitters: [circle] });
    circleSystem.update(0.01);
    for (const particle of circleSystem.particles) {
      expect(particle.position.y).toBe(0.25);
      expect(Number(Math.hypot(particle.position.x + 1, particle.position.z - 2).toFixed(6))).toBe(0.75);
      expect(particle.position.z).toBeGreaterThanOrEqual(2);
    }

    expect(() => new ParticleEmitter({ shape: { type: "cone", radius: 1, length: 0 } })).toThrow(/cone length/);
    expect(() => new ParticleEmitter({ shape: { type: "circle", radius: 1, arc: Math.PI * 3 } })).toThrow(/circle arc/);
  });

  it("creates a bounded spark-shower preset from old particle module concepts", () => {
    const first = createParticleEffectPreset("spark-shower", { seed: 707, maxParticles: 80 });
    const second = createParticleEffectPreset("spark-shower", { seed: 707, maxParticles: 80 });
    first.update(0.05);
    second.update(0.05);

    expect(first.particles.length).toBeGreaterThan(20);
    expect(first.particles.length).toBe(second.particles.length);
    expect(first.particles.map((particle) => ({
      position: particle.position,
      velocity: particle.velocity,
      color: particle.color,
      size: particle.size
    }))).toEqual(second.particles.map((particle) => ({
      position: particle.position,
      velocity: particle.velocity,
      color: particle.color,
      size: particle.size
    })));
    expect(first.getStats().spawnedCount).toBeGreaterThan(20);
    first.update(0.35);
    second.update(0.35);
    expect(first.particles.map((particle) => ({
      position: particle.position,
      velocity: particle.velocity,
      color: particle.color,
      size: particle.size
    }))).toEqual(second.particles.map((particle) => ({
      position: particle.position,
      velocity: particle.velocity,
      color: particle.color,
      size: particle.size
    })));
    expect(first.particles.some((particle) => particle.color.g < 0.92)).toBe(true);
  });

  it("participates in RenderGraph and records particle buffer uploads", () => {
    const system = new ParticleSystem({
      maxParticles: 8,
      emitters: [
        new ParticleEmitter({
          seed: 7,
          emissionRate: 0,
          bursts: [{ time: 0, count: 3 }],
          lifetime: 1,
          initial: { size: 0.1 }
        })
      ]
    });
    system.update(0.01);

    const batches: ParticleRenderBatch[] = [];
    const pass = new ParticleRenderPass({
      system,
      target: { drawParticles: (batch) => batches.push(batch) },
      reads: ["scene-color"],
      writes: ["scene-color-with-particles"]
    });
    const graph = new RenderGraph();
    graph.addPass({
      name: "scene",
      reads: [],
      writes: ["scene-color"],
      execute() {}
    });
    graph.addPass(pass);
    graph.execute({ device: new MockRenderDevice(), width: 16, height: 16 });

    expect(batches).toHaveLength(1);
    expect(batches[0]?.liveCount).toBe(3);
    expect(batches[0]?.bounds).not.toBeNull();
    expect(pass.getLastBatch()?.liveCount).toBe(3);
    expect(system.getStats().bufferUploads).toBe(1);
    expect(system.getStats().uploadedBytes).toBeGreaterThan(0);
  });

  it("sorts particle batches deterministically and computes sprite bounds", () => {
    const renderer = new ParticleRenderer();
    const particles = [
      createParticle({ id: 1, position: { x: 0, y: 0, z: 5 }, size: 2 }),
      createParticle({ id: 2, position: { x: 0, y: 1, z: 1 }, size: 1 }),
      createParticle({ id: 3, position: { x: 0, y: 0, z: 5 }, size: 4 }),
      createParticle({ id: 4, alive: false, position: { x: 100, y: 100, z: 100 }, size: 100 })
    ];

    const frontToBack = renderer.buildBatch(particles, { sort: "front-to-back", cameraPosition: { x: 0, y: 0, z: 0 } });
    expect(frontToBack.sprites.map((sprite) => sprite.id)).toEqual([2, 1, 3]);
    expect(frontToBack.bounds).toEqual({
      min: { x: -2, y: -2, z: 0.5 },
      max: { x: 2, y: 2, z: 7 }
    });

    const backToFront = renderer.buildBatch(particles, { sort: "back-to-front", cameraPosition: { x: 0, y: 0, z: 0 } });
    expect(backToFront.sprites.map((sprite) => sprite.id)).toEqual([1, 3, 2]);
    expect(() => renderer.buildBatch(particles, { sort: "back-to-front" })).toThrow(/cameraPosition/);
    expect(() => renderer.buildBatch([createParticle({ position: { x: Number.NaN } })])).toThrow(/finite/);
  });

  it("selects a supported GPU backend automatically and falls back to CPU when unsupported", async () => {
    class DeterministicGPUBackend implements GPUParticleBackend {
      readonly capabilities = { supported: true, backend: "webgpu" as const };
      updates = 0;

      async initialize(): Promise<void> {}

      async update(input: GPUParticleUpdateInput) {
        this.updates += 1;
        const positions = input.positions.slice();
        const velocities = input.velocities.slice();
        for (let index = 0; index < input.count; index += 1) {
          const offset = index * 4;
          positions[offset] += velocities[offset] * input.deltaTime;
          positions[offset + 1] += velocities[offset + 1] * input.deltaTime;
          positions[offset + 2] += velocities[offset + 2] * input.deltaTime;
          positions[offset + 3] += input.deltaTime;
        }
        return {
          backend: "webgpu" as const,
          count: input.count,
          workgroups: 1,
          positions,
          velocities
        };
      }

      dispose(): void {}
    }

    const gpuBackend = new DeterministicGPUBackend();
    const gpuSystem = new ParticleSystem({
      maxParticles: 1,
      gpuBackend,
      emitters: [
        new ParticleEmitter({
          seed: 13,
          emissionRate: 0,
          bursts: [{ time: 0, count: 1 }],
          lifetime: 2,
          speed: 0,
          shape: { type: "point", position: { x: 1, y: 0, z: 0 } }
        })
      ]
    });

    await expect(gpuSystem.updateBest(0.5)).resolves.toBe("gpu");
    expect(gpuBackend.updates).toBe(1);
    expect(gpuSystem.particles[0]?.position.x).toBe(1);
    expect(gpuSystem.particles[0]?.age).toBe(0.5);
    expect(gpuSystem.getStats().gpuUpdates).toBe(1);

    const cpuSystem = new ParticleSystem({
      maxParticles: 1,
      gpuBackend: new UnsupportedGPUParticleBackend({ supported: false, backend: "none", reason: "test runtime has no WebGPU" }),
      emitters: [
        new ParticleEmitter({
          seed: 17,
          emissionRate: 0,
          bursts: [{ time: 0, count: 1 }],
          lifetime: 2,
          speed: 1
        })
      ]
    });

    await expect(cpuSystem.updateBest(0.25)).resolves.toBe("cpu");
    expect(cpuSystem.getStats().gpuUpdates).toBe(0);
    expect(cpuSystem.particles).toHaveLength(1);
  });

  it("draws GPU-updated particles through RenderGraph with deterministic sorted batches", async () => {
    class OffsetGPUBackend implements GPUParticleBackend {
      readonly capabilities = { supported: true, backend: "webgpu" as const };

      async initialize(): Promise<void> {}

      async update(input: GPUParticleUpdateInput) {
        const positions = input.positions.slice();
        const velocities = input.velocities.slice();
        for (let index = 0; index < input.count; index += 1) {
          const offset = index * 4;
          positions[offset] += velocities[offset] * input.deltaTime;
          positions[offset + 1] += velocities[offset + 1] * input.deltaTime;
          positions[offset + 2] += velocities[offset + 2] * input.deltaTime;
          positions[offset + 3] += input.deltaTime;
        }
        return {
          backend: "webgpu" as const,
          count: input.count,
          workgroups: 1,
          positions,
          velocities
        };
      }

      dispose(): void {}
    }

    const system = new ParticleSystem({ maxParticles: 4 });
    system.particles.push(
      createParticle({ id: 1, position: { x: 0, y: 0, z: 1 }, velocity: { x: 0, y: 0, z: 2 }, lifetime: 4 }),
      createParticle({ id: 2, position: { x: 0, y: 0, z: 4 }, velocity: { x: 0, y: 0, z: -2 }, lifetime: 4 })
    );
    await system.updateOnGPU(0.5, new OffsetGPUBackend());

    const batches: ParticleRenderBatch[] = [];
    const graph = new RenderGraph();
    graph.addPass({
      name: "scene",
      reads: [],
      writes: ["scene-color"],
      execute() {}
    });
    graph.addPass(new ParticleRenderPass({
      system,
      target: { drawParticles: (batch) => batches.push(batch) },
      renderOptions: { sort: "back-to-front", cameraPosition: { x: 0, y: 0, z: 0 } }
    }));

    graph.execute({ device: new MockRenderDevice(), width: 32, height: 32 });

    expect(system.getStats().gpuUpdates).toBe(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.sprites.map((sprite) => [sprite.id, sprite.position.z])).toEqual([
      [2, 3],
      [1, 2]
    ]);
    expect(batches[0]?.bounds).toEqual({
      min: { x: -0.5, y: -0.5, z: 1.5 },
      max: { x: 0.5, y: 0.5, z: 3.5 }
    });
  });

  it("updates GPU particles inside an async RenderGraph pass before drawing sorted batches", async () => {
    class GraphGPUBackend implements GPUParticleBackend {
      readonly capabilities = { supported: true, backend: "webgpu" as const };
      spawns = 0;
      updates = 0;

      async initialize(): Promise<void> {}

      async spawn(input: GPUParticleSpawnInput) {
        this.spawns += 1;
        const positions = input.positions.slice();
        const velocities = input.velocities.slice();
        const accelerations = input.accelerations?.slice() ?? new Float32Array(input.count * 4);
        positions[2] = 5;
        velocities[2] = -4;
        return {
          backend: "webgpu" as const,
          count: input.count,
          workgroups: 1,
          positions,
          velocities,
          accelerations
        };
      }

      async update(input: GPUParticleUpdateInput) {
        this.updates += 1;
        const positions = input.positions.slice();
        const velocities = input.velocities.slice();
        for (let index = 0; index < input.count; index += 1) {
          const offset = index * 4;
          positions[offset] += velocities[offset] * input.deltaTime;
          positions[offset + 1] += velocities[offset + 1] * input.deltaTime;
          positions[offset + 2] += velocities[offset + 2] * input.deltaTime;
          positions[offset + 3] += input.deltaTime;
        }
        return {
          backend: "webgpu" as const,
          count: input.count,
          workgroups: 1,
          positions,
          velocities
        };
      }

      dispose(): void {}
    }

    const backend = new GraphGPUBackend();
    const system = new ParticleSystem({
      maxParticles: 2,
      emitters: [
        new ParticleEmitter({
          seed: 23,
          emissionRate: 0,
          bursts: [{ time: 0, count: 1 }],
          lifetime: 4,
          speed: 0,
          initial: { size: 1 },
          shape: { type: "point", position: { x: 0, y: 0, z: 0 } }
        })
      ]
    });

    const batches: ParticleRenderBatch[] = [];
    const pass = new ParticleRenderPass({
      system,
      target: { drawParticles: (batch) => batches.push(batch) },
      update: { deltaTime: 0.5, gpuBackend: backend },
      renderOptions: { sort: "back-to-front", cameraPosition: { x: 0, y: 0, z: 0 } },
      reads: ["scene-color"],
      writes: ["scene-color-with-particles"]
    });
    const graph = new RenderGraph();
    graph.addPass({
      name: "scene",
      reads: [],
      writes: ["scene-color"],
      execute() {}
    });
    graph.addPass(pass);

    await graph.executeAsync({ device: new MockRenderDevice(), width: 32, height: 32 });

    expect(backend.spawns).toBe(1);
    expect(backend.updates).toBe(1);
    expect(pass.getLastUpdateMode()).toBe("gpu");
    expect(system.getStats()).toMatchObject({ liveCount: 1, gpuSpawns: 1, gpuUpdates: 1 });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.sprites.map((sprite) => [sprite.id, sprite.position.z])).toEqual([[1, 3]]);
    expect(pass.getLastBatch()?.bounds).toEqual({
      min: { x: -0.5, y: -0.5, z: 2.5 },
      max: { x: 0.5, y: 0.5, z: 3.5 }
    });
  });

  it("requires async graph execution for supported GPU particle updates", () => {
    const backend: GPUParticleBackend = {
      capabilities: { supported: true, backend: "webgpu" },
      async initialize(): Promise<void> {},
      async update(input: GPUParticleUpdateInput) {
        return {
          backend: "webgpu",
          count: input.count,
          workgroups: 1,
          positions: input.positions,
          velocities: input.velocities
        };
      },
      dispose() {}
    };
    const pass = new ParticleRenderPass({
      system: new ParticleSystem({ maxParticles: 1 }),
      target: { drawParticles() {} },
      update: { deltaTime: 0.016, gpuBackend: backend }
    });

    expect(() => pass.execute({ device: new MockRenderDevice(), width: 16, height: 16 })).toThrow(/executeAsync/);
  });

  it("initializes newly emitted particles through an optional GPU spawn path before GPU update", async () => {
    class SpawningGPUBackend implements GPUParticleBackend {
      readonly capabilities = { supported: true, backend: "webgpu" as const };
      spawns = 0;
      updates = 0;

      async initialize(): Promise<void> {}

      async spawn(input: GPUParticleSpawnInput) {
        this.spawns += 1;
        const positions = input.positions.slice();
        const velocities = input.velocities.slice();
        const accelerations = input.accelerations?.slice() ?? new Float32Array(input.count * 4);
        positions[1] = 2;
        velocities[0] = 4;
        accelerations[1] = -1;
        return {
          backend: "webgpu" as const,
          count: input.count,
          workgroups: 1,
          positions,
          velocities,
          accelerations
        };
      }

      async update(input: GPUParticleUpdateInput) {
        this.updates += 1;
        const positions = input.positions.slice();
        const velocities = input.velocities.slice();
        for (let index = 0; index < input.count; index += 1) {
          const offset = index * 4;
          velocities[offset] += (input.accelerations?.[offset] ?? 0) * input.deltaTime;
          velocities[offset + 1] += (input.accelerations?.[offset + 1] ?? 0) * input.deltaTime;
          velocities[offset + 2] += (input.accelerations?.[offset + 2] ?? 0) * input.deltaTime;
          positions[offset] += velocities[offset] * input.deltaTime;
          positions[offset + 1] += velocities[offset + 1] * input.deltaTime;
          positions[offset + 2] += velocities[offset + 2] * input.deltaTime;
          positions[offset + 3] += input.deltaTime;
        }
        return {
          backend: "webgpu" as const,
          count: input.count,
          workgroups: 1,
          positions,
          velocities
        };
      }

      dispose(): void {}
    }

    const backend = new SpawningGPUBackend();
    const system = new ParticleSystem({
      maxParticles: 1,
      gpuBackend: backend,
      emitters: [
        new ParticleEmitter({
          seed: 19,
          emissionRate: 0,
          bursts: [{ time: 0, count: 1 }],
          lifetime: 3,
          speed: 0,
          shape: { type: "point", position: { x: 1, y: 0, z: 0 } }
        })
      ]
    });

    await expect(system.updateBest(0.5)).resolves.toBe("gpu");

    expect(backend.spawns).toBe(1);
    expect(backend.updates).toBe(1);
    expect(system.getStats()).toMatchObject({
      liveCount: 1,
      gpuSpawns: 1,
      gpuUpdates: 1,
      bufferUploads: 2
    });
    expect(system.particles[0]?.previousPosition).toEqual({ x: 1, y: 2, z: 0 });
    expect(system.particles[0]?.position).toEqual({ x: 3, y: 1.75, z: 0 });
    expect(system.particles[0]?.velocity).toEqual({ x: 4, y: -0.5, z: 0 });
    expect(system.particles[0]?.acceleration).toEqual({ x: 0, y: -1, z: 0 });
  });
});
