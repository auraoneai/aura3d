// PRD-07 P1-T19 — production particles harness.
// Scene: ground plane + effects.particles({seed:1414, maxParticles:2000,
// blend:"additive", color:"#ff9a3c", size:0.06}) — the S1 fountain request.
// Flags come from ?a3d-qr=<list> so the same page validates flag-on draw and
// the flag-off zero-pixel sentinel.
import { camera, createAuraApp, effects, lights, primitives, scene } from "@aura3d/engine";

interface FountainResult {
  readonly status: "ready" | "error";
  readonly flags?: readonly string[];
  readonly drawCalls?: number;
  readonly liveParticles?: number;
  readonly batches?: number;
  readonly nodeDrawCalls?: number;
  readonly zeroPixelFrames?: number;
  readonly pixelBacked?: readonly string[];
  readonly warmFraction?: number;
  readonly warmPixels?: number;
  readonly regionPixels?: number;
  readonly deviceReadbacks?: number;
  readonly errors?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_FOUNTAIN__?: FountainResult;
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

async function main(): Promise<void> {
  const host = document.getElementById("stage")!;
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  const flags = raw ? raw.split(",").filter(Boolean) : [];

  const built = scene()
    .add(primitives.plane({ name: "ground", material: { color: "#15171c", roughness: 0.9, metalness: 0 }, size: [8, 1, 8], castShadow: false, receiveShadow: true }))
    .add(lights.ambient({ name: "ambient", color: "#ffffff", intensity: 0.05 }))
    .add(effects.particles({
      name: "fountain particles",
      emitter: "fountain",
      radius: 1.2,
      height: 2.4,
      color: "#ff9a3c",
      seed: 1414,
      size: 0.06,
      blend: "additive",
      maxParticles: 2000,
      prewarm: 1.25
    }).position(0, 0, 0));
  built.background("#05060a");
  built.camera(camera.perspective({ position: [0, 1.4, 4.6], target: [0, 1.1, 0], fov: 45, near: 0.05, far: 50 }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    ...(flags.length > 0 ? { qualityRebuild: { flags } } : {})
  });
  await app.ready();

  // Run past the 30-frame zero-pixel window so the sentinel fires flag-off.
  app.step(1.25);
  for (let i = 0; i < 40; i += 1) {
    app.step(1 / 60);
    await frame();
  }

  const diagnostics = app.diagnostics() as unknown as {
    drawCalls: number;
    errors: readonly string[];
    effects?: {
      nodes: readonly { drawCalls: number; live: number; zeroPixelFrames: number }[];
      batches: number;
      liveParticles: number;
      pixelBacked: readonly string[];
      deviceReadbacks?: number;
      errors: readonly { code: string; nodeId: string; message: string }[];
    };
  };
  const fx = diagnostics.effects;

  // Read pixels inside the centre band where the fountain column sits.
  const canvas = host.querySelector("canvas")!;
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const x0 = Math.floor(off.width * 0.2);
  const y0 = Math.floor(off.height * 0.1);
  const region = ctx.getImageData(x0, y0, Math.floor(off.width * 0.6), Math.floor(off.height * 0.75));
  let warm = 0;
  for (let i = 0; i < region.data.length; i += 4) {
    if (region.data[i]! - region.data[i + 2]! > 15 && region.data[i + 3]! > 0) warm += 1;
  }
  const regionPixels = region.data.length / 4;

  window.__QR_PRD07_FOUNTAIN__ = {
    status: "ready",
    flags,
    drawCalls: diagnostics.drawCalls,
    liveParticles: fx?.liveParticles,
    batches: fx?.batches,
    nodeDrawCalls: fx?.nodes?.[0]?.drawCalls,
    zeroPixelFrames: fx?.nodes?.[0]?.zeroPixelFrames,
    pixelBacked: fx?.pixelBacked,
    warmFraction: warm / regionPixels,
    warmPixels: warm,
    regionPixels,
    deviceReadbacks: fx?.deviceReadbacks,
    errors: [...diagnostics.errors, ...(fx?.errors ?? []).map((e) => `${e.code}:${e.nodeId}`)]
  };
}

main().catch((error: unknown) => {
  window.__QR_PRD07_FOUNTAIN__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});
