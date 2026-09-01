/** Direct isolated pixel probes for the unregistered Pulse high-fidelity V5 GLBs. */
import { camera, createAuraApp, lights, material, model, primitives, scene, type AuraAssetRef } from "@aura3d/engine";

const entries = {
  runner: {
    file: "pulseRunnerCraftV5.candidate.glb",
    hash: "a9ea32566c8c37c74667e7821c7cabb7f0d468e4508b329c375fc7573c80dfc2",
    bounds: [3.202, 1.03, 3.26] as const,
    sizeBytes: 252736,
    camera: [4.5, 2.45, 5.2] as const,
    target: [0, 0.32, -0.1] as const,
    targetMaxDimension: 4.0
  },
  sentry: {
    file: "pulseTerminalSentryV5.candidate.glb",
    hash: "d5eb3cb71ad3c89917eb9c8073516431e444bb6e2a75ca27ddfd5cf2a038e7f5",
    bounds: [4.667, 2.274, 1.855] as const,
    sizeBytes: 544084,
    camera: [4.7, 2.9, 5.7] as const,
    target: [0, 1.15, -0.2] as const,
    targetMaxDimension: 4.9
  },
  world: {
    file: "pulseReactorEncounterWorldV5.candidate.glb",
    hash: "fb08ef0539c60890ca8ace3cd875cd2d4398c8bd21f7c135a981d3f416825681",
    bounds: [9, 4.04, 13.39] as const,
    sizeBytes: 1724556,
    camera: [8.0, 5.2, 10.4] as const,
    target: [0, 1.25, -4.2] as const,
    targetMaxDimension: 13.39
  }
};

const requested = new URLSearchParams(window.location.search).get("asset");
const id = requested === "sentry" || requested === "world" ? requested : "runner";
const entry = entries[id];
const candidate: AuraAssetRef<"model", string> = {
  type: "model",
  format: "glb",
  url: new URL(`./assets/high-fidelity-v5/${entry.file}`, import.meta.url).href,
  hash: `sha256-${entry.hash}`,
  bounds: entry.bounds,
  sizeBytes: entry.sizeBytes,
  metadata: {
    license: "CC0-1.0",
    author: "Aura3D route-local synthesis",
    sourcePath: "apps/showcase-pulse-tunnel/scripts/build-high-fidelity-v5.py",
    role: "unregistered art candidate"
  }
};

const app = createAuraApp("#stage", {
  pixelRatio: 1,
  resize: true,
  renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
  scene: scene()
    .background("#07101a")
    .camera(camera.perspective({ position: entry.camera, target: entry.target, fov: id === "world" ? 46 : 40 }))
    .addMany([
      primitives.cylinder({
        name: "V5 neutral probe plinth",
        material: material.pbr({ name: "V5 probe gunmetal", color: "#152231", metallic: 0.58, roughness: 0.4 })
      }).position(0, id === "world" ? -0.48 : -0.1, id === "world" ? -4.2 : 0)
        .scale(id === "world" ? [6.0, 0.12, 6.0] : [2.5, 0.1, 2.5]),
      model(candidate, { name: `Pulse high-fidelity V5 ${id} direct probe`, targetMaxDimension: entry.targetMaxDimension }),
      lights.ambient({ name: "V5 probe ambient", color: "#51667d", intensity: 0.55 }),
      lights.directional({ name: "V5 probe neutral key", color: "#e1efff", intensity: 2.1 }).position(-4.5, 7.5, 5.5),
      lights.point({ name: "V5 probe cyan rim", color: "#43d4e8", intensity: 1.7 }).position(-3, 2.5, 2),
      lights.point({ name: "V5 probe furnace edge", color: "#f69052", intensity: 1.65 }).position(3, 2.2, -1.5)
    ]),
  diagnostics: false,
  autoStart: true
});

declare global {
  interface Window {
    __PULSE_HIGH_FIDELITY_V5_PROBE__?: { readonly ready: boolean; readonly asset: string; readonly drawCalls: number; readonly errors: readonly string[] };
    __PULSE_HIGH_FIDELITY_V5_PROBE_ERROR__?: string;
  }
}

void (async () => {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 && diagnostics.errors.length === 0) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__PULSE_HIGH_FIDELITY_V5_PROBE__ = { ready: true, asset: id, drawCalls: diagnostics.drawCalls, errors: diagnostics.errors };
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Pulse high-fidelity V5 ${id} probe pixels.`);
})().catch((error: unknown) => {
  window.__PULSE_HIGH_FIDELITY_V5_PROBE_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});
