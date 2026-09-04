import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";
import { WebGL2Device, resolveGpuTargetOwner } from "@aura3d/rendering";

/**
 * PART U1 browser soak (muse3jsparity-PRD): 50 mount/step/dispose cycles at
 * route level (heap signal) plus 50 alloc/dispose cycles on a real WebGL2
 * device (registry signal: live counts return to zero every cycle, every
 * target carries bytes + lane owner). The spec drives `run()` between two
 * CDP-forced GCs so both heap ends are GC-disciplined; the harness never
 * invents a GC of its own.
 */

interface SoakCycleEvidence {
  readonly cycle: number;
  readonly drawCalls: number;
  readonly heapUsed: number | null;
}

interface RegistryCycleEvidence {
  readonly cycle: number;
  readonly liveRenderTargets: number;
  readonly gpuTargetCount: number;
  readonly gpuTargetBytes: number;
  readonly owners: readonly string[];
}

interface SoakReport {
  readonly status: "ready" | "running" | "done" | "error";
  readonly cycles: SoakCycleEvidence[];
  readonly registry: RegistryCycleEvidence[];
  readonly registryFinal: {
    readonly renderTargets: number;
    readonly gpuTargetCount: number;
    readonly gpuTargetBytes: number;
    readonly disposedRenderTargets: number;
  } | null;
  readonly ownersSeen: readonly string[];
  readonly shadowBytesSeen: number;
  readonly mirrorBytesSeen: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_RESOURCE_SOAK_U1__?: SoakReport & {
      runRouteCycles(cycles: number): Promise<{ cycles: SoakCycleEvidence[] }>;
      runRegistry(cycles: number): Promise<{
        registry: RegistryCycleEvidence[];
        registryFinal: SoakReport["registryFinal"];
        ownersSeen: readonly string[];
        shadowBytesSeen: number;
        mirrorBytesSeen: number;
      }>;
    };
  }
}

function heapUsed(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

function buildScene() {
  return scene()
    .background("#05070b")
    .camera(camera.perspective({ position: [0, 0.35, 3.2], target: [0, 0, 0], fov: 45 }))
    .add(lights.ambient({ intensity: 0.22 }))
    .add(lights.directional({ name: "key", intensity: 3 }).position(1.6, 2.1, 2.4))
    .add(
      primitives
        .box({ name: "u1 soak subject", material: material.pbr({ color: "#60a5fa", roughness: 0.32, metallic: 0.18 }) })
        .rotate(0.32, 0.62, 0)
    );
}

const SHADER = (marker: string) => ({
  label: "u1-soak-shader",
  marker,
  vertex: `attribute vec3 position; // ${marker}\nvoid main() { gl_Position = vec4(position, 1.0); }`,
  fragment: `precision mediump float; // ${marker}\nvoid main() { gl_FragColor = vec4(1.0); }`
});

function routeCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById("route");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing canvas#route.");
  return canvas;
}

function deviceCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById("device");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing canvas#device.");
  return canvas;
}

function harness(): SoakReport {
  const report = window.__AURA3D_RESOURCE_SOAK_U1__;
  if (!report) throw new Error("Soak harness state missing.");
  return report;
}

/**
 * Phase A — route-level mount/step/dispose chunk (heap signal). Chunked so
 * the spec can force a GC and read the heap between chunks; the per-chunk
 * ends after warmup carry the flat-trend verdict, not a single absolute
 * delta that warmup retention (JIT, first-mount caches) would dominate.
 */
async function runRouteCycles(cycles: number): Promise<{ cycles: SoakCycleEvidence[] }> {
  const canvas = routeCanvas();
  const report = harness();
  const built = buildScene();
  const out: SoakCycleEvidence[] = [];
  const base = report.cycles.length;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const app = createAuraApp(canvas, {
      scene: built,
      autoStart: false,
      pixelRatio: 1,
      resize: false,
      renderer: { qualityProfile: "production" }
    });
    await app.ready();
    app.step(1 / 60);
    const diagnostics = app.diagnostics();
    const evidence: SoakCycleEvidence = { cycle: base + cycle, drawCalls: diagnostics.drawCalls, heapUsed: heapUsed() };
    report.cycles.push(evidence);
    out.push(evidence);
    app.dispose();
    // Let the browser reclaim between cycles; without a yield the heap
    // reading below measures one long-lived frame, not N mounts.
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return { cycles: out };
}

/**
 * Phase B — real-GL registry soak: every cycle allocates a B1-labeled shadow
 * target, a B4-labeled mirror target, a buffer, and a program, then releases
 * all four. Live counts must return to zero each cycle and every target must
 * carry bytes + its lane owner.
 */
async function runRegistry(cycles: number): Promise<{
  registry: RegistryCycleEvidence[];
  registryFinal: SoakReport["registryFinal"];
  ownersSeen: readonly string[];
  shadowBytesSeen: number;
  mirrorBytesSeen: number;
}> {
  const report = harness();
  const device = WebGL2Device.create({ canvas: deviceCanvas() });
  const ownersSeen = new Set<string>();
  let shadowBytesSeen = 0;
  let mirrorBytesSeen = 0;
  const registry: RegistryCycleEvidence[] = [];
  try {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const shadow = device.createRenderTarget({
        width: 64,
        height: 64,
        label: "u1-soak-spot-shadow-map",
        format: "rgba8",
        depth: "texture"
      });
      const mirror = device.createRenderTarget({
        width: 64,
        height: 64,
        label: "u1-soak-mirror-target",
        format: "rgba8",
        depth: "renderbuffer"
      });
      const buffer = device.createBuffer("vertex", 256, new Uint8Array(256));
      const program = device.createShaderProgram(SHADER("U1SOAK"));
      const mid = device.getDiagnostics();
      const entries = mid.gpuTargets ?? [];
      for (const entry of entries) ownersSeen.add(entry.owner);
      const shadowEntry = entries.find((entry) => entry.label === "u1-soak-spot-shadow-map");
      const mirrorEntry = entries.find((entry) => entry.label === "u1-soak-mirror-target");
      if (!shadowEntry || shadowEntry.owner !== "b1-shadow" || shadowEntry.bytes <= 0) {
        throw new Error(`B1 shadow target missing bytes/owner: ${JSON.stringify(shadowEntry)}`);
      }
      if (!mirrorEntry || mirrorEntry.owner !== "b4-reflection" || mirrorEntry.bytes <= 0) {
        throw new Error(`B4 mirror target missing bytes/owner: ${JSON.stringify(mirrorEntry)}`);
      }
      if (resolveGpuTargetOwner(shadowEntry.label) !== "b1-shadow") throw new Error("Owner mapping drift for B1 label.");
      shadowBytesSeen = shadowEntry.bytes;
      mirrorBytesSeen = mirrorEntry.bytes;
      const evidence: RegistryCycleEvidence = {
        cycle,
        liveRenderTargets: mid.renderTargets ?? -1,
        gpuTargetCount: entries.length,
        gpuTargetBytes: mid.gpuTargetBytes ?? -1,
        owners: entries.map((entry) => entry.owner)
      };
      registry.push(evidence);
      report.registry.push(evidence);
      shadow.dispose();
      mirror.dispose();
      buffer.dispose();
      program.dispose();
      const after = device.getDiagnostics();
      if ((after.renderTargets ?? -1) !== 0 || (after.gpuTargets ?? []).length !== 0 || (after.gpuTargetBytes ?? -1) !== 0) {
        throw new Error(
          `Registry not flat after cycle ${cycle}: renderTargets=${after.renderTargets} gpuTargets=${(after.gpuTargets ?? []).length} bytes=${after.gpuTargetBytes}`
        );
      }
    }
    const final = device.getDiagnostics();
    report.registryFinal = {
      renderTargets: final.renderTargets ?? -1,
      gpuTargetCount: (final.gpuTargets ?? []).length,
      gpuTargetBytes: final.gpuTargetBytes ?? -1,
      disposedRenderTargets: final.disposedRenderTargets ?? -1
    };
    report.ownersSeen = [...ownersSeen].sort();
    report.shadowBytesSeen = shadowBytesSeen;
    report.mirrorBytesSeen = mirrorBytesSeen;
  } finally {
    device.dispose();
  }
  return {
    registry,
    registryFinal: report.registryFinal,
    ownersSeen: [...ownersSeen].sort(),
    shadowBytesSeen,
    mirrorBytesSeen
  };
}

function fail(error: unknown): never {
  const report = window.__AURA3D_RESOURCE_SOAK_U1__;
  if (report) {
    report.status = "error";
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  }
  throw error;
}

window.__AURA3D_RESOURCE_SOAK_U1__ = {
  status: "ready",
  cycles: [],
  registry: [],
  registryFinal: null,
  ownersSeen: [],
  shadowBytesSeen: 0,
  mirrorBytesSeen: 0,
  runRouteCycles: async (cycles: number) => {
    const report = harness();
    if (report.status === "running" || report.status === "done") throw new Error("Soak harness busy or finished.");
    report.status = "running";
    try {
      const out = await runRouteCycles(cycles);
      report.status = "ready";
      return out;
    } catch (error) {
      fail(error);
    }
  },
  runRegistry: async (cycles: number) => {
    const report = harness();
    if (report.status === "running") throw new Error("Soak harness busy.");
    report.status = "running";
    try {
      const out = await runRegistry(cycles);
      report.status = "done";
      return out;
    } catch (error) {
      fail(error);
    }
  }
};
