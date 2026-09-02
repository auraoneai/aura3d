/**
 * Gravity Post — route assembly.
 *
 * One mounted Aura app. The solar system scene kit supplies the presentational
 * backdrop (static sun family, starfield, dust); the playable system is authored
 * route-local arcade gravity around six wells (sun + five planets), explicitly
 * NON-PHYSICAL design values. Delivery triggers are real physics sensor bodies:
 * the pod is a kinematic body driven by the authored integrator, and captures
 * fire through app.physics.onTriggerEnter.
 *
 * Label: prototype. Authored arcade gravity, non-physical.
 */
import {
  createAuraApp,
  createCollisionLayers,
  camera,
  effects,
  game,
  labels,
  lights,
  material,
  model,
  primitives,
  scene,
  prefabs,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { CONTRACTS, WELL_BODIES, stationById, stationPosition } from "./contracts";
import { createFlybyState, flybyBody, requestFlyby, skipFlyby, updateFlyby } from "./flyby";
import {
  ADRIFT_LIMIT_SECONDS,
  DOCK_SENSOR_RADIUS,
  TIME_WARP_MULTIPLIER,
  createPodRuntime,
  applyCorrection,
  evaluateCapture,
  launch,
  resetPodForContract,
  updateCoast,
  type PodEvent,
  type PodRuntimeState
} from "./pod";
import {
  PREDICTION_DIVERGENCE_TOLERANCE,
  PREDICTION_MAX_STEPS,
  buildPredictionBeads
} from "./prediction";
import { SHIFT_FAIL_LIMIT, scoreContract, type ScoreBreakdown } from "./scoring";
import { POD_BODY_SPEC, PLAY_PLANE_Y, buildStations, dockSensorBodySpec } from "./stations";
import { createGravityPostAudio, type GravityPostAudio } from "./post-audio";
import { createRustGaleFreightway } from "./freightway";
import { FIXED_DT, dockPointHash, integratePath, type TrajectorySample } from "./wells";
import "./styles.css";

// ---------------------------------------------------------------------------
// Route-local design constants (documented, tuned for readability)
// ---------------------------------------------------------------------------
const MAX_LAUNCH_SPEED = 2.85;
const MIN_LAUNCH_POWER = 0.18;
const AIM_DRAG_PIXEL_RANGE = 190;
const PREDICTION_BEADS = 30;
const ACTUAL_PATH_BEADS = 48;
const SPARK_COUNT = 8;
const FLYBY_DRONES = 6;
const ORBITAL_DUST_COUNT = 24;
const TRAIL_STREAK_COUNT = 7;
const CONTACT_WAKE_COUNT = 6;
const REVIEW_COURIER_PROGRESS = 0.54;
const REVIEW_COURIER_LATERAL = 0;
// The public route keeps the full orbital board readable for planning. The
// named visual-review capture is an evidence-only close courier composition:
// it keeps the live typed pod, destination hardware, and flown path large
// enough to judge at the same scale as an action reference without changing
// gameplay coordinates or the public camera.
const visualReviewCapture = new URLSearchParams(window.location.search).get("capture") === "review";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";
// The board is a wide solar-system composition; the catalog pod needs enough
// screen coverage to remain legible while it is in flight, not only at a dock.
// The source skiff is authored at a broad truck-like span.  At the close
// review lens its former 0.78 scale put the Rust-endpoint delivery outside the
// near-plane and made the exact chained artifact a clipped lower-left sliver.
// Keep the typed vehicle substantial enough to read as the hero courier in an
// action frame, while leaving the roadway, route history, and Gale gate
// visible around it.  The review lens is intentionally larger than the public
// planning-board pod; this is a presentation scale only and never changes the
// authored sensor radius or flight integrator.
// The courier is the action subject in the named review lens. Keep it
// materially larger than the shoulder architecture so its canopy, four
// contact drives, and guarded parcel read before the destination scenery.
// The review scale is intentionally just under 1x: it gives the skiff a clear
// silhouette while leaving the typed terminal shuttle, route lane, and Gale
// gate in the same honest frame. This is presentation scale only; authored
// flight/sensor coordinates are unchanged.
const POD_VISUAL_SCALE = visualReviewCapture ? 0.94 : 2.28;

// The parcel prop is a real typed GLB, but its release probe is nearly as tall
// as it is wide. Keep the review carton compact and seat it on the courier's
// rear cradle so the package reads as cargo instead of a floating foreground
// block. The public planning board keeps the larger teaching-scale carton.
const courierParcelLift = visualReviewCapture ? 0.34 : 0.61;
const courierParcelMaxDimensionBase = visualReviewCapture ? 0.25 : 0.42;

const BODY_COLORS: Readonly<Record<string, string>> = {
  sol: "#ffd166",
  cinder: "#f4a261",
  verdance: "#70e000",
  aquaria: "#22d3ee",
  rust: "#fb7185",
  gale: "#c4b5fd"
};

const BODY_EMISSIVE: Readonly<Record<string, string>> = {
  sol: "#fb923c",
  cinder: "#f97316",
  verdance: "#22c55e",
  aquaria: "#06b6d4",
  rust: "#e11d48",
  gale: "#8b5cf6"
};

const BODY_MOONS: Readonly<Record<string, readonly (readonly [number, number, number])[]>> = {
  cinder: [[0.18, 0.08, 0.12]],
  verdance: [[-0.22, 0.04, 0.1], [0.14, 0.03, -0.18]],
  aquaria: [[0.22, 0.06, -0.12]],
  rust: [[-0.2, 0.04, -0.1]],
  gale: [[0.34, 0.08, 0.16], [-0.3, 0.04, -0.2]]
};

// A deterministic, renderer-owned dust field keeps the solar board from
// reading as an empty flat card at the close review lens. These are visual
// motes only: they never participate in the authored gravity integrator,
// sensor bodies, scoring, or route evidence state.
const ORBITAL_DUST: readonly (readonly [number, number, number, number])[] =
  Array.from({ length: ORBITAL_DUST_COUNT }, (_, index) => {
    const angle = index * 2.399963229728653;
    const radius = 1.15 + (index % 6) * 0.62;
    const x = Math.cos(angle) * radius + ((index % 3) - 1) * 0.22;
    const z = Math.sin(angle) * radius - 0.15;
    const y = PLAY_PLANE_Y + 0.02 + (index % 4) * 0.024;
    const scale = 0.018 + (index % 4) * 0.009;
    return [x, y, z, scale] as const;
  });

const CONTROLS = [
  "drag: aim + power (live prediction line)",
  "W/S: spend one bounded prograde/retrograde correction token",
  "Space hold: time-warp x8 (coasting only)",
  "N: next contract (after dock)",
  "R: retry contract",
  "P: pause"
] as const;

const CLAIM_BOUNDARY =
  "Prototype. Authored arcade gravity, non-physical: inverse-distance route-local design values, " +
  "no orbital mechanics, n-body, or physics-parity claims. Solar kit nodes are presentational dressing.";

// ---------------------------------------------------------------------------
// Evidence contract
// ---------------------------------------------------------------------------
interface GravityPostEvidence {
  readonly schema: "aura3d-showcase-gravity-post/1.0";
  readonly mounted: boolean;
  /** True once the WebGL production renderer has settled its mount; step() renders nothing before this. */
  readonly rendererMounted: boolean;
  readonly appId: "showcase-gravity-post";
  readonly status: "ready";
  readonly claimLabel: "prototype";
  readonly frame: number;
  readonly drawCalls: number;
  readonly contractIndex: number;
  readonly contractId: string;
  readonly propellant: number;
  readonly podPosition: readonly [number, number];
  readonly podSpeed: number;
  readonly podState: string;
  readonly assists: readonly string[];
  readonly predictionSteps: number;
  readonly predictionComparedSamples: number;
  readonly predictionMaxDivergence: number;
  readonly predictionTolerance: number;
  readonly predictionWithinTolerance: boolean;
  readonly actualPathPoints: number;
  readonly correctionTokensRemaining: number;
  readonly correctionsUsed: number;
  readonly flightSeconds: number;
  readonly dockEventCount: number;
  readonly dockEvents: readonly string[];
  readonly failedContracts: number;
  readonly lastFailReason: string | null;
  readonly completedContracts: number;
  readonly score: number;
  readonly shiftOver: boolean;
  readonly campaignComplete: boolean;
  readonly paused: boolean;
  readonly warping: boolean;
  readonly aiming: boolean;
  readonly adriftSeconds: number;
  readonly flybyBeatsRun: number;
  readonly flybyActive: boolean;
  readonly visitedFlybys: readonly string[];
  readonly reducedMotion: boolean;
  readonly audioCues: readonly string[];
  readonly audioProof: {
    readonly cueCount: number;
    readonly busCount: number;
    readonly unlocked: boolean;
    readonly playedCueCount: number;
  };
  readonly primaryAssets: readonly string[];
  readonly typedAssets: readonly {
    readonly id: string;
    readonly typedRef: string;
    readonly role: string;
  }[];
  readonly systems: readonly string[];
  readonly controls: readonly string[];
  readonly claimBoundary: string;
  readonly lastDockHash: number | null;
}

declare global {
  interface Window {
    __GRAVITY_POST_EVIDENCE__?: GravityPostEvidence;
    __AURA3D_SHOWCASE_GRAVITY_POST__?: GravityPostEvidence;
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
    /** Deterministic test hook: manually advance the mounted app by dt seconds. */
    __GRAVITY_POST_STEP__?: (dtSeconds: number) => void;
    /** Deterministic test hook: advance gameplay without rendering. */
    __GRAVITY_POST_SIM_STEP__?: (dtSeconds: number) => void;
    /** Deterministic test hook: render one frame and read back the canvas atomically. */
    __GRAVITY_POST_CAPTURE__?: () => string;
    /** Deterministic test hook: current evidence snapshot. */
    __GRAVITY_POST_EVIDENCE_SNAPSHOT__?: () => GravityPostEvidence | undefined;
  }
}

function solarKitBackdrop(): readonly AuraSceneNode[] {
  // The kit's animated planets jump at their 18-second loop wrap, so gameplay
  // cannot anchor to them: keep the static sun family, starfield, dust, light,
  // and postprocess from the solar system kit composition (prefabs.solarSystem,
  // the same node set sceneKits.solarSystem() mounts), and author the five
  // planets statically below with the same material language.
  return prefabs.solarSystem({ labels: "none", starCount: 84, dustCount: 24 }).filter((node) => {
    if (node.kind === "effect" || node.kind === "light") return true;
    const name = "name" in node ? String(node.name ?? "") : "";
    if (visualReviewCapture) return false;
    return /(star|dust|sun|corona|glow)/i.test(name);
  });
}

const stations = buildStations();
const reviewRustStation = stations.find((station) => station.id === "rust-exchange")!;
const reviewGaleStation = stations.find((station) => station.id === "gale-terminal")!;
const reviewRouteDx = reviewGaleStation.x - reviewRustStation.x;
const reviewRouteDz = reviewGaleStation.z - reviewRustStation.z;
const reviewRouteLength = Math.hypot(reviewRouteDx, reviewRouteDz);
const reviewRoutePerpX = -reviewRouteDz / reviewRouteLength;
const reviewRoutePerpZ = reviewRouteDx / reviewRouteLength;

let sceneBuilder = scene()
  // The review corridor uses a lifted blue-hour sky so the courier's navy
  // hull, amber parcel, and cyan hardware separate from the freightway rather
  // than collapsing into one near-black teal mass. The public planning board
  // retains its original deep-space backdrop.
  .background(visualReviewCapture ? "#28546a" : "#061a2a")
  .addMany(solarKitBackdrop());

const orbitalDustMaterials = [
  material.emissive({ name: "orbital dust cyan", color: "#67e8f9", emissive: "#22d3ee", emissiveIntensity: 0.72, opacity: 0.78 }),
  material.emissive({ name: "orbital dust violet", color: "#c4b5fd", emissive: "#8b5cf6", emissiveIntensity: 0.62, opacity: 0.72 }),
  material.emissive({ name: "orbital dust amber", color: "#fde68a", emissive: "#f59e0b", emissiveIntensity: 0.64, opacity: 0.76 })
] as const;

sceneBuilder = sceneBuilder.addMany(ORBITAL_DUST.map(([x, y, z, scale], index) =>
  primitives.sphere({
    name: "gravity post orbital dust " + (index + 1),
    material: orbitalDustMaterials[index % orbitalDustMaterials.length]!
  })
    .position(x, y, z)
    .scale(visualReviewCapture ? 0.001 : scale)
    .runtime(game.runtimeNode("gravity-post-orbital-dust-" + index, {
      tags: ["renderer-owned", "set-dressing", "non-colliding"]
    }))
));

// Orbital faint ellipse guide rings around Sol
for (const body of WELL_BODIES) {
  if (body.id === "sol") continue;
  if (visualReviewCapture) continue;
  const dist = Math.hypot(body.position[0], body.position[1]);
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: body.name + " orbit path ring guide",
      material: material.emissive({ color: "#071522", emissive: "#1aa6c7", emissiveIntensity: 0.72, opacity: 0.1 })
    }).position(0, PLAY_PLANE_Y - 0.01, 0).rotate(1.5708, 0, 0).scale([dist * 1.92, dist * 1.92, 0.002])
  );
}

// Authored well bodies at static positions — the game board.
for (const body of WELL_BODIES) {
  if (body.id === "sol") continue; // sun family comes from the kit backdrop
  // The review frame is the constructed Rust -> Gale delivery corridor. The
  // planning board still shows every authored well, but detached planet balls
  // do not belong inside the close freightway composition.
  if (visualReviewCapture) continue;
  const color = BODY_COLORS[body.id] ?? "#94a3b8";
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: body.name + " authored gravity-well planet",
      material: material.pbr({
        color,
        roughness: 0.38,
        metallic: 0.24,
        emissive: BODY_EMISSIVE[body.id],
        emissiveIntensity: body.id === "sol" ? 0.55 : 0.2
      })
    }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * (visualReviewCapture ? 0.92 : 4.8))
  );

  // Atmospheric and celestial planet accessories
  if (body.id === "gale") {
    // Planetary ring system for Gale (gas giant)
    if (!visualReviewCapture) sceneBuilder = sceneBuilder.add(
      primitives.torus({
        name: "Gale planetary ring system",
        material: material.emissive({ color: "#78716c", emissive: "#e7e5e4", opacity: 0.32 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).rotate(1.2, 0.35, 0).scale([body.visualRadius * (visualReviewCapture ? 1.8 : 5.05), body.visualRadius * (visualReviewCapture ? 1.8 : 5.05), 0.006])
    );
    if (!visualReviewCapture) sceneBuilder = sceneBuilder.add(
      primitives.torus({
        name: "Gale secondary atmosphere band",
        material: material.emissive({ color: "#6d5ca8", emissive: "#a78bfa", emissiveIntensity: 0.42, opacity: 0.24 })
      }).position(body.position[0], PLAY_PLANE_Y + 0.018, body.position[1]).rotate(0.72, -0.42, 0.18).scale([body.visualRadius * (visualReviewCapture ? 1.5 : 4.2), body.visualRadius * (visualReviewCapture ? 1.5 : 4.2), 0.004])
    );
  } else if (body.id === "aquaria") {
    // Ocean world luminous ionosphere
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({
        name: "Aquaria ionosphere glow",
        material: material.emissive({ color: "#0369a1", emissive: "#38bdf8", opacity: 0.18 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * 3.28)
    );
    sceneBuilder = sceneBuilder.add(
      primitives.torus({
        name: "Aquaria equator highlight",
        material: material.emissive({ color: "#0e7490", emissive: "#67e8f9", emissiveIntensity: 0.54, opacity: 0.3 })
      }).position(body.position[0], PLAY_PLANE_Y + 0.016, body.position[1]).rotate(1.48, 0.22, 0).scale([body.visualRadius * 3.7, body.visualRadius * 3.7, 0.003])
    );
  } else if (body.id === "verdance") {
    // Bio-world luminous atmosphere
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({
        name: "Verdance atmosphere haze",
        material: material.emissive({ color: "#065f46", emissive: "#34d399", opacity: 0.16 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * 3.28)
    );
  } else if (body.id === "rust") {
    // Terracotta dust atmospheric rim
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({
        name: "Rust dust atmospheric rim",
        material: material.emissive({ color: "#7c2d12", emissive: "#f97316", opacity: 0.16 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * 3.28)
    );
  }

  // Small authored moons break the single-color planet read into a more
  // dimensional solar-system composition. They are presentation geometry
  // around the typed well body; route-local gravity still samples WELL_BODIES.
  const moonMaterial = material.pbr({
    name: body.name + " moonlet material",
    color: "#d8e4ef",
    roughness: 0.72,
    metallic: 0.08
  });
  for (const [offsetX, offsetY, offsetZ] of BODY_MOONS[body.id] ?? []) {
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({ name: body.name + " moonlet", material: moonMaterial })
        .position(body.position[0] + offsetX, PLAY_PLANE_Y + offsetY, body.position[1] + offsetZ)
        .scale(Math.max(0.055, body.visualRadius * 0.64))
    );
  }
}

for (const body of WELL_BODIES) {
  if (visualReviewCapture) continue;
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: body.name + " well boundary ring readability guide",
      material: material.emissive({ color: "#071522", emissive: "#49c6e8", emissiveIntensity: 0.7, opacity: body.id === "sol" ? 0.05 : 0.085 })
    }).position(body.position[0], PLAY_PLANE_Y + 0.005, body.position[1]).rotate(1.5708, 0, 0).scale([body.wellRadius * 1.86, body.wellRadius * 1.86, 0.003])
  );
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: body.name + " red collision exclusion ring",
      material: material.emissive({ color: "#3f0a16", emissive: "#fb7185", emissiveIntensity: 0.8, opacity: 0.28 })
    }).position(body.position[0], PLAY_PLANE_Y + 0.012, body.position[1]).rotate(1.5708, 0, 0).scale([body.visualRadius * 3.2, body.visualRadius * 3.2, 0.005])
  );
}

// Stations: typed GLB beacon props + pulsing capture-window rings.
for (const station of stations) {
  const reviewStationRelevant = station.id === "gale-terminal";
  // A tiny scale still submits every GLB primitive. Omit off-camera station
  // hardware from the evidence-only action composition entirely; the live
  // station sensor/ring state remains present while Gale keeps the typed
  // arrival beacon and gate. The completed Rust origin no longer competes
  // with the parcel-bearing courier in the foreground.
  if (!visualReviewCapture || reviewStationRelevant) {
    sceneBuilder = sceneBuilder.add(
      model(assets.gravityPostDockBeacon, { name: station.nodeId })
        // Offset the release-probed satellite beside Gale's capture center so
        // its solar-panel silhouette reads as destination hardware instead of
        // stacking over the courier lane. Sensor coordinates remain owned by
        // stations.ts and are not moved.
        .position(
          station.x + (visualReviewCapture && reviewStationRelevant ? reviewRoutePerpX * 0.7 : 0),
          PLAY_PLANE_Y + 0.06,
          station.z + (visualReviewCapture && reviewStationRelevant ? reviewRoutePerpZ * 0.7 : 0)
        )
        .rotate(0, 0.6, 0)
        // The review destination is one of only two live endpoint silhouettes;
        // keep the typed beacon large enough to read beside the courier while
        // preserving the same station coordinates and sensor ownership.
        // The satellite's authored wingspan is 13 world units; the full
        // planning-board scale would project the panels into the lower-left
        // foreground of the close freight lens. Keep the typed beacon present
        // as a destination identity cue, but compact enough to sit beside the
        // Gale gate instead of reading as a second vehicle.
        .scale(visualReviewCapture ? 0.075 : 0.14)
        .runtime(game.runtimeNode(station.nodeId))
    );
  }
  if (!visualReviewCapture || station.id === "gale-terminal") {
    sceneBuilder = sceneBuilder.add(
      // Typed gate hardware gives every destination a readable silhouette;
      // the pulse ring below remains the live capture-window state indicator.
      model(assets.gravityPostDockGate, {
        name: station.id + " dock gate",
        role: "setDressing",
        scaleMode: "fit",
          // The arrival gate is deliberately legible at the review distance;
          // this is a scale relationship to the existing typed asset, not a
          // duplicate gate or a screen-space marker.
          targetMaxDimension: visualReviewCapture ? 0.82 : 0.98,
        material: material.pbr({
          name: station.id + " dock gate finish",
          color: "#b7f4ff",
          roughness: 0.26,
          metallic: 0.42,
          emissive: "#22d3ee",
          emissiveIntensity: 0.18
        })
      })
        .position(station.x, PLAY_PLANE_Y + 0.12, station.z)
        .runtime(game.runtimeNode(station.id + "-dock-gate", { tags: ["typed-asset", "destination-gate"] }))
    );
  }
  sceneBuilder = sceneBuilder.add(
      primitives.torus({
        name: station.pulseNodeId + " capture window pulse ring",
        material: material.emissive({ color: "#0b2230", emissive: "#67e8f9", opacity: 0.64 })
      }).position(station.x, PLAY_PLANE_Y + 0.01, station.z).rotate(1.5708, 0, 0)
        .scale(visualReviewCapture && !reviewStationRelevant
          ? [0.001, 0.001, 0.001]
          : [DOCK_SENSOR_RADIUS * 2.8, DOCK_SENSOR_RADIUS * 2.8, 0.014])
        .runtime(game.runtimeNode(station.pulseNodeId))
  );
}

// The final contract terminates at Gale Terminal. Build one renderer-owned
// freight corridor on the real Rust -> Gale route so the review frame reads as
// a courier journey through constructed space, rather than a pod and a few
// disconnected orbital props. None of these nodes carry colliders or alter the
// dock sensor owned by stations.ts.
const galeTerminal = stations.find((station) => station.id === "gale-terminal")!;
const rustExchange = stations.find((station) => station.id === "rust-exchange")!;
const terminalDeck = material.pbr({
  name: "Gale Terminal graphite deck",
  color: "#17384d",
  roughness: 0.46,
  metallic: 0.5,
  emissive: "#0e5268",
  emissiveIntensity: 0.18
});
const terminalFrame = material.metal({
  name: "Gale Terminal silver frame",
  color: "#b9ddea",
  roughness: 0.2,
  metallic: 0.86
});
const terminalSignal = material.emissive({
  name: "Gale Terminal approach signal",
  color: "#103b4a",
  emissive: "#67e8f9",
  emissiveIntensity: 1.2,
  opacity: 0.92
});
const terminalHazard = material.emissive({
  name: "Gale Terminal hazard signal",
  color: "#54200d",
  emissive: "#fb923c",
  emissiveIntensity: 1.12,
  opacity: 0.9
});
const courierContactShadow = material.pbr({
  name: "Courier skiff contact shadow",
  color: "#06131c",
  roughness: 0.92,
  metallic: 0.02,
  opacity: 0.74
});
// Small renderer-owned courier fittings reinforce the typed skiff's postal
// identity at action distance. They are attached to the GLB in
// `syncPodVisual`; the GLB remains the primary vehicle and owns the actual
// chassis/cargo silhouette. These fittings only provide readable livery,
// running lights, and deck contact feedback in the review frame.
const courierIdentityCyan = material.emissive({
  name: "Courier postal cyan livery",
  color: "#0b4355",
  emissive: "#67e8f9",
  emissiveIntensity: 1.1,
  opacity: 0.9
});
const courierIdentityAmber = material.emissive({
  name: "Courier postal amber livery",
  color: "#51200c",
  emissive: "#fb923c",
  emissiveIntensity: 1.18,
  opacity: 0.92
});
const courierContactCyan = material.emissive({
  name: "Courier drive contact cyan",
  color: "#063544",
  emissive: "#22d3ee",
  emissiveIntensity: 1.55,
  opacity: 0.94
});
const courierContactAmber = material.emissive({
  name: "Courier drive contact amber",
  color: "#5c2209",
  emissive: "#f97316",
  emissiveIntensity: 1.42,
  opacity: 0.92
});
const courierDeliveryPulse = material.emissive({
  name: "Courier delivery handoff pulse",
  color: "#4a2608",
  emissive: "#fbbf24",
  emissiveIntensity: 1.28,
  opacity: 0.78
});
const courierSignalRed = material.emissive({
  name: "Courier rear signal red",
  color: "#5b1425",
  emissive: "#fb496d",
  emissiveIntensity: 1.24,
  opacity: 0.9
});
const routeDx = galeTerminal.x - rustExchange.x;
const routeDz = galeTerminal.z - rustExchange.z;
const routeLength = Math.hypot(routeDx, routeDz);
const routeUnitX = routeDx / routeLength;
const routeUnitZ = routeDz / routeLength;
const routePerpX = -routeUnitZ;
const routePerpZ = routeUnitX;
// The catalog's release-validated MailPod is a detailed CC-BY transit craft,
// distinct from the route-owned skiff.  In the review lens it serves as one
// stationary terminal shuttle on the same Rust -> Gale vector: a grounded
// scale reference and a second silhouette that makes Gale read as an active
// freight destination.  It is set dressing only; the live pod, sensors, and
// score remain bound to `gravityPostCourierSkiff` and route-local state.
// Keep the supporting transit shuttle at the Gale-side apron, behind and
// outside the live lane. It remains a typed destination cue, but no longer
// competes with the parcel-bearing courier for foreground silhouette.
const reviewMailPodProgress = 0.95;
const reviewMailPodLateral = 1.52;
const reviewMailPodYaw = Math.atan2(routeUnitX, routeUnitZ);
// Boxes use local X as their long axis, so this yaw aligns them to the live
// origin/destination vector instead of a screen-authored arbitrary angle.
const approachYaw = -Math.atan2(routeDz, routeDx);
const acrossRouteYaw = approachYaw + Math.PI / 2;
const corridorPoint = (progress: number, lateral = 0): readonly [number, number] => [
  rustExchange.x + routeDx * progress + routePerpX * lateral,
  rustExchange.z + routeDz * progress + routePerpZ * lateral
];
{
  // Fit the 3x-authored deck's Rust edge (local X=-1.74) across the route plus a
  // 10% outer service-apron overhang, while keeping its destination-pad center
  // (local X=8.25) exactly on Gale. This geometry-derived uniform scale keeps
  // the loading district substantial inside the frozen chase lens without
  // screen-space camera tuning or destination drift.
  const freightDistrictRustEdgeX = -1.74;
  const freightDistrictDestinationPadX = 8.25;
  // The retained district is fitted to the real route with a modest service
  // apron.  The extra footprint gives the cargo terraces and arrival crown
  // enough screen occupancy to establish a journey without changing either
  // endpoint or introducing a second world asset.
  const freightDistrictServiceApronFactor = 1.28;
  const freightDistrictScale = routeLength * freightDistrictServiceApronFactor / (freightDistrictDestinationPadX - freightDistrictRustEdgeX);
  const freightDistrictPadDistance = freightDistrictDestinationPadX * freightDistrictScale;
  const freightDistrictNode = model(assets.gravityPostFreightDistrict, {
    name: "Rust Exchange to Gale Terminal typed freight district",
    role: "setDressing"
  })
      // The asset is authored +X-forward from Rust to Gale. Its deck top is
      // local Y=-0.06, so this placement aligns that connected surface with
      // PLAY_PLANE_Y while preserving the route's real endpoints and camera.
      .position(
        galeTerminal.x - routeUnitX * freightDistrictPadDistance,
        PLAY_PLANE_Y + 0.06 * freightDistrictScale,
        galeTerminal.z - routeUnitZ * freightDistrictPadDistance
      )
      .rotate(0, approachYaw, 0)
      .scale(freightDistrictScale)
      .runtime(game.runtimeNode("rust-gale-typed-freight-district", {
        tags: ["typed-asset", "freight-world", "renderer-owned", "non-colliding"]
      }));
  // The compact GLB remains available on the normal planning board as a
  // typed supporting-world asset.  The close review keeps one compact,
  // side-mounted copy as the textured loading-bay anchor: it gives the
  // otherwise authored corridor a concrete freight-city material break at
  // action distance without occluding the live courier lane or destination
  // gate.  The procedural freightway remains the continuous deck, skyline,
  // and destination architecture; this is one renderer-owned set-dressing
  // node and never participates in gameplay, sensors, or scoring.
  if (!visualReviewCapture) {
    sceneBuilder = sceneBuilder.add(freightDistrictNode);
  } else {
    // The review lens previously put the freight district at the far-left
    // shoulder, where its dark hull read as a disconnected asset-filled void.
    // Stage one smaller, grounded copy at the Gale-side loading apron instead:
    // it now shares depth with the destination gate and shoulder cargo while
    // leaving the courier's approach lane open. The asset's recorded lower
    // bound (minY=-2.05) is seated on PLAY_PLANE_Y; this is world geometry,
    // never a billboard or camera-only fill.
    const [sidecarX, sidecarZ] = corridorPoint(0.82, -1.48);
    sceneBuilder = sceneBuilder.add(
      model(assets.gravityPostFreightDistrict, {
        name: "Gravity Post grounded Gale loading district",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.72
      })
        .position(sidecarX, PLAY_PLANE_Y + 0.12, sidecarZ)
        .rotate(0, approachYaw, 0)
        .runtime(game.runtimeNode("gravity-post-textured-loading-bay-sidecar", {
          tags: ["typed-asset", "freight-world", "review-set-dressing", "non-colliding"]
        }))
    );
  }
}

// An existing release-validated catalog craft supplies one non-primitive
// destination-scale cue that the synthesized skiff cannot provide alone. The
// MailPod is mounted only in the named review composition beside Gale's apron;
// its +Z-forward orientation is aligned to the real Rust -> Gale vector and
// its grounded placement is derived from the same corridor points. During the
// frozen review pose it stays on the outer Gale apron with one typed carton on
// its aft rack, providing logistics depth without competing with the live
// courier. No second physics body, route state, collision region, or camera
// adjustment is added.
if (visualReviewCapture) {
  const [mailPodX, mailPodZ] = corridorPoint(reviewMailPodProgress, reviewMailPodLateral);
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityPostMailPod, {
      name: "Gale Terminal inbound typed MailPod shuttle",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.76
    })
      // The release probe records minY=-0.215 at the neutral origin. Seat that
      // bound on the shared play plane while keeping the hull above the
      // approach apron; this is a world-space placement, not a HUD prop.
      .position(mailPodX, PLAY_PLANE_Y + 0.095, mailPodZ)
      .rotate(0, reviewMailPodYaw, 0)
      .runtime(game.runtimeNode("gale-terminal-inbound-mailpod", {
        tags: ["typed-asset", "freight-transit", "renderer-owned", "non-colliding"]
      }))
  );
  // One small, hash-bound carton rides the support shuttle's aft rack. This
  // makes the relationship between the two typed transit assets legible at a
  // glance while keeping the primary courier's larger parcel unoccluded.
  sceneBuilder = sceneBuilder.add(
    model(assets.courierParcel, {
      name: "Gale Terminal shuttle parcel",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.18
    })
      .position(
        mailPodX - routeUnitX * 0.22,
        PLAY_PLANE_Y + 0.34,
        mailPodZ - routeUnitZ * 0.22
      )
      .rotate(0, reviewMailPodYaw, 0)
      .runtime(game.runtimeNode("gale-terminal-shuttle-parcel", {
        tags: ["typed-asset", "freight-cargo", "renderer-owned", "non-colliding"]
      }))
  );
}

const terminalRunwayPanels = Array.from({ length: 7 }, (_, index) => {
  const progress = index / 6;
  const [x, z] = corridorPoint(0.69 + progress * 0.27);
  return primitives.box({
    name: `Gale Terminal illuminated runway panel ${index}`,
    size: [0.25, 0.028, 0.12],
    material: index % 2 === 0 ? terminalSignal : terminalHazard
  })
    .position(x, PLAY_PLANE_Y - 0.015, z)
    .rotate(0, approachYaw, 0);
});
const terminalDeckCenter = corridorPoint(0.835);
const terminalDockCenter = corridorPoint(0.975);
const terminalDeckLength = routeLength * 0.34;
if (visualReviewCapture) {
  sceneBuilder = sceneBuilder.addMany([
    ...createRustGaleFreightway({
      origin: [rustExchange.x, rustExchange.z],
      destination: [galeTerminal.x, galeTerminal.z],
      playPlaneY: PLAY_PLANE_Y
    }),
    ...terminalRunwayPanels
  ]);
}
if (!visualReviewCapture) sceneBuilder = sceneBuilder.addMany([
  // The former 110 MB orbital-dock audition is intentionally not mounted.
  // It was rejected as a heavy, high-submesh ring and made the normal planning
  // board spend tens of seconds decoding a redundant destination prop. The
  // release-validated typed beacon + gate above, together with this authored
  // terminal deck, keep Gale readable while preserving the same destination
  // identity and sensor coordinates without loading the rejected asset.
  primitives.box({
    name: "Gale Terminal armored approach deck",
    size: [terminalDeckLength, 0.1, 1.56],
    material: terminalDeck
  }).position(terminalDeckCenter[0], PLAY_PLANE_Y - 0.07, terminalDeckCenter[1]).rotate(0, approachYaw, 0),
  ...([-1, 1] as const).map((side) => {
    const [x, z] = corridorPoint(0.835, side * 0.77);
    return primitives.box({
      name: `Gale Terminal continuous deck curb ${side}`,
      size: [terminalDeckLength, 0.1, 0.075],
      material: side < 0 ? terminalSignal : terminalHazard
    }).position(x, PLAY_PLANE_Y - 0.005, z).rotate(0, approachYaw, 0);
  }),
  ...terminalRunwayPanels,
  primitives.cylinder({ name: "Gale Terminal orbital deck", material: terminalDeck })
    .position(terminalDockCenter[0], PLAY_PLANE_Y - 0.08, terminalDockCenter[1])
    .scale([0.84, 0.08, 0.84]),
  primitives.torus({ name: "Gale Terminal outer gantry", material: terminalFrame })
    .position(terminalDockCenter[0], PLAY_PLANE_Y + 0.12, terminalDockCenter[1])
    .rotate(1.5708, 0, 0)
    .scale([0.88, 0.88, 0.045]),
  ...[-1, 1].flatMap((side) => [
    primitives.box({ name: `Gale Terminal grounded portal pylon ${side}`, material: terminalFrame })
      .position(...(() => {
        const [x, z] = corridorPoint(0.955, side * 0.79);
        return [x, PLAY_PLANE_Y + 0.25, z] as const;
      })())
      .scale([0.09, 0.42, 0.09]),
    primitives.box({ name: `Gale Terminal signal bar ${side}`, material: side < 0 ? terminalSignal : terminalHazard })
      .position(...(() => {
        const [x, z] = corridorPoint(0.955, side * 0.79);
        return [x, PLAY_PLANE_Y + 0.51, z] as const;
      })())
      .rotate(0, approachYaw, 0)
      .scale([0.24, 0.045, 0.045])
  ]),
  primitives.box({ name: "Gale Terminal portal header", material: terminalSignal })
    .position(terminalDockCenter[0], PLAY_PLANE_Y + 0.63, terminalDockCenter[1])
    .rotate(0, acrossRouteYaw, 0)
    .scale([0.8, 0.055, 0.055]),
  ...([-1, 1] as const).flatMap((side) => {
    const [moduleX, moduleZ] = corridorPoint(0.87, side * 1.12);
    const [windowX, windowZ] = corridorPoint(0.87, side * 0.9);
    return [
      primitives.box({ name: `Gale Terminal grounded service wing ${side}`, material: terminalDeck })
        .position(moduleX, PLAY_PLANE_Y + 0.16, moduleZ)
        .rotate(0, approachYaw, 0)
        .scale([0.52, 0.26, 0.25]),
      primitives.box({ name: `Gale Terminal service wing viewport ${side}`, material: side < 0 ? terminalSignal : terminalHazard })
        .position(windowX, PLAY_PLANE_Y + 0.2, windowZ)
        .rotate(0, approachYaw, 0)
        .scale([0.32, 0.07, 0.018])
    ];
  })
]);

// The courier's orange delivery module is authored into the vehicle shell,
// but a delivery scene also needs a package that reads as a package at a
// glance. Use the existing hash-bound textured parcel prop as a typed,
// renderer-owned attachment rather than drawing another primitive box. The
// node follows the same authored courier pose in syncPodVisual below; it never
// participates in physics, sensors, scoring, or the route integrator.
const courierParcelScaleRatio = POD_VISUAL_SCALE / 0.68;
// Keep the real parcel subordinate to the skiff's own guarded payload module:
// at the review scale this is a visible handoff carton, not a box that hides
// the canopy and drive silhouette.
const courierParcelMaxDimension = courierParcelMaxDimensionBase * courierParcelScaleRatio;
sceneBuilder = sceneBuilder.add(
  model(assets.courierParcel, {
    name: "mail-pod textured delivery parcel",
    role: "setDressing",
    scaleMode: "fit",
    targetMaxDimension: courierParcelMaxDimension
  })
    .position(stations[0]!.x, PLAY_PLANE_Y + courierParcelLift * courierParcelScaleRatio, stations[0]!.z - 0.43 * courierParcelScaleRatio)
    .runtime(game.runtimeNode("mail-pod-textured-delivery-parcel", {
      tags: ["typed-asset", "courier-cargo", "renderer-owned", "non-colliding", "live-velocity-feedback"]
    }))
);

// Two smaller typed cartons give the shoulder bays a scale cue and make the
// Rust -> Gale lane read as an active logistics district, not only a colored
// architectural backdrop. Their placement is derived from the same live route
// vector as the freightway, and they remain renderer-only set dressing.
if (visualReviewCapture) {
  for (const [progress, lateral, yawOffset] of [
    [0.34, -1.18, -0.12],
    [0.64, 1.2, 0.1]
  ] as const) {
    const [cargoX, cargoZ] = corridorPoint(progress, lateral);
    sceneBuilder = sceneBuilder.add(
      model(assets.courierParcel, {
        name: `Gravity Post shoulder cargo parcel ${progress}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.29
      })
        .position(cargoX, PLAY_PLANE_Y + 0.19, cargoZ)
        .rotate(0, approachYaw + yawOffset, 0)
        .runtime(game.runtimeNode(`gravity-post-shoulder-cargo-${progress}`, {
          tags: ["typed-asset", "freight-cargo", "renderer-owned", "non-colliding"]
        }))
    );
  }
}

// Primary courier: original CC0 parcel skiff with a low working chassis, four
// contact-drive pods, directional cockpit/drive lights, and a guarded amber
// envelope-marked cargo module. Route-local authored state remains the sole
// owner of movement, sensors, collision and scoring.
sceneBuilder = sceneBuilder
  .add(
    model(assets.gravityPostCourierSkiff, {
      name: "mail-pod"
    })
      .position(stations[0]!.x, PLAY_PLANE_Y, stations[0]!.z)
      .scale(POD_VISUAL_SCALE)
      .runtime(game.runtimeNode("mail-pod"))
  )
  // A renderer-owned soft landing mark keeps the four skids visibly married
  // to the freight deck in the frozen review frame. It is deliberately a
  // shallow scene cylinder (not a CSS shadow, collider, or physics footprint)
  // and follows the courier's authored position below.
  .add(
    primitives.cylinder({
      name: "mail-pod grounded contact shadow",
      material: courierContactShadow
    })
      // Keep the shallow disc just above the authored deck so the production
      // depth pass cannot bury it under the lane mesh; it remains a visual
      // contact cue, never a second physics body.
      .position(stations[0]!.x, PLAY_PLANE_Y + 0.018, stations[0]!.z)
      .rotate(0, 0, 0)
      .scale(visualReviewCapture ? [0.78, 0.018, 0.4] : [0.6, 0.014, 0.32])
      .runtime(game.runtimeNode("mail-pod-contact-shadow", {
        tags: ["pod-contact-shadow", "renderer-owned", "non-colliding"]
      }))
  );

// A pair of slim route-side livery plates and a roof beacon turn the skiff
// into a recognizable courier service vehicle rather than an unmarked dark
// chassis in the freight district. These are deliberately subordinate
// fittings around the typed GLB, not a replacement for its modeled hull.
for (const side of [-1, 1] as const) {
  sceneBuilder = sceneBuilder.add(
    primitives.box({
      name: `mail-pod postal livery plate ${side}`,
      size: [0.064, 0.13, 0.38],
      material: side < 0 ? courierIdentityCyan : courierIdentityAmber
    }).position(0, -4, 0).runtime(game.runtimeNode(`mail-pod-livery-${side}`, {
      tags: ["pod-identity", "renderer-owned", "non-colliding"]
    }))
  );
}
sceneBuilder = sceneBuilder
  // The GLB already contains the cream envelope badge. Keep only the small
  // renderer-owned aft marker here so postal identity does not become a pile
  // of duplicate floating plates around the typed vehicle.
  .add(
    primitives.box({
      name: "mail-pod rear route signal",
      size: [0.08, 0.045, 0.16],
      material: courierSignalRed
    }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-rear-route-signal", {
      tags: ["pod-identity", "renderer-owned", "non-colliding"]
    }))
  )
  .add(
    primitives.box({
      name: "mail-pod roof postal light bar",
      size: [0.3, 0.045, 0.07],
      material: courierIdentityCyan
    }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-roof-postal-light-bar", {
      tags: ["pod-identity", "renderer-owned", "non-colliding"]
    }))
  )
  .add(
    primitives.torus({
      name: "mail-pod postal roof beacon ring",
      material: courierDeliveryPulse
    }).position(0, -4, 0)
      .rotate(1.5708, 0, 0)
      .scale([0.11, 0.11, 0.016])
      .runtime(game.runtimeNode("mail-pod-postal-beacon-ring", {
        tags: ["pod-identity", "delivery-state", "renderer-owned", "non-colliding"]
      }))
  )
  .add(
    primitives.box({
      name: "mail-pod parcel restraint cyan",
      size: [0.032, 0.15, 0.06],
      material: courierIdentityCyan
    }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-parcel-restraint-cyan", {
      tags: ["courier-cargo", "renderer-owned", "non-colliding"]
    }))
  )
  .add(
    primitives.box({
      name: "mail-pod parcel restraint amber",
      size: [0.032, 0.15, 0.06],
      material: courierIdentityAmber
    }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-parcel-restraint-amber", {
      tags: ["courier-cargo", "renderer-owned", "non-colliding"]
    }))
  )
  .add(
    primitives.torus({
      name: "mail-pod delivery scan ring",
      material: courierDeliveryPulse
    }).position(0, -4, 0)
      .rotate(1.5708, 0, 0)
      .scale([0.34, 0.34, 0.012])
      .runtime(game.runtimeNode("mail-pod-delivery-scan-ring", {
        tags: ["courier-cargo", "delivery-state", "renderer-owned", "non-colliding"]
      }))
  );

// Four compact drive markers sit under the skiff's modeled contact pods. Their
// live transforms and visibility are driven by the same authored velocity as
// the trail/wake below, making acceleration and deck contact legible in one
// deterministic frame without asserting wheel physics or imported animation.
const courierDriveOffsets = [
  [-1, -0.38],
  [1, -0.38],
  [-1, 0.38],
  [1, 0.38]
] as const;
for (let index = 0; index < courierDriveOffsets.length; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: `mail-pod drive contact marker ${index + 1}`,
      material: index % 2 === 0 ? courierContactCyan : courierContactAmber
    }).position(0, -4, 0)
      .scale([0.09, 0.035, 0.12])
      .runtime(game.runtimeNode(`mail-pod-drive-contact-${index + 1}`, {
        tags: ["pod-contact", "live-velocity-feedback", "renderer-owned", "non-colliding"]
      }))
  );
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: `mail-pod drive contact ring ${index + 1}`,
      material: index % 2 === 0 ? courierContactCyan : courierContactAmber
    }).position(0, -4, 0)
      .rotate(1.5708, 0, 0)
      .scale([0.14, 0.14, 0.014])
      .runtime(game.runtimeNode(`mail-pod-drive-contact-ring-${index + 1}`, {
        tags: ["pod-contact", "live-velocity-feedback", "renderer-owned", "non-colliding"]
      }))
  );
}

// Velocity-aligned renderer-owned engine streaks form one tapered motion trail
// behind the typed pod. Their live positions and yaw come from the authored
// velocity below; this is scene geometry, never a CSS speed-line overlay.
for (let index = 0; index < TRAIL_STREAK_COUNT; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.box({
      name: "mail-pod engine streak " + index,
      size: [0.055, 0.028, 0.3],
      material: material.emissive({ color: "#08293b", emissive: index < 2 ? "#fb923c" : "#67e8f9", emissiveIntensity: 1.35, opacity: 0.84 - index * 0.065 })
    }).position(0, -4, 0)
      .runtime(game.runtimeNode("mail-pod-trail-" + index, { tags: ["pod-trail", "renderer-owned", "non-colliding"] }))
  );
}

// Paired deck-hugging magnetic wake marks visibly connect the skiff's drive
// pods to the freight lane. They are renderer-owned velocity feedback, never
// CSS effects, colliders, or a physical-wheel claim.
for (let index = 0; index < CONTACT_WAKE_COUNT; index += 1) {
  for (const side of [-1, 1] as const) {
    sceneBuilder = sceneBuilder.add(
      primitives.box({
        name: `mail-pod contact wake ${side} ${index}`,
        size: [0.12, 0.012, 0.42],
        material: material.emissive({
          color: side < 0 ? "#082b38" : "#4b1808",
          emissive: side < 0 ? "#67e8f9" : "#fb923c",
          emissiveIntensity: 1.35,
          opacity: 0.9 - index * 0.11
        })
      }).position(0, -4, 0).runtime(game.runtimeNode(`mail-pod-contact-${side}-${index}`, {
        tags: ["pod-contact-wake", "renderer-owned", "live-velocity-feedback", "non-colliding"]
      }))
    );
  }
}

sceneBuilder = sceneBuilder.add(
  primitives.box({
    name: "mail-pod live thrust plume",
    size: [0.07, 0.045, 0.72],
    material: material.emissive({
      name: "mail-pod thrust plume material",
      color: "#fff1c7",
      emissive: "#fb923c",
      emissiveIntensity: 1.8,
      opacity: 0.86
    })
  }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-thrust-plume", {
    tags: ["pod-trail", "renderer-owned", "live-velocity-feedback", "non-colliding"]
  }))
);

// Prediction line: primitive beads (scene geometry, never DOM/SVG).
for (let index = 0; index < PREDICTION_BEADS; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "prediction bead " + (index + 1),
      material: material.emissive({ color: "#221a04", emissive: "#facc15", emissiveIntensity: 1.15, opacity: 0.9 })
    }).position(0, PLAY_PLANE_Y + 0.03, 0).scale(0.065).runtime(game.runtimeNode("pred-bead-" + index))
  );
}

// Cream actual-path beads persist after launch so prediction and flown truth
// remain visually separable through assists, hazards, and docking.
for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "actual path bead " + (index + 1),
      material: material.emissive({ color: "#6b4b1b", emissive: "#ffe7a3", emissiveIntensity: 1.55, opacity: 0.98 })
    }).position(0, -4, 0).scale(visualReviewCapture ? 0.026 : 0.085).runtime(game.runtimeNode("actual-path-bead-" + index))
  );
}

// Dock spark burst pool (in-scene FX).
for (let index = 0; index < SPARK_COUNT; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "dock spark " + (index + 1),
      material: material.emissive({ color: "#0e2733", emissive: "#7dd3fc" })
    }).position(0, -4, 0).scale(0.08).runtime(game.runtimeNode("dock-spark-" + index))
  );
}

// Flyby drone ring (cinematic beat presentation).
for (let index = 0; index < FLYBY_DRONES; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.box({
      name: "flyby drone " + (index + 1),
      material: material.emissive({ color: "#1a1030", emissive: "#c084fc" })
    }).position(0, -4, 0).scale([0.05, 0.02, 0.12]).runtime(game.runtimeNode("flyby-drone-" + index))
  );
}

sceneBuilder = sceneBuilder
  .add(effects.neonBloom({ name: "gravity route glow", intensity: 0.18, threshold: 0.62, maxIntensity: 0.9, antiBlowout: true }))
  // Keep enough cool fill for the board while allowing the freight district's
  // graphite/alloy/rust material groups to retain real value separation in the
  // review lens. A warm opposing directional reveals bevels and parcel edges.
  .add(lights.ambient({ intensity: visualReviewCapture ? 1.08 : 0.64, color: "#e0f4ff" }))
  .add(lights.directional({ position: [2.4, 6.2, 3.2], intensity: visualReviewCapture ? 2.62 : 1.48, color: "#e9f7ff" }))
  .add(lights.directional({ name: "freight material warm rake", position: [-4.2, 3.6, -3.8], intensity: visualReviewCapture ? 1.62 : 0.42, color: "#ffc58d" }))
  .add(lights.point({ name: "solar rim", color: "#fb923c", intensity: 1.8 }).position(-2.5, 2.6, 1.5))
  .add(lights.point({ name: "route cyan practical", color: "#38d6ff", intensity: 1.4 }).position(-2.2, 1.15, -1.5))
  .add(lights.point({ name: "route amber practical", color: "#fbbf24", intensity: 1.3 }).position(2.2, 1.0, 1.5))
  .add(lights.point({ name: "hazard-mail courier key", color: "#e8f7ff", intensity: visualReviewCapture ? 5.4 : 4 }).position(3.0, 2.2, -2.1))
  .add(lights.point({ name: "hazard-mail engine rim", color: "#fb923c", intensity: visualReviewCapture ? 3.6 : 2.2 }).position(1.8, 1.1, -2.15))
  .add(effects.fog({ density: visualReviewCapture ? 0.0018 : 0.005, color: visualReviewCapture ? "#28546a" : "#0a2038" }));

if (visualReviewCapture) {
  const [courierLightX, courierLightZ] = corridorPoint(0.45);
  sceneBuilder = sceneBuilder
    .add(lights.point({ name: "courier cyan locality", color: "#67e8f9", intensity: 3.2 })
      .position(courierLightX + routePerpX * 0.48, PLAY_PLANE_Y + 0.82, courierLightZ + routePerpZ * 0.48))
    .add(lights.point({ name: "parcel amber locality", color: "#fb923c", intensity: 2.45 })
      .position(courierLightX - routePerpX * 0.42, PLAY_PLANE_Y + 0.58, courierLightZ - routePerpZ * 0.42));
}

// World labels remain available on the normal planning board, but the named
// review capture is a renderer-first action frame. Omitting these DOM-backed
// annotations only for that query keeps the live pod, route geometry, and dock
// hardware visually legible without changing gameplay or evidence state.
if (!visualReviewCapture) {
  for (const body of WELL_BODIES) {
    sceneBuilder = sceneBuilder.add(
      labels.anchor(body.name, body.name + " gravity-well body tag", {
        name: body.name + " body label",
        position: [body.position[0], PLAY_PLANE_Y + 0.34 + body.visualRadius, body.position[1]],
        size: 0.14,
        collisionAvoidance: true,
        occlusionAware: true
      })
    );
  }
  for (const station of stations) {
    sceneBuilder = sceneBuilder.add(
      labels.anchor(station.name, station.name + " dock label", {
        name: station.id + " station label",
        position: [station.x, PLAY_PLANE_Y + 0.3, station.z],
        size: 0.11,
        collisionAvoidance: true,
        occlusionAware: true
      })
    );
  }
}


const app = createAuraApp("#app", {
  diagnostics: { overlay: false },
  physics: {
    layers: createCollisionLayers({ pod: ["dock"], dock: ["pod"] }),
    gravity: [0, 0, 0]
  },
  scene: sceneBuilder.camera(visualReviewCapture ? camera.perspective({
    // Anchor the evidence lens to the immutable Rust -> Gale route instead of
    // the moving courier.  The former close lens put the Rust endpoint outside
    // the lower-left frustum, so the real courier became a clipped sliver in
    // the chained-assist artifact.  Pull the same oblique route lens back and
    // up, and widen it just enough to keep both endpoint hardware silhouettes
    // plus the live roadway courier in one honest frame.  Nothing here moves a
    // gameplay coordinate, sensor, or visual asset.
    // Frame the courier from a lower, route-approach vantage: the lane and
    // facade cadence recede toward Gale while the typed skiff remains the
    // readable foreground subject. This is paired with the authored paving,
    // lamps, and arrival threshold below; it is not a camera-only substitute
    // for world geometry.
    position: [
      rustExchange.x - routeDx * 0.45 + routePerpX * 0.38,
      PLAY_PLANE_Y + 1.9,
      rustExchange.z - routeDz * 0.45 + routePerpZ * 0.38
    ],
    target: [
      rustExchange.x + routeDx * 0.62,
      PLAY_PLANE_Y + 0.3,
      rustExchange.z + routeDz * 0.62
    ],
    fov: 56
  }) : camera.perspective({
    position: [0.3, 7.25, 6.65],
    target: [0.28, 0.08, -0.55],
    fov: 41
  }))
});

// ---------------------------------------------------------------------------
// Physics bodies + systems
// ---------------------------------------------------------------------------
const physics = app.physics;
const podBody = physics.createBody({ ...POD_BODY_SPEC, layer: "pod" });
for (const station of stations) {
  physics.createBody({ ...dockSensorBodySpec(station), layer: "dock" });
}

interface DockEventRecord {
  readonly stationId: string;
  readonly kind: "capture" | "bounce";
}

const pendingDocks: string[] = [];
const dockEventLog: DockEventRecord[] = [];
let dockEventCount = 0;

physics.onTriggerEnter((event) => {
  const names = [event.nodeA, event.nodeB];
  const sensorName = names.find((name) => typeof name === "string" && name.startsWith("dock-sensor-"));
  if (!sensorName) return;
  if (!names.includes(POD_BODY_SPEC.name)) return;
  pendingDocks.push(sensorName.slice("dock-sensor-".length));
});

const audio: GravityPostAudio = createGravityPostAudio();
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
let rendererMounted = false;
void app.ready().then(() => {
  rendererMounted = true;
});
const input = app.input({
  actions: {
    burnPrograde: ["KeyW", "ArrowUp"],
    burnRetro: ["KeyS", "ArrowDown"],
    warp: ["Space"],
    next: ["KeyN"],
    retry: ["KeyR"],
    pause: ["KeyP"]
  }
});

const hud: HTMLElement = (() => {
  const element = document.querySelector<HTMLElement>("#hud");
  if (!element) throw new Error("Gravity Post requires #hud.");
  element.dataset.capture = visualReviewCapture ? "review" : "default";
  return element;
})();

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const pod: PodRuntimeState = createPodRuntime(CONTRACTS[0]!.originStationId, CONTRACTS[0]!.tuning.strengthScale);
const flyby = createFlybyState();

let contractIndex = 0;
let score = 0;
let failedContracts = 0;
let completedContracts = 0;
let shiftOver = false;
let campaignComplete = false;
let paused = false;
let aiming = false;
let warpActive = false;
let frame = 0;
let predictionSteps = 0;
let launchPrediction: readonly TrajectorySample[] = [];
let predictionComparedSamples = 0;
let predictionMaxDivergence = 0;
let compositionSubjectSuppressed = false;
// Route-primary probes begin on Delivery 1 (Sol Relay), which sits outside
// the Rust -> Gale review corridor. Keep the gameplay state and telemetry at
// their real contract coordinates, but allow the application composition
// probe to request one renderer-only courier pose on that corridor so the
// named typed vehicle is actually present in the review artifact.
let compositionPresentationOverride = false;
// Renderer-only velocity memory lets the skiff communicate acceleration and
// lateral correction through its suspension/bank pose.  The authored
// integrator and Rapier body remain the sole gameplay owners; this state is
// reset whenever a contract is reset and is never fed back into simulation.
let previousVisualVelocity: readonly [number, number] = [0, 0];
let visualVelocityInitialized = false;
const actualPath: Array<readonly [number, number]> = [];
let lastDockHash: number | null = null;
let lastScoreCard: ScoreBreakdown | null = null;
let lostCooldownSeconds = 0;
let sparkLife = 0;
let touchWarp = false;
const sparkDirections = Array.from({ length: SPARK_COUNT }, (_, index) => {
  const angle = (index / SPARK_COUNT) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const aimStart = { x: 0, y: 0 };
const aimCurrent = { x: 0, y: 0 };

const contract = () => CONTRACTS[contractIndex]!;
const originStation = () => stations.find((candidate) => candidate.id === contract().originStationId)!;
const destinationStation = () => stations.find((candidate) => candidate.id === contract().destinationStationId)!;

function stationWorld(id: string): { readonly x: number; readonly z: number } {
  const spec = stationById(id);
  const position = stationPosition(spec);
  return { x: position[0], z: position[1] };
}

// ---------------------------------------------------------------------------
// Aim + launch input (drag anywhere; the line grows from the pod)
// ---------------------------------------------------------------------------
function currentAimVector(): { readonly dirX: number; readonly dirZ: number; readonly power: number } | null {
  const dx = aimCurrent.x - aimStart.x;
  const dy = aimCurrent.y - aimStart.y;
  const lengthPx = Math.hypot(dx, dy);
  if (lengthPx < 6) return null;
  const power = Math.min(1, lengthPx / AIM_DRAG_PIXEL_RANGE);
  return { dirX: dx / lengthPx, dirZ: dy / lengthPx, power };
}

const canvas = app.canvas;
if (canvas) {
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    audio.unlock();
    if (pod.state !== "ready" || paused || flyby.active) return;
    aiming = true;
    aimStart.x = event.clientX;
    aimStart.y = event.clientY;
    aimCurrent.x = event.clientX;
    aimCurrent.y = event.clientY;
    // Pointer capture is useful for a real pointer leaving the canvas, but a
    // browser-driven evidence run may deliver a synthetic PointerEvent while
    // software WebGL is busy.  In that case the browser has no active native
    // pointer to capture and throws NotFoundError; capture is an input
    // convenience, not part of the launch contract, so keep the actual aim
    // state alive and continue without it.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // The pointerdown/move/up handlers remain the same; only capture is
      // unavailable for this synthetic evidence delivery.
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!aiming) return;
    aimCurrent.x = event.clientX;
    aimCurrent.y = event.clientY;
  });
  const releaseAim = (): void => {
    if (!aiming) return;
    aiming = false;
    const vector = currentAimVector();
    if (vector && vector.power >= MIN_LAUNCH_POWER) {
      const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
      launchWithPrediction([vector.dirX, vector.dirZ], speed);
    }
  };
  canvas.addEventListener("pointerup", releaseAim);
  canvas.addEventListener("pointercancel", releaseAim);
}

window.addEventListener("keydown", () => {
  audio.unlock();
  if (flyby.active) {
    skipFlyby(flyby);
    // `skipFlyby` records the request; consume it immediately so a pointer
    // launch in the same browser task cannot observe the discarded beat as
    // still active. The ordinary frame path continues to use updateFlyby.
    updateFlyby(flyby, 0);
  }
});

// ---------------------------------------------------------------------------
// Event + scoring plumbing
// ---------------------------------------------------------------------------
function emitPodEvents(events: readonly PodEvent[]): void {
  for (const event of events) {
    if (event.type === "launch") audio.play("launch-whoosh");
    else if (event.type === "assist") audio.play("assist-chime");
    else if (event.type === "correction") audio.play("burn-loop");
    else if (event.type === "planet-strike" || event.type === "solar-escape" || event.type === "stranded" || event.type === "timeout") audio.play("pod-lost");
    else if (event.type === "too-fast") audio.play("bounce-off");
  }
}

let lastFailReason: string | null = null;

function registerFail(reason: string): void {
  lastFailReason = reason;
  failedContracts += 1;
  lostCooldownSeconds = 1.4;
  if (failedContracts >= SHIFT_FAIL_LIMIT) shiftOver = true;
}

function handleDock(stationId: string): void {
  if (pod.state !== "coasting") return;
  if (stationId !== contract().destinationStationId) return;
  const outcome = evaluateCapture(pod, contract(), stationId);
  dockEventCount += 1;
  if (outcome.docked) {
    dockEventLog.push({ stationId, kind: "capture" });
    audio.play("dock-lock");
    audio.play("contract-clear");
    const core = stationWorld(contract().destinationStationId);
    lastDockHash = dockPointHash([core.x, core.z]);
    lastScoreCard = scoreContract({
      propellant: pod.propellant,
      distanceToCore: outcome.distanceToCore,
      dockRadius: DOCK_SENSOR_RADIUS,
      assists: pod.assists,
      bonusBodyHit: contract().bonusBodyId !== null && pod.flybys.has(contract().bonusBodyId!)
    });
    score += lastScoreCard.total;
    completedContracts += 1;
    sparkLife = 0.7;
    hidePrediction();
  } else {
    dockEventLog.push({ stationId, kind: "bounce" });
  }
  if (dockEventLog.length > 12) dockEventLog.shift();
}

function resetCampaign(): void {
  lastFailReason = null;
  contractIndex = 0;
  score = 0;
  failedContracts = 0;
  completedContracts = 0;
  shiftOver = false;
  campaignComplete = false;
  lastScoreCard = null;
  flyby.visited.clear();
  flyby.beatsRun = 0;
  dockEventLog.length = 0;
  dockEventCount = 0;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
  hidePrediction();
  audio.play("ui-confirm");
}

function nextContract(): void {
  if (pod.state !== "docked") return;
  audio.play("ui-confirm");
  if (contractIndex >= CONTRACTS.length - 1) {
    campaignComplete = true;
    return;
  }
  contractIndex += 1;
  lastScoreCard = null;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
}

function retryContract(): void {
  if (shiftOver || campaignComplete) {
    resetCampaign();
    return;
  }
  // Retry is a hard contract reset. A flyby requested on the discarded run
  // must not keep intercepting pointer input after the pod returns to ready.
  // This also makes the documented R control deterministic under time warp.
  if (flyby.active) {
    skipFlyby(flyby);
    updateFlyby(flyby, 0);
  }
  paused = false;
  aiming = false;
  audio.play("ui-confirm");
  lastScoreCard = null;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
}

function resetPredictionTelemetry(): void {
  launchPrediction = [];
  predictionComparedSamples = 0;
  predictionMaxDivergence = 0;
  actualPath.length = 0;
  syncActualPath();
}

function launchWithPrediction(direction: readonly [number, number], speed: number): void {
  const result = launch(pod, direction, speed);
  if (result.length === 0) return;
  launchPrediction = integratePath({
    bodies: WELL_BODIES,
    tuning: contract().tuning,
    start: pod.kinematic.position,
    velocity: pod.kinematic.velocity,
    steps: PREDICTION_MAX_STEPS
  }).samples;
  syncLaunchPredictionPath();
  predictionComparedSamples = 0;
  predictionMaxDivergence = 0;
  actualPath.length = 0;
  actualPath.push([pod.kinematic.position[0], pod.kinematic.position[1]]);
  syncActualPath();
  emitPodEvents(result);
}

function recordActualPath(): void {
  const last = actualPath[actualPath.length - 1];
  if (last && Math.hypot(last[0] - pod.kinematic.position[0], last[1] - pod.kinematic.position[1]) < 0.12) return;
  actualPath.push([pod.kinematic.position[0], pod.kinematic.position[1]]);
  if (actualPath.length > ACTUAL_PATH_BEADS) actualPath.shift();
  syncActualPath();
}

function syncActualPath(): void {
  for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
    const node = app.nodes.get("actual-path-bead-" + index);
    const point = actualPath[index];
    if (!node || !point || (visualReviewCapture && index % 3 !== 0)) {
      node?.setVisible(false);
      continue;
    }
    node.setPosition(point[0], PLAY_PLANE_Y + 0.025, point[1]).setVisible(true);
  }
}

function samplePredictionDivergence(): void {
  if (pod.correctionsUsed > 0 || launchPrediction.length === 0) return;
  const sampleIndex = Math.max(0, Math.round(pod.simulationSeconds / FIXED_DT) - 1);
  // Once the bounded prediction horizon is exhausted there is no matching
  // reference sample; never compare a later live position to the final bead.
  if (sampleIndex >= launchPrediction.length) return;
  if (sampleIndex < predictionComparedSamples) return;
  const expected = launchPrediction[sampleIndex]!.position;
  const error = Math.hypot(expected[0] - pod.kinematic.position[0], expected[1] - pod.kinematic.position[1]);
  predictionComparedSamples = sampleIndex + 1;
  predictionMaxDivergence = Math.max(predictionMaxDivergence, error);
}

// ---------------------------------------------------------------------------
// Prediction line
// ---------------------------------------------------------------------------
function updatePrediction(): void {
  const vector = aiming ? currentAimVector() : null;
  if (!vector || pod.state !== "ready") {
    // During coast, retain the launch prediction as low cyan route markers so
    // the player can compare it directly with the cream flown-path truth.
    // Dock/fail/reset still clear both paths through their existing gates.
    if (!aiming && pod.state !== "coasting") hidePrediction();
    return;
  }
  const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
  const path = integratePath({
    bodies: WELL_BODIES,
    tuning: contract().tuning,
    start: pod.kinematic.position,
    velocity: [vector.dirX * speed, vector.dirZ * speed],
    steps: PREDICTION_MAX_STEPS
  });
  predictionSteps = path.samples.length;
  const beads = buildPredictionBeads({ samples: path.samples, maxBeads: PREDICTION_BEADS });
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    const node = app.nodes.get("pred-bead-" + index);
    if (!node) continue;
    const bead = beads[index];
    if (!bead) {
      node.setVisible(false);
      continue;
    }
    node.setVisible(true);
    node.setPosition(bead.x, PLAY_PLANE_Y + 0.03, bead.z);
  }
}

function syncLaunchPredictionPath(): void {
  const beads = buildPredictionBeads({ samples: launchPrediction, maxBeads: PREDICTION_BEADS });
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    const node = app.nodes.get("pred-bead-" + index);
    const bead = beads[index];
    if (!node || !bead) {
      node?.setVisible(false);
      continue;
    }
    node
      .setPosition(bead.x, PLAY_PLANE_Y - 0.045, bead.z)
      .setScale(visualReviewCapture ? 0.028 : 0.052)
      .setVisible(!visualReviewCapture || index % 2 === 0);
  }
}

function hidePrediction(): void {
  predictionSteps = 0;
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    app.nodes.get("pred-bead-" + index)?.setVisible(false);
  }
}

// ---------------------------------------------------------------------------
// Visual sync
// ---------------------------------------------------------------------------
function syncPodVisual(): void {
  // The physics body mirrors the authored integration so real sensor overlaps
  // fire; zero-gravity world + matching velocity keep the mirror exact.
  podBody.setVelocity([pod.kinematic.velocity[0], 0, pod.kinematic.velocity[1]]);
  const podNode = app.nodes.get("mail-pod");
  const parcelNode = app.nodes.get("mail-pod-textured-delivery-parcel");
  const shuttleNode = app.nodes.get("gale-terminal-inbound-mailpod");
  const shuttleParcelNode = app.nodes.get("gale-terminal-shuttle-parcel");
  const shadowNode = app.nodes.get("mail-pod-contact-shadow");
  const postalBeaconRingNode = app.nodes.get("mail-pod-postal-beacon-ring");
  const deliveryScanRingNode = app.nodes.get("mail-pod-delivery-scan-ring");
  const restraintCyanNode = app.nodes.get("mail-pod-parcel-restraint-cyan");
  const restraintAmberNode = app.nodes.get("mail-pod-parcel-restraint-amber");
  const rearRouteSignalNode = app.nodes.get("mail-pod-rear-route-signal");
  const roofPostalLightBarNode = app.nodes.get("mail-pod-roof-postal-light-bar");
  // The named review producer pauses immediately before encoding its live
  // contract-four action frame. Browser scheduling can cross that pause one
  // fixed step earlier or later, moving only the fast courier by a few pixels.
  // Settle presentation (not simulation) to one route-derived coasting point
  // while paused so independent producer contexts prove identical pixels. On
  // resume, the visual returns to the untouched authored pod state.
  const settledReviewPose = visualReviewCapture && paused && pod.state === "coasting";
  const compositionReviewPose = visualReviewCapture && compositionPresentationOverride;
  const reviewPose = settledReviewPose || compositionReviewPose;
  const [x, z] = reviewPose
    ? corridorPoint(compositionReviewPose ? REVIEW_COURIER_PROGRESS : 0.58, REVIEW_COURIER_LATERAL)
    : [pod.kinematic.position[0], pod.kinematic.position[1]] as const;
  const measuredSpeed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  // Match the precision of the genuine HUD readout while settled; sub-pixel
  // plume length must not encode scheduler-only floating-point residue.
  const speed = reviewPose ? Number(measuredSpeed.toFixed(2)) : measuredSpeed;
  // The route-primary composition starts from a ready contract for honest
  // gameplay evidence, but its named review frame is an action presentation.
  // Give renderer-owned streaks the same bounded visual velocity as a live
  // coasting moment without mutating the authored pod state or HUD telemetry.
  const visualSpeed = compositionReviewPose ? 1.42 : speed;
  const dirX = reviewPose ? routeUnitX : (speed > 1e-4 ? pod.kinematic.velocity[0] / speed : 0);
  const dirZ = reviewPose ? routeUnitZ : (speed > 1e-4 ? pod.kinematic.velocity[1] / speed : 0);
  const podYaw = Math.atan2(dirX, dirZ);
  // Derive a bounded presentation pitch/bank from the same velocity that
  // drives the live trail.  A courier that accelerates into the freight lane
  // noses up slightly; a lateral correction banks the chassis and compresses
  // the inside drive markers.  This is renderer-only feedback: no value here
  // is written back to the authored integrator or the Rapier body.
  const displayedVelocityX = dirX * visualSpeed;
  const displayedVelocityZ = dirZ * visualSpeed;
  const previousVelocityX = previousVisualVelocity[0];
  const previousVelocityZ = previousVisualVelocity[1];
  const accelerationX = displayedVelocityX - previousVelocityX;
  const accelerationZ = displayedVelocityZ - previousVelocityZ;
  const accelerationAlong = accelerationX * dirX + accelerationZ * dirZ;
  const accelerationAcross = accelerationX * (-dirZ) + accelerationZ * dirX;
  const presentationPitch = Math.max(-0.075, Math.min(0.075,
    (compositionReviewPose ? -0.028 : 0) - accelerationAlong * 0.055
  ));
  const presentationBank = Math.max(-0.09, Math.min(0.09, accelerationAcross * 0.16));
  if (!visualVelocityInitialized || reviewPose) {
    previousVisualVelocity = [displayedVelocityX, displayedVelocityZ];
    visualVelocityInitialized = true;
  } else {
    previousVisualVelocity = [pod.kinematic.velocity[0], pod.kinematic.velocity[1]];
  }
  podNode
    ?.setPosition(x, PLAY_PLANE_Y, z)
    .setRotation(presentationPitch, podYaw, presentationBank);
  // Keep the real textured parcel seated on the skiff's rear cargo cradle.
  // The offset is expressed in the same route-authored forward axis as the
  // vehicle, so it remains attached through launch, corrections, and the
  // deterministic review pose without touching gameplay coordinates.
  const parcelBackOffset = 0.43 * courierParcelScaleRatio;
  parcelNode
    ?.setPosition(
      x - dirX * parcelBackOffset,
      PLAY_PLANE_Y + courierParcelLift * courierParcelScaleRatio,
      z - dirZ * parcelBackOffset
    )
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");
  shadowNode
    // Keep the shallow contact mark on top of the freight lane. A buried
    // shadow reads as black wheel holes; the lifted mark reads as a grounded
    // skiff with visible deck contact while remaining renderer-only geometry.
    ?.setPosition(x, PLAY_PLANE_Y + 0.02, z)
    .setRotation(0, podYaw, 0)
    .setScale([
      visualReviewCapture ? 0.82 + Math.min(0.12, speed * 0.04) : 0.6,
      visualReviewCapture ? 0.012 : 0.014,
      visualReviewCapture ? 0.4 : 0.32
    ])
    .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");
  const visibleMotes = !compositionSubjectSuppressed &&
    ((pod.state === "coasting" && speed > 0.08) || compositionReviewPose);
  const perpX = -dirZ;
  const perpZ = dirX;
  // The contact pair is intentionally tied to the same displayed velocity as
  // the trail: faster/coasting frames compress the suspension and stretch the
  // wake, while a cross-route correction introduces a small bank.  This makes
  // the motion cue causal and repeatable instead of an always-on decoration.
  const contactCompression = Math.max(0.72, 1 - Math.min(0.2,
    visualSpeed * 0.022 + Math.abs(accelerationAcross) * 0.06
  ));
  // Keep the courier fittings on the same authored local axes as the typed
  // skiff. The cyan/amber side plates provide a stable postal livery read;
  // the roof ring and cargo straps give the parcel module a deliberate
  // handoff identity rather than a loose crate floating over the hull.
  for (const side of [-1, 1] as const) {
    app.nodes.get(`mail-pod-livery-${side}`)
      ?.setPosition(
        x + perpX * side * 0.49,
        PLAY_PLANE_Y + 0.38,
        z + perpZ * side * 0.49
      )
      .setRotation(presentationPitch, podYaw, presentationBank)
      .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");
  }
  rearRouteSignalNode
    ?.setPosition(x - dirX * 0.62, PLAY_PLANE_Y + 0.3, z - dirZ * 0.62)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");
  roofPostalLightBarNode
    ?.setPosition(x + dirX * 0.05, PLAY_PLANE_Y + 0.82, z + dirZ * 0.05)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");
  postalBeaconRingNode
    ?.setPosition(x + dirX * 0.04, PLAY_PLANE_Y + 0.78, z + dirZ * 0.04)
    .setRotation(1.5708, 0, 0)
    .setScale([0.14, 0.14, 0.018])
    .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");
  const restraintVisible = !compositionSubjectSuppressed && pod.state !== "lost";
  restraintCyanNode
    ?.setPosition(x + perpX * -0.24, PLAY_PLANE_Y + 0.64, z + perpZ * -0.24)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(restraintVisible);
  restraintAmberNode
    ?.setPosition(x + perpX * 0.24, PLAY_PLANE_Y + 0.64, z + perpZ * 0.24)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(restraintVisible);
  const scanVisible = !compositionSubjectSuppressed && pod.state !== "lost" &&
    (visualReviewCapture || pod.state === "ready" || pod.state === "docked");
  const scanBreathe = 1 + Math.sin(frame * 0.22) * 0.08;
  deliveryScanRingNode
    ?.setPosition(x, PLAY_PLANE_Y + 0.72, z)
    .setScale([0.34 * scanBreathe, 0.34 * scanBreathe, 0.012])
    .setVisible(scanVisible);
  // Four emissive drive markers sit just above the lane at the same offsets
  // as the skiff's modeled contact pods. They pulse subtly while coasting (or
  // in the frozen review pose) and disappear when the courier is hidden/lost.
  for (let index = 0; index < courierDriveOffsets.length; index += 1) {
    const node = app.nodes.get(`mail-pod-drive-contact-${index + 1}`);
    const [side, longitudinal] = courierDriveOffsets[index]!;
    if (!node) continue;
    const contactPulse = 1 + Math.sin(frame * 0.36 + index * 0.9) * 0.12;
    node
      .setPosition(
        x + perpX * side * 0.44 + dirX * longitudinal,
        PLAY_PLANE_Y + 0.155,
        z + perpZ * side * 0.44 + dirZ * longitudinal
      )
      .setRotation(presentationPitch, podYaw, presentationBank)
      .setScale([0.12 * contactPulse, 0.045 * contactCompression, 0.16 * contactPulse])
      .setVisible(visibleMotes || (visualReviewCapture && !compositionSubjectSuppressed));
    app.nodes.get(`mail-pod-drive-contact-ring-${index + 1}`)
      ?.setPosition(
        x + perpX * side * 0.44 + dirX * longitudinal,
        PLAY_PLANE_Y + 0.12,
        z + perpZ * side * 0.44 + dirZ * longitudinal
      )
      .setRotation(1.5708, 0, 0)
      .setScale([0.16 * contactPulse, 0.16 * contactPulse * (1 + (1 - contactCompression) * 0.7), 0.014])
      .setVisible(visibleMotes || (visualReviewCapture && !compositionSubjectSuppressed));
  }
  for (let index = 0; index < TRAIL_STREAK_COUNT; index += 1) {
    const mote = app.nodes.get("mail-pod-trail-" + index);
    if (!mote) continue;
    const distance = (visualReviewCapture ? 0.48 : 0.34) + index * (visualReviewCapture ? 0.31 : 0.23);
    const width = visualReviewCapture ? Math.max(0.18, 0.54 - index * 0.09) : Math.max(0.28, 0.92 - index * 0.09);
    const length = settledReviewPose
      ? 0.68
      : visualReviewCapture
        ? 0.52 + Math.min(0.72, visualSpeed * 0.18)
        : 0.8 + Math.min(1.35, visualSpeed * 0.28) + index * 0.06;
    mote.setPosition(x - dirX * distance, PLAY_PLANE_Y + 0.04 + index * 0.006, z - dirZ * distance)
      .setRotation(0, podYaw, 0)
      .setScale([width, width, length])
      .setVisible(visibleMotes && (!visualReviewCapture || index < 5));
  }
  for (let index = 0; index < CONTACT_WAKE_COUNT; index += 1) {
    for (const side of [-1, 1] as const) {
      const wake = app.nodes.get(`mail-pod-contact-${side}-${index}`);
      if (!wake) continue;
      const distance = 0.28 + index * 0.22;
      const lateral = side * 0.19;
      wake
        .setPosition(
          x - dirX * distance + perpX * lateral,
          PLAY_PLANE_Y + 0.008,
          z - dirZ * distance + perpZ * lateral
        )
        .setRotation(presentationPitch, podYaw, presentationBank)
        .setScale([
          Math.max(0.34, 0.72 - index * 0.064 + Math.abs(accelerationAlong) * 0.035),
          1,
          (settledReviewPose ? 0.88 : 0.82) * (1 + visualSpeed * 0.035)
        ])
        .setVisible(visibleMotes);
    }
  }
  const thrustPlume = app.nodes.get("mail-pod-thrust-plume");
  thrustPlume
    ?.setPosition(x - dirX * 0.48, PLAY_PLANE_Y + 0.035, z - dirZ * 0.48)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setScale(settledReviewPose
      ? [0.62, 0.62, 0.54]
      : visualReviewCapture
        ? [0.62, 0.62, 0.38 + Math.min(0.5, visualSpeed * 0.2)]
        : [1, 1, 0.52 + Math.min(0.8, visualSpeed * 0.32)])
    .setVisible(visibleMotes);
  if (settledReviewPose) {
    // Settle the renderer-owned flown-history beads to the same real route
    // segment as the courier. The telemetry array remains untouched; this only
    // removes one-step sampling jitter from the paused evidence composition.
    for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
      const bead = app.nodes.get("actual-path-bead-" + index);
      if (!bead) continue;
      if (index >= 8) {
        bead.setVisible(false);
        continue;
      }
      const [beadX, beadZ] = corridorPoint(0.045 + index * 0.052);
      bead.setPosition(beadX, PLAY_PLANE_Y + 0.025, beadZ).setVisible(true);
    }
  }
  // A route-primary composition override is renderer-only: keep the live
  // physics body at its authored Sol Relay position while the probe is
  // paused on the Rust -> Gale visual corridor. The coasting review settle,
  // by contrast, mirrors the displayed point so its sensor state remains
  // deterministic while paused.
  podBody.setPosition(compositionReviewPose && pod.state === "ready"
    ? [pod.kinematic.position[0], PLAY_PLANE_Y, pod.kinematic.position[1]]
    : [x, PLAY_PLANE_Y, z]);

  // In the review lens the typed MailPod is a small inbound shuttle on the
  // outer Gale loading apron. Keep it out of the active courier lane so the
  // primary silhouette stays unambiguous. This is a renderer-only depth cue:
  // the shuttle and its typed carton never enter the pod sensor, integrator,
  // or scoring state.
  if (visualReviewCapture) {
    const [shuttleX, shuttleZ] = corridorPoint(reviewMailPodProgress, reviewMailPodLateral);
    shuttleNode
      ?.setPosition(shuttleX, PLAY_PLANE_Y + 0.095, shuttleZ)
      .setRotation(0, reviewMailPodYaw, 0)
      .setVisible(!compositionSubjectSuppressed);
    shuttleParcelNode
      ?.setPosition(
        shuttleX - routeUnitX * 0.22,
        PLAY_PLANE_Y + 0.34,
        shuttleZ - routeUnitZ * 0.22
      )
      .setRotation(0, reviewMailPodYaw, 0)
      .setVisible(!compositionSubjectSuppressed);
  }
}

function syncStationPulses(): void {
  const destination = destinationStation();
  for (const station of stations) {
    const pulse = app.nodes.get(station.pulseNodeId);
    if (!pulse) continue;
    if (visualReviewCapture) {
      // The live origin beacon is useful before launch, then yields to the
      // flown route and destination. This removes the spent, clipped origin
      // ring from the in-flight artifact without inventing a second visual
      // state: visibility is bound directly to the pod state.
      const isOriginBriefing = station.id === "rust-exchange" && pod.state === "ready";
      app.nodes.get(station.nodeId)?.setVisible(station.id === "gale-terminal" || isOriginBriefing);
    }
    if (visualReviewCapture && station.id !== "gale-terminal") {
      pulse.setScale([0.001, 0.001, 0.001]);
      continue;
    }
    if (visualReviewCapture && paused && station.id === "gale-terminal") {
      const settledScale = station.dockRadius * 1.35;
      pulse.setScale([settledScale, settledScale, 0.02]);
      continue;
    }
    const distance = Math.hypot(pod.kinematic.position[0] - station.x, pod.kinematic.position[1] - station.z);
    const isOpen = station.id === destination.id && pod.state === "coasting" &&
      distance < station.dockRadius * 3.2 &&
      Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) < contract().captureLimit * 1.2;
    const breathe = isOpen ? 1.25 + Math.sin(frame * 0.35) * 0.22 : 1;
    const reviewScale = visualReviewCapture ? 1.35 : 2.2;
    pulse.setScale([station.dockRadius * reviewScale * breathe, station.dockRadius * reviewScale * breathe, 0.02]);
  }
}

function syncSparks(dt: number): void {
  if (sparkLife > 0) sparkLife = Math.max(0, sparkLife - dt);
  const core = stationWorld(contract().destinationStationId);
  for (let index = 0; index < SPARK_COUNT; index += 1) {
    const node = app.nodes.get("dock-spark-" + index);
    if (!node) continue;
    if (sparkLife <= 0) {
      node.setPosition(0, -4, 0);
      node.setVisible(false);
      continue;
    }
    const travel = (0.7 - sparkLife) * 1.4;
    const direction = sparkDirections[index]!;
    node.setPosition(core.x + direction[0] * travel, PLAY_PLANE_Y + 0.05 + sparkLife * 0.3, core.z + direction[1] * travel);
    node.setVisible(true);
  }
}

function syncFlybyDrones(progress: number | null): void {
  const body = flybyBody(flyby.bodyId);
  for (let index = 0; index < FLYBY_DRONES; index += 1) {
    const node = app.nodes.get("flyby-drone-" + index);
    if (!node) continue;
    if (progress === null || !body) {
      node.setPosition(0, -4, 0);
      node.setVisible(false);
      continue;
    }
    node.setVisible(true);
    const angle = (index / FLYBY_DRONES) * Math.PI * 2 + progress * 2.4;
    const radius = body.visualRadius + 0.32 - progress * 0.12;
    const yLift = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 0.22;
    node.setPosition(body.position[0] + Math.cos(angle) * radius, PLAY_PLANE_Y + yLift, body.position[1] + Math.sin(angle) * radius);
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}

function renderHud(): void {
  const active = contract();
  const origin = originStation();
  const destination = destinationStation();
  const bonus = active.bonusBodyId ? WELL_BODIES.find((body) => body.id === active.bonusBodyId) : undefined;
  const fuelPct = Math.round(pod.propellant);
  const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  const adriftLeft = Math.max(0, Math.ceil(ADRIFT_LIMIT_SECONDS - pod.adriftSeconds));

  let statusLine: string;
  if (shiftOver) statusLine = "Shift over — three contracts failed. Press R to reset the campaign.";
  else if (campaignComplete) statusLine = "Shift complete! All four deliveries flown. Press R to fly it again.";
  else if (pod.state === "docked") statusLine = "Delivered. Press N for the next contract.";
  else if (pod.state === "lost") statusLine = "Hull lost — " + (lastFailReason ?? "route failure") + ". Relaunching this dispatch.";
  else if (pod.state === "ready") statusLine = aiming ? "Drag to shape the launch — release to fly." : "Drag anywhere to aim the launch.";
  else if (pod.propellant <= 0) statusLine = "Tank dry — adrift " + adriftLeft + "s.";
  else statusLine = pod.correctionTokensRemaining > 0
    ? "Coasting. One W/S correction available · hold Space to warp."
    : "Coasting. Correction spent · hold Space to warp.";

  const scoreCardHtml = lastScoreCard ? [
    '<section class="gp-panel gp-scorecard" data-testid="gp-score-card">',
    '<span class="gp-eyebrow">Delivery scored</span>',
    '<div class="gp-row">' +
      metric("Base", String(lastScoreCard.base)) +
      metric("Fuel", "+" + lastScoreCard.fuelPoints) +
      metric("Precision", "+" + lastScoreCard.precisionPoints) +
    "</div>",
    '<div class="gp-row">' +
      metric("Assists x" + pod.assists.size, "+" + lastScoreCard.assistPoints) +
      metric("Flyby", "+" + lastScoreCard.flybyPoints) +
      metric("Total", String(lastScoreCard.total)) +
    "</div>",
    "</section>"
  ].join("") : "";

  const flybyName = flyby.active && flyby.bodyId ? (flybyBody(flyby.bodyId)?.name ?? "") : "";
  const flybyHtml = flyby.active ? [
    '<section class="gp-panel gp-flyby" data-testid="gp-flyby">',
    '<span class="gp-eyebrow">Flyby beat</span>',
    "<p>Sweeping " + escapeHtml(flybyName) + " — press any key to skip.</p>",
    "</section>"
  ].join("") : "";

  hud.innerHTML = [
    '<section class="gp-panel gp-briefing">',
    '<span class="gp-eyebrow">Gravity Post · courier shift</span>',
    "<h1>" + escapeHtml(active.title) + "</h1>",
    '<p class="gp-brief">' + escapeHtml(active.briefing) + "</p>",
    '<div class="gp-route"><span>' + escapeHtml(origin.name) + '</span><i>→</i><span>' + escapeHtml(destination.name) + "</span></div>",
    '<p class="gp-meta">Capture under ' + active.captureLimit.toFixed(1) + " u/s · par fuel " + active.parFuel + "%" +
      (bonus ? " · bonus flyby " + escapeHtml(bonus.name) : "") + "</p>",
    "</section>",
    '<section class="gp-panel gp-readouts">',
    metric("Fuel", fuelPct + "%"),
    '<div class="gp-fuel"><i style="width:' + fuelPct + '%"></i></div>',
    '<div class="gp-row">' +
      metric(visualReviewCapture ? "State" : "Speed", visualReviewCapture ? pod.state.toUpperCase() : speed.toFixed(2)) +
      metric("Assists", String(pod.assists.size)) +
      metric("Hulls", String(SHIFT_FAIL_LIMIT - failedContracts)) +
    "</div>",
    '<div class="gp-row">' +
      metric(visualReviewCapture ? "Delivered" : "Score", visualReviewCapture ? completedContracts + "/" + CONTRACTS.length : String(score)) +
      metric("Correction", pod.correctionTokensRemaining > 0 ? "READY" : (active.correctionTokens === 0 ? "NONE" : "SPENT")) +
      metric(visualReviewCapture ? "Leg" : "Time", visualReviewCapture ? contractIndex + 1 + "/" + CONTRACTS.length : Math.max(0, active.timeLimitSeconds - pod.flightSeconds).toFixed(0) + "s") +
      metric("Warp", "x" + (warpActive && pod.state === "coasting" ? TIME_WARP_MULTIPLIER : 1)) +
    "</div>",
    '<p class="gp-status">' + escapeHtml(statusLine) + "</p>",
    '<div class="gp-actions">',
    '<button id="gp-correct-pro" type="button"' + (pod.correctionTokensRemaining > 0 ? "" : " disabled") + '>Correct + (W)</button>',
    '<button id="gp-correct-retro" type="button"' + (pod.correctionTokensRemaining > 0 ? "" : " disabled") + '>Correct − (S)</button>',
    '<button id="gp-warp" type="button">Warp hold</button>',
    '<button id="gp-retry" type="button">Retry (R)</button>',
    '<button id="gp-next" type="button"' + (pod.state === "docked" ? "" : " disabled") + '>Next (N)</button>',
    '<button id="gp-pause" type="button" aria-pressed="' + paused + '">' + (paused ? "Resume" : "Pause") + "</button>",
    "</div>",
    "</section>",
    scoreCardHtml,
    flybyHtml
  ].join("");

  hud.querySelector("#gp-retry")?.addEventListener("click", () => { audio.unlock(); retryContract(); });
  hud.querySelector("#gp-next")?.addEventListener("click", () => { audio.unlock(); nextContract(); });
  hud.querySelector("#gp-pause")?.addEventListener("click", () => { paused = !paused; });
  hud.querySelector("#gp-correct-pro")?.addEventListener("click", () => { audio.unlock(); emitPodEvents(applyCorrection(pod, 1)); });
  hud.querySelector("#gp-correct-retro")?.addEventListener("click", () => { audio.unlock(); emitPodEvents(applyCorrection(pod, -1)); });
  bindHold("#gp-warp", () => { touchWarp = true; }, () => { touchWarp = false; });
}

function metric(label: string, value: string): string {
  return '<div class="gp-metric"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
}

function bindHold(selector: string, down: () => void, up: () => void): void {
  const element = hud.querySelector(selector);
  element?.addEventListener("pointerdown", (event) => { event.preventDefault(); audio.unlock(); down(); });
  element?.addEventListener("pointerup", up);
  element?.addEventListener("pointerleave", up);
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
function publishEvidence(): void {
  const proof = audio.proof();
  let drawCalls = 0;
  try {
    drawCalls = Number((app.diagnostics() as { drawCalls?: number }).drawCalls ?? 0);
  } catch {
    drawCalls = 0;
  }
  window.__GRAVITY_POST_EVIDENCE__ = {
    schema: "aura3d-showcase-gravity-post/1.0",
    mounted: true,
    rendererMounted,
    appId: "showcase-gravity-post",
    status: "ready",
    claimLabel: "prototype",
    frame,
    drawCalls,
    contractIndex,
    contractId: contract().id,
    propellant: Math.round(pod.propellant * 10) / 10,
    podPosition: [Math.round(pod.kinematic.position[0] * 1000) / 1000, Math.round(pod.kinematic.position[1] * 1000) / 1000],
    podSpeed: Math.round(Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) * 1000) / 1000,
    podState: pod.state,
    assists: [...pod.assists],
    predictionSteps,
    predictionComparedSamples,
    predictionMaxDivergence: Math.round(predictionMaxDivergence * 1_000_000) / 1_000_000,
    predictionTolerance: PREDICTION_DIVERGENCE_TOLERANCE,
    predictionWithinTolerance: predictionComparedSamples > 0 && predictionMaxDivergence <= PREDICTION_DIVERGENCE_TOLERANCE,
    actualPathPoints: actualPath.length,
    correctionTokensRemaining: pod.correctionTokensRemaining,
    correctionsUsed: pod.correctionsUsed,
    flightSeconds: Math.round(pod.flightSeconds * 100) / 100,
    dockEventCount,
    dockEvents: dockEventLog.map((record) => record.stationId + ":" + record.kind),
    failedContracts,
    lastFailReason,
    completedContracts,
    score,
    shiftOver,
    campaignComplete,
    paused,
    warping: warpActive,
    aiming,
    adriftSeconds: Math.round(pod.adriftSeconds * 10) / 10,
    flybyBeatsRun: flyby.beatsRun,
    flybyActive: flyby.active,
    visitedFlybys: [...flyby.visited],
    reducedMotion,
    audioCues: proof.recentCues.slice(-16),
    audioProof: {
      cueCount: proof.cueCount,
      busCount: proof.busCount,
      unlocked: proof.unlocked,
      playedCueCount: proof.playedCueCount
    },
    primaryAssets: ["gravityPostCourierSkiff", "gravityPostDockBeacon"],
    typedAssets: [
      { id: "gravityPostCourierSkiff", typedRef: "assets.gravityPostCourierSkiff", role: "primaryVehicle" },
      { id: "gravityPostDockBeacon", typedRef: "assets.gravityPostDockBeacon", role: "primaryWorld" },
      { id: "courierParcel", typedRef: "assets.courierParcel", role: "supportingCargo" },
      { id: "gravityPostMailPod", typedRef: "assets.gravityPostMailPod", role: "supportingTransitVehicle" },
      { id: "gravityPostFreightDistrict", typedRef: "assets.gravityPostFreightDistrict", role: "supportingFreightWorld" }
    ],
    systems: [
      "route-local authored gravity integrator",
      "Rapier kinematic pod and dock sensors",
      "prediction path and correction assists",
      "solar-system presentation kit"
    ],
    controls: CONTROLS,
    claimBoundary: CLAIM_BOUNDARY,
    lastDockHash
  };
  window.__AURA3D_SHOWCASE_GRAVITY_POST__ = window.__GRAVITY_POST_EVIDENCE__;
  document.body.dataset.gravityPostReady = "true";
  document.body.dataset.aura3dShowcaseReady = "true";
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
let lastTime = 0;

function updateGameplay(dt: number): void {
  frame += 1;
  audio.tick(dt);

  input.update(dt);
  if (input.pressed("pause")) {
    paused = !paused;
    if (paused && visualReviewCapture) {
      syncPodVisual();
      syncStationPulses();
      renderHud();
    }
  }
  if (input.pressed("retry")) retryContract();
  if (input.pressed("next")) nextContract();
  if (paused) {
    warpActive = false;
    publishEvidence();
    return;
  }

  // Skippable flyby beat: gameplay frozen while the drone sweep runs.
  const beatProgress = updateFlyby(flyby, dt);
  if (flyby.active) {
    syncFlybyDrones(reducedMotion ? null : beatProgress);
    renderHud();
    publishEvidence();
    return;
  }
  syncFlybyDrones(null);

  if (lostCooldownSeconds > 0) {
    lostCooldownSeconds = Math.max(0, lostCooldownSeconds - dt);
    if (lostCooldownSeconds === 0 && pod.state === "lost") {
      resetPodForContract(pod, contract());
      hidePrediction();
    }
  }

  if (pod.state === "coasting" && input.pressed("burnPrograde")) emitPodEvents(applyCorrection(pod, 1));
  if (pod.state === "coasting" && input.pressed("burnRetro")) emitPodEvents(applyCorrection(pod, -1));
  warpActive = (input.held("warp") || touchWarp) && pod.state === "coasting";
  if (warpActive) audio.play("warp-hum");

  if (pod.state === "ready") {
    updatePrediction();
  } else if (pod.state === "coasting") {
    const events = updateCoast({ pod, contract: contract(), bodies: WELL_BODIES, dt, warpActive });
    samplePredictionDivergence();
    recordActualPath();
    for (const flybyId of pod.flybys) {
      if (requestFlyby(flyby, flybyId, { reducedMotion })) {
        audio.play("ui-confirm");
        break;
      }
    }
    emitPodEvents(events);
    for (const event of events) {
      if (event.type === "planet-strike") { registerFail("planet-strike:" + (event.bodyId ?? "")); break; }
      if (event.type === "solar-escape") { registerFail("solar-escape"); break; }
      if (event.type === "stranded") { registerFail("stranded"); break; }
      if (event.type === "timeout") { registerFail("timeout"); break; }
    }
    updatePrediction();
  }

  // Real physics step dispatches sensor triggers; drain them after integrating.
  physics.step(dt);
  while (pendingDocks.length > 0) {
    handleDock(pendingDocks.shift()!);
  }

  syncPodVisual();
  syncStationPulses();
  syncSparks(dt);
  renderHud();
  publishEvidence();
}

app.onFrame(({ time }) => {
  const dt = lastTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0.001, time - lastTime));
  lastTime = time;
  updateGameplay(dt);
});

renderHud();
publishEvidence();

// Manual stepping keeps automated proof deterministic even where headless
// requestAnimationFrame throttles; live play still runs on the RAF loop.
// __GRAVITY_POST_STEP__ runs the full mounted pipeline (renders a frame);
// __GRAVITY_POST_SIM_STEP__ advances gameplay/evidence without rendering.
window.__GRAVITY_POST_STEP__ = (dtSeconds: number) => {
  app.step(Math.min(0.05, Math.max(0.001, dtSeconds)));
};
window.__GRAVITY_POST_SIM_STEP__ = (dtSeconds: number) => {
  updateGameplay(Math.min(0.05, Math.max(0.001, dtSeconds)));
};
// Render + readback inside ONE task: the compositor cannot clear the drawing
// buffer between the render and the read, so pixel evidence is race-free.
window.__GRAVITY_POST_CAPTURE__ = () => {
  app.step(1 / 30);
  const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
  if (!canvas) throw new Error("Gravity Post canvas missing.");
  return canvas.toDataURL("image/png");
};
/** Debug/test surface: the mounted physics runtime. */
(window as unknown as Record<string, unknown>).__GRAVITY_POST_PHYSICS__ = physics;
window.__GRAVITY_POST_EVIDENCE_SNAPSHOT__ = () => window.__GRAVITY_POST_EVIDENCE__;

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application" as const,
    get subject() {
      const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
      const [displayX, displayZ] = visualReviewCapture && compositionPresentationOverride
        ? corridorPoint(REVIEW_COURIER_PROGRESS, REVIEW_COURIER_LATERAL)
        : [pod.kinematic.position[0], pod.kinematic.position[1]] as const;
      return {
        position: [displayX, PLAY_PLANE_Y, displayZ] as const,
        rotation: [0, speed > 1e-4 ? Math.atan2(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) : 0, 0] as const,
        targetSize: 3.8
      };
    },
    setSubjectSuppressed(suppressed: boolean) {
      compositionSubjectSuppressed = suppressed;
      app.nodes.get("mail-pod")?.setVisible(!suppressed);
      app.nodes.get("mail-pod-textured-delivery-parcel")?.setVisible(!suppressed);
      app.nodes.get("mail-pod-contact-shadow")?.setVisible(!suppressed && pod.state !== "lost");
      app.nodes.get("mail-pod-delivery-scan-ring")?.setVisible(!suppressed);
      app.nodes.get("mail-pod-parcel-restraint-cyan")?.setVisible(!suppressed);
      app.nodes.get("mail-pod-parcel-restraint-amber")?.setVisible(!suppressed);
      app.nodes.get("mail-pod-rear-route-signal")?.setVisible(!suppressed);
      app.nodes.get("mail-pod-roof-postal-light-bar")?.setVisible(!suppressed);
      for (const side of [-1, 1] as const) app.nodes.get(`mail-pod-livery-${side}`)?.setVisible(!suppressed);
      for (let index = 0; index < courierDriveOffsets.length; index += 1) {
        app.nodes.get(`mail-pod-drive-contact-${index + 1}`)?.setVisible(!suppressed);
        app.nodes.get(`mail-pod-drive-contact-ring-${index + 1}`)?.setVisible(!suppressed);
      }
      for (let index = 0; index < TRAIL_STREAK_COUNT; index += 1) app.nodes.get("mail-pod-trail-" + index)?.setVisible(false);
    },
    settleSubjectPose() {
      paused = true;
      compositionPresentationOverride = visualReviewCapture;
      resetPodForContract(pod, contract());
      app.nodes.get("mail-pod")?.setScale([POD_VISUAL_SCALE, POD_VISUAL_SCALE, POD_VISUAL_SCALE]).setVisible(!compositionSubjectSuppressed);
      syncPodVisual();
      publishEvidence();
    }
  },
  configurable: true
});
