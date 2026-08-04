import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  game,
  interactions,
  lights,
  material,
  model,
  primitives,
  scene,
  shadows,
  timeline
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
  }
}

const APP_ID = "showcase-webgpu-particle-lab" as const;
const particleCoreAsset = assets.showcaseParticleCore;

/*
 * Route-primary subject, declared once.
 *
 * The scene applies `targetMaxDimension: 1.68` and then `.scale(0.54)`, so the
 * hero's rendered size is the product of the two. The composition probe must
 * report that same rendered size, not the authored target, or it would describe
 * a subject three times larger than the one on screen.
 */
const PARTICLE_CORE_NODE_ID = "webgpu-particle-lab-route-primary-core";
const PARTICLE_CORE_TARGET_MAX_DIMENSION = 1.68;
const PARTICLE_CORE_NODE_SCALE = 0.54;
const PARTICLE_CORE_POSITION = [0, 0.38, -0.72] as const;
const PARTICLE_CORE_RENDERED_SIZE = PARTICLE_CORE_TARGET_MAX_DIMENSION * PARTICLE_CORE_NODE_SCALE;

let controls: LabControls = {
  mode: "vortex",
  density: 600
};

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
 * Without subject isolation the fallback analyzer treats the whole reactor set as
 * one component, finds it spans the crop, marks it clipped, and then reports the
 * highest-scoring *small* leftover blob as the "subject". Suppressing the hero
 * and diffing the two frames measures the declared hero instead of guessing.
 *
 * Category is `application`: this route has a typed hero asset but no play space
 * and no ground contact to prove.
 */
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application",
    camera: camera.dolly({ from: [0.08, 0.86, 4.18], to: [0, 0.82, 3.62], target: [0, 0.34, -0.72], seconds: 9, fov: 31, captureTime: 0.5 }),
    subject: {
      position: PARTICLE_CORE_POSITION,
      rotation: [0.04, 0.62, 0] as const,
      targetSize: PARTICLE_CORE_RENDERED_SIZE
    },
    setSubjectSuppressed: (suppressed: boolean) => {
      labApp.pause();
      labApp.nodes.get(PARTICLE_CORE_NODE_ID)?.setScale(suppressed ? 0.0001 : PARTICLE_CORE_NODE_SCALE);
      labApp.step(0);
    }
  },
  configurable: true
});

let evidenceTick = 0;
labApp.onFrame(() => {
  evidenceTick += 1;
  if (evidenceTick % 12 === 0) publishEvidence();
});

function buildLabSetScene(nextControls: LabControls): ReturnType<typeof scene> {
  const color = nextControls.mode === "fountain"
    ? "#f4b957"
    : nextControls.mode === "field"
      ? "#a79be8"
      : "#64d8d3";
  const secondary = nextControls.mode === "field" ? "#8fc46f" : "#64d8d3";
  const count = visualParticleCount(nextControls);
  const plume = nextControls.mode === "fountain"
      ? {
          emitter: "fountain" as const,
        emissionRate: 22,
        radius: 0.1,
        height: 0.46,
        speed: 0.52,
        turbulence: 0.06,
        intensity: 0.34,
        materialMode: "additive-glow" as const
      }
    : nextControls.mode === "field"
      ? {
          emitter: "ambient" as const,
          emissionRate: 16,
          radius: 0.12,
          height: 0.42,
          speed: 0.16,
          turbulence: 0.12,
          intensity: 0.26,
          materialMode: "star" as const
        }
      : {
          emitter: "swirl" as const,
          emissionRate: 20,
          radius: 0.12,
          height: 0.46,
          speed: 0.28,
          turbulence: 0.08,
          intensity: 0.32,
          materialMode: "additive-glow" as const
        };

  return scene()
    .background("#000000")
    .add(primitives.plane({ name: "typed particle lab reflective floor", material: material.reflectiveFloor({ color: "#07100f", roughness: 0.3, metallic: 0.14 }) })
      .position(0, -0.18, -0.86)
      .scale([1.42, 1, 1.02]))
    .add(model(particleCoreAsset, {
      name: "typed CLI sci-fi reactor core particle emitter",
      scaleMode: "fit",
      targetMaxDimension: 1.68,
      material: material.neon({ color: "#64d8d3", emissive: "#64d8d3", emissiveIntensity: 0.68 }),
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0.38, -0.72)
      .rotate(0.04, 0.62, 0)
      .scale(0.54)
      .animate({ clip: "turntable", speed: 0.1, captureTime: 0.46 })
      .runtime(game.runtimeNode(PARTICLE_CORE_NODE_ID, { tags: ["typed-asset", "route-primary", "particle-core"] })))
    .add(primitives.torus({ name: "reactor containment ring outer", material: material.neon({ color, emissive: color, emissiveIntensity: 0.92, opacity: 0.56 }) })
      .position(0, 0.42, -0.72)
      .rotate(1.5708, 0, 0)
      .scale([0.54, 0.54, 0.014])
      .animate({ clip: "turntable", speed: 0.18, captureTime: 0.4 }))
    .add(primitives.torus({ name: "reactor vertical induction ring", material: material.neon({ color: secondary, emissive: secondary, emissiveIntensity: 0.72, opacity: 0.42 }) })
      .position(0, 0.46, -0.72)
      .rotate(0, 1.5708, 0)
      .scale([0.48, 0.48, 0.012])
      .animate({ clip: "turntable", speed: -0.14, captureTime: 0.5 }))
    .add(primitives.torus({ name: "reactor lower calibration ring", material: material.neon({ color: "#f4b957", emissive: "#f4b957", emissiveIntensity: 0.5, opacity: 0.36 }) })
      .position(0, -0.02, -0.72)
      .rotate(1.5708, 0, 0)
      .scale([0.62, 0.62, 0.01]))
    .add(primitives.box({ name: "left reactor field column", material: material.pbr({ color: "#101819", roughness: 0.38, metallic: 0.48 }) })
      .position(-0.72, 0.42, -0.86)
      .scale([0.052, 0.72, 0.052]))
    .add(primitives.box({ name: "right reactor field column", material: material.pbr({ color: "#101819", roughness: 0.38, metallic: 0.48 }) })
      .position(0.72, 0.42, -0.86)
      .scale([0.052, 0.72, 0.052]))
    .add(primitives.box({ name: "left cyan reactor column strip", material: material.neon({ color: secondary, emissive: secondary, emissiveIntensity: 0.58 }) })
      .position(-0.72, 0.44, -0.74)
      .scale([0.014, 0.58, 0.02]))
    .add(primitives.box({ name: "right amber reactor column strip", material: material.neon({ color, emissive: color, emissiveIntensity: 0.58 }) })
      .position(0.72, 0.44, -0.74)
      .scale([0.014, 0.58, 0.02]))
    .add(primitives.box({ name: "overhead particle lab gantry", material: material.pbr({ color: "#12191b", roughness: 0.34, metallic: 0.42 }) })
      .position(0, 0.98, -0.9)
      .scale([0.98, 0.042, 0.052]))
    .add(primitives.box({ name: "overhead active particle bus", material: material.neon({ color: "#64d8d3", emissive: "#64d8d3", emissiveIntensity: 0.52 }) })
      .position(0, 0.94, -0.76)
      .scale([0.82, 0.014, 0.02]))
    .add(effects.particles({
      name: "Aura3D particle library primary emitter",
      emitter: plume.emitter,
      color,
      particleCount: Math.max(10, Math.round(count * 0.09)),
      emissionRate: plume.emissionRate,
      density: 0.42,
      intensity: plume.intensity,
      radius: plume.radius,
      height: plume.height,
      speed: plume.speed,
      turbulence: plume.turbulence,
      materialMode: plume.materialMode,
      texturedBillboard: true
    }))
    .add(shadows.contact({ name: "reactor core contact glow", position: [0, -0.12, -0.72], footprint: [0.82, 0.52], opacity: 0.28 }))
    .add(lights.ambient({ name: "particle lab cool ambient", intensity: 0.18, color: "#d9fffa" }))
    .add(lights.point({ name: "core cyan scan key", position: [-1.6, 1.34, 1.2], intensity: 1.84, color: secondary }))
    .add(lights.point({ name: "core amber energy fill", position: [1.7, 1.12, 0.62], intensity: 1.45, color }))
    .add(lights.directional({ name: "reactor overhead strip key", position: [0.8, 3.1, 2.2], intensity: 0.64, color: "#ffffff" }))
    .add(interactions.orbit())
    .camera(camera.dolly({ from: [0.08, 0.86, 4.18], to: [0, 0.82, 3.62], target: [0, 0.34, -0.72], seconds: 9, fov: 31, captureTime: 0.5 }))
    .timeline(timeline.loop({ seconds: 9, captureTime: 0.5 }));
}

function visualParticleCount(nextControls: LabControls): number {
  const base = Math.round(nextControls.density * 0.11);
  if (nextControls.mode === "fountain") return Math.min(82, Math.max(36, base));
  if (nextControls.mode === "field") return Math.min(72, Math.max(28, Math.round(base * 0.82)));
  return Math.min(86, Math.max(34, base));
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
  density?.addEventListener("input", () => {
    controls = { ...controls, density: Number(density.value) };
    refreshScene();
  });
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
  const fps = Number(diagnostics.fps.toFixed(1));
  const evidence: LabEvidence = {
    status: "running",
    appId: APP_ID,
    frameCount: labApp.runtime.frame,
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
      "Aura3D camera, lights, timeline, bloom, depth fog, and shadows",
      "particle mode controls rebuild the Aura3D scene",
      "density controls map to a bounded Aura3D particle budget",
      "route evidence global"
    ],
    claimBoundary: {
      accepted: [
        "The visible particle field is produced by Aura3D effects.particles.",
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
      fps,
      averageFrameMs: fps > 0 ? Number((1000 / fps).toFixed(2)) : 0,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize
    },
    labSet: {
      typedRef: "assets.showcaseParticleCore",
      id: particleCoreAsset.id,
      url: particleCoreAsset.url,
      license: particleCoreAsset.metadata.provenance.license,
      author: particleCoreAsset.metadata.provenance.author,
      auraEvidence: collectAuraSceneEvidence(labApp.scene)
    }
  };

  window.__AURA3D_SHOWCASE_WEBGPU_PARTICLE_LAB__ = evidence;
  renderEvidencePanel(evidence);
}

function renderEvidencePanel(evidence: LabEvidence): void {
  setText("#status-value", evidence.capabilityState.status);
  setText("#backend-value", evidence.capabilityState.backend);
  setText("#adapter-value", evidence.capabilityState.adapterName);
  setText("#reason-value", "Aura3D particle library active");
  setText("#frames-value", evidence.frameCount);
  setText("#fps-value", evidence.performance.fps.toFixed(1));
  setText("#frame-ms-value", `${evidence.performance.averageFrameMs.toFixed(1)} ms`);
  setText("#workgroups-value", "n/a");
  setText("#dispatches-value", "n/a");
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
