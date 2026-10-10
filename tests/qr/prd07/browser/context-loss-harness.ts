// §16 context-loss round-trip harness — mounts a fountain particles scene
// (particle buffers + sim targets + atlas-backed billboards through C-29
// resourceRegistrySlot) and exposes the app plus pixel/diagnostic probes on
// window.__QR_PRD07_CTX__ for the spec to lose/restore against.

import { camera, createAuraApp, effects, lights, primitives, scene } from "@aura3d/engine";
import { mountReady } from "./mount-timing.js";

interface CtxResult {
  readonly status: "ready" | "error";
  readonly mountMs?: number | null;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_CTX__?:
      | CtxResult
      | {
          status: "ready";
          mountMs: number | null;
          app: { diagnostics(): unknown; step(dt: number): void };
          warmPixels(): number;
        };
  }
}

function warmPixels(canvas: HTMLCanvasElement): number {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const region = ctx.getImageData(
    Math.floor(off.width * 0.2),
    Math.floor(off.height * 0.1),
    Math.floor(off.width * 0.6),
    Math.floor(off.height * 0.75)
  );
  let warm = 0;
  for (let i = 0; i < region.data.length; i += 4) {
    if (region.data[i]! - region.data[i + 2]! > 15 && region.data[i + 3]! > 0) warm += 1;
  }
  return warm;
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const flags = (params.get("a3d-qr") ?? "").split(",").map((f) => f.trim()).filter((f) => f.length > 0);
  const host = document.getElementById("stage")!;

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
  const mount = await mountReady(app);

  const canvas = host.querySelector("canvas")!;
  window.__QR_PRD07_CTX__ = {
    status: "ready",
    mountMs: mount.mountMs,
    app: { diagnostics: () => app.diagnostics(), step: (dt: number) => app.step(dt) },
    warmPixels: () => warmPixels(canvas)
  };
}

main().catch((error: unknown) => {
  window.__QR_PRD07_CTX__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});
