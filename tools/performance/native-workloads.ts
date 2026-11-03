/** Reproducible source workloads for the post-CODE_COMPLETE_GO browser probe. */
import { GPUProfiler, type GPUProfilerStatus, type GPUProfilerTimer } from "../../packages/debug/src/GPUProfiler";
export type NativeWorkloadId = "primitive" | "product" | "instances" | "animation" | "game-loop" | "effects" | "asset-import";

export interface NativeWorkload {
  readonly id: NativeWorkloadId;
  readonly revision: 1;
  readonly description: string;
  readonly seed: number;
  readonly look: "product-studio";
  readonly quality: "production";
  readonly viewport: { readonly width: 640; readonly height: 360; readonly dpr: 1 };
  readonly browser: "selected-playwright-project";
  readonly backend: "webgl2";
  readonly warmupFrames: 30;
  readonly timedFrames: 300;
  readonly asset: { readonly url: string; readonly sha256: string; readonly license: string; readonly provenance: string } | null;
}

const productAsset = {
  url: "/packages/create-aura3d/templates/premium-product-viewer/public/aura-assets/khronosToyCar.01a60862.glb",
  sha256: "01a60862de55cd4b9f3acfab0b0def86451800f9c42467fcd61052c16cb9838c",
  license: "CC0-1.0",
  provenance: "Khronos glTF-Sample-Assets ToyCar (Microsoft), premium-product-viewer/aura.assets.json"
} as const;
const animationAsset = {
  url: "/tests/fixtures/locomotion-301/public/aura-assets/kenneyArticulatedCandidate.5f01ae3b.glb",
  sha256: "5f01ae3ba85bc72a1dd33968cbfdf809849543242e6e59b5095163a9821ff613",
  license: "CC0-1.0",
  provenance: "Kenney Platformer Kit, Aura3D articulated derivation; tests/fixtures/locomotion-301/aura.assets.json"
} as const;

function workload(id: NativeWorkloadId, description: string, asset: NativeWorkload["asset"] = null): NativeWorkload {
  return { id, revision: 1, description, seed: 251025, look: "product-studio", quality: "production",
    viewport: { width: 640, height: 360, dpr: 1 }, browser: "selected-playwright-project", backend: "webgl2",
    warmupFrames: 30, timedFrames: 300, asset };
}

/** The report hash binds each definition to its workload and instrumentation source files. */
export const NATIVE_WORKLOADS: readonly NativeWorkload[] = [
  workload("primitive", "One PBR cube with the fixed studio look"),
  workload("product", "Textured ToyCar product viewer", productAsset),
  workload("instances", "2,048 seeded PBR instances"),
  workload("animation", "Skinned Kenney walk clip", animationAsset),
  workload("game-loop", "Fixed-step public platformer kit driving a scene node"),
  workload("effects", "Emissive subject with bloom and the studio look"),
  workload("asset-import", "ToyCar admitted, decoded and mounted through model()", productAsset)
];

export function nativeWorkload(id: NativeWorkloadId): NativeWorkload {
  const found = NATIVE_WORKLOADS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown native performance workload: ${id}`);
  return found;
}

type Summary = { readonly p50: number; readonly p95: number; readonly p99: number; readonly count: number };
export function summarizeSamples(samples: readonly number[]): Summary | null {
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), count: sorted.length };
}

/**
 * Observe actual WebGL object create/delete calls, not the renderer's ledger.
 * Counts are object handles, not GPU residency bytes. Installed before mounting.
 */
function observeWebGLResources() {
  const kinds = ["Buffer", "Texture", "Framebuffer", "Renderbuffer", "Program", "Shader", "VertexArray"] as const;
  const live = new Map<string, Set<object>>(kinds.map((kind) => [kind, new Set<object>()]));
  const allocated = new Map<string, number>(kinds.map((kind) => [kind, 0]));
  const prototype = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: any[]) => any>;
  const originals = new Map<string, (...args: any[]) => any>();
  for (const kind of kinds) {
    for (const prefix of ["create", "delete"] as const) {
      const name = `${prefix}${kind}`;
      const original = prototype[name];
      if (typeof original !== "function") continue;
      originals.set(name, original);
      prototype[name] = function (this: WebGL2RenderingContext, ...args: any[]) {
        const result = original.apply(this, args);
        if (prefix === "create" && result) {
          live.get(kind)!.add(result as object);
          allocated.set(kind, allocated.get(kind)! + 1);
        } else if (prefix === "delete" && args[0]) live.get(kind)!.delete(args[0] as object);
        return result;
      };
    }
  }
  return {
    snapshot: () => ({ live: Object.fromEntries([...live].map(([kind, items]) => [kind, items.size])), allocations: Object.fromEntries(allocated) }),
    restore: () => { for (const [name, original] of originals) prototype[name] = original; }
  };
}

/**
 * The shared profiler owns the asynchronous EXT_disjoint_timer_query_webgl2
 * queries, QUERY_RESULT_AVAILABLE polling and GPU_DISJOINT_EXT/loss handling.
 * A session is usable only when every frame has a completed device result.
 */
export function createDeviceTimer(gl: WebGL2RenderingContext) {
  const profiler = new GPUProfiler(gl, "EXT_disjoint_timer_query_webgl2 unavailable");
  let reason: string | null = null;
  let nextLabel = 0;
  let disposed = false;
  const statusReason = (status: GPUProfilerStatus, fallback?: string): string => {
    switch (status) {
      case "disjoint": return "GPU timer became disjoint";
      case "device-lost": return "WebGL context lost";
      case "overlapping": return "A GPU elapsed-time query is already active";
      case "invalid-result": return "GPU timer returned an invalid value";
      case "discarded": return "GPU query limit reached before results became available";
      case "unsupported": return fallback ?? "EXT_disjoint_timer_query_webgl2 unavailable";
      case "query-failed": return fallback ?? "GPU timer query failed";
      case "disposed": return "GPU timer was disposed";
      case "pending":
      case "available": return fallback ?? "GPU timer result unavailable";
    }
  };
  const poll = () => {
    const snapshot = profiler.snapshot();
    const failure = snapshot.measurements.find((measurement) =>
      measurement.gpuStatus !== "pending" && measurement.gpuStatus !== "available");
    if (!reason && failure) reason = statusReason(failure.gpuStatus, snapshot.unavailableReason);
    if (!reason && !snapshot.supported) reason = snapshot.unavailableReason ?? "GPU timer unavailable";
    return snapshot;
  };
  const dispose = () => {
    if (!disposed) { disposed = true; profiler.dispose(); }
  };
  return {
    begin(): GPUProfilerTimer | null {
      poll();
      if (reason) return null;
      try {
        const timer = profiler.begin(`frame-${++nextLabel}`);
        // A query can be rejected, lost or made disjoint while begin() runs.
        // Check its state before handing an active scope to the caller.
        const snapshot = poll();
        const measurement = snapshot.measurements[snapshot.measurements.length - 1];
        if (reason || !measurement || measurement.gpuStatus !== "pending") {
          timer.end();
          reason ??= "GPU query could not start";
          return null;
        }
        return timer;
      } catch {
        reason = "GPU query could not start";
        return null;
      }
    },
    end(timer: GPUProfilerTimer | null): void {
      if (!timer) return;
      try {
        timer.end();
        poll();
      } catch {
        reason = "GPU query could not end";
      }
    },
    async finish(expected: number): Promise<{ summary: Summary | null; unavailable: string | null }> {
      try {
        const deadline = performance.now() + 5000;
        let snapshot = poll();
        while (!reason && snapshot.pendingCount && performance.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          snapshot = poll();
        }
        if (!reason && snapshot.pendingCount) reason = "GPU query results did not become available before the deadline";
        const samples = snapshot.samples.map((sample) => sample.durationMs);
        if (!reason && samples.length !== expected) reason = `Only ${samples.length} of ${expected} GPU results completed`;
        return { summary: reason ? null : summarizeSamples(samples), unavailable: reason };
      } finally {
        dispose();
      }
    },
    dispose
  };
}

/** Runs only in the browser acceptance harness; importing this module does not start a browser. */
export async function runNativeWorkload(id: NativeWorkloadId) {
  const spec = nativeWorkload(id);
  const resources = observeWebGLResources();
  try {
    return await runObservedWorkload(spec, resources);
  } finally {
    resources.restore();
  }
}

async function runObservedWorkload(spec: NativeWorkload, resources: ReturnType<typeof observeWebGLResources>) {
  const id = spec.id;
  const { camera, createAuraApp, defineAuraAssets, effects, game, instances, looks, material, model, primitives, scene } = await import("@aura3d/engine");
  const canvas = document.createElement("canvas");
  canvas.width = spec.viewport.width;
  canvas.height = spec.viewport.height;
  canvas.style.width = `${spec.viewport.width}px`;
  canvas.style.height = `${spec.viewport.height}px`;
  const root = scene().camera(camera.perspective({ position: [4, 3, 6], target: [0, 0.5, 0], fov: 45 })).add(looks.preset(spec.look));
  const surface = material.pbr({ color: "#6e9fbd", roughness: 0.45, metallic: 0.15 });
  const assets = spec.asset ? defineAuraAssets({ subject: {
    type: "model", format: "glb", url: spec.asset.url, hash: `sha256-${spec.asset.sha256}`
  } } as const) : null;
  if (id === "product" || id === "asset-import") {
    root.add(model(assets!.subject, { name: "product", targetMaxDimension: 2 }).runtime(game.runtimeNode("subject")));
    if (id === "product") root.add(primitives.plane({ size: [8, 1, 8], material: material.pbr({ color: "#777f87", roughness: 0.9 }) }).position(0, -1, 0));
  } else if (id === "animation") root.add(model(assets!.subject, { name: "performer", targetHeight: 2 }).animate({ clip: "walk", loop: true, speed: 1 }).runtime(game.runtimeNode("subject")));
  else if (id === "instances") {
    let state = spec.seed >>> 0;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
    const transforms = Array.from({ length: 2048 }, () => ({ position: [(random() - 0.5) * 12, random() * 3, (random() - 0.5) * 12] as [number, number, number], scale: 0.12 }));
    root.add(instances.box({ transforms, material: surface }));
  } else if (id === "effects") {
    root.add(primitives.box({ material: material.emissive({ color: "#ffffff", emissive: "#ffb060", emissiveIntensity: 4 }) }));
    root.add(effects.bloom({ intensity: 0.5, threshold: 1, radius: 0.5 }));
  } else {
    root.add(primitives.box({ name: "actor", material: surface }).runtime(game.runtimeNode("actor")));
  }
  document.body.appendChild(canvas);
  let disposeApp: (() => Promise<void>) | undefined;
  try {
    const app = createAuraApp(canvas, { scene: root, autoStart: false, resize: false, ...looks.appOptions(spec.look), quality: spec.quality });
    disposeApp = () => app.disposeAsync();
    const kit = id === "game-loop" ? game.platformer({ id: "native-perf", start: { x: 0, y: 2 }, finish: { x: 12, y: 1 }, platforms: [{ id: "ground", x: -4, y: 0, width: 24, height: 1 }] }) : null;
    let gameMinimumX = Infinity;
    let gameMaximumX = -Infinity;
    if (kit) app.onFrame(({ dt, frame }) => {
      const state = kit.step(dt, { moveX: frame % 240 < 120 ? 1 : -1, jumpPressed: frame % 120 === 10 });
      gameMinimumX = Math.min(gameMinimumX, state.player.x);
      gameMaximumX = Math.max(gameMaximumX, state.player.x);
      app.nodes.require("actor").setPosition(state.player.x, state.player.y, 0);
    });
    await app.ready();
    let first = app.diagnostics();
    const startupDeadline = performance.now() + 30_000;
    do {
      app.step(1 / 60);
      first = app.diagnostics();
      if (first.drawCalls > 0 && (!spec.asset || app.nodes.require("subject").snapshot().importedAssetEvidence)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (performance.now() < startupDeadline);
    if (first.backend !== "webgl2" || first.drawCalls <= 0 || first.errors.length) throw new Error(`No drawable WebGL2 first frame: ${JSON.stringify(first.errors)}`);
    const imported = spec.asset ? app.nodes.require("subject").snapshot().importedAssetEvidence : undefined;
    if (spec.asset && (!imported || imported.renderItemCount === 0)) throw new Error("Required imported model did not produce render items");
    if (id === "animation" && (!imported?.clips.includes("walk") || imported.skinnedRenderItemCount === 0)) throw new Error("Walk clip or skinned render items are unavailable");
    const startupMs = performance.now(); // navigationStart is time origin
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 context unavailable after renderer mount");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const adapter = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null;
    for (let i = 0; i < spec.warmupFrames; i++) app.step(1 / 60);
    if (id === "animation" && app.nodes.require("subject").snapshot().importedAssetEvidence?.activeClip !== "walk") {
      throw new Error("The skinned walk clip did not become active");
    }
    const timer = createDeviceTimer(gl);
    const frameTimes: number[] = [];
    const cpuWallTimes: number[] = [];
    let gpu: Awaited<ReturnType<typeof timer.finish>>;
    try {
      let last = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      for (let i = 0; i < spec.timedFrames; i++) {
        const tick = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        frameTimes.push(tick - last);
        last = tick;
        const query = timer.begin();
        const start = performance.now();
        try { app.step(1 / 60); cpuWallTimes.push(performance.now() - start); }
        finally { timer.end(query); }
      }
      gpu = await timer.finish(spec.timedFrames);
    } finally {
      timer.dispose();
    }
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    const liveBeforeDispose = resources.snapshot();
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length) throw new Error(`Renderer reported errors: ${JSON.stringify(diagnostics.errors)}`);
    if (kit && !(gameMaximumX > gameMinimumX)) throw new Error("The platformer workload did not advance the player");
    await app.disposeAsync();
    disposeApp = undefined;
    const liveAfterDispose = resources.snapshot();
    return { startupMs, frame: summarizeSamples(frameTimes), cpuWall: summarizeSamples(cpuWallTimes), gpu,
      heapBytes: heap, liveBeforeDispose, liveAfterDispose, adapter, diagnostics, timedFrames: frameTimes.length,
      workloadEvidence: { imported, gameXRange: kit ? [gameMinimumX, gameMaximumX] : null } };
  } finally {
    try { await disposeApp?.(); }
    finally { canvas.remove(); }
  }
}
