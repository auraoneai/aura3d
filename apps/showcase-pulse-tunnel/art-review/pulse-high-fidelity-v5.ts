/** Pulse Tunnel high-fidelity V5 — isolated, unregistered candidate encounter. */
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
import { assets } from "../../../src/aura-assets";

declare global {
  interface Window {
    __PULSE_HIGH_FIDELITY_V5__?: {
      readonly ready: boolean;
      readonly backend: string | undefined;
      readonly drawCalls: number;
      readonly renderSize: readonly number[];
      readonly errors: readonly string[];
    };
    __PULSE_HIGH_FIDELITY_V5_ERROR__?: string;
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
  url: new URL(`./assets/high-fidelity-v5/${file}`, import.meta.url).href,
  hash: `sha256-${hash}`,
  bounds,
  sizeBytes,
  metadata: {
    license: "CC0-1.0",
    author: "Aura3D route-local synthesis",
    sourcePath: "apps/showcase-pulse-tunnel/scripts/build-high-fidelity-v5.py",
    role: "unregistered art candidate"
  }
});

const runner = candidate(
  "pulseRunnerCraftV5.candidate.glb",
  "pulseRunnerCraftV5Candidate",
  "a9ea32566c8c37c74667e7821c7cabb7f0d468e4508b329c375fc7573c80dfc2",
  [3.202, 1.03, 3.26],
  252736
);
const sentry = candidate(
  "pulseTerminalSentryV5.candidate.glb",
  "pulseTerminalSentryV5Candidate",
  "d5eb3cb71ad3c89917eb9c8073516431e444bb6e2a75ca27ddfd5cf2a038e7f5",
  [4.667, 2.274, 1.855],
  544084
);
const world = candidate(
  "pulseReactorEncounterWorldV5.candidate.glb",
  "pulseReactorEncounterWorldV5Candidate",
  "fb08ef0539c60890ca8ace3cd875cd2d4398c8bd21f7c135a981d3f416825681",
  [9, 4.04, 13.39],
  1724556
);
const hybridMode = new URLSearchParams(window.location.search).get("hybrid") ?? "1";
const useTypedRunner = hybridMode === "1" || hybridMode === "runner";
const useTypedSentry = hybridMode === "1";
const primaryRunner = useTypedRunner ? assets.gravityPostMailPod : runner;
const primarySentry = useTypedSentry ? assets.showcaseOrangeIndustrialRobot : sentry;

const cyanPulse = material.emissive({
  name: "V5 runner pulse packets",
  color: "#8be7f6",
  emissive: "#0789a3",
  emissiveIntensity: 1.25
});
const amberPulse = material.emissive({
  name: "V5 sentry pulse packets",
  color: "#ffc078",
  emissive: "#c2410c",
  emissiveIntensity: 1.22
});
const impactMaterial = material.emissive({
  name: "V5 shield impact boundary",
  color: "#b9f2fb",
  emissive: "#0891b2",
  emissiveIntensity: 0.96,
  opacity: 0.82
});

const outgoing = Array.from({ length: 12 }, (_, index) => {
  const t = (index + 1) / 13;
  const x = -1.45 + t * 2.86;
  const y = 0.56 + Math.sin(t * Math.PI) * 0.72;
  const z = -0.62 - t * 5.38;
  return primitives.cylinder({ name: `V5 outgoing pulse packet ${index + 1}`, material: cyanPulse })
    .position(x, y, z)
    .rotate(Math.PI / 2, 0, -0.18)
    .scale([0.035, 0.17 + (index % 3) * 0.035, 0.035]);
});
const incoming = Array.from({ length: 9 }, (_, index) => {
  const t = (index + 1) / 10;
  const x = 1.50 - t * 2.62;
  const y = 1.36 - t * 0.58 + Math.sin(t * Math.PI * 2) * 0.09;
  const z = -5.92 + t * 4.94;
  return primitives.cylinder({ name: `V5 incoming pulse packet ${index + 1}`, material: amberPulse })
    .position(x, y, z)
    .rotate(Math.PI / 2, 0, 0.22)
    .scale([0.045, 0.2 + (index % 2) * 0.04, 0.045]);
});

const app = createAuraApp("#stage", {
  pixelRatio: 1,
  resize: true,
  renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
  scene: scene()
    .background("#08121c")
    .camera(camera.perspective({
      position: [0.2, 2.34, 8.2],
      target: [0.04, 0.94, -3.7],
      fov: 45
    }))
    .addMany([
      primitives.plane({
        name: "V5 dark terminal cyclorama",
        material: material.pbr({ name: "V5 terminal shadow", color: "#050a0f", roughness: 0.78, metallic: 0.2 })
      }).position(0, 2.1, -10.72).rotate(0, Math.PI, 0).scale([42, 26, 1]),
      model(world, {
        name: "V5 original continuous arched reactor bay",
        role: "primaryWorld",
        targetMaxDimension: 13.39
      }),
      model(primaryRunner, {
        name: useTypedRunner ? "V5 release-probed textured runner audition" : "V5 original continuous runner craft",
        targetMaxDimension: useTypedRunner ? 4.1 : 3.243
      }).position(-1.48, useTypedRunner ? 0.36 : 0.18, useTypedRunner ? 0.4 : 0.78)
        .rotate(0, useTypedRunner ? Math.PI - 0.08 : -0.055, -0.022)
        .scale(useTypedRunner ? 1.15 : 1.22),
      model(primarySentry, {
        name: useTypedSentry ? "V5 release-probed textured terminal robot audition" : "V5 original orbital terminal sentry",
        targetMaxDimension: useTypedSentry ? 3.6 : 4.667
      }).position(1.6, useTypedSentry ? 0.16 : 0.34, useTypedSentry ? -5.78 : -5.94)
        .rotate(0, Math.PI + 0.035, 0)
        .scale(useTypedSentry ? 1.7 : 1.34),
      primitives.torus({ name: "V5 runner shield impact", material: impactMaterial })
        .position(-1.12, 0.74, -0.72)
        .rotate(0, -0.14, 0.05)
        .scale([0.45, 0.45, 0.042]),
      primitives.torus({ name: "V5 terminal cadence lock", material: amberPulse })
        .position(1.54, 1.28, -6.06)
        .scale([0.58, 0.58, 0.035]),
      ...outgoing,
      ...incoming,
      effects.neonBloom({ intensity: 0.22, threshold: 0.82, maxIntensity: 0.68, antiBlowout: true }),
      effects.fog({ name: "V5 reactor distance haze", density: 0.005, color: "#08121c" }),
      lights.ambient({ name: "V5 steel ambient", color: "#53677d", intensity: 0.42 }),
      lights.directional({ name: "V5 neutral silhouette key", color: "#deefff", intensity: 2.15 }).position(-5.5, 8.5, 6.4),
      lights.directional({ name: "V5 warm terminal edge", color: "#ffad72", intensity: 0.88 }).position(5.8, 6.4, -4.5),
      lights.point({ name: "V5 runner cool contact", color: "#48d9ee", intensity: 1.65 }).position(-2.35, 1.4, 1.7),
      lights.point({ name: "V5 sentry furnace key", color: "#ff8c52", intensity: 2.65 }).position(2.9, 2.35, -5.4),
      lights.point({ name: "V5 sentry cyan separation", color: "#42d3e5", intensity: 1.05 }).position(-1.1, 2.2, -6.7),
      lights.point({ name: "V5 runway depth bounce", color: "#42cadd", intensity: 0.76 }).position(0, 0.38, -2.8)
    ]),
  diagnostics: false,
  autoStart: true
});

void publishReady().catch((error: unknown) => {
  window.__PULSE_HIGH_FIDELITY_V5_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function publishReady(): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0 && diagnostics.errors.length === 0) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const settled = app.diagnostics();
      window.__PULSE_HIGH_FIDELITY_V5__ = {
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
  throw new Error("Timed out waiting for Pulse Tunnel high-fidelity V5 pixels.");
}
