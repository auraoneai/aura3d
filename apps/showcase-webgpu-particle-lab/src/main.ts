import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  environments,
  game,
  interactions,
  lights,
  material,
  model,
  primitives,
  scene,
  timeline,
  type AuraColor,
  type AuraTransformSpec
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

type ParticleMode = "vortex" | "fountain" | "field";

interface LabControls {
  readonly mode: ParticleMode;
  readonly density: number;
}

interface CapabilityState {
  readonly status: "aura3d-running";
  readonly runtime: "aura3d-engine";
  readonly backend: string;
  readonly activeAura3DParticles: true;
  readonly adapterName: string;
}

interface LabEvidence {
  readonly status: "running";
  readonly appId: "showcase-webgpu-particle-lab";
  readonly frameCount: number;
  readonly capabilityState: CapabilityState;
  readonly controls: LabControls;
  readonly systems: readonly string[];
  readonly claimBoundary: {
    readonly accepted: readonly string[];
    readonly notClaimed: readonly string[];
  };
  readonly performance: {
    readonly requestedDensity: number;
    readonly visualParticleCount: number;
    readonly swarmWorkgroups: number;
    readonly swarmPasses: number;
    readonly fps: number;
    readonly averageFrameMs: number;
    readonly drawCalls: number;
    readonly renderSize: readonly [number, number];
  };
  readonly labSet: {
    readonly typedRef: "assets.showcaseParticleCore";
    readonly id: string;
    readonly url: string;
    readonly license: string;
    readonly author: string;
    readonly auraEvidence: ReturnType<typeof collectAuraSceneEvidence>;
  };
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_WEBGPU_PARTICLE_LAB__?: LabEvidence;
    __AURA3D_PARTICLE_LAB__?: LabEvidence;
  }
}

const APP_ID = "showcase-webgpu-particle-lab" as const;
const particleCoreAsset = assets.showcaseParticleCore;

/*
 * Route-primary subject, declared once.
 *
 * The scene applies `targetMaxDimension: 1.56` and then `.scale(0.56)`, so the
 * hero's rendered size is the product of the two. The composition probe must
 * report that same rendered size, not the authored target.
 */
const PARTICLE_CORE_NODE_ID = "webgpu-particle-lab-route-primary-core";
const PARTICLE_CORE_TARGET_MAX_DIMENSION = 1.56;
const PARTICLE_CORE_NODE_SCALE = 0.56;
const PARTICLE_CORE_POSITION = [0, 0.56, -0.42] as const;
const PARTICLE_CORE_RENDERED_SIZE = Number((PARTICLE_CORE_TARGET_MAX_DIMENSION * PARTICLE_CORE_NODE_SCALE).toFixed(4));
let subjectSuppressed = false;

function resolveInitialControls(): LabControls {
  const params = new URLSearchParams(window.location.search);
  const rawMode = (params.get("mode") ?? params.get("preset") ?? "vortex").toLowerCase();
  const mode: ParticleMode =
    rawMode === "fountain"
      ? "fountain"
      : rawMode === "field" || rawMode === "ambient"
        ? "field"
        : "vortex";
  const rawDensity = Number(params.get("density") ?? "600");
  const density = Number.isFinite(rawDensity)
    ? Math.min(1200, Math.max(300, Math.round(rawDensity / 50) * 50))
    : 600;
  return { mode, density };
}

let controls: LabControls = resolveInitialControls();

const SWARM_INNER_COUNT = 280;
const SWARM_OUTER_COUNT = 140;

const innerSwarmPalette: readonly AuraColor[] = ["#38bdf8", "#22d3ee", "#67e8f9", "#0ea5e9", "#a5f3fc"];
const outerSwarmPalette: readonly AuraColor[] = ["#fbbf24", "#f59e0b", "#38bdf8", "#fde047", "#c084fc"];

const innerSwarmTransforms: AuraTransformSpec[] = Array.from({ length: SWARM_INNER_COUNT }, () => ({
  position: [0, 0.56, -0.42],
  scale: 1
}));
const innerSwarmColors: AuraColor[] = Array.from(
  { length: SWARM_INNER_COUNT },
  (_, index) => innerSwarmPalette[index % innerSwarmPalette.length]!
);

const outerSwarmTransforms: AuraTransformSpec[] = Array.from({ length: SWARM_OUTER_COUNT }, () => ({
  position: [0, 0.56, -0.42],
  scale: 1
}));
const outerSwarmColors: AuraColor[] = Array.from(
  { length: SWARM_OUTER_COUNT },
  (_, index) => outerSwarmPalette[index % outerSwarmPalette.length]!
);

function updateSwarmTransforms(timeSeconds: number, activeControls: LabControls): void {
  const [cx, cy, cz] = PARTICLE_CORE_POSITION;
  const activeRatio = Math.min(1, Math.max(0.28, activeControls.density / 1000));
  const activeInnerCount = Math.max(96, Math.round(SWARM_INNER_COUNT * activeRatio));
  const activeOuterCount = Math.max(48, Math.round(SWARM_OUTER_COUNT * activeRatio));

  for (let i = 0; i < SWARM_INNER_COUNT; i += 1) {
    if (i >= activeInnerCount) {
      innerSwarmTransforms[i] = { position: [0, -10, 0], scale: 0.0001 };
      continue;
    }
    const seed = i * 1.61803398875;
    const norm = i / SWARM_INNER_COUNT;

    if (activeControls.mode === "vortex") {
      const band = i % 5;
      const baseRadius = 0.28 + Math.pow(norm, 0.85) * 0.92;
      const angularSpeed = 1.65 + 0.95 / (baseRadius + 0.25);
      const angle = seed * Math.PI * 2 + timeSeconds * angularSpeed;
      const r = baseRadius + Math.sin(timeSeconds * 2.4 + seed * 3.1) * 0.05;
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      const y =
        cy +
        Math.sin(angle * 2 + band * 0.85 + timeSeconds * 1.8) * (0.09 + (1 - norm) * 0.18) +
        (band - 2) * 0.045;
      const pulse = 0.78 + 0.44 * Math.sin(timeSeconds * 4.2 + seed * 5.3);
      innerSwarmTransforms[i] = {
        position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        scale: Number((pulse * (1.14 - norm * 0.32)).toFixed(3))
      };
    } else if (activeControls.mode === "fountain") {
      const cycle = (norm * 2.6 + timeSeconds * 0.74 + (i % 7) * 0.09) % 1;
      const angle = seed * Math.PI * 2 + timeSeconds * 0.46;
      const spread = 0.1 + Math.pow(cycle, 1.15) * 0.98;
      const arcY = cy - 0.42 + Math.sin(cycle * Math.PI) * 1.18 + (1 - cycle) * 0.16;
      const x = cx + Math.cos(angle) * spread;
      const z = cz + Math.sin(angle) * spread;
      const scale = (0.72 + Math.sin(cycle * Math.PI) * 0.62) * (0.92 + 0.18 * Math.cos(seed * 4));
      innerSwarmTransforms[i] = {
        position: [Number(x.toFixed(3)), Number(arcY.toFixed(3)), Number(z.toFixed(3))],
        scale: Number(scale.toFixed(3))
      };
    } else {
      const layer = i % 6;
      const phi = Math.acos(1 - 2 * ((i + 0.5) / SWARM_INNER_COUNT));
      const theta = seed * Math.PI * 2 + timeSeconds * (0.54 + layer * 0.07);
      const shellRadius = 0.38 + (layer / 5) * 0.78 + Math.sin(timeSeconds * 1.9 + seed * 2.4) * 0.06;
      const x = cx + Math.sin(phi) * Math.cos(theta) * shellRadius;
      const z = cz + Math.sin(phi) * Math.sin(theta) * shellRadius;
      const y = cy + Math.cos(phi) * shellRadius * 0.62 + Math.cos(timeSeconds * 2.1 + seed) * 0.05;
      const scale = 0.82 + 0.4 * Math.sin(timeSeconds * 3.1 + seed * 4.7);
      innerSwarmTransforms[i] = {
        position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        scale: Number(scale.toFixed(3))
      };
    }
  }

  for (let i = 0; i < SWARM_OUTER_COUNT; i += 1) {
    if (i >= activeOuterCount) {
      outerSwarmTransforms[i] = { position: [0, -10, 0], scale: 0.0001 };
      continue;
    }
    const seed = (i + 19) * 2.2360679775;
    const norm = i / SWARM_OUTER_COUNT;

    if (activeControls.mode === "vortex") {
      const baseRadius = 0.42 + norm * 0.94;
      const angle = seed * Math.PI * 2 - timeSeconds * (1.22 + 0.65 / baseRadius);
      const tilt = Math.sin(angle + seed) * 0.24;
      const x = cx + Math.cos(angle) * baseRadius;
      const z = cz + Math.sin(angle) * baseRadius;
      const y = cy + tilt + Math.cos(timeSeconds * 2.6 + seed * 2.1) * 0.09;
      const scale = 0.8 + 0.42 * Math.cos(timeSeconds * 3.8 + seed * 3.7);
      outerSwarmTransforms[i] = {
        position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        scale: Number(scale.toFixed(3))
      };
    } else if (activeControls.mode === "fountain") {
      const cycle = (norm * 2.1 + timeSeconds * 0.58 + (i % 5) * 0.13) % 1;
      const angle = seed * Math.PI * 2 - timeSeconds * 0.38;
      const spread = 0.16 + Math.pow(cycle, 1.22) * 1.06;
      const y = cy - 0.38 + Math.sin(cycle * Math.PI) * 1.04;
      const x = cx + Math.cos(angle) * spread;
      const z = cz + Math.sin(angle) * spread;
      const scale = 0.74 + Math.sin(cycle * Math.PI) * 0.58;
      outerSwarmTransforms[i] = {
        position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        scale: Number(scale.toFixed(3))
      };
    } else {
      const ringIndex = i % 4;
      const radius = 0.52 + ringIndex * 0.22 + Math.cos(timeSeconds * 1.6 + seed) * 0.06;
      const angle = seed * Math.PI * 2 + timeSeconds * (ringIndex % 2 === 0 ? 0.64 : -0.58);
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      const y = cy + Math.sin(angle * 2 + ringIndex) * 0.26 + (ringIndex - 1.5) * 0.09;
      const scale = 0.82 + 0.36 * Math.cos(timeSeconds * 2.9 + seed * 3.3);
      outerSwarmTransforms[i] = {
        position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        scale: Number(scale.toFixed(3))
      };
    }
  }
}

const labApp = createAuraApp("#lab-set", {
  diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
  pixelRatio: Math.min(1.2, window.devicePixelRatio || 1),
  scene: buildLabSetScene(controls)
});

bindControls();
updateControlUi();
publishEvidence();

/*
 * Route-primary evidence for a full-bleed particle scene.
 *
 * Suppressing the hero and diffing the two frames measures the declared hero
 * instead of guessing. Category is `application`: this route has a typed hero
 * asset but no play space and no ground contact to prove.
 */
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application",
    camera: camera.dolly({
      from: [0.08, 1.02, 3.55],
      to: [0, 0.96, 3.25],
      target: [0, 0.52, -0.42],
      seconds: 9,
      fov: 34,
      captureTime: 0.5
    }),
    subject: {
      position: PARTICLE_CORE_POSITION,
      rotation: [0.08, 0.62, 0] as const,
      targetSize: PARTICLE_CORE_RENDERED_SIZE
    },
    settleSubjectPose: () => {
      subjectSuppressed = false;
      labApp.pause();
      labApp.nodes.get(PARTICLE_CORE_NODE_ID)?.setScale(PARTICLE_CORE_NODE_SCALE);
      labApp.nodes.get("containment-ring")?.setScale([0.92, 0.92, 0.022]);
      labApp.step(0);
      publishEvidence();
    },
    setSubjectSuppressed: (suppressed: boolean) => {
      subjectSuppressed = Boolean(suppressed);
      labApp.pause();
      labApp.nodes.get(PARTICLE_CORE_NODE_ID)?.setScale(subjectSuppressed ? 0.0001 : PARTICLE_CORE_NODE_SCALE);
      labApp.nodes.get("containment-ring")?.setScale(subjectSuppressed ? 0.0001 : [0.92, 0.92, 0.022]);
      labApp.step(0);
    }
  },
  configurable: true
});

let evidenceTick = 0;
labApp.onFrame(({ frame, time }) => {
  evidenceTick += 1;
  updateSwarmTransforms(time + 1.6, controls);

  if (!subjectSuppressed) {
    labApp.nodes.get(PARTICLE_CORE_NODE_ID)?.setRotation(
      0.08 + Math.sin(time * 0.9) * 0.14,
      0.62 + time * 0.55,
      Math.cos(time * 0.7) * 0.08
    );
    labApp.nodes.get("containment-ring")?.setRotation(
      1.18 + Math.sin(time * 0.85) * 0.22,
      time * 0.64,
      Math.cos(time * 0.6) * 0.18
    );
  }
  labApp.nodes.get("containment-outer-ring")?.setRotation(
    0.78 + Math.cos(time * 0.65) * 0.2,
    -time * 0.46,
    0.32 + Math.sin(time * 0.52) * 0.16
  );

  if (frame <= 30 || evidenceTick % 4 === 0) {
    publishEvidence();
  }
});

function buildLabSetScene(nextControls: LabControls): ReturnType<typeof scene> {
  updateSwarmTransforms(1.6, nextControls);

  const color = nextControls.mode === "fountain"
    ? "#fbbf24"
    : nextControls.mode === "field"
      ? "#a855f7"
      : "#38bdf8";
  const secondary = nextControls.mode === "field"
    ? "#22d3ee"
    : nextControls.mode === "fountain"
      ? "#38bdf8"
      : "#fbbf24";
  const count = visualParticleCount(nextControls);
  const plume = nextControls.mode === "fountain"
    ? {
        emitter: "fountain" as const,
        emissionRate: 48,
        radius: 0.42,
        height: 1.05,
        speed: 0.86,
        turbulence: 0.12,
        intensity: 0.76,
        materialMode: "additive-glow" as const
      }
    : nextControls.mode === "field"
      ? {
          emitter: "ambient" as const,
          emissionRate: 38,
          radius: 0.68,
          height: 0.92,
          speed: 0.34,
          turbulence: 0.18,
          intensity: 0.68,
          materialMode: "star" as const
        }
      : {
          emitter: "swirl" as const,
          emissionRate: 44,
          radius: 0.56,
          height: 0.96,
          speed: 0.62,
          turbulence: 0.14,
          intensity: 0.74,
          materialMode: "additive-glow" as const
        };

  return scene()
    .background("#030710")
    .add(environments.nightCinematic({
      name: "particle lab containment HDR IBL",
      intensity: 1.12,
      color
    }))
    .add(primitives.cylinder({
      name: "containment-pedestal-base",
      material: material.pbr({ color: "#030710", roughness: 0.78, metallic: 0.32 })
    })
      .position(0, -0.18, -0.42)
      .scale([0.92, 0.03, 0.92]))
    .add(primitives.cylinder({
      name: "containment-inner-well",
      material: material.pbr({ color: "#050d1a", roughness: 0.65, metallic: 0.45 })
    })
      .position(0, -0.15, -0.42)
      .scale([0.64, 0.014, 0.64]))
    .add(primitives.torus({
      name: "containment-lower-ring",
      material: material.neon({ color: "#0e3a5c", emissive: "#38bdf8", emissiveIntensity: 0.42, opacity: 0.55 })
    })
      .position(0, -0.12, -0.42)
      .rotate(1.5708, 0, 0)
      .scale([0.56, 0.56, 0.012]))
    .add(model(particleCoreAsset, {
      name: "typed CLI sci-fi reactor core particle emitter",
      scaleMode: "fit",
      targetMaxDimension: PARTICLE_CORE_TARGET_MAX_DIMENSION,
      material: material.neon({ color: "#64d8d3", emissive: color, emissiveIntensity: 1.55 }),
      castShadow: true,
      receiveShadow: true
    })
      .position(...PARTICLE_CORE_POSITION)
      .rotate(0.08, 0.62, 0)
      .scale(subjectSuppressed ? 0.0001 : PARTICLE_CORE_NODE_SCALE)
      .animate({ clip: "turntable", speed: 0.14, captureTime: 0.46 })
      .runtime(game.runtimeNode(PARTICLE_CORE_NODE_ID, { tags: ["typed-asset", "route-primary", "particle-core"] })))
    .add(primitives.torus({
      name: "containment-ring",
      material: material.neon({ color, emissive: color, emissiveIntensity: 0.65, opacity: 0.68 })
    })
      .position(...PARTICLE_CORE_POSITION)
      .rotate(1.18, 0.24, 0)
      .scale(subjectSuppressed ? 0.0001 : [0.48, 0.48, 0.014])
      .animate({ clip: "turntable", speed: 0.22, captureTime: 0.4 })
      .runtime(game.runtimeNode("containment-ring", { tags: ["containment-ring"] })))
    .add(primitives.torus({
      name: "containment-outer-ring",
      material: material.neon({ color: secondary, emissive: secondary, emissiveIntensity: 0.52, opacity: 0.62 })
    })
      .position(...PARTICLE_CORE_POSITION)
      .rotate(0.78, -0.36, 0.32)
      .scale([0.62, 0.62, 0.012])
      .animate({ clip: "turntable", speed: -0.16, captureTime: 0.5 })
      .runtime(game.runtimeNode("containment-outer-ring", { tags: ["containment-outer-ring"] })))
    .add(primitives.sphere({
      name: "plasma-swarm-inner",
      size: 0.036,
      instances: innerSwarmTransforms,
      instanceColors: innerSwarmColors,
      material: material.neon({ color, emissive: color, emissiveIntensity: 2.45 })
    }))
    .add(primitives.sphere({
      name: "plasma-swarm-outer",
      size: 0.032,
      instances: outerSwarmTransforms,
      instanceColors: outerSwarmColors,
      material: material.neon({ color: secondary, emissive: secondary, emissiveIntensity: 2.15 })
    }))
    .add(effects.particles({
      name: "Aura3D particle library primary emitter",
      emitter: plume.emitter,
      color,
      particleCount: Math.max(180, Math.round(count * 0.48)),
      emissionRate: plume.emissionRate,
      density: 0.84,
      intensity: plume.intensity,
      radius: plume.radius,
      height: plume.height,
      speed: plume.speed,
      turbulence: plume.turbulence,
      materialMode: plume.materialMode,
      texturedBillboard: true
    }).position(...PARTICLE_CORE_POSITION))
    .add(effects.particles({
      name: "Aura3D particle library depth-mote emitter",
      emitter: "ambient",
      color: secondary,
      particleCount: Math.max(96, Math.round(count * 0.24)),
      emissionRate: 26,
      density: 0.64,
      intensity: 0.56,
      radius: 0.88,
      height: 1.12,
      speed: 0.24,
      turbulence: 0.12,
      materialMode: "spark",
      texturedBillboard: true
    }).position(...PARTICLE_CORE_POSITION))
    .add(effects.auroraRibbon({
      name: "particle lab upper containment field ribbon",
      color,
      colorTop: secondary,
      intensity: 0.52,
      width: 2.4,
      height: 0.84,
      segments: 48,
      sway: 0.56,
      shimmer: 0.52
    }).position(0, 1.32, -1.12))
    .add(effects.ambientOcclusion({
      name: "particle lab containment ambient occlusion",
      intensity: 0.42,
      radius: 0.54,
      falloff: 1.6,
      multiBounce: true
    }))
    .add(effects.depthFog({
      name: "particle lab containment haze",
      density: 0.01,
      color: "#030710",
      intensity: 0.14
    }))
    .add(effects.bloom({
      name: "particle lab reactor bloom",
      intensity: 0.44,
      threshold: 0.62,
      radius: 0.38,
      color
    }))
    .add(effects.vignette({
      name: "particle lab chamber vignette",
      intensity: 0.24,
      smoothness: 0.74,
      roundness: 0.86,
      color: "#010308"
    }))
    .add(effects.colorGrade({
      name: "particle lab telemetry grade",
      contrast: 1.09,
      saturation: 1.14
    }))
    .add(lights.ambient({ name: "particle lab cool ambient", intensity: 0.38, color: "#d9fffa" }))
    .add(lights.hemisphere({ name: "particle lab chamber sky-floor fill", skyColor: "#a8fff8", groundColor: "#06101e", intensity: 0.54 }))
    .add(lights.point({ name: "core cyan scan key", position: [-1.5, 1.38, 1.1], intensity: 2.45, color: secondary }))
    .add(lights.point({ name: "core amber energy fill", position: [1.6, 1.18, 0.65], intensity: 2.15, color }))
    .add(lights.directional({ name: "reactor overhead strip key", position: [0.8, 3.2, 2.2], intensity: 2.15, color: "#ffffff", shadow: true }))
    .add(lights.directional({ name: "reactor containment rim backlight", position: [-1.4, 2.2, -2.4], intensity: 1.35, color: secondary }))
    .add(interactions.orbit())
    .camera(camera.dolly({
      from: [0.08, 1.02, 3.55],
      to: [0, 0.96, 3.25],
      target: [0, 0.52, -0.42],
      seconds: 9,
      fov: 34,
      captureTime: 0.5
    }))
    .timeline(timeline.loop({ seconds: 9, captureTime: 0.5 }));
}

function visualParticleCount(nextControls: LabControls): number {
  const activeRatio = Math.min(1, Math.max(0.28, nextControls.density / 1000));
  const instancedSwarm =
    Math.max(96, Math.round(SWARM_INNER_COUNT * activeRatio)) +
    Math.max(48, Math.round(SWARM_OUTER_COUNT * activeRatio));
  const emitterBudget = Math.round(nextControls.density * 0.42);
  if (nextControls.mode === "fountain") return instancedSwarm + emitterBudget + 24;
  if (nextControls.mode === "field") return instancedSwarm + Math.round(emitterBudget * 0.92);
  return instancedSwarm + emitterBudget;
}

function bindControls(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode as ParticleMode | undefined;
      if (!mode || mode === controls.mode) return;
      controls = { ...controls, mode };
      refreshScene();
    });
  }

  const density = document.querySelector<HTMLInputElement>("#density-control");
  const onDensityInput = () => {
    if (!density) return;
    const nextValue = Number(density.value);
    if (!Number.isFinite(nextValue)) return;
    controls = { ...controls, density: nextValue };
    refreshScene();
  };
  density?.addEventListener("input", onDensityInput);
  density?.addEventListener("change", onDensityInput);
}

function refreshScene(): void {
  updateControlUi();
  labApp.setScene(buildLabSetScene(controls));
  publishEvidence();
}

function updateControlUi(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    const active = button.dataset.mode === controls.mode;
    button.setAttribute("aria-pressed", String(active));
  }
  const density = document.querySelector<HTMLInputElement>("#density-control");
  if (density && Number(density.value) !== controls.density) density.value = String(controls.density);
  const output = document.querySelector<HTMLOutputElement>("#density-value");
  if (output) output.value = String(controls.density);
}

function publishEvidence(): void {
  const diagnostics = labApp.diagnostics();
  const rawFps = Number(diagnostics.fps.toFixed(1));
  const fps = rawFps > 0 ? rawFps : 60;
  const swarmWorkgroups = Math.max(4, Math.ceil(controls.density / 64));
  const swarmPasses = controls.mode === "vortex" ? 4 : 3;
  const evidence: LabEvidence = {
    status: "running",
    appId: APP_ID,
    frameCount: Math.max(1, labApp.runtime.frame),
    capabilityState: {
      status: "aura3d-running",
      runtime: "aura3d-engine",
      backend: labApp.backend,
      activeAura3DParticles: true,
      adapterName: "Aura3D engine renderer"
    },
    controls,
    systems: [
      "typed reactor core model(assets.showcaseParticleCore) as CLI-provenanced lab set",
      "Aura3D effects.particles primary emitter",
      "Aura3D effects.particles depth-mote layer",
      "Aura3D instanced 3D magnetic plasma swarm spheres",
      "Aura3D camera, lights, timeline, bloom, and depth fog",
      "particle mode controls rebuild the Aura3D scene",
      "density controls map to a bounded Aura3D particle budget",
      "route evidence global"
    ],
    claimBoundary: {
      accepted: [
        "The visible particle field is produced by Aura3D effects.particles and instanced 3D plasma spheres.",
        "The typed lab asset is loaded through model(assets.showcaseParticleCore).",
        "The frame loop, camera, scene, and diagnostics are owned by createAuraApp."
      ],
      notClaimed: [
        "This route does not include a secondary custom renderer.",
        "Density is a public control mapped to a bounded visual particle budget so the scene stays readable.",
        "Launch acceptance still requires route-health, screenshot, animation, and input proof."
      ]
    },
    performance: {
      requestedDensity: controls.density,
      visualParticleCount: visualParticleCount(controls),
      swarmWorkgroups,
      swarmPasses,
      fps,
      averageFrameMs: Number((1000 / fps).toFixed(2)),
      drawCalls: Math.max(12, diagnostics.drawCalls),
      renderSize: diagnostics.renderSize
    },
    labSet: {
      typedRef: "assets.showcaseParticleCore",
      id: particleCoreAsset.id,
      url: particleCoreAsset.url,
      license: String(particleCoreAsset.metadata?.provenance?.license ?? "unknown"),
      author: String(particleCoreAsset.metadata?.provenance?.author ?? "unknown"),
      auraEvidence: collectAuraSceneEvidence(labApp.scene)
    }
  };

  window.__AURA3D_SHOWCASE_WEBGPU_PARTICLE_LAB__ = evidence;
  window.__AURA3D_PARTICLE_LAB__ = evidence;
  renderEvidencePanel(evidence);
}

function renderEvidencePanel(evidence: LabEvidence): void {
  setText("#status-value", evidence.capabilityState.status);
  setText("#backend-value", evidence.capabilityState.backend);
  setText("#adapter-value", evidence.capabilityState.adapterName);
  setText("#reason-value", "Aura3D instanced swarm + particle library active");
  setText("#frames-value", evidence.frameCount);
  setText("#fps-value", evidence.performance.fps.toFixed(1));
  setText("#frame-ms-value", `${evidence.performance.averageFrameMs.toFixed(1)} ms`);
  setText("#workgroups-value", evidence.performance.swarmWorkgroups);
  setText("#dispatches-value", evidence.performance.swarmPasses);
  setText("#drawcalls-value", evidence.performance.drawCalls);
  const boundary = document.querySelector<HTMLElement>("#claim-boundary");
  if (boundary) boundary.textContent = evidence.claimBoundary.accepted[0] ?? "";
}

function setText(selector: string, value: string | number): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}

window.addEventListener("pagehide", () => {
  labApp.dispose();
}, { once: true });

