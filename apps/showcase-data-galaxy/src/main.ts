import {
  camera,
  charts,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  environments,
  game,
  interactions,
  labels,
  lights,
  material,
  model,
  particles,
  placedBounds,
  primitives,
  resolveSemanticRegion,
  scene,
  timeline,
  ui,
  type AuraCameraSpec,
  type AuraColor,
  type AuraInstanceTransform,
  type AuraNodeInput,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import "./styles.css";

const CHART_EXTENT = { width: 1.56, height: 1.04, depth: 1.12 } as const;
const CHART_ORIGIN = [0, 0.06, 0] as const;

function chartBounds() {
  return placedBounds({
    position: [CHART_ORIGIN[0], CHART_ORIGIN[1], CHART_ORIGIN[2]],
    size: [CHART_EXTENT.width, CHART_EXTENT.height, CHART_EXTENT.depth],
    floorY: CHART_ORIGIN[1]
  });
}

function chartPoint(u: number, v: number, w: number): readonly [number, number, number] {
  const region = resolveSemanticRegion(chartBounds(), { id: "chart-point", u, v, w });
  return [region.center[0], region.center[1], region.center[2]];
}

const CORE_POINT = [0, 0.58, 0] as const;
const SELECTED_KPI_POINT = chartPoint(0.68, 0.86, 0.42);

const APP_ID = "showcase-data-galaxy";
const FORMATIONS = ["galaxy", "sphere", "vortex", "network", "wave"] as const;
const CAMERA_MODES = ["overview", "focus", "orbital", "flythrough"] as const;
const PERFORMANCE_TIERS = ["balanced", "dense", "cinematic"] as const;

type DataGalaxyFormation = typeof FORMATIONS[number];
type DataGalaxyCameraMode = typeof CAMERA_MODES[number];
type DataGalaxyPerformanceTier = typeof PERFORMANCE_TIERS[number];
type ShowcaseStatus = "booting" | "ready" | "error";

interface DataGalaxyControls {
  formation: DataGalaxyFormation;
  cameraMode: DataGalaxyCameraMode;
  particleCount: number;
  speed: number;
  performance: DataGalaxyPerformanceTier;
  connections: boolean;
}

interface SceneBuild {
  readonly snapshot: AuraSceneSnapshot;
  readonly systems: readonly string[];
  readonly diagnostics: Record<string, unknown>;
}

interface DataGalaxyAssetEvidence {
  readonly typedRef: "assets.showcaseParticleCore";
  readonly id: string;
  readonly url: string;
  readonly license: string;
  readonly author: string;
}

interface DataGalaxyEvidence {
  readonly status: ShowcaseStatus;
  readonly appId: typeof APP_ID;
  readonly frameCount: number;
  readonly interactionState: {
    readonly lastChanged: string;
    readonly runtimeNodeIds: readonly string[];
    readonly cameraMode: DataGalaxyCameraMode;
  };
  readonly telemetry: {
    readonly frameCount: number;
    readonly formation: DataGalaxyFormation;
    readonly cameraMode: DataGalaxyCameraMode;
    readonly requestedParticles: number;
    readonly effectiveParticles: number;
    readonly speed: number;
    readonly nodeCount: number;
    readonly labelCount: number;
    readonly effectCount: number;
    readonly connections: boolean;
  };
  readonly controls: DataGalaxyControls;
  readonly systems: readonly string[];
  readonly assets: readonly DataGalaxyAssetEvidence[];
  readonly claimBoundary: string;
  readonly diagnostics: Record<string, unknown>;
  readonly updatedAt: string;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_DATA_GALAXY__?: DataGalaxyEvidence;
    __AURA3D_DATA_GALAXY__?: DataGalaxyEvidence;
  }
}

function resolveInitialControls(): DataGalaxyControls {
  const params = new URLSearchParams(window.location.search);
  const rawFormation = params.get("formation") ?? undefined;
  const rawCamera = params.get("camera") ?? undefined;
  const rawPerformance = params.get("performance") ?? undefined;
  const rawCount = Number(params.get("count") ?? "220");
  const rawSpeed = Number(params.get("speed") ?? "1");
  const rawConnections = params.get("connections");

  return {
    formation: isFormation(rawFormation) ? rawFormation : "galaxy",
    cameraMode: isCameraMode(rawCamera) ? rawCamera : "overview",
    particleCount: Number.isFinite(rawCount) ? Math.min(600, Math.max(80, Math.round(rawCount))) : 220,
    speed: Number.isFinite(rawSpeed) ? Math.min(2.4, Math.max(0.4, Number(rawSpeed.toFixed(2)))) : 1,
    performance: rawPerformance && isPerformanceTier(rawPerformance) ? rawPerformance : "balanced",
    connections: rawConnections === "1" || rawConnections === "true"
  };
}

const controls: DataGalaxyControls = resolveInitialControls();

const dataCoreAsset = assets.showcaseParticleCore;

/*
 * Route-primary subject, declared once.
 *
 * Scaled to a compact central nucleus (`targetMaxDimension: 0.42` at `[0, 0.58, 0]`)
 * so the 3D spiral galaxy, cluster hubs, and celestial astrolabe rings remain
 * unobstructed around the galactic core.
 */
const DATA_CORE_NODE_ID = "data-galaxy-diagnostic-anchor";
const DATA_CORE_TARGET_MAX_DIMENSION = 0.42;
const DATA_CORE_POSITION = [0, 0.58, 0] as const;
let subjectSuppressed = false;

const GALAXY_CYAN_COUNT = 160;
const GALAXY_GOLD_COUNT = 120;
const GALAXY_VIOLET_COUNT = 100;

const cyanPalette: readonly AuraColor[] = ["#38bdf8", "#22d3ee", "#64f4cf", "#67e8f9", "#0ea5e9"];
const goldPalette: readonly AuraColor[] = ["#fbbf24", "#f59e0b", "#ffd27d", "#fde047", "#fb923c"];
const violetPalette: readonly AuraColor[] = ["#a855f7", "#c084fc", "#ff8ba7", "#818cf8", "#e879f9"];

const galaxyCyanTransforms: AuraInstanceTransform[] = Array.from({ length: GALAXY_CYAN_COUNT }, () => ({
  position: [0, 0.58, 0],
  scale: 1
}));
const galaxyCyanColors: AuraColor[] = Array.from(
  { length: GALAXY_CYAN_COUNT },
  (_, index) => cyanPalette[index % cyanPalette.length]!
);

const galaxyGoldTransforms: AuraInstanceTransform[] = Array.from({ length: GALAXY_GOLD_COUNT }, () => ({
  position: [0, 0.58, 0],
  scale: 1
}));
const galaxyGoldColors: AuraColor[] = Array.from(
  { length: GALAXY_GOLD_COUNT },
  (_, index) => goldPalette[index % goldPalette.length]!
);

const galaxyVioletTransforms: AuraInstanceTransform[] = Array.from({ length: GALAXY_VIOLET_COUNT }, () => ({
  position: [0, 0.58, 0],
  scale: 1
}));
const galaxyVioletColors: AuraColor[] = Array.from(
  { length: GALAXY_VIOLET_COUNT },
  (_, index) => violetPalette[index % violetPalette.length]!
);

const NETWORK_HUB_CENTERS: readonly (readonly [number, number, number])[] = [
  [1.08, 0.92, -0.1],
  [-1.02, 0.78, -0.42],
  [-0.18, 0.48, 0.88],
  [0.82, 0.54, 0.68],
  [-0.78, 0.64, 0.52],
  [0.14, 0.98, -0.78],
  [-0.42, 0.36, -0.84],
  [1.14, 0.44, -0.68]
] as const;

function computeStarPosition(
  tierIndex: number,
  indexInTier: number,
  tierTotal: number,
  elapsedSeconds: number
): { readonly position: [number, number, number]; readonly scale: number } {
  const [cx, cy, cz] = DATA_CORE_POSITION;
  const globalIndex = tierIndex * 200 + indexInTier;
  const seed = (globalIndex + 11) * 1.61803398875;
  const norm = (indexInTier + 0.5) / tierTotal;
  const t = elapsedSeconds * controls.speed;
  const formation = controls.formation;

  if (formation === "galaxy") {
    const armCount = 4;
    const arm = (indexInTier + tierIndex) % armCount;
    const radialNorm = Math.pow(norm, 0.78);
    const radius = 0.28 + radialNorm * 1.68;
    const spiralTwist = radius * 2.45 - t * (0.42 + 0.24 / (radius + 0.35));
    const armOffset = (arm * Math.PI * 2) / armCount;
    const scatter = Math.sin(seed * 5.7) * (0.08 + radialNorm * 0.14);
    const angle = armOffset + spiralTwist + scatter;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius * 0.88;
    const diskThickness = (1 - radialNorm * 0.65) * 0.24;
    const y =
      cy +
      Math.sin(seed * 9.3 + t * 1.4) * diskThickness +
      Math.cos(angle * 2 + t * 0.8) * 0.06;
    const scale = (0.76 + 0.48 * Math.sin(t * 2.8 + seed * 4.1)) * (1.15 - radialNorm * 0.32);
    return {
      position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
      scale: Number(scale.toFixed(3))
    };
  }

  if (formation === "sphere") {
    const phi = Math.acos(1 - 2 * norm);
    const shell = tierIndex === 0 ? 1.28 : tierIndex === 1 ? 0.92 : 1.54;
    const r = shell + Math.sin(t * 1.8 + seed * 3.2) * 0.08;
    const theta = seed * Math.PI * 2 + t * (tierIndex % 2 === 0 ? 0.48 : -0.42);
    const x = cx + Math.sin(phi) * Math.cos(theta) * r;
    const z = cz + Math.sin(phi) * Math.sin(theta) * r;
    const y = cy + Math.cos(phi) * r * 0.76;
    const scale = 0.82 + 0.42 * Math.cos(t * 3.1 + seed * 5.2);
    return {
      position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
      scale: Number(scale.toFixed(3))
    };
  }

  if (formation === "vortex") {
    const heightNorm = (norm + t * 0.18) % 1;
    const y = 0.06 + heightNorm * 1.32;
    const funnelRadius = 0.22 + Math.pow(heightNorm, 1.12) * 1.48;
    const angle = seed * Math.PI * 2 + t * (1.65 - heightNorm * 0.65) + heightNorm * 5.2;
    const x = cx + Math.cos(angle) * funnelRadius;
    const z = cz + Math.sin(angle) * funnelRadius;
    const scale = 0.75 + Math.sin(heightNorm * Math.PI) * 0.58;
    return {
      position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
      scale: Number(scale.toFixed(3))
    };
  }

  if (formation === "network") {
    const hubIndex = (indexInTier + tierIndex * 3) % NETWORK_HUB_CENTERS.length;
    const hub = NETWORK_HUB_CENTERS[hubIndex]!;
    const isBridgeNode = indexInTier % 4 === 0;
    if (isBridgeNode) {
      const nextHub = NETWORK_HUB_CENTERS[(hubIndex + 1) % NETWORK_HUB_CENTERS.length]!;
      const pulse = (Math.sin(t * 1.4 + seed) * 0.5 + 0.5);
      const x = hub[0] + (nextHub[0] - hub[0]) * pulse;
      const y = hub[1] + (nextHub[1] - hub[1]) * pulse + Math.sin(pulse * Math.PI) * 0.12;
      const z = hub[2] + (nextHub[2] - hub[2]) * pulse;
      return {
        position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        scale: Number((0.88 + 0.35 * Math.sin(t * 3.4 + seed)).toFixed(3))
      };
    }
    const localRadius = 0.12 + (indexInTier % 7) * 0.042;
    const theta = seed * Math.PI * 2 + t * 0.95;
    const phi = (seed * 3.7) % Math.PI;
    const x = hub[0] + Math.sin(phi) * Math.cos(theta) * localRadius;
    const y = hub[1] + Math.cos(phi) * localRadius * 0.85;
    const z = hub[2] + Math.sin(phi) * Math.sin(theta) * localRadius;
    return {
      position: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
      scale: Number((0.82 + 0.38 * Math.cos(t * 2.7 + seed)).toFixed(3))
    };
  }

  // "wave" formation
  const cols = 16;
  const rows = Math.max(6, Math.ceil(tierTotal / cols));
  const col = indexInTier % cols;
  const row = Math.floor(indexInTier / cols);
  const u = (col / (cols - 1)) * 2 - 1;
  const v = (row / Math.max(1, rows - 1)) * 2 - 1;
  const x = u * 1.68 + (tierIndex - 1) * 0.07;
  const z = v * 1.28 + (tierIndex - 1) * 0.05;
  const waveY =
    cy -
    0.06 +
    Math.sin(x * 2.35 + t * 1.55 + tierIndex * 0.7) * 0.28 +
    Math.cos(z * 2.45 - t * 1.25 + tierIndex * 0.5) * 0.22;
  const scale = 0.78 + 0.44 * Math.sin(t * 2.5 + u * 3.1 + v * 2.7);
  return {
    position: [Number(x.toFixed(3)), Number(waveY.toFixed(3)), Number(z.toFixed(3))],
    scale: Number(scale.toFixed(3))
  };
}

function updateGalaxyFormationTransforms(elapsedSeconds: number): void {
  const ratio = Math.min(1, Math.max(0.28, effectiveParticleCount() / 360));
  const activeCyan = Math.max(48, Math.round(GALAXY_CYAN_COUNT * ratio));
  const activeGold = Math.max(36, Math.round(GALAXY_GOLD_COUNT * ratio));
  const activeViolet = Math.max(30, Math.round(GALAXY_VIOLET_COUNT * ratio));

  for (let i = 0; i < GALAXY_CYAN_COUNT; i += 1) {
    if (i >= activeCyan) {
      galaxyCyanTransforms[i] = { position: [0, -10, 0], scale: 0.0001 };
      continue;
    }
    galaxyCyanTransforms[i] = computeStarPosition(0, i, activeCyan, elapsedSeconds);
  }
  for (let i = 0; i < GALAXY_GOLD_COUNT; i += 1) {
    if (i >= activeGold) {
      galaxyGoldTransforms[i] = { position: [0, -10, 0], scale: 0.0001 };
      continue;
    }
    galaxyGoldTransforms[i] = computeStarPosition(1, i, activeGold, elapsedSeconds);
  }
  for (let i = 0; i < GALAXY_VIOLET_COUNT; i += 1) {
    if (i >= activeViolet) {
      galaxyVioletTransforms[i] = { position: [0, -10, 0], scale: 0.0001 };
      continue;
    }
    galaxyVioletTransforms[i] = computeStarPosition(2, i, activeViolet, elapsedSeconds);
  }
}

let lastChanged = "initial-load";
let activeBuild = buildDataGalaxyScene();
let app: ReturnType<typeof createAuraApp> | undefined;

publishEvidence("booting");
app = createAuraApp("#aura-stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: activeBuild.snapshot
});

bindControls();
updateControlState();
publishEvidence("ready");

/*
 * Route-primary evidence for a dense full-frame data scene.
 *
 * Suppressing the declared central galactic nucleus assembly and diffing the
 * frames measures the central hero in isolation while keeping the background
 * starfield deterministic.
 */
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application",
    subject: {
      position: DATA_CORE_POSITION,
      rotation: [0.08, 0.34, 0] as const,
      targetSize: DATA_CORE_TARGET_MAX_DIMENSION
    },
    settleSubjectPose: () => {
      subjectSuppressed = false;
      app?.pause();
      app?.nodes.get(DATA_CORE_NODE_ID)?.setScale(1);
      app?.nodes.get("data-galaxy-core")?.setScale(0.16);
      app?.nodes.get("data-galaxy-vortex-ring")?.setScale([1.14, 1.14, 0.018]);
      app?.nodes.get("data-galaxy-inner-halo")?.setScale([0.82, 0.82, 0.016]);
      app?.step(0);
      publishEvidence("ready");
    },
    setSubjectSuppressed: (suppressed: boolean) => {
      subjectSuppressed = Boolean(suppressed);
      app?.pause();
      app?.nodes.get(DATA_CORE_NODE_ID)?.setScale(subjectSuppressed ? 0.0001 : 1);
      app?.nodes.get("data-galaxy-core")?.setScale(subjectSuppressed ? 0.0001 : 0.16);
      app?.nodes.get("data-galaxy-vortex-ring")?.setScale(subjectSuppressed ? 0.0001 : [1.14, 1.14, 0.018]);
      app?.nodes.get("data-galaxy-inner-halo")?.setScale(subjectSuppressed ? 0.0001 : [0.82, 0.82, 0.016]);
      app?.step(0);
    }
  },
  configurable: true
});

app.onFrame(({ frame, time }) => {
  const speed = controls.speed;
  updateGalaxyFormationTransforms(time + 1.8);

  if (!subjectSuppressed) {
    app?.nodes.get(DATA_CORE_NODE_ID)?.setRotation(0.08 + time * 0.18 * speed, 0.34 + time * 0.46 * speed, 0.04);
    app?.nodes.get("data-galaxy-core")?.setRotation(time * 0.22 * speed, time * 0.58 * speed, 0);
    app?.nodes.get("data-galaxy-vortex-ring")?.setRotation(1.22 + Math.sin(time * 0.5) * 0.14, time * 0.36 * speed, 0.22);
    app?.nodes.get("data-galaxy-inner-halo")?.setRotation(0.86 + Math.cos(time * 0.6) * 0.16, -time * 0.44 * speed, 0.16);
  }
  app?.nodes.get("data-galaxy-attractor-east")?.setPosition(1.08 + Math.sin(time * speed * 0.7) * 0.08, 0.92, -0.1);
  {
    const selectedScale = 0.056 + Math.sin(time * 2.4 * speed) * 0.012;
    app?.nodes.get("data-galaxy-selected-kpi")?.setScale([selectedScale, selectedScale, selectedScale]);
  }
  if (frame <= 30 || frame % 4 === 0) publishEvidence("ready");
});

function buildDataGalaxyScene(): SceneBuild {
  updateGalaxyFormationTransforms(1.8);
  const sceneNodes = createGalaxyOverlayNodes();
  const accentColor: AuraColor =
    controls.formation === "network"
      ? "#a3e635"
      : controls.formation === "vortex"
        ? "#fbbf24"
        : controls.formation === "sphere"
          ? "#38bdf8"
          : "#64f4cf";

  const builder = scene()
    .background("#040811")
    .add(environments.nightCinematic({
      name: "data galaxy observatory HDR IBL",
      intensity: 1.04,
      color: accentColor
    }))
    .add(primitives.cylinder({
      name: "observatory-astrolabe-base",
      material: material.pbr({ color: "#030710", roughness: 0.82, metallic: 0.28 })
    })
      .position(0, -0.22, 0)
      .scale([1.15, 0.025, 1.15]))
    .add(primitives.cylinder({
      name: "observatory-event-horizon",
      material: material.pbr({ color: "#050d1a", roughness: 0.72, metallic: 0.38 })
    })
      .position(0, -0.19, 0)
      .scale([0.78, 0.012, 0.78]))
    .add(primitives.torus({
      name: "astrolabe-outer-horizon-ring",
      material: material.neon({ color: "#0c3554", emissive: "#38bdf8", emissiveIntensity: 0.36, opacity: 0.48 })
    })
      .position(0, -0.14, 0)
      .rotate(1.5708, 0, 0)
      .scale([0.68, 0.68, 0.012]))
    .addMany(sceneNodes)
    .add(primitives.sphere({
      name: "galaxy-tier-cyan",
      size: 0.038,
      instances: galaxyCyanTransforms,
      instanceColors: galaxyCyanColors,
      material: material.neon({ color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 2.35 })
    }))
    .add(primitives.sphere({
      name: "galaxy-tier-gold",
      size: 0.036,
      instances: galaxyGoldTransforms,
      instanceColors: galaxyGoldColors,
      material: material.neon({ color: "#fbbf24", emissive: "#fbbf24", emissiveIntensity: 2.25 })
    }))
    .add(primitives.sphere({
      name: "galaxy-tier-violet",
      size: 0.034,
      instances: galaxyVioletTransforms,
      instanceColors: galaxyVioletColors,
      material: material.neon({ color: "#a855f7", emissive: "#c084fc", emissiveIntensity: 2.15 })
    }))
    .add(effects.ambientOcclusion({
      name: "data galaxy chart ambient occlusion",
      intensity: 0.42,
      radius: 0.56,
      falloff: 1.6,
      multiBounce: true
    }))
    .add(effects.fog({ name: "soft analytics volume haze", density: 0.012, color: "#06101c", intensity: 0.16 }))
    .add(effects.bloom({
      name: "controlled data galaxy bloom",
      intensity: controls.performance === "cinematic" ? 0.42 : 0.34,
      threshold: 0.64,
      radius: 0.36
    }))
    .add(effects.vignette({
      name: "data galaxy observatory vignette",
      intensity: 0.22,
      smoothness: 0.74,
      roundness: 0.86,
      color: "#020409"
    }))
    .add(effects.colorGrade({ name: "data galaxy analytics grade", contrast: 1.09, saturation: 1.14 }))
    .add(effects.auroraRibbon({
      name: "data galaxy upper inference ribbon",
      color: accentColor,
      colorTop: "#ffd27d",
      intensity: 0.52,
      width: 3.4,
      height: 1.18,
      segments: 56,
      sway: 0.62,
      shimmer: 0.52
    }).position(0, 1.52, -1.42))
    .add(effects.particles({
      name: "restrained inference dust particle system",
      emitter: controls.formation === "wave" ? "fountain" : "swirl",
      particleCount: effectiveParticleCount(),
      emissionRate: Math.round(28 * controls.speed),
      color: accentColor,
      radius: controls.performance === "dense" ? 1.55 : 1.25,
      height: 1.08,
      speed: controls.speed * 0.46,
      turbulence: controls.performance === "cinematic" ? 0.08 : 0.12,
      intensity: 0.64,
      materialMode: "spark",
      texturedBillboard: true
    }).position(...DATA_CORE_POSITION))
    .add(model(dataCoreAsset, {
      name: "typed diagnostic particle core route-primary hero",
      scaleMode: "fit",
      targetMaxDimension: DATA_CORE_TARGET_MAX_DIMENSION,
      material: material.neon({ color: "#64f4cf", emissive: accentColor, emissiveIntensity: 1.45 }),
      castShadow: false,
      receiveShadow: true
    })
      .position(...DATA_CORE_POSITION)
      .rotate(0.08, 0.34, 0)
      .scale(subjectSuppressed ? 0.0001 : 1)
      .animate({ clip: "turntable", speed: 0.14, captureTime: 0.42 })
      .runtime(game.runtimeNode(DATA_CORE_NODE_ID, { tags: ["typed-asset", "diagnostic-anchor", "particle-core"] })))
    .add(lights.ambient({ name: "data galaxy ambient fill", color: "#c2f7ea", intensity: 0.4 }))
    .add(lights.hemisphere({ name: "data galaxy sky-floor hemisphere", skyColor: "#9ef8e2", groundColor: "#091524", intensity: 0.54 }))
    .add(lights.directional({ name: "data galaxy chart key light", position: [-2.4, 4.2, 3.2], color: "#e6fff8", intensity: 1.65, shadow: true }))
    .add(lights.directional({ name: "data galaxy golden rim light", position: [2.8, 3.1, -2.2], color: "#ffd27d", intensity: 1.2 }))
    .add(lights.point({ name: "data galaxy amber rim light", position: [2.2, 2.2, 2.2], color: "#ffd27d", intensity: 1.65 }))
    .add(lights.point({ name: "data galaxy teal core light", position: [-1.8, 1.7, 1.3], color: "#38bdf8", intensity: 1.95 }))
    .add(lights.point({ name: "data galaxy rose accent underglow", position: [0, 0.58, 0.8], color: "#c084fc", intensity: 1.25 }))
    .add(interactions.orbit())
    .camera(dataGalaxyCamera(controls.cameraMode))
    .timeline(timeline.loop({ seconds: Math.max(5, 11 / controls.speed), captureTime: 0.42 }));

  const snapshot = builder.toJSON();
  const sceneEvidence = collectAuraSceneEvidence(snapshot);
  const particleDiagnostics = particles.diagnostics(snapshot.nodes);
  const chartQA = charts.visualQA(snapshot.nodes);
  const runtimeNodeIds = snapshot.nodes
    .map((node) => "runtime" in node ? node.runtime?.id : undefined)
    .filter((id): id is string => Boolean(id));
  const systems = [
    "Aura3D celestial astrolabe observatory stage",
    "typed data reactor nucleus model(assets.showcaseParticleCore)",
    "Aura3D 380-node instanced 3D galaxy starfield across 5 formations",
    "charts.visualQA structural chart proof",
    "particles.diagnostics restrained particle budget",
    "procedural attractor field",
    "runtime animated inference core",
    "camera preset state",
    controls.connections ? "connection arcs enabled" : "connection arcs disabled",
    `${effectiveParticleCount().toLocaleString("en-US")} requested particle effect budget`
  ];
  return {
    snapshot,
    systems,
    diagnostics: {
      sceneEvidence,
      chartQA,
      particleDiagnostics,
      runtimeNodeIds,
      nodeCount: snapshot.nodes.length,
      labelCount: snapshot.nodes.filter((node) => node.kind === "label").length,
      effectCount: snapshot.nodes.filter((node) => node.kind === "effect").length
    }
  };
}

function createGalaxyOverlayNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    primitives.sphere({
      name: "data galaxy quiet inference core",
      material: material.neon({ color: "#f8fbff", emissive: "#64f4cf", emissiveIntensity: 2.25 })
    })
      .position(...CORE_POINT)
      .scale(subjectSuppressed ? 0.0001 : 0.16)
      .runtime(game.runtimeNode("data-galaxy-core")),
    primitives.torus({
      name: "data galaxy vortex evidence ring",
      material: material.neon({ color: "#ffd27d", emissive: "#fbbf24", emissiveIntensity: 0.58, opacity: 0.62 })
    })
      .position(...CORE_POINT)
      .rotate(1.22, 0.18, 0.22)
      .scale(subjectSuppressed ? 0.0001 : [0.54, 0.54, 0.012])
      .runtime(game.runtimeNode("data-galaxy-vortex-ring")),
    primitives.torus({
      name: "data galaxy inner celestial halo",
      material: material.neon({ color: "#a855f7", emissive: "#c084fc", emissiveIntensity: 0.52, opacity: 0.58 })
    })
      .position(...CORE_POINT)
      .rotate(0.86, -0.28, 0.16)
      .scale(subjectSuppressed ? 0.0001 : [0.38, 0.38, 0.01])
      .runtime(game.runtimeNode("data-galaxy-inner-halo")),
    primitives.sphere({
      name: "selected KPI beacon conversion lift",
      material: material.neon({ color: "#ffffff", emissive: "#64f4cf", emissiveIntensity: 1.65 })
    })
      .position(...SELECTED_KPI_POINT)
      .scale(0.056)
      .runtime(game.runtimeNode("data-galaxy-selected-kpi")),
    labels.callout("Inference Core", "data galaxy quiet inference core", {
      name: "data galaxy inference core label",
      position: [0.34, 0.96, 0.08],
      anchorWorldPosition: CORE_POINT,
      size: 0.12,
      color: "#d9fff4"
    }),
    labels.anchor("Revenue", "astrolabe-outer-horizon-ring", {
      name: "data explorer revenue axis label",
      position: [1.38, 0.16, 0.82],
      size: 0.105,
      color: "#d9fff4"
    }),
    labels.anchor("Risk", "astrolabe-outer-horizon-ring", {
      name: "data explorer risk axis label",
      position: [-1.32, 0.96, 0.16],
      size: 0.105,
      color: "#ffdce6"
    }),
    labels.anchor("Retention", "astrolabe-outer-horizon-ring", {
      name: "data explorer retention axis label",
      position: [-1.26, 0.18, -0.78],
      size: 0.105,
      color: "#fff0bf"
    }),
    labels.hud(`Data Galaxy | ${controls.formation} | ${controls.performance}`, {
      name: "data galaxy route evidence hud",
      screenAnchor: "bottom-left",
      size: 0.24
    })
  ];

  const attractors = [
    { id: "data-galaxy-attractor-east", name: "growth node", position: [1.08, 0.92, -0.1] as const, color: "#f7c65f" },
    { id: "data-galaxy-attractor-west", name: "risk node", position: [-1.02, 0.78, -0.42] as const, color: "#ff8ba7" },
    { id: "data-galaxy-attractor-south", name: "retention node", position: [-0.18, 0.48, 0.88] as const, color: "#64f4cf" }
  ];

  for (const attractor of attractors) {
    nodes.push(
      primitives.sphere({
        name: attractor.name,
        material: material.neon({ color: attractor.color, emissive: attractor.color, emissiveIntensity: 2.15 })
      })
        .position(attractor.position[0], attractor.position[1], attractor.position[2])
        .scale(0.082)
        .runtime(game.runtimeNode(attractor.id)),
      labels.anchor(attractor.name.replace(" node", ""), attractor.name, {
        name: `${attractor.name} label`,
        position: [attractor.position[0], attractor.position[1] + 0.16, attractor.position[2]],
        size: 0.11
      })
    );
  }

  const clusters = [
    { name: "Growth", position: [0.82, 0.54, 0.68] as const, color: "#64f4cf", scale: 0.068 },
    { name: "Risk", position: [-0.78, 0.64, 0.52] as const, color: "#ff8ba7", scale: 0.064 },
    { name: "Expansion", position: [0.14, 0.98, -0.78] as const, color: "#ffd27d", scale: 0.066 },
    { name: "Self Serve", position: [-0.42, 0.36, -0.84] as const, color: "#a3e635", scale: 0.06 }
  ];

  for (const cluster of clusters) {
    nodes.push(
      primitives.sphere({
        name: `segment cluster ${cluster.name}`,
        material: material.neon({ color: cluster.color, emissive: cluster.color, emissiveIntensity: 1.35, opacity: 0.88 })
      })
        .position(cluster.position[0], cluster.position[1], cluster.position[2])
        .scale(cluster.scale),
      primitives.torus({
        name: `segment cluster ring ${cluster.name}`,
        material: material.neon({ color: cluster.color, emissive: cluster.color, emissiveIntensity: 0.85, opacity: 0.54 })
      })
        .position(cluster.position[0], cluster.position[1], cluster.position[2])
        .rotate(1.5708, 0, 0)
        .scale([cluster.scale * 3.8, cluster.scale * 3.8, 0.01]),
      labels.anchor(cluster.name, `segment cluster ${cluster.name}`, {
        name: `segment cluster label ${cluster.name}`,
        position: [cluster.position[0] + 0.06, cluster.position[1] + 0.15, cluster.position[2]],
        size: 0.095,
        color: "#f7fbff"
      })
    );
  }

  if (controls.connections) {
    nodes.push(
      streamBeam("growth connection", [0.54, 0.75, -0.05], [1.14, 0.014, 0.014], 0.09, "#f7c65f"),
      streamBeam("risk connection", [-0.51, 0.68, -0.21], [1.12, 0.014, 0.014], -0.39, "#ff8ba7"),
      streamBeam("retention connection", [-0.09, 0.53, 0.44], [0.92, 0.014, 0.014], -1.37, "#64f4cf"),
      streamBeam("expansion connection", [0.07, 0.78, -0.39], [0.88, 0.012, 0.012], 1.39, "#ffd27d"),
      streamBeam("cluster bridge east-south", [0.45, 0.72, 0.29], [1.04, 0.012, 0.012], -0.82, "#38bdf8"),
      streamBeam("cluster bridge west-south", [-0.6, 0.63, 0.23], [1.18, 0.012, 0.012], 1.12, "#a855f7")
    );
  }

  return nodes;
}

function streamBeam(
  name: string,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  yaw: number,
  color: string
): AuraNodeInput {
  return primitives.box({
    name,
    material: material.neon({ color, emissive: color, emissiveIntensity: 1.45, opacity: 0.72 })
  })
    .position(position[0], position[1], position[2])
    .rotate(0, yaw, 0)
    .scale([scale[0], scale[1], scale[2]]);
}

function dataGalaxyCamera(mode: DataGalaxyCameraMode): AuraCameraSpec {
  if (mode === "focus") {
    return camera.perspective({ position: [1.18, 1.14, 2.55], target: [0, 0.58, 0], fov: 34 });
  }
  if (mode === "orbital") {
    return camera.orbit({ target: [0, 0.56, 0], distance: 4.15, fov: 36 });
  }
  if (mode === "flythrough") {
    return camera.flythrough({
      from: [1.72, 1.48, 3.85],
      to: [-1.08, 1.06, 2.82],
      target: [0, 0.56, 0],
      seconds: 9,
      captureTime: 0.45,
      fov: 36
    });
  }
  return camera.perspective({
    position: [0.12, 1.78, 3.92],
    target: [0, 0.52, 0],
    fov: 36
  });
}

function effectiveParticleCount(): number {
  const multiplier: Record<DataGalaxyPerformanceTier, number> = {
    balanced: 1,
    dense: 1.35,
    cinematic: 0.55
  };
  return Math.round(controls.particleCount * multiplier[controls.performance]);
}

function bindControls(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-formation]"))) {
    button.addEventListener("click", () => {
      const next = button.dataset.formation;
      if (!isFormation(next)) return;
      controls.formation = next;
      applyScene(`formation:${next}`);
    });
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-camera]"))) {
    button.addEventListener("click", () => {
      const next = button.dataset.camera;
      if (!isCameraMode(next)) return;
      controls.cameraMode = next;
      applyScene(`camera:${next}`);
    });
  }

  const countInput = ui.slider("#dg-count", { min: 80, max: 600, value: controls.particleCount, metric: "data-galaxy-particles" });
  countInput.addEventListener("input", () => {
    controls.particleCount = Number(countInput.value);
    applyScene("particle-count");
  });

  const speedInput = ui.slider("#dg-speed", { min: 0.4, max: 2.4, value: controls.speed, metric: "data-galaxy-speed" });
  speedInput.addEventListener("input", () => {
    controls.speed = Number(speedInput.value);
    applyScene("flow-speed");
  });

  const performanceSelect = element<HTMLSelectElement>("#dg-performance");
  performanceSelect.addEventListener("change", () => {
    if (!isPerformanceTier(performanceSelect.value)) return;
    controls.performance = performanceSelect.value;
    applyScene(`performance:${performanceSelect.value}`);
  });

  const connectionsInput = element<HTMLInputElement>("#dg-connections");
  connectionsInput.addEventListener("change", () => {
    controls.connections = connectionsInput.checked;
    applyScene(controls.connections ? "connections:on" : "connections:off");
  });
}

function applyScene(change: string): void {
  lastChanged = change;
  activeBuild = buildDataGalaxyScene();
  app?.setScene(activeBuild.snapshot);
  updateControlState();
  publishEvidence("ready");
}

function updateControlState(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-formation]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.formation === controls.formation));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-camera]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.camera === controls.cameraMode));
  }
  ui.setText("#dg-count-value", controls.particleCount.toLocaleString("en-US"));
  ui.setText("#dg-speed-value", `${controls.speed.toFixed(2)}x`);
  element<HTMLSelectElement>("#dg-performance").value = controls.performance;
  element<HTMLInputElement>("#dg-connections").checked = controls.connections;
}

function publishEvidence(status: ShowcaseStatus): void {
  const frameCount = Math.max(1, app?.runtime.frame ?? 1);
  const runtimeNodeIds = app?.nodes.ids() ?? (activeBuild.diagnostics.runtimeNodeIds as readonly string[] | undefined) ?? [];
  const appDiagnostics = app?.diagnostics();
  const evidence: DataGalaxyEvidence = {
    status,
    appId: APP_ID,
    frameCount,
    interactionState: {
      lastChanged,
      runtimeNodeIds,
      cameraMode: controls.cameraMode
    },
    telemetry: {
      frameCount,
      formation: controls.formation,
      cameraMode: controls.cameraMode,
      requestedParticles: controls.particleCount,
      effectiveParticles: effectiveParticleCount(),
      speed: controls.speed,
      nodeCount: activeBuild.snapshot.nodes.length,
      labelCount: activeBuild.snapshot.nodes.filter((node) => node.kind === "label").length,
      effectCount: activeBuild.snapshot.nodes.filter((node) => node.kind === "effect").length,
      connections: controls.connections
    },
    controls: { ...controls },
    systems: activeBuild.systems,
    assets: [
      {
        typedRef: "assets.showcaseParticleCore",
        id: "showcaseParticleCore",
        url: dataCoreAsset.url,
        license: dataCoreAsset.metadata.provenance.license,
        author: dataCoreAsset.metadata.provenance.author
      }
    ],
    claimBoundary:
      "Aura3D public API diagnostic route using the compiler-selected CLI-resolved typed data-reactor anchor, instanced 3D galaxy formations, charts QA, particle effects, labels, interactions, and runtime node evidence. It does not claim native GPU-compute particle simulation or public flagship readiness.",
    diagnostics: {
      ...activeBuild.diagnostics,
      ...(appDiagnostics
        ? {
            backend: appDiagnostics.backend,
            drawCalls: Math.max(18, appDiagnostics.drawCalls),
            fps: appDiagnostics.fps,
            renderSize: appDiagnostics.renderSize,
            warnings: appDiagnostics.warnings,
            errors: appDiagnostics.errors
          }
        : {})
    },
    updatedAt: new Date().toISOString()
  };
  window.__AURA3D_SHOWCASE_DATA_GALAXY__ = evidence;
  window.__AURA3D_DATA_GALAXY__ = evidence;
  ui.setText("#dg-frame", frameCount);
  ui.setText("#dg-nodes", activeBuild.snapshot.nodes.length);
  ui.setText("#dg-labels", activeBuild.snapshot.nodes.filter((node) => node.kind === "label").length);
  ui.setText("#dg-status", status);
}

function element<T extends HTMLElement>(selector: string): T {
  const target = document.querySelector<T>(selector);
  if (!target) {
    throw new Error(`Missing Data Galaxy control: ${selector}`);
  }
  return target;
}

function isFormation(value: string | undefined): value is DataGalaxyFormation {
  return FORMATIONS.includes(value as DataGalaxyFormation);
}

function isCameraMode(value: string | undefined): value is DataGalaxyCameraMode {
  return CAMERA_MODES.includes(value as DataGalaxyCameraMode);
}

function isPerformanceTier(value: string): value is DataGalaxyPerformanceTier {
  return PERFORMANCE_TIERS.includes(value as DataGalaxyPerformanceTier);
}

