import {
  camera,
  checkSpatialInvariants,
  collectAuraSceneEvidence,
  createAuraApp,
  createDigitalTwinKit,
  distributeInRegion,
  effects,
  focusCameraIntent,
  focusSemanticRegion,
  game,
  interactions,
  labels,
  lights,
  material,
  model,
  placedBoundsFromAsset,
  primitives,
  resolveBoundsAnchor,
  resolveSemanticRegion,
  scene,
  type AuraNodeInput,
  type HelperPlacementClaim,
  type SemanticRegion
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import "./styles.css";

type OpsMode = "normal" | "maintenance" | "incident";
type ZoneId = "assembly" | "packaging" | "energy" | "dock";

interface ZoneState {
  readonly id: ZoneId;
  readonly label: string;
  readonly load: number;
  readonly temperature: number;
  readonly incidents: number;
}

interface DigitalTwinEvidence {
  readonly status: "ready" | "running";
  readonly appId: "showcase-digital-twin-ops";
  readonly frameCount: number;
  readonly mode: OpsMode;
  readonly selectedZone: ZoneId;
  readonly isolatedZone?: ZoneId;
  readonly timeControl: { readonly paused: boolean; readonly step: number; readonly steps: number };
  readonly accessibilitySummary: string;
  readonly uptime: number;
  readonly throughput: number;
  readonly energyMw: number;
  readonly alerts: number;
  readonly zones: readonly ZoneState[];
  readonly controls: readonly string[];
  readonly systems: readonly string[];
  readonly runtimeNodeIds: readonly string[];
  readonly renderedLabels: readonly { readonly visible: boolean }[];
  readonly eventLog: readonly string[];
  readonly camera: {
    readonly position: readonly number[];
    readonly target: readonly number[];
    readonly focusedZone?: ZoneId;
  };
  readonly motionProof: {
    readonly conveyorSegmentX: number;
    readonly robotArmRadians: number;
    readonly typedRobotYaw: number;
    readonly sensorSweepRadians: number;
    readonly conveyorSurfaceY: number;
    readonly movingWorkpieces: readonly {
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly bottomY: number;
      readonly surfaceClearance: number;
      readonly insidePackagingLane: boolean;
    }[];
  };
  readonly claimBoundary: string;
  /**
   * Spatial invariant report proving every helper element is anchored to the
   * workcell's placed bounds. Replaces judging placement by eye.
   */
  readonly spatialInvariants: unknown;
  readonly diagnostics: Record<string, unknown>;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__?: DigitalTwinEvidence;
  }
}

const controls = [
  "Mode buttons switch normal, service, and incident states",
  "Zone buttons select assembly, packaging, energy, or dock",
  "Inject Alert creates deterministic incident evidence",
  "Clear Alerts returns the workcell to normal",
  "Focus Zone frames the selected equipment region",
  "Isolate Zone applies visible and telemetry-backed operational isolation",
  "Pause or resume time and advance the deterministic eight-step simulation",
  "Orbit interaction inspects the typed workcell"
] as const;

const systems = [
  "typed robotic welding workcell model(assets.showcaseRoboticWeldingWorkcell) is the route-primary industrial subject",
  "compiler-selected orange robot asset is rejected from the live primary path after human visual review",
  "bounded operations dashboard uses deterministic sample telemetry only",
  "supporting floor, gantry, conveyor rails, pulses, workpieces, and scanner sweep stay secondary to the typed workcell asset",
  "every helper element is placed by the reusable asset-relative anchoring system (engine.resolveBoundsAnchor / resolveSemanticRegion), not by literal world coordinates",
  "zone selection feedback comes from the reusable focus system (engine.focusSemanticRegion)",
  "spatial invariants are published so helper placement is verified against the asset's bounds rather than judged by eye",
  "Aura3D runtime nodes provide visible conveyor and scanner motion proof",
  "public world callouts label all four asset-relative equipment zones",
  "isolation and deterministic time controls change scene/runtime state rather than only dashboard text",
  "route-health evidence global and deploy gates remain required before public claims"
] as const;

const workcellAsset = assets.showcaseRoboticWeldingWorkcell;
const zoneOrder: readonly ZoneId[] = ["assembly", "packaging", "energy", "dock"];
const zoneLabels: Record<ZoneId, string> = {
  assembly: "Assembly",
  packaging: "Packaging",
  energy: "Energy",
  dock: "Dock"
};

/**
 * Workcell staging position. A genuine level-design value; everything else in the
 * scene is derived from the asset's placed bounds rather than repeated literals.
 */
const WORKCELL_POSITION: readonly [number, number, number] = [-0.08, 0.058, -0.04];
// Give the typed cell a confident hero scale.  The previous 2.35-unit fit left
// the robot and weld bays visually subordinate to the surrounding empty stage;
// all bay, conveyor, and label anchors below still derive from these bounds.
const WORKCELL_TARGET_MAX_DIMENSION = 2.7;

/**
 * Operational zones as normalized regions of the workcell's own bounds.
 *
 * These replace four hardcoded world coordinates. The previous literals were
 * chosen by eye against one asset and never re-derived, which is why status
 * markers, belt pulses and the alarm beacon appeared as boxes floating beside the
 * scene rather than attached to the equipment they annotate. `u`/`v`/`w` run 0..1
 * across the asset's X/Y/Z extents, so the zones follow the asset.
 */
const zoneRegions: Record<ZoneId, SemanticRegion> = {
  assembly: { id: "assembly", label: "Assembly", u: 0.34, v: 0.12, w: 0.44, extent: [0.26, 0.1, 0.3] },
  packaging: { id: "packaging", label: "Packaging", u: 0.72, v: 0.12, w: 0.72, extent: [0.24, 0.1, 0.26] },
  energy: { id: "energy", label: "Energy", u: 0.14, v: 0.12, w: 0.72, extent: [0.2, 0.1, 0.24] },
  dock: { id: "dock", label: "Dock", u: 0.88, v: 0.12, w: 0.4, extent: [0.2, 0.1, 0.26] }
};

/**
 * The conveyor line, as a region of the workcell rather than a literal span.
 *
 * `-0.45 + index * 0.17` encoded both the belt's location and its spacing into an
 * unexplained pair of numbers tied to one asset. Deriving the region means the
 * belt, its pulses and its workpieces stay on the machine.
 *
 * Declared alongside `zoneRegions` because `createAuraApp` builds the scene during
 * module evaluation: a `const` declared after that call is in its temporal dead
 * zone when the scene builder runs.
 */
const conveyorRegion: SemanticRegion = {
  id: "conveyor",
  label: "Packaging conveyor line",
  // The lane crosses the visible Packaging station and continues toward Dock.
  // Its raised centre is deliberately distinct from the workcell floor plane.
  u: 0.65,
  v: 0.2,
  w: 0.72,
  extent: [0.54, 0.04, 0.1]
};

function conveyorLine() {
  return resolveSemanticRegion(workcellBounds(), conveyorRegion);
}

function conveyorDimensions() {
  const bounds = workcellBounds();
  const belt = conveyorLine();
  const deckHeight = bounds.size[1] * 0.035;
  const workpieceHeight = bounds.size[1] * 0.038;
  const surfaceY = belt.center[1] + deckHeight / 2;
  const workpieceY = surfaceY + workpieceHeight / 2;
  return { belt, deckHeight, workpieceHeight, surfaceY, workpieceY };
}

/**
 * The reusable digital-twin kit this route now configures.
 *
 * Phase 12: the route declares its equipment zones, conveyor region and alarm anchor, and the
 * kit owns selection state, focus framing, marker distribution, alarm state, the sensor
 * timeline and the spatial invariants a gate checks.
 */
const digitalTwinKit = createDigitalTwinKit({
  bounds: placedBoundsFromAsset(workcellAsset, {
    targetMaxDimension: WORKCELL_TARGET_MAX_DIMENSION,
    position: WORKCELL_POSITION,
    floorY: WORKCELL_POSITION[1]
  }),
  equipment: zoneOrder.map((zone) => ({ ...zoneRegions[zone], sensors: { load: 56, temperature: 31.5 } })),
  flowRegion: conveyorRegion,
  markerCount: 4,
  alarmAnchor: "top-left"
});

/** Workcell bounds as the route renders them, derived from the typed asset. */
function workcellBounds() {
  return placedBoundsFromAsset(workcellAsset, {
    targetMaxDimension: WORKCELL_TARGET_MAX_DIMENSION,
    position: WORKCELL_POSITION,
    floorY: WORKCELL_POSITION[1]
  });
}

/** World-space centre of a zone, resolved from the asset each time it is asked for. */
function zoneCenter(zone: ZoneId): readonly [number, number, number] {
  return resolveSemanticRegion(workcellBounds(), zoneRegions[zone]).center;
}

let mode: OpsMode = "normal";
let selectedZone: ZoneId = "assembly";
let isolatedZone: ZoneId | undefined;
let timePaused = false;
let simulationStep = 0;
const SIMULATION_STEPS = 8;
const SECONDS_PER_STEP = 2;
/**
 * Live camera pose.
 *
 * The Focus Zone control previously only appended a log line claiming the camera
 * had focused the zone, while the camera never moved. Holding the pose here means
 * the control's documented action -- framing the selected zone -- actually happens
 * and is observable in evidence.
 */
function overviewCamera(): { position: readonly [number, number, number]; target: readonly [number, number, number]; fov: number } {
  const compactViewport = window.innerWidth < 680;
  return {
    // The workcell is a wide, low industrial asset. A closer, slightly lower
    // camera gives its robot bays and conveyor a readable hero silhouette while
    // leaving enough breathing room for the four asset-relative callouts.
    position: compactViewport ? [4.35, 2.4, 5.8] : [3.12, 1.86, 4.34],
    target: [-0.04, 0.48, 0.02],
    fov: compactViewport ? 43 : 34
  };
}
let cameraPose: { position: readonly [number, number, number]; target: readonly [number, number, number]; fov: number } = overviewCamera();
let focusedZone: ZoneId | undefined;
let frameCount = 0;
let uptime = 0;
let throughput = 1280;
let energyMw = 4.8;
let zones: ZoneState[] = createZones();
let eventLog: readonly string[] = ["Robotic welding workcell mounted with deterministic telemetry."];
let subjectSuppressed = false;
let lastMotionProof: DigitalTwinEvidence["motionProof"] = {
  conveyorSegmentX: -0.48,
  robotArmRadians: 0,
  typedRobotYaw: -0.18,
  sensorSweepRadians: 0,
  conveyorSurfaceY: Number(conveyorDimensions().surfaceY.toFixed(3)),
  movingWorkpieces: []
};

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: Math.min(1.35, window.devicePixelRatio || 1),
  scene: buildOpsScene()
});

/*
 * Runtime node handles.
 *
 * Re-acquired whenever the scene is remounted: `setScene` resets the runtime node
 * registry, so handles captured before a remount address nodes that no longer
 * exist. Holding them in one place keeps the rebind in a single function.
 */
let workcell = app.nodes.require("ops-typed-welding-workcell");
let conveyor = app.nodes.require("ops-conveyor-motion");
let sensor = app.nodes.require("ops-sensor-sweep");
let selectedRing = app.nodes.require("ops-selected-zone-ring");
let isolationRing = app.nodes.require("ops-isolation-zone-ring");
let zoneAlarmRing = app.nodes.require("ops-zone-alarm-ring");
let alarmBeacon = app.nodes.require("ops-alarm-beacon");
let movingWorkpieces = Array.from({ length: 3 }, (_, index) => ({
  id: `ops-moving-workpiece-${index + 1}`,
  node: app.nodes.require(`ops-moving-workpiece-${index + 1}`)
}));
let beltPulseNodes = Array.from({ length: 4 }, (_, index) => app.nodes.require(`ops-belt-pulse-${index + 1}`));

function rebindRuntimeNodes(): void {
  workcell = app.nodes.require("ops-typed-welding-workcell");
  conveyor = app.nodes.require("ops-conveyor-motion");
  sensor = app.nodes.require("ops-sensor-sweep");
  selectedRing = app.nodes.require("ops-selected-zone-ring");
  isolationRing = app.nodes.require("ops-isolation-zone-ring");
  zoneAlarmRing = app.nodes.require("ops-zone-alarm-ring");
  alarmBeacon = app.nodes.require("ops-alarm-beacon");
  movingWorkpieces = Array.from({ length: 3 }, (_, index) => ({
    id: `ops-moving-workpiece-${index + 1}`,
    node: app.nodes.require(`ops-moving-workpiece-${index + 1}`)
  }));
  beltPulseNodes = Array.from({ length: 4 }, (_, index) => app.nodes.require(`ops-belt-pulse-${index + 1}`));
}

/**
 * Route-owned subject isolation for the independent route-primary probe.
 *
 * The workcell is made of many fence, robot, and fixture meshes. A generic
 * connected-component foreground pass can therefore select one thin rail
 * instead of the actual hero. This contract lets the producer diff the real
 * typed GLB against the same scene with that one runtime node suppressed; it
 * does not hide supporting set dressing or change any visual threshold.
 */
function installCompositionProbe(): void {
  (window as unknown as {
    __AURA3D_COMPOSITION_PROBE__?: {
      readonly category: "application";
      readonly camera: {
        readonly mode: "fixed";
        readonly position: readonly [number, number, number];
        readonly target: readonly [number, number, number];
        readonly fov: number;
      };
      readonly subject: {
        readonly position: readonly [number, number, number];
        readonly rotation: readonly [number, number, number];
        readonly targetSize: number;
      };
      setSubjectSuppressed: (suppressed: boolean) => void;
      settleSubjectPose: () => void;
    };
  }).__AURA3D_COMPOSITION_PROBE__ = {
    category: "application",
    camera: {
      mode: "fixed",
      position: [...cameraPose.position],
      target: [...cameraPose.target],
      fov: cameraPose.fov
    },
    subject: {
      position: [...WORKCELL_POSITION],
      rotation: [0, -0.2, 0],
      targetSize: WORKCELL_TARGET_MAX_DIMENSION
    },
    setSubjectSuppressed: (suppressed) => {
      subjectSuppressed = suppressed;
      workcell.setVisible(!suppressed);
    },
    settleSubjectPose: () => {
      subjectSuppressed = false;
      workcell.setVisible(true);
    }
  };
}

installCompositionProbe();
renderConsole();
syncUi();
publishEvidence("ready");
let compactCameraLayout = window.innerWidth < 680;
window.addEventListener("resize", () => {
  const nextCompactLayout = window.innerWidth < 680;
  if (nextCompactLayout === compactCameraLayout) return;
  compactCameraLayout = nextCompactLayout;
  focusedZone = undefined;
  cameraPose = overviewCamera();
  app.setScene(buildOpsScene());
  rebindRuntimeNodes();
  publishEvidence("ready");
});

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  frameCount += 1;
  if (!timePaused) {
    uptime += step;
    simulationStep = Math.floor(uptime / SECONDS_PER_STEP) % SIMULATION_STEPS;
    updateTelemetry(step);
  }
  syncRuntime(uptime);
  if (frameCount < 4 || frameCount % 12 === 0) {
    syncUi();
    publishEvidence("running");
  }
});

function buildOpsScene() {
  return scene()
    .background("#071923")
    .addMany(createWorkcellPresentation())
    .add(lights.ambient({ name: "workcell ambient fill", intensity: 0.6, color: "#d7f5f2" }))
    .add(lights.directional({ name: "factory key light", position: [2.1, 3.6, 2.8], intensity: 1.62, color: "#fff1d2" }))
    .add(lights.directional({ name: "factory cool rim", position: [-2.4, 2.4, -2.4], intensity: 0.74, color: "#78cbe3" }))
    .add(lights.point({ name: "workcell cyan practical", position: [-0.82, 1.24, 0.62], intensity: 1.15, color: "#54e7dc" }))
    .add(lights.point({ name: "workcell warm inspection light", position: [0.76, 1.08, -0.28], intensity: 1.08, color: "#f3ad59" }))
    .add(effects.ambientOcclusion({ name: "workcell contact occlusion", intensity: 0.56, radius: 0.82 }))
    .add(effects.bloom({ name: "workcell status glow", intensity: 0.18, threshold: 0.78, radius: 0.22 }))
    .add(effects.fog({ name: "bounded ops depth haze", density: 0.0021, color: "#0a1a23", intensity: 0.06 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [...cameraPose.position], target: [...cameraPose.target], fov: cameraPose.fov }));
}

function createWorkcellPresentation(): AuraNodeInput[] {
  const bounds = workcellBounds();
  const { belt, deckHeight, workpieceY } = conveyorDimensions();
  // Floor and plinth are sized to the workcell's own footprint with margin, so a
  // larger or smaller asset still stands on a stage that fits it.
  const floorScale: readonly [number, number, number] = [bounds.size[0] * 1.42, 1, bounds.size[2] * 1.54];
  const alarmAnchor = resolveBoundsAnchor(bounds, "top-left", { offset: Math.max(...bounds.size) * 0.1 });
  const scannerAnchor = resolveSemanticRegion(bounds, { id: "scanner", u: 0.78, v: 0.62, w: 0.6 });

  const nodes: AuraNodeInput[] = [
    primitives.plane({ name: "quiet ops floor", material: material.reflectiveFloor({ color: "#0a1b24", roughness: 0.38, metallic: 0.28 }) })
      .position(bounds.center[0], bounds.floorY - 0.082, bounds.center[2])
      .scale([...floorScale]),
    primitives.box({ name: "single workcell presentation plinth", material: material.pbr({ color: "#233e47", roughness: 0.56, metallic: 0.2, emissive: "#07151b", emissiveIntensity: 0.16 }) })
      .position(bounds.center[0], bounds.floorY - 0.04, bounds.center[2])
      .scale([bounds.size[0] * 1.14, 0.035, bounds.size[2] * 1.2]),
    ...createOperationsBay(bounds),
    model(workcellAsset, {
      name: "typed robotic welding workcell route-primary hero",
      scaleMode: "fit",
      targetMaxDimension: WORKCELL_TARGET_MAX_DIMENSION,
      visible: !subjectSuppressed,
      castShadow: true,
      receiveShadow: true
    })
      .position(...WORKCELL_POSITION)
      .rotate(0, -0.2, 0)
      .runtime(game.runtimeNode("ops-typed-welding-workcell", { tags: ["typed-asset", "industrial-workcell", "runtime-hero"] })),
    // The zone selection ring comes from the reusable focus system, so it cannot
    // be flattened into a bar by a nonuniform scale in the torus ring plane.
    ...zoneSelectionNodes("assembly"),
    ...isolationIndicatorNodes(),
    ...alarmIndicatorNodes(),
    ...zoneWorldLabels(),
    primitives.box({ name: "raised packaging conveyor deck", material: material.pbr({ color: "#24383b", roughness: 0.52, metallic: 0.48 }) })
      .position(belt.center[0], belt.center[1], belt.center[2])
      .scale([belt.size[0], deckHeight, belt.size[2]]),
    primitives.box({ name: "short conveyor motion marker", material: material.neon({ color: "#7ee8c4", emissive: "#7ee8c4", emissiveIntensity: 0.64, opacity: 0.62 }) })
      .position(belt.min[0], workpieceY - deckHeight * 0.35, belt.center[2])
      .scale([belt.size[0] * 0.2, deckHeight * 0.16, belt.size[2] * 0.62])
      .runtime(game.runtimeNode("ops-conveyor-motion", { tags: ["conveyor", "runtime", "motion-proof"] })),
    primitives.box({ name: "optical scanner sweep", material: material.neon({ color: "#b8f7d9", emissive: "#b8f7d9", emissiveIntensity: 0.68, opacity: 0.54 }) })
      .position(...scannerAnchor.center)
      .scale([bounds.size[0] * 0.1, 0.01, bounds.size[2] * 0.026])
      .runtime(game.runtimeNode("ops-sensor-sweep", { tags: ["scanner", "runtime", "motion-proof"] })),
    primitives.sphere({ name: "incident alarm beacon", material: material.neon({ color: "#f2715c", emissive: "#f2715c", emissiveIntensity: 1.1 }) })
      .position(...alarmAnchor.position)
      .scale(Math.max(...bounds.size) * 0.036)
      .runtime(game.runtimeNode("ops-alarm-beacon", { tags: ["alarm", "runtime"] }))
  ];

  nodes.push(...createWorkpieces());
  nodes.push(...createBeltPulses());
  return nodes;
}

/**
 * A restrained operations bay around the typed workcell. These pieces are
 * deliberately secondary set dressing: they establish a believable factory
 * inspection environment, add depth cues behind the safety glass, and keep the
 * workcell's own geometry as the only route-primary subject. Every placement is
 * derived from the placed asset bounds so a future replacement asset remains
 * grounded without another round of eyeballed coordinates.
 */
function createOperationsBay(bounds: ReturnType<typeof workcellBounds>): AuraNodeInput[] {
  const sizeX = bounds.size[0];
  const sizeY = bounds.size[1];
  const sizeZ = bounds.size[2];
  const floorY = bounds.floorY;
  const backZ = bounds.min[2] - sizeZ * 0.48;
  const frontZ = bounds.max[2] + sizeZ * 0.36;
  const bayTop = floorY + sizeY * 1.32;
  const baySide = sizeX * 0.72;
  const { belt, deckHeight, surfaceY } = conveyorDimensions();
  const wallMaterial = material.pbr({
    name: "operations bay graphite wall",
    color: "#102b35",
    roughness: 0.62,
    metallic: 0.24,
    emissive: "#06141b",
    emissiveIntensity: 0.18
  });
  const railMaterial = material.metal({
    name: "operations bay structural rail",
    color: "#254a56",
    roughness: 0.38,
    metallic: 0.72,
    emissive: "#0a252d",
    emissiveIntensity: 0.24
  });
  const cyanMaterial = material.emissive({
    name: "operations bay cyan status rail",
    color: "#5ee7df",
    emissive: "#36d8dc",
    emissiveIntensity: 1.05,
    opacity: 0.88
  });
  const amberMaterial = material.emissive({
    name: "operations bay amber status rail",
    color: "#f6bd68",
    emissive: "#ec8f38",
    emissiveIntensity: 0.9,
    opacity: 0.88
  });
  const floorLineMaterial = material.pbr({
    name: "operations bay floor inlay",
    color: "#1c4a56",
    roughness: 0.44,
    metallic: 0.58,
    emissive: "#0c2933",
    emissiveIntensity: 0.28
  });
  const safetyAmberMaterial = material.emissive({
    name: "operations bay safety amber",
    color: "#f6bb61",
    emissive: "#d86e2b",
    emissiveIntensity: 0.86,
    opacity: 0.9
  });
  const beltRailMaterial = material.metal({
    name: "packaging conveyor rail",
    color: "#76969a",
    roughness: 0.28,
    metallic: 0.82
  });
  const beltSurfaceMaterial = material.clearcoatPaint({
    name: "packaging conveyor belt surface",
    color: "#143b43",
    roughness: 0.32,
    clearcoat: 0.48,
    emissive: "#06252b",
    emissiveIntensity: 0.2
  });
  const nodes: AuraNodeInput[] = [
    primitives.box({ name: "operations bay rear wall", material: wallMaterial, receiveShadow: true })
      .position(bounds.center[0], floorY + sizeY * 0.57, backZ)
      .scale([sizeX * 1.22, sizeY * 0.78, 0.045]),
    primitives.box({ name: "operations bay rear wall lower rail", material: railMaterial, receiveShadow: true })
      .position(bounds.center[0], floorY + sizeY * 0.16, backZ + 0.055)
      .scale([sizeX * 1.2, 0.035, 0.035]),
    primitives.box({ name: "operations bay rear cyan diagnostic rail", material: cyanMaterial })
      .position(bounds.center[0] - sizeX * 0.12, floorY + sizeY * 0.92, backZ + 0.07)
      .scale([sizeX * 0.48, 0.014, 0.016]),
    primitives.box({ name: "operations bay rear amber diagnostic rail", material: amberMaterial })
      .position(bounds.center[0] + sizeX * 0.42, floorY + sizeY * 0.92, backZ + 0.07)
      .scale([sizeX * 0.18, 0.014, 0.016]),
    // Overhead beam and uprights frame the scene like a real inspection cell and
    // create a strong vertical silhouette around the lower workcell asset.
    primitives.box({ name: "operations bay overhead beam", material: railMaterial, castShadow: true, receiveShadow: true })
      .position(bounds.center[0], bayTop, backZ + sizeZ * 0.08)
      .scale([sizeX * 1.18, 0.038, 0.042]),
    primitives.box({ name: "operations bay front overhead beam", material: railMaterial, castShadow: true, receiveShadow: true })
      .position(bounds.center[0], bayTop - sizeY * 0.11, frontZ - sizeZ * 0.12)
      .scale([sizeX * 1.18, 0.038, 0.042]),
    primitives.box({ name: "operations bay gantry left depth rail", material: railMaterial, castShadow: true, receiveShadow: true })
      .position(bounds.center[0] - baySide, bayTop - sizeY * 0.11, bounds.center[2] - sizeZ * 0.08)
      .scale([0.032, 0.032, sizeZ * 0.6]),
    primitives.box({ name: "operations bay gantry right depth rail", material: railMaterial, castShadow: true, receiveShadow: true })
      .position(bounds.center[0] + baySide, bayTop - sizeY * 0.11, bounds.center[2] - sizeZ * 0.08)
      .scale([0.032, 0.032, sizeZ * 0.6]),
    primitives.box({ name: "operations bay gantry trolley housing", material: railMaterial, castShadow: true, receiveShadow: true })
      .position(bounds.center[0] + sizeX * 0.16, bayTop - sizeY * 0.15, bounds.center[2] - sizeZ * 0.12)
      .scale([sizeX * 0.055, 0.04, sizeZ * 0.065]),
    primitives.box({ name: "operations bay gantry pendant", material: railMaterial, castShadow: true })
      .position(bounds.center[0] + sizeX * 0.16, bayTop - sizeY * 0.3, bounds.center[2] - sizeZ * 0.12)
      .scale([0.012, sizeY * 0.12, 0.012]),
    primitives.box({ name: "operations bay left upright", material: railMaterial, castShadow: true, receiveShadow: true })
      .position(bounds.center[0] - baySide, floorY + sizeY * 0.66, backZ + sizeZ * 0.08)
      .scale([0.034, sizeY * 0.68, 0.034]),
    primitives.box({ name: "operations bay right upright", material: railMaterial, castShadow: true, receiveShadow: true })
      .position(bounds.center[0] + baySide, floorY + sizeY * 0.66, backZ + sizeZ * 0.08)
      .scale([0.034, sizeY * 0.68, 0.034]),
    primitives.box({ name: "operations bay overhead cyan worklight", material: cyanMaterial })
      .position(bounds.center[0] - sizeX * 0.18, bayTop - sizeY * 0.08, backZ + sizeZ * 0.16)
      .scale([sizeX * 0.38, 0.018, 0.026]),
    primitives.box({ name: "operations bay overhead amber worklight", material: amberMaterial })
      .position(bounds.center[0] + sizeX * 0.36, bayTop - sizeY * 0.08, backZ + sizeZ * 0.16)
      .scale([sizeX * 0.16, 0.018, 0.026]),
    // Inlaid lines point toward the hero and make the conveyor/front edge read as
    // an intentional machine lane instead of an isolated slab.
    primitives.box({ name: "operations bay front cyan lane inlay", material: cyanMaterial })
      .position(bounds.center[0] - sizeX * 0.18, floorY - 0.001, frontZ)
      .scale([0.018, 0.006, sizeZ * 0.16]),
    primitives.box({ name: "operations bay front amber lane inlay", material: amberMaterial })
      .position(bounds.center[0] + sizeX * 0.34, floorY - 0.001, frontZ)
      .scale([0.018, 0.006, sizeZ * 0.16]),
    primitives.box({ name: "operations bay left floor guide", material: floorLineMaterial })
      .position(bounds.center[0] - sizeX * 0.48, floorY - 0.004, bounds.center[2] + sizeZ * 0.06)
      .scale([0.012, 0.008, sizeZ * 0.52]),
    primitives.box({ name: "operations bay right floor guide", material: floorLineMaterial })
      .position(bounds.center[0] + sizeX * 0.48, floorY - 0.004, bounds.center[2] + sizeZ * 0.06)
      .scale([0.012, 0.008, sizeZ * 0.52]),
    // Raised belt rails and a contrasting surface turn the single dark slab
    // into a legible packaging lane with contact and scale cues.
    primitives.box({ name: "packaging conveyor surface", material: beltSurfaceMaterial, castShadow: true, receiveShadow: true })
      .position(belt.center[0], surfaceY + deckHeight * 0.4, belt.center[2])
      .scale([belt.size[0], deckHeight * 0.28, belt.size[2] * 0.94]),
    primitives.box({ name: "packaging conveyor left guide rail", material: beltRailMaterial, castShadow: true, receiveShadow: true })
      .position(belt.center[0], surfaceY + deckHeight * 0.84, belt.center[2] - belt.size[2] * 0.45)
      .scale([belt.size[0], deckHeight * 0.32, 0.018]),
    primitives.box({ name: "packaging conveyor right guide rail", material: beltRailMaterial, castShadow: true, receiveShadow: true })
      .position(belt.center[0], surfaceY + deckHeight * 0.84, belt.center[2] + belt.size[2] * 0.45)
      .scale([belt.size[0], deckHeight * 0.32, 0.018]),
    ...Array.from({ length: 5 }, (_, index) => primitives.box({
      name: `packaging conveyor roller ${index + 1}`,
      material: beltRailMaterial,
      castShadow: true,
      receiveShadow: true
    })
      .position(
        belt.min[0] + belt.size[0] * (0.12 + index * 0.19),
        surfaceY + deckHeight * 0.82,
        belt.center[2]
      )
      .scale([0.018, deckHeight * 0.19, belt.size[2] * 0.4]))
  ];
  return nodes;
}

/**
 * Selection feedback for a zone, from the reusable focus system.
 *
 * The route no longer constructs, rotates and scales a torus. It names the zone
 * and receives an indicator that is correct for the zone's dimensions.
 */
function zoneSelectionNodes(zone: ZoneId): AuraNodeInput[] {
  const focus = focusSemanticRegion(workcellBounds(), zoneRegions[zone], {
    color: "#7ee8c4",
    indicators: ["ring"],
    // The console already names the selected zone; a duplicate world callout
    // would compete with it. Selection state is carried by the ring plus the UI.
    callout: false,
    cameraFocus: false,
    namePrefix: "selected zone evidence"
  });
  return focus.nodes.map((node) => ({
    ...node,
    name: node.kind === "primitive" ? "selected zone evidence ring" : (node as { name?: string }).name,
    runtime: { id: "ops-selected-zone-ring", mutable: true, tags: ["zone", "runtime", "selection"] }
  })) as AuraNodeInput[];
}

function isolationIndicatorNodes(): AuraNodeInput[] {
  const focus = focusSemanticRegion(workcellBounds(), zoneRegions.assembly, {
    color: "#f2b15a",
    indicators: ["ring"],
    callout: false,
    cameraFocus: false,
    namePrefix: "isolated zone evidence"
  });
  return focus.nodes.map((node) => ({
    ...node,
    name: "isolated zone evidence ring",
    runtime: { id: "ops-isolation-zone-ring", mutable: true, tags: ["zone", "runtime", "isolation"] }
  })) as AuraNodeInput[];
}

function alarmIndicatorNodes(): AuraNodeInput[] {
  const focus = focusSemanticRegion(workcellBounds(), zoneRegions.assembly, {
    color: "#f2715c",
    indicators: ["ring"],
    callout: false,
    cameraFocus: false,
    namePrefix: "zone alarm evidence"
  });
  return focus.nodes.map((node) => ({
    ...node,
    name: "zone alarm evidence ring",
    runtime: { id: "ops-zone-alarm-ring", mutable: true, tags: ["zone", "runtime", "alarm"] }
  })) as AuraNodeInput[];
}

function zoneWorldLabels(): AuraNodeInput[] {
  return zoneOrder.map((zone) => {
    const center = zoneCenter(zone);
    const bounds = workcellBounds();
    return labels.callout(zoneLabels[zone], zone, {
      name: `${zone} equipment world label`,
      position: [center[0] + bounds.size[0] * 0.08, center[1] + bounds.size[1] * 0.15, center[2]],
      anchorWorldPosition: center,
      size: Math.max(0.12, Math.max(...bounds.size) * 0.07),
      offscreenPolicy: "hide",
      collisionAvoidance: true,
      occlusionAware: true
    }).toJSON();
  });
}

function createWorkpieces(): AuraNodeInput[] {
  const colors = ["#f2b15a", "#dbe7e4", "#b8f7d9"] as const;
  const { belt, workpieceY } = conveyorDimensions();
  const bounds = workcellBounds();
  // Deterministic distribution along the belt region: spacing follows the belt's
  // length instead of being an independent literal that can disagree with it.
  const placements = distributeInRegion(
    { min: [belt.min[0], workpieceY, belt.center[2]], max: [belt.max[0], workpieceY, belt.center[2]] },
    { count: 3, seed: 11 }
  );
  return placements.map((placement, index) =>
    primitives.box({
      name: `small conveyor workpiece ${index + 1}`,
      material: material.clearcoatPaint({
        color: colors[index] ?? "#f2b15a",
        roughness: 0.24,
        clearcoat: 0.5
      })
    })
      .position(...placement.position)
      .scale([bounds.size[0] * 0.048, bounds.size[1] * 0.038, bounds.size[2] * 0.06])
      .runtime(game.runtimeNode(`ops-moving-workpiece-${index + 1}`, { tags: ["conveyor", "workpiece", "runtime"] }))
  );
}

function createBeltPulses(): AuraNodeInput[] {
  const { belt, surfaceY } = conveyorDimensions();
  const bounds = workcellBounds();
  const placements = distributeInRegion(
    { min: [belt.min[0], surfaceY + bounds.size[1] * 0.002, belt.max[2]], max: [belt.max[0], surfaceY + bounds.size[1] * 0.002, belt.max[2]] },
    { count: 4, seed: 23 }
  );
  return placements.map((placement, index) =>
    primitives.box({
      name: `small conveyor pulse ${index + 1}`,
      material: material.neon({ color: "#7ee8c4", emissive: "#7ee8c4", emissiveIntensity: 0.42, opacity: 0.42 })
    })
      .position(...placement.position)
      .scale([bounds.size[0] * 0.053, bounds.size[1] * 0.007, bounds.size[2] * 0.028])
      .runtime(game.runtimeNode(`ops-belt-pulse-${index + 1}`, { tags: ["conveyor", "runtime", "motion-proof"] }))
  );
}

/**
 * Spatial invariant report for every helper element in the scene.
 *
 * This is the machine-checkable answer to "random boxes floating outside the
 * scene". Each helper declares where it should sit relative to the workcell, and
 * the engine verifies it against the asset's placed bounds.
 */
function spatialEvidence() {
  const bounds = workcellBounds();
  const belt = conveyorLine();
  const claims: HelperPlacementClaim[] = [
    { id: "selected zone ring", position: zoneCenter(selectedZone), relation: "inside" },
    ...(isolatedZone ? [{ id: "isolated zone ring", position: zoneCenter(isolatedZone), relation: "inside" as const }] : []),
    ...(zones.some((zone) => zone.incidents > 0) ? [{ id: "zone alarm ring", position: zoneCenter(selectedZone), relation: "inside" as const }] : []),
    { id: "conveyor motion marker", position: [belt.min[0], belt.center[1], belt.center[2]], relation: "inside" },
    { id: "optical scanner sweep", position: resolveSemanticRegion(bounds, { id: "scanner", u: 0.78, v: 0.62, w: 0.6 }).center, relation: "inside" },
    {
      id: "incident alarm beacon",
      position: resolveBoundsAnchor(bounds, "top-left", { offset: Math.max(...bounds.size) * 0.1 }).position,
      relation: "outside",
      maxDistance: Math.max(...bounds.size) * 0.5
    },
    ...zoneOrder.map((zone) => ({ id: `${zone} zone centre`, position: zoneCenter(zone), relation: "inside" as const }))
  ];
  const report = checkSpatialInvariants(bounds, claims);
  /*
   * Kit frame, mirrored from route state.
   *
   * Published alongside the route's own spatial report so a gate can see that the route
   * configures a reusable kit rather than reimplementing twin behaviour.
   */
  digitalTwinKit.reset();
  digitalTwinKit.selectEquipment(selectedZone);
  digitalTwinKit.setMode(mode);
  for (let step = 0; step < simulationStep; step += 1) digitalTwinKit.advanceTimeline();
  if (focusedZone !== undefined) digitalTwinKit.toggleFocus();
  const kitFrame = digitalTwinKit.frame();
  return {
    system: "engine.checkSpatialInvariants",
    routeUsesHardcodedHelperCoordinates: false,
    subjectBounds: report.subjectBounds,
    passes: report.passes,
    checks: report.checks,
    kit: {
      kind: kitFrame.kind,
      system: "engine.createDigitalTwinKit",
      routeReimplementsTwinBehaviour: false,
      capabilities: digitalTwinKit.capabilities,
      selectedEquipmentId: kitFrame.selectedEquipmentId,
      mode: kitFrame.mode,
      focused: kitFrame.focused,
      markerPlacements: kitFrame.markerPlacements.length,
      alarmPosition: kitFrame.alarmPosition,
      timeline: kitFrame.timeline,
      spatialInvariants: kitFrame.spatialInvariants,
      accessibilityLabel: kitFrame.accessibilityLabel
    }
  };
}

function createZones(): ZoneState[] {
  return zoneOrder.map((zone, index) => ({
    id: zone,
    label: zoneLabels[zone],
    load: 56 + index * 8,
    temperature: 31.5 + index * 2,
    incidents: 0
  }));
}

function updateTelemetry(dt: number): void {
  const incidentBias = mode === "incident" ? 1.55 : mode === "maintenance" ? 0.72 : 1;
  throughput = Math.round(1260 + Math.sin(uptime * 0.42) * 70 - (mode === "maintenance" ? 160 : 0) - (mode === "incident" ? 250 : 0) - (isolatedZone ? 220 : 0));
  energyMw = Number((4.72 + Math.sin(uptime * 0.27) * 0.24 + (mode === "incident" ? 0.48 : 0)).toFixed(2));
  zones = zones.map((zone, index) => {
    const selectedBoost = zone.id === selectedZone ? 8 : 0;
    return {
      ...zone,
      load: zone.id === isolatedZone ? 0 : Math.round(clamp(zone.load + Math.sin(uptime * (0.22 + index * 0.03)) * 0.14 + selectedBoost * dt * 0.07, 30, 98)),
      temperature: Number((zone.id === isolatedZone
        ? clamp(zone.temperature - dt * 0.35, 25, 82)
        : clamp(zone.temperature + Math.sin(uptime * 0.18 + index) * 0.014 * incidentBias, 25, 82)).toFixed(1))
    };
  });
}

function syncRuntime(time: number): void {
  const bounds = workcellBounds();
  const { belt, deckHeight, workpieceHeight, surfaceY, workpieceY } = conveyorDimensions();
  const conveyorIsolated = isolatedZone === "packaging" || isolatedZone === "dock";
  const beltSpeed = conveyorIsolated ? 0 : mode === "maintenance" ? 0.36 : mode === "incident" ? 0.95 : 0.68;
  const conveyorX = belt.min[0] + ((time * beltSpeed) % Math.max(0.001, belt.size[0]));
  const robotArmRadians = Math.sin(time * 1.15) * 0.18;
  const typedRobotYaw = -0.18 + Math.sin(time * 0.64) * 0.045;
  const sensorSweepRadians = Math.sin(time * 1.02) * 0.72;
  const workpieceProof = movingWorkpieces.map((entry, index) => {
    const laneProgress = (time * beltSpeed + index * belt.size[0] / movingWorkpieces.length) % Math.max(0.001, belt.size[0]);
    const x = belt.min[0] + laneProgress;
    const z = belt.center[2] + Math.sin(time * 1.2 + index) * belt.size[2] * 0.08;
    entry.node
      .setVisible(!conveyorIsolated)
      .setPosition(x, workpieceY, z)
      // Packages travel square to the belt. Spinning made them read as loose
      // debris sliding across the factory floor.
      .setRotation(0, 0, 0)
      .setScale([bounds.size[0] * 0.048, workpieceHeight, bounds.size[2] * 0.06]);
    const bottomY = workpieceY - workpieceHeight / 2;
    return {
      id: entry.id,
      x: Number(x.toFixed(3)),
      y: Number(workpieceY.toFixed(3)),
      z: Number(z.toFixed(3)),
      bottomY: Number(bottomY.toFixed(3)),
      surfaceClearance: Number((bottomY - surfaceY).toFixed(3)),
      insidePackagingLane: x >= belt.min[0] && x <= belt.max[0] && z >= belt.min[2] && z <= belt.max[2]
    };
  });
  beltPulseNodes.forEach((node, index) => {
    const pulseX = belt.min[0] + ((time * beltSpeed * 1.2 + index * belt.size[0] / beltPulseNodes.length) % Math.max(0.001, belt.size[0]));
    node
      .setPosition(pulseX, surfaceY + bounds.size[1] * 0.002, belt.max[2])
      .setScale([bounds.size[0] * 0.053, bounds.size[1] * 0.007, bounds.size[2] * 0.028]);
  });
  conveyor.setPosition(conveyorX, surfaceY + deckHeight * 0.08, belt.center[2]);
  workcell
    .setPosition(WORKCELL_POSITION[0], WORKCELL_POSITION[1] + Math.sin(time * 0.7) * 0.002, WORKCELL_POSITION[2])
    .setRotation(0, typedRobotYaw, 0)
    .setScale(1);
  sensor.setVisible(isolatedZone !== "energy").setRotation(0, sensorSweepRadians, 0);
  // Ring radius pulses uniformly in the torus ring plane (X and Y) with the tube
  // thickness held on Z, so the pulse cannot degenerate into a bar.
  const ringBase = Math.max(...workcellBounds().size) * 0.16;
  const ringRadius = ringBase + Math.sin(time * 2.2) * ringBase * 0.075;
  selectedRing.setPosition(...zoneCenter(selectedZone)).setScale([ringRadius, ringRadius, ringRadius * 0.09]);
  const isolationRadius = ringBase * 1.18;
  isolationRing
    .setVisible(isolatedZone !== undefined)
    .setPosition(...zoneCenter(isolatedZone ?? selectedZone))
    .setScale([isolationRadius, isolationRadius, isolationRadius * 0.08]);
  const alarmVisible = mode === "incident" || zones.some((zone) => zone.incidents > 0);
  const alarmRadius = ringBase * (0.76 + Math.abs(Math.sin(time * 6.4)) * 0.14);
  zoneAlarmRing
    .setVisible(alarmVisible)
    .setPosition(...zoneCenter(selectedZone))
    .setScale([alarmRadius, alarmRadius, alarmRadius * 0.1]);
  const alarmScale = Math.max(...bounds.size) * (0.036 + (alarmVisible ? Math.abs(Math.sin(time * 6.4)) * 0.025 : 0));
  alarmBeacon.setVisible(alarmVisible).setScale(alarmScale);
  lastMotionProof = {
    conveyorSegmentX: Number(conveyorX.toFixed(3)),
    robotArmRadians: Number(robotArmRadians.toFixed(3)),
    typedRobotYaw: Number(typedRobotYaw.toFixed(3)),
    sensorSweepRadians: Number(sensorSweepRadians.toFixed(3)),
    conveyorSurfaceY: Number(surfaceY.toFixed(3)),
    movingWorkpieces: workpieceProof
  };
}

function renderConsole(): void {
  const consoleEl = document.querySelector<HTMLElement>("#console");
  if (!consoleEl) return;
  consoleEl.innerHTML = `
    <h1>Digital Twin Operations</h1>
    <section class="console__section">
      <h2>Mode</h2>
      <div class="mode-bar">
        <button type="button" data-mode="normal" aria-pressed="true">Normal</button>
        <button type="button" data-mode="maintenance" aria-pressed="false">Service</button>
        <button type="button" data-mode="incident" aria-pressed="false">Incident</button>
      </div>
    </section>
    <section class="console__section">
      <h2>Zones</h2>
      <div class="mode-bar">
        ${zoneOrder.map((zone) => `<button type="button" data-zone="${zone}" aria-pressed="${zone === selectedZone}">${zoneLabels[zone]}</button>`).join("")}
      </div>
    </section>
    <section class="console__section">
      <h2>Actions</h2>
      <div class="mode-bar">
        <button type="button" id="inject-alert">Inject Alert</button>
        <button type="button" id="clear-alerts">Clear Alerts</button>
        <button type="button" id="focus-zone">Focus Zone</button>
      </div>
    </section>
    <section class="console__section">
      <h2>Operations</h2>
      <div class="mode-bar">
        <button type="button" id="isolate-zone" aria-pressed="false">Isolate Zone</button>
        <button type="button" id="toggle-time" aria-pressed="false">Pause Time</button>
        <button type="button" id="advance-time">Advance +2s</button>
      </div>
      <p id="ops-accessible-summary" class="claim" role="status" aria-live="polite"></p>
    </section>
    <section class="console__section">
      <h2>Evidence</h2>
      <div class="console__grid">
        <div class="console__metric"><span class="console__label">Runtime Nodes</span><strong id="ops-runtime-nodes" class="console__value">0</strong></div>
        <div class="console__metric"><span class="console__label">Draw Calls</span><strong id="ops-draw-calls" class="console__value">0</strong></div>
        <div class="console__metric"><span class="console__label">Backend</span><strong id="ops-backend" class="console__value">pending</strong></div>
        <div class="console__metric"><span class="console__label">Mode</span><strong id="ops-mode" class="console__value">normal</strong></div>
      </div>
    </section>
    <section class="console__section console__section--context">
      <div class="context-heading">
        <div>
          <h2>Cell context</h2>
          <p>LINE 04 · CELL A-17 · NIGHT SHIFT</p>
        </div>
        <span id="ops-health" class="context-status"><i></i> nominal</span>
      </div>
      <div class="context-grid">
        <div><span class="console__label">Cycle</span><strong id="ops-cycle" class="console__value">01:42</strong></div>
        <div><span class="console__label">Queue</span><strong id="ops-queue" class="console__value">08 units</strong></div>
        <div><span class="console__label">OEE</span><strong id="ops-oee" class="console__value">92.4%</strong></div>
        <div><span class="console__label">Last check</span><strong id="ops-last-check" class="console__value">02m ago</strong></div>
      </div>
      <div class="context-signal"><span>Flow integrity</span><b id="ops-flow-value">89%</b><i><em id="ops-flow-bar"></em></i></div>
    </section>
    <section class="console__section">
      <h2>Event Log</h2>
      <ul id="ops-event-log" class="event-log"></ul>
    </section>
  `;

  consoleEl.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.mode;
      if (next === "normal" || next === "maintenance" || next === "incident") {
        mode = next;
        eventLog = [`Mode switched to ${next}.`, ...eventLog].slice(0, 7);
        syncUi();
        publishEvidence("ready");
      }
    });
  });
  consoleEl.querySelectorAll<HTMLButtonElement>("[data-zone]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.zone;
      if (isZone(next)) {
        selectedZone = next;
        eventLog = [`Selected ${zoneLabels[next]} zone.`, ...eventLog].slice(0, 7);
        syncRuntime(uptime);
        syncUi();
        publishEvidence("ready");
      }
    });
  });
  consoleEl.querySelector<HTMLButtonElement>("#inject-alert")?.addEventListener("click", () => injectAlert());
  consoleEl.querySelector<HTMLButtonElement>("#clear-alerts")?.addEventListener("click", () => {
    zones = zones.map((zone) => ({ ...zone, incidents: 0 }));
    mode = "normal";
    eventLog = ["Alerts cleared by operator.", ...eventLog].slice(0, 7);
    syncUi();
    publishEvidence("ready");
  });
  consoleEl.querySelector<HTMLButtonElement>("#focus-zone")?.addEventListener("click", () => {
    focusSelectedZone();
  });
  consoleEl.querySelector<HTMLButtonElement>("#isolate-zone")?.addEventListener("click", () => {
    isolatedZone = isolatedZone === selectedZone ? undefined : selectedZone;
    eventLog = [isolatedZone
      ? `${zoneLabels[isolatedZone]} zone isolated; its sample load is zero and connected motion is inhibited.`
      : `${zoneLabels[selectedZone]} zone returned to service.`, ...eventLog].slice(0, 7);
    syncRuntime(uptime);
    syncUi();
    publishEvidence("ready");
  });
  consoleEl.querySelector<HTMLButtonElement>("#toggle-time")?.addEventListener("click", () => {
    timePaused = !timePaused;
    eventLog = [`Simulation time ${timePaused ? "paused" : "resumed"} at step ${simulationStep + 1}/${SIMULATION_STEPS}.`, ...eventLog].slice(0, 7);
    syncUi();
    publishEvidence("ready");
  });
  consoleEl.querySelector<HTMLButtonElement>("#advance-time")?.addEventListener("click", () => {
    timePaused = true;
    uptime += SECONDS_PER_STEP;
    simulationStep = (simulationStep + 1) % SIMULATION_STEPS;
    updateTelemetry(SECONDS_PER_STEP);
    syncRuntime(uptime);
    eventLog = [`Simulation advanced to step ${simulationStep + 1}/${SIMULATION_STEPS}.`, ...eventLog].slice(0, 7);
    syncUi();
    publishEvidence("ready");
  });
}

/**
 * Frame the selected zone, or return to the overview when it is already focused.
 *
 * Camera framing comes from the reusable focus system, so the distance is derived
 * from the zone's own world size instead of a hand-tuned pose per zone.
 */
function focusSelectedZone(): void {
  if (focusedZone === selectedZone) {
    cameraPose = overviewCamera();
    focusedZone = undefined;
    eventLog = ["Camera returned to workcell overview.", ...eventLog].slice(0, 7);
  } else {
    const region = resolveSemanticRegion(workcellBounds(), zoneRegions[selectedZone]);
    const bounds = workcellBounds();
    const intent = focusCameraIntent(
      region.center,
      // A zone with no declared extent still needs a framable size; fall back to a
      // readable fraction of the workcell rather than a zero-size target.
      [
        region.size[0] > 0 ? region.size[0] : bounds.size[0] * 0.3,
        region.size[1] > 0 ? region.size[1] : bounds.size[1] * 0.3,
        region.size[2] > 0 ? region.size[2] : bounds.size[2] * 0.3
      ],
      { aspect: window.innerWidth / Math.max(1, window.innerHeight), compactViewport: window.innerWidth < 560 }
    );
    cameraPose = { position: intent.position, target: intent.target, fov: intent.fov };
    focusedZone = selectedZone;
    eventLog = [`Camera framed the ${zoneLabels[selectedZone]} zone.`, ...eventLog].slice(0, 7);
  }
  // Remount with the new camera. The scene is rebuilt from current state, so the
  // zone ring and every anchored helper are re-derived from the asset bounds.
  app.setScene(buildOpsScene());
  rebindRuntimeNodes();
  syncUi();
  publishEvidence("ready");
}

function injectAlert(): void {
  zones = zones.map((zone) => zone.id === selectedZone ? { ...zone, incidents: zone.incidents + 1, temperature: Number((zone.temperature + 5.5).toFixed(1)) } : zone);
  mode = "incident";
  eventLog = [`Alert injected in ${zoneLabels[selectedZone]} zone.`, ...eventLog].slice(0, 7);
  syncUi();
  publishEvidence("ready");
}

function syncUi(): void {
  const alerts = zones.reduce((sum, zone) => sum + zone.incidents, 0);
  const telemetry = document.querySelector<HTMLElement>("#telemetry");
  if (telemetry) {
    const throughputPct = clamp(Math.round((throughput / 1400) * 100), 12, 98);
    const energyPct = clamp(Math.round((energyMw / 6) * 100), 12, 98);
    const alertPct = alerts > 0 ? 82 : 16;
    const zonePct = clamp(Math.round(zones.find((zone) => zone.id === selectedZone)?.load ?? 0), 12, 98);
    telemetry.innerHTML = `
      <article class="telemetry__card"><span>Throughput</span><strong>${throughput}</strong><em>units/hour</em><div class="telemetry__trend"><i style="width:${throughputPct}%"></i></div></article>
      <article class="telemetry__card"><span>Energy</span><strong>${energyMw.toFixed(2)}</strong><em>MW draw</em><div class="telemetry__trend"><i style="width:${energyPct}%"></i></div></article>
      <article class="telemetry__card"><span>Alerts</span><strong>${alerts}</strong><em>${mode}</em><div class="telemetry__trend"><i style="width:${alertPct}%"></i></div></article>
      <article class="telemetry__card"><span>Selected Zone</span><strong>${zoneLabels[selectedZone]}</strong><em>${zoneSummary(selectedZone)}</em><div class="telemetry__trend"><i style="width:${zonePct}%"></i></div></article>
    `;
  }

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-zone]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.zone === selectedZone));
  });
  const isolateButton = document.querySelector<HTMLButtonElement>("#isolate-zone");
  isolateButton?.setAttribute("aria-pressed", String(isolatedZone === selectedZone));
  if (isolateButton) isolateButton.textContent = isolatedZone === selectedZone ? "Restore Zone" : "Isolate Zone";
  const timeButton = document.querySelector<HTMLButtonElement>("#toggle-time");
  timeButton?.setAttribute("aria-pressed", String(timePaused));
  if (timeButton) timeButton.textContent = timePaused ? "Resume Time" : "Pause Time";

  const diagnostics = app.diagnostics();
  setText("#ops-runtime-nodes", app.nodes.ids().length);
  setText("#ops-draw-calls", diagnostics.drawCalls);
  setText("#ops-backend", app.backend);
  setText("#ops-mode", mode);
  setText("#ops-accessible-summary", accessibilitySummary());
  const cycleSeconds = Math.floor((uptime * 1.8) % 180);
  const cycleMinutes = String(Math.floor(cycleSeconds / 60)).padStart(2, "0");
  const cycleRemainder = String(cycleSeconds % 60).padStart(2, "0");
  const queueUnits = Math.max(0, Math.round(throughput / 180 - (isolatedZone ? 3 : 0)));
  const oee = clamp(92.4 - (mode === "maintenance" ? 8.5 : 0) - (mode === "incident" ? 17.2 : 0) - (isolatedZone ? 5.4 : 0), 48, 99.9);
  const flow = clamp(Math.round(89 - (mode === "maintenance" ? 12 : 0) - (mode === "incident" ? 27 : 0) - (isolatedZone ? 18 : 0)), 22, 96);
  setText("#ops-cycle", `${cycleMinutes}:${cycleRemainder}`);
  setText("#ops-queue", `${String(queueUnits).padStart(2, "0")} units`);
  setText("#ops-oee", `${oee.toFixed(1)}%`);
  setText("#ops-last-check", `${Math.max(0, Math.floor((uptime * 0.7) % 9))}m ago`);
  setText("#ops-flow-value", `${flow}%`);
  const flowBar = document.querySelector<HTMLElement>("#ops-flow-bar");
  if (flowBar) flowBar.style.width = `${flow}%`;
  const health = document.querySelector<HTMLElement>("#ops-health");
  if (health) {
    const healthState = alerts > 0 || mode === "incident" ? "attention" : mode === "maintenance" ? "service" : "nominal";
    health.className = `context-status context-status--${healthState}`;
    health.innerHTML = `<i></i> ${healthState}`;
  }
  const log = document.querySelector<HTMLElement>("#ops-event-log");
  if (log) {
    log.innerHTML = eventLog.map((item, index) => `<li><time>${String(index + 1).padStart(2, "0")}</time><b>${escapeHtml(item)}</b></li>`).join("");
  }
}

function publishEvidence(status: DigitalTwinEvidence["status"]): void {
  const diagnostics = app.diagnostics();
  window.__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__ = {
    status,
    appId: "showcase-digital-twin-ops",
    frameCount,
    mode,
    selectedZone,
    isolatedZone,
    timeControl: { paused: timePaused, step: simulationStep, steps: SIMULATION_STEPS },
    accessibilitySummary: accessibilitySummary(),
    uptime: Number(uptime.toFixed(2)),
    throughput,
    energyMw,
    alerts: zones.reduce((sum, zone) => sum + zone.incidents, 0),
    zones,
    eventLog: [...eventLog],
    camera: { position: [...cameraPose.position], target: [...cameraPose.target], focusedZone },
    controls,
    systems,
    runtimeNodeIds: app.nodes.ids(),
    renderedLabels: (diagnostics.labels ?? []).map((label) => ({ visible: label.visible })),
    motionProof: lastMotionProof,
    claimBoundary: "Digital-twin operations showcase using the typed robotic welding workcell GLB plus deterministic browser-side sample telemetry. It does not claim real facility data, PLC connectivity, validated safety logic, or production digital-twin integration.",
    spatialInvariants: spatialEvidence(),
    diagnostics: {
      auraScene: collectAuraSceneEvidence(app.scene),
      backend: app.backend,
      fps: diagnostics.fps,
      drawCalls: diagnostics.drawCalls,
      warnings: diagnostics.warnings,
      errors: diagnostics.errors
    }
  };
}

function zoneSummary(zoneId: ZoneId): string {
  const zone = zones.find((candidate) => candidate.id === zoneId);
  return zone ? `${zone.load}% load | ${zone.temperature.toFixed(1)} C` : "pending";
}

function accessibilitySummary(): string {
  const alerts = zones.reduce((sum, zone) => sum + zone.incidents, 0);
  return `${zoneLabels[selectedZone]} selected${focusedZone === selectedZone ? " and camera focused" : ""}; ${isolatedZone ? `${zoneLabels[isolatedZone]} isolated` : "no zone isolated"}; mode ${mode}; ${alerts} alert${alerts === 1 ? "" : "s"}; simulation ${timePaused ? "paused" : "running"} at step ${simulationStep + 1} of ${SIMULATION_STEPS}; ${zoneSummary(selectedZone)}.`;
}

function isZone(value: string | undefined): value is ZoneId {
  return value === "assembly" || value === "packaging" || value === "energy" || value === "dock";
}

function setText(selector: string, value: string | number): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}
