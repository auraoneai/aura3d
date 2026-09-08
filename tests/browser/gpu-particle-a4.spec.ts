import { inspectParticleCompletions, particleDiagnosticJSON } from "./particle-completion-diagnostics";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { validateAcceptance, type ParticleAcceptance } from "../../tools/muse3jsparity-readiness/acceptance";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  evaluateCurrentRoute,
  newCurrentRouteHealthPage,
} from "../../tools/current-routes-route-health/index";

interface A4FpsRuntime {
  readonly frameCount: number;
  readonly error?: string;
  readonly unsupportedReason?: string;
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
        executedMasks: Array.from({length: count}, (_, i) => gpuAttributes[i * 8 + 5]),
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
    // Every lane must report the branches actually executed by the native shader.
    expect(result.executedMasks).toEqual(Array(64).fill(510));
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

  test("10k live rendered particles hold native Apple Metal thresholds for 60 wall-clock seconds", async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const page = await newCurrentRouteHealthPage(browser);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.bringToFront();
      await page.goto(`${server.origin}/apps/wow-webgpu-compute-particles/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const runtime = (window as Window & { __a3dWowRuntime?: A4FpsRuntime }).__a3dWowRuntime;
        if (runtime?.status === "error" || runtime?.status === "unsupported") throw new Error(runtime.error ?? runtime.unsupportedReason);
        return (runtime?.frameCount ?? 0) >= 150 && Number(runtime?.fields?.Live ?? 0) >= 10_000;
      }, undefined, { timeout: 120_000 });
      const runtime = await page.evaluate(() => (window as Window & { __a3dWowRuntime?: A4FpsRuntime }).__a3dWowRuntime as A4FpsRuntime);
      // WebGPU adapter.info can expose only a vendor (e.g. "apple"). Obtain the
      // actual browser GPU-process renderer separately; never rewrite that vendor.
      const cdp = await browser.newBrowserCDPSession();
      let browserGpuInfo: { gpu: { devices: unknown[]; auxAttributes?: Record<string, unknown>; featureStatus?: Record<string, string> }; modelName?: string; modelVersion?: string };
      try { browserGpuInfo = await cdp.send('SystemInfo.getInfo'); } finally { await cdp.detach(); }
      const browserRenderer = String(browserGpuInfo.gpu.auxAttributes?.glRenderer ?? '');
      const actualAdapterEvidence = `${runtime.adapterName}; browser GPU renderer: ${browserRenderer}`;
      const nativeMetalIdentity = /apple/i.test(actualAdapterEvidence) && /metal/i.test(browserRenderer)
        && !/swiftshader|llvmpipe|software rasterizer/i.test(actualAdapterEvidence);

      const sample = await page.evaluate(async () => {
        type Frame = { frameId: number; completedAt: number; frameMs: number; renderFenceReadbackBytes: number; collisionContacts: number; live: number; renderedLive: number; trailCount: number;
          ribbonVertices: number; faded: number; drawCalls: number; nativeSubmissions: number; width: number; height: number;
          visible: boolean; backend: string; executionPath?: string; capacity: number; count: number; workgroups: number; readbackBytes: number;
          computeAndReadbackMs: number; cpuSubmitAndReadbackMs: number; collision: number; trails: number; subemitters: number;
          turbulence: number; curves: number; lighting: number; childRequests: number; queueCompletedAt:number;
          counterSourceSubmission:number; counterSampleAge:number;
          submissionQueue?: { limit: number; inFlight: number; backpressureFrames: number } };
        const capture = (window as unknown as { __a3dParticle301: { start(): void; stop(): Frame[]; frames: Frame[] } }).__a3dParticle301;
        if (!capture) throw new Error("Missing actual particle completion capture");
        const start = performance.now(), rafIntervals: number[] = [];
        let previous = start;
        capture.start();
        await new Promise<void>((resolve, reject) => {
          const tick = (now: number) => {
            rafIntervals.push(now-previous); previous=now;
            if (document.visibilityState !== "visible") { reject(new Error("Foreground rendering lost during measurement")); return; }
            const frames=capture.frames, first=frames[0], last=frames[frames.length-1];
            if (first && last && last.completedAt-first.completedAt >= 60_000) { resolve(); return; }
            if (now-start > 120_000) { reject(new Error("No 60-second rendered completion window")); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return { frames: capture.stop(), rafIntervals,
          userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
          pixelRatio: devicePixelRatio, visibility: document.visibilityState,
          timing: "Per-submission GPU queue-completion callback intervals; compact reduction counters map on a fixed 60-submission cadence with disclosed source/age; separate GPU timestamps are post-window diagnostics",
          thermal: "Browser has no thermal sensor API; external runner hardware/thermal attestation is required" };
      });
      const frames=sample.frames;
      // Retain every receipt before metrics, visual controls, or diagnostics can
      // fail. Invalid clock values remain explicit; never nudge or drop a batch.
      const pacing=inspectParticleCompletions(frames);
      mkdirSync(resolve("tests/reports"),{recursive:true});
      const rawCapturePath=resolve("tests/reports/gpu-particle-301-raw-completions.json");
      writeFileSync(rawCapturePath,particleDiagnosticJSON({schema:"muse301-particle-raw-completions/v1",sample,pacing}));
      await testInfo.attach("unmodified particle completion receipts",{path:rawCapturePath,contentType:"application/json"});
      const intervals=frames.slice(1).map((f,i)=>f.completedAt-frames[i]!.completedAt);
      const sorted=[...intervals].sort((a,b)=>a-b), raf=[...sample.rafIntervals].sort((a,b)=>a-b);
      const windowMs=frames[frames.length-1]!.completedAt-frames[0]!.completedAt;
      const frameMs={ p50: percentile(sorted,0.5), p95: percentile(sorted,0.95), p99: percentile(sorted,0.99), max: Math.max(...sorted) };
      const { longestBelow55Ms, rollingFps, pacingError, timestampFailures, coalescedCompletions } = pacing;
      const fixed=frames[0]!;
      const frameFailures=frames.flatMap((f,i)=>{
        const failures: string[]=[];
        if (f.live<10_000 || f.renderedLive<10_000 || f.count<10_000) failures.push("live/rendered/dispatched below 10k");
        if (![f.collision, f.trails, f.subemitters, f.turbulence, f.curves, f.lighting, f.faded].every(n => n > 0)) failures.push("missing submitted effect");
        if (f.ribbonVertices<=0 || f.trailCount<=0 || f.workgroups<=0 || f.drawCalls<=0 || f.nativeSubmissions<=0) failures.push("missing device workload");
        if (f.completedAt!==f.queueCompletedAt || f.counterSourceSubmission<1 || f.counterSourceSubmission>f.frameId || f.counterSampleAge!==f.frameId-f.counterSourceSubmission || f.counterSampleAge<0 || f.counterSampleAge>=60) failures.push("missing queue completion or stale periodic counters");
        if (f.submissionQueue?.limit!==3 || !Number.isInteger(f.submissionQueue.inFlight) || f.submissionQueue.inFlight<1 || f.submissionQueue.inFlight>3) failures.push("timed bounded submission queue inactive");
        if (f.width!==fixed.width || f.height!==fixed.height || f.capacity!==fixed.capacity || f.executionPath!==fixed.executionPath) failures.push("workload adapted");
        if (!f.visible || f.backend!=="webgpu") failures.push("not visible native WebGPU");
        if (i>0 && f.frameId!==frames[i-1]!.frameId+1) failures.push("missing render frame receipt");
        return failures.map(reason=>({frame:f.frameId,reason}));
      });
      const thresholds={ wallClockMs:60_000, minLiveRendered:10_000, medianFps:59, p95Ms:20, maxSustainedBelow55Ms:1000,
        referenceAdapter:"Apple Metal", minWidth:1280, minHeight:720 };
      const hardwareAttestation=process.env.AURA3D_REFERENCE_HARDWARE_ATTESTATION ?? "";
      const acceptance: ParticleAcceptance = {
        schema: "muse301-particles/v1", nativeWebGPU: runtime.selectedBackend === "webgpu" && frames.every(f => f.backend === "webgpu" && f.nativeSubmissions > 0),
        adapter: actualAdapterEvidence, referenceDevice: hardwareAttestation,
        thermalConditions: hardwareAttestation, foreground: sample.visibility === "visible" && frames.every(f => f.visible),
        readbackBytes: frames.reduce((n, f) => n + f.readbackBytes + f.renderFenceReadbackBytes, 0),
        samples: frames.map(f => ({ atMs: f.completedAt, frameId: f.frameId, frameMs: f.frameMs,
          live: f.live, rendered: f.renderedLive, width: f.width, height: f.height,
          features: { collision: f.collision, trails: Math.min(f.trails, f.trailCount), subemitters: f.subemitters,
            turbulence: f.turbulence, lifeCurves: f.curves, lighting: f.lighting, softDepthFade: f.faded,
            collisionContacts: f.collisionContacts, childRequests: f.childRequests, ribbonVertices: f.ribbonVertices } })),
      };
      const acceptanceErrors = validateAcceptance("p01", acceptance, []);
      const pass=runtime.selectedBackend==="webgpu" && nativeMetalIdentity && frameFailures.length===0 &&
        windowMs>=thresholds.wallClockMs && 1000/frameMs.p50>=59 && frameMs.p95<=20 && longestBelow55Ms!==null && longestBelow55Ms<=1000 &&
        fixed.width>=1280 && fixed.height>=720 && frames.some(f=>f.faded>0) && frames.some(f=>f.childRequests>0) && frames.some(f=>f.collisionContacts>0) &&
        hardwareAttestation.length>0 && errors.length===0 && acceptanceErrors.length===0;
      mkdirSync(resolve("tests/reports"),{recursive:true});
      writeFileSync(resolve("tests/reports/gpu-particle-301-acceptance.json"), JSON.stringify(acceptance, null, 2));
      await page.evaluate(async()=>{
        const visual=(window as unknown as {__a3dParticle301Visual?:{control(o:Record<string,boolean>):Promise<void>}}).__a3dParticle301Visual;
        if(!visual)throw new Error('Missing native particle visual control');
        await visual.control({trails:true,softFade:true,lighting:true});
      });
      await page.screenshot({path:"tests/reports/gpu-particle-301-sustained.png"});
      const nativeCanvasImage = await page.screenshot({path:"tests/reports/gpu-particle-301-canvas-analysis.png",style:"#app { visibility: hidden !important; }"});
      // Analyze captured native pixels, excluding DOM telemetry. A white line with
      // a large submitted count cannot prove rendered color/life/lighting effects.
      const visual = await page.evaluate(async encoded => {
        const blob=await(await fetch(`data:image/png;base64,${encoded}`)).blob();
        const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
        const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();const data=ctx.getImageData(0,0,c.width,c.height).data;
        let coloredPixels=0,litPixels=0,minX=c.width,minY=c.height,maxX=-1,maxY=-1;
        for(let i=0;i<data.length;i+=4){const r=data[i]!,g=data[i+1]!,b=data[i+2]!;if(r>g*1.1&&r>b*1.2&&r>50){coloredPixels++;const x=(i/4)%c.width,y=Math.floor(i/4/c.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}if(r+g+b>180)litPixels++;}
        return {width:c.width,height:c.height,coloredPixels,litPixels,colorSpanX:Math.max(0,maxX-minX+1),colorSpanY:Math.max(0,maxY-minY+1)};
      },nativeCanvasImage.toString('base64'));

      const controls:Record<string,{changedPixels:number;absoluteDifference:number}>={};
      for(const feature of ['trails','softFade','lighting']){
        await page.evaluate(async feature=>{await(window as unknown as {__a3dParticle301Visual:{control(o:Record<string,boolean>):Promise<void>}}).__a3dParticle301Visual.control({trails:true,softFade:true,lighting:true,[feature]:false});},feature);
        const path=`tests/reports/gpu-particle-301-${feature}-disabled.png`;
        const image=await page.screenshot({path,style:"#app { visibility: hidden !important; }"});
        controls[feature]=await page.evaluate(async([a,b])=>{
          const decode=async(encoded:string)=>{const bitmap=await createImageBitmap(await(await fetch(`data:image/png;base64,${encoded}`)).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,c.width,c.height).data;};
          const first=await decode(a!),second=await decode(b!);let changedPixels=0,absoluteDifference=0;
          for(let i=0;i<first.length;i+=4){const d=Math.abs(first[i]!-second[i]!)+Math.abs(first[i+1]!-second[i+1]!)+Math.abs(first[i+2]!-second[i+2]!);absoluteDifference+=d;if(d>6)changedPixels++;}return {changedPixels,absoluteDifference};
        },[nativeCanvasImage.toString('base64'),image.toString('base64')]);
        await testInfo.attach(`native ${feature} disabled control`,{path,contentType:'image/png'});
      }
      await page.evaluate(async()=>{await(window as unknown as {__a3dParticle301Visual:{control(o:Record<string,boolean>):Promise<void>}}).__a3dParticle301Visual.control({trails:true,softFade:true,lighting:true});});
      await testInfo.attach("full live particle and ribbon workload",{path:"tests/reports/gpu-particle-301-sustained.png",contentType:"image/png"});
      // Diagnostic after the complete timed workload and all visual controls.
      // Same browser/rAF/HUD/viewport; native clear+map only. Never acceptance.
      const gpuTimingDiagnostic=await page.evaluate(async()=>{
        const control=(window as unknown as {__a3dParticle301GPUTiming:{supported:boolean;start():void;stop():unknown[];frames:unknown[]}}).__a3dParticle301GPUTiming;
        control.start();
        try {
          await new Promise<void>((resolve,reject)=>{
            const start=performance.now();
            const tick=()=>{
              if(document.visibilityState!=='visible'){reject(new Error('GPU timing lost foreground'));return;}
              if(control.frames.length>=120){resolve();return;}
              if(performance.now()-start>30_000){reject(new Error('GPU timing diagnostic timeout'));return;}
              requestAnimationFrame(tick);
            };requestAnimationFrame(tick);
          });
        }finally{control.stop();}
        return {supported:control.supported,completionFenceSupported:true,label:'Postwindow full-feature same-submission GPU queue-completion and counter-map callbacks; optional GPU timestamps, diagnostic only',frames:control.frames};
      });
      const gpuDiagnosticPath=resolve("tests/reports/gpu-particle-301-completion-fence-diagnostic.json");
      writeFileSync(gpuDiagnosticPath,particleDiagnosticJSON(gpuTimingDiagnostic));
      await testInfo.attach("same-submission GPU completion diagnostic",{path:gpuDiagnosticPath,contentType:"application/json"});
      const pacingControl=await page.evaluate(async()=>{
        type ControlFrame={completedAt:number;frameMs:number;kind:string;drawCalls:number;computeDispatches:number;width:number;height:number;foreground:boolean;cpuPhases:{encodeSubmitMs:number;mapWaitMs:number;validationWaitMs:number}};
        const control=(window as unknown as {__a3dParticle301Pacing:{start():void;stop():ControlFrame[];frames:ControlFrame[]}}).__a3dParticle301Pacing;
        const rafIntervals:number[]=[];let previous=performance.now();const start=previous;
        control.start();
        try{await new Promise<void>((resolve,reject)=>{
          const tick=(now:number)=>{rafIntervals.push(now-previous);previous=now;
            if(document.visibilityState!=='visible'){reject(new Error('Pacing control lost foreground'));return;}
            const frames=control.frames;
            if(frames.length>1&&frames.at(-1)!.completedAt-frames[0]!.completedAt>=10_000){resolve();return;}
            if(now-start>30_000){reject(new Error('Pacing control completion timeout'));return;}
            requestAnimationFrame(tick);
          };requestAnimationFrame(tick);
        });}finally{control.stop();}
        return {label:'Postwindow native clear-and-map only; no particle acceptance claim',frames:control.frames,rafIntervals};
      });
      writeFileSync(resolve("tests/reports/gpu-particle-a4-fps.json"),JSON.stringify({
        schema:"a3d-gpu-particle-a4-sustained-fps/3.0.1", generatedAt:new Date().toISOString(), pass:pass && visual.coloredPixels>1000 && visual.colorSpanY>visual.height*.1 && Object.values(controls).every(c=>c.changedPixels>100), thresholds,
        adapterName:runtime.adapterName, browserRenderer, browserGpuInfo, actualAdapterEvidence, nativeMetalIdentity, hardwareAttestation, runtime, ...sample, frameFailures, acceptanceErrors, errors, windowMs,
        frameMs, medianFps:1000/frameMs.p50, longestBelow55Ms, rollingFps, pacingError, timestampFailures, coalescedCompletions, visual, controls, pacingControl, gpuTimingDiagnostic,
        droppedRefreshIntervals:intervals.reduce((n,ms)=>n+Math.max(0,Math.round(ms/(1000/60))-1),0),
        rafPacing:{p50:percentile(raf,0.5),p95:percentile(raf,0.95),p99:percentile(raf,0.99)},
      },null,2));
      for(const [feature,control] of Object.entries(controls)) expect(control.changedPixels, `${feature} must change actual pixels at identical simulation state`).toBeGreaterThan(100);
      expect(visual.coloredPixels,"native particles must show their colored life/lighting output, not a white trace").toBeGreaterThan(1000);
      expect(visual.colorSpanY).toBeGreaterThan(visual.height*.1);
      expect(errors).toEqual([]);
      expect(pacingError,"invalid completion clocks remain an acceptance failure after diagnostic retention").toBeNull();
      expect(acceptanceErrors).toEqual([]);
      expect(frames.some(f=>f.collisionContacts>0), "native collision contacts must occur during the window").toBe(true);
      expect(runtime.selectedBackend).toBe("webgpu");
      expect(nativeMetalIdentity, "actual browser GPU process must report Apple Metal without a software rasterizer").toBe(true);
      expect(frameFailures).toEqual([]);
      expect(windowMs).toBeGreaterThanOrEqual(60_000);
      expect(fixed.width).toBeGreaterThanOrEqual(1280);
      expect(fixed.height).toBeGreaterThanOrEqual(720);
      expect(frames.some(f=>f.faded>0),"soft fade must affect the measured workload").toBe(true);
      expect(frames.some(f=>f.childRequests>0),"subemitters must request children during the window").toBe(true);
      expect(1000/frameMs.p50).toBeGreaterThanOrEqual(59);
      expect(frameMs.p95).toBeLessThanOrEqual(20);
      expect(longestBelow55Ms).toBeLessThanOrEqual(1000);
      expect(hardwareAttestation,"runner must disclose GPU/device and thermal/power conditions").not.toBe("");
      expect(pass).toBe(true);
    } finally { await page.close(); }
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

      // Pixel proof uses Aura's native renderer and the same per-sprite
      // vertex color/alpha submission as the live fixture, not a 2D proxy.
      const width = 256, height = 256;
      const canvas = document.createElement("canvas");
      canvas.width=width; canvas.height=height; document.body.append(canvas);
      const gpuRenderer=await effects.Renderer.create({canvas,width,height,backend:"webgl2",
        preserveDrawingBuffer:true,clearColor:[0,0,0,0],requiredFeatures:["basic-rendering","pixel-readback"]});
      const format=new effects.VertexFormat([
        {semantic:"position",components:3,offset:0},{semantic:"color",components:4,offset:12}
      ],28);
      const material=new effects.UnlitMaterial({color:[1,1,1,1],renderState:{blend:true,depthTest:false,depthWrite:false,cullMode:"none"}});
      const rasterize=(sprites: {position:{x:number;y:number};color:{r:number;g:number;b:number;a:number};size:number}[]):Uint8Array=>{
        const vertices=new effects.VertexBuffer(format,sprites.length*6);
        let vertex=0;
        for(const sprite of sprites){
          const x=sprite.position.x/3,y=(sprite.position.y+1)/2-1,r=Math.max(1.5/128,sprite.size/3);
          const corners=[[x-r,y-r,0],[x+r,y-r,0],[x+r,y+r,0],[x-r,y+r,0]];
          for(const corner of [0,1,2,0,2,3]){
            vertices.setAttribute(vertex,"position",corners[corner]!);
            vertices.setAttribute(vertex++,"color",[sprite.color.r,sprite.color.g,sprite.color.b,sprite.color.a]);
          }
        }
        gpuRenderer.render({cameraPolicy:"identity",renderItems:[{geometry:new effects.Geometry(vertices),material}]});
        const pixels=gpuRenderer.device.readPixels(0,0,width,height); vertices.dispose(); return pixels;
      };
      let pixelsOff:Uint8Array,pixelsOn:Uint8Array;
      try { pixelsOff=rasterize(off.sprites); pixelsOn=rasterize(on.sprites); }
      finally { gpuRenderer.dispose(); canvas.remove(); }
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
