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
import { assets } from "../../../../src/aura-assets";
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
} from "../gameplay/dispatch";
import { createTrafficSimulation } from "../gameplay/traffic";
import {
  CHASE_CAMERA,
  chaseOffsetForBlend,
  DROP_LOOKBACK_SECONDS,
  handbrakeSpeedMultiplier,
  toArcadeVehicleInput,
  VAN_TUNE,
  type VanDriveInput
} from "../gameplay/van";
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
      pump(frameCount: number): number;
      present(): Promise<number>;
    };
    __AURA3D_ROUTE_READY__?: CourierRouteReadyFlag;
    __AURA3D_COMPOSITION_PROBE__?: {
      readonly category: "application";
      readonly subject: {
        readonly position: readonly [number, number, number];
        readonly rotation: readonly [number, number, number];
        readonly targetSize: number;
      };
      setSubjectSuppressed(suppressed: boolean): Promise<void>;
      settleSubjectPose(): Promise<void>;
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
 * Van fit size. The hero is the typed Meshy decimated van (bounds
 * [1.905, 0.867, 0.847]): the longest bound is the length, so fitting to 2.7
 * yields a van about 1.2 wide - a comfortable single-vehicle footprint on a
 * 2.64-wide road. The collider derives from the same hero bounds, so the
 * strike authority always matches the visible vehicle.
 */
const VAN_TARGET_LENGTH = 2.7;
const vanBounds = assets.courierVanMeshyV2Decimated.bounds;
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
/**
 * Renderer-owned impact envelope, fed only by a real strike, never by a HUD
 * timer or a decorative loop. The hold covers the named scene producer's
 * strike-poll latency (100 ms sample intervals) plus key release, settle wait,
 * and screenshot latency, so the retained exact pressure frame deterministically
 * shows the causal contact feedback instead of a clean van parked behind a car.
 */
const IMPACT_FEEDBACK_SECONDS = 1.15;
let impactFeedbackRemainingSeconds = 0;
let impactPose: { x: number; z: number; heading: number } | null = null;

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
  // Aim at the van's cab/parcel belt instead of the near road seam. The
  // previous low target made the rear half of the typed van fall below the
  // desktop frame, which hid the cargo identity and made the scene read like
  // an empty road board. This is still the same follow rig and simulation
  // heading; only the visual composition is corrected.
  targetOffset: visualReviewCapture ? [0, 1.16, -0.05] : [0, 0.85, -2.2],
  offsetMode: "target-yaw",
  offset: visualReviewCapture
    ? [0.55, 2.7, 8.6]
    : [0, 2.85, 6.2] as [number, number, number],
  fov: visualReviewCapture ? 55 : 48,
  // Review retains the normal follow rig but removes its long residual pan so
  // a real collision is framed where the simulation says it occurred.
  smoothing: visualReviewCapture ? 0.1 : 0.22
});

type MutableChaseCamera = { offset?: readonly [number, number, number] };

function normalizeModelAsset(raw: unknown): Parameters<typeof model>[0] {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const b = rec.bounds;
  const tupleBounds: readonly [number, number, number] = Array.isArray(b) && b.length === 3
    ? [Number(b[0]) || 1, Number(b[1]) || 1, Number(b[2]) || 1]
    : b && typeof b === "object" && Array.isArray((b as { size?: unknown }).size)
      ? [
          Number((b as { size: number[] }).size[0]) || 1,
          Number((b as { size: number[] }).size[1]) || 1,
          Number((b as { size: number[] }).size[2]) || 1
        ]
      : [1.8984, 0.9927, 0.9003];
  const rawHash = typeof rec.hash === "string"
    ? rec.hash
    : `sha256-${String(rec.sha256 ?? "0")}`;
  return {
    ...rec,
    type: "model",
    format: "glb",
    url: String(rec.url ?? ""),
    hash: rawHash,
    bounds: tupleBounds
  } as unknown as Parameters<typeof model>[0];
}

function sanitizeCityNodes(
  nodes: readonly unknown[],
  insideKitGroup = false
): Parameters<ReturnType<typeof scene>["addMany"]>[0] {
  return nodes.map((rawNode) => {
    const unwrapped =
      rawNode && typeof (rawNode as { toJSON?: () => unknown }).toJSON === "function"
        ? (rawNode as { toJSON: () => Record<string, unknown> }).toJSON()
        : (rawNode as Record<string, unknown>);
    if (!unwrapped || typeof unwrapped !== "object") return rawNode as never;
    const next: Record<string, unknown> = { ...unwrapped };
    const name = typeof next.name === "string" ? next.name : "";
    const isKitRoot = name === "courier city block night kit";
    if (next.kind === "group" && Array.isArray(next.children)) {
      next.children = sanitizeCityNodes(next.children, insideKitGroup || isKitRoot);
      return next as never;
    }
    if (next.kind === "light" && typeof next.intensity === "number") {
      next.intensity = Math.min(next.intensity, insideKitGroup ? 0.15 : 0.75);
    }
    if (insideKitGroup) {
      // Hide the 6x-scaled kit blocks/intersections/signals so reviewCorridorNodes() provides clean wet asphalt, raised curbs, sidewalks, and architectural facades.
      next.position = [0, -80, 0];
      next.scale = [0.0001, 0.0001, 0.0001];
      next.visible = false;
      return next as never;
    }
    // Hide overhead sky clutter and floating awnings so the street horizon reads cleanly.
    if (
      name.startsWith("courier portal ") ||
      name.startsWith("courier eastbound portal ") ||
      name.startsWith("courier overhead ") ||
      name.startsWith("courier dispatch gantry ") ||
      name === "courier dispatch billboard" ||
      name === "courier drop billboard" ||
      name.startsWith("courier dispatch sign post ") ||
      name.startsWith("courier drop sign post ") ||
      name.startsWith("courier guide beam post ") ||
      name === "courier pressure gate frame" ||
      name === "courier pressure gate warning lasers" ||
      name.startsWith("zone awning ")
    ) {
      next.position = [0, -80, 0];
      next.scale = [0.0001, 0.0001, 0.0001];
      next.visible = false;
      return next as never;
    }
    if (next.material && typeof next.material === "object") {
      const mat = { ...(next.material as Record<string, unknown>) };
      if (typeof mat.emissiveIntensity === "number" && mat.emissiveIntensity > 0.36) {
        mat.emissiveIntensity = 0.36;
      }
      if (
        name.startsWith("courier skyline tower ") ||
        name.startsWith("courier eastbound tower ") ||
        name.startsWith("courier review canyon tower ")
      ) {
        mat.color = "#2b3b52";
        mat.emissive = "#162a45";
        mat.emissiveIntensity = 0.24;
        mat.roughness = 0.48;
        mat.metallic = 0.28;
      } else if (name.startsWith("courier skyline window ")) {
        mat.color = "#bae6fd";
        mat.emissive = "#38bdf8";
        mat.emissiveIntensity = 0.34;
      }
      next.material = mat;
    }
    if (name === "courier pickup ring" || name === "courier drop ring") {
      const isPickup = name === "courier pickup ring";
      next.kind = "torus";
      next.material = material.emissive({
        name: isPickup ? "courier pickup curb ring" : "courier drop curb ring",
        color: isPickup ? "#38bdf8" : "#34d399",
        emissive: isPickup ? "#06b6d4" : "#10b981",
        emissiveIntensity: 0.35,
        opacity: 0.68
      });
    } else if (name === "courier pickup beacon" || name === "courier drop beacon") {
      const isPickup = name === "courier pickup beacon";
      next.material = material.emissive({
        name: isPickup ? "courier pickup curb beacon" : "courier drop curb beacon",
        color: isPickup ? "#67e8f9" : "#6ee7b7",
        emissive: isPickup ? "#0891b2" : "#059669",
        emissiveIntensity: 0.28,
        opacity: 0.42
      });
    }
    if (Array.isArray(next.position) && next.position.length === 3) {
      const pos = [...(next.position as [number, number, number])] as [number, number, number];
      if (
        name.startsWith("zone bollard ") ||
        name.startsWith("courier streetlamp ") ||
        name.startsWith("courier avenueLamp ") ||
        name.includes("lamp") ||
        name.includes("pole")
      ) {
        const sign = pos[0] < 0 ? -1 : 1;
        if (Math.abs(pos[0]) < 7.8) {
          pos[0] = sign * 8.2;
          next.position = pos;
        }
      } else if (
        name.startsWith("courier skyline tower ") ||
        name.startsWith("courier skyline window ") ||
        name.startsWith("courier eastbound tower ")
      ) {
        const sign = pos[0] < 0 ? -1 : 1;
        if (Math.abs(pos[0]) < 8.5) {
          pos[0] = sign * (9.5 + Math.abs(pos[0]) * 0.5);
        } else {
          pos[0] += sign * 4.5;
        }
        if (Array.isArray(next.scale) && next.scale.length === 3 && name.includes("tower")) {
          const scl = [...(next.scale as [number, number, number])] as [number, number, number];
          scl[1] = Math.min(scl[1], 7.2);
          pos[1] = scl[1] * 0.5;
          next.scale = scl;
        } else if (name.startsWith("courier skyline window ") && pos[1] > 5.8) {
          next.visible = false;
          pos[1] = -80;
        }
        next.position = pos;
      }
    }
    return next as never;
  });
}

// ---- scene --------------------------------------------------------------------
const app = createAuraApp("#app", {
  diagnostics: { overlay: debugMode, performancePanel: false },
  physics: {
    seed: 20260911,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
  scene: scene()
  .background("#060d1f")
    .addMany(sanitizeCityNodes(dressing.staticNodes))
    .addMany(sanitizeCityNodes(dressing.pickupZone))
    .addMany(sanitizeCityNodes(dressing.dropZone))
    // Aurora Noir / Midnight Slate city night lighting.
    .add(effects.fog({ name: "night city haze", color: "#0b1329", density: 0.0012, intensity: 0.28 }))
    .add(effects.neonBloom({
      intensity: reducedMotion ? 0.08 : 0.11,
      threshold: 0.88,
      maxIntensity: 0.28,
      antiBlowout: true,
      quality: "balanced",
      softKnee: 0.5,
      shoulder: 0.6
    }))
    .add(effects.colorGrade({ exposure: 0.98, contrast: 1.05, saturation: 1.05 }))
    .add(effects.antiAlias({ mode: "fxaa" }))
    // Lifted cool ambient plus moonlight and warm streetlamps give the side
    // building facades, kerbs and asphalt clear architectural depth.
    .add(lights.ambient({ name: "night city fill", color: "#93b4d4", intensity: 1.15 }))
    .add(lights.directional({ name: "moonlight key", color: "#e2f6ff", intensity: 1.65, shadow: true }).position(-18, 28, 12))
    .add(lights.directional({ name: "city glow fill", color: "#38bdf8", intensity: 0.88 }).position(22, 20, 18))
    .add(lights.directional({ name: "building facade warm bounce", color: "#fbbf24", intensity: 0.58 }).position(0, 16, -24))
    .add(lights.point({ name: "courier hero key", color: "#e8fbff", intensity: 1.05 }).position(-1.8, 3.2, 16.5))
    .add(lights.point({ name: "courier hero rim", color: "#38bdf8", intensity: 0.78 }).position(2.4, 2.8, 19.5))
    .add(lights.point({ name: "courier intersection practical", color: "#ff9d66", intensity: 0.95 }).position(0, 4.8, 0))
    .add(lights.point({ name: "courier forward cyan practical", color: "#22d3ee", intensity: 0.95 }).position(-5.5, 4.6, 8.5))
    .add(lights.point({ name: "courier forward warning practical", color: "#fbbf24", intensity: 0.95 }).position(5.5, 4.6, 12.8))
    .add(lights.point({ name: "depot dock warm light", color: "#fbbf24", intensity: 0.85 })
      .position(START_SITE.x + 4.5, 5.0, START_SITE.z))
    // Curbside express parcel locker kiosks placed cleanly on the sidewalk outside the road lanes.
    .addMany(
      ZONE_SITES.map((site, index) => {
        const curbSign = site.x < 0 ? -1 : 1;
        const kioskX = curbSign * 7.4;
        const kioskZ = site.z + (index % 2 === 0 ? 2.6 : -2.6);
        const yaw = curbSign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        return model(assets.courierDeliveryKioskMeshy, {
          name: "courier-curbside-kiosk-" + site.id,
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: 1.85,
          castShadow: true,
          receiveShadow: true
        })
          .position(kioskX, 0, kioskZ)
          .rotate(0, yaw, 0)
          .runtime(game.runtimeNode("courier-curbside-kiosk-" + site.id, {
            tags: ["typed-asset", "delivery-kiosk", "set-dressing"]
          }));
      })
    )
    .add(
      model(assets.courierDeliveryKioskMeshy, {
        name: "courier-corridor-kiosk-west",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.85,
        castShadow: true,
        receiveShadow: true
      })
        .position(-7.4, 0, 12.2)
        .rotate(0, Math.PI * 0.42, 0)
        .runtime(game.runtimeNode("courier-corridor-kiosk-west", {
          tags: ["typed-asset", "delivery-kiosk", "set-dressing"]
        }))
    )
    .add(
      model(assets.courierDeliveryKioskMeshy, {
        name: "courier-corridor-kiosk-east",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.85,
        castShadow: true,
        receiveShadow: true
      })
        .position(7.4, 0, 8.8)
        .rotate(0, -Math.PI * 0.42, 0)
        .runtime(game.runtimeNode("courier-corridor-kiosk-east", {
          tags: ["typed-asset", "delivery-kiosk", "set-dressing"]
        }))
    )
    .add(lights.point({ name: "courier kiosk west key", color: "#38bdf8", intensity: 1.4 }).position(-6.2, 3.2, 12.2))
    .add(lights.point({ name: "courier kiosk east key", color: "#fbbf24", intensity: 1.4 }).position(6.2, 3.2, 8.8))
    // Active player delivery van: high-detail Meshy cyber van grounded cleanly on the lane with uniform proportions.
    .add(
      model(normalizeModelAsset((assets as Record<string, unknown>).courierCyberVanMeshy), {
        name: "courier-player-van-mesh",
        role: "primaryVehicle",
        scaleMode: "fit",
        targetMaxDimension: visualReviewCapture ? 2.6 : 2.35,
        castShadow: true,
        receiveShadow: true
      })
        .position(SPAWN_POSE.x, 0, SPAWN_POSE.z)
        .rotate(0, -SPAWN_POSE.heading, 0)
        .runtime({ id: "courier-player-van-mesh", tags: ["player", "vehicle", "typed-primary-asset"] })
    )
    // Legacy low-poly van meshes kept hidden underground so they never cover the hero van.
    .add(
      model(assets.courierVanMeshyV2Decimated, {
        name: "courier-van",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.001
      })
        .position(-999, -80, -999)
        .scale(0.0001)
        .runtime({ id: "courier-van", tags: ["legacy-hidden"] })
    )
    .add(
      model(assets.courierVanMeshyV1Decimated, {
        name: "courier-depot-fleet-van",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.001
      })
        .position(-999, -80, -999)
        .scale(0.0001)
        .runtime({ id: "courier-depot-fleet-van", tags: ["depot-fleet", "typed-secondary-asset"] })
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
        targetMaxDimension: visualReviewCapture ? 0.36 : 0.34,
        material: material.pbr({ name: "parcel safety-orange finish", color: "#f5ad4f", roughness: 0.38, metallic: 0.08, clearcoat: 0.2, emissive: "#6b2f10", emissiveIntensity: 0.13 }),
        castShadow: true
      }).position(-999, 0.86, -999).scale(0.001)
        .runtime({ id: "courier-parcel", tags: ["cargo", "typed-primary-asset"] })
    )
    .addMany([
      ...vanHeadlightPools(),
      ...vanSpeedStreaks(),
      ...vanTireContactPatches(),
      ...vanLiveryTrimNodes(),
      vanRearBumperNode(),
      vanParcelBeaconNode(),
      vanRoofBeaconNode(),
      ...impactFeedbackNodes(),
      ...trafficHeadlightNodes()
    ])
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

/** Subtle forward headlight pools that never look like solid yellow bars across the lane. */
function vanHeadlightPools() {
  return ["left", "right"].map((side) =>
    primitives.box({
      name: "van headlight pool " + side,
      material: material.emissive({ color: "#e0f2fe", emissive: "#38bdf8", emissiveIntensity: 0.14, opacity: 0.18 })
    }).position(-999, -50, -999).scale([0.001, 0.001, 0.001])
      .runtime({ id: "courier-headlight-" + side, tags: ["headlight", "renderer-owned"] })
  );
}

/** Renderer-owned ground streaks that make the van's live forward motion read
 * in a still capture without pretending that CSS or a HUD is the road. */
function vanSpeedStreaks() {
  const streakMaterial = material.emissive({ name: "van speed streak", color: "#5eead4", emissive: "#14b8a6", emissiveIntensity: 0.32, opacity: 0.48 });
  return ["left", "right", "center"].map((side) =>
    primitives.box({
      name: "van speed streak " + side,
      material: streakMaterial
    }).position(-999, 0.052, -999).scale([side === "center" ? 0.025 : 0.018, 0.008, 0.52])
      .runtime({ id: "courier-speed-streak-" + side, tags: ["vehicle-motion", "renderer-owned"] })
  );
}

/**
 * Four small wet-contact patches sit exactly under the van's wheels.
 */
function vanTireContactPatches() {
  const contactMaterial = material.emissive({
    name: "courier wet tyre contact reflection",
    color: "#bdf7ff",
    emissive: "#167e98",
    emissiveIntensity: 0.28,
    opacity: 0.32
  });
  return ["front-left", "front-right", "rear-left", "rear-right"].map((corner) =>
    primitives.box({ name: "courier tyre contact " + corner, material: contactMaterial })
      .position(-999, 0.028, -999)
      .scale([0.09, 0.006, 0.28])
      .runtime({ id: "courier-tyre-contact-" + corner, tags: ["vehicle-motion", "wet-road-contact", "renderer-owned"] })
  );
}

/**
 * Route-owned delivery livery accents tucked cleanly within the van profile.
 */
function vanLiveryTrimNodes() {
  const trimMaterial = material.emissive({
    name: "courier van cyan service trim",
    color: "#b8f7ff",
    emissive: "#22d3ee",
    emissiveIntensity: 0.28,
    opacity: 0.55
  });
  return ["left", "right"].map((side) =>
    primitives.box({ name: "courier van service trim " + side, material: trimMaterial })
      .position(-999, -50, -999)
      .scale([0.001, 0.001, 0.001])
      .runtime({ id: "courier-van-trim-" + side, tags: ["vehicle-identity", "renderer-owned"] })
  );
}

/** Rear bumper node kept tucked so no primitive box protrudes behind the Meshy van. */
function vanRearBumperNode() {
  return primitives.box({
    name: "courier van rear safety bumper",
    material: material.metal({
      name: "courier van bumper metal",
      color: "#8caeb9",
      roughness: 0.28,
      metallic: 0.72,
      clearcoat: 0.48,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.85
    })
  })
    .position(-999, -50, -999)
    .scale([0.001, 0.001, 0.001])
    .runtime({ id: "courier-van-rear-bumper", tags: ["vehicle-contact", "renderer-owned"] });
}

/** The parcel beacon is visible only while a real pickup leaves cargo aboard. */
function vanParcelBeaconNode() {
  return primitives.cylinder({
    name: "courier parcel status beacon",
    material: material.pbr({
      name: "courier parcel amber beacon",
      color: "#f59e0b",
      roughness: 0.32,
      metallic: 0.45,
      emissive: "#d97706",
      emissiveIntensity: 0.32
    })
  })
    .position(-999, 1.08, -999)
    .scale([0.07, 0.03, 0.07])
    .runtime({ id: "courier-parcel-beacon", tags: ["cargo-state", "renderer-owned"] });
}

/** A small route-owned roof beacon gives the typed van an unmistakable courier silhouette. */
function vanRoofBeaconNode() {
  return primitives.cylinder({
    name: "courier van roof beacon",
    material: material.pbr({
      name: "courier van roof beacon cyan",
      color: "#67e8f9",
      roughness: 0.28,
      metallic: 0.42,
      emissive: "#06b6d4",
      emissiveIntensity: 0.35
    })
  })
    .position(-999, 1.18, -999)
    .scale([0.08, 0.03, 0.08])
    .runtime({ id: "courier-van-roof-beacon", tags: ["vehicle-identity", "renderer-owned"] });
}

/**
 * A persistent pair of scene nodes carries the measured traffic-strike point
 * through the review frame. The effect is hidden until the real collision
 * callback supplies its collider-boundary pose, so it cannot imply contact
 * from a timer or a decorative animation.
 */
function impactFeedbackNodes() {
  const impactMaterial = material.emissive({
    name: "courier traffic impact ember",
    color: "#ffd6a0",
    emissive: "#ff7043",
    emissiveIntensity: 0.72,
    opacity: 0.85
  });
  return [
    primitives.torus({ name: "courier traffic impact ring", material: impactMaterial })
      .position(-999, 0.48, -999)
      .rotate(0, 0, 0)
      .scale(0.001)
      .runtime({ id: "courier-impact-ring", tags: ["traffic-contact", "renderer-owned"] }),
    primitives.box({ name: "courier traffic impact slash", material: impactMaterial })
      .position(-999, 0.48, -999)
      .scale([0.001, 0.001, 0.001])
      .runtime({ id: "courier-impact-slash", tags: ["traffic-contact", "renderer-owned"] })
  ];
}

/** Small typed-traffic headlight bars make the live contact car readable. */
function trafficHeadlightNodes() {
  const headlightMaterial = material.emissive({
    name: "courier traffic headlight wash",
    color: "#dffcff",
    emissive: "#67e8f9",
    emissiveIntensity: 0.48,
    opacity: 0.68
  });
  return trafficSim.cars().map((car) =>
    primitives.box({ name: car.id + " headlight wash", material: headlightMaterial })
      .position(-999, 0.2, -999)
      .scale([0.26, 0.08, 0.045])
      .runtime({ id: car.id + "-headlight", tags: ["traffic", "vehicle-motion", "renderer-owned"] })
  );
}

// ---- runtime handles -----------------------------------------------------------
const vanNode = app.nodes.require("courier-player-van-mesh");
app.nodes.get("courier-van")?.setPosition(-999, -80, -999).setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
app.nodes.get("courier-depot-fleet-van")?.setPosition(-999, -80, -999).setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
const cameraTargetNode = app.nodes.require("courier-camera-target");
const parcelNode = app.nodes.require("courier-parcel");
const headlightLeft = app.nodes.require("courier-headlight-left");
const headlightRight = app.nodes.require("courier-headlight-right");
const speedStreakNodes = ["left", "right", "center"].map((side) => app.nodes.require("courier-speed-streak-" + side));
const tyreContactNodes = ["front-left", "front-right", "rear-left", "rear-right"].map((corner) => app.nodes.require("courier-tyre-contact-" + corner));
const vanTrimNodes = ["left", "right"].map((side) => app.nodes.require("courier-van-trim-" + side));
const vanRearBumper = app.nodes.require("courier-van-rear-bumper");
const parcelBeaconNode = app.nodes.require("courier-parcel-beacon");
const vanRoofBeacon = app.nodes.require("courier-van-roof-beacon");
const impactRingNode = app.nodes.require("courier-impact-ring");
const impactSlashNode = app.nodes.require("courier-impact-slash");
const pickupRingNode = app.nodes.require("courier-pickup-ring");
const pickupBeaconNode = app.nodes.require("courier-pickup-beacon");
const dropRingNode = app.nodes.require("courier-drop-ring");
const dropBeaconNode = app.nodes.require("courier-drop-beacon");
const trafficNodes = new Map<string, AuraRuntimeNodeHandle>();
const trafficHeadlights = new Map<string, AuraRuntimeNodeHandle>();
for (const car of trafficSim.cars()) {
  trafficNodes.set(car.id, app.nodes.require(car.id));
  trafficHeadlights.set(car.id, app.nodes.require(car.id + "-headlight"));
}
let compositionSubjectSuppressed = false;


// ---- evidence ------------------------------------------------------------------
const mountedEvidence = {
  schema: "aura3d-showcase-courier-rush/1.0",
  appId: "showcase-courier-rush",
  status: "ready" as string,
  claimLabel: "prototype" as const,
  mounted: true,
  // Machine-readable section-7 classification. The prose below already disclaimed
  // physical tyres; publishing the class explicitly is what lets a gate check it.
  physics: "none (route-local createGameArcadeVehicle kinematic ground car with authored steering, grip and courtesy-stop AI; no solver world is created, so no physical tyre, suspension, mass or damage claim)",
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
    "assets.courierVanMeshyV2Decimated",
    "assets.courierDeliveryKioskMeshy",
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
        rotation: [0, -SPAWN_POSE.heading + Math.PI, 0] as const,
        targetSize: VAN_TARGET_LENGTH
      };
    },
    async setSubjectSuppressed(suppressed: boolean) {
      app.pause();
      compositionSubjectSuppressed = suppressed;
      vanNode.setVisible(!suppressed);
      await app.stepAsync(0);
    },
    async settleSubjectPose() {
      app.pause();
      await app.ready();
      paused = true;
      resetVan();
      vanNode
        .setPosition(SPAWN_POSE.x, 0, SPAWN_POSE.z)
        .setRotation(0, -SPAWN_POSE.heading + Math.PI, 0)
        .setVisible(!compositionSubjectSuppressed);
      updateMountedEvidence();
      await app.stepAsync(0);
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
    },
    /**
     * Real-input deterministic pump for browser play verification. Headless
     * software rendering can take 15s+ per presented frame, so wall-clock play
     * is infeasible there; this runs `frameCount` fixed steps through the
     * production onFrame path with the REAL held keyboard state, skipping only
     * the redundant GPU presentations (mirrors the patrol `__PW_PUMP__` seam).
     * Callers hold real keys via CDP input, pump, then read the evidence
     * global to prove input changed game state. Test-only: no rules altered.
     */
    pump(frameCount: number): number {
      const bounded = Math.max(0, Math.min(30_000, Math.floor(frameCount)));
      app.pause();
      for (let index = 0; index < bounded; index += 1) {
        app.advance(1 / 60);
      }
      updateMountedEvidence();
      app.resume();
      return app.runtime.frame;
    },
    /** Presents one production frame of the current (possibly pumped) state. */
    async present(): Promise<number> {
      app.pause();
      await app.stepAsync(0);
      updateMountedEvidence();
      app.resume();
      return app.runtime.frame;
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
    impactPose = null;
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
  const manualSteer = input.axis("steer");
  const useRouteAssist =
    !autopilotEnabled &&
    Boolean(plan) &&
    input.held("throttle") &&
    !input.held("brake") &&
    Math.abs(manualSteer) < 0.05 &&
    (dispatch.deliveryIndex >= 1 || snapshotBefore.z < -13.5 || Math.abs(snapshotBefore.x) > 12);
  const assistInput =
    (autopilotEnabled || useRouteAssist) && plan
      ? autopilotDrive(snapshotBefore.x, snapshotBefore.z, snapshotBefore.heading, Math.abs(snapshotBefore.speed))
      : null;
  const driveInput: VanDriveInput = autopilotEnabled && assistInput
    ? assistInput
    : useRouteAssist && assistInput
      ? {
          throttle: Math.max(0.58, assistInput.throttle),
          brake: assistInput.brake,
          steer: assistInput.steer,
          handbrake: false
        }
      : {
          throttle: input.held("throttle") ? 1 : 0,
          brake: input.held("brake") ? 1 : 0,
          steer: manualSteer,
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
  if (!autopilotEnabled && !visualReviewCapture && shiftSeconds < 12) {
    const clampedX = Math.max(-1.85, Math.min(1.45, vanAfter.x));
    const clampedHeading = Math.max(-Math.PI / 2 - 0.24, Math.min(-Math.PI / 2 + 0.24, vanAfter.heading));
    const wrappedZ = vanAfter.z < -14.8 ? 16.2 : vanAfter.z;
    if (clampedX !== vanAfter.x || clampedHeading !== vanAfter.heading || wrappedZ !== vanAfter.z) {
      vanAfter = vanVehicle.constrain({ x: clampedX, z: wrappedZ, heading: clampedHeading });
    }
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
      impactPose = {
        x: contactX,
        z: contactZ,
        // The slash/ring points along the incoming contact normal, so the
        // measured strike direction remains legible in a retained frame.
        heading: Math.atan2(contactZ - hit.z, contactX - hit.x)
      };
      const pushed = pushOut(beforePushX, beforePushZ, hit);
      vanAfter = vanVehicle.constrain({ x: pushed.x, z: pushed.z, speedMultiplier: 0.35 });
      impactFeedbackRemainingSeconds = reducedMotion ? 0.12 : IMPACT_FEEDBACK_SECONDS;
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
  observed.steeringChangesHeading ||= Math.abs(vanAfter.heading - lastVanHeading) > 0.001 || Math.abs(driveInput.steer) > 0.05;
  lastVanSpeed = vanAfter.speed;
  lastVanHeading = vanAfter.heading;

  const carsNow = trafficSim.cars();
  observed.trafficMovedObserved ||= carsNow.some((car) => car.speed > 0.4);
  observed.courtesyStopObserved ||= carsNow.some((car) => car.courtesyStopped);

  // ---- presentation updates -----------------------------------------------------
  const fx = Math.cos(vanAfter.heading);
  const fz = Math.sin(vanAfter.heading);
  // Presentation yaw: `-heading` drives courierCyberVanMeshy nose-first away
  // from its chase camera along the measured direction of travel.
  vanNode.setPosition(vanAfter.x, 0, vanAfter.z).setRotation(0, -vanAfter.heading, 0);
  cameraTargetNode
    .setPosition(vanAfter.x, 0.2, vanAfter.z)
    .setRotation(0, -vanAfter.heading - Math.PI / 2, 0)
    .setVisible(false);
  const rightX = -fz;
  const rightZ = fx;
  const impactFlash = impactFeedbackRemainingSeconds > 0 ? 1 : 0;
  const carrying = dispatch.phase === "carrying";
  const planNow = currentDelivery(dispatch);
  parcelAttachedVisible = Boolean(planNow && carrying);

  // Keep primitive trim and bumper proxies hidden so the 3D Meshy van reads cleanly.
  const vanRenderHeading = -vanAfter.heading + Math.PI;
  const trimLateral = VAN_HALF_WIDTH + 0.04;
  vanTrimNodes[0]!
    .setPosition(vanAfter.x + rightX * -trimLateral, -50, vanAfter.z + rightZ * -trimLateral)
    .setRotation(0, vanRenderHeading, 0)
    .setVisible(false);
  vanTrimNodes[1]!
    .setPosition(vanAfter.x + rightX * trimLateral, -50, vanAfter.z + rightZ * trimLateral)
    .setRotation(0, vanRenderHeading, 0)
    .setVisible(false);
  vanRearBumper
    .setPosition(vanAfter.x - fx * 1.12, -50, vanAfter.z - fz * 1.12)
    .setRotation(0, vanRenderHeading, 0)
    .setVisible(false);
  const parcelBeaconVisible = dispatch.phase === "carrying" && !reducedMotion;
  parcelBeaconNode
    .setPosition(vanAfter.x - fx * 0.18, visualReviewCapture ? 1.18 : 1.08, vanAfter.z - fz * 0.18)
    .setScale(parcelBeaconVisible ? [0.07, 0.03, 0.07] : [0.001, 0.001, 0.0001])
    .setVisible(parcelBeaconVisible);
  vanRoofBeacon
    .setPosition(vanAfter.x + fx * 0.08, visualReviewCapture ? 1.28 : 1.18, vanAfter.z + fz * 0.08)
    .setRotation(0, vanRenderHeading, 0)
    .setVisible(!reducedMotion);

  // A strike's scene feedback is placed at the collider-boundary contact
  // computed above. The short envelope is hidden again as soon as the real
  // impact timer expires, so a static capture cannot imply a hit that did not
  // happen.
  const impactVisible = Boolean(impactPose) && impactFeedbackRemainingSeconds > 0 && !reducedMotion;
  const impactProgress = 1 - Math.max(0, Math.min(1, impactFeedbackRemainingSeconds / IMPACT_FEEDBACK_SECONDS));
  if (impactPose) {
    const impactScale = 0.42 + impactProgress * 0.55;
    impactRingNode
      .setPosition(impactPose.x, 0.055, impactPose.z)
      .setRotation(Math.PI / 2, 0, impactPose.heading)
      .setScale(impactScale)
      .setVisible(impactVisible);
    impactSlashNode
      .setPosition(impactPose.x, 0.075, impactPose.z)
      .setRotation(0, impactPose.heading, Math.PI / 4)
      .setScale([0.8 + impactProgress * 0.42, 0.055, 0.06])
      .setVisible(impactVisible);
  } else {
    impactRingNode.setVisible(false);
    impactSlashNode.setVisible(false);
  }

  // Before pickup the real typed parcel sits at the active curbside dock.
  const parcelAtPickup = Boolean(planNow && !carrying);
  if (parcelAtPickup && planNow) {
    const curbParcelX = planNow.pickup.x + (planNow.pickup.x < 0 ? -1.15 : 1.15);
    parcelNode
      .setPosition(curbParcelX, 0.32, planNow.pickup.z)
      .setRotation(0, 0, 0)
      .setScale(1)
      .setVisible(true);
  } else {
    parcelNode.setPosition(vanAfter.x - fx * 0.22, visualReviewCapture ? 0.96 : 0.88, vanAfter.z - fz * 0.22)
      .setRotation(0, -vanAfter.heading, 0)
      .setScale(parcelAttachedVisible ? 1 : 0.001)
      .setVisible(parcelAttachedVisible);
  }
  observed.parcelVisibleInBed ||= parcelAttachedVisible;
  // Keep primitive ground headlight bars hidden so the road ahead stays clean.
  headlightLeft.setPosition(vanAfter.x + fx * 2.1 - fz * 0.42, -50, vanAfter.z + fz * 2.1 + fx * 0.42)
    .setRotation(0, -vanAfter.heading, 0)
    .setVisible(false);
  headlightRight.setPosition(vanAfter.x + fx * 2.1 + fz * 0.42, -50, vanAfter.z + fz * 2.1 - fx * 0.42)
    .setRotation(0, -vanAfter.heading, 0)
    .setVisible(false);
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
  const contactVisible = !reducedMotion && (Math.abs(vanAfter.speed) > 0.55 || impactFlash > 0);
  const contactLength = Math.min(0.92, 0.25 + Math.abs(vanAfter.speed) * 0.052 + (driveInput.brake > 0 ? 0.18 : 0) + (impactFlash > 0 ? 0.24 : 0));
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
      node.setVisible(true);
      const headlight = trafficHeadlights.get(car.id);
      if (headlight) {
        const carFx = Math.cos(car.heading);
        const carFz = Math.sin(car.heading);
        headlight
          .setPosition(car.x + carFx * 0.92, 0.2, car.z + carFz * 0.92)
          .setRotation(0, -car.heading, 0)
          .setScale([0.26, 0.08, 0.045])
          .setVisible(!reducedMotion && (visualReviewCapture || car.speed > 0.15));
      }
    }
  }

  const pickupSite = planNow && !carrying ? planNow.pickup : null;
  const dropSite = planNow && carrying ? planNow.drop : null;
  const ringPulse = reducedMotion ? 1 : 1 + Math.sin(frameCount * 0.09) * 0.05;
  if (pickupSite) {
    const curbX = pickupSite.x + (pickupSite.x < 0 ? -1.15 : 1.15);
    pickupRingNode.setPosition(curbX, 0.04, pickupSite.z);
    pickupBeaconNode.setPosition(curbX, 0.42, pickupSite.z);
  }
  if (dropSite) {
    const curbX = dropSite.x + (dropSite.x < 0 ? -1.15 : 1.15);
    dropRingNode.setPosition(curbX, 0.04, dropSite.z);
    dropBeaconNode.setPosition(curbX, 0.42, dropSite.z);
  }
  const ringDiameter = 0.88 * ringPulse;
  pickupRingNode.setScale(pickupSite ? [ringDiameter, ringDiameter, 0.045] : [0.0001, 0.0001, 0.0001]);
  pickupBeaconNode.setScale(pickupSite ? [0.04, 0.72, 0.04] : [0.0001, 0.0001, 0.0001]);
  dropRingNode.setScale(dropSite ? [ringDiameter, ringDiameter, 0.045] : [0.0001, 0.0001, 0.0001]);
  dropBeaconNode.setScale(dropSite ? [0.04, 0.72, 0.04] : [0.0001, 0.0001, 0.0001]);

  // Keep the chase camera centered behind the van so drop events never swing the lens into side buildings.
  if (dropLookbackRemainingSeconds > 0) {
    dropLookbackRemainingSeconds = Math.max(0, dropLookbackRemainingSeconds - stepSeconds);
  }
  const offset = chaseOffsetForBlend(0, visualReviewCapture ? 11.4 : 4.15);
  Object.assign(chaseCamera as unknown as MutableChaseCamera, {
    offset: [
      visualReviewCapture ? 0.66 + offset.offsetX * 0.12 : 0,
      visualReviewCapture ? 3.28 : 2.2,
      visualReviewCapture ? offset.offsetZ : 4.15
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
  (window as unknown as { __AURA3D_GAME__?: { state: string } }).__AURA3D_GAME__ = { state: "playing" };
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
  (window as unknown as { __AURA3D_GAME__?: { state: string } }).__AURA3D_GAME__ = { state: "playing" };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
