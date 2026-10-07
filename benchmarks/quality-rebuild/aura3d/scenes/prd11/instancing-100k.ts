/**
 * Lane 11 Aura adapter for `prd11-instancing-100k` (C-30).
 *
 * 100,000 boxes on a seeded jittered grid — non-uniform `[0.3, 0.6, 0.3]`
 * size, per-instance colour in the `instancingGrid` palette domain
 * (hue 0.50-0.72, saturation ≥ 0.25) — via the public `instances.box` path.
 * The S4/S5 instancing workload and the V2 visual comparison against the
 * three.js `InstancedMesh` twin on the same seed.
 */

import {
  camera,
  createAuraApp,
  instances,
  lights,
  material,
  scene,
  type AuraApp,
  type AuraCreateAppRendererOptions,
  type AuraTransformSpec
} from "@aura3d/engine";
import type { ReadyPayload } from "../../../shared/types";

declare const __AURA3D_VERSION__: string;

const ITEMS = 100_000;

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

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h * 12) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export default async function run(host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const rng = mulberry32(0xa3d12);

  const side = Math.ceil(Math.sqrt(ITEMS));
  const spacing = 0.42;
  const half = ((side - 1) * spacing) / 2;
  const transforms: AuraTransformSpec[] = [];
  const colors: string[] = [];
  for (let i = 0; i < ITEMS; i += 1) {
    const ix = i % side;
    const iz = Math.floor(i / side);
    const height = 0.15 + rng() * 0.9;
    transforms.push({
      position: [ix * spacing - half + (rng() - 0.5) * 0.08, height / 2, iz * spacing - half + (rng() - 0.5) * 0.08],
      rotation: [0, rng() * Math.PI, 0],
      scale: [1, height / 0.6, 1]
    });
    colors.push(hslToHex(0.52 + rng() * 0.18, 0.55, 0.38 + rng() * 0.22));
  }

  const built = scene()
    .camera(camera.perspective({ position: [0, 52, 68], target: [0, 0, 0], fov: 45, near: 0.1, far: 400 }))
    .background("#1a2027")
    .add(lights.directional({ name: "sun", position: [-40, 60, 30], intensity: 2.4, color: "#fff4e0" }))
    .add(lights.ambient({ intensity: 0.4, color: "#bcd2e8" }))
    .add(instances.box({
      name: "instancing-100k",
      size: [0.3, 0.6, 0.3],
      material: material.pbr({ color: "#ffffff", roughness: 0.8, metalness: 0 }),
      castShadow: false,
      receiveShadow: false,
      transforms,
      colors: colors as readonly `#${string}`[]
    }));

  const qrList = new URLSearchParams(window.location.search).get("a3d-qr");
  const qrFlags = qrList === null ? [] : qrList.split(",").map((token) => token.trim()).filter((token) => token.length > 0);
  const auraQuality = new URLSearchParams(window.location.search).get("aura3d-quality");

  const app: AuraApp = createAuraApp(host, {
    scene: built,
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
    scene: "prd11-instancing-100k",
    engineVersion: typeof __AURA3D_VERSION__ === "string" ? __AURA3D_VERSION__ : "dev",
    capabilityLog: [],
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    extra: { items: ITEMS, backend: diagnostics.backend }
  };
}
