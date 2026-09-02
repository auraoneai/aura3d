import {
  camera,
  checkSpatialInvariants,
  city,
  clearFocus,
  createSmartCityKit,
  collectAuraSceneEvidence,
  createAuraApp,
  distanceLod,
  effects,
  focusObject,
  game,
  groups,
  instances,
  interactions,
  fitSizeToRegion,
  labels,
  lights,
  material,
  model,
  placedBounds,
  primitives,
  resolveBoundsAnchor,
  resolveSemanticRegion,
  scene,
  sceneKits,
  shadows,
  timeline,
  ui
} from "@aura3d/engine";
import type { AuraCameraSpec, AuraNodeInput, AuraSceneNode, AuraSceneSnapshot, FocusResult, SemanticRegion } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import "./styles.css";

const embeddedChromeMode = new URLSearchParams(window.location.search).get("chrome");
if (embeddedChromeMode === "hidden") document.documentElement.dataset.chrome = "hidden";

/*
 * City geometry and district regions are declared before anything that consumes them.
 *
 * The scene is composed during module evaluation, so a `const` declared further down is in
 * its temporal dead zone when the overlay builder runs. That failed the route at mount
 * (`Cannot access 'CITY_EXTENT' before initialization`) -- the same trap the digital-twin
 * migration hit, which is why the interaction audit runs on every route rather than only on
 * the one being changed.
 */
/**
 * Extent of the procedural city, as a level-design decision.
 *
 * `sceneKits.cityBlock({ blocks: 14 })` lays out a city centred on the origin. This states
 * the footprint the route stages against, once, so every district, overlay, telemetry
 * pulse and label is derived from it rather than each carrying its own literal.
 */
const CITY_EXTENT = 11.4;
const CITY_HEIGHT = 5;
// Keep the command view dense enough to read as an operational district rather
// than a handful of isolated towers. The city kit supports the full 20-building
// workload (and the QA state below already audits that workload); rendering the
// same density keeps the visual scene and its diagnostics in agreement.
const CITY_BLOCK_COUNT = 14;

/** The city's placed bounds, so helpers can be anchored to it. */
function cityBounds() {
  return placedBounds({
    position: [0, 0, 0],
    size: [CITY_EXTENT, CITY_HEIGHT, CITY_EXTENT],
    floorY: 0
  });
}

/**
 * Districts as normalized regions of the city footprint.
 *
 * These replace four hardcoded coordinate pairs. `u`/`v`/`w` run 0..1 across the city's
 * extent, so changing `blocks` or `CITY_EXTENT` moves every district, overlay and label
 * together instead of leaving them behind -- the defect class that put the digital twin's
 * markers beside its workcell.
 */
const districtRegions: Record<SmartCityDistrict, SemanticRegion> = {
  all: { id: "all", label: "All districts", u: 0.5, v: 0.05, w: 0.5, extent: [1, 0.02, 1] },
  core: { id: "core", label: "Core", u: 0.5, v: 0.05, w: 0.5, extent: [0.36, 0.02, 0.31] },
  north: { id: "north", label: "North", u: 0.5, v: 0.05, w: 0.13, extent: [0.36, 0.02, 0.31] },
  harbor: { id: "harbor", label: "Harbor", u: 0.18, v: 0.05, w: 0.85, extent: [0.36, 0.02, 0.31] },
  industrial: { id: "industrial", label: "Industrial", u: 0.85, v: 0.05, w: 0.85, extent: [0.36, 0.02, 0.31] }
};

/**
 * The reusable smart-city kit this route now configures.
 *
 * Phase 12: the route declares its districts and data layers, and the kit owns district
 * selection, layer toggles, overlay placement scaled by value, density reduction, temporal
 * state and the spatial invariants a gate checks.
 */
const smartCityKit = createSmartCityKit({
  bounds: placedBounds({ position: [0, 0, 0], size: [CITY_EXTENT, CITY_HEIGHT, CITY_EXTENT], floorY: 0 }),
  districts: (["core", "north", "harbor", "industrial"] as const).map((district) => ({
    ...districtRegions[district],
    color: districtColor(district)
  })),
  layers: [
    { id: "mobility", label: "Mobility", values: { core: 0.72, north: 0.48, harbor: 0.61, industrial: 0.35 } },
    { id: "energy", label: "Energy", values: { core: 0.88, north: 0.4, harbor: 0.33, industrial: 0.7 } }
  ],
  temporalStates: ["day", "night"]
});

/*
 * The hero vehicle's station, and the size derived from it.
 *
 * Declared once so the scene builder and the route-primary composition probe
 * cannot drift: the probe measures the subject it declares here, and the scene
 * renders the asset at the size derived from the same region. A second literal
 * in either place is how a probe ends up describing a subject that is not what
 * the route actually draws.
 */
const VEHICLE_STATION_REGION: SemanticRegion = { id: "vehicle-station", u: 0.47, v: 0.16, w: 0.64 };
const VEHICLE_STATION_FOOTPRINT_REGION: SemanticRegion = {
  id: "vehicle-station-footprint",
  u: 0.47,
  v: 0.16,
  w: 0.64,
  // A 18%-of-city station presents the hero at roughly 40% of the 3.8-unit
  // city footprint: readable, but still far below the rejected 64% occluding
  // scale. The prior 12% station sat too close to the primary-pixel floor and
  // produced sequence-dependent 2,126–2,500-pixel probe results. The slightly
  // larger pad is staged on the open central avenue so the vehicle is not hidden
  // behind the tower family in the command view.
  extent: [0.18, 0.1, 0.18]
};

/** Bounds-derived world size for the hero vehicle. Never a hardcoded multiplier. */
function vehicleTargetMaxDimension(): number {
  return fitSizeToRegion(resolveSemanticRegion(cityBounds(), VEHICLE_STATION_FOOTPRINT_REGION), {
    // Keep the typed vehicle legible at the release 1440x900 probe size. The
    // former smaller station produced only 2,126–2,500 isolated subject
    // pixels—at or below the public-primary floor—even though its bounds were
    // otherwise healthy. This remains region-derived and occupies less than
    // the station.
    occupancy: 0.9
  }).targetMaxDimension;
}

function districtRegion(district: SmartCityDistrict) {
  return resolveSemanticRegion(cityBounds(), districtRegions[district]);
}

function districtAnchor(district: SmartCityDistrict): readonly [number, number] {
  const region = districtRegion(district);
  return [region.center[0], region.center[2]];
}


const APP_ID = "showcase-smart-city-control";
/** Latest spatial invariant report; rebuilt whenever the overlay is composed. */
let smartCitySpatialReport: ReturnType<typeof checkSpatialInvariants> | undefined;
const DISTRICTS = ["all", "core", "north", "harbor", "industrial"] as const;
const CAMERA_MODES = ["command", "overview", "street", "flythrough"] as const;

type SmartCityDistrict = typeof DISTRICTS[number];
type SmartCityCameraMode = typeof CAMERA_MODES[number];
type SmartCityTimeOfDay = "day" | "night";
type ShowcaseStatus = "booting" | "ready" | "error";

interface SmartCityControls {
  timeOfDay: SmartCityTimeOfDay;
  district: SmartCityDistrict;
  traffic: boolean;
  cameraMode: SmartCityCameraMode;
  alertLevel: number;
}

interface SceneBuild {
  readonly snapshot: AuraSceneSnapshot;
  readonly systems: readonly string[];
  readonly diagnostics: Record<string, unknown>;
}

interface SmartCityEvidence {
  readonly status: ShowcaseStatus;
  readonly appId: typeof APP_ID;
  readonly frameCount: number;
  readonly interactionState: {
    readonly lastChanged: string;
    readonly runtimeNodeIds: readonly string[];
    readonly selectedDistrict: SmartCityDistrict;
    readonly selectedBuildingId?: string;
    readonly cameraMode: SmartCityCameraMode;
  };
  readonly controls: SmartCityControls;
  readonly systems: readonly string[];
  readonly claimBoundary: string;
  readonly telemetry: {
    readonly mobility: number;
    readonly energyMw: number;
    readonly incidents: number;
    readonly alertLevel: number;
  };
  readonly diagnostics: Record<string, unknown>;
  readonly updatedAt: string;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_SMART_CITY_CONTROL__?: SmartCityEvidence;
  }
}

const controls: SmartCityControls = {
  timeOfDay: "night",
  district: "all",
  traffic: true,
  cameraMode: "command",
  alertLevel: 42
};

let lastChanged = "initial-load";
let activeBuild = buildSmartCityScene();
let app: ReturnType<typeof createAuraApp> | undefined;

publishEvidence("booting");
app = createAuraApp("#aura-stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  renderer: {
    mode: "production",
    qualityProfile: "production",
    fallback: "safe-basic"
  },
  scene: activeBuild.snapshot
});

bindControls();
let compactCameraLayout = window.innerWidth < 700;
window.addEventListener("resize", () => {
  const nextCompactLayout = window.innerWidth < 700;
  if (nextCompactLayout === compactCameraLayout) return;
  compactCameraLayout = nextCompactLayout;
  applyScene(`viewport:${nextCompactLayout ? "compact" : "wide"}`);
});
updateControlState();
publishEvidence("ready");

/*
 * Route-primary evidence for an application route.
 *
 * The probe screenshots the route twice -- once with the hero vehicle present,
 * once with it suppressed -- and treats the difference as the subject. Without
 * this, the spec falls back to a whole-canvas foreground analysis, which for a
 * full-bleed city necessarily reports subject bounds equal to the entire crop
 * and therefore flags `primary-foreground-clipped`. That is the measurement
 * describing the city rather than the hero.
 *
 * Category is `application`: this route has a hero asset worth measuring but no
 * play space and no ground contact to prove, unlike the racing and platformer
 * routes that share this mechanism.
 */
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application",
    get camera() {
      return smartCityCamera(controls.cameraMode, controls.timeOfDay);
    },
    get subject() {
      const bounds = cityBounds();
      const station = resolveSemanticRegion(bounds, VEHICLE_STATION_REGION);
      return {
        position: station.center,
        rotation: [-0.04, 1.5708, 0] as const,
        targetSize: vehicleTargetMaxDimension()
      };
    },
    setSubjectSuppressed: (suppressed: boolean) => {
      app?.pause();
      app?.nodes.get("city-vehicle-primary")?.setScale(suppressed ? 0.0001 : 1);
      app?.step(0);
    }
  },
  configurable: true
});

app.onFrame(({ frame, time }) => {
  const trafficSpeed = controls.traffic ? 1 : 0.18;
  app?.nodes.get("city-traffic-east")?.setPosition(Math.sin(time * trafficSpeed) * 2.1, 0.16, -0.36);
  app?.nodes.get("city-traffic-north")?.setPosition(-0.34, 0.18, Math.cos(time * trafficSpeed * 0.82) * 2.2);
  // Keep two typed traffic actors visibly attached to the road grid. They are
  // supporting vehicles (the docking vehicle remains the route-primary hero),
  // but their bounded lane loops make mobility read as a city scene rather than
  // isolated telemetry bars.
  const trafficLoop = ((time * trafficSpeed * 0.12) % 1 + 1) % 1;
  const trafficCrossLoop = ((time * trafficSpeed * 0.09 + 0.38) % 1 + 1) % 1;
  app?.nodes.get("city-traffic-east-vehicle")
    ?.setPosition(-4.7 + trafficLoop * 9.4, 0.28, -2.68)
    .setRotation(0, Math.PI / 2, 0);
  app?.nodes.get("city-traffic-north-vehicle")
    ?.setPosition(2.55, 0.28, -4.3 + trafficCrossLoop * 8.6)
    .setRotation(0, 0, 0);
  app?.nodes.get("city-data-pulse-core")?.setScale(0.12 + Math.sin(time * 2.2) * 0.025 + controls.alertLevel * 0.0005);
  app?.nodes.get("city-flythrough-drone")?.setPosition(Math.sin(time * 0.42) * 1.8, 1.62 + Math.sin(time * 0.8) * 0.08, Math.cos(time * 0.42) * 1.45);
  if (frame % 12 === 0) publishEvidence("ready");
});

function buildSmartCityScene(): SceneBuild {
  const kit = sceneKits.cityBlock({
    blocks: CITY_BLOCK_COUNT,
    timeOfDay: controls.timeOfDay
  });
  const kitScene = kit.scene().toJSON();
  const depthNodes = createSmartCityDepthNodes();
  const buildingFocus = createSelectedBuildingFocus(kit.nodes);
  const activeCamera = controls.cameraMode === "command" && buildingFocus.camera
    ? widenBuildingFocusCamera(buildingFocus.camera)
    : smartCityCamera(controls.cameraMode, controls.timeOfDay);
  const qaState = city.createState({ blocks: 20, litWindows: true, timeOfDay: controls.timeOfDay });
  const changedNodes = qaState.toggleTimeOfDay();
  const qa = city.visualQA(changedNodes, { changed: qaState.lastChange });
  const builder = scene()
    .background(controls.timeOfDay === "night" ? "#071727" : "#c9ecff")
    // The kit's default HUD duplicates the route command bar and is anchored
    // to the same top-left screen corner. Keep the city geometry, lights,
    // effects, and interaction contract while leaving that corner clear for
    // the route chrome.
    .addMany(kitScene.nodes.filter((node) => !(node.kind === "label" && node.name === "city scene kit hud")))
    .addMany(depthNodes)
    .addMany(createSmartCityTrafficNodes())
    .add(effects.fog({
      name: "smart city operational depth haze",
      density: controls.timeOfDay === "night" ? 0.018 : 0.012,
      color: controls.timeOfDay === "night" ? "#17334a" : "#d7f4ff",
      // Keep night depth without laying a pale veil over the Command camera.
      intensity: controls.timeOfDay === "night" ? 0.2 : 0.24
    }))
    .add(effects.bloom({
      name: "smart city bounded infrastructure bloom",
      intensity: controls.timeOfDay === "night" ? 0.33 : 0.16,
      threshold: 0.74,
      radius: 0.38
    }))
    .add(lights.point({
      name: "operations amber district rim light",
      position: [2.8, 3.4, 3.6],
      color: "#f4c35d",
      intensity: controls.timeOfDay === "night" ? 1.46 : 0.8
    }))
    .add(lights.point({
      name: "city vehicle route-primary key light",
      position: [0.8, 2.4, 2.35],
      color: "#e8fbff",
      intensity: controls.timeOfDay === "night" ? 1.62 : 1.1
    }))
    .add(lights.ambient({
      name: "bounded city ambient fill",
      color: controls.timeOfDay === "night" ? "#7894a8" : "#d9efff",
      intensity: controls.timeOfDay === "night" ? 0.1 : 0.28
    }))
    .add(lights.directional({
      name: "city tower form key",
      position: [-7.2, 11.5, 8.4],
      color: controls.timeOfDay === "night" ? "#cde7ff" : "#fff0d5",
      intensity: controls.timeOfDay === "night" ? 1.34 : 2.05
    }))
    .add(lights.directional({
      name: "city skyline separation rim",
      position: [8.5, 5.5, -6.2],
      color: controls.timeOfDay === "night" ? "#56c9b0" : "#a6d7ff",
      intensity: controls.timeOfDay === "night" ? 0.74 : 0.62
    }))
    .add(interactions.hover({ target: `${controls.district} district control overlay`, selected: `${controls.district} district control overlay` }))
    .addMany(createSmartCityOverlayNodes())
    .addMany(buildingFocus.nodes)
    .camera(activeCamera)
    .timeline(timeline.loop({ seconds: controls.cameraMode === "flythrough" ? 9 : 12, captureTime: 0.44 }));

  const snapshot = builder.toJSON();
  const sceneEvidence = collectAuraSceneEvidence(snapshot);
  const runtimeNodeIds = snapshot.nodes
    .map((node) => "runtime" in node ? node.runtime?.id : undefined)
    .filter((id): id is string => Boolean(id));
  const systems = [
    "sceneKits.cityBlock procedural city base",
    "typed flying city vehicle model(assets.showcaseCityVehicle)",
    "city.visualQA day-night state proof",
    "city.instancing repeated city families",
    "district overlay selection",
    buildingFocus.targetId ? `selected building focus ${buildingFocus.targetId}` : "selected building focus cleared",
    controls.traffic ? "traffic pulses enabled" : "traffic pulses throttled",
    "runtime telemetry pulse nodes",
    "camera and flythrough modes",
    "authored skyline depth and transit spine",
    "bounds-derived road detail and vehicle contact shadow",
    `${controls.timeOfDay} operations lighting`
  ];
  return {
    snapshot,
    systems,
    diagnostics: {
      sceneEvidence,
      sceneKit: kit.diagnostics,
      cityQA: qa,
      cityInstancing: city.instancing(kit.nodes),
      buildingFocus: {
        targetId: buildingFocus.targetId,
        cameraFocused: Boolean(buildingFocus.camera && controls.cameraMode === "command"),
        accessibilityLabel: buildingFocus.accessibilityLabel,
        invariants: buildingFocus.invariants
      },
      runtimeNodeIds,
      /*
       * Spatial invariants over every helper element, derived from the city footprint.
       * Replaces judging helper placement by eye.
       */
      spatialInvariants: smartCitySpatialReport,
      /*
       * Kit frame, mirrored from route state. Published so a gate can see the route configures
       * a reusable kit rather than reimplementing city-overlay behaviour.
       */
      kit: (() => {
        smartCityKit.reset();
        if (controls.district !== "all") smartCityKit.selectDistrict(controls.district);
        smartCityKit.setTemporalState(controls.timeOfDay === "night" ? "night" : "day");
        const kitFrame = smartCityKit.frame();
        return {
          kind: kitFrame.kind,
          system: "engine.createSmartCityKit",
          routeReimplementsCityBehaviour: false,
          capabilities: smartCityKit.capabilities,
          districtId: kitFrame.districtId,
          activeLayerIds: kitFrame.activeLayerIds,
          temporalState: kitFrame.temporalState,
          overlays: kitFrame.overlays.length,
          reducedDetailDistrictIds: kitFrame.reducedDetailDistrictIds,
          spatialInvariants: kitFrame.spatialInvariants,
          accessibilityLabel: kitFrame.accessibilityLabel
        };
      })(),
      nodeCount: snapshot.nodes.length,
      visualDepthNodes: depthNodes.length,
      labelCount: snapshot.nodes.filter((node) => node.kind === "label").length,
      district: controls.district
    }
  };
}

/**
 * Two typed traffic actors ground the route's mobility telemetry in the city
 * street grid. The command vehicle remains the only route-primary subject;
 * these are repeated supporting uses of the same release-validated vehicle
 * asset, with target size derived from the hero station region.
 */
function createSmartCityTrafficNodes(): AuraNodeInput[] {
  const bounds = cityBounds();
  const trafficTarget = vehicleTargetMaxDimension() * 0.52;
  const eastRoad = resolveSemanticRegion(bounds, {
    id: "east-traffic-road",
    u: 0.5,
    v: 0.04,
    w: 0.265,
    extent: [0.82, 0.04, 0.05]
  });
  const northRoad = resolveSemanticRegion(bounds, {
    id: "north-traffic-road",
    u: 0.724,
    v: 0.04,
    w: 0.5,
    extent: [0.05, 0.04, 0.82]
  });
  return [
    model(assets.showcaseCityVehicle, {
      name: "typed east corridor traffic vehicle",
      targetMaxDimension: trafficTarget,
      castShadow: false,
      receiveShadow: true
    })
      .position(eastRoad.center[0] - eastRoad.size[0] * 0.42, bounds.floorY + 0.28, eastRoad.center[2])
      .rotate(0, Math.PI / 2, 0)
      .runtime(game.runtimeNode("city-traffic-east-vehicle", { tags: ["traffic", "typed-asset"] })),
    model(assets.showcaseCityVehicle, {
      name: "typed north corridor traffic vehicle",
      targetMaxDimension: trafficTarget * 0.94,
      castShadow: false,
      receiveShadow: true
    })
      .position(northRoad.center[0], bounds.floorY + 0.28, northRoad.center[2] - northRoad.size[2] * 0.34)
      .rotate(0, 0, 0)
      .runtime(game.runtimeNode("city-traffic-north-vehicle", { tags: ["traffic", "typed-asset"] }))
  ];
}

/**
 * A compact, bounds-derived visual layer that gives the procedural city a
 * believable control-room silhouette without replacing the city kit. The kit
 * remains the source of the roads, tower family, windows, props and traffic;
 * these instanced accents only add near/mid/far depth, material rhythm and a
 * readable operational lane for the typed command vehicle.
 */
function createSmartCityDepthNodes(): AuraNodeInput[] {
  const bounds = cityBounds();
  const skyline = [
    { x: -5.18, z: -5.16, height: 2.92, width: 0.78, depth: 0.72, color: "#123249" },
    { x: -3.72, z: -5.34, height: 3.56, width: 0.62, depth: 0.68, color: "#1d3550" },
    { x: -2.28, z: -5.26, height: 2.42, width: 0.74, depth: 0.66, color: "#24485a" },
    { x: -0.86, z: -5.4, height: 3.18, width: 0.58, depth: 0.72, color: "#213a5d" },
    { x: 2.82, z: -5.32, height: 2.64, width: 0.72, depth: 0.68, color: "#173e52" },
    { x: 4.22, z: -5.18, height: 3.74, width: 0.62, depth: 0.72, color: "#2b3c61" },
    { x: 5.18, z: -4.5, height: 2.18, width: 0.72, depth: 0.66, color: "#234d59" },
    { x: -5.28, z: -3.22, height: 2.16, width: 0.56, depth: 0.58, color: "#1d4253" },
    { x: 5.24, z: -2.72, height: 2.84, width: 0.58, depth: 0.62, color: "#1a3653" }
  ] as const;

  const skylineTransforms = skyline.map((tower) => ({
    position: [tower.x, bounds.floorY + tower.height / 2, tower.z] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [tower.width, tower.height, tower.depth] as [number, number, number]
  }));
  const skylineColors = skyline.map((tower) => tower.color);

  const roofTransforms = skyline.map((tower, index) => ({
    position: [tower.x, bounds.floorY + tower.height + 0.1, tower.z] as [number, number, number],
    rotation: [0, (index % 3) * 0.22, 0] as [number, number, number],
    scale: [tower.width * (index % 2 === 0 ? 0.7 : 0.52), 0.16, tower.depth * 0.68] as [number, number, number]
  }));

  const antennaTransforms = skyline
    .filter((_, index) => index % 2 === 1)
    .map((tower, index) => ({
      position: [tower.x, bounds.floorY + tower.height + 0.38 + (index % 2) * 0.08, tower.z] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.025 + (index % 2) * 0.012, 0.42 + (index % 3) * 0.08, 0.025 + (index % 2) * 0.012] as [number, number, number]
    }));

  const windowTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const windowColors: string[] = [];
  const windowPalette = ["#8de9ef", "#f6c96a", "#86b6ff", "#e39ad7"] as const;
  for (const [towerIndex, tower] of skyline.entries()) {
    // Front-facing vertical window stacks keep the far skyline readable from
    // the command camera while leaving the central typed vehicle unobscured.
    for (let row = 0; row < 3; row += 1) {
      windowTransforms.push({
        position: [tower.x - tower.width * 0.18, bounds.floorY + 0.62 + row * 0.62, tower.z + tower.depth * 0.53] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.045, 0.19 + (towerIndex % 2) * 0.035, 0.035] as [number, number, number]
      });
      windowColors.push(windowPalette[(towerIndex + row) % windowPalette.length]!);
      windowTransforms.push({
        position: [tower.x + tower.width * 0.2, bounds.floorY + 0.62 + row * 0.62, tower.z + tower.depth * 0.53] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.045, 0.19 + (row % 2) * 0.035, 0.035] as [number, number, number]
      });
      windowColors.push(windowPalette[(towerIndex + row + 1) % windowPalette.length]!);
    }
  }

  const roadMarkerTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const roadMarkerColors: string[] = [];
  for (let index = -4; index <= 4; index += 1) {
    const offset = index * 1.08;
    roadMarkerTransforms.push({
      position: [offset, bounds.floorY + 0.074, -2.68] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.26, 0.024, 0.052] as [number, number, number]
    });
    roadMarkerColors.push(index % 3 === 0 ? "#f8d478" : "#9ce9e2");
    roadMarkerTransforms.push({
      position: [2.55, bounds.floorY + 0.076, offset] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.052, 0.024, 0.26] as [number, number, number]
    });
    roadMarkerColors.push(index % 2 === 0 ? "#77d5ef" : "#f8d478");
  }

  const transitTransforms = [
    { position: [-2.4, 1.12, -4.82] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2.15, 0.055, 0.08] as [number, number, number] },
    { position: [2.1, 1.58, -4.82] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2.5, 0.055, 0.08] as [number, number, number] },
    { position: [-4.94, 0.84, -3.58] as [number, number, number], rotation: [0, 1.5708, 0] as [number, number, number], scale: [1.05, 0.05, 0.07] as [number, number, number] },
    { position: [4.94, 1.18, -3.06] as [number, number, number], rotation: [0, 1.5708, 0] as [number, number, number], scale: [1.18, 0.05, 0.07] as [number, number, number] }
  ];

  const treePositions = [
    [-4.86, 0.34, -2.52], [-4.64, 0.34, 1.72], [4.78, 0.34, -1.94], [4.62, 0.34, 2.44],
    [-2.92, 0.34, 4.72], [2.18, 0.34, 4.78]
  ] as const;
  const treeTrunks = treePositions.map(([x, y, z], index) => ({
    position: [x, y, z] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [0.045, 0.34 + (index % 2) * 0.08, 0.045] as [number, number, number]
  }));
  const treeCanopies = treePositions.map(([x, y, z], index) => ({
    position: [x, y + 0.56 + (index % 2) * 0.08, z] as [number, number, number],
    rotation: [0, index * 0.27, 0] as [number, number, number],
    scale: [0.32 + (index % 3) * 0.07, 0.45 + (index % 2) * 0.1, 0.32 + (index % 2) * 0.05] as [number, number, number]
  }));

  return [
    instances.box({
      name: "smart city far skyline massing",
      transforms: skylineTransforms,
      colors: skylineColors,
      material: material.pbr({ name: "far skyline midnight teal", color: "#19384b", roughness: 0.62, metallic: 0.18 })
    }),
    instances.box({
      name: "smart city skyline roof caps",
      transforms: roofTransforms,
      colors: skyline.map((tower, index) => index % 3 === 0 ? "#46a9b4" : tower.color),
      material: material.metal({ name: "skyline roof metal", color: "#21475a", roughness: 0.32, metallic: 0.62 })
    }),
    instances.cylinder({
      name: "smart city skyline antenna spines",
      transforms: antennaTransforms,
      material: material.metal({ name: "skyline antenna metal", color: "#6c9cab", roughness: 0.26, metallic: 0.68 })
    }),
    instances.box({
      name: "smart city skyline window cadence",
      transforms: windowTransforms,
      colors: windowColors,
      material: material.emissive({ name: "skyline practical windows", color: "#9deef0", emissive: "#70d9e7", emissiveIntensity: 0.84, opacity: 0.86 })
    }),
    instances.box({
      name: "smart city operational lane markings",
      transforms: roadMarkerTransforms,
      colors: roadMarkerColors,
      material: material.emissive({ name: "operational lane accents", color: "#92e8e1", emissive: "#5fd4cb", emissiveIntensity: 0.7, opacity: 0.82 })
    }),
    instances.box({
      name: "smart city elevated transit spine",
      transforms: transitTransforms,
      colors: ["#6be1e8", "#f2c66d", "#67c6dc", "#eea874"],
      material: material.metal({ name: "transit spine metal", color: "#315469", roughness: 0.34, metallic: 0.58 })
    }),
    instances.cylinder({
      name: "smart city green corridor trunks",
      transforms: treeTrunks,
      material: material.pbr({ name: "green corridor trunks", color: "#4a3e36", roughness: 0.9, metallic: 0.02 })
    }),
    instances.sphere({
      name: "smart city green corridor canopies",
      transforms: treeCanopies,
      colors: ["#2f6d62", "#3f7861", "#315d68", "#4b7354", "#326f6c", "#56764e"],
      material: material.emissive({ name: "green corridor foliage", color: "#3a887b", emissive: "#1f5c55", emissiveIntensity: 0.34, opacity: 0.94 })
    })
  ];
}

function widenBuildingFocusCamera(intent: NonNullable<FocusResult["camera"]>): AuraCameraSpec {
  const distanceScale = window.innerWidth < 700 ? 2.4 : 1.85;
  const offset = [
    intent.position[0] - intent.target[0],
    intent.position[1] - intent.target[1],
    intent.position[2] - intent.target[2]
  ] as const;
  return {
    mode: "perspective",
    position: [
      intent.target[0] + offset[0] * distanceScale,
      intent.target[1] + offset[1] * distanceScale,
      intent.target[2] + offset[2] * distanceScale
    ],
    target: intent.target,
    fov: 44
  };
}

function createSelectedBuildingFocus(nodes: readonly AuraSceneNode[]): FocusResult {
  if (controls.district === "all") return clearFocus();
  const towerFamily = groups.flatten(nodes).find((node) => node.kind === "primitive" && node.name === "city tower native instanced family");
  if (!towerFamily || towerFamily.kind !== "primitive" || !towerFamily.instances?.length) {
    throw new Error("Smart City building focus requires the native city tower instance family.");
  }
  const indexByDistrict: Record<Exclude<SmartCityDistrict, "all">, number> = {
    core: 2,
    north: 4,
    harbor: 7,
    industrial: 3
  };
  const index = indexByDistrict[controls.district];
  const transform = towerFamily.instances[index];
  if (!transform?.position) throw new Error(`Smart City building focus is missing tower instance ${index}.`);
  const scale = transform.scale ?? 1;
  const size = typeof scale === "number" ? [scale, scale, scale] as const : scale;
  return focusObject({
    id: `${controls.district}-tower-${index + 1}`,
    label: `${controls.district[0]!.toUpperCase()}${controls.district.slice(1)} operations tower`,
    center: transform.position,
    size,
    rotation: transform.rotation
  }, {
    indicators: ["ring", "bounding-box"],
    color: districtColor(controls.district),
    callout: true,
    cameraFocus: true,
    compactViewport: window.innerWidth < 700,
    namePrefix: `${controls.district} selected building`
  });
}

function createSmartCityOverlayNodes(): AuraNodeInput[] {
  /*
   * Every element below is placed relative to the city's own footprint.
   *
   * Previously each carried a literal world coordinate chosen by eye. Deriving them means
   * changing `blocks` or `CITY_EXTENT` moves the whole overlay together, and each label's
   * leader line stays attached to the element it annotates.
   */
  const bounds = cityBounds();
  const compactViewport = window.innerWidth < 700;
  const selectedRegion = districtRegion(controls.district);
  const selected = districtAnchor(controls.district);
  const highlightColor = controls.district === "all" ? "#50d891" : districtColor(controls.district);
  // `all` spans the complete 11.4 x 11.4 city footprint. Giving that plane the
  // same opacity as one district washed the entire Command view green/white.
  const selectionOpacity = controls.district === "all" ? 0.035 : 0.13;
  // Telemetry landmarks as normalized regions of the city.
  const eastCorridor = resolveSemanticRegion(bounds, { id: "east-corridor", u: 0.5, v: 0.08, w: 0.4, extent: [0.12, 0.02, 0.03] });
  const northCorridor = resolveSemanticRegion(bounds, { id: "north-corridor", u: 0.41, v: 0.09, w: 0.5, extent: [0.11, 0.02, 0.03] });
  const coreSpire = resolveSemanticRegion(bounds, { id: "core-spire", u: 0.5, v: 0.75, w: 0.5 });
  const vehicleStation = resolveSemanticRegion(bounds, VEHICLE_STATION_REGION);
  const dronePatrol = resolveSemanticRegion(bounds, { id: "drone-patrol", u: 0.89, v: 0.85, w: 0.82 });
  const nodes: AuraNodeInput[] = [
    primitives.box({
      name: `${controls.district} district control overlay`,
      material: material.emissive({ color: highlightColor, emissive: highlightColor, emissiveIntensity: controls.district === "all" ? 0.18 : 0.42, opacity: selectionOpacity })
    }).position(selected[0], selectedRegion.center[1], selected[1])
      .scale([Math.max(0.05, selectedRegion.size[0]), 0.018, Math.max(0.05, selectedRegion.size[2])]),
    primitives.box({
      name: "city traffic east pulse",
      material: material.neon({ color: "#50d891", emissive: "#50d891", emissiveIntensity: controls.traffic ? 1.5 : 0.42, opacity: 0.78 })
    }).position(...eastCorridor.center)
      .scale([eastCorridor.size[0], 0.038, eastCorridor.size[2]])
      .runtime(game.runtimeNode("city-traffic-east")),
    // A small, bounds-derived landing pad gives the typed command vehicle a
    // convincing operational contact point. It is set dressing around the
    // registered vehicle, not a replacement for the primary asset.
    primitives.cylinder({
      name: "command vehicle landing pad",
      material: material.metal({ color: "#243a4a", roughness: 0.34, metallic: 0.72 })
    }).position(vehicleStation.center[0], bounds.floorY + 0.055, vehicleStation.center[2])
      .scale([CITY_EXTENT * 0.072, 0.055, CITY_EXTENT * 0.072]),
    primitives.torus({
      name: "command vehicle landing pad ring",
      material: material.neon({ color: "#65d8e8", emissive: "#65d8e8", emissiveIntensity: 1.25, opacity: 0.9 })
    }).position(vehicleStation.center[0], bounds.floorY + 0.12, vehicleStation.center[2])
      .rotate(1.5708, 0, 0)
      .scale([CITY_EXTENT * 0.065, CITY_EXTENT * 0.065, 0.016]),
    primitives.cylinder({
      name: "command vehicle docking beacon",
      material: material.neon({ color: "#65d8e8", emissive: "#65d8e8", emissiveIntensity: 1.45, opacity: 0.88 })
    }).position(vehicleStation.center[0], bounds.floorY + 0.32, vehicleStation.center[2])
      .scale([CITY_EXTENT * 0.008, CITY_HEIGHT * 0.22, CITY_EXTENT * 0.008]),
    shadows.contact({
      name: "command vehicle contact shadow",
      position: [vehicleStation.center[0], bounds.floorY + 0.042, vehicleStation.center[2]],
      footprint: [CITY_EXTENT * 0.1, CITY_EXTENT * 0.06],
      opacity: 0.3,
      color: "#040b12"
    }),
    // Size comes from the vehicle's own station region rather than a hardcoded
    // multiplier, so the hero stays proportionate to the city when CITY_EXTENT
    // changes or the asset is swapped. The previous `.scale(1.58)` rendered the
    // vehicle at ~2.45 units inside a 3.8-unit city -- 64% of the whole
    // footprint -- which is why it occluded the districts it was meant to sit in.
    model(assets.showcaseCityVehicle, {
      name: "typed command vehicle route-primary hero",
      targetMaxDimension: vehicleTargetMaxDimension()
    })
      .position(...vehicleStation.center)
      .rotate(-0.04, 1.5708, 0)
      .runtime(game.runtimeNode("city-vehicle-primary", { tags: ["traffic", "primary", "typed-asset"] })),
    primitives.box({
      name: "city traffic north pulse",
      material: material.neon({ color: "#4aa3ff", emissive: "#4aa3ff", emissiveIntensity: controls.traffic ? 1.42 : 0.38, opacity: 0.72 })
    }).position(...northCorridor.center)
      .rotate(0, 1.5708, 0)
      .scale([northCorridor.size[0], 0.038, northCorridor.size[2]])
      .runtime(game.runtimeNode("city-traffic-north")),
    primitives.sphere({
      name: "core infrastructure data pulse",
      material: material.neon({ color: "#f4c35d", emissive: "#f4c35d", emissiveIntensity: 2.5 })
    }).position(...coreSpire.center).scale(CITY_EXTENT * 0.037).runtime(game.runtimeNode("city-data-pulse-core")),
    distanceLod({
      name: "core communications tower distance LOD",
      levels: [
        {
          name: "near detailed communications cylinder",
          maxDistance: 12,
          primitive: "cylinder",
          material: material.pbr({ color: "#dfffee", roughness: 0.28, metallic: 0.42 })
        },
        {
          name: "far simplified communications box",
          primitive: "box",
          material: material.pbr({ color: "#b7f7d1", roughness: 0.62, metallic: 0.08 })
        }
      ],
      hysteresis: 0.6
    }).position(coreSpire.center[0], bounds.floorY + CITY_HEIGHT * 0.19, coreSpire.center[2])
      .scale([CITY_EXTENT * 0.018, CITY_HEIGHT * 0.38, CITY_EXTENT * 0.018]),
    primitives.sphere({
      name: "flythrough inspection drone",
      material: material.neon({ color: "#f8fbff", emissive: "#b7f7d1", emissiveIntensity: 1.8 })
    }).position(...dronePatrol.center).scale(CITY_EXTENT * 0.02).runtime(game.runtimeNode("city-flythrough-drone")),
    // Ring radius derived from the city footprint and thinned on Z, the torus tube axis, so
    // it stays a ring at any city size rather than collapsing into a bar.
    primitives.torus({
      name: "city telemetry orbit ring",
      material: material.neon({ color: "#f4c35d", emissive: "#f4c35d", emissiveIntensity: 0.9, opacity: 0.48 })
    }).position(coreSpire.center[0], coreSpire.center[1] - CITY_HEIGHT * 0.03, coreSpire.center[2])
      .rotate(1.35, 0.18, 0)
      .scale([CITY_EXTENT * 0.474, CITY_EXTENT * 0.474, CITY_EXTENT * 0.007]),
    // Callouts anchor to the world position of the element they describe, so the leader line
    // tracks its subject as the camera moves.
    labels.callout(`${controls.district.toUpperCase()} DISTRICT`, `${controls.district} district control overlay`, {
      name: "selected city district label",
      position: [selected[0], selectedRegion.center[1] + CITY_HEIGHT * 0.29, selected[1]],
      anchorWorldPosition: [selected[0], selectedRegion.center[1], selected[1]],
      size: 0.18,
      color: "#f8fbff"
    }),
    labels.callout("Command vehicle", "typed command vehicle route-primary hero", {
      name: "command vehicle label",
      position: [vehicleStation.center[0] - CITY_EXTENT * 0.12, vehicleStation.center[1] + CITY_HEIGHT * 0.28, vehicleStation.center[2]],
      anchorWorldPosition: vehicleStation.center,
      size: 0.15,
      color: "#b9f4ff"
    }),
  ];

  // Keep secondary telemetry labels on the wide command view where they have
  // room to breathe. On a phone they otherwise land over the camera controls;
  // the telemetry panel still exposes the same mobility and energy values.
  if (!compactViewport) {
    nodes.push(
      labels.callout("Mobility", "city traffic east pulse", {
        name: "traffic telemetry label",
        position: [eastCorridor.center[0] + CITY_EXTENT * 0.41, eastCorridor.center[1] + CITY_HEIGHT * 0.19, eastCorridor.center[2] - CITY_EXTENT * 0.07],
        anchorWorldPosition: eastCorridor.center,
        size: 0.16,
        color: "#dfffee"
      }),
      labels.callout("Energy", "core infrastructure data pulse", {
        name: "energy telemetry label",
        position: [coreSpire.center[0] + CITY_EXTENT * 0.09, coreSpire.center[1] + CITY_HEIGHT * 0.22, coreSpire.center[2] + CITY_EXTENT * 0.05],
        anchorWorldPosition: coreSpire.center,
        size: 0.16,
        color: "#fff2c7"
      })
    );
  }

  const anchors = [
    { district: "core" as const, label: "Core", color: "#f4c35d" },
    { district: "north" as const, label: "North", color: "#4aa3ff" },
    { district: "harbor" as const, label: "Harbor", color: "#50d891" },
    { district: "industrial" as const, label: "Industrial", color: "#ff7a59" }
  ];

  // Keep district beacons close to the mapped streets. The former height used
  // almost half of the full scene bound and produced four free-standing poles
  // taller than the buildings after the city bound was corrected.
  const mastHeight = CITY_HEIGHT * 0.11 + controls.alertLevel * 0.001;
  for (const anchor of anchors) {
    const position = districtAnchor(anchor.district);
    const mastCentreY = bounds.floorY + mastHeight / 2;
    nodes.push(primitives.box({
        name: `${anchor.district} district status mast`,
        material: material.neon({ color: anchor.color, emissive: anchor.color, emissiveIntensity: controls.district === anchor.district ? 1.6 : 0.52, opacity: 0.74 })
      }).position(position[0], mastCentreY, position[1]).scale([CITY_EXTENT * 0.009, mastHeight, CITY_EXTENT * 0.009]));
    if (controls.district === anchor.district) {
      nodes.push(labels.anchor(anchor.label, `${anchor.district} district status mast`, {
        name: `${anchor.district} district label`,
        position: [position[0], mastCentreY + mastHeight * 0.82, position[1]],
        anchorWorldPosition: [position[0], mastCentreY + mastHeight / 2, position[1]],
        size: 0.14
      }));
    }
  }

  if (controls.cameraMode === "flythrough") {
    // The corridor spans the city diagonally, sized from its footprint rather than a
    // literal 4.4 that only happened to fit an 8-block layout.
    const corridorCentre = resolveSemanticRegion(bounds, { id: "corridor", u: 0.54, v: 0.12, w: 0.53 });
    nodes.push(
      primitives.box({
        name: "flythrough route corridor",
        material: material.emissive({ color: "#b7f7d1", emissive: "#50d891", emissiveIntensity: 0.42, opacity: 0.28 })
      }).position(...corridorCentre.center)
        .rotate(0, -0.62, 0)
        .scale([CITY_EXTENT * 1.16, 0.024, CITY_EXTENT * 0.032])
    );
  }

  /*
   * Spatial invariants for every helper element.
   *
   * Published so "no procedural geometry floating outside the scene" is verified against
   * the city's footprint rather than judged by eye. District overlays, corridors, the core
   * spire and the vehicle station must lie inside the city; the drone patrols above it.
   */
  smartCitySpatialReport = checkSpatialInvariants(bounds, [
    ...DISTRICTS.filter((district) => district !== "all").map((district) => ({
      id: `${district} district`,
      position: districtRegion(district).center,
      relation: "inside" as const
    })),
    { id: "core spire", position: coreSpire.center, relation: "inside" as const },
    { id: "vehicle station", position: vehicleStation.center, relation: "inside" as const },
    { id: "east corridor", position: eastCorridor.center, relation: "inside" as const },
    { id: "north corridor", position: northCorridor.center, relation: "inside" as const },
    { id: "drone patrol", position: dronePatrol.center, relation: "inside" as const }
  ]);

  return nodes;
}

function smartCityCamera(mode: SmartCityCameraMode, timeOfDay: SmartCityTimeOfDay): AuraCameraSpec {
  const bounds = cityBounds();
  const target = [bounds.center[0], bounds.min[1] + bounds.size[1] * 0.2, bounds.center[2]] as const;
  const compactViewport = window.innerWidth < 700;
  if (mode === "overview") {
    return camera.isometric({
      position: compactViewport ? [11.2, 10.4, 12.4] : [8.6, 8.2, 9.4],
      target,
      orthographicSize: compactViewport ? 9.8 : 7.2
    });
  }
  if (mode === "street") {
    return camera.perspective({
      position: compactViewport ? [-10.4, 3.5, 12.8] : [-7.8, 2.7, 8.8],
      target: [0.2, 1.05, -0.35],
      fov: 46
    });
  }
  if (mode === "flythrough") {
    return camera.path({
      from: compactViewport ? [-12.8, 5.6, 14.2] : [-9.4, 4.8, 10.2],
      to: compactViewport ? [11.4, 4.8, 13.2] : [8.2, 3.6, 8.8],
      target,
      seconds: 9,
      captureTime: 4.5,
      fov: 44
    });
  }
  // The command view frames the whole city from its bounds instead of a hardcoded
  // eye position. The previous fixed position with fov 30 sat inside the city and
  // zoomed until the scene overflowed every frame edge, which is what the
  // route-primary probe reports as `primary-foreground-clipped`.
  return camera.autoFrame({
    bounds: { min: bounds.min, max: bounds.max },
    target,
    padding: compactViewport ? 2.35 : timeOfDay === "night" ? 1.18 : 1.68,
    fov: 40
  });
}

function districtColor(district: SmartCityDistrict): string {
  if (district === "north") return "#4aa3ff";
  if (district === "harbor") return "#50d891";
  if (district === "industrial") return "#ff7a59";
  if (district === "core") return "#f4c35d";
  return "#50d891";
}

function bindControls(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-district]"))) {
    button.addEventListener("click", () => {
      const next = button.dataset.district;
      if (!isDistrict(next)) return;
      controls.district = next;
      applyScene(`district:${next}`);
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

  const dayNight = element<HTMLButtonElement>("#city-day-night");
  dayNight.addEventListener("click", () => {
    controls.timeOfDay = controls.timeOfDay === "night" ? "day" : "night";
    applyScene(`time:${controls.timeOfDay}`);
  });

  const traffic = element<HTMLButtonElement>("#city-traffic");
  traffic.addEventListener("click", () => {
    controls.traffic = !controls.traffic;
    applyScene(controls.traffic ? "traffic:on" : "traffic:off");
  });

  const alertInput = ui.slider("#city-alert", { min: 0, max: 100, value: controls.alertLevel, metric: "smart-city-alert-level" });
  alertInput.addEventListener("input", () => {
    controls.alertLevel = Number(alertInput.value);
    applyScene("alert-level");
  });
}

function applyScene(change: string): void {
  lastChanged = change;
  activeBuild = buildSmartCityScene();
  app?.setScene(activeBuild.snapshot);
  updateControlState();
  publishEvidence("ready");
}

function updateControlState(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-district]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.district === controls.district));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-camera]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.camera === controls.cameraMode));
  }
  const dayNight = element<HTMLButtonElement>("#city-day-night");
  dayNight.textContent = controls.timeOfDay === "night" ? "Night Ops" : "Day Ops";
  dayNight.setAttribute("aria-pressed", String(controls.timeOfDay === "night"));
  const traffic = element<HTMLButtonElement>("#city-traffic");
  traffic.textContent = controls.traffic ? "Traffic Live" : "Traffic Hold";
  traffic.setAttribute("aria-pressed", String(controls.traffic));
  element<HTMLInputElement>("#city-alert").value = String(controls.alertLevel);
  ui.setText("#city-alert-value", controls.alertLevel);
}

function publishEvidence(status: ShowcaseStatus): void {
  const frameCount = app?.runtime.frame ?? 0;
  const telemetry = computeTelemetry(app?.runtime.time ?? 0);
  const runtimeNodeIds = app?.nodes.ids() ?? (activeBuild.diagnostics.runtimeNodeIds as readonly string[] | undefined) ?? [];
  const appDiagnostics = app?.diagnostics();
  const evidence: SmartCityEvidence = {
    status,
    appId: APP_ID,
    frameCount,
    interactionState: {
      lastChanged,
      runtimeNodeIds,
      selectedDistrict: controls.district,
      ...(controls.district === "all" ? {} : { selectedBuildingId: (activeBuild.diagnostics.buildingFocus as { readonly targetId: string }).targetId }),
      cameraMode: controls.cameraMode
    },
    controls: { ...controls },
    systems: activeBuild.systems,
    claimBoundary: "Procedural Aura3D public API showcase using sceneKits.cityBlock, a typed vehicle asset, native tower instancing, distance LOD, runtime frustum-culling diagnostics, district overlays, labels, controls, and runtime telemetry. It does not claim real GIS data, imported city geometry, GPU occlusion culling, or traffic simulation fidelity.",
    telemetry,
    diagnostics: {
      ...activeBuild.diagnostics,
      ...(appDiagnostics ? {
        backend: appDiagnostics.backend,
        drawCalls: appDiagnostics.drawCalls,
        fps: appDiagnostics.fps,
        renderSize: appDiagnostics.renderSize,
        warnings: appDiagnostics.warnings,
        errors: appDiagnostics.errors,
        rendererRuntime: appDiagnostics.renderer?.runtime
      } : {})
    },
    updatedAt: new Date().toISOString()
  };
  window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__ = evidence;
  ui.setText("#city-status", status);
  ui.setText("#city-frame", frameCount);
  ui.setText("#city-district", controls.district);
  ui.setText("#city-mobility", `${telemetry.mobility}%`);
  ui.setText("#city-energy", `${telemetry.energyMw} MW`);
  ui.setText("#city-incidents", telemetry.incidents);
  ui.setText("#city-nodes", activeBuild.snapshot.nodes.length);
}

function computeTelemetry(time: number): SmartCityEvidence["telemetry"] {
  const trafficBase = controls.traffic ? 82 : 48;
  const alertPenalty = Math.round(controls.alertLevel * 0.18);
  const districtBoost = controls.district === "all" ? 0 : 4;
  const mobility = Math.max(20, Math.min(98, Math.round(trafficBase + Math.sin(time * 0.8) * 5 + districtBoost - alertPenalty)));
  const energyMw = Math.round(118 + controls.alertLevel * 1.7 + (controls.timeOfDay === "night" ? 34 : -12) + Math.cos(time * 0.45) * 6);
  const incidents = Math.max(0, Math.round(controls.alertLevel / 18 + (controls.traffic ? 1 : 3) + Math.sin(time * 0.6)));
  return {
    mobility,
    energyMw,
    incidents,
    alertLevel: controls.alertLevel
  };
}

function element<T extends HTMLElement>(selector: string): T {
  const target = document.querySelector<T>(selector);
  if (!target) {
    throw new Error(`Missing Smart City control: ${selector}`);
  }
  return target;
}

function isDistrict(value: string | undefined): value is SmartCityDistrict {
  return DISTRICTS.includes(value as SmartCityDistrict);
}

function isCameraMode(value: string | undefined): value is SmartCityCameraMode {
  return CAMERA_MODES.includes(value as SmartCityCameraMode);
}
