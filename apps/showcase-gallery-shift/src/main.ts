// Gallery Shift — rebuilt single-path on the salvaged vision core.
// Every URL boots this module; the former legacy/v2 dispatcher is deleted.
//
// PORT (B5): `src/gameplay/{vision,guard,thief,floor}.ts` travel WHOLE from
// the trashed route — floor.ts included (see art/direction.ts note): it
// imports nothing but public `physics` and carries the Rapier builder whose
// real `world.raycast` occlusion is vision.ts's headline proof. Only
// `gallery-world-candidate.ts` (the GLB-interior catalog binding) and the
// v2 scene were trashed. The museum interior below is fresh construction
// from the salvaged FloorLayout rects — the same rects that build the
// physics colliders — rendered with the two typed Quaternius props.
import {
  camera,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createGame } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import {
  createFloorWorld,
  FLOOR_LAYOUTS,
  layoutCircles,
  layoutRects,
  type FloorLayout,
  type FloorWorld
} from "./gameplay/floor";
import { GuardAgent } from "./gameplay/guard";
import { ThiefPlayer, type ThiefGait } from "./gameplay/thief";
import {
  advanceDetection,
  ALERT_THRESHOLD,
  brightnessAt,
  cameraYawAt,
  CAMERA_HALF_FOV,
  CAUGHT_THRESHOLD,
  GUARD_HALF_FOV,
  sampleVision,
  SUSPICIOUS_THRESHOLD,
  worldRaycast,
  type DetectionMeterState,
  type VisionCounters,
  type WatcherPose
} from "./gameplay/vision";
import { CAMERA_RANGE, GUARD_RANGE } from "./gameplay/floor";
import { guardHearsNoise } from "./gameplay/guard";

declare global {
  interface Window {
    __aura3dGameSnapshot?: GalleryShiftEvidence;
    /** `?debug=1` only: the salvaged thief's documented test teleport. */
    __aura3dGalleryDebug?: { readonly teleport: (x: number, z: number) => void };
  }
}

type Phase = "playing" | "caught" | "won";

interface GalleryShiftEvidence {
  readonly framed: boolean;
  readonly state: Phase;
  readonly frame: number;
  /** Real detection-meter value from the salvaged vision system (0..1). */
  readonly detection: number;
  readonly seen: boolean;
  readonly score: number;
  readonly caught: number;
  readonly escaped: number;
  readonly guards: readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly state: string }[];
  readonly thief: { readonly x: number; readonly z: number; readonly gait: string; readonly carrying: boolean };
  readonly lifted: readonly string[];
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly drawCalls: number;
  readonly evidence: unknown;
}

const LOOK_ID = "interior-warm" as const;
const LAYOUT: FloorLayout = FLOOR_LAYOUTS[0]!;
const FIXED_DT = 1 / 60;
const EYE_Y = 1.55;
const THIEF_EYE_Y = 1.1;
const BASE_ORTHO_SIZE = 7.8;
const MIN_HALF_WIDTH = 10.4;
const CAMERA_POS: [number, number, number] = [-3.4, 12.8, 13.6];
const CAMERA_TARGET: [number, number, number] = [0.2, 0.35, -0.4];

function viewportAspect(): number {
  const w = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 720;
  const aspect = w / h;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
}

function viewportOrthoSize(): number {
  return Math.max(BASE_ORTHO_SIZE, MIN_HALF_WIDTH / viewportAspect());
}

// Same scale convention as the Blockfall rebuild: GLBs were authored
// against a 1.082 m reference cube, so RENORM keeps rendered sizes true.
const RENORM = 1.082 / assets.quaterniusCubeCrate.bounds[1];
const bs = (metres: number) => (metres / 2) * RENORM;
const WALL_RENORM_X = 1.082 / assets.quaterniusWallModular.bounds[0];
const WALL_RENORM_Y = 1.082 / assets.quaterniusWallModular.bounds[1];
const WALL_RENORM_Z = 1.082 / assets.quaterniusWallModular.bounds[2];

const inputOptions = {
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    sneak: ["KeyC"],
    sprint: ["ShiftLeft", "ShiftRight"],
    interact: ["KeyE"],
    reset: ["KeyR"]
  },
  bufferMs: 100
} as const;

const routeEvents = game.eventLog({ label: "gallery shift events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: GalleryShiftEvidence | undefined;

const galleryGame = createGame({
  id: "gallery-shift",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "arcade-neon",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "LOOT" },
      // Detection meter over the real 0..1 vision value. HudKit requires a
      // numeric max > 0 (prd14 T0-29); the C-24 contract spec omits the
      // field, so the entry asserts through the contract shape — createGame
      // forwards the object verbatim to mountHud, which reads `max`.
      { id: "alert", kind: "meter", max: 1, anchor: "top-right", label: "DETECTION" } as { id: string; kind: string; anchor: "top-right"; label: string },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", up: "up", down: "down", dash: "sprint", jump: "interact", attack: "sneak" }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { galleryShift: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = galleryGame.app;
if (!galleryGame.input) throw new Error("gallery-shift failed to create runtime-owned input.");
const input = galleryGame.input;
// createGame lifecycle (Blockfall precedent): start() runs the session
// booting -> loading -> playing; without it the beacon never leaves booting.
galleryGame.start();

// ------------------------------------------------------------- round state --
let floorWorld: FloorWorld = createFloorWorld(LAYOUT);
let thief = makeThief();
let guards: GuardAgent[] = LAYOUT.guards.map((spawn) => new GuardAgent(spawn));
let detection: DetectionMeterState = { value: 0, secondsSinceSeen: 0 };
let counters: VisionCounters = { losRayCount: 0, occlusionCount: 0 };
let phase: Phase = "playing";
let score = 0;
let caughtCount = 0;
let escapedCount = 0;
let liftedIds: string[] = [];
let frame = 0;
let simTime = 0;
let thiefSeen = false;
let objective = "Lift both exhibits (hold E by a pedestal), then reach the north exit. Avoid the guard cones.";
let thiefYaw = Math.PI;
let lastHudHtml = "";
let cachedEvidence: unknown = null;
let cachedDrawCalls = 0;

function makeThief(): ThiefPlayer {
  return new ThiefPlayer(LAYOUT, layoutRects(LAYOUT), layoutCircles(LAYOUT), floorWorld.thiefBody, LAYOUT.thiefSpawn);
}

function resetRound(): void {
  floorWorld = createFloorWorld(LAYOUT);
  thief = makeThief();
  guards = LAYOUT.guards.map((spawn) => new GuardAgent(spawn));
  detection = { value: 0, secondsSinceSeen: 0 };
  counters = { losRayCount: 0, occlusionCount: 0 };
  phase = "playing";
  score = 0;
  liftedIds = [];
  simTime = 0;
  thiefSeen = false;
  objective = "Lift both exhibits (hold E by a pedestal), then reach the north exit. Avoid the guard cones.";
  exhibitNodes.forEach((node) => node.setVisible(true));
  exhibitCrownNodes.forEach((node) => node.setVisible(true));
  routeEvents.push({ type: "reset", label: "reset" });
}

if (typeof location !== "undefined" && /(?:^\?|&)debug=1(?:&|$)/.test(location.search)) {
  window.__aura3dGalleryDebug = { teleport: (x, z) => thief.teleport(x, z) };
}

// ------------------------------------------------------------ scene build --
function buildScene() {
  const nodes: AuraNodeInput[] = [];

  // 1. Museum floor: polished dark marble with brushed-metal inlay trim strips.
  const marbleFloorMat = material.reflectiveFloor({
    color: "#0c1322",
    roughness: 0.12,
    metallic: 0.38,
    clearcoat: 0.85,
    clearcoatRoughness: 0.05
  });
  const rotundaInlayMat = material.lacquer({
    color: "#131e36",
    roughness: 0.12,
    clearcoat: 0.92,
    clearcoatRoughness: 0.05
  });
  const inlayTrimMat = material.brushedMetal({ color: "#cbd5e1", roughness: 0.25 });

  // 2. Gallery walls, mahogany wainscoting, partition pillars & brass picture frames.
  const galleryWallMat = material.ceramic({ color: "#1e293b", roughness: 0.26, clearcoat: 0.55 });
  const mahoganyWainscotMat = material.lacquer({ color: "#3b1d14", roughness: 0.25, clearcoat: 0.9 });
  const brassFrameMat = material.brushedMetal({ color: "#d4af37" });
  const canvasArtWarmMat = material.lacquer({ color: "#7c2d12", roughness: 0.22, clearcoat: 0.88 });
  const canvasArtTealMat = material.lacquer({ color: "#164e63", roughness: 0.22, clearcoat: 0.88 });

  // 3. Artifact display pedestals, frosted-glass vitrines, gold sculptures & velvet stanchions.
  const pedestalBaseMat = material.lacquer({ color: "#111827", clearcoat: 0.95 });
  const vitrineGlassMat = material.frostedGlass({ color: "#cffafe", opacity: 0.35 });
  const goldSculptureMat = material.chrome({ color: "#fbbf24" });
  const velvetRopeMat = material.felt({ color: "#991b1b" });

  // 4. Security lasers, characters & vision cones (all emissives marked practical: true).
  const securityLaserMat = material.neon({
    color: "#ef4444",
    emissive: "#ff1f4b",
    emissiveIntensity: 2.6,
    practical: true
  });
  const serviceExitMat = material.neon({
    color: "#4ce8b0",
    emissive: "#4ce8b0",
    emissiveIntensity: 1.4,
    practical: true
  });
  const thiefSuitMat = material.lacquer({ color: "#0f172a", roughness: 0.26, clearcoat: 0.88 });
  const thiefHoodMat = material.felt({ color: "#1e293b" });
  const thiefVisorMat = material.neon({
    color: "#62f8e7",
    emissive: "#62f8e7",
    emissiveIntensity: 1.9,
    practical: true
  });
  const guardUniformMat = material.lacquer({ color: "#1e1b4b", roughness: 0.28, clearcoat: 0.85 });
  const guardTorchMat = material.neon({
    color: "#fde68a",
    emissive: "#fbbf24",
    emissiveIntensity: 2.2,
    practical: true
  });
  const visionConeMat = material.neon({
    color: "#ffb454",
    emissive: "#ffb454",
    emissiveIntensity: 0.42,
    practical: true
  });

  // Polished dark marble floor slab + central rotunda inlaid medallion.
  nodes.push(
    primitives.box({ name: "gallery floor slab", material: marbleFloorMat, receiveShadow: true })
      .position(0, -0.06, 0)
      .scale([21.4, 0.12, 15.4]),
    primitives.box({ name: "rotunda marble medallion", material: rotundaInlayMat, receiveShadow: true })
      .position(0, 0.008, 0.1)
      .scale([8.8, 0.016, 5.6])
  );

  // Brushed-metal inlay trim strips across the rotunda, foyer aisle, and wing thresholds.
  const trimStrips: readonly { readonly name: string; readonly x: number; readonly z: number; readonly sx: number; readonly sz: number }[] = [
    { name: "inlay trim rotunda north", x: 0, z: -2.75, sx: 9.2, sz: 0.08 },
    { name: "inlay trim rotunda south", x: 0, z: 2.95, sx: 9.2, sz: 0.08 },
    { name: "inlay trim rotunda west", x: -4.6, z: 0.1, sx: 0.08, sz: 5.7 },
    { name: "inlay trim rotunda east", x: 4.6, z: 0.1, sx: 0.08, sz: 5.7 },
    { name: "inlay trim foyer west", x: -1.8, z: 4.9, sx: 0.07, sz: 3.9 },
    { name: "inlay trim foyer east", x: 1.8, z: 4.9, sx: 0.07, sz: 3.9 },
    { name: "inlay trim archive wing", x: -7.5, z: -1.3, sx: 4.6, sz: 0.07 },
    { name: "inlay trim treasury wing", x: 7.5, z: 0.8, sx: 4.6, sz: 0.07 }
  ];
  nodes.push(
    instances.box({
      name: "rotunda and wing inlay trim strips",
      material: inlayTrimMat,
      receiveShadow: true,
      transforms: trimStrips.map((strip) => ({
        position: [strip.x, 0.018, strip.z] as [number, number, number],
        scale: [strip.sx, 0.018, strip.sz] as [number, number, number]
      }))
    })
  );

  // Gallery walls with mahogany wainscoting & cutaway south parapet for the 3/4 view.
  const wallTransforms: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  const wainscotTransforms: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  for (const wall of LAYOUT.walls) {
    const isSouthCutaway = wall.id === "wall-south";
    const visualHeight = isSouthCutaway ? 0.48 : wall.height;
    const wainscotHeight = isSouthCutaway ? 0.48 : 0.92;
    const wallWidthX = wall.halfX * 2;
    const wallWidthZ = wall.halfZ * 2;
    if (isSouthCutaway) {
      wainscotTransforms.push({
        position: [wall.x, visualHeight / 2, wall.z],
        scale: [wallWidthX, visualHeight, wallWidthZ]
      });
    } else {
      wallTransforms.push({
        position: [wall.x, visualHeight / 2, wall.z],
        scale: [wallWidthX, visualHeight, wallWidthZ]
      });
      wainscotTransforms.push({
        position: [wall.x, wainscotHeight / 2, wall.z],
        scale: [wallWidthX + 0.06, wainscotHeight, wallWidthZ + 0.06]
      });
    }
  }
  nodes.push(
    instances.box({
      name: "gallery structural walls",
      material: galleryWallMat,
      castShadow: true,
      receiveShadow: true,
      transforms: wallTransforms
    }),
    instances.box({
      name: "gallery mahogany wainscoting",
      material: mahoganyWainscotMat,
      castShadow: false,
      receiveShadow: true,
      transforms: wainscotTransforms
    })
  );
  // Carved modular stone vault pediment over the north extraction exit.
  nodes.push(
    model(assets.quaterniusWallModular, {
      name: "vault arch pediment",
      material: galleryWallMat,
      castShadow: false,
      receiveShadow: true
    })
      .position(LAYOUT.exit.x, 2.55, LAYOUT.exit.z - 0.14)
      .scale([WALL_RENORM_X * 1.8, WALL_RENORM_Y * 0.65, WALL_RENORM_Z * 0.45])
  );

  // Fluted ceramic partition pillars with brass capitals at doorway jambs & alcove corners.
  const pillarCoords: readonly [string, number, number][] = [
    ["pillar-alcove-west", -2.8, -5.2],
    ["pillar-alcove-east", 2.8, -5.2],
    ["pillar-archive-north", -5.0, -1.9],
    ["pillar-archive-south", -5.0, -0.7],
    ["pillar-treasury-north", 5.0, 0.1],
    ["pillar-treasury-south", 5.0, 1.5]
  ];
  nodes.push(
    instances.box({
      name: "gallery partition pillars",
      material: galleryWallMat,
      castShadow: true,
      receiveShadow: true,
      transforms: pillarCoords.map(([, px, pz]) => ({
        position: [px, 1.85, pz] as [number, number, number],
        scale: [0.46, 3.7, 0.46] as [number, number, number]
      }))
    }),
    instances.box({
      name: "gallery pillar brass capitals",
      material: brassFrameMat,
      transforms: pillarCoords.map(([, px, pz]) => ({
        position: [px, 3.68, pz] as [number, number, number],
        scale: [0.56, 0.12, 0.56] as [number, number, number]
      }))
    })
  );

  // Brass picture frames with gallery paintings along the north and partition walls.
  const paintings: readonly { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly sx: number; readonly sy: number; readonly sz: number; readonly warm: boolean }[] = [
    { id: "painting-north-west", x: -5.8, y: 2.15, z: -6.96, sx: 2.2, sy: 1.25, sz: 0.08, warm: true },
    { id: "painting-north-east", x: 5.8, y: 2.15, z: -6.96, sx: 2.2, sy: 1.25, sz: 0.08, warm: false },
    { id: "painting-rotunda-west", x: -4.76, y: 2.1, z: -3.45, sx: 0.08, sy: 1.2, sz: 1.9, warm: false },
    { id: "painting-rotunda-east", x: 4.76, y: 2.1, z: -2.45, sx: 0.08, sy: 1.2, sz: 2.1, warm: true },
    { id: "painting-wing-west", x: -9.95, y: 2.15, z: -2.2, sx: 0.08, sy: 1.3, sz: 2.2, warm: true },
    { id: "painting-wing-east", x: 9.95, y: 2.15, z: 2.2, sx: 0.08, sy: 1.3, sz: 2.2, warm: false }
  ];
  nodes.push(
    instances.box({
      name: "gallery brass picture frames",
      material: brassFrameMat,
      transforms: paintings.map((art) => ({
        position: [art.x, art.y, art.z] as [number, number, number],
        scale: [art.sx, art.sy, art.sz] as [number, number, number]
      }))
    }),
    instances.box({
      name: "gallery warm canvases",
      material: canvasArtWarmMat,
      transforms: paintings.filter((art) => art.warm).map((art) => ({
        position: [art.x, art.y, art.z] as [number, number, number],
        scale: [Math.max(0.1, art.sx - 0.18), art.sy - 0.18, Math.max(0.1, art.sz - 0.18)] as [number, number, number]
      }))
    }),
    instances.box({
      name: "gallery teal canvases",
      material: canvasArtTealMat,
      transforms: paintings.filter((art) => !art.warm).map((art) => ({
        position: [art.x, art.y, art.z] as [number, number, number],
        scale: [Math.max(0.1, art.sx - 0.18), art.sy - 0.18, Math.max(0.1, art.sz - 0.18)] as [number, number, number]
      }))
    })
  );

  // Artifact display pedestals: lacquer bases, frosted-glass vitrines, golden galleryArtifactBust sculptures, and felt velvet stanchions.
  const stanchionPostTransforms: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  const stanchionRopeTransforms: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  for (const pedestal of LAYOUT.pedestals) {
    nodes.push(
      primitives.box({ name: `pedestal ${pedestal.id}`, material: pedestalBaseMat, castShadow: true, receiveShadow: true })
        .position(pedestal.x, 0.48, pedestal.z)
        .scale([0.76, 0.96, 0.76]),
      primitives.box({ name: `pedestal brass collar ${pedestal.id}`, material: brassFrameMat })
        .position(pedestal.x, 0.99, pedestal.z)
        .scale([0.82, 0.07, 0.82]),
      model(assets.quaterniusCubeCrate, { name: `galleryArtifactBust ${pedestal.id}`, material: goldSculptureMat, castShadow: false })
        .position(pedestal.x, 1.24, pedestal.z)
        .scale([bs(0.38), bs(0.42), bs(0.32)])
        .runtime(game.runtimeNode(`exhibit-${pedestal.id}`, { tags: ["exhibit", "runtime"] })),
      primitives.box({ name: `galleryArtifactBust head ${pedestal.id}`, material: goldSculptureMat, castShadow: false })
        .position(pedestal.x, 1.56, pedestal.z)
        .rotate(0, Math.PI / 4, 0)
        .scale([0.24, 0.28, 0.24])
        .runtime(game.runtimeNode(`exhibit-crown-${pedestal.id}`, { tags: ["exhibit", "runtime"] })),
      primitives.box({ name: `vitrine glass ${pedestal.id}`, material: vitrineGlassMat })
        .position(pedestal.x, 1.38, pedestal.z)
        .scale([0.72, 0.76, 0.72])
    );

    const ropeOffset = 0.86;
    for (const [, cx, cz] of [
      ["nw", -ropeOffset, -ropeOffset],
      ["ne", ropeOffset, -ropeOffset],
      ["sw", -ropeOffset, ropeOffset],
      ["se", ropeOffset, ropeOffset]
    ] as const) {
      stanchionPostTransforms.push({
        position: [pedestal.x + cx, 0.42, pedestal.z + cz],
        scale: [0.08, 0.84, 0.08]
      });
    }
    stanchionRopeTransforms.push(
      { position: [pedestal.x, 0.68, pedestal.z - ropeOffset], scale: [ropeOffset * 2, 0.05, 0.05] },
      { position: [pedestal.x, 0.68, pedestal.z + ropeOffset], scale: [ropeOffset * 2, 0.05, 0.05] },
      { position: [pedestal.x - ropeOffset, 0.68, pedestal.z], scale: [0.05, 0.05, ropeOffset * 2] },
      { position: [pedestal.x + ropeOffset, 0.68, pedestal.z], scale: [0.05, 0.05, ropeOffset * 2] }
    );
  }
  nodes.push(
    instances.box({ name: "stanchion brass posts", material: brassFrameMat, transforms: stanchionPostTransforms }),
    instances.box({ name: "stanchion velvet ropes", material: velvetRopeMat, transforms: stanchionRopeTransforms })
  );

  // Wing display cases: lacquer base, Golden galleryArtifactBust sculpture, and frosted-glass vitrine hood.
  nodes.push(
    instances.box({
      name: "wing display case bases",
      material: pedestalBaseMat,
      castShadow: false,
      receiveShadow: true,
      transforms: LAYOUT.cases.map((displayCase) => ({
        position: [displayCase.x, 0.42, displayCase.z] as [number, number, number],
        scale: [1.12, 0.84, 1.12] as [number, number, number]
      }))
    }),
    instances.box({
      name: "wing display case relics galleryArtifactBust",
      material: goldSculptureMat,
      castShadow: false,
      transforms: LAYOUT.cases.map((displayCase) => ({
        position: [displayCase.x, 1.06, displayCase.z] as [number, number, number],
        rotation: [0, Math.PI / 4, 0] as [number, number, number],
        scale: [0.36, 0.44, 0.36] as [number, number, number]
      }))
    }),
    instances.box({
      name: "wing display case vitrines",
      material: vitrineGlassMat,
      transforms: LAYOUT.cases.map((displayCase) => ({
        position: [displayCase.x, 1.14, displayCase.z] as [number, number, number],
        scale: [1.06, 0.68, 1.06] as [number, number, number]
      }))
    })
  );

  // North service extraction pad + brass threshold frame.
  nodes.push(
    primitives.box({ name: "service exit frame", material: brassFrameMat })
      .position(LAYOUT.exit.x, 0.02, LAYOUT.exit.z)
      .scale([1.88, 0.04, 1.24]),
    primitives.box({ name: "service exit pad", material: serviceExitMat })
      .position(LAYOUT.exit.x, 0.05, LAYOUT.exit.z)
      .scale([1.6, 0.06, 0.98])
  );

  // Red security laser beams (practical: true) across the north vault throat and wing portals.
  const laserBeams: readonly { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly sx: number; readonly sz: number }[] = [
    { id: "vault-laser-low", x: 0, y: 0.72, z: -5.2, sx: 1.56, sz: 0.04 },
    { id: "vault-laser-high", x: 0, y: 1.48, z: -5.2, sx: 1.56, sz: 0.04 },
    { id: "archive-portal-laser", x: -5.0, y: 2.35, z: -1.3, sx: 0.04, sz: 1.25 },
    { id: "treasury-portal-laser", x: 5.0, y: 2.35, z: 0.8, sx: 0.04, sz: 1.25 },
    { id: "rotunda-laser-west", x: -3.2, y: 0.35, z: -2.75, sx: 2.4, sz: 0.04 },
    { id: "rotunda-laser-east", x: 3.2, y: 0.35, z: -2.75, sx: 2.4, sz: 0.04 }
  ];
  nodes.push(
    instances.box({
      name: "security laser beams",
      material: securityLaserMat,
      transforms: laserBeams.map((beam) => ({
        position: [beam.x, beam.y, beam.z] as [number, number, number],
        scale: [beam.sx, 0.04, beam.sz] as [number, number, number]
      }))
    })
  );

  // Thief (`galleryThief`) multi-part stealth character + patrolling guards (`galleryGuard`).
  nodes.push(
    primitives.box({ name: "galleryThief", material: thiefSuitMat, castShadow: true })
      .position(LAYOUT.thiefSpawn.x, 0.68, LAYOUT.thiefSpawn.z)
      .scale([0.48, 1.12, 0.36])
      .runtime(game.runtimeNode("thief", { tags: ["thief", "runtime"] })),
    primitives.box({ name: "galleryThief hood", material: thiefHoodMat, castShadow: false })
      .position(LAYOUT.thiefSpawn.x, 1.42, LAYOUT.thiefSpawn.z)
      .scale([0.34, 0.36, 0.34])
      .runtime(game.runtimeNode("thief-head", { tags: ["thief", "runtime"] })),
    primitives.box({ name: "galleryThief visor", material: thiefVisorMat })
      .position(LAYOUT.thiefSpawn.x, 1.44, LAYOUT.thiefSpawn.z + 0.16)
      .scale([0.28, 0.09, 0.08])
      .runtime(game.runtimeNode("thief-visor", { tags: ["thief", "runtime"] })),
    primitives.box({ name: "galleryThief pack", material: mahoganyWainscotMat, castShadow: false })
      .position(LAYOUT.thiefSpawn.x, 0.82, LAYOUT.thiefSpawn.z - 0.22)
      .scale([0.34, 0.48, 0.2])
      .runtime(game.runtimeNode("thief-pack", { tags: ["thief", "runtime"] }))
  );

  LAYOUT.guards.forEach((spawn, index) => {
    nodes.push(
      primitives.box({ name: `galleryGuard ${spawn.id}`, material: guardUniformMat, castShadow: true })
        .position(spawn.x, 0.74, spawn.z)
        .scale([0.56, 1.24, 0.42])
        .runtime(game.runtimeNode(`guard-${index}`, { tags: ["guard", "runtime"] })),
      primitives.box({ name: `galleryGuard cap ${spawn.id}`, material: brassFrameMat, castShadow: false })
        .position(spawn.x, 1.54, spawn.z)
        .scale([0.38, 0.36, 0.38])
        .runtime(game.runtimeNode(`guard-head-${index}`, { tags: ["guard", "runtime"] })),
      primitives.box({ name: `galleryGuard torch ${spawn.id}`, material: guardTorchMat })
        .position(spawn.x, 0.96, spawn.z + 0.34)
        .scale([0.14, 0.14, 0.26])
        .runtime(game.runtimeNode(`guard-torch-${index}`, { tags: ["guard", "runtime"] })),
      // Authored vision-cone volume: a flattened, elongated translucent
      // wedge laid along the guard's facing. Detection itself is the
      // salvaged cone+raycast math (vision.ts); this mesh only reads it.
      primitives.box({ name: `vision cone ${spawn.id}`, material: visionConeMat })
        .position(spawn.x, 0.08, spawn.z)
        .scale([3.2, 0.05, 6])
        .runtime(game.runtimeNode(`cone-${index}`, { tags: ["cone", "runtime"] }))
    );
  });

  // Architectural gallery lighting: 6 practicals (3 spot pools + 3 point washes)
  // within art/direction.ts's `practicals: 6` and `maxShadowed: 3` stealth contract.
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .add(
      lights.spot({
        name: "rotunda skylight spot",
        position: [0, 6.2, 0.2],
        target: [0, 0, 0.2],
        color: "#ffe4b5",
        intensity: 34,
        angle: Math.PI / 4,
        penumbra: 0.55,
        distance: 16,
        shadow: false
      })
    )
    .add(
      lights.spot({
        name: "west exhibit spot",
        position: [-6.5, 4.8, -4.2],
        target: [-6.5, 0.8, -4.2],
        color: "#ffd28a",
        intensity: 28,
        angle: Math.PI / 5,
        penumbra: 0.5,
        distance: 12,
        shadow: false
      })
    )
    .add(
      lights.spot({
        name: "east exhibit spot",
        position: [6.5, 4.8, -4.2],
        target: [6.5, 0.8, -4.2],
        color: "#ffd28a",
        intensity: 28,
        angle: Math.PI / 5,
        penumbra: 0.5,
        distance: 12,
        shadow: false
      })
    )
    .add(
      lights.point({
        name: "foyer warm chandelier",
        position: [0, 3.8, 4.4],
        color: "#ffcf96",
        intensity: 14,
        distance: 11
      })
    )
    .add(
      lights.point({
        name: "archive gallery wash",
        position: [-7.2, 3.4, 1.5],
        color: "#93c5fd",
        intensity: 11,
        distance: 10
      })
    )
    .add(
      lights.point({
        name: "treasury gallery wash",
        position: [7.2, 3.4, 1.5],
        color: "#fde68a",
        intensity: 11,
        distance: 10
      })
    )
    .camera(camera.orthographic({ position: CAMERA_POS, target: CAMERA_TARGET, orthographicSize: viewportOrthoSize() }));
}

let appliedOrthoSize = viewportOrthoSize();
app.camera?.use(
  camera.rigs.static({ position: CAMERA_POS, target: CAMERA_TARGET, orthographicSize: appliedOrthoSize })
);

let thiefNode: AuraRuntimeNodeHandle = app.nodes.require("thief");
let thiefHeadNode: AuraRuntimeNodeHandle = app.nodes.require("thief-head");
let thiefVisorNode: AuraRuntimeNodeHandle = app.nodes.require("thief-visor");
let thiefPackNode: AuraRuntimeNodeHandle = app.nodes.require("thief-pack");
let guardNodes: AuraRuntimeNodeHandle[] = LAYOUT.guards.map((_, index) => app.nodes.require(`guard-${index}`));
let guardHeadNodes: AuraRuntimeNodeHandle[] = LAYOUT.guards.map((_, index) => app.nodes.require(`guard-head-${index}`));
let guardTorchNodes: AuraRuntimeNodeHandle[] = LAYOUT.guards.map((_, index) => app.nodes.require(`guard-torch-${index}`));
let coneNodes: AuraRuntimeNodeHandle[] = LAYOUT.guards.map((_, index) => app.nodes.require(`cone-${index}`));
let exhibitNodes: AuraRuntimeNodeHandle[] = LAYOUT.pedestals.map((pedestal) => app.nodes.require(`exhibit-${pedestal.id}`));
let exhibitCrownNodes: AuraRuntimeNodeHandle[] = LAYOUT.pedestals.map((pedestal) => app.nodes.require(`exhibit-crown-${pedestal.id}`));
void thiefNode; void guardNodes; void coneNodes;

const hudRoot = createHud();
let accumulator = 0;

app.onFrame(({ dt }) => {
  if (input.pressed("reset")) resetRound();
  if (phase === "playing") {
    accumulator += Math.min(dt, 0.05);
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 2) {
      stepFixed();
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (accumulator > FIXED_DT) accumulator = 0;
  }
  syncVisuals();
  renderHud();
  publishEvidence();
});

renderHud();
publishEvidence();

// ------------------------------------------------------------ fixed step --
function stepFixed(): void {
  frame += 1;
  simTime += FIXED_DT;
  const moveX = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
  const moveZ = (input.held("down") ? 1 : 0) - (input.held("up") ? 1 : 0);
  const gait: ThiefGait = input.held("sneak") ? "sneak" : input.held("sprint") ? "sprint" : "walk";
  const unlifted = LAYOUT.pedestals.filter((pedestal) => !liftedIds.includes(pedestal.id));
  const noises = thief.update(FIXED_DT, { moveX, moveZ, gait, liftHeld: input.held("interact") }, unlifted);

  const sensors = floorWorld.stepFixed(1);
  for (const sensor of sensors) {
    if (sensor.kind === "exit" && liftedIds.length >= LAYOUT.pedestals.length) {
      phase = "won";
      escapedCount += 1;
      objective = `Escaped with ${score} loot. Press R to run it again.`;
      routeEvents.push({ type: "escaped", label: "escaped" });
    }
  }

  const lifted = thief.takeCompletedLift();
  if (lifted) {
    liftedIds = [...liftedIds, lifted.id];
    score += lifted.value;
    guards.forEach((guard) => guard.registerLift(liftedIds));
    const pedestalIndex = LAYOUT.pedestals.findIndex((pedestal) => pedestal.id === lifted.id);
    exhibitNodes[pedestalIndex]?.setVisible(false);
    exhibitCrownNodes[pedestalIndex]?.setVisible(false);
    objective = liftedIds.length >= LAYOUT.pedestals.length
      ? "All exhibits lifted. Reach the north exit."
      : `Lifted ${lifted.id} (+${lifted.value}). One exhibit remains.`;
    routeEvents.push({ type: "lift", label: `lift:${lifted.id}` });
  }

  for (const noise of noises) {
    for (const guard of guards) {
      if (guardHearsNoise(guard, noise)) guard.hearNoise({ x: noise.x, z: noise.z });
    }
  }

  const watchers: WatcherPose[] = [
    ...guards.map((guard) => ({
      kind: "guard" as const, id: guard.id, x: guard.x, z: guard.z, eyeY: EYE_Y,
      yaw: guard.yaw, halfFov: GUARD_HALF_FOV, range: GUARD_RANGE
    })),
    ...LAYOUT.cameras.map((cam) => ({
      kind: "camera" as const, id: cam.id, x: cam.x, z: cam.z, eyeY: cam.height,
      yaw: cameraYawAt(cam, simTime), halfFov: CAMERA_HALF_FOV, range: CAMERA_RANGE
    }))
  ];
  const vision = sampleVision(
    worldRaycast(floorWorld.world), watchers, thief.x, thief.z, THIEF_EYE_Y,
    brightnessAt(LAYOUT.lightPools, thief.x, thief.z), [floorWorld.thiefBodyId], counters, false
  );
  thiefSeen = vision.thiefSeen;
  detection = advanceDetection(detection, vision.totalFillPerSecond, FIXED_DT);

  const lastSeen = vision.thiefSeen ? { x: thief.x, z: thief.z } : null;
  if (lastSeen && detection.value >= ALERT_THRESHOLD) {
    guards.forEach((guard) => guard.reportAlert(lastSeen));
  } else if (lastSeen && detection.value >= SUSPICIOUS_THRESHOLD) {
    guards.forEach((guard) => guard.reportSuspicious(lastSeen));
  }
  for (const guard of guards) {
    guard.update({
      dt: FIXED_DT,
      detection: detection.value,
      suspiciousThreshold: SUSPICIOUS_THRESHOLD,
      alertThreshold: ALERT_THRESHOLD,
      lastSeen,
      laserAlertPoint: null
    });
  }

  if (detection.value >= CAUGHT_THRESHOLD) {
    phase = "caught";
    caughtCount += 1;
    objective = "Caught. Press R to try again.";
    routeEvents.push({ type: "caught", label: "caught" });
  }
}

// ---------------------------------------------------------------- sync/HUD --

function syncVisuals(): void {
  const nextOrthoSize = viewportOrthoSize();
  if (Math.abs(nextOrthoSize - appliedOrthoSize) > 1e-3) {
    appliedOrthoSize = nextOrthoSize;
    app.camera?.setPose({ orthographicSize: appliedOrthoSize });
  }
  const snap = thief.snapshot();
  if (snap.moving) {
    thiefYaw = Math.atan2(snap.moveX, snap.moveZ);
  }
  const crouchDrop = snap.gait === "sneak" ? 0.16 : 0;
  const tfx = Math.sin(thiefYaw);
  const tfz = Math.cos(thiefYaw);
  thiefNode.setPosition(snap.x, 0.68 - crouchDrop * 0.5, snap.z).setRotation(0, thiefYaw, 0);
  thiefHeadNode.setPosition(snap.x, 1.42 - crouchDrop, snap.z).setRotation(0, thiefYaw, 0);
  thiefVisorNode.setPosition(snap.x + tfx * 0.16, 1.44 - crouchDrop, snap.z + tfz * 0.16).setRotation(0, thiefYaw, 0);
  thiefPackNode.setPosition(snap.x - tfx * 0.22, 0.82 - crouchDrop * 0.6, snap.z - tfz * 0.22).setRotation(0, thiefYaw, 0);

  guards.forEach((guard, index) => {
    const fx = Math.sin(guard.yaw);
    const fz = Math.cos(guard.yaw);
    guardNodes[index]?.setPosition(guard.x, 0.74, guard.z).setRotation(0, guard.yaw, 0);
    guardHeadNodes[index]?.setPosition(guard.x, 1.54, guard.z).setRotation(0, guard.yaw, 0);
    guardTorchNodes[index]?.setPosition(guard.x + fx * 0.34, 0.96, guard.z + fz * 0.34).setRotation(0, guard.yaw, 0);
    coneNodes[index]?.setPosition(guard.x + fx * 3, 0.08, guard.z + fz * 3).setRotation(0, guard.yaw, 0);
  });
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "gallery-shift-hud";
  root.style.cssText = [
    "position:fixed", "left:14px", "bottom:14px", "z-index:5", "max-width:260px",
    "font:500 11px/1.35 system-ui, sans-serif", "color:rgba(245,251,255,0.82)",
    "background:rgba(7,9,13,0.68)", "border:1px solid rgba(255,180,84,0.28)",
    "border-radius:8px", "padding:8px 10px", "pointer-events:none", "backdrop-filter:blur(6px)"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  galleryGame.hud.set("score", score);
  galleryGame.hud.set("alert", detection.value);
  galleryGame.hud.set("objective", objective);
  const nextHtml = [
    `<strong>Gallery Shift</strong> · <span style="opacity:0.85">${phase.toUpperCase()}</span>`,
    `<div style="opacity:0.75">WASD move · C sneak · Shift sprint · Hold E lift · R reset</div>`
  ].join("");
  if (nextHtml !== lastHudHtml) {
    lastHudHtml = nextHtml;
    hudRoot.innerHTML = nextHtml;
  }
}

function publishEvidence(): void {
  const snap = thief.snapshot();
  if (cachedEvidence === null || frame <= 5 || frame % 8 === 0) {
    cachedEvidence = app.evidence({
      input,
      events: routeEvents,
      hud: hudBindings,
      appState: {
        score,
        objective,
        events: routeEvents.events().map((event: { readonly label: string }) => event.label)
      },
      assets: { typedAssets: Object.keys(assets).length, missingAssets: [] },
      source: { expectsGame: true }
    });
    cachedDrawCalls = app.diagnostics().drawCalls;
  }
  const evidence = cachedEvidence;
  const snapshot: GalleryShiftEvidence = {
    framed: cachedDrawCalls > 0,
    state: phase,
    frame,
    detection: detection.value,
    seen: thiefSeen,
    score,
    caught: caughtCount,
    escaped: escapedCount,
    guards: guards.map((guard) => {
      const guardSnap = guard.snapshot();
      return { id: guardSnap.id, x: guardSnap.x, z: guardSnap.z, yaw: guardSnap.yaw, state: guardSnap.state };
    }),
    thief: { x: snap.x, z: snap.z, gait: snap.gait, carrying: snap.carrying },
    lifted: [...liftedIds],
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    look: { id: LOOK_ID, category: "interior" },
    drawCalls: cachedDrawCalls,
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
  Reflect.set(window, "__AURA3D_SHOWCASE_GALLERY_SHIFT__", snapshot);
}
