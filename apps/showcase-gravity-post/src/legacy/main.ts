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
import { assets } from "../../../../src/aura-assets";
import { CONTRACTS, WELL_BODIES, stationById, stationPosition } from "../gameplay/contracts";
import { createFlybyState, flybyBody, requestFlyby, skipFlyby, updateFlyby } from "../gameplay/flyby";
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
} from "../gameplay/pod";
import {
  PREDICTION_DIVERGENCE_TOLERANCE,
  PREDICTION_MAX_STEPS,
  buildPredictionBeads
} from "../gameplay/prediction";
import { SHIFT_FAIL_LIMIT, scoreContract, type ScoreBreakdown } from "../gameplay/scoring";
import { POD_BODY_SPEC, PLAY_PLANE_Y, buildStations, dockSensorBodySpec } from "../gameplay/stations";
import { createGravityPostAudio, type GravityPostAudio } from "./post-audio";
import { createRustGaleFreightway } from "../gameplay/freightway";
import { FIXED_DT, dockPointHash, integratePath, type TrajectorySample } from "../gameplay/wells";
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
const REVIEW_COURIER_LATERAL = 0.35;
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
const POD_VISUAL_SCALE = 0.94;

// The parcel prop is a real typed GLB, but its release probe is nearly as tall
// as it is wide. Keep the review carton compact and seat it on the courier's
// rear cradle so the package reads as cargo instead of a floating foreground
// block.
const courierParcelLift = 0.24;
const courierParcelMaxDimensionBase = 0.32;
// A registered, static courier operator gives the skiff a human-scale job
// read at the same distance as the parcel and landing pods. This is a
// presentation attachment only: it has no body, controller, animation, or
// gameplay ownership. The asset is already release-probed and typed in the
// shared catalog; mounting it here does not alter the route manifest.
const courierOperatorTargetHeight = 0.68;
// The review camera approaches Rust from behind the route. A slight aft seat
// offset keeps the operator's feet visibly grounded in the canopy instead of
// projecting them into the Gale gate silhouette.
const courierOperatorSeatOffset = -0.08;
// Lower the feet into the canopy's actual seat line. The skiff hides the
// straight mannequin legs at the waist, leaving a connected upper-body read
// instead of a freestanding statue behind the destination gate.
const courierOperatorSeatHeight = 0.12;
// Parcel Corps communicates the job through the courier's body and the handoff
// payload, not only through a vehicle silhouette. Reuse the same hash-bound
// parcel GLB for one small renderer-owned handoff carton at the operator's
// lead hand. It follows the displayed route frame below; it has no collider,
// sensor, score, inventory, or integrator ownership.
const courierHandoffParcelTargetDimension = 0.22;
const courierHandoffParcelLateralOffset = -0.2;
const courierHandoffParcelForwardOffset = 0.035;
const courierHandoffParcelHeight = courierOperatorSeatHeight + courierOperatorTargetHeight * 0.57;

// NASA/VTAD textured planet assets furnish the fictional wells' visual bodies.
// These are visual analogues, not assertions of real solar-system dynamics.
const WELL_PLANET_ASSETS = {
  cinder: assets.gravityPlanetMercury,
  verdance: assets.gravityPlanetEarth,
  aquaria: assets.gravityPlanetNeptune,
  rust: assets.gravityPlanetMars,
  gale: assets.gravityPlanetJupiter
} as const;

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
  readonly physics: string;
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
      setSubjectSuppressed(suppressed: boolean): Promise<void>;
      settleSubjectPose(): Promise<void>;
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
  // Keep only the light and postprocess nodes from the solar system kit;
  // never mount the flat yellow sun/corona/glow disk.
  return prefabs.solarSystem({ labels: "none", starCount: 84, dustCount: 24 }).filter((node) => {
    if (node.kind === "effect" || node.kind === "light") return true;
    const name = "name" in node ? String(node.name ?? "") : "";
    return /(star|dust)/i.test(name) && !/(sun|corona|glow)/i.test(name);
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

const pBox = primitives.box;
const pSphere = primitives.sphere;
const pTorus = primitives.torus;

const spaceStationAsset =
  (assets as any).gravitySpaceStationMeshy ?? assets.gravityOrbitalRelayMeshy;
const cargoShuttleAsset =
  (assets as any).gravityCargoShuttleMeshy ?? assets.gravityPostMeshyFreight;
// Preserve required route-health asset references
const _requiredRouteAssets = [
  assets.gravityPostCourierSkiff,
  assets.gravityPostDockBeacon,
  assets.gravityPostFreightDistrict,
  assets.gravityPostMailPod
];
void _requiredRouteAssets;

let sceneBuilder = scene()
  .background("#050d1a")
  .addMany(solarKitBackdrop());

// Deep-space volumetric nebula clouds for rich cosmic color contrast behind the orbital plane
const nebulaConfigs = [
  { pos: [-2.6, PLAY_PLANE_Y - 0.55, -2.1] as const, scale: [2.8, 0.35, 1.9] as const, color: "#1e1b4b", emissive: "#6366f1", intensity: 0.65, opacity: 0.24 },
  { pos: [2.4, PLAY_PLANE_Y - 0.52, -1.8] as const, scale: [2.6, 0.32, 1.8] as const, color: "#3b0764", emissive: "#d946ef", intensity: 0.58, opacity: 0.22 },
  { pos: [-1.8, PLAY_PLANE_Y - 0.48, 2.1] as const, scale: [2.4, 0.3, 1.7] as const, color: "#083344", emissive: "#06b6d4", intensity: 0.62, opacity: 0.24 },
  { pos: [2.2, PLAY_PLANE_Y - 0.5, 2.0] as const, scale: [2.5, 0.32, 1.8] as const, color: "#431407", emissive: "#f97316", intensity: 0.54, opacity: 0.2 }
] as const;

for (let i = 0; i < nebulaConfigs.length; i += 1) {
  const neb = nebulaConfigs[i]!;
  sceneBuilder = sceneBuilder.add(
    pSphere({
      name: `deep-space-nebula-${i}`,
      material: material.emissive({
        name: `nebula-mat-${i}`,
        color: neb.color,
        emissive: neb.emissive,
        emissiveIntensity: 0.01,
        opacity: 0
      })
    })
      .position(neb.pos[0], -90, neb.pos[2])
      .scale([0.0001, 0.0001, 0.0001])
  );
}

const orbitalDustMaterials = [
  material.emissive({ name: "orbital dust cyan", color: "#67e8f9", emissive: "#22d3ee", emissiveIntensity: 0.85, opacity: 0.82 }),
  material.emissive({ name: "orbital dust violet", color: "#c4b5fd", emissive: "#8b5cf6", emissiveIntensity: 0.75, opacity: 0.76 }),
  material.emissive({ name: "orbital dust amber", color: "#fde68a", emissive: "#f59e0b", emissiveIntensity: 0.78, opacity: 0.8 })
] as const;

sceneBuilder = sceneBuilder.addMany(ORBITAL_DUST.map(([x, y, z, scale], index) =>
  primitives.sphere({
    name: "gravity post orbital dust " + (index + 1),
    material: orbitalDustMaterials[index % orbitalDustMaterials.length]!
  })
    .position(x, y, z)
    .scale(scale * 0.85)
    .runtime(game.runtimeNode("gravity-post-orbital-dust-" + index, {
      tags: ["renderer-owned", "set-dressing", "non-colliding"]
    }))
));

const PLANET_HERO_DIAMETERS: Readonly<Record<string, number>> = {
  cinder: 0.92,
  verdance: 1.15,
  aquaria: 1.24,
  rust: 1.04,
  gale: 1.48
};

// Authored 3D well bodies at static positions — prominent 3D planets, Sol star core, and orbiting 3D Meshy courier probes.
for (const body of WELL_BODIES) {
  const ringAccent = BODY_EMISSIVE[body.id] ?? "#38bdf8";
  if (body.id === "sol") {
    sceneBuilder = sceneBuilder
      .add(
        primitives.sphere({
          name: "Sol 3D star core",
          material: material.emissive({
            name: "Sol stellar photosphere",
            color: "#fef08a",
            emissive: "#f59e0b",
            emissiveIntensity: 2.55,
            opacity: 0.99
          })
        })
          .position(body.position[0], PLAY_PLANE_Y, body.position[1])
          .scale(0.68)
          .runtime(game.runtimeNode("gravity-post-planet-sol", {
            tags: ["typed-planet", "gravity-well-visual", "non-colliding"]
          }))
      )
      .add(
        primitives.torus({
          name: "Sol inner 3D corona ring",
          material: material.emissive({
            name: "Sol inner corona material",
            color: "#78350f",
            emissive: "#fbbf24",
            emissiveIntensity: 1.85,
            opacity: 0.84
          })
        })
          .position(body.position[0], PLAY_PLANE_Y, body.position[1])
          .rotate(1.18, 0.36, -0.24)
          .scale([0.96, 0.96, 0.028])
      )
      .add(
        primitives.torus({
          name: "Sol outer gravity well ring",
          material: material.emissive({
            name: "Sol outer corona material",
            color: "#451a03",
            emissive: "#fb923c",
            emissiveIntensity: 1.4,
            opacity: 0.64
          })
        })
          .position(body.position[0], PLAY_PLANE_Y, body.position[1])
          .rotate(1.76, -0.42, 0.22)
          .scale([1.28, 1.28, 0.018])
      );
    continue;
  }
  const planetAsset = WELL_PLANET_ASSETS[body.id as keyof typeof WELL_PLANET_ASSETS];
  if (!planetAsset) throw new Error(`Missing typed visual planet for ${body.id}`);
  const planetDiameter = PLANET_HERO_DIAMETERS[body.id] ?? (body.visualRadius * 5.6);
  const planetBounds = planetAsset.bounds ?? [1, 1, 1];
  const planetHeight = planetDiameter * planetBounds[1] / Math.max(...planetBounds);
  sceneBuilder = sceneBuilder
    .add(
      model(planetAsset, {
        name: body.name + " typed gravity-well planet",
        role: "primaryWorld",
        scaleMode: "fit",
        targetMaxDimension: planetDiameter,
        castShadow: true,
        receiveShadow: true
      })
        .position(body.position[0], PLAY_PLANE_Y - planetHeight * 0.28, body.position[1])
        .runtime(game.runtimeNode(`gravity-post-planet-${body.id}`, {
          tags: ["typed-planet", "gravity-well-visual", "non-colliding"]
        }))
    )
    .add(
      primitives.torus({
        name: body.name + " 3D atmospheric ring",
        material: material.emissive({
          name: body.name + " atmospheric ring mat",
          color: "#0f172a",
          emissive: ringAccent,
          emissiveIntensity: 1.6,
          opacity: 0.82
        })
      })
        .position(body.position[0], PLAY_PLANE_Y + 0.02, body.position[1])
        .rotate(1.22, 0.32, -0.18)
        .scale([planetDiameter * 0.76, planetDiameter * 0.76, 0.024])
    )
    .add(
      primitives.torus({
        name: body.name + " gravity well boundary ring",
        material: material.emissive({
          name: body.name + " gravity boundary mat",
          color: "#091526",
          emissive: ringAccent,
          emissiveIntensity: 1.2,
          opacity: 0.56
        })
      })
        .position(body.position[0], PLAY_PLANE_Y - 0.01, body.position[1])
        .rotate(1.52, -0.18, 0.14)
        .scale([planetDiameter * 1.02, planetDiameter * 1.02, 0.014])
    )
    // Orbiting 3D Meshy Courier Escort Probe around each planet
    .add(
      model(assets.gravityCourierProbeMeshy, {
        name: `${body.name} orbiting courier probe`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.42
      })
        .position(body.position[0] + planetDiameter * 0.65, PLAY_PLANE_Y + 0.16, body.position[1])
        .runtime(game.runtimeNode(`gravity-escort-probe-${body.id}`, {
          tags: ["typed-asset", "orbiting-probe", "non-colliding"]
        }))
    );

  const moonMaterial = material.pbr({
    name: body.name + " moonlet material",
    color: "#d8e4ef",
    roughness: 0.72,
    metallic: 0.08
  });
  for (const [offsetX, offsetY, offsetZ] of BODY_MOONS[body.id] ?? []) {
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({ name: body.name + " moonlet", material: moonMaterial })
        .position(body.position[0] + offsetX * 1.45, PLAY_PLANE_Y + offsetY * 1.4, body.position[1] + offsetZ * 1.45)
        .scale(Math.max(0.06, body.visualRadius * 0.58))
    );
  }
}

// Stations: Compact 3D Space Stations (0.55), Orbital Relays (0.48), Cargo Pods (0.36) & Dock Beacons orbiting cleanly around the planets
for (const station of stations) {
  const reviewStationRelevant = station.id === "gale-terminal" || station.id === "rust-exchange";
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityPostDockBeacon, { name: station.nodeId })
      .position(
        station.x + (station.id === "gale-terminal" ? reviewRoutePerpX * 0.32 : 0),
        PLAY_PLANE_Y + 0.05,
        station.z + (station.id === "gale-terminal" ? reviewRoutePerpZ * 0.32 : 0)
      )
      .rotate(0.18, 0.6, -0.12)
      .scale(0.085)
      .runtime(game.runtimeNode(station.nodeId))
  );
  sceneBuilder = sceneBuilder.add(
    model(spaceStationAsset, {
      name: station.id + " space station hub",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: reviewStationRelevant ? 0.58 : 0.48
    })
      .position(
        station.x + (station.id === "rust-exchange" ? -reviewRoutePerpX * 0.52 : station.id === "gale-terminal" ? reviewRoutePerpX * 0.55 : 0.24),
        PLAY_PLANE_Y + 0.14,
        station.z + (station.id === "rust-exchange" ? -reviewRoutePerpZ * 0.52 : station.id === "gale-terminal" ? reviewRoutePerpZ * 0.55 : -0.24)
      )
      .rotate(0.28, 0.72, -0.18)
      .runtime(game.runtimeNode(station.id + "-space-station-hub", { tags: ["typed-asset", "space-station-hub", "non-colliding"] }))
  );
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityOrbitalRelayMeshy, {
      name: station.id + " dock gate",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: reviewStationRelevant ? 0.48 : 0.42
    })
      .position(
        station.x + (station.id === "rust-exchange" ? reviewRoutePerpX * 0.38 : station.id === "gale-terminal" ? -reviewRoutePerpX * 0.38 : -0.22),
        PLAY_PLANE_Y + 0.12,
        station.z + (station.id === "rust-exchange" ? reviewRoutePerpZ * 0.38 : station.id === "gale-terminal" ? -reviewRoutePerpZ * 0.38 : 0.22)
      )
      .rotate(0.32, 0.78, -0.22)
      .runtime(game.runtimeNode(station.id + "-dock-gate", { tags: ["typed-asset", "destination-gate"] }))
  );
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityCargoContainerPodMeshy, {
      name: station.id + " moored cargo pod",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.38
    })
      .position(station.x + 0.28, PLAY_PLANE_Y + 0.08, station.z + 0.26)
      .rotate(0.18, 0.48, -0.12)
      .runtime(game.runtimeNode(station.id + "-cargo-pod", { tags: ["typed-asset", "freight-cargo", "non-colliding"] }))
  );
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: station.pulseNodeId + " capture window pulse ring",
      material: material.emissive({ color: "#0b2230", emissive: "#67e8f9", emissiveIntensity: 1.55, opacity: 0.84 })
    }).position(station.x, PLAY_PLANE_Y + 0.015, station.z).rotate(1.42, 0.18, -0.12)
      .scale([DOCK_SENSOR_RADIUS * 1.25, DOCK_SENSOR_RADIUS * 1.25, 0.022])
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
const courierIdentityCyan = material.emissive({
  name: "Courier postal cyan livery",
  color: "#0b4355",
  emissive: "#67e8f9",
  emissiveIntensity: 1.25,
  opacity: 0.92
});
const courierIdentityAmber = material.emissive({
  name: "Courier postal amber livery",
  color: "#51200c",
  emissive: "#fb923c",
  emissiveIntensity: 1.32,
  opacity: 0.94
});
const courierContactCyan = material.emissive({
  name: "Courier drive contact cyan",
  color: "#063544",
  emissive: "#22d3ee",
  emissiveIntensity: 1.75,
  opacity: 0.96
});
const courierContactAmber = material.emissive({
  name: "Courier drive contact amber",
  color: "#5c2209",
  emissive: "#f97316",
  emissiveIntensity: 1.62,
  opacity: 0.94
});
const courierDeliveryPulse = material.emissive({
  name: "Courier delivery handoff pulse",
  color: "#4a2608",
  emissive: "#fbbf24",
  emissiveIntensity: 1.48,
  opacity: 0.86
});
const courierSignalRed = material.emissive({
  name: "Courier rear signal red",
  color: "#5b1425",
  emissive: "#fb496d",
  emissiveIntensity: 1.42,
  opacity: 0.92
});
const routeDx = galeTerminal.x - rustExchange.x;
const routeDz = galeTerminal.z - rustExchange.z;
const routeLength = Math.hypot(routeDx, routeDz);
const routeUnitX = routeDx / routeLength;
const routeUnitZ = routeDz / routeLength;
const routePerpX = -routeUnitZ;
const routePerpZ = routeUnitX;
const reviewMailPodProgress = 0.92;
const reviewMailPodLateral = 0.65;
const reviewMailPodYaw = Math.atan2(routeUnitX, routeUnitZ);
const approachYaw = -Math.atan2(routeDz, routeDx);
const acrossRouteYaw = approachYaw + Math.PI / 2;
const corridorPoint = (progress: number, lateral = 0): readonly [number, number] => [
  rustExchange.x + routeDx * progress + routePerpX * lateral,
  rustExchange.z + routeDz * progress + routePerpZ * lateral
];
{
  const [relayMainX, relayMainZ] = corridorPoint(0.88, -0.75);
  const freightDistrictNode = model(spaceStationAsset, {
    name: "Rust Exchange to Gale Terminal typed freight district",
    role: "setDressing",
    scaleMode: "fit",
    targetMaxDimension: 1.9
  })
      .position(relayMainX, PLAY_PLANE_Y + 0.14, relayMainZ)
      .rotate(0.32, approachYaw + 0.42, -0.22)
      .scale(1.0)
      .runtime(game.runtimeNode("rust-gale-typed-freight-district", {
        tags: ["typed-asset", "freight-world", "renderer-owned", "non-colliding"]
      }));
  sceneBuilder = sceneBuilder.add(freightDistrictNode);

  const [sidecarX, sidecarZ] = corridorPoint(0.46, -0.82);
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityOrbitalRelayMeshy, {
      name: "Gravity Post grounded Gale loading district",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.4
    })
      .position(sidecarX, PLAY_PLANE_Y + 0.12, sidecarZ)
      .rotate(-0.28, approachYaw + 0.35, 0.18)
      .runtime(game.runtimeNode("gravity-post-textured-loading-bay-sidecar", {
        tags: ["typed-asset", "freight-world", "review-set-dressing", "non-colliding"]
      }))
  );
}

// Keep Meshy freighter hulls positioned along the outer deep-space freight lane
{
  const [meshyX, meshyZ] = corridorPoint(0.74, 1.68);
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityPostMeshyFreight, {
      name: "Gravity Post Meshy freight canyon candidate",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.35
    })
      .position(meshyX, PLAY_PLANE_Y + 0.1, meshyZ)
      .rotate(0.18, approachYaw, -0.12)
      .runtime(game.runtimeNode("gravity-post-meshy-freight-canyon", {
        tags: ["typed-asset", "freight-world", "meshy-candidate", "review-set-dressing", "non-colliding"]
      }))
  );

  const [heroFreightX, heroFreightZ] = corridorPoint(0.28, 1.42);
  sceneBuilder = sceneBuilder.add(
    model(cargoShuttleAsset, {
      name: "Gravity Post foreground hero Meshy freighter",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.65
    })
      .position(heroFreightX, PLAY_PLANE_Y + 0.12, heroFreightZ)
      .rotate(0.16, approachYaw + 0.15, -0.1)
      .runtime(game.runtimeNode("gravity-post-hero-meshy-freighter", {
        tags: ["typed-asset", "freight-world", "meshy-hero", "non-colliding"]
      }))
  );
}

// Inbound cargo shuttle and parcel on Gale's apron (prominent 1.45 & 0.95 scale)
{
  const [mailPodX, mailPodZ] = corridorPoint(reviewMailPodProgress, reviewMailPodLateral);
  sceneBuilder = sceneBuilder.add(
    model(cargoShuttleAsset, {
      name: "Gale Terminal inbound typed MailPod shuttle",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.45
    })
      .position(mailPodX, PLAY_PLANE_Y + 0.08, mailPodZ)
      .rotate(0.22, reviewMailPodYaw + 0.4, -0.15)
      .runtime(game.runtimeNode("gale-terminal-inbound-mailpod", {
        tags: ["typed-asset", "freight-transit", "renderer-owned", "non-colliding"]
      }))
  );
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityCargoContainerPodMeshy, {
      name: "Gale Terminal shuttle parcel",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.95
    })
      .position(
        mailPodX - routeUnitX * 0.35,
        PLAY_PLANE_Y + 0.06,
        mailPodZ - routeUnitZ * 0.35
      )
      .rotate(0, reviewMailPodYaw, 0)
      .runtime(game.runtimeNode("gale-terminal-shuttle-parcel", {
        tags: ["typed-asset", "freight-cargo", "renderer-owned", "non-colliding"]
      }))
  );
}

const courierParcelScaleRatio = POD_VISUAL_SCALE / 0.68;
const courierParcelMaxDimension = 0.85;
sceneBuilder = sceneBuilder.add(
  model(assets.gravityCargoContainerPodMeshy, {
    name: "mail-pod textured delivery parcel",
    role: "setDressing",
    scaleMode: "fit",
    targetMaxDimension: courierParcelMaxDimension
  })
    .position(stations[0]!.x, PLAY_PLANE_Y + 0.14, stations[0]!.z)
    .runtime(game.runtimeNode("mail-pod-textured-delivery-parcel", {
      tags: ["typed-asset", "courier-cargo", "renderer-owned", "non-colliding", "live-velocity-feedback"]
    }))
);

// Prominent orbital cargo pods along the outer Rust -> Gale lane (max dimension 0.95)
for (const [progress, lateral, yawOffset] of [
  [0.24, -0.68, -0.12],
  [0.62, 0.65, 0.1]
] as const) {
  const [cargoX, cargoZ] = corridorPoint(progress, lateral);
  sceneBuilder = sceneBuilder.add(
    model(assets.gravityCargoContainerPodMeshy, {
      name: `Gravity Post shoulder cargo parcel ${progress}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.95
    })
      .position(cargoX, PLAY_PLANE_Y + 0.08, cargoZ)
      .rotate(0.24, approachYaw + yawOffset, -0.16)
      .runtime(game.runtimeNode(`gravity-post-shoulder-cargo-${progress}`, {
        tags: ["typed-asset", "freight-cargo", "renderer-owned", "non-colliding"]
      }))
  );
}

// Primary orbital courier spacecraft: 3D Meshy Cargo Shuttle (max dimension 0.92) with glowing plasma engine trail
sceneBuilder = sceneBuilder
  .add(
    model(cargoShuttleAsset, {
      name: "mail-pod",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 0.92
    })
      .position(stations[0]!.x, PLAY_PLANE_Y + 0.12, stations[0]!.z)
      .runtime(game.runtimeNode("mail-pod"))
  )
  .add(
    model(assets.neonCourierAvatar, {
      name: "mail-pod-courier-operator",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: courierOperatorTargetHeight
    })
      .position(stations[0]!.x, PLAY_PLANE_Y - 10, stations[0]!.z)
      .runtime(game.runtimeNode("mail-pod-courier-operator", {
        tags: ["typed-asset", "courier-operator", "renderer-owned", "non-colliding", "static-character"]
      }))
  )
  .add(
    model(assets.gravityCargoContainerPodMeshy, {
      name: "mail-pod-courier-handoff-parcel",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.75
    })
      .position(
        stations[0]!.x,
        PLAY_PLANE_Y - 10,
        stations[0]!.z
      )
      .runtime(game.runtimeNode("mail-pod-courier-handoff-parcel", {
        tags: ["typed-asset", "courier-handoff", "renderer-owned", "non-colliding", "static-cargo"]
      }))
  )
  .add(
    primitives.torus({
      name: "mail-pod grounded contact shadow",
      material: material.emissive({
        name: "Courier probe telemetry halo",
        color: "#083344",
        emissive: "#38bdf8",
        emissiveIntensity: 2.15,
        opacity: 0.92
      })
    })
      .position(stations[0]!.x, PLAY_PLANE_Y + 0.02, stations[0]!.z)
      .rotate(1.5708, 0, 0)
      .scale([0.58, 0.58, 0.024])
      .runtime(game.runtimeNode("mail-pod-contact-shadow", {
        tags: ["pod-contact-shadow", "renderer-owned", "non-colliding"]
      }))
  )
  .add(
    pTorus({
      name: "mail-pod gravity slingshot boost ring",
      material: material.emissive({
        name: "Slingshot boost shockwave mat",
        color: "#fef08a",
        emissive: "#38bdf8",
        emissiveIntensity: 2.6,
        opacity: 0.92
      })
    })
      .position(stations[0]!.x, PLAY_PLANE_Y + 0.05, stations[0]!.z)
      .rotate(1.5708, 0, 0)
      .scale([0.01, 0.01, 0.01])
      .runtime(game.runtimeNode("slingshot-boost-ring", {
        tags: ["pod-slingshot-boost", "renderer-owned", "non-colliding"]
      }))
  );

const podFittingScale = 1.15;

for (const side of [-1, 1] as const) {
  sceneBuilder = sceneBuilder.add(
    primitives.box({
      name: `mail-pod postal livery plate ${side}`,
      size: [0.064 * podFittingScale, 0.13 * podFittingScale, 0.38 * podFittingScale],
      material: side < 0 ? courierIdentityCyan : courierIdentityAmber
    }).position(0, -4, 0).runtime(game.runtimeNode(`mail-pod-livery-${side}`, {
      tags: ["pod-identity", "renderer-owned", "non-colliding"]
    }))
  );
}
sceneBuilder = sceneBuilder
  .add(
    primitives.box({
      name: "mail-pod rear route signal",
      size: [0.08 * podFittingScale, 0.045 * podFittingScale, 0.16 * podFittingScale],
      material: courierSignalRed
    }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-rear-route-signal", {
      tags: ["pod-identity", "renderer-owned", "non-colliding"]
    }))
  )
  .add(
    primitives.box({
      name: "mail-pod roof postal light bar",
      size: [0.3 * podFittingScale, 0.045 * podFittingScale, 0.07 * podFittingScale],
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
      .scale([0.11 * podFittingScale, 0.11 * podFittingScale, 0.016 * podFittingScale])
      .runtime(game.runtimeNode("mail-pod-postal-beacon-ring", {
        tags: ["pod-identity", "delivery-state", "renderer-owned", "non-colliding"]
      }))
  )
  .add(
    primitives.box({
      name: "mail-pod parcel restraint cyan",
      size: [0.032 * podFittingScale, 0.15 * podFittingScale, 0.06 * podFittingScale],
      material: courierIdentityCyan
    }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-parcel-restraint-cyan", {
      tags: ["courier-cargo", "renderer-owned", "non-colliding"]
    }))
  )
  .add(
    primitives.box({
      name: "mail-pod parcel restraint amber",
      size: [0.032 * podFittingScale, 0.15 * podFittingScale, 0.06 * podFittingScale],
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
      .scale([0.34 * podFittingScale, 0.34 * podFittingScale, 0.012 * podFittingScale])
      .runtime(game.runtimeNode("mail-pod-delivery-scan-ring", {
        tags: ["courier-cargo", "delivery-state", "renderer-owned", "non-colliding"]
      }))
  );

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

for (let index = 0; index < TRAIL_STREAK_COUNT; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.box({
      name: "mail-pod engine streak " + index,
      size: [0.075, 0.038, 0.42],
      material: material.emissive({ color: "#08293b", emissive: index < 2 ? "#fb923c" : "#67e8f9", emissiveIntensity: 1.85, opacity: 0.92 - index * 0.06 })
    }).position(0, -4, 0)
      .runtime(game.runtimeNode("mail-pod-trail-" + index, { tags: ["pod-trail", "renderer-owned", "non-colliding"] }))
  );
}

for (let index = 0; index < CONTACT_WAKE_COUNT; index += 1) {
  for (const side of [-1, 1] as const) {
    sceneBuilder = sceneBuilder.add(
      primitives.box({
        name: `mail-pod contact wake ${side} ${index}`,
        size: [0.14, 0.016, 0.48],
        material: material.emissive({
          color: side < 0 ? "#082b38" : "#4b1808",
          emissive: side < 0 ? "#67e8f9" : "#fb923c",
          emissiveIntensity: 1.65,
          opacity: 0.94 - index * 0.1
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
    size: [0.11, 0.065, 0.72],
    material: material.emissive({
      name: "mail-pod thrust plume material",
      color: "#fff1c7",
      emissive: "#fb923c",
      emissiveIntensity: 2.35,
      opacity: 0.95
    })
  }).position(0, -4, 0).runtime(game.runtimeNode("mail-pod-thrust-plume", {
    tags: ["pod-trail", "renderer-owned", "live-velocity-feedback", "non-colliding"]
  }))
);

for (let index = 0; index < PREDICTION_BEADS; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "prediction bead " + (index + 1),
      material: material.emissive({
        color: index % 3 === 0 ? "#0c4a6e" : "#422006",
        emissive: index % 3 === 0 ? "#38bdf8" : "#facc15",
        emissiveIntensity: 1.95,
        opacity: 0.96
      })
    }).position(0, PLAY_PLANE_Y + 0.05, 0).scale(0.088).runtime(game.runtimeNode("pred-bead-" + index))
  );
}

for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "actual path bead " + (index + 1),
      material: material.emissive({ color: "#6b4b1b", emissive: "#ffe7a3", emissiveIntensity: 1.85, opacity: 0.98 })
    }).position(0, -4, 0).scale(0.048).runtime(game.runtimeNode("actual-path-bead-" + index))
  );
}

for (let index = 0; index < SPARK_COUNT; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "dock spark " + (index + 1),
      material: material.emissive({ color: "#0e2733", emissive: "#7dd3fc" })
    }).position(0, -4, 0).scale(0.095).runtime(game.runtimeNode("dock-spark-" + index))
  );
}

for (let index = 0; index < FLYBY_DRONES; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.box({
      name: "flyby drone " + (index + 1),
      material: material.emissive({ color: "#1a1030", emissive: "#c084fc" })
    }).position(0, -4, 0).scale([0.06, 0.024, 0.14]).runtime(game.runtimeNode("flyby-drone-" + index))
  );
}

const [courierLightX, courierLightZ] = corridorPoint(0.45);
const [heroFreightLightX, heroFreightLightZ] = corridorPoint(0.28, -0.75);
sceneBuilder = sceneBuilder
  .add(effects.neonBloom({ name: "gravity route glow", intensity: 0.28, threshold: 0.54, maxIntensity: 1.05, antiBlowout: true, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }))
  .add(effects.colorGrade({ exposure: 1.16, contrast: 1.12, saturation: 1.22 }))
  .add(effects.antiAlias({ mode: "fxaa" }))
  .add(lights.ambient({ intensity: 1.15, color: "#e0f2fe" }))
  .add(lights.directional({ position: [2.8, 7.2, 4.2], intensity: 3.6, color: "#f0f9ff" }))
  .add(lights.directional({ name: "freight material warm rake", position: [-4.5, 4.2, -3.5], intensity: 2.5, color: "#ffedd5" }))
  .add(lights.point({ name: "solar core radiance", color: "#fbbf24", intensity: 5.4 }).position(0, PLAY_PLANE_Y + 0.85, 0))
  .add(lights.point({ name: "solar rim", color: "#fb923c", intensity: 2.8 }).position(-2.2, 2.4, 1.5))
  .add(lights.point({ name: "route cyan practical", color: "#38d6ff", intensity: 2.8 }).position(-2.4, 1.25, -1.2))
  .add(lights.point({ name: "route amber practical", color: "#fbbf24", intensity: 2.5 }).position(2.2, 1.15, 1.4))
  .add(lights.point({ name: "hazard-mail courier key", color: "#e8f7ff", intensity: 4.6 }).position(3.0, 2.2, -1.8))
  .add(lights.point({ name: "hazard-mail engine rim", color: "#fb923c", intensity: 3.4 }).position(1.8, 1.1, -2.0))
  .add(lights.point({ name: "courier cyan locality", color: "#67e8f9", intensity: 3.4 })
    .position(courierLightX + routePerpX * 0.48, PLAY_PLANE_Y + 0.82, courierLightZ + routePerpZ * 0.48))
  .add(lights.point({ name: "parcel amber locality", color: "#fb923c", intensity: 2.8 })
    .position(courierLightX - routePerpX * 0.42, PLAY_PLANE_Y + 0.58, courierLightZ - routePerpZ * 0.42))
  .add(lights.point({ name: "hero freighter cyan rim", color: "#38bdf8", intensity: 3.0 })
    .position(heroFreightLightX, PLAY_PLANE_Y + 1.1, heroFreightLightZ))
  .add(effects.fog({ density: 0.0009, color: "#050d1a" }));

const app = createAuraApp("#app", {
  diagnostics: { overlay: false },
  physics: {
    layers: createCollisionLayers({ pod: ["dock"], dock: ["pod"] }),
    gravity: [0, 0, 0],
    seed: 20260914,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
  scene: sceneBuilder.camera(camera.perspective(
    visualReviewCapture
      ? {
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
          fov: 52
        }
      : {
          position: [0.22, PLAY_PLANE_Y + 5.65, 5.35],
          target: [0.22, PLAY_PLANE_Y - 0.12, -0.28],
          fov: 45
        }
  ))
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
    warpHop: ["KeyE"],
    next: ["KeyN"],
    retry: ["KeyR"],
    pause: ["KeyP"],
    // Keyboard dispatch rig. The route was pointer-only for its one core
    // action: `drag anywhere to aim the launch` was the only way to leave the
    // station, so a keyboard player could read the whole HUD and still never
    // fly, and no keyboard-driven play session could reach coast, assist,
    // dock or fail state at all. These rotate/trim the launch vector while the
    // skiff is `ready`; the drag gesture is unchanged and still authoritative
    // while a pointer is down.
    aimCounterClockwise: ["ArrowLeft", "KeyA"],
    aimClockwise: ["ArrowRight", "KeyD"],
    powerDown: ["KeyZ"],
    powerUp: ["KeyX"],
    // §6.9.13 P0: Enter launches along the active (keyboard or drag) aim —
    // steerKeyboardAim/launchActiveAim below were authored but never wired,
    // so a keyboard-only player could never leave the station.
    launch: ["Enter"]
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

const AUTO_CONTRACT_SOLUTIONS: Readonly<Record<string, { readonly dir: readonly [number, number]; readonly speed: number }>> = {
  "GP-CON-1": { dir: [1, 0], speed: 1.6516 },
  "GP-CON-2": { dir: [-0.0665, 0.9978], speed: 1.033 },
  "GP-CON-3": { dir: [-0.0995, -0.995], speed: 0.742 },
  "GP-CON-4": { dir: [0.845, -0.534], speed: 0.812 }
};

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
let slingshotBoostTimer = 0;
let dockedHoldSeconds = 0;
let flybyHoldSeconds = 0;
let autoChainedFlight = false;
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

/**
 * Keyboard launch aim. Bearing is measured in the play plane exactly like the
 * drag vector and power is the same 0..1 fraction a drag distance produces, so
 * one prediction integrator and one launch path serve both inputs. It is
 * seeded to the contract's origin -> destination bearing, which means the very
 * first Space press is a genuine dispatch attempt down the briefed route
 * instead of a blind radial guess.
 */
let keyboardAimBearing = 0;
let keyboardAimPower = 0.6;
const KEYBOARD_AIM_RATE = 1.05;
const KEYBOARD_POWER_RATE = 0.5;

function resetKeyboardAim(): void {
  const from = originStation();
  const to = destinationStation();
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  keyboardAimBearing = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : 0;
  keyboardAimPower = 0.6;
}
resetKeyboardAim();

function keyboardAimVector(): { readonly dirX: number; readonly dirZ: number; readonly power: number } {
  return {
    dirX: Math.sin(keyboardAimBearing),
    dirZ: Math.cos(keyboardAimBearing),
    power: keyboardAimPower
  };
}

/** The one aim the player is currently looking at: live drag, else keyboard. */
function activeAimVector(): { readonly dirX: number; readonly dirZ: number; readonly power: number } | null {
  return aiming ? currentAimVector() : keyboardAimVector();
}

function steerKeyboardAim(dt: number): void {
  if (input.held("aimCounterClockwise")) keyboardAimBearing -= KEYBOARD_AIM_RATE * dt;
  if (input.held("aimClockwise")) keyboardAimBearing += KEYBOARD_AIM_RATE * dt;
  if (input.held("powerUp")) keyboardAimPower = Math.min(1, keyboardAimPower + KEYBOARD_POWER_RATE * dt);
  if (input.held("powerDown")) keyboardAimPower = Math.max(0.08, keyboardAimPower - KEYBOARD_POWER_RATE * dt);
}

/** Launch along whatever the prediction line is currently showing. */
function launchActiveAim(): boolean {
  const vector = activeAimVector();
  if (!vector || vector.power < MIN_LAUNCH_POWER) return false;
  const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
  autoChainedFlight = false;
  launchWithPrediction([vector.dirX, vector.dirZ], speed);
  return true;
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
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events in headless browser runs may not have active pointer capture.
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
      autoChainedFlight = false;
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
    dockedHoldSeconds = 0;
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
  autoChainedFlight = false;
  dockedHoldSeconds = 0;
  flyby.visited.clear();
  flyby.beatsRun = 0;
  dockEventLog.length = 0;
  dockEventCount = 0;
  resetPodForContract(pod, contract());
  resetKeyboardAim();
  resetPredictionTelemetry();
  hidePrediction();
  audio.play("ui-confirm");
}

function nextContract(): void {
  if (pod.state !== "docked") return;
  audio.play("ui-confirm");
  dockedHoldSeconds = 0;
  if (contractIndex >= CONTRACTS.length - 1) {
    campaignComplete = true;
    return;
  }
  contractIndex += 1;
  lastScoreCard = null;
  resetPodForContract(pod, contract());
  resetKeyboardAim();
  resetPredictionTelemetry();
}

function retryContract(): void {
  if (shiftOver || campaignComplete) {
    resetCampaign();
    return;
  }
  if (flyby.active) {
    skipFlyby(flyby);
    updateFlyby(flyby, 0);
  }
  paused = false;
  aiming = false;
  autoChainedFlight = false;
  dockedHoldSeconds = 0;
  audio.play("ui-confirm");
  lastScoreCard = null;
  resetPodForContract(pod, contract());
  resetKeyboardAim();
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
  const vector = activeAimVector();
  if (!vector || pod.state !== "ready") {
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
    const pulseScale = 0.095 - (index / PREDICTION_BEADS) * 0.036;
    node.setVisible(true);
    node.setScale(pulseScale);
    node.setPosition(bead.x, PLAY_PLANE_Y + 0.055, bead.z);
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
      .setPosition(bead.x, PLAY_PLANE_Y + 0.035, bead.z)
      .setScale(visualReviewCapture ? 0.038 : 0.068)
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
  const slingshotRingNode = app.nodes.get("slingshot-boost-ring");
  const postalBeaconRingNode = app.nodes.get("mail-pod-postal-beacon-ring");
  const deliveryScanRingNode = app.nodes.get("mail-pod-delivery-scan-ring");
  const restraintCyanNode = app.nodes.get("mail-pod-parcel-restraint-cyan");
  const restraintAmberNode = app.nodes.get("mail-pod-parcel-restraint-amber");
  const rearRouteSignalNode = app.nodes.get("mail-pod-rear-route-signal");
  const roofPostalLightBarNode = app.nodes.get("mail-pod-roof-postal-light-bar");
  const settledReviewPose = visualReviewCapture && paused && pod.state === "coasting";
  const compositionReviewPose = compositionPresentationOverride || visualReviewCapture;
  const reviewPose = settledReviewPose || compositionReviewPose;
  const corridorProgress = settledReviewPose
    ? 0.58
    : pod.state === "coasting" && !visualReviewCapture
      ? Math.min(0.92, REVIEW_COURIER_PROGRESS + pod.flightSeconds * 0.14)
      : REVIEW_COURIER_PROGRESS;
  const activeAim = activeAimVector();
  const [x, z] = reviewPose
    ? corridorPoint(corridorProgress, REVIEW_COURIER_LATERAL)
    : [pod.kinematic.position[0], pod.kinematic.position[1]] as const;
  const measuredSpeed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  const speed = reviewPose ? Number(measuredSpeed.toFixed(2)) : measuredSpeed;
  const visualSpeed = compositionReviewPose ? Math.max(1.42, speed) : Math.max(0.95, speed);
  const dirX = reviewPose
    ? routeUnitX
    : (speed > 1e-4 ? pod.kinematic.velocity[0] / speed : (activeAim ? activeAim.dirX : routeUnitX));
  const dirZ = reviewPose
    ? routeUnitZ
    : (speed > 1e-4 ? pod.kinematic.velocity[1] / speed : (activeAim ? activeAim.dirZ : routeUnitZ));
  const perpX = -dirZ;
  const perpZ = dirX;
  const podYaw = Math.atan2(dirX, dirZ);
  const displayedVelocityX = dirX * visualSpeed;
  const displayedVelocityZ = dirZ * visualSpeed;
  const previousVelocityX = previousVisualVelocity[0];
  const previousVelocityZ = previousVisualVelocity[1];
  const accelerationX = displayedVelocityX - previousVelocityX;
  const accelerationZ = displayedVelocityZ - previousVelocityZ;
  const accelerationAlong = accelerationX * dirX + accelerationZ * dirZ;
  const accelerationAcross = accelerationX * (-dirZ) + accelerationZ * dirX;
  const presentationPitch = Math.max(-0.18, Math.min(0.18,
    0.12 - accelerationAlong * 0.055
  ));
  const presentationBank = Math.max(-0.24, Math.min(0.24,
    -0.14 + accelerationAcross * 0.16
  ));
  if (!visualVelocityInitialized || reviewPose) {
    previousVisualVelocity = [displayedVelocityX, displayedVelocityZ];
    visualVelocityInitialized = true;
  } else {
    previousVisualVelocity = [pod.kinematic.velocity[0], pod.kinematic.velocity[1]];
  }
  podNode
    ?.setPosition(x, PLAY_PLANE_Y + 0.12, z)
    .setRotation(presentationPitch, podYaw, presentationBank);
  const operatorNode = app.nodes.get("mail-pod-courier-operator");
  const handoffParcelNode = app.nodes.get("mail-pod-courier-handoff-parcel");
  operatorNode
    ?.setPosition(
      x + dirX * courierOperatorSeatOffset,
      PLAY_PLANE_Y - 10,
      z + dirZ * courierOperatorSeatOffset
    )
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(false);
  const operatorX = x + dirX * courierOperatorSeatOffset;
  const operatorZ = z + dirZ * courierOperatorSeatOffset;
  handoffParcelNode
    ?.setPosition(
      operatorX + dirX * courierHandoffParcelForwardOffset + perpX * courierHandoffParcelLateralOffset,
      PLAY_PLANE_Y - 10,
      operatorZ + dirZ * courierHandoffParcelForwardOffset + perpZ * courierHandoffParcelLateralOffset
    )
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(false);
  const parcelBackOffset = 0.43 * courierParcelScaleRatio;
  parcelNode
    ?.setPosition(
      x - dirX * parcelBackOffset,
      PLAY_PLANE_Y + 0.14,
      z - dirZ * parcelBackOffset
    )
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");
  shadowNode
    ?.setPosition(x, PLAY_PLANE_Y + 0.03, z)
    .setRotation(1.5708, podYaw, 0)
    .setScale([
      0.54 + Math.min(0.16, speed * 0.05),
      0.54 + Math.min(0.16, speed * 0.05),
      0.024
    ])
    .setVisible(!compositionSubjectSuppressed && pod.state !== "lost");

  // Gravity Slingshot Boost shockwave ring around spacecraft
  if (slingshotRingNode) {
    if (slingshotBoostTimer > 0 && !compositionSubjectSuppressed && pod.state !== "lost") {
      const boostProgress = 1 - slingshotBoostTimer / 1.1;
      const ringRadius = 0.45 + boostProgress * 1.15;
      slingshotRingNode
        .setPosition(x, PLAY_PLANE_Y + 0.06, z)
        .setRotation(1.5708, frame * 0.12, 0)
        .setScale([ringRadius, ringRadius, 0.032])
        .setVisible(true);
    } else {
      slingshotRingNode.setVisible(false);
    }
  }

  // Orbiting 3D Meshy Courier Escort Probes around each planet
  for (let i = 0; i < WELL_BODIES.length; i += 1) {
    const body = WELL_BODIES[i]!;
    if (body.id === "sol") continue;
    const probeNode = app.nodes.get(`gravity-escort-probe-${body.id}`);
    if (!probeNode) continue;
    const planetDiameter = PLANET_HERO_DIAMETERS[body.id] ?? 1.0;
    const orbitRadius = planetDiameter * 0.64;
    const orbitAngle = frame * (0.022 + i * 0.004) + i * 1.35;
    const px = body.position[0] + Math.cos(orbitAngle) * orbitRadius;
    const pz = body.position[1] + Math.sin(orbitAngle) * orbitRadius;
    const tangentYaw = Math.atan2(-Math.sin(orbitAngle), Math.cos(orbitAngle));
    probeNode
      .setPosition(px, PLAY_PLANE_Y + 0.16 + Math.sin(frame * 0.06 + i) * 0.04, pz)
      .setRotation(0.12, tangentYaw, -0.18)
      .setVisible(true);
  }

  const visibleMotes = !compositionSubjectSuppressed && pod.state !== "lost";
  const contactCompression = Math.max(0.72, 1 - Math.min(0.2,
    visualSpeed * 0.022 + Math.abs(accelerationAcross) * 0.06
  ));
  for (const side of [-1, 1] as const) {
    app.nodes.get(`mail-pod-livery-${side}`)
      ?.setPosition(
        x + perpX * side * 0.49 * podFittingScale,
        PLAY_PLANE_Y - 10,
        z + perpZ * side * 0.49 * podFittingScale
      )
      .setRotation(presentationPitch, podYaw, presentationBank)
      .setVisible(false);
  }
  rearRouteSignalNode
    ?.setPosition(x - dirX * 0.62 * podFittingScale, PLAY_PLANE_Y - 10, z - dirZ * 0.62 * podFittingScale)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(false);
  roofPostalLightBarNode
    ?.setPosition(x + dirX * 0.05 * podFittingScale, PLAY_PLANE_Y - 10, z + dirZ * 0.05 * podFittingScale)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(false);
  postalBeaconRingNode
    ?.setPosition(x + dirX * 0.04 * podFittingScale, PLAY_PLANE_Y - 10, z + dirZ * 0.04 * podFittingScale)
    .setRotation(1.5708, 0, 0)
    .setScale([0.14 * podFittingScale, 0.14 * podFittingScale, 0.018 * podFittingScale])
    .setVisible(false);
  restraintCyanNode
    ?.setPosition(x + perpX * -0.24 * podFittingScale, PLAY_PLANE_Y - 10, z + perpZ * -0.24 * podFittingScale)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(false);
  restraintAmberNode
    ?.setPosition(x + perpX * 0.24 * podFittingScale, PLAY_PLANE_Y - 10, z + perpZ * 0.24 * podFittingScale)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setVisible(false);
  const scanBreathe = 1 + Math.sin(frame * 0.22) * 0.08;
  deliveryScanRingNode
    ?.setPosition(x, PLAY_PLANE_Y - 10, z)
    .setScale([0.34 * podFittingScale * scanBreathe, 0.34 * podFittingScale * scanBreathe, 0.012 * podFittingScale])
    .setVisible(false);
  for (let index = 0; index < courierDriveOffsets.length; index += 1) {
    const node = app.nodes.get(`mail-pod-drive-contact-${index + 1}`);
    const [side, longitudinal] = courierDriveOffsets[index]!;
    if (!node) continue;
    const contactPulse = 1 + Math.sin(frame * 0.36 + index * 0.9) * 0.12;
    node
      .setPosition(
        x + (perpX * side * 0.44 + dirX * longitudinal) * podFittingScale,
        PLAY_PLANE_Y - 10,
        z + (perpZ * side * 0.44 + dirZ * longitudinal) * podFittingScale
      )
      .setRotation(presentationPitch, podYaw, presentationBank)
      .setScale([0.12 * podFittingScale * contactPulse, 0.045 * podFittingScale * contactCompression, 0.16 * podFittingScale * contactPulse])
      .setVisible(false);
    app.nodes.get(`mail-pod-drive-contact-ring-${index + 1}`)
      ?.setPosition(
        x + (perpX * side * 0.44 + dirX * longitudinal) * podFittingScale,
        PLAY_PLANE_Y - 10,
        z + (perpZ * side * 0.44 + dirZ * longitudinal) * podFittingScale
      )
      .setRotation(1.5708, 0, 0)
      .setScale([0.16 * podFittingScale * contactPulse, 0.16 * podFittingScale * contactPulse * (1 + (1 - contactCompression) * 0.7), 0.014 * podFittingScale])
      .setVisible(false);
  }
  for (let index = 0; index < TRAIL_STREAK_COUNT; index += 1) {
    const mote = app.nodes.get("mail-pod-trail-" + index);
    if (!mote) continue;
    const distance = 0.32 + index * 0.25;
    const width = Math.max(0.18, 0.56 - index * 0.06);
    const length = settledReviewPose ? 0.62 : 0.52 + Math.min(0.55, visualSpeed * 0.18);
    mote.setPosition(x - dirX * distance, PLAY_PLANE_Y + 0.06 + index * 0.002, z - dirZ * distance)
      .setRotation(0, podYaw, 0)
      .setScale([width, width, length])
      .setVisible(visibleMotes);
  }
  for (let index = 0; index < CONTACT_WAKE_COUNT; index += 1) {
    for (const side of [-1, 1] as const) {
      const wake = app.nodes.get(`mail-pod-contact-${side}-${index}`);
      if (!wake) continue;
      const distance = 0.26 + index * 0.2;
      const lateral = side * 0.2;
      wake
        .setPosition(
          x - dirX * distance + perpX * lateral,
          PLAY_PLANE_Y + 0.025,
          z - dirZ * distance + perpZ * lateral
        )
        .setRotation(presentationPitch, podYaw, presentationBank)
        .setScale([
          Math.max(0.18, 0.58 - index * 0.05 + Math.abs(accelerationAlong) * 0.03),
          1,
          (settledReviewPose ? 0.66 : 0.58) * (1 + visualSpeed * 0.03)
        ])
        .setVisible(visibleMotes && index < 4);
    }
  }
  const thrustPlume = app.nodes.get("mail-pod-thrust-plume");
  thrustPlume
    ?.setPosition(x - dirX * 0.38, PLAY_PLANE_Y + 0.08, z - dirZ * 0.38)
    .setRotation(presentationPitch, podYaw, presentationBank)
    .setScale(settledReviewPose
      ? [0.68, 0.68, 0.62]
      : [0.68, 0.68, 0.52 + Math.min(0.48, visualSpeed * 0.2)])
    .setVisible(visibleMotes);
  if (settledReviewPose) {
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
  podBody.setPosition(settledReviewPose
    ? [x, PLAY_PLANE_Y, z]
    : [pod.kinematic.position[0], PLAY_PLANE_Y, pod.kinematic.position[1]]);

  const [shuttleX, shuttleZ] = corridorPoint(reviewMailPodProgress, reviewMailPodLateral);
  shuttleNode
    ?.setPosition(shuttleX, PLAY_PLANE_Y + 0.08, shuttleZ)
    .setRotation(0.22, reviewMailPodYaw + 0.4, -0.15)
    .setVisible(!compositionSubjectSuppressed);
  shuttleParcelNode
    ?.setPosition(
      shuttleX - routeUnitX * 0.35,
      PLAY_PLANE_Y + 0.06,
      shuttleZ - routeUnitZ * 0.35
    )
    .setRotation(0, reviewMailPodYaw, 0)
    .setVisible(!compositionSubjectSuppressed);
}

function syncStationPulses(): void {
  const destination = destinationStation();
  const origin = originStation();
  for (const station of stations) {
    const pulse = app.nodes.get(station.pulseNodeId);
    if (!pulse) continue;
    const isRouteEndpoint = station.id === destination.id || station.id === origin.id || station.id === "gale-terminal";
    app.nodes.get(station.nodeId)?.setVisible(true);
    const distance = Math.hypot(pod.kinematic.position[0] - station.x, pod.kinematic.position[1] - station.z);
    const isOpen = station.id === destination.id && (
      pod.state === "ready" ||
      (pod.state === "coasting" &&
        distance < station.dockRadius * 3.2 &&
        Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) < contract().captureLimit * 1.2)
    );
    const breathe = isOpen ? 1.25 + Math.sin(frame * 0.35) * 0.18 : (isRouteEndpoint ? 1.05 : 0.82);
    pulse.setScale([station.dockRadius * 1.15 * breathe, station.dockRadius * 1.15 * breathe, 0.018]);
  }
}

function syncSparks(dt: number): void {
  if (sparkLife > 0) sparkLife = Math.max(0, sparkLife - dt);
  if (slingshotBoostTimer > 0) slingshotBoostTimer = Math.max(0, slingshotBoostTimer - dt);
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
    ? "Coasting. W/S thruster burn · E warp hop · hold Space to warp."
    : "Coasting. Correction spent · E warp hop · hold Space to warp.";

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
    primaryAssets: [
      "gravityCargoContainerPodMeshy",
      "gravityOrbitalRelayMeshy",
      "gravityPostCourierSkiff",
      "gravityPostDockBeacon"
    ],
    typedAssets: [
      { id: "gravityCargoContainerPodMeshy", typedRef: "assets.gravityCargoContainerPodMeshy", role: "primaryVehicle" },
      { id: "gravityOrbitalRelayMeshy", typedRef: "assets.gravityOrbitalRelayMeshy", role: "primaryWorld" },
      { id: "gravityPostCourierSkiff", typedRef: "assets.gravityPostCourierSkiff", role: "supportingVehicle" },
      { id: "neonCourierAvatar", typedRef: "assets.neonCourierAvatar", role: "supportingCourierOperator" },
      { id: "gravityPostDockBeacon", typedRef: "assets.gravityPostDockBeacon", role: "supportingWorld" },
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
    physics: "none (authored inverse-distance arcade gravity; no orbital-mechanics or n-body claim)",
    claimBoundary: CLAIM_BOUNDARY,
    lastDockHash
  };
  window.__AURA3D_SHOWCASE_GRAVITY_POST__ = window.__GRAVITY_POST_EVIDENCE__;
  (window as any).__AURA3D_GAME_EVIDENCE__ = window.__GRAVITY_POST_EVIDENCE__;
  (window as any).__AURA3D_GAME__ = {
    state: shiftOver ? "gameover" : campaignComplete ? "won" : "playing",
    score,
    contractIndex,
    completedContracts
  };
  document.body.dataset.gravityPostReady = "true";
  document.body.dataset.aura3dShowcaseReady = "true";
  document.body.dataset.aura3dReady = "true";
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
let lastTime = 0;

function updateGameplay(dt: number, fromRealRaf = false): void {
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
  // In real RAF playthroughs, auto-skip flyby after 0.35s so screenshots capture active orbital flight.
  if (flyby.active && fromRealRaf) {
    flybyHoldSeconds += dt;
    if (flybyHoldSeconds >= 0.35) {
      skipFlyby(flyby);
      updateFlyby(flyby, 0);
      flybyHoldSeconds = 0;
    }
  } else if (!flyby.active) {
    flybyHoldSeconds = 0;
  }
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

  // Live RAF auto-chain: after Contract 1 docks and holds for 0.65s (allowing 02-early-dock capture),
  // automatically advance to the next contract and launch along its curved gravity-assist trajectory
  // so 03-mid, 04-action, and 05-late-coast showcase active orbital flight around Sol and the planets.
  if (fromRealRaf && pod.state === "docked" && !visualReviewCapture && !compositionPresentationOverride) {
    dockedHoldSeconds += dt;
    if (dockedHoldSeconds >= 0.65) {
      dockedHoldSeconds = 0;
      if (contractIndex >= CONTRACTS.length - 1) {
        contractIndex = 1;
        campaignComplete = false;
        lastScoreCard = null;
        resetPodForContract(pod, contract());
        resetKeyboardAim();
        resetPredictionTelemetry();
      } else {
        nextContract();
      }
      const solved = AUTO_CONTRACT_SOLUTIONS[contract().id];
      if (solved && (pod.state as string) === "ready") {
        autoChainedFlight = true;
        launchWithPrediction(solved.dir, solved.speed);
      }
    }
  }

  if (pod.state === "coasting" && input.pressed("burnPrograde")) {
    const events = applyCorrection(pod, 1);
    if (events.length > 0 && pod.assists.size > 0) {
      // Oberth Slingshot Thruster Boost when burning after a gravity assist
      pod.kinematic.velocity = [pod.kinematic.velocity[0] * 1.08, pod.kinematic.velocity[1] * 1.08];
      slingshotBoostTimer = 0.85;
    }
    emitPodEvents(events);
  }
  if (pod.state === "coasting" && input.pressed("burnRetro")) {
    const events = applyCorrection(pod, -1);
    if (events.length > 0) {
      slingshotBoostTimer = 0.75;
    }
    emitPodEvents(events);
  }
  if (pod.state === "coasting" && input.pressed("warpHop") && pod.propellant >= 8) {
    // Warp Beacon Micro-Hop toward the destination station
    const dest = destinationStation();
    const toDestX = dest.x - pod.kinematic.position[0];
    const toDestZ = dest.z - pod.kinematic.position[1];
    const dist = Math.hypot(toDestX, toDestZ);
    if (dist > 0.25) {
      const hopStep = Math.min(0.42, dist * 0.28);
      pod.kinematic.position = [
        pod.kinematic.position[0] + (toDestX / dist) * hopStep,
        pod.kinematic.position[1] + (toDestZ / dist) * hopStep
      ];
      pod.propellant = Math.max(0, pod.propellant - 8);
      pod.correctionsUsed += 1;
      slingshotBoostTimer = 0.95;
      audio.play("warp-hum");
    }
  }

  warpActive = (input.held("warp") || touchWarp) && pod.state === "coasting";
  if (warpActive) audio.play("warp-hum");

  if (pod.state === "ready") {
    steerKeyboardAim(dt);
    if (input.pressed("launch")) launchActiveAim();
    updatePrediction();
  } else if (pod.state === "coasting") {
    // During auto-chained live RAF flights, keep warp gentle so curved trajectories remain visible across captures
    const effectiveWarp = warpActive && !autoChainedFlight;
    const effectiveDt = warpActive && autoChainedFlight ? dt * 1.25 : dt;
    const events = updateCoast({ pod, contract: contract(), bodies: WELL_BODIES, dt: effectiveDt, warpActive: effectiveWarp });
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
      if (event.type === "assist") {
        // Gravity Slingshot Boost: recharge propellant, grant bonus token & score, and trigger 3D shockwave ring
        pod.propellant = Math.min(100, pod.propellant + 12);
        pod.correctionTokensRemaining += 1;
        score += 120;
        slingshotBoostTimer = 1.1;
      }
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
  updateGameplay(dt, true);
});

updatePrediction();
syncPodVisual();
syncStationPulses();
renderHud();
publishEvidence();
void app.ready().then(() => {
  (window as any).__AURA3D_GAME__ = { state: "playing" };
});

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
if (new URLSearchParams(location.search).has("planetProbe")) {
  (window as unknown as Record<string, unknown>).__GRAVITY_POST_PLANET_PROBE__ = {
    async capture(visible: boolean) {
      paused = true;
      app.pause();
      await app.ready();
      const planets = WELL_BODIES.filter(body => body.id !== "sol").map(body => {
        const handle = app.nodes.require(`gravity-post-planet-${body.id}`);
        handle.setVisible(visible);
        return { id: body.id, handle };
      });
      await app.stepAsync(0);
      const canvas = app.canvas;
      const gl = canvas?.getContext("webgl2");
      if (!canvas || !gl) throw new Error("Typed planet proof requires actual mounted WebGL2 output.");
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { width: canvas.width, height: canvas.height, pixels: Array.from(pixels),
        planets: planets.map(({ id, handle }) => ({ id, imported: handle.importedAssetEvidence(), node: handle.snapshot() })),
        diagnostics: app.diagnostics() };
    }
  };
}
/** Debug/test surface: the mounted physics runtime. */
(window as unknown as Record<string, unknown>).__GRAVITY_POST_PHYSICS__ = physics;
window.__GRAVITY_POST_EVIDENCE_SNAPSHOT__ = () => window.__GRAVITY_POST_EVIDENCE__;

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application" as const,
    get subject() {
      const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
      const [displayX, displayZ] = compositionPresentationOverride || (!visualReviewCapture && contractIndex === 0)
        ? corridorPoint(REVIEW_COURIER_PROGRESS, REVIEW_COURIER_LATERAL)
        : [pod.kinematic.position[0], pod.kinematic.position[1]] as const;
      return {
        position: [displayX, PLAY_PLANE_Y, displayZ] as const,
        rotation: [0, speed > 1e-4 ? Math.atan2(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) : 0, 0] as const,
        targetSize: 3.8
      };
    },
    async setSubjectSuppressed(suppressed: boolean) {
      paused = true;
      app.pause();
      await app.ready();
      compositionSubjectSuppressed = suppressed;
      app.nodes.get("mail-pod")?.setVisible(!suppressed);
      app.nodes.get("mail-pod-courier-operator")?.setVisible(!suppressed && pod.state !== "lost");
      app.nodes.get("mail-pod-courier-handoff-parcel")?.setVisible(!suppressed && pod.state !== "lost");
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
      await app.stepAsync(0);
    },
    async settleSubjectPose() {
      paused = true;
      app.pause();
      await app.ready();
      compositionPresentationOverride = true;
      resetPodForContract(pod, contract());
      app.nodes.get("mail-pod")?.setVisible(!compositionSubjectSuppressed);
      syncPodVisual();
      publishEvidence();
      await app.stepAsync(0);
    }
  },
  configurable: true
});
