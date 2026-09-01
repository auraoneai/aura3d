/**
 * Pulse Tunnel combat-finish V4 — isolated candidate composition.
 *
 * The three page-local refs point only at reproducible CC0 candidates produced
 * by scripts/build-combat-finish-v4.py. They are intentionally not manifest
 * assets and cannot be used as release evidence until root registration.
 */
import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraAssetRef
} from "@aura3d/engine";

declare global {
  interface Window {
    __PULSE_COMBAT_FINISH_V4__?: {
      readonly ready: boolean;
      readonly backend: string | undefined;
      readonly drawCalls: number;
      readonly renderSize: readonly number[];
      readonly errors: readonly string[];
    };
    __PULSE_COMBAT_FINISH_V4_ERROR__?: string;
  }
}

const candidate = <TName extends string>(
  file: string,
  name: TName,
  hash: string,
  bounds: readonly [number, number, number],
  sizeBytes: number
): AuraAssetRef<"model", TName> => ({
  type: "model",
  format: "glb",
  url: new URL(`./assets/combat-finish-v4/${file}`, import.meta.url).href,
  hash: `sha256-${hash}`,
  bounds,
  sizeBytes,
  metadata: {
    license: "CC0-1.0",
    author: "Aura3D route-local synthesis",
    sourcePath: "apps/showcase-pulse-tunnel/scripts/build-combat-finish-v4.py",
    role: "unregistered art candidate"
  }
});

const runner = candidate(
  "pulseRunnerCraftV4.candidate.glb",
  "pulseRunnerCraftV4Candidate",
  "8e3d9e1895e19a42d16da62759adb92a108a0c03de58c5d695cfb475041bb069",
  [2.89, 0.91, 3.005],
  176308
);
const sentry = candidate(
  "pulseTerminalSentryV4.candidate.glb",
  "pulseTerminalSentryV4Candidate",
  "b2b8810ff07418d3cf5780305341b0aabb04d070d77260f4a4ad5c0687cc92ee",
  [4.018, 1.874, 1.77],
  227104
);
const world = candidate(
  "pulseReactorEncounterWorldV4.candidate.glb",
  "pulseReactorEncounterWorldV4Candidate",
  "68e0e2c4ea21d105ca5697aae203d3c2e11e4c597bffd419b84b76417d49ef93",
  [8.8, 3.715, 8.547],
  304408
);

const cyan = material.emissive({
  name: "V4 outgoing cadence",
  color: "#7dddf0",
  emissive: "#0e7490",
  emissiveIntensity: 0.72
});
const amber = material.emissive({
  name: "V4 returning cadence",
  color: "#ffc36b",
  emissive: "#b45309",
  emissiveIntensity: 0.68
});
const shield = material.emissive({
  name: "V4 runner shield contact",
  color: "#8be7f6",
  emissive: "#0e7490",
  emissiveIntensity: 0.58,
  opacity: 0.8
});

const outgoing = Array.from({ length: 7 }, (_, index) => {
  const t = (index + 1) / 8;
  return primitives.sphere({ name: `V4 outgoing pulse ${index + 1}`, material: cyan })
    .position(-1.55 + t * 3.15, 0.64 + Math.sin(t * Math.PI) * 0.5, 0.05 - t * 4.65)
    .scale([0.055, 0.055, 0.14]);
});
const returning = Array.from({ length: 5 }, (_, index) => {
  const t = (index + 1) / 6;
  return primitives.sphere({ name: `V4 returning pulse ${index + 1}`, material: amber })
    .position(1.88 - t * 2.7, 1.45 - t * 0.6, -4.38 + t * 3.85)
    .scale([0.065, 0.065, 0.16]);
});

const app = createAuraApp("#stage", {
  pixelRatio: 1,
  resize: true,
  renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
  scene: scene()
    .background("#091321")
    .camera(camera.perspective({
      position: [0.25, 2.4, 9.15],
      target: [0.05, 0.82, -2.72],
      fov: 44
    }))
    .addMany([
      model(world, {
        name: "V4 original continuous reactor world candidate",
        role: "primaryWorld",
        targetMaxDimension: 10.8
      }).position(0, 0, -0.25),
      model(runner, {
        name: "V4 original typed-key replacement runner candidate",
        targetMaxDimension: 3.35
      }).position(-1.55, 0.26, 0.3).rotate(0, -0.08, -0.025).scale(1.02),
      primitives.torus({ name: "V4 runner shield catch", material: shield })
        .position(-1.05, 0.72, -0.5).rotate(0, -0.14, 0.05).scale([0.48, 0.48, 0.045]),
      model(sentry, {
        name: "V4 original typed-key replacement sentry candidate",
        targetMaxDimension: 4.7
      }).position(1.85, 0.28, -4.7).rotate(0, Math.PI + 0.04, 0).scale(1.15),
      ...outgoing,
      ...returning,
      effects.neonBloom({ intensity: 0.18, threshold: 0.82, maxIntensity: 0.62, antiBlowout: true }),
      effects.fog({ name: "V4 controlled corridor depth", density: 0.002, color: "#091321" }),
      lights.ambient({ name: "V4 neutral blue ambient", color: "#50637c", intensity: 0.66 }),
      lights.directional({ name: "V4 silhouette key", color: "#d9edff", intensity: 1.9 }).position(-5, 8, 6),
      lights.point({ name: "V4 runner cyan rim", color: "#4dd8ef", intensity: 1.9 }).position(-2.4, 1.5, 2.2),
      lights.point({ name: "V4 sentry amber key", color: "#ffad66", intensity: 2.35 }).position(3.2, 2.8, -3.5),
      lights.point({ name: "V4 sentry rose edge", color: "#ef6b91", intensity: 1.25 }).position(-0.4, 2.0, -5.0),
      lights.point({ name: "V4 deck depth practical", color: "#3bd6ea", intensity: 0.8 }).position(0, 0.35, -2.0)
    ]),
  diagnostics: false,
  autoStart: true
});

void ready().catch((error: unknown) => {
  window.__PULSE_COMBAT_FINISH_V4_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function ready(): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0 && diagnostics.errors.length === 0) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const settled = app.diagnostics();
      window.__PULSE_COMBAT_FINISH_V4__ = {
        ready: true,
        backend: settled.renderer?.runtime.backend,
        drawCalls: settled.drawCalls,
        renderSize: settled.renderSize,
        errors: settled.errors
      };
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Pulse Tunnel combat-finish V4 pixels.");
}
