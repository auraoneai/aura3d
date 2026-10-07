/**
 * Lane 11 Aura adapter for `prd11-draw-call-stress` (C-30).
 *
 * 5,000 static primitives: 6 types × 12 colours × 4 roughness values on a
 * seeded jittered grid, one sun, no shadows — the S3 pixel-identity and S4
 * draw-reduction workload. Self-contained per CONTRACTS §6.2 (no shared
 * harness imports); the three.js twin draws the identical stream.
 */

import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  primitives,
  scene,
  type AuraApp,
  type AuraCreateAppRendererOptions
} from "@aura3d/engine";
import type { ReadyPayload } from "../../../shared/types";

declare const __AURA3D_VERSION__: string;

type Vec3 = [number, number, number];
const SHAPES = ["box", "sphere", "cylinder", "capsule", "torus", "plane"] as const;
const ROUGHNESS = [0.25, 0.5, 0.75, 0.95] as const;
const PALETTE = [
  "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db",
  "#9b59b6", "#e91e63", "#ecf0f1", "#95a5a6", "#7f8c8d", "#34495e"
] as const;
const ITEMS = 5000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default async function run(host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const rng = mulberry32(0xa3d11);

  const built = scene()
    .camera(camera.perspective({ position: [0, 26, 34], target: [0, 0, -4], fov: 50, near: 0.1, far: 300 }))
    .background("#20262e")
    .add(lights.directional({ name: "sun", position: [-8, 14, 6], intensity: 2.6, color: "#fff4e0" }))
    .add(lights.ambient({ intensity: 0.35, color: "#bcd2e8" }));

  const side = Math.ceil(Math.sqrt(ITEMS));
  const spacing = 0.9;
  const half = ((side - 1) * spacing) / 2;
  for (let i = 0; i < ITEMS; i += 1) {
    const shape = SHAPES[i % SHAPES.length];
    const color = PALETTE[Math.floor(i / SHAPES.length) % PALETTE.length];
    const roughness = ROUGHNESS[Math.floor(i / (SHAPES.length * PALETTE.length)) % ROUGHNESS.length];
    const ix = i % side;
    const iz = Math.floor(i / side);
    const yaw = rng() * Math.PI * 2;
    const size: Vec3 = shape === "plane" ? [0.5, 0.02, 0.5] : [0.42 + rng() * 0.2, 0.42 + rng() * 0.2, 0.42 + rng() * 0.2];
    const position: Vec3 = [ix * spacing - half + (rng() - 0.5) * 0.1, size[1] / 2, iz * spacing - half + (rng() - 0.5) * 0.1];
    built.add(primitives[shape]({
      name: `stress ${i}`,
      size,
      position,
      rotation: [0, yaw, 0],
      castShadow: false,
      receiveShadow: false,
      material: material.pbr({ color, roughness, metalness: 0 })
    }));
  }

  const qrList = new URLSearchParams(window.location.search).get("a3d-qr");
  const qrFlags = qrList === null ? [] : qrList.split(",").map((token) => token.trim()).filter((token) => token.length > 0);
  const auraQuality = new URLSearchParams(window.location.search).get("aura3d-quality");

  const app: AuraApp = createAuraApp(host, {
    scene: built.add(effects.fog({ density: 0.004, color: "#20262e" })),
    renderer: {
      mode: "production",
      qualityProfile: "production",
      fallback: "safe-basic",
      ...(auraQuality !== null ? { quality: auraQuality } : {})
    } satisfies AuraCreateAppRendererOptions,
    qualityRebuild: { flags: qrFlags },
    resize: false,
    autoStart: false
  });
  (window as unknown as { __PRD11_APP__?: AuraApp }).__PRD11_APP__ = app;
  await app.ready();

  let frames = 0;
  let lastDrawCalls = 0;
  const loop = (): void => {
    app.step(0);
    frames += 1;
    try {
      lastDrawCalls = app.diagnostics().drawCalls;
    } catch {
      // transient during early frames
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const deadline = performance.now() + 120_000;
  while (performance.now() < deadline) {
    if (lastDrawCalls > 0 || frames > 240) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const diagnostics = app.diagnostics();
  return {
    engine: "aura3d",
    scene: "prd11-draw-call-stress",
    engineVersion: typeof __AURA3D_VERSION__ === "string" ? __AURA3D_VERSION__ : "dev",
    capabilityLog: [],
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    extra: {
      items: ITEMS,
      backend: diagnostics.backend,
      batching: (diagnostics as { renderer?: { batching?: unknown } }).renderer?.batching ?? null
    }
  };
}
