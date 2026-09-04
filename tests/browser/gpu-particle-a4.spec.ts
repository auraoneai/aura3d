import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  evaluateCurrentRoute,
  newCurrentRouteHealthPage,
} from "../../tools/current-routes-route-health/index";

interface A4FpsRuntime {
  readonly status: string;
  readonly selectedBackend: string;
  readonly adapterName: string;
  readonly capabilities: readonly string[];
  readonly readbackMode?: string;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile of an empty sample");
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

test.describe("A4 GPU particle effects", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("extended compute matches the CPU module stack on real hardware", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${server.origin}/examples/10-particles/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const effects = await import(moduleUrl);
      const capabilities = await effects.queryGPUParticleBackendCapabilities();
      if (!capabilities.supported) {
        return { skipped: true as const, reason: capabilities.reason ?? "no adapter" };
      }

      const count = 64;
      const deltaTime = 1 / 60;
      const steps = 3;
      const seed = 3.5;
      const lut = effects.createCurlNoiseLUT(8);
      const gradient = [
        { time: 0, color: { r: 1, g: 0.75, b: 0.3, a: 1 } },
        { time: 1, color: { r: 0.2, g: 0.2, b: 0.9, a: 0.1 } },
      ];
      const sizes = [
        { time: 0, size: 0.04 },
        { time: 1, size: 0.12 },
      ];

      let positions = new Float32Array(count * 4);
      let velocities = new Float32Array(count * 4);
      const accelerations = new Float32Array(count * 4);
      const lifetimes = new Float32Array(count);
      const baseColors: { r: number; g: number; b: number; a: number }[] = [];
      const baseSizes: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const angle = index * 2.399963229728653;
        positions[index * 4] = Math.cos(angle) * 1.2;
        positions[index * 4 + 1] = 1 + (index % 7) * 0.15;
        positions[index * 4 + 2] = Math.sin(angle) * 1.2;
        positions[index * 4 + 3] = 0;
        velocities[index * 4] = Math.cos(angle + Math.PI / 2) * 0.4;
        velocities[index * 4 + 1] = 0.3;
        velocities[index * 4 + 2] = Math.sin(angle + Math.PI / 2) * 0.4;
        // Short lifetime sits strictly inside step 3 (age 0.05 / 0.04 = 1.25),
        // clear of the trigger boundary on both float32 and float64.
        const lifetime = index === 0 ? 0.04 : 10;
        lifetimes[index] = lifetime;
        velocities[index * 4 + 3] = lifetime;
        accelerations[index * 4 + 1] = -1.5;
        baseColors.push({ r: 0.2 + 0.6 * ((index % 5) / 5), g: 0.5, b: 0.8, a: 1 });
        baseSizes.push(0.05 + 0.01 * (index % 7));
      }

      const heightfield = effects.createSineHeightfield(6, 6, 0.5, 0.05, 1.0, -1.5, -1.5);
      const gpuEffects = {
        time: 2,
        seed,
        wind: {
          direction: { x: 0.9, y: 0, z: 0.3 },
          strength: 0.5,
          gustAmplitude: 0.4,
          gustDirection: { x: 1, y: 0, z: 0.2 },
          gustFrequency: 0.5,
          gustSpeed: 0.8,
        },
        turbulence: { strength: 0.9, scale: 0.7, flowSpeed: 0.15, lut, lutResolution: 8 },
        planes: [{ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.4, killOnContact: false }],
        heightfield: {
          originX: heightfield.originX,
          originZ: heightfield.originZ,
          cellSize: heightfield.cellSize,
          columns: heightfield.columns,
          rows: heightfield.rows,
          heights: heightfield.heights,
          restitution: 0.35,
          killOnContact: false,
        },
        subEmitters: [{ triggerAge: 1, chance: 1, childCount: 2 }],
        lifeCurves: {
          colors: effects.encodeColorGradientLUT(gradient, 16),
          sizes: effects.encodeSizeCurveLUT(sizes, 16),
          stops: 16,
        },
        lighting: {
          ambient: [0.45, 0.45, 0.5] as [number, number, number],
          keyDirection: { x: 0.3, y: 1, z: 0.2 },
          diffuseStrength: 0.9,
        },
        trailPointsPerParticle: 4,
      };

      const backend = new effects.WebGPUParticleBackend();
      await backend.initialize();
      let gpuSpawn: number[] = [];
      let gpuAttributes = new Float32Array(0);
      let gpuTrail = new Float32Array(0);
      let trailHistory: Float32Array | undefined;
      let workgroups = 0;
      for (let step = 0; step < steps; step += 1) {
        const baseAttributes = new Float32Array(count * 8);
        for (let index = 0; index < count; index += 1) {
          const color = step === 0 ? baseColors[index]! : {
            r: gpuAttributes[index * 8] ?? 1,
            g: gpuAttributes[index * 8 + 1] ?? 1,
            b: gpuAttributes[index * 8 + 2] ?? 1,
            a: gpuAttributes[index * 8 + 3] ?? 1,
          };
          baseAttributes[index * 8] = color.r;
          baseAttributes[index * 8 + 1] = color.g;
          baseAttributes[index * 8 + 2] = color.b;
          baseAttributes[index * 8 + 3] = color.a;
          baseAttributes[index * 8 + 4] = step === 0 ? baseSizes[index]! : (gpuAttributes[index * 8 + 4] ?? 1);
        }
        const update = await backend.update({
          positions,
          velocities,
          accelerations,
          deltaTime,
          count,
          effects: { ...gpuEffects, time: 2 + step * deltaTime },
          baseAttributes,
          trailHistory,
        });
        positions = update.positions;
        velocities = update.velocities;
        workgroups = update.workgroups;
        gpuSpawn = update.spawnRequests ? Array.from(update.spawnRequests) : [];
        if (update.attributes) gpuAttributes = update.attributes;
        if (update.trailPositions) {
          gpuTrail = update.trailPositions;
          trailHistory = update.trailPositions;
        }
      }
      backend.dispose();

      // CPU reference through the real module implementations, same order as the kernel.
      const wind = new effects.WindModule({
        direction: { x: 0.9, y: 0, z: 0.3 },
        strength: 0.5,
        gustAmplitude: 0.4,
        gustDirection: { x: 1, y: 0, z: 0.2 },
        gustFrequency: 0.5,
        gustSpeed: 0.8,
      });
      const turbulence = new effects.TurbulenceModule({ strength: 0.9, scale: 0.7, flowSpeed: 0.15 });
      const collision = new effects.CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.4 });
      const ground = new effects.HeightfieldModule({ sampler: heightfield, restitution: 0.35 });
      const particles = [];
      for (let index = 0; index < count; index += 1) {
        particles.push(
          effects.createParticle({
            position: {
              x: Math.cos(index * 2.399963229728653) * 1.2,
              y: 1 + (index % 7) * 0.15,
              z: Math.sin(index * 2.399963229728653) * 1.2,
            },
            velocity: {
              x: Math.cos(index * 2.399963229728653 + Math.PI / 2) * 0.4,
              y: 0.3,
              z: Math.sin(index * 2.399963229728653 + Math.PI / 2) * 0.4,
            },
            acceleration: { x: 0, y: -1.5, z: 0 },
            color: baseColors[index],
            size: baseSizes[index],
            lifetime: lifetimes[index],
          }),
        );
      }
      const ringDepth = 4;
      const rings: { x: number; y: number; z: number; age: number }[][] = particles.map((particle) => [
        { x: particle.position.x, y: particle.position.y, z: particle.position.z, age: 0 },
        { x: 0, y: 0, z: 0, age: Number.POSITIVE_INFINITY },
        { x: 0, y: 0, z: 0, age: Number.POSITIVE_INFINITY },
        { x: 0, y: 0, z: 0, age: Number.POSITIVE_INFINITY },
      ]);
      const cpuSpawn = new Array<number>(count).fill(0);
      for (let step = 0; step < steps; step += 1) {
        const elapsedTime = 2 + step * deltaTime;
        for (let index = 0; index < count; index += 1) {
          const particle = particles[index]!;
          const context = { deltaTime, elapsedTime, normalizedAge: particle.age / particle.lifetime, random: () => 0 };
          wind.update(particle, context);
          turbulence.update(particle, context);
          particle.velocity.x += particle.acceleration.x * deltaTime;
          particle.velocity.y += particle.acceleration.y * deltaTime;
          particle.velocity.z += particle.acceleration.z * deltaTime;
          particle.position.x += particle.velocity.x * deltaTime;
          particle.position.y += particle.velocity.y * deltaTime;
          particle.position.z += particle.velocity.z * deltaTime;
          collision.afterIntegrate(particle, context);
          ground.afterIntegrate(particle, context);
          const previousAge = particle.age;
          particle.age += deltaTime;
          if (previousAge / particle.lifetime < 1 && particle.age / particle.lifetime >= 1) {
            cpuSpawn[index] = 2;
          }
          const t = Math.min(1, Math.max(0, particle.age / particle.lifetime));
          particle.color = effects.sampleColorGradient(gradient, t);
          particle.size = effects.sampleSizeCurve(sizes, t);
          particle.color = effects.computeLitParticleColor(particle.color, particle.velocity, {
            ambient: [0.45, 0.45, 0.5],
            keyDirection: { x: 0.3, y: 1, z: 0.2 },
            diffuseStrength: 0.9,
          });
          const ring = rings[index]!;
          for (let slot = ringDepth - 1; slot >= 1; slot -= 1) {
            ring[slot] = { ...ring[slot - 1]!, age: ring[slot - 1]!.age + deltaTime };
          }
          ring[0] = { x: particle.position.x, y: particle.position.y, z: particle.position.z, age: particle.age };
        }
      }

      let maxPositionDelta = 0;
      let maxVelocityDelta = 0;
      let maxAgeDelta = 0;
      let maxAttributeDelta = 0;
      let maxTrailDelta = 0;
      let moved = 0;
      for (let index = 0; index < count; index += 1) {
        const offset = index * 4;
        const particle = particles[index]!;
        maxPositionDelta = Math.max(
          maxPositionDelta,
          Math.abs((positions[offset] ?? 0) - particle.position.x),
          Math.abs((positions[offset + 1] ?? 0) - particle.position.y),
          Math.abs((positions[offset + 2] ?? 0) - particle.position.z),
        );
        maxVelocityDelta = Math.max(
          maxVelocityDelta,
          Math.abs((velocities[offset] ?? 0) - particle.velocity.x),
          Math.abs((velocities[offset + 1] ?? 0) - particle.velocity.y),
          Math.abs((velocities[offset + 2] ?? 0) - particle.velocity.z),
        );
        maxAgeDelta = Math.max(maxAgeDelta, Math.abs((positions[offset + 3] ?? 0) - particle.age));
        moved = Math.max(moved, Math.abs((positions[offset + 1] ?? 0) - (1 + (index % 7) * 0.15)));
        maxAttributeDelta = Math.max(
          maxAttributeDelta,
          Math.abs((gpuAttributes[offset * 2] ?? 0) - particle.color.r),
          Math.abs((gpuAttributes[offset * 2 + 1] ?? 0) - particle.color.g),
          Math.abs((gpuAttributes[offset * 2 + 2] ?? 0) - particle.color.b),
          Math.abs((gpuAttributes[offset * 2 + 3] ?? 0) - particle.color.a),
          Math.abs((gpuAttributes[offset * 2 + 4] ?? 0) - particle.size),
        );
        const ring = rings[index]!;
        for (let slot = 0; slot < ringDepth; slot += 1) {
          const target = (index * ringDepth + slot) * 4;
          const expected = ring[slot]!;
          if (!Number.isFinite(expected.age)) continue;
          maxTrailDelta = Math.max(
            maxTrailDelta,
            Math.abs((gpuTrail[target] ?? 0) - expected.x),
            Math.abs((gpuTrail[target + 1] ?? 0) - expected.y),
            Math.abs((gpuTrail[target + 2] ?? 0) - expected.z),
            Math.abs((gpuTrail[target + 3] ?? 0) - expected.age),
          );
        }
      }

      return {
        skipped: false as const,
        adapterName: capabilities.adapterName ?? null,
        workgroups,
        maxPositionDelta,
        maxVelocityDelta,
        maxAgeDelta,
        maxAttributeDelta,
        maxTrailDelta,
        moved,
        cpuSpawn,
        gpuSpawn,
      };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    if (result.skipped) {
      test.skip(true, `WebGPU unavailable in this browser: ${result.reason}`);
      return;
    }

    expect(result.workgroups).toBe(1);
    expect(result.moved).toBeGreaterThan(1e-4);
    expect(result.maxPositionDelta).toBeLessThan(1e-2);
    expect(result.maxVelocityDelta).toBeLessThan(1e-2);
    expect(result.maxAgeDelta).toBeLessThan(1e-4);
    expect(result.maxAttributeDelta).toBeLessThan(2e-2);
    expect(result.maxTrailDelta).toBeLessThan(1e-2);
    expect(result.gpuSpawn).toEqual(result.cpuSpawn);
  });

  test("sub-emitter plus curl turbulence demo route passes route-health", async ({ browser }) => {
    test.setTimeout(120_000);
    let vite: ViteDevServer | null = null;
    try {
      vite = await createServer({ root: process.cwd(), logLevel: "error", server: { hmr: false } });
      await vite.listen(0);
      const origin =
        vite.resolvedUrls?.local[0]?.replace(/\/$/, "") ??
        vite.resolvedUrls?.network[0]?.replace(/\/$/, "") ??
        "http://localhost:5180";
      const page = await newCurrentRouteHealthPage(browser);
      const route = {
        label: "Accelerated Particle Field",
        href: `${origin}/apps/wow-webgpu-compute-particles/`,
        path: "/apps/wow-webgpu-compute-particles/",
      };
      const health = await evaluateCurrentRoute(page, route);
      await page.close();
      mkdirSync(resolve("tests/reports"), { recursive: true });
      writeFileSync(resolve("tests/reports/gpu-particle-a4.json"), `${JSON.stringify(health, null, 2)}\n`);
      expect(health.failures, health.failures.join("\n")).toEqual([]);
      expect(health.status).toBe("ready");
      expect(health.working).toBe(true);
    } finally {
      await vite?.close();
    }
  });

  test("10k-particle scene with collision and trails holds 60fps on Apple Metal (sustained wall-clock)", async ({ browser }) => {
    test.setTimeout(180_000);
    let vite: ViteDevServer | null = null;
    try {
      vite = await createServer({ root: process.cwd(), logLevel: "error", server: { hmr: false } });
      await vite.listen(0);
      const origin =
        vite.resolvedUrls?.local[0]?.replace(/\/$/, "") ??
        vite.resolvedUrls?.network[0]?.replace(/\/$/, "") ??
        "http://localhost:5180";
      const page = await newCurrentRouteHealthPage(browser);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`${origin}/apps/wow-webgpu-compute-particles/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => {
          const runtime = (window as unknown as { __a3dWowRuntime?: { status?: string } }).__a3dWowRuntime;
          return runtime?.status === "running" || runtime?.status === "error" || runtime?.status === "unsupported";
        },
        undefined,
        { timeout: 90_000 }
      );
      // Warm up past emitter ramp so the window measures the steady-state
      // 10k-particle simulation with heightfield collision and ribbon trails.
      await page.waitForFunction(
        () => {
          const runtime = (window as unknown as { __a3dWowRuntime?: { frameCount?: number } }).__a3dWowRuntime;
          return (runtime?.frameCount ?? 0) >= 60;
        },
        undefined,
        { timeout: 90_000 }
      );
      const runtime = await page.evaluate(
        () => (window as unknown as { __a3dWowRuntime: A4FpsRuntime }).__a3dWowRuntime
      );

      // Sustained wall-clock probe: 180 consecutive rAF timestamps. The
      // deltas are real frame-to-frame wall-clock times over a ~3s window,
      // never a frame count divided by an assumed rate.
      const sample = await page.evaluate(
        () =>
          new Promise<{ intervals: number[] }>((resolve) => {
            const intervals: number[] = [];
            const total = 180;
            let last = -1;
            const tick = (now: number): void => {
              if (last >= 0) intervals.push(now - last);
              last = now;
              if (intervals.length >= total) {
                resolve({ intervals });
                return;
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })
      );
      await page.close();

      expect(errors, errors.join("\n")).toEqual([]);
      const sorted = [...sample.intervals].sort((a, b) => a - b);
      const frameCount = sorted.length;
      const windowMs = sorted.reduce((sum, value) => sum + value, 0);
      const frameMs = {
        mean: windowMs / Math.max(1, frameCount),
        median: percentile(sorted, 0.5),
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        max: sorted[frameCount - 1] ?? Number.NaN,
      };
      const fps = {
        mean: 1000 / Math.max(frameMs.mean, 1e-6),
        median: 1000 / Math.max(frameMs.median, 1e-6),
        p50: 1000 / Math.max(frameMs.p50, 1e-6),
        p95: 1000 / Math.max(frameMs.p95, 1e-6),
      };
      const requiredCapabilities = [
        "webgpu-compute",
        "a4-sub-emitters",
        "a4-curl-turbulence",
        "a4-heightfield-collision",
        "a4-ribbon-trails",
        "a4-life-curves",
        "a4-particle-lighting",
        "a4-soft-particles",
      ];
      const missingCapabilities = requiredCapabilities.filter(
        (capability) => !runtime.capabilities.includes(capability)
      );
      const fields = runtime.fields ?? {};
      const medianGate = fps.median >= 59;
      const p95Gate = frameMs.p95 <= 20;
      const pass =
        runtime.status === "running" &&
        runtime.selectedBackend === "webgpu" &&
        /metal/i.test(runtime.adapterName) &&
        missingCapabilities.length === 0 &&
        runtime.readbackMode === "compute storage readback" &&
        fields["Particles"] === 10_000 &&
        typeof fields["Live"] === "number" &&
        (fields["Live"] as number) > 1000 &&
        fields["Particle backend"] === "webgpu" &&
        String(fields["Collision"] ?? "").includes("heightfield") &&
        String(fields["Trails"] ?? "").includes("ring depth 6") &&
        frameCount >= 175 &&
        windowMs >= 2500 &&
        medianGate &&
        p95Gate;
      mkdirSync(resolve("tests/reports"), { recursive: true });
      writeFileSync(
        resolve("tests/reports/gpu-particle-a4-fps.json"),
        `${JSON.stringify(
          {
            schema: "a3d-gpu-particle-a4-sustained-fps",
            generatedAt: new Date().toISOString(),
            pass,
            gates: {
              statusRunning: runtime.status === "running",
              metalWebGPUBackend:
                runtime.selectedBackend === "webgpu" && /metal/i.test(runtime.adapterName),
              allFeatures: missingCapabilities.length === 0,
              missingCapabilities,
              computeReadback: runtime.readbackMode === "compute storage readback",
              tenKParticles: fields["Particles"] === 10_000,
              liveParticles: fields["Live"],
              backendField: fields["Particle backend"],
              collisionField: fields["Collision"],
              trailsField: fields["Trails"],
              sustainedWindow: { frames: frameCount, windowMs: Number(windowMs.toFixed(1)) },
              medianFpsAtLeast59: medianGate,
              p95FrameMsAtMost20: p95Gate,
            },
            measured: {
              adapterName: runtime.adapterName,
              frames: frameCount,
              windowMs: Number(windowMs.toFixed(2)),
              frameMs: {
                mean: Number(frameMs.mean.toFixed(3)),
                median: Number(frameMs.median.toFixed(3)),
                p50: Number(frameMs.p50.toFixed(3)),
                p95: Number(frameMs.p95.toFixed(3)),
                max: Number(frameMs.max.toFixed(3)),
              },
              fps: {
                mean: Number(fps.mean.toFixed(2)),
                median: Number(fps.median.toFixed(2)),
                p50: Number(fps.p50.toFixed(2)),
                p95: Number(fps.p95.toFixed(2)),
              },
            },
          },
          null,
          2
        )}\n`
      );

      expect(runtime.status).toBe("running");
      expect(runtime.selectedBackend).toBe("webgpu");
      expect(
        runtime.adapterName,
        `BLOCKED: expected Apple Metal adapter, saw ${JSON.stringify(runtime.adapterName)}. See tests/reports/gpu-particle-a4-fps.json`
      ).toMatch(/metal/i);
      expect(missingCapabilities, `missing capabilities: ${missingCapabilities.join(",")}`).toEqual([]);
      expect(runtime.readbackMode).toBe("compute storage readback");
      expect(fields["Particles"]).toBe(10_000);
      expect(fields["Live"] as number).toBeGreaterThan(1000);
      expect(fields["Particle backend"]).toBe("webgpu");
      expect(String(fields["Collision"] ?? "")).toContain("heightfield");
      expect(String(fields["Trails"] ?? "")).toContain("ring depth 6");
      expect(frameCount).toBeGreaterThanOrEqual(175);
      expect(windowMs).toBeGreaterThanOrEqual(2500);
      expect(
        fps.median,
        `BLOCKED: 10k-particle scene median ${fps.median.toFixed(2)}fps (p50 frame ${frameMs.p50.toFixed(2)}ms, p95 frame ${frameMs.p95.toFixed(2)}ms over ${frameCount} frames / ${windowMs.toFixed(0)}ms on ${runtime.adapterName}) cannot hold 60fps with collision+trails on. See tests/reports/gpu-particle-a4-fps.json`
      ).toBeGreaterThanOrEqual(59);
      expect(
        frameMs.p95,
        `BLOCKED: 10k-particle scene p95 frame ${frameMs.p95.toFixed(2)}ms (median ${fps.median.toFixed(2)}fps over ${frameCount} frames on ${runtime.adapterName}) is not a sustained 60fps hold with collision+trails on. See tests/reports/gpu-particle-a4-fps.json`
      ).toBeLessThanOrEqual(20);
    } finally {
      await vite?.close();
    }
  });

  test("soft-particle depth fade changes rendered pixels (fade on vs off)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${server.origin}/examples/10-particles/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const effects = await import(moduleUrl);
      // Same planar ground fade the wow-webgpu-compute-particles route uses:
      // camera anchor above the y=0 ground, fade over fadeDistance in front
      // of the ground hit along the view ray.
      const fadeDistance = 0.45;
      const camera = { x: 0, y: 1.5, z: 3.2 };
      const groundSceneDepth = (x: number, y: number, z: number): number => {
        const dx = x - camera.x;
        const dy = y - camera.y;
        const dz = z - camera.z;
        const distance = Math.hypot(dx, dy, dz);
        if (dy >= -1e-4) return Number.POSITIVE_INFINITY;
        return (camera.y / -dy) * distance;
      };
      const particleDepth = (x: number, y: number, z: number): number =>
        Math.hypot(x - camera.x, y - camera.y, z - camera.z);

      const unit = {
        contact: effects.computeSoftParticleFade(5, 5, fadeDistance),
        mid: effects.computeSoftParticleFade(5.225, 5, fadeDistance),
        far: effects.computeSoftParticleFade(6, 5, fadeDistance),
      };

      // Deterministic particle set spanning depths around the ground plane.
      let seed = 1234567;
      const rand = (): number => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      const particles = [];
      for (let index = 0; index < 256; index += 1) {
        particles.push(
          effects.createParticle({
            id: index + 1,
            position: { x: -3 + rand() * 6, y: -0.2 + rand() * 2.2, z: -3 + rand() * 6 },
            color: { r: 1, g: 0.6, b: 0.2, a: 0.9 },
            size: 0.06,
            lifetime: 10,
          })
        );
      }
      const renderer = new effects.ParticleRenderer();
      const off = renderer.buildBatch(particles);
      const on = renderer.buildBatch(particles, {
        softParticles: {
          enabled: true,
          fadeDistance,
          sceneDepthAt: (position: { x: number; y: number; z: number }) =>
            groundSceneDepth(position.x, position.y, position.z),
          particleDepthAt: (position: { x: number; y: number; z: number }) =>
            particleDepth(position.x, position.y, position.z),
        },
      });

      let partial = 0;
      let full = 0;
      let zero = 0;
      let offAllOne = true;
      let violations = 0;
      let meanAbsAlphaDelta = 0;
      for (let index = 0; index < on.sprites.length; index += 1) {
        const spriteOn = on.sprites[index]!;
        const spriteOff = off.sprites[index]!;
        if (spriteOff.fade !== 1) offAllOne = false;
        if (spriteOn.color.a - spriteOff.color.a > 1e-9) violations += 1;
        if (spriteOn.fade <= 0) zero += 1;
        else if (spriteOn.fade >= 1) full += 1;
        else partial += 1;
        meanAbsAlphaDelta += Math.abs(spriteOn.color.a - spriteOff.color.a);
      }
      meanAbsAlphaDelta /= Math.max(1, on.sprites.length);

      // Pixel proof: rasterize both batches to a real 2D canvas and diff.
      const width = 256;
      const height = 256;
      const rasterize = (sprites: { position: { x: number; y: number }; color: { r: number; g: number; b: number; a: number }; size: number }[]): Uint8ClampedArray => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("2D context unavailable for soft-particle pixel probe.");
        context.clearRect(0, 0, width, height);
        for (const sprite of sprites) {
          const px = ((sprite.position.x + 3) / 6) * width;
          const py = height - ((sprite.position.y + 1) / 4) * height;
          const radius = Math.max(1.5, (sprite.size / 6) * width);
          context.globalAlpha = Math.min(1, Math.max(0, sprite.color.a));
          context.fillStyle = `rgb(${Math.round(sprite.color.r * 255)},${Math.round(sprite.color.g * 255)},${Math.round(sprite.color.b * 255)})`;
          context.beginPath();
          context.arc(px, py, radius, 0, Math.PI * 2);
          context.fill();
        }
        context.globalAlpha = 1;
        return context.getImageData(0, 0, width, height).data;
      };
      const pixelsOff = rasterize(off.sprites);
      const pixelsOn = rasterize(on.sprites);
      let sumAbs = 0;
      let diffPixels = 0;
      for (let offset = 0; offset < pixelsOff.length; offset += 4) {
        const delta =
          Math.abs(pixelsOff[offset]! - pixelsOn[offset]!) +
          Math.abs(pixelsOff[offset + 1]! - pixelsOn[offset + 1]!) +
          Math.abs(pixelsOff[offset + 2]! - pixelsOn[offset + 2]!) +
          Math.abs(pixelsOff[offset + 3]! - pixelsOn[offset + 3]!);
        sumAbs += delta;
        if (delta > 0) diffPixels += 1;
      }
      const totalPixels = width * height;
      return {
        unit,
        offAllOne,
        violations,
        counts: { partial, full, zero, total: on.sprites.length },
        meanAbsAlphaDelta,
        pixel: {
          meanAbsDeltaPerPixel: sumAbs / totalPixels,
          diffPixels,
          diffFraction: diffPixels / totalPixels,
        },
      };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    const pass =
      result.unit.contact === 0 &&
      Math.abs(result.unit.mid - 0.5) < 1e-9 &&
      result.unit.far === 1 &&
      result.offAllOne &&
      result.violations === 0 &&
      result.counts.partial >= 1 &&
      result.counts.full >= 1 &&
      result.counts.zero >= 1 &&
      result.meanAbsAlphaDelta > 0.02 &&
      result.pixel.meanAbsDeltaPerPixel > 1 &&
      result.pixel.diffFraction > 0.005;
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/gpu-particle-a4-soft-particles.json"),
      `${JSON.stringify(
        {
          schema: "a3d-gpu-particle-a4-soft-particles",
          generatedAt: new Date().toISOString(),
          pass,
          measured: result,
        },
        null,
        2
      )}\n`
    );

    expect(result.unit.contact).toBe(0);
    expect(result.unit.mid).toBeCloseTo(0.5, 9);
    expect(result.unit.far).toBe(1);
    expect(result.offAllOne, "fade off must leave every sprite fully visible").toBe(true);
    expect(result.violations, "fade on must never brighten a sprite past fade off").toBe(0);
    expect(result.counts.partial, `expected partially faded sprites, saw ${JSON.stringify(result.counts)}`).toBeGreaterThanOrEqual(1);
    expect(result.counts.full, `expected fully visible sprites, saw ${JSON.stringify(result.counts)}`).toBeGreaterThanOrEqual(1);
    expect(result.counts.zero, `expected fully dissolved sprites, saw ${JSON.stringify(result.counts)}`).toBeGreaterThanOrEqual(1);
    expect(result.meanAbsAlphaDelta).toBeGreaterThan(0.02);
    expect(result.pixel.meanAbsDeltaPerPixel).toBeGreaterThan(1);
    expect(result.pixel.diffFraction).toBeGreaterThan(0.005);
  });
});
