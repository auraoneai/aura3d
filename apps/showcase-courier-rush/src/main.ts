/**
 * Courier Rush - mounted route.
 *
 * Night-shift courier on the cityBlock night kit: drive to the lit pickup
 * sensor, carry the typed parcel in the van bed, drop it in the marked zone
 * before the dispatch timer dies. Five deliveries per shift, combo multiplier
 * for early drops, strikes for collisions, R resets the shift.
 *
 * Claim label: prototype. Root safe API only (createAuraApp + public helpers);
 * evidence publishes to window.__COURIER_RUSH_EVIDENCE__ per the PRD contract.
 */
import {
  createAuraApp,
  createGameArcadeVehicle,
  camera,
  effects,
  game,
  group,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraRuntimeNodeHandle,
  type GameArcadeVehicle
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  buildCityDressing,
  buildPropColliders,
  COURIER_ROUTES,
  ZONE_SITES,
  type GridPoint,
  type PropCollider,
  type ZoneSite
} from "./city";
import {
  applyStrike,
  createDispatchState,
  currentDelivery,
  DELIVERY_COUNT,
  MAX_STRIKES,
  stepDispatch,
  type CourierEvent,
  type DispatchState
} from "./dispatch";
import { createTrafficSimulation } from "./traffic";
import {
  CHASE_CAMERA,
  chaseOffsetForBlend,
  DROP_LOOKBACK_SECONDS,
  handbrakeSpeedMultiplier,
  toArcadeVehicleInput,
  VAN_TUNE,
  type VanDriveInput
} from "./van";
import { createCourierAudio, type CourierAudioController } from "./courier-audio";
import {
  decayHudEffects,
  hideShiftSummary,
  mountCourierHud,
  pulseStrikeFlash,
  showRadioToast,
  showShiftSummary,
  updateCourierHud
} from "./hud";

interface CourierRouteReadyFlag {
  readonly ready: boolean;
  readonly diagnostics?: unknown;
}
declare global {
  interface Window {
    __COURIER_RUSH_EVIDENCE__?: Record<string, unknown>;
    __COURIER_RUSH_DEBUG__?: {
      placeVan(x: number, z: number, heading?: number): void;
      vanSnapshot(): { x: number; z: number; heading: number; speed: number };
    };
    __AURA3D_ROUTE_READY__?: CourierRouteReadyFlag;
    __AURA3D_COMPOSITION_PROBE__?: {
      readonly category: "application";
      readonly subject: {
        readonly position: readonly [number, number, number];
        readonly rotation: readonly [number, number, number];
        readonly targetSize: number;
      };
      setSubjectSuppressed(suppressed: boolean): void;
      settleSubjectPose(): void;
    };
  }
}

// ---- diagnostics switches ---------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const autopilotEnabled = urlParams.get("autopilot") === "1";
const timerScale = Number(urlParams.get("timerScale") ?? "1") || 1;
const debugMode = urlParams.get("debug") === "1";
const visualReviewCapture = urlParams.get("capture") === "review";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";

/** Deterministic shift seed (drives traffic line variation). */
const SHIFT_SEED = 20260821;

// ---- accessibility ----------------------------------------------------------
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const accessibilitySettings = game.accessibility.settings([
  game.accessibility.reducedMotion({ enabled: prefersReducedMotion })
]);
const reducedMotion = accessibilitySettings.reducedMotion;
const runtimeEffects = game.effects({ poolSize: 40, reducedMotion, reducedFlash: false });

// ---- audio ------------------------------------------------------------------
const courierAudio: CourierAudioController = createCourierAudio(reducedMotion);
let audioUnlocked = false;
const unlockAudio = (): void => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  void courierAudio.unlock();
};
const playCue = (cue: Parameters<CourierAudioController["cue"]>[0]): void => {
  if (!audioUnlocked) return;
  void courierAudio.cue(cue);
};

// ---- input ------------------------------------------------------------------
const input = game.input({
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    handbrake: ["Space"],
    interact: ["KeyE"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 90
});
window.addEventListener("keydown", unlockAudio, { once: true });
window.addEventListener("pointerdown", unlockAudio, { once: true });

// ---- world data -------------------------------------------------------------
// The review route uses a coordinate-aligned presentation slice of the same
// east-avenue world road as the selected live traffic. It changes lens and
// exposure only; dynamic cars, collision, cargo, and delivery state remain
// the normal route simulation.
const dressing = buildCityDressing(assets, visualReviewCapture);
const propColliders: readonly PropCollider[] = buildPropColliders();
const trafficSim = createTrafficSimulation({ seed: SHIFT_SEED });

/**
 * Van fit size. Catalog bounds [165.12, 87.17, 80.48]: the longest bound is the
 * length, so fitting to 2.7 yields a van about 1.42 wide - a comfortable
 * single-vehicle footprint on a 2.64-wide road.
 */
const VAN_TARGET_LENGTH = 2.7;
const vanBounds = assets.courierVan.bounds;
const vanScale = VAN_TARGET_LENGTH / Math.max(...vanBounds);
const VAN_HALF_WIDTH = (vanScale * Math.min(vanBounds[0]!, vanBounds[2]!)) / 2;
const VAN_COLLIDER_RADIUS = VAN_HALF_WIDTH + 0.05;

const START_SITE: ZoneSite = ZONE_SITES.find((site) => site.id === "depot-west-curb") ?? ZONE_SITES[0]!;
const START_HEADING = Math.PI / 2;
void START_HEADING;

const vanVehicle: GameArcadeVehicle = createGameArcadeVehicle({
  maxSpeed: VAN_TUNE.maxSpeed,
  acceleration: VAN_TUNE.acceleration,
  brakeStrength: VAN_TUNE.brakeStrength,
  reverseSpeed: VAN_TUNE.reverseSpeed,
  drag: VAN_TUNE.drag,
  steerRate: VAN_TUNE.steerRate
});

// ---- simulation state ---------------------------------------------------------
let dispatch: DispatchState = createDispatchState();
let paused = false;
let frameCount = 0;
let dropLookbackRemainingSeconds = 0;
let lastVanSpeed = 0;
let lastVanHeading = START_HEADING;
let parcelAttachedVisible = false;
/** Short renderer-owned impact envelope. It is fed only by a real strike,
 * never by a HUD timer or a decorative loop. */
let impactFeedbackRemainingSeconds = 0;

interface ZoneEventRecord {
  readonly type: string;
  readonly zoneId: string;
  readonly onTriggerEnter: boolean;
  readonly deliveryIndex: number;
  readonly timerMsAtEvent: number;
}

const zoneEvents: ZoneEventRecord[] = [];
const strikeLog: { source: string; x: number; z: number; timerMs: number }[] = [];
const observed = {
  driveChangedState: false,
  steeringChangesHeading: false,
  pickupFired: false,
  dropFired: false,
  strikeObserved: false,
  timerFailObserved: false,
  strikeFailObserved: false,
  resetRestoresShift: false,
  pauseFreezesSim: false,
  courtesyStopObserved: false,
  trafficMovedObserved: false,
  parcelVisibleInBed: false,
  allDeliveriesInsideTimers: false
};

/** Shift start: on the free southbound lane, nose north toward the first dock. */
const SPAWN_POSE = { x: -0.45, z: 18.6, heading: -Math.PI / 2 };

function resetVan(): void {
  vanVehicle.reset({ x: SPAWN_POSE.x, z: SPAWN_POSE.z, heading: SPAWN_POSE.heading, speed: 0, drift: 0 });
}
resetVan();

// ---- chase camera -------------------------------------------------------------
const chaseCamera = camera.follow({
  // The catalog van needs a +PI/2 mesh correction, while a follow camera needs
  // the simulation's actual heading. A dedicated invisible rig keeps those two
  // coordinate systems independent so the camera cannot become broadside.
  targetNode: "courier-camera-target",
  // The review lens looks through the vehicle rather than several metres past
  // it: the previous -2.45 target offset pushed the van through the bottom edge
  // and turned the retained frame into a cropped roof shot.
  targetOffset: visualReviewCapture ? [0, 0.68, -0.35] : [0, 0.92, -2.1],
  offsetMode: "target-yaw",
  offset: visualReviewCapture
    ? [0.72, 2.46, 8.65]
    : [0.22, CHASE_CAMERA.height + 1.0, CHASE_CAMERA.distance + 1.8] as [number, number, number],
  fov: visualReviewCapture ? 53 : 55,
  // Review retains the normal follow rig but removes its long residual pan so
  // a real collision is framed where the simulation says it occurred.
  smoothing: visualReviewCapture ? 0.1 : CHASE_CAMERA.smoothing
});

type MutableChaseCamera = { offset?: readonly [number, number, number] };

// ---- scene --------------------------------------------------------------------
const app = createAuraApp("#app", {
  diagnostics: { overlay: debugMode, performancePanel: false },
  scene: scene()
  .background("#030711")
    .addMany(dressing.staticNodes)
    .addMany(dressing.pickupZone)
    .addMany(dressing.dropZone)
    // Aurora Noir / Midnight Slate city night lighting
    .add(effects.fog({ name: "night city haze", color: "#090714", density: visualReviewCapture ? 0.0042 : 0.0018, intensity: visualReviewCapture ? 0.58 : 0.44 }))
    .add(effects.neonBloom({ intensity: reducedMotion ? 0.18 : visualReviewCapture ? 0.64 : 0.78 }))
    .add(lights.ambient({ name: "night city fill", color: "#718da5", intensity: visualReviewCapture ? 0.42 : 1.72 }))
    .add(lights.directional({ name: "moonlight key", color: "#d8f5ff", intensity: visualReviewCapture ? 3.8 : 2.55 }).position(-18, 26, 8))
    .add(lights.directional({ name: "city glow fill", color: "#36bdd2", intensity: visualReviewCapture ? 1.9 : 1.42 }).position(20, 18, 16))
    .add(lights.point({ name: "courier hero key", color: "#e8fbff", intensity: visualReviewCapture ? 5.4 : 4.8 }).position(-1.6, 2.4, 6.5))
    .add(lights.point({ name: "courier hero rim", color: "#ff557f", intensity: visualReviewCapture ? 4.0 : 0 }).position(2.2, 1.8, 3.5))
     .add(lights.point({ name: "courier intersection practical", color: "#ff9d66", intensity: 2.4 }).position(0, 3.8, 0))
     .add(lights.point({ name: "courier forward cyan practical", color: "#22d3ee", intensity: 2.8 }).position(0, 3.4, 8.5))
     .add(lights.point({ name: "courier forward warning practical", color: "#fb7185", intensity: 2.2 }).position(0, 2.6, 12.8))
    .add(lights.point({ name: "depot dock warm light", color: "#fbbf24", intensity: 1.25 })
      .position(START_SITE.x + 4.5, 5.0, START_SITE.z))
    // Van fleet: every moving part is a top-level runtime node (the mutable
    // registry covers model/primitive/group/label nodes, so nothing rides in a
    // group hierarchy here).
    .add(
      model(assets.courierVan, {
        name: "courier-van",
        role: "primaryVehicle",
        scaleMode: "fit",
        // Give the typed vehicle a modest presentation lift in the named
        // review frame without changing its arcade collider or route physics.
        targetMaxDimension: visualReviewCapture ? 2.95 : VAN_TARGET_LENGTH,
        // The catalog van is authored in a very dark delivery livery. Keep
        // the typed GLB and its provenance, but lift the body into a cool
        // midnight-blue PBR finish so the cab, cargo box, and wheel contact
        // remain readable in the pressure capture without a CSS cheat.
        material: material.pbr({
          name: "courier van midnight finish",
          color: visualReviewCapture ? "#8fcfe2" : "#1f6288",
          roughness: visualReviewCapture ? 0.18 : 0.27,
          metallic: visualReviewCapture ? 0.62 : 0.48,
          clearcoat: visualReviewCapture ? 0.58 : 0.34,
          clearcoatRoughness: visualReviewCapture ? 0.1 : 0.14,
          emissive: visualReviewCapture ? "#164d68" : "#09263f",
          emissiveIntensity: visualReviewCapture ? 0.38 : 0.18
        }),
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: "courier-van", tags: ["player", "vehicle", "typed-primary-asset"] })
    )
    .add(
      primitives.sphere({
        name: "courier chase camera target",
        material: material.pbr({ name: "courier camera target hidden", color: "#030711", opacity: 0.001 })
      })
        .position(SPAWN_POSE.x, -2, SPAWN_POSE.z)
        .rotate(0, -SPAWN_POSE.heading - Math.PI / 2, 0)
        .scale(0.001)
        .runtime({ id: "courier-camera-target", tags: ["camera-rig", "renderer-owned"] })
    )
    .add(
      model(assets.courierParcel, {
        name: "courier-parcel",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: visualReviewCapture ? 0.58 : 0.76,
        material: material.pbr({ name: "parcel safety-orange finish", color: "#f5ad4f", roughness: 0.38, metallic: 0.08, clearcoat: 0.2, emissive: "#6b2f10", emissiveIntensity: 0.13 }),
        castShadow: true
      }).position(-999, 0.86, -999).scale(0.001)
        .runtime({ id: "courier-parcel", tags: ["cargo", "typed-primary-asset"] })
    )
    .addMany([...vanHeadlightPools(), ...vanSpeedStreaks(), ...vanTireContactPatches()])
    // Traffic fleet: two typed variants on the authored lane loops.
    .addMany(trafficSim.cars().map((car) =>
      model(car.variant === "sedan" ? assets.courierTrafficSedan : assets.courierTrafficHatch, {
        name: car.id,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: car.variant === "sedan" ? 2.55 : 2.35,
        material: material.pbr({
          name: car.variant === "sedan" ? "courier traffic sedan lacquer" : "courier traffic hatch lacquer",
          color: car.variant === "sedan" ? "#e45b74" : "#54c8d9",
          roughness: 0.26,
          metallic: 0.48,
          clearcoat: 0.38,
          clearcoatRoughness: 0.14
        }),
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: car.id, tags: ["traffic", "typed-secondary-asset", "route-local-ai"] })
    ))
    .camera(chaseCamera)
});

/** Two warm emissive pools ahead of the van: readable headlight practicals. */
function vanHeadlightPools() {
  return ["left", "right"].map((side) =>
    primitives.box({
      name: "van headlight pool " + side,
      material: material.emissive({ color: "#ffe9b8", emissive: "#ffd98a", emissiveIntensity: 1.05, opacity: 0.85 })
    }).position(-999, 0.055, -999).scale([2.3, 0.02, 0.72])
      .runtime({ id: "courier-headlight-" + side, tags: ["headlight", "renderer-owned"] })
  );
}

/** Renderer-owned ground streaks that make the van's live forward motion read
 * in a still capture without pretending that CSS or a HUD is the road. */
function vanSpeedStreaks() {
  const streakMaterial = material.emissive({ name: "van speed streak", color: "#5eead4", emissive: "#14b8a6", emissiveIntensity: 1.35, opacity: 0.86 });
  return ["left", "right", "center"].map((side) =>
    primitives.box({
      name: "van speed streak " + side,
      material: streakMaterial
    }).position(-999, 0.052, -999).scale([side === "center" ? 0.035 : 0.022, 0.012, 0.72])
      .runtime({ id: "courier-speed-streak-" + side, tags: ["vehicle-motion", "renderer-owned"] })
  );
}

/**
 * Four small wet-contact patches sit exactly under the van's wheels. They
 * appear only while the kinematic vehicle has speed and lengthen with it, so
 * the reflected road response belongs to the moving typed van rather than to
 * a static neon decal or the HUD.
 */
function vanTireContactPatches() {
  const contactMaterial = material.emissive({
    name: "courier wet tyre contact reflection",
    color: "#bdf7ff",
    emissive: "#167e98",
    emissiveIntensity: 0.72,
    opacity: 0.5
  });
  return ["front-left", "front-right", "rear-left", "rear-right"].map((corner) =>
    primitives.box({ name: "courier tyre contact " + corner, material: contactMaterial })
      .position(-999, 0.028, -999)
      .scale([0.11, 0.008, 0.38])
      .runtime({ id: "courier-tyre-contact-" + corner, tags: ["vehicle-motion", "wet-road-contact", "renderer-owned"] })
  );
}

// ---- runtime handles -----------------------------------------------------------
const vanNode = app.nodes.require("courier-van");
const cameraTargetNode = app.nodes.require("courier-camera-target");
const parcelNode = app.nodes.require("courier-parcel");
const headlightLeft = app.nodes.require("courier-headlight-left");
const headlightRight = app.nodes.require("courier-headlight-right");
const speedStreakNodes = ["left", "right", "center"].map((side) => app.nodes.require("courier-speed-streak-" + side));
const tyreContactNodes = ["front-left", "front-right", "rear-left", "rear-right"].map((corner) => app.nodes.require("courier-tyre-contact-" + corner));
const pickupRingNode = app.nodes.require("courier-pickup-ring");
const pickupBeaconNode = app.nodes.require("courier-pickup-beacon");
const dropRingNode = app.nodes.require("courier-drop-ring");
const dropBeaconNode = app.nodes.require("courier-drop-beacon");
const trafficNodes = new Map<string, AuraRuntimeNodeHandle>();
for (const car of trafficSim.cars()) {
  trafficNodes.set(car.id, app.nodes.require(car.id));
}
let compositionSubjectSuppressed = false;


// ---- evidence ------------------------------------------------------------------
const mountedEvidence = {
  schema: "aura3d-showcase-courier-rush/1.0",
  appId: "showcase-courier-rush",
  status: "ready" as string,
  claimLabel: "prototype" as const,
  mounted: true,
  claimBoundary:
    "Authored arcade delivery van over the cityBlock night kit: createGameArcadeVehicle integrates the delivery tune, createVehicleDriverAi cars hold seeded lane loops with courtesy stops, and sensor zones score pickups and drops. No racing-kit or certified-topology inheritance, no physical suspension or tyre simulation, no damage physics beyond strike counting, no police/pursuit or open-world claims.",
  controls: {
    keyboard: ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyE", "KeyP", "Escape", "KeyR"],
    touch: ["throttle", "reverse", "steer-left", "steer-right", "brake", "interact"]
  },
  seed: SHIFT_SEED,
  state: dispatch.phase as string,
  deliveryIndex: dispatch.deliveryIndex,
  deliveriesTotal: DELIVERY_COUNT,
  timerMs: dispatch.timerMs,
  strikes: dispatch.strikes,
  maxStrikes: MAX_STRIKES,
  combo: dispatch.combo,
  score: dispatch.score,
  parcelAttached: false,
  carrying: false,
  zoneEvents,
  trafficCount: trafficSim.carCount,
  cityKit: {
    kit: "cityBlock",
    timeOfDay: "night" as const,
    scale: 6,
    streetSegments: 6,
    zoneSites: ZONE_SITES.length
  },
  primaryAssets: [
    "assets.courierVan",
    "assets.courierParcel",
    "assets.courierTrafficSedan",
    "assets.courierTrafficHatch",
    "assets.courierZoneBollard",
    "assets.courierZoneAwning"
  ],
  primitiveCount: dressing.routePrimitiveCount,
  knownLimits: [
    "prototype: arcade kinematic van, no physical suspension or tyre model",
    "strike detection uses circle proxies around the van, traffic cars and street props",
    "city towers are set dressing without colliders; streets, bollards and lamp poles carry gameplay",
    "traffic is lane-locked to authored loops with courtesy stops; no free-roam navigation"
  ],
  reducedMotion,
  autopilot: autopilotEnabled,
  timerScale,
  paused,
  frameCount: 0,
  van: { x: 0, z: 0, heading: 0, speed: 0 },
  trafficSummaries: [] as { readonly id: string; readonly x: number; readonly z: number; readonly heading: number; readonly speed: number; readonly courtesyStopped: boolean }[],
  audio: {
    system: "engine.createGameAudio",
    cueCount: 10,
    gestureUnlocked: false,
    sfxReady: false,
    recentCues: [] as readonly string[],
    playedCueCount: 0,
    contextState: "suspended",
    assetUrls: [] as readonly string[]
  },
  gameplay: { ...observed },
  systems: {
    vehicle: "engine.createGameArcadeVehicle",
    driverAi: "engine.createVehicleDriverAi",
    cityKit: "city.cityBlock night preset",
    effects: "game.effects",
    input: "game.input"
  },
  diagnostics: undefined as unknown
};

function refreshAudioEvidence(): void {
  const proof = courierAudio.proof();
  mountedEvidence.audio.gestureUnlocked = proof.gestureUnlocked;
  mountedEvidence.audio.sfxReady = proof.sfxReady;
  mountedEvidence.audio.recentCues = proof.recentCues.slice();
  mountedEvidence.audio.playedCueCount = proof.playedCueCount;
  mountedEvidence.audio.contextState = proof.contextState;
  mountedEvidence.audio.assetUrls = proof.assetUrls.slice();
}

Object.defineProperty(window, "__COURIER_RUSH_EVIDENCE__", {
  value: mountedEvidence as unknown as Record<string, unknown>,
  configurable: true,
  writable: true
});
Object.defineProperty(window, "__AURA3D_SHOWCASE_COURIER_RUSH__", {
  value: mountedEvidence as unknown as Record<string, unknown>,
  configurable: true,
  writable: true
});
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application" as const,
    get subject() {
      return {
        position: [SPAWN_POSE.x, 0, SPAWN_POSE.z] as const,
        rotation: [0, -SPAWN_POSE.heading, 0] as const,
        targetSize: VAN_TARGET_LENGTH
      };
    },
    setSubjectSuppressed(suppressed: boolean) {
      compositionSubjectSuppressed = suppressed;
      vanNode.setVisible(!suppressed);
    },
    settleSubjectPose() {
      paused = true;
      resetVan();
      vanNode
        .setPosition(SPAWN_POSE.x, 0, SPAWN_POSE.z)
        .setRotation(0, -SPAWN_POSE.heading, 0)
        .setVisible(!compositionSubjectSuppressed);
      updateMountedEvidence();
    }
  },
  configurable: true
});

/**
 * Diagnostic hook used by browser specs: places the van at an exact pose. The
 * placement itself changes no rules; everything after it is normal simulation.
 */
Object.defineProperty(window, "__COURIER_RUSH_DEBUG__", {
  value: {
    placeVan(x: number, z: number, heading = START_HEADING): void {
      vanVehicle.reset({ x, z, heading, speed: 0, drift: 0 });
    },
    vanSnapshot(): { x: number; z: number; heading: number; speed: number } {
      const snap = vanVehicle.snapshot();
      return { x: snap.x, z: snap.z, heading: snap.heading, speed: snap.speed };
    }
  } satisfies NonNullable<Window["__COURIER_RUSH_DEBUG__"]>,
  configurable: true
});

// ---- HUD ------------------------------------------------------------------------
const hud = mountCourierHud(document.getElementById("panel")!);

function objectiveText(state: DispatchState): string {
  const plan = currentDelivery(state);
  if (!plan) return state.phase === "shiftClear" ? "Shift complete - press R for a new one" : "Shift over - press R to retry";
  if (state.phase === "awaitingPickup") return "Pick up the parcel at " + plan.pickup.label;
  return "Deliver to " + plan.drop.label;
}

function activeTargetSite(state: DispatchState): ZoneSite | null {
  const plan = currentDelivery(state);
  if (!plan) return null;
  return state.phase === "awaitingPickup" ? plan.pickup : plan.drop;
}

function summaryInput(cleared: boolean) {
  return {
    cleared,
    failReason: dispatch.failReason,
    deliveriesCompleted: dispatch.deliveriesCompleted,
    score: dispatch.score,
    bestCombo: dispatch.bestCombo,
    earlyDrops: dispatch.earlyDrops
  };
}

function handleCourierEvents(
  events: readonly CourierEvent[],
  vanX: number,
  vanZ: number,
  recordedDeliveryIndex: number
): void {
  const dropPayoffOwnsToast = events.some((candidate) => candidate.type === "drop");
  for (const event of events) {
    switch (event.type) {
      case "dispatch":
        playCue("dispatch");
        if (!paused && !dropPayoffOwnsToast) {
          showRadioToast(hud, "<strong>Dispatch:</strong> new job on the radio - grab it from the lit zone.", 3);
        }
        break;
      case "pickup": {
        zoneEvents.push({
          type: "pickup",
          zoneId: event.zoneId,
          onTriggerEnter: event.onTriggerEnter,
          deliveryIndex: recordedDeliveryIndex,
          timerMsAtEvent: Math.round(dispatch.timerMs)
        });
        observed.pickupFired = true;
        playCue("pickup");
        showRadioToast(hud, "<strong>Parcel aboard.</strong> Follow the arrow to the drop zone.", 2.6);
        break;
      }
      case "drop": {
        zoneEvents.push({
          type: "drop",
          zoneId: event.zoneId,
          onTriggerEnter: event.onTriggerEnter,
          deliveryIndex: recordedDeliveryIndex,
          timerMsAtEvent: Math.round(dispatch.timerMs)
        });
        observed.dropFired = true;
        playCue("drop");
        if (event.early) playCue("early-bonus");
        if (!reducedMotion) {
          runtimeEffects.ringShockwave([vanX, 0.25, vanZ], {
            color: event.early ? "#ffd166" : "#7ce8ff",
            intensity: 0.8,
            radius: 2.4
          });
          dropLookbackRemainingSeconds = DROP_LOOKBACK_SECONDS;
        }
        showRadioToast(
          hud,
          "<strong>Delivered.</strong> +" + event.pointsAwarded +
            " at x" + event.multiplier.toFixed(1) + (event.early ? " - early bonus!" : ""),
          2.8
        );
        break;
      }
      case "comboReset":
        showRadioToast(hud, "<strong>Late drop.</strong> Combo reset to x1.0.", 2.4);
        break;
      case "strike":
        observed.strikeObserved = true;
        strikeLog.push({
          source: event.source,
          x: round3(vanX),
          z: round3(vanZ),
          timerMs: Math.round(dispatch.timerMs)
        });
        playCue("strike");
        pulseStrikeFlash(hud);
        showRadioToast(hud, "<strong>Strike " + event.strikes + "/" + MAX_STRIKES + ".</strong> Watch the panel work!", 2.2);
        break;
      case "timerFail":
        observed.timerFailObserved = true;
        playCue("shift-fail");
        showShiftSummary(hud, summaryInput(false));
        break;
      case "strikesExhausted":
        observed.strikeFailObserved = true;
        playCue("shift-fail");
        showShiftSummary(hud, summaryInput(false));
        break;
      case "shiftClear":
        observed.allDeliveriesInsideTimers = true;
        playCue("shift-clear");
        showRadioToast(hud, "<strong>That's the shift.</strong> Every delivery landed inside its window!", 4);
        showShiftSummary(hud, summaryInput(true));
        break;
      default:
        break;
    }
  }
}


// ---- autopilot -----------------------------------------------------------------
let legWaypoints: GridPoint[] = [];
let legKey = "";

/**
 * Diagnostic autopilot: projects the van onto the AUTHORED leg polyline and
 * pursues a look-ahead point at capped speed. Same VanDriveInput contract as
 * keyboard play; evidence marks autopilot=true so nothing here reads as human
 * play.
 */
let activeLeg: readonly GridPoint[] = [];
let activeLegKey = "";
let legProgressIndex = 0;
let mountedEvidenceAutopilot: { x: number; z: number; left: number } | null = null;

function projectOntoLeg(vanX: number, vanZ: number): void {
  // Advance the progress segment while the van has passed the current one.
  let guard = 0;
  while (
    activeLeg && legProgressIndex < activeLeg.length - 1 && guard < 64
  ) {
    guard += 1;
    const a = activeLeg[legProgressIndex]!;
    const b = activeLeg[legProgressIndex + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lengthSq = abx * abx + abz * abz;
    if (lengthSq === 0) {
      legProgressIndex += 1;
      continue;
    }
    const t = ((vanX - a.x) * abx + (vanZ - a.z) * abz) / lengthSq;
    if (t > 1) {
      legProgressIndex += 1;
      continue;
    }
    break;
  }
}

function autopilotDrive(vanX: number, vanZ: number, heading: number, speed: number): VanDriveInput {
  const target = activeTargetSite(dispatch);
  if (!target) return { throttle: 0, brake: 1, steer: 0, handbrake: false };

  const jobIndex = Math.min(dispatch.deliveryIndex, COURIER_ROUTES.length - 1);
  const key = jobIndex + ":" + (dispatch.phase === "carrying" ? "d" : "p");
  if (key !== activeLegKey || !activeLeg) {
    activeLegKey = key;
    const legs = COURIER_ROUTES[jobIndex]!;
    activeLeg = dispatch.phase === "carrying" ? legs.dropLeg : legs.pickupLeg;
    legProgressIndex = 0;
  }
  projectOntoLeg(vanX, vanZ);

  // Look-ahead point: walk LOOKAHEAD units down the polyline from the
  // projection segment start (a stable carrot the van can actually chase).
  const LOOKAHEAD = 5.2;
  let remaining = LOOKAHEAD;
  let aimX = target.x;
  let aimZ = target.z;
  let index = legProgressIndex;
  let anchorX = activeLeg[index]!.x;
  let anchorZ = activeLeg[index]!.z;
  // Anchor at the projection of the van onto the current segment.
  {
    const a = activeLeg[index]!;
    const b = (activeLeg[index + 1] ?? a)!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lengthSq = abx * abx + abz * abz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((vanX - a.x) * abx + (vanZ - a.z) * abz) / lengthSq));
    anchorX = a.x + abx * t;
    anchorZ = a.z + abz * t;
    const segLeft = Math.hypot(b.x - anchorX, b.z - anchorZ);
    if (segLeft >= remaining || index >= activeLeg.length - 1) {
      const denom = Math.max(0.001, segLeft);
      aimX = anchorX + ((b.x - anchorX) / denom) * remaining;
      aimZ = anchorZ + ((b.z - anchorZ) / denom) * remaining;
    } else {
      remaining -= segLeft;
      index += 1;
      while (index < activeLeg.length) {
        const node = activeLeg[index]!;
        const d = Math.hypot(node.x - anchorX, node.z - anchorZ);
        if (d >= remaining || index === activeLeg.length - 1) {
          const denom = Math.max(0.001, d);
          aimX = anchorX + ((node.x - anchorX) / denom) * remaining;
          aimZ = anchorZ + ((node.z - anchorZ) / denom) * remaining;
          break;
        }
        remaining -= d;
        anchorX = node.x;
        anchorZ = node.z;
        index += 1;
      }
    }
  }

  (mountedEvidenceAutopilot ??= { x: 0, z: 0, left: 0 });
  mountedEvidenceAutopilot.x = round3(aimX);
  mountedEvidenceAutopilot.z = round3(aimZ);
  mountedEvidenceAutopilot.left = activeLeg.length - legProgressIndex;
  const dx = aimX - vanX;
  const dz = aimZ - vanZ;
  const bearingToAim = Math.atan2(dz, dx);
  let delta = bearingToAim - heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  // Gentle gain: the carrot does the steering, not aggressive corrections.
  let steer = Math.max(-1, Math.min(1, delta * 1.15));

  // Obstacle avoidance: bias away from prop circles ahead of the van.
  const fx = Math.cos(heading);
  const fz = Math.sin(heading);
  let avoid = 0;
  let blockedAhead = false;
  for (const collider of [...propColliders, ...trafficSim.staticColliders()]) {
    const ox = collider.x - vanX;
    const oz = collider.z - vanZ;
    const dist = Math.hypot(ox, oz);
    const reach = collider.radius + VAN_COLLIDER_RADIUS + 1.15;
    if (dist > reach || dist < 1e-3) continue;
    const aheadDot = (ox * fx + oz * fz) / dist;
    if (aheadDot < 0.25) continue;
    const side = ox * -fz + oz * fx;
    avoid += (side >= 0 ? -1 : 1) * (1 - dist / reach) * (0.55 + 0.45 * aheadDot);
    if (aheadDot > 0.8 && dist < collider.radius + VAN_COLLIDER_RADIUS + 0.25) blockedAhead = true;
  }
  steer = Math.max(-1, Math.min(1, steer + avoid * 0.9));

  // Corner-aware cruise: scrub speed ahead of a sharp polyline vertex so the
  // turn radius stays inside the street, then accelerate back out. The van
  // cannot track the carrot at full pace through a corner - lamp poles sit
  // exactly where an overshot corner goes.
  let vertexTurnSharpness = 0;
  {
    const a = activeLeg[legProgressIndex]!;
    const b = activeLeg[legProgressIndex + 1] ?? a;
    const c = activeLeg[legProgressIndex + 2] ?? b;
    if (c !== b) {
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const bcx = c.x - b.x;
      const bcz = c.z - b.z;
      const cross = Math.abs(abx * bcz - abz * bcx);
      const denom = Math.hypot(abx, abz) * Math.hypot(bcx, bcz);
      if (denom > 0.001) vertexTurnSharpness = Math.max(0, Math.min(1, cross / denom));
    }
  }
  const finalDistance = Math.hypot(target.x - vanX, target.z - vanZ);
  const cornerBrake = vertexTurnSharpness > 0.35 && Math.abs(delta) < 0.6 && speed > 5.4 ? 0.75 : 0;
  const approachBrake = finalDistance < 3.4 && speed > 3 ? 0.8 : blockedAhead ? 0.6 : cornerBrake;
  const throttle = blockedAhead
    ? 0
    : Math.abs(delta) > 0.95
      ? 0.3
      : finalDistance < 2.8 ? 0.14 : vertexTurnSharpness > 0.35 && speed > 7.6 ? 0 : 0.52;
  return { throttle, brake: approachBrake, steer, handbrake: false };
}

// ---- strike handling --------------------------------------------------------------
const PARALLEL_PASS_SPEED_TOLERANCE = 1.35;

function collisionHits(vanX: number, vanZ: number, vanSpeed: number): PropCollider[] {
  const hits: PropCollider[] = [];
  const colliders: readonly PropCollider[] = [...propColliders, ...trafficSim.staticColliders()];
  for (const collider of colliders) {
    const reach = collider.radius + VAN_COLLIDER_RADIUS;
    const dx = vanX - collider.x;
    const dz = vanZ - collider.z;
    if (dx * dx + dz * dz >= reach * reach) continue;
    // Adjacent-lane passes at matched pace are city driving, not crashes:
    // a traffic strike needs a real closing speed. Static props always count.
    if (collider.speed !== undefined && Math.abs(vanSpeed - collider.speed) < PARALLEL_PASS_SPEED_TOLERANCE) continue;
    hits.push(collider);
  }
  return hits;
}

function pushOut(vanX: number, vanZ: number, collider: PropCollider): { x: number; z: number } {
  const dx = vanX - collider.x;
  const dz = vanZ - collider.z;
  const distance = Math.max(0.001, Math.hypot(dx, dz));
  const reach = collider.radius + VAN_COLLIDER_RADIUS;
  return { x: collider.x + (dx / distance) * reach, z: collider.z + (dz / distance) * reach };
}

// ---- main loop ----------------------------------------------------------------------
app.onFrame(({ dt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  frameCount += 1;
  decayHudEffects(hud, stepSeconds);
  input.update(stepSeconds);

  if (input.pressed("pause")) {
    paused = !paused;
    playCue("dispatch");
  }

  if (input.pressed("reset")) {
    const hadEnded = dispatch.phase === "shiftOver" || dispatch.phase === "shiftClear";
    dispatch = createDispatchState();
    trafficSim.reset();
    resetVan();
    parcelAttachedVisible = false;
    zoneEvents.length = 0;
    dropLookbackRemainingSeconds = 0;
    impactFeedbackRemainingSeconds = 0;
    legWaypoints = [];
    legKey = "";
    hideShiftSummary(hud);
    if (hadEnded) {
      observed.resetRestoresShift = true;
      playCue("dispatch");
      showRadioToast(hud, "<strong>New shift.</strong> Dispatch has five jobs with your name on them.", 3);
    }
  }

  if (paused) {
    observed.pauseFreezesSim = true;
    updateMountedEvidence();
    updateCourierHud(hud, currentHudFrame());
    refreshAudioEvidence();
    return;
  }

  const snapshotBefore = vanVehicle.snapshot();
  const previousDeliveryIndex = dispatch.deliveryIndex;

  // Simulation order: dispatch sensors -> van physics -> traffic -> presentation.
  const dispatchResult = stepDispatch(dispatch, stepSeconds * 1000 * timerScale, {
    vanX: snapshotBefore.x,
    vanZ: snapshotBefore.z,
    interactPressed: input.pressed("interact")
  });
  dispatch = dispatchResult.state;
  handleCourierEvents(dispatchResult.events, snapshotBefore.x, snapshotBefore.z, previousDeliveryIndex);

  const plan = currentDelivery(dispatch);
  const driveInput: VanDriveInput = autopilotEnabled && plan
    ? autopilotDrive(snapshotBefore.x, snapshotBefore.z, snapshotBefore.heading, Math.abs(snapshotBefore.speed))
    : {
        throttle: input.held("throttle") ? 1 : 0,
        brake: input.held("brake") ? 1 : 0,
        steer: input.axis("steer"),
        handbrake: input.held("handbrake")
      };

  if (autopilotEnabled) {
    (mountedEvidence as unknown as { apInput: unknown }).apInput = {
      throttle: round3(driveInput.throttle),
      brake: round3(driveInput.brake),
      steer: round3(driveInput.steer),
      hb: driveInput.handbrake
    };
  }
  const { input: arcadeInput, handbrake } = toArcadeVehicleInput(driveInput);
  let vanAfter = vanVehicle.step(stepSeconds, arcadeInput);
  if (handbrake) {
    vanAfter = vanVehicle.constrain({ speedMultiplier: handbrakeSpeedMultiplier(stepSeconds) });
  }

  // Strike detection against static props and live traffic footprints.
  const hits = collisionHits(vanAfter.x, vanAfter.z, vanAfter.speed);
  if (hits.length > 0) {
    const hitIndexBefore = dispatch.deliveryIndex;
    const strikeResult = applyStrike(dispatch, hits[0]!.id);
    dispatch = strikeResult.state;
    if (strikeResult.events.length > 0) {
      handleCourierEvents(strikeResult.events, vanAfter.x, vanAfter.z, hitIndexBefore);
      const hit = hits[0]!;
      const beforePushX = vanAfter.x;
      const beforePushZ = vanAfter.z;
      const distance = Math.max(0.001, Math.hypot(beforePushX - hit.x, beforePushZ - hit.z));
      // Renderer feedback belongs at the measured contact boundary, not at an
      // arbitrary camera marker or the post-resolution van position. That
      // makes the spark proof causal: actual strike collider -> contact point
      // -> transient renderer-owned effect.
      const contactX = hit.x + ((beforePushX - hit.x) / distance) * hit.radius;
      const contactZ = hit.z + ((beforePushZ - hit.z) / distance) * hit.radius;
      const pushed = pushOut(beforePushX, beforePushZ, hit);
      vanAfter = vanVehicle.constrain({ x: pushed.x, z: pushed.z, speedMultiplier: 0.35 });
      impactFeedbackRemainingSeconds = reducedMotion ? 0.12 : 0.42;
      if (!reducedMotion) {
        runtimeEffects.hitSpark([contactX, 0.52, contactZ], { color: "#ff8d6a", intensity: 0.82, radius: 1.08 });
      }
      (mountedEvidence as unknown as { lastImpact: unknown }).lastImpact = {
        source: hit.id,
        contact: { x: round3(contactX), z: round3(contactZ) },
        vanBeforeResolution: { x: round3(beforePushX), z: round3(beforePushZ) },
        vanAfterResolution: { x: round3(pushed.x), z: round3(pushed.z) },
        frame: frameCount
      };
    }
  }

  // Traffic steps with the van position so nearby courtesy horns can fire.
  const trafficEvents = trafficSim.step(stepSeconds, vanAfter.x, vanAfter.z);
  if (trafficEvents.length > 0) playCue("horn");

  // Drive-feel observations for evidence honesty.
  observed.driveChangedState ||= Math.abs(vanAfter.speed - lastVanSpeed) > 0.001 || Math.abs(vanAfter.speed) > 0.02;
  observed.steeringChangesHeading ||= Math.abs(vanAfter.heading - lastVanHeading) > 0.001;
  lastVanSpeed = vanAfter.speed;
  lastVanHeading = vanAfter.heading;

  const carsNow = trafficSim.cars();
  observed.trafficMovedObserved ||= carsNow.some((car) => car.speed > 0.4);
  observed.courtesyStopObserved ||= carsNow.some((car) => car.courtesyStopped);

  // ---- presentation updates -----------------------------------------------------
  const fx = Math.cos(vanAfter.heading);
  const fz = Math.sin(vanAfter.heading);
  // `courierVan` is authored with its nose on +X. The runtime heading basis
  // expects the vehicle's forward axis opposite the camera-facing +Z side, so
  // the former `-heading` correction made the van drive nose-first toward its
  // own chase camera. The additional half-turn presents the cargo doors to the
  // trailing eye and keeps the typed vehicle aligned with actual motion.
  vanNode.setPosition(vanAfter.x, 0, vanAfter.z).setRotation(0, -vanAfter.heading + Math.PI, 0);
  cameraTargetNode
    .setPosition(vanAfter.x, 0.2, vanAfter.z)
    .setRotation(0, -vanAfter.heading - Math.PI / 2, 0)
    .setVisible(false);
  const rightX = -fz;
  const rightZ = fx;
  const impactFlash = impactFeedbackRemainingSeconds > 0 ? 1 : 0;

  // Parcel rides high in the rear bed (behind the cab). The box is deliberately
  // lifted above the van roofline by a small, physically plausible margin: the
  // source GLB's broad carton otherwise disappears inside the rear-door shell
  // from this low chase camera. It stays on the van's local centreline so the
  // typed cargo reads as cargo in the retained pickup frame rather than a HUD
  // substitute or a detached world prop. The slightly larger fit is still
  // below the van's body width but gives the delivery objective a readable
  // silhouette at the exact 1280x800 review viewport.
  parcelNode.setPosition(vanAfter.x - fx * 0.08, visualReviewCapture ? 1.5 : 1.36, vanAfter.z - fz * 0.3)
    .setRotation(0, -vanAfter.heading, 0);
  parcelNode.setScale(parcelAttachedVisible ? 1 : 0.001);
  observed.parcelVisibleInBed ||= parcelAttachedVisible;
  // Headlight pools lead the van along its heading.
  headlightLeft.setPosition(vanAfter.x + fx * 2.1 - fz * 0.42, 0.055, vanAfter.z + fz * 2.1 + fx * 0.42)
    .setRotation(0, -vanAfter.heading, 0);
  headlightRight.setPosition(vanAfter.x + fx * 2.1 + fz * 0.42, 0.055, vanAfter.z + fz * 2.1 - fx * 0.42)
    .setRotation(0, -vanAfter.heading, 0);
  const streakVisible = Math.abs(vanAfter.speed) > 0.42 && !reducedMotion;
  const streakLength = Math.min(1.85, 0.82 + Math.abs(vanAfter.speed) * 0.065);
  const streakOffsets = [-0.58, 0.58, 0] as const;
  for (let index = 0; index < speedStreakNodes.length; index += 1) {
    const lateral = streakOffsets[index]!;
    const node = speedStreakNodes[index]!;
    node.setPosition(
      vanAfter.x - fx * (0.45 + index * 0.18) - fz * lateral,
      0.052,
      vanAfter.z - fz * (0.45 + index * 0.18) + fx * lateral
    ).setRotation(0, -vanAfter.heading, 0)
      .setScale([index === 2 ? 0.035 : 0.022, 0.012, streakLength])
      .setVisible(streakVisible);
  }
  // Wet asphalt catches tyre light only under actual moving wheels. Faster
  // travel lengthens the contact mark; hard braking/impact briefly strengthens
  // the front patches. This is visual response to the arcade vehicle state,
  // not a separate animation system.
  const contactVisible = Math.abs(vanAfter.speed) > 0.55 && !reducedMotion;
  const contactLength = Math.min(0.92, 0.25 + Math.abs(vanAfter.speed) * 0.052 + (driveInput.brake > 0 ? 0.18 : 0));
  const contactPositions = [
    { forward: 0.72, lateral: -0.54 },
    { forward: 0.72, lateral: 0.54 },
    { forward: -0.72, lateral: -0.54 },
    { forward: -0.72, lateral: 0.54 }
  ] as const;
  for (let index = 0; index < tyreContactNodes.length; index += 1) {
    const contact = contactPositions[index]!;
    const impulse = impactFlash && index < 2 ? 1.3 : 1;
    tyreContactNodes[index]!
      .setPosition(vanAfter.x + fx * contact.forward + rightX * contact.lateral, 0.028, vanAfter.z + fz * contact.forward + rightZ * contact.lateral)
      .setRotation(0, -vanAfter.heading, 0)
      .setScale([0.11 * impulse, 0.008, contactLength * impulse])
      .setVisible(contactVisible);
  }

  for (const car of carsNow) {
    const node = trafficNodes.get(car.id);
    if (node) {
      node.setPosition(car.x, 0, car.z).setRotation(0, -car.heading, 0);
      // The cinematic canyon is coordinate-aligned to the real east avenue;
      // never cull its typed traffic just because a post-contact resolution
      // moved the van a fraction of a metre. A live car must remain visible
      // through its causal approach/contact/recovery sequence.
      node.setVisible(true);
    }
  }

  const carrying = dispatch.phase === "carrying";
  const planNow = currentDelivery(dispatch);
  parcelAttachedVisible = Boolean(planNow && carrying);
  const pickupSite = planNow && !carrying ? planNow.pickup : null;
  const dropSite = planNow && carrying ? planNow.drop : null;
  const ringPulse = reducedMotion ? 1 : 1 + Math.sin(frameCount * 0.09) * 0.05;
  if (pickupSite) {
    pickupRingNode.setPosition(pickupSite.x, 0.06, pickupSite.z);
    pickupBeaconNode.setPosition(pickupSite.x, 2.6, pickupSite.z);
  }
  if (dropSite) {
    dropRingNode.setPosition(dropSite.x, 0.06, dropSite.z);
    dropBeaconNode.setPosition(dropSite.x, 2.6, dropSite.z);
  }
  pickupRingNode.setScale(pickupSite ? ringPulse : 0.0001);
  pickupBeaconNode.setScale(pickupSite ? 1 : 0.0001);
  dropRingNode.setScale(dropSite ? ringPulse : 0.0001);
  dropBeaconNode.setScale(dropSite ? 1 : 0.0001);

  // Drop look-back camera blend (skipped under reduced motion).
  if (dropLookbackRemainingSeconds > 0) {
    dropLookbackRemainingSeconds = Math.max(0, dropLookbackRemainingSeconds - stepSeconds);
  }
  const chaseBlend = dropLookbackRemainingSeconds > 0
    ? Math.sin((1 - dropLookbackRemainingSeconds / DROP_LOOKBACK_SECONDS) * Math.PI)
    : 0;
  const offset = chaseOffsetForBlend(chaseBlend, visualReviewCapture ? 8.65 : undefined);
  Object.assign(chaseCamera as unknown as MutableChaseCamera, {
    offset: [
      visualReviewCapture ? 0.72 + offset.offsetX * 0.12 : offset.offsetX,
      visualReviewCapture ? 2.46 : offset.offsetY,
      offset.offsetZ
    ] as const
  });

  runtimeEffects.update(stepSeconds);
  impactFeedbackRemainingSeconds = Math.max(0, impactFeedbackRemainingSeconds - stepSeconds);
  if (frameCount % 30 === 0) mountedEvidence.diagnostics = app.diagnostics();
  updateMountedEvidence();
  updateCourierHud(hud, currentHudFrame());
  refreshAudioEvidence();
});

function currentHudFrame() {
  const plan = currentDelivery(dispatch);
  const vanSnap = vanVehicle.snapshot();
  const target = activeTargetSite(dispatch);
  let arrowBearing: number | null = null;
  if (target) {
    const dx = target.x - vanSnap.x;
    const dz = target.z - vanSnap.z;
    const forwardX = Math.cos(vanSnap.heading);
    const forwardZ = Math.sin(vanSnap.heading);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    arrowBearing = Math.atan2(dx * rightX + dz * rightZ, dx * forwardX + dz * forwardZ);
  }
  return {
    objective: objectiveText(dispatch),
    meta: "Job " + Math.min(dispatch.deliveryIndex + 1, DELIVERY_COUNT) + " of " + DELIVERY_COUNT,
    timerSeconds: dispatch.timerMs / 1000,
    timerFraction: plan ? dispatch.timerMs / plan.timerMs : 0,
    strikes: dispatch.strikes,
    maxStrikes: MAX_STRIKES,
    combo: dispatch.combo,
    score: dispatch.score,
    arrowBearing,
    carrying: dispatch.phase === "carrying"
  };
}

function updateMountedEvidence(): void {
  const vanSnap = vanVehicle.snapshot();
  const activeSite = activeTargetSite(dispatch);
  (mountedEvidence as unknown as { activeTargetId: string | null }).activeTargetId = activeSite ? activeSite.id : null;
  (mountedEvidence as unknown as { routeLength: number }).routeLength = legWaypoints.length;
  if (mountedEvidenceAutopilot) {
    (mountedEvidence as unknown as { autopilotAim: { x: number; z: number; left: number } }).autopilotAim = {
      ...mountedEvidenceAutopilot
    };
  }
  mountedEvidence.state = dispatch.phase;
  mountedEvidence.deliveryIndex = dispatch.deliveryIndex;
  mountedEvidence.timerMs = Math.round(dispatch.timerMs);
  mountedEvidence.strikes = dispatch.strikes;
  mountedEvidence.combo = dispatch.combo;
  mountedEvidence.score = dispatch.score;
  mountedEvidence.paused = paused;
  mountedEvidence.frameCount = frameCount;
  mountedEvidence.van = {
    x: round3(vanSnap.x),
    z: round3(vanSnap.z),
    heading: round3(vanSnap.heading),
    speed: round3(vanSnap.speed)
  };
  mountedEvidence.parcelAttached = parcelAttachedVisible;
  mountedEvidence.carrying = dispatch.phase === "carrying";
  mountedEvidence.trafficSummaries = trafficSim.cars().map((car) => ({
    id: car.id,
    x: round3(car.x),
    z: round3(car.z),
    heading: round3(car.heading),
    speed: round3(car.speed),
    courtesyStopped: car.courtesyStopped
  }));
  mountedEvidence.gameplay = { ...observed };
  (mountedEvidence as unknown as { strikeLog: unknown }).strikeLog = strikeLog.slice(-12);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

updateCourierHud(hud, currentHudFrame());
showRadioToast(hud, "<strong>Dispatch:</strong> five jobs tonight. Shift starts when you hit the gas.", 4);

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = String(
    (diagnostics as { runtimeBackend?: string }).runtimeBackend ?? (diagnostics as { backend?: string }).backend ?? ""
  );
  window.__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
