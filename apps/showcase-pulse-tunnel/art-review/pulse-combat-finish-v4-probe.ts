/** Direct isolated pixel probes for the unregistered Pulse combat-finish V4 GLBs. */
import { camera, createAuraApp, lights, material, model, primitives, scene, type AuraAssetRef } from "@aura3d/engine";

const entries = {
  runner: {
    file: "pulseRunnerCraftV4.candidate.glb",
    hash: "8e3d9e1895e19a42d16da62759adb92a108a0c03de58c5d695cfb475041bb069",
    bounds: [2.89, 0.91, 3.005] as const,
    sizeBytes: 176308,
    camera: [4.4, 2.55, 5.4] as const,
    target: [0, 0.38, -0.1] as const,
    targetMaxDimension: 4.1
  },
  sentry: {
    file: "pulseTerminalSentryV4.candidate.glb",
    hash: "b2b8810ff07418d3cf5780305341b0aabb04d070d77260f4a4ad5c0687cc92ee",
    bounds: [4.018, 1.874, 1.77] as const,
    sizeBytes: 227104,
    camera: [4.6, 2.8, 5.6] as const,
    target: [0, 1.0, 0] as const,
    targetMaxDimension: 4.8
  },
  world: {
    file: "pulseReactorEncounterWorldV4.candidate.glb",
    hash: "68e0e2c4ea21d105ca5697aae203d3c2e11e4c597bffd419b84b76417d49ef93",
    bounds: [8.8, 3.715, 8.547] as const,
    sizeBytes: 304408,
    camera: [8.3, 6.1, 10.2] as const,
    target: [0, 1.35, -2.7] as const,
    targetMaxDimension: 10.6
  }
};

const requested = new URLSearchParams(window.location.search).get("asset");
const id = requested === "sentry" || requested === "world" ? requested : "runner";
const entry = entries[id];
const candidate: AuraAssetRef<"model", string> = {
  type: "model",
  format: "glb",
  url: new URL(`./assets/combat-finish-v4/${entry.file}`, import.meta.url).href,
  hash: `sha256-${entry.hash}`,
  bounds: entry.bounds,
  sizeBytes: entry.sizeBytes,
  metadata: { license: "CC0-1.0", author: "Aura3D route-local synthesis", role: "unregistered art candidate" }
};

const app = createAuraApp("#stage", {
  pixelRatio: 1,
  resize: true,
  renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
  scene: scene()
    .background("#07101c")
    .camera(camera.perspective({ position: entry.camera, target: entry.target, fov: id === "world" ? 48 : 42 }))
    .addMany([
      primitives.cylinder({
        name: "neutral candidate probe plinth",
        material: material.pbr({ name: "probe graphite plinth", color: "#172235", metallic: 0.52, roughness: 0.45 })
      }).position(0, id === "world" ? -0.42 : -0.12, id === "world" ? -2.7 : 0).scale(id === "world" ? [5.2, 0.12, 5.2] : [2.25, 0.1, 2.25]),
      model(candidate, { name: `Pulse combat-finish V4 ${id} direct probe`, targetMaxDimension: entry.targetMaxDimension }),
      lights.ambient({ name: "probe ambient", color: "#536984", intensity: 0.72 }),
      lights.directional({ name: "probe neutral key", color: "#dcefff", intensity: 2.0 }).position(-4, 7, 5),
      lights.point({ name: "probe cyan rim", color: "#45d5ed", intensity: 1.65 }).position(-3, 2.5, 2),
      lights.point({ name: "probe amber edge", color: "#f7a45e", intensity: 1.55 }).position(3, 2.2, -1.5)
    ]),
  diagnostics: false,
  autoStart: true
});

declare global { interface Window { __PULSE_COMBAT_FINISH_V4_PROBE__?: { ready: boolean; asset: string; drawCalls: number; errors: readonly string[] }; } }
void (async () => {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 && diagnostics.errors.length === 0) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__PULSE_COMBAT_FINISH_V4_PROBE__ = { ready: true, asset: id, drawCalls: diagnostics.drawCalls, errors: diagnostics.errors };
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for V4 ${id} probe pixels.`);
})();
