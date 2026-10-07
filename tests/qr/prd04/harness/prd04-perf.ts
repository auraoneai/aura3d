// PRD-04 §16.1 S16 — perf harness.
//
// Loads a bench scene through the aura3d engine, then steps the mounted
// AuraApp for `frames` iterations and reports wall-clock step statistics.
// Flag seams are set on this page directly (lane-15 wiring inside
// createAuraApp is still absent — qr-request to:prd15).
//
// Two scene paths:
//   scene=prd04-*           → prd04 adapters (flags applied by the adapter too)
//   scene=<legacy-id>       → /benchmarks/quality-rebuild/aura3d/<id>.ts default
//                           export (18-game-scene, gallery-shift, ...)
//
// URL params:
//   scene=<id>        (required)
//   flags=<csv>       materials|none|all — lane seams set BEFORE the scene module runs
//   frames=<n>        timed app.step(1/60) iterations (default 300)
//   settle=<n>        untimed warmup steps (default 60)
//   width|height=px   stage size (default 960x540)

import {
  camera,
  createAuraApp,
  lights,
  model,
  resolveQrFlags,
  scene,
  setTypedGLBActorQrFlags,
  setTypedGLBActorQrTransmissionMode,
  unsafeModelUrl,
  type AuraApp
} from "@aura3d/engine";
import { setRendererQrFlags } from "@aura3d/rendering";
import { expandPrd04FlagList } from "/benchmarks/quality-rebuild/scenes/prd04/flags.js";

interface LiveAppsRegistry {
  readonly count: () => number;
  readonly all: () => readonly AuraApp[];
  readonly pauseAll: () => number;
  readonly resumeAll: () => number;
  readonly settle: (steps?: number, dt?: number) => number;
}

declare global {
  interface Window {
    __AURA3D_LIVE_APPS__?: LiveAppsRegistry;
    __QR_READY__?: unknown;
    __QR_ERROR__?: string;
  }
}

const params = new URLSearchParams(globalThis.location.search);
const stage = document.getElementById("stage") ?? document.body;

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function main(): Promise<void> {
  const sceneId = params.get("scene");
  const assetUrl = params.get("asset");
  if (!sceneId && !assetUrl) throw new Error("scene or asset param required");
  const flags = (params.get("flags") ?? "").split(",").filter((flag) => flag.length > 0);
  const frames = Math.max(10, Number(params.get("frames") ?? 300));
  const settle = Math.max(0, Number(params.get("settle") ?? 60));
  const width = Number(params.get("width") ?? 960);
  const height = Number(params.get("height") ?? 540);
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  // Lane-04 seams first: the scene module creates its AuraApp on import → flag
  // state must be resolved before the default export runs.
  const qrFlags = resolveQrFlags({ options: expandPrd04FlagList(flags) });
  setTypedGLBActorQrFlags(qrFlags);
  setRendererQrFlags(qrFlags);
  setTypedGLBActorQrTransmissionMode("auto");

  const label = sceneId ?? `asset:${assetUrl}`;
  if (assetUrl) {
    // ?asset= mounts a bare hero-model scene (S16's "Gallery Shift mini-page":
    // the showcase's museum interior GLB plus a rig, no route code).
    const built = scene();
    built.background("#14161a");
    built.camera(camera.perspective({ position: [0, 1.4, 4.5], target: [0, 0.8, 0], fov: 45, near: 0.05, far: 80 }));
    built.add(lights.ambient({ name: "fill", intensity: 0.2, color: "#ffffff" }));
    built.add(lights.directional({ name: "key", position: [4, 5, 3], intensity: 2.2, color: "#fff4e2" }).lookAt(0, 0.5, 0));
    built.add(model(unsafeModelUrl(assetUrl), { name: "probe", scaleMode: "world" }).position(0, 0, 0));
    const app = createAuraApp(stage as HTMLElement, {
      scene: built,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      pixelRatio: 1,
      resize: false,
      autoStart: false
    });
    await app.ready();
  } else if (sceneId!.startsWith("prd04-")) {
    const { adapters } = (await import(
      /* @vite-ignore */ "/benchmarks/quality-rebuild/aura3d/scenes/prd04/index.js"
    )) as {
      adapters: Record<string, (host: HTMLElement, options?: { qrFlags?: readonly string[] }) => Promise<unknown>>;
    };
    const loader = adapters[sceneId!];
    if (!loader) throw new Error(`no prd04 adapter for ${sceneId}`);
    await loader(stage as HTMLElement, { qrFlags: flags });
  } else {
    const mod = (await import(
      /* @vite-ignore */ `/benchmarks/quality-rebuild/aura3d/${sceneId}.ts`
    )) as { default?: (host: HTMLElement) => Promise<unknown> };
    if (typeof mod.default !== "function") throw new Error(`scene ${sceneId} has no default export`);
    await mod.default(stage as HTMLElement);
  }

  const registry = window.__AURA3D_LIVE_APPS__;
  if (!registry || registry.count() === 0) {
    throw new Error(`scene ${label} mounted no AuraApp (registry empty)`);
  }
  const app = registry.all()[registry.count() - 1];
  app.pause();

  for (let index = 0; index < settle; index += 1) app.step(1 / 60);

  const deltas: number[] = [];
  for (let index = 0; index < frames; index += 1) {
    const t0 = performance.now();
    app.step(1 / 60);
    deltas.push(performance.now() - t0);
  }
  deltas.sort((a, b) => a - b);

  const diagnostics = app.diagnostics();
  window.__QR_READY__ = {
    scene: label,
    engine: "aura3d",
    flags,
    warnings: [],
    extra: {
      frames,
      settled: settle,
      medianMs: median(deltas),
      p95Ms: percentile(deltas, 95),
      meanMs: deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length,
      minMs: deltas[0],
      maxMs: deltas[deltas.length - 1],
      drawCalls: diagnostics.drawCalls,
      backend: diagnostics.backend,
      fps: diagnostics.fps
    }
  };
}

main().catch((error) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}
${error.stack ?? ""}` : String(error);
});
