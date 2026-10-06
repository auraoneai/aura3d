/**
 * Lane 11 Aura adapter for `prd11-tier-ladder` (C-30).
 *
 * Composes the same content as the harness's base "18-game-scene" using only
 * the public `@aura3d/engine` API — the lane owns this file end to end, so no
 * shared harness module is imported (CONTRACTS §6.2).
 *
 * URL parameters (read here, on the lane's own page):
 * - `?a3d-qr=<list>` — lane flags, forwarded as `qualityRebuild.flags`.
 *   `createAuraApp` never passes `url`/`env` to `resolveQrFlags` (§5.2 source 2
 *   is dead app-side), so callers must forward the list explicitly.
 * - `?aura3d-quality=<tier>` — forwarded as `renderer.quality` (C-27; inert
 *   until Phase 4's resolver lands).
 * - `?loadMs=<n>` — burns `n` ms of CPU inside every rAF before stepping the
 *   app, simulating game-logic load (benchmark only).
 *
 * The mounted app is exposed as `window.__PRD11_APP__` so lane specs can read
 * `diagnostics().frame` (S1 fps-agreement).
 */

import {
  camera,
  createAuraApp,
  defineAuraAssets,
  effects,
  environments,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraApp,
  type AuraCreateAppRendererOptions
} from "@aura3d/engine";
import type { ReadyPayload } from "../../../shared/types";

declare const __AURA3D_VERSION__: string;

// Manifest-pinned asset definitions (same files and sha256 values as the
// shared benchmark asset table; the production bridge rejects unhashed models).
const assets = defineAuraAssets({
  soldier: { type: "model", format: "glb", url: "/qr-assets/soldier.glb", hash: "sha256-dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b", bounds: [1.848, 1.832, 0.444], metadata: { animations: ["Idle", "Run", "TPose", "Walk"] } },
  crate: { type: "model", format: "glb", url: "/qr-assets/deepRecoveryCrateStandard.02520123.glb", hash: "sha256-13538c98506b87082db17c41abbc08ef0ed8e746014fac5f1557e382f2831212" },
  rockA: { type: "model", format: "glb", url: "/qr-assets/propRockA.52dd1f0f.glb", hash: "sha256-8d130714b680895fbbeb6ebbbe1ce8b5f093bc7022f709c41a7e0dfebd41b0f8" },
  rockB: { type: "model", format: "glb", url: "/qr-assets/propRockB.c94b2733.glb", hash: "sha256-2edd4309ad1858a019de47b56020068108d6c6d42c25e59efae992034ac350d1" }
});
const hdri = defineAuraAssets({
  autumnFieldPuresky: { type: "texture", format: "hdr", url: "/qr-assets/autumn_field_puresky_1k.hdr", hash: "sha256-e60470d3a0f219585df1d74c393b472361c5400a7ff8d071ebe6eca29b7fe2b0" }
});

function queryNumber(name: string): number | null {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function busyLoop(ms: number): void {
  const deadline = performance.now() + ms;
  let acc = 0;
  while (performance.now() < deadline) {
    acc += Math.sqrt(acc + 1);
  }
  void acc;
}

export default async function run(host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const auraQuality = new URLSearchParams(window.location.search).get("aura3d-quality");
  const loadMs = queryNumber("loadMs") ?? 0;

  const built = scene()
    .camera(camera.perspective({ position: [1.2, 2.4, 4.2], target: [0, 1.2, -3], fov: 55, near: 0.1, far: 200 }))
    .background("#8fa3b8")
    .add(environments.hdri({ texture: hdri.autumnFieldPuresky, intensity: 0.7 }))
    .add(lights.directional({ name: "sun", position: [-6, 10, 4], intensity: 3, color: "#fff1d6", shadow: true }))
    .add(primitives.plane({ name: "ground", size: 60, material: material.pbr({ color: "#5d6b45", roughness: 0.95, metalness: 0 }), receiveShadow: true }))
    .add(model(assets.soldier, { name: "player soldier", position: [0, 0, 0], castShadow: true, receiveShadow: true }))
    .add(model(assets.crate, { name: "crate left", position: [-1.8, 0, -3], castShadow: true, receiveShadow: true }))
    .add(model(assets.crate, { name: "crate left stacked", position: [-1.8, 1, -3], rotation: [0, 0.5, 0], castShadow: true, receiveShadow: true }))
    .add(model(assets.crate, { name: "crate right", position: [2.2, 0, -5], rotation: [0, -0.3, 0], castShadow: true, receiveShadow: true }))
    .add(model(assets.rockB, { name: "boulder near", position: [3, 0.4, -9], scale: 0.4, castShadow: true, receiveShadow: true }))
    .add(model(assets.rockB, { name: "boulder far", position: [-4, 0.4, -12], rotation: [0, 2, 0], scale: 0.5, castShadow: true, receiveShadow: true }))
    .add(model(assets.rockA, { name: "rock small", position: [1.5, 0, -2.5], scale: 4, castShadow: true, receiveShadow: true }))
    .add(primitives.cylinder({ name: "pillar left", size: [0.6, 3, 0.6], position: [-3, 1.5, -7], material: material.pbr({ color: "#9c9a92", roughness: 0.8, metalness: 0 }) }))
    .add(primitives.cylinder({ name: "pillar right", size: [0.6, 3, 0.6], position: [3.2, 1.5, -13], material: material.pbr({ color: "#9c9a92", roughness: 0.8, metalness: 0 }) }));

  const pickups: [number, number, number][] = [[0.6, 0.6, -4], [-0.8, 0.6, -7], [1.4, 0.6, -10]];
  for (const [index, position] of pickups.entries()) {
    built.add(primitives.sphere({
      name: `pickup ${index}`,
      size: [0.35, 0.35, 0.35],
      position,
      castShadow: false,
      material: material.pbr({ color: "#062a33", roughness: 0.3, metalness: 0, emissive: "#36e0ff", emissiveIntensity: 4 })
    }));
  }

  const qrList = new URLSearchParams(window.location.search).get("a3d-qr");
  const qrFlags = qrList === null ? [] : qrList.split(",").map((token) => token.trim()).filter((token) => token.length > 0);

  const app: AuraApp = createAuraApp(host, {
    scene: built.add(effects.fog({ density: 0.03, color: "#8fa3b8", intensity: 1 }))
      .add(effects.bloom({ intensity: 0.7, radius: 0.4, threshold: 0.85, quality: "cinematic" })),
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

  // Continuous rAF loop: optional simulated game-logic load, then a stepped frame.
  // `window.__PRD11_LOAD_MS__` overrides `?loadMs=` live, so lane specs can
  // start/stop the load mid-session (governor recovery needs this).
  let frames = 0;
  let lastDrawCalls = 0;
  const loop = (): void => {
    const live = (window as unknown as { __PRD11_LOAD_MS__?: number }).__PRD11_LOAD_MS__;
    const burn = live ?? loadMs;
    if (burn > 0) busyLoop(burn);
    app.step(0);
    frames += 1;
    try {
      lastDrawCalls = app.diagnostics().drawCalls;
    } catch {
      // diagnostics may transiently fail during early frames; keep stepping.
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Report ready once the first real draw lands (or after 90s).
  const deadline = performance.now() + 90_000;
  while (performance.now() < deadline) {
    if (lastDrawCalls > 0 || frames > 240) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const diagnostics = app.diagnostics();
  return {
    engine: "aura3d",
    scene: "prd11-tier-ladder",
    engineVersion: typeof __AURA3D_VERSION__ === "string" ? __AURA3D_VERSION__ : "dev",
    capabilityLog: [],
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    extra: {
      auraQuality: auraQuality ?? "auto",
      simulatedLoadMs: loadMs,
      backend: diagnostics.backend,
      frame: (diagnostics as { frame?: unknown }).frame ?? null
    }
  };
}
