// PRD-07 P2-T8 — juice auto-mount harness.
// A Neon-style scene (dark backdrop, no explicit effect nodes) runs
// createGameEffects() with NO nodes() call — the §6.3.4 adoption realm binds
// it to the single flag-on app. hitSpark at the world origin (projected to
// canvas centre) must change ≥0.15% of a 64×64 centre region within frames
// N+1..N+3 under flags `vfx`, and 0 pixels under `none`.
import { camera, createAuraApp, createGameEffects, lights, primitives, scene } from "@aura3d/engine";
import { gameEffectsUnbound } from "/packages/engine/src/agent-api/vfx/effects-api.js";
import { mountReady } from "./mount-timing.js";

interface JuiceResult {
  readonly status: "ready" | "error";
  readonly mountMs?: number | null;
  readonly flags?: readonly string[];
  /** Fraction of region pixels changed vs the pre-spawn frame, per frame index. */
  readonly changedFractions?: readonly number[];
  readonly maxChangedFraction?: number;
  readonly liveParticles?: number;
  readonly unboundReason?: string | null;
  readonly regionPixels?: number;
  readonly errors?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_JUICE__?: JuiceResult;
  }
}

const REGION = 64;

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function regionPixels(canvas: HTMLCanvasElement): { data: Uint8ClampedArray; x0: number; y0: number } {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const x0 = Math.max(0, Math.floor(canvas.width / 2 - REGION / 2));
  const y0 = Math.max(0, Math.floor(canvas.height / 2 - REGION / 2));
  return { data: ctx.getImageData(x0, y0, Math.min(REGION, canvas.width), Math.min(REGION, canvas.height)).data, x0, y0 };
}

function changedFraction(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let changed = 0;
  const total = before.length / 4;
  for (let i = 0; i < before.length; i += 4) {
    const dr = Math.abs(before[i]! - after[i]!);
    const dg = Math.abs(before[i + 1]! - after[i + 1]!);
    const db = Math.abs(before[i + 2]! - after[i + 2]!);
    if (dr + dg + db > 24) changed += 1;
  }
  return changed / total;
}

async function main(): Promise<void> {
  const host = document.getElementById("stage")!;
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  const flags = raw ? raw.split(",").filter(Boolean) : [];

  // Neon-style scene: dark ground + a neon bar — no effect nodes at all.
  const built = scene()
    .add(primitives.plane({ name: "street", material: { color: "#0a0c14", roughness: 0.85, metalness: 0.1 }, size: [16, 1, 16], castShadow: false, receiveShadow: true }))
    .add(primitives.box({ name: "neon-bar", material: { color: "#101826", roughness: 0.4, metalness: 0.6 }, size: [2.4, 0.5, 0.5], castShadow: false }).position(0, 0.25, -2.2))
    .add(lights.ambient({ name: "ambient", color: "#223", intensity: 0.1 }));
  built.background("#03040a");
  built.camera(camera.perspective({ position: [0, 1.6, 6], target: [0, 0.4, 0], fov: 50, near: 0.05, far: 60 }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { qualityProfile: "production" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    ...(flags.length > 0 ? { qualityRebuild: { flags } } : {})
  });
  const __mount = await mountReady(app);

  // The Neon-Swarm juice call: game.effects() with no nodes() — adopted by
  // the §6.3.4 realm when this app is the single live flag-on app.
  const fx = createGameEffects();

  // Settle the scene first so region diffs only measure the spark.
  for (let i = 0; i < 30; i += 1) {
    app.step(1 / 60);
    await frame();
  }
  const canvas = host.querySelector("canvas")!;
  const before = regionPixels(canvas).data;

  // hitSpark at the world origin — dead centre of the camera target.
  fx.hitSpark([0, 0.4, 0], { intensity: 1.2, radius: 1.2 });

  const fractions: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    app.step(1 / 60);
    await frame();
    fractions.push(changedFraction(before, regionPixels(canvas).data));
  }

  const report = app.diagnostics() as unknown as {
    errors?: readonly string[];
    effects?: { liveParticles?: number };
  };

  window.__QR_PRD07_JUICE__ = {
    status: "ready",
    mountMs: __mount.mountMs,
    flags,
    changedFractions: fractions,
    maxChangedFraction: Math.max(...fractions),
    liveParticles: report.effects?.liveParticles,
    unboundReason: gameEffectsUnbound(),
    regionPixels: before.length / 4,
    errors: [...(report.errors ?? [])]
  };
  app.dispose();
}

main().catch((error: unknown) => {
  window.__QR_PRD07_JUICE__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});
