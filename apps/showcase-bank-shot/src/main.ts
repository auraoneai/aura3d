// Bank Shot — single-path rebuild (Live Fix B4 PORT).
// Every URL boots this module; the former legacy/v2 dispatcher is deleted.
// Salvaged verbatim: src/gameplay/{table,rules,racks,cue,ball-visuals}.ts
// (physics + pure ShotRecord-fed 3-rack 8-ball rules) and src/audio-map.ts.
import {
  camera,
  defineAuraAssets,
  environments,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  shadows,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
// PRD-09: createGame owns mount/lifecycle, HUD theme, touch preset and cues.
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "../../../src/aura-assets";
import hdriUrl from "../assets/env/studio_small_08_1k.hdr?url";
import { CueController, AIM_STEP, SPIN_STEP, strikeSpeedFor } from "./gameplay/cue";
import { RulesEngine, type ShotOutcome, type ShotRecord } from "./gameplay/rules";
import {
  createTableSimulation,
  hashString,
  BALL_RADIUS,
  CUE_SPOT,
  PLAY_HALF_X,
  PLAY_HALF_Z,
  POCKET_CENTERS
} from "./gameplay/table";
import { ballEulerFromBody } from "./gameplay/ball-visuals";
import { strikeAudioMap, type StrikeAudioParams } from "./audio-map";
import { applyBankShotScenario } from "./scenarios";

const envAssets = defineAuraAssets({
  poolHallHdr: { type: "texture", format: "hdr", url: hdriUrl }
});

declare global {
  interface Window {
    __aura3dGameSnapshot?: BankShotEvidence;
  }
}

interface BankShotEvidence {
  readonly framed: boolean;
  readonly frame: number;
  readonly state: string;
  readonly look: { readonly id: string };
  readonly table: {
    readonly rack: number;
    readonly phase: string;
    readonly score: number;
    readonly suit: string | null;
    readonly fouls: number;
    readonly ballsRemaining: number;
    readonly clockMs: number;
    readonly potted: readonly number[];
    readonly pottedThisShot: number;
    readonly sessionComplete: boolean;
    readonly shotCount: number;
    readonly backend: string;
  };
  readonly balls: {
    readonly liveCount: number;
    readonly ballsPocketed: number;
    readonly maxAngularSpeed: number;
    readonly cue: { readonly x: number; readonly z: number; readonly speed: number } | null;
  };
  readonly aim: { readonly aimAngle: number; readonly spin: number; readonly charge: number; readonly charging: boolean };
  readonly currentShot: { readonly inFlight: boolean; readonly frames: number };
  readonly lastShotRecord: (ShotRecord & { readonly hash: string }) | null;
  readonly poseHash: string;
  readonly freshRackHash: string;
  readonly drawCalls: number;
  readonly events: readonly string[];
  readonly audio: {
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly synthCues: number;
    readonly contextState: string;
    readonly unlocked: boolean;
    readonly lastStrike: StrikeAudioParams | null;
  };
  readonly evidence: unknown;
}

// Authored look recipe (one 3000K pendant spot + pool-hall HDRI IBL).
const LOOK_ID = "bank-shot-pendant" as const;
const BALL_DIAMETER = BALL_RADIUS * 2;
// Standard tournament pool colours by ball number (0 cue, 8 black, stripes reuse hue).
const BALL_COLORS = [
  "#f5f2e8", "#f2c230", "#1f54c4", "#d83428", "#5e3594", "#e07222", "#176e38", "#742626",
  "#14161a", "#f2c230", "#1f54c4", "#d83428", "#5e3594", "#e07222", "#176e38", "#742626"
] as const;

const sim = createTableSimulation();
const rules = new RulesEngine(1);
const cueController = new CueController();
const freshRackHash = sim.poseHash();
const routeEvents = game.eventLog({ label: "bank shot events", maxEvents: 18 });

const inputOptions = {
  actions: {
    aimLeft: ["KeyA", "ArrowLeft"],
    aimRight: ["KeyD", "ArrowRight"],
    aimFineLeft: ["KeyQ"],
    aimFineRight: ["KeyE"],
    spinUp: ["KeyW", "ArrowUp"],
    spinDown: ["KeyS", "ArrowDown"],
    strike: ["Space"],
    reset: ["KeyR"],
    pause: ["KeyP", "Escape"]
  },
  bufferMs: 100
} as const;

const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: BankShotEvidence | undefined;
let objective = "Aim with A/D, hold Space to charge, release to strike.";

// ---- shot state (adapted from the retired v2 shot-flow settle logic) ----
let shotInFlight = false;
let stalledFrames = 0;
let shootingFrames = 0;
let pottedThisShot: number[] = [];
let lastShotRecord: BankShotEvidence["lastShotRecord"] = null;
let lastStrikeAudio: StrikeAudioParams | null = null;
const ghost = { x: CUE_SPOT[0], z: CUE_SPOT[1] };
const sinkingBalls = new Map<number, number>();
let frame = 0;
let maxAngularSpeed = 0;
const prevQuat = new Map<string, readonly [number, number, number, number]>();
const DIRECTION_AUDIO_EVENTS = new Set(["ball-impact", "cushion", "pocket", "cue-strike", "bed"]);
const requestedAudioEvents = new Set<string>();
const playedAudioEvents = new Set<string>();

const bankShotGame = createGame({
  id: "showcase-bank-shot",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "tabletop",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" },
      { id: "rack", kind: "prompt", anchor: "top-right", label: "RACK" }
    ]
  },
  touch: {
    preset: "aim-drag",
    bindings: {
      charge: "strike",
      confirm: "strike",
      cancel: "reset",
      "stick.left": "aimLeft",
      "stick.right": "aimRight",
      "stick.up": "spinUp",
      "stick.down": "spinDown",
      "rstick.left": "aimFineLeft",
      "rstick.right": "aimFineRight",
      "rstick.up": "spinUp",
      "rstick.down": "spinDown"
    }
  },
  sound: {
    cues: {
      "ball-impact": { id: "ball-impact", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.5 },
      "cushion": { id: "cushion", asset: { url: sfxUrl("impact.wood.light.00") }, volume: 0.35 },
      "pocket": { id: "pocket", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.6 },
      "cue-strike": { id: "cue-strike", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.7 },
      "bed": { id: "bed", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.2, loop: true }
    }
  },
  juice: {
    "cue-strike": { hitStop: 0.02, shake: 0.12 },
    "pocket": { flash: { color: "#e8b45a", peak: 0.18, ms: 220 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      bankShot: () => latestSnapshot ?? { status: "unbound" },
      table: () => latestSnapshot?.table ?? { pottedThisShot: 0, score: 0 },
      balls: () => latestSnapshot?.balls ?? { maxAngularSpeed: 0, liveCount: 0, ballsPocketed: 0, cue: null }
    }
  }
});
const app = bankShotGame.app;
const input = bankShotGame.input;
if (!input) throw new Error("bank-shot failed to create runtime-owned input.");
bankShotGame.start();
app.setOutput?.({ preset: "cinematic-film", exposure: 1.05 });
requestedAudioEvents.add("bed");
void bankShotGame.sound?.cue("bed");

function cueDirection(event: "ball-impact" | "cushion" | "pocket" | "cue-strike"): void {
  requestedAudioEvents.add(event);
  void bankShotGame.sound?.cue(event);
}

function buildScene() {
  const nodes: AuraNodeInput[] = [];

  // PBR material palette (PRD-04 / K4 interior billiard kit)
  const feltMat = material.felt({
    name: "tournament-baize-felt",
    color: "#0f5b3a",
    sheen: 0.85,
    sheenColor: "#3f9f72"
  });
  const cushionFeltMat = material.felt({
    name: "cushion-nose-felt",
    color: "#0c4a2f",
    sheen: 0.8,
    sheenColor: "#358c63"
  });
  const lacquerMat = material.lacquer({
    name: "mahogany-rail-lacquer",
    color: "#4a1912",
    roughness: 0.18,
    clearcoat: 1
  });
  const darkWoodMat = material.lacquer({
    name: "walnut-cabinet-lacquer",
    color: "#2b100b",
    roughness: 0.24,
    clearcoat: 0.88
  });
  const brassMat = material.brushedMetal({
    name: "pocket-collar-brass",
    color: "#d4af37",
    roughness: 0.22
  });
  const leatherMat = material.pbr({
    name: "pocket-well-leather",
    color: "#120c08",
    roughness: 0.82,
    metalness: 0.02
  });
  const floorMat = material.reflectiveFloor({
    name: "billiard-hall-floor",
    color: "#0b0e16",
    roughness: 0.16,
    clearcoat: 0.75
  });
  const shadeGreenMat = material.lacquer({
    name: "pendant-shade-enamel",
    color: "#0d472e",
    roughness: 0.2,
    clearcoat: 0.92
  });
  const bulbGlowMat = material.emissive({
    name: "pendant-bulb-diffuser",
    color: "#fff3d6",
    emissive: "#ffcf86",
    emissiveIntensity: 2.2,
    roughness: 0.18,
    practical: true
  });
  const cueCeramicMat = material.ceramic({
    name: "cue-ball-ceramic",
    color: "#f5f2e8",
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.015
  });
  const aimMat = material.pbr({
    name: "aim-guide-mat",
    color: "#e8b45a",
    roughness: 0.35,
    metalness: 0,
    opacity: 0.62
  });

  // Admitted K4 table model (carries carved legs, chamfered apron, pocket wells & diamond sights).
  nodes.push(
    model(assets.bankShotTable, {
      name: "table-cabinet-glb",
      role: "primaryWorld",
      scaleMode: "world",
      castShadow: false,
      receiveShadow: true
    }).position(0, -0.006, 0).toJSON()
  );

  // Slate bed felt surface at y = 0 (real fabric-normal weave + grazing sheen lobe).
  nodes.push(
    primitives.box({ name: "felt", material: feltMat, castShadow: false, receiveShadow: true })
      .position(0, -0.015, 0)
      .scale([PLAY_HALF_X * 2 + 0.16, 0.03, PLAY_HALF_Z * 2 + 0.16])
      .toJSON()
  );

  // Cushion noses along the inside playfield perimeter.
  nodes.push(
    primitives.box({ name: "cushion-north", material: cushionFeltMat, castShadow: false, receiveShadow: true })
      .position(0, 0.036, -PLAY_HALF_Z - 0.022).scale([PLAY_HALF_X * 2 - 0.12, 0.045, 0.044]).toJSON(),
    primitives.box({ name: "cushion-south", material: cushionFeltMat, castShadow: false, receiveShadow: true })
      .position(0, 0.036, PLAY_HALF_Z + 0.022).scale([PLAY_HALF_X * 2 - 0.12, 0.045, 0.044]).toJSON(),
    primitives.box({ name: "cushion-west", material: cushionFeltMat, castShadow: false, receiveShadow: true })
      .position(-PLAY_HALF_X - 0.022, 0.036, 0).scale([0.044, 0.045, PLAY_HALF_Z * 2 - 0.12]).toJSON(),
    primitives.box({ name: "cushion-east", material: cushionFeltMat, castShadow: false, receiveShadow: true })
      .position(PLAY_HALF_X + 0.022, 0.036, 0).scale([0.044, 0.045, PLAY_HALF_Z * 2 - 0.12]).toJSON()
  );

  // High-gloss mahogany lacquer rails and cabinet apron.
  nodes.push(
    primitives.box({ name: "rail-north", material: lacquerMat, castShadow: true, receiveShadow: true })
      .position(0, 0.065, -PLAY_HALF_Z - 0.135).scale([PLAY_HALF_X * 2 + 0.34, 0.13, 0.19]).toJSON(),
    primitives.box({ name: "rail-south", material: lacquerMat, castShadow: true, receiveShadow: true })
      .position(0, 0.065, PLAY_HALF_Z + 0.135).scale([PLAY_HALF_X * 2 + 0.34, 0.13, 0.19]).toJSON(),
    primitives.box({ name: "rail-west", material: lacquerMat, castShadow: true, receiveShadow: true })
      .position(-PLAY_HALF_X - 0.135, 0.065, 0).scale([0.19, 0.13, PLAY_HALF_Z * 2 + 0.12]).toJSON(),
    primitives.box({ name: "rail-east", material: lacquerMat, castShadow: true, receiveShadow: true })
      .position(PLAY_HALF_X + 0.135, 0.065, 0).scale([0.19, 0.13, PLAY_HALF_Z * 2 + 0.12]).toJSON(),
    primitives.box({ name: "table-body", material: darkWoodMat, castShadow: true, receiveShadow: true })
      .position(0, -0.17, 0).scale([PLAY_HALF_X * 2 + 0.42, 0.24, PLAY_HALF_Z * 2 + 0.42]).toJSON()
  );

  // Brushed-brass corner and side pocket castings + dark leather drop wells.
  for (const pocket of POCKET_CENTERS) {
    const isCorner = pocket.id.startsWith("corner");
    const mouthRadius = isCorner ? 0.155 : 0.135;
    const brassOuter = isCorner ? 0.23 : 0.195;
    const offsetX = pocket.x === 0 ? 0 : Math.sign(pocket.x) * 0.045;
    const offsetZ = Math.sign(pocket.z) * 0.045;
    nodes.push(
      primitives.cylinder({ name: `pocket-${pocket.id}`, material: leatherMat, castShadow: false, receiveShadow: true })
        .position(pocket.x, 0.004, pocket.z).scale([mouthRadius, 0.016, mouthRadius]).toJSON(),
      primitives.cylinder({ name: `pocket-brass-${pocket.id}`, material: brassMat, castShadow: true, receiveShadow: true })
        .position(pocket.x + offsetX, 0.128, pocket.z + offsetZ).scale([brassOuter, 0.024, brassOuter]).toJSON()
    );
  }

  // Reflective dark billiard-hall floor + grounded table footprint shadow.
  nodes.push(
    primitives.box({ name: "hall-floor", material: floorMat, castShadow: false, receiveShadow: true })
      .position(0, -0.83, 0).scale([10, 0.1, 8]).toJSON(),
    shadows.contact({
      name: "table-plinth-shadow",
      position: [0, -0.778, 0],
      footprint: [3.5, 2.25],
      opacity: 0.52,
      color: "#030509"
    }).toJSON()
  );

  // Overhead twin-shade brass billiard pendant lamp suspended in the upper frame.
  nodes.push(
    primitives.cylinder({ name: "pendant-rod-main", material: brassMat, castShadow: false })
      .position(0, 1.38, 0).scale([0.028, 0.96, 0.028]).toJSON(),
    primitives.box({ name: "pendant-crossbar", material: brassMat, castShadow: false })
      .position(0, 0.94, 0).scale([1.18, 0.032, 0.032]).toJSON(),
    primitives.cylinder({ name: "pendant-shade-west", material: shadeGreenMat, castShadow: false })
      .position(-0.46, 0.85, 0).scale([0.46, 0.15, 0.46]).toJSON(),
    primitives.cylinder({ name: "pendant-shade-east", material: shadeGreenMat, castShadow: false })
      .position(0.46, 0.85, 0).scale([0.46, 0.15, 0.46]).toJSON(),
    primitives.torus({ name: "pendant-rim-west", material: brassMat, rotation: [Math.PI / 2, 0, 0], castShadow: false })
      .position(-0.46, 0.78, 0).scale([0.24, 0.24, 0.08]).toJSON(),
    primitives.torus({ name: "pendant-rim-east", material: brassMat, rotation: [Math.PI / 2, 0, 0], castShadow: false })
      .position(0.46, 0.78, 0).scale([0.24, 0.24, 0.08]).toJSON(),
    primitives.sphere({ name: "pendant-bulb-west", material: bulbGlowMat, castShadow: false })
      .position(-0.46, 0.77, 0).scale([0.11, 0.055, 0.11]).toJSON(),
    primitives.sphere({ name: "pendant-bulb-east", material: bulbGlowMat, castShadow: false })
      .position(0.46, 0.77, 0).scale([0.11, 0.055, 0.11]).toJSON()
  );

  // Pool-hall architectural set dressing (mahogany wainscot wall, scoreboard, and cue rack).
  nodes.push(
    primitives.box({ name: "hall-wainscot-north", material: darkWoodMat, castShadow: false, receiveShadow: true })
      .position(0, -0.18, -2.35).scale([8.4, 1.3, 0.14]).toJSON(),
    primitives.box({ name: "hall-wainscot-rail", material: brassMat, castShadow: false, receiveShadow: true })
      .position(0, 0.48, -2.27).scale([8.4, 0.035, 0.06]).toJSON(),
    primitives.box({ name: "hall-scoreboard-frame", material: lacquerMat, castShadow: false, receiveShadow: true })
      .position(-0.55, 0.92, -2.28).scale([1.25, 0.58, 0.07]).toJSON(),
    primitives.box({ name: "hall-scoreboard-slate", material: leatherMat, castShadow: false, receiveShadow: true })
      .position(-0.55, 0.92, -2.24).scale([1.12, 0.46, 0.02]).toJSON(),
    primitives.box({ name: "hall-cue-rack", material: lacquerMat, castShadow: false, receiveShadow: true })
      .position(1.15, 0.68, -2.26).scale([0.65, 1.05, 0.08]).toJSON()
  );

  // 16 billiard balls: ball-00 uses admitted K4 GLB with glazed ceramic coat;
  // balls 01..15 use high-gloss clearcoatPaint spheres with crisp specular reflections.
  nodes.push(
    model(assets.bankShotBall00, {
      name: "ball-00",
      scaleMode: "world",
      material: cueCeramicMat,
      castShadow: true,
      receiveShadow: true
    })
      .position(0, -5, 0)
      .scale(BALL_DIAMETER)
      .runtime(game.runtimeNode("ball-00", { tags: ["physics-synced"] }))
      .toJSON()
  );
  for (let number = 1; number <= 15; number += 1) {
    const name = `ball-${String(number).padStart(2, "0")}`;
    const ballMat = material.clearcoatPaint({
      name: `${name}-clearcoat`,
      color: BALL_COLORS[number]!,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.015
    });
    nodes.push(
      primitives.sphere({
        name,
        material: ballMat,
        castShadow: true,
        receiveShadow: true
      })
        .position(0, -5, 0)
        .scale(BALL_DIAMETER)
        .runtime(game.runtimeNode(name, { tags: ["physics-synced"] }))
        .toJSON()
    );
  }

  // Admitted K4 cue stick model + aim preview geometry.
  nodes.push(
    model(assets.bankShotCue, {
      name: "cue-stick",
      scaleMode: "world",
      castShadow: true,
      receiveShadow: false
    })
      .position(0, -5, 0)
      .scale(1)
      .runtime(game.runtimeNode("cue-stick", { tags: ["cue"] }))
      .toJSON()
  );
  nodes.push(
    primitives.sphere({ name: "cue-ghost", material: aimMat, castShadow: false })
      .position(0, -5, 0)
      .scale(BALL_DIAMETER)
      .runtime(game.runtimeNode("cue-ghost", { tags: ["cue-ghost"] }))
      .toJSON()
  );
  nodes.push(
    primitives.box({ name: "aim-line", material: aimMat, castShadow: false })
      .position(0, -5, 0)
      .scale([1, 0.006, 0.006])
      .runtime(game.runtimeNode("aim-line", { tags: ["aim-preview"] }))
      .toJSON()
  );
  nodes.push(
    primitives.box({ name: "aim-bank", material: aimMat, castShadow: false })
      .position(0, -5, 0)
      .scale([1, 0.005, 0.005])
      .runtime(game.runtimeNode("aim-bank", { tags: ["aim-preview"] }))
      .toJSON()
  );

  // Environment IBL + single shadowed 3000K pendant spot + 2 warm practical point lights.
  nodes.push(
    environments.hdri({
      name: "pool-hall hdri reflections",
      texture: envAssets.poolHallHdr,
      intensity: 0.65,
      background: false
    }).toJSON(),
    lights.spot({
      name: "pendant spot",
      color: "#ffd9a0",
      intensity: 480,
      position: [0, 2.2, 0],
      target: [0, 0, 0],
      angle: 0.78,
      penumbra: 0.52,
      decay: 1.6,
      shadow: true
    }).toJSON(),
    lights.point({
      name: "pendant bulb warm glow",
      color: "#ffcf8c",
      intensity: 1.8,
      distance: 3.2,
      position: [0, 0.74, 0],
      shadow: false
    }).toJSON(),
    lights.point({
      name: "scoreboard wall sconce",
      color: "#e8a858",
      intensity: 1.1,
      distance: 3.5,
      position: [-0.35, 0.85, -1.95],
      shadow: false
    }).toJSON()
  );

  return scene()
    .background("#090c12")
    .camera(camera.perspective({ position: [-1.92, 1.36, 1.66], target: [0.12, -0.02, -0.06], fov: 42 }))
    .addMany(nodes);
}

// ---- runtime node handles --------------------------------------------------
const handles = new Map<string, AuraRuntimeNodeHandle | undefined>();
function handle(name: string): AuraRuntimeNodeHandle | undefined {
  if (!handles.has(name)) {
    try { handles.set(name, app.nodes.require(name)); } catch { handles.set(name, undefined); }
  }
  return handles.get(name);
}
function park(h: AuraRuntimeNodeHandle | undefined): void {
  h?.setVisible(false).setPosition(0, -30, 0);
}
function poseLine(h: AuraRuntimeNodeHandle | undefined, x0: number, z0: number, x1: number, z1: number): void {
  if (!h) return;
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.01) { park(h); return; }
  h.setVisible(true).setPosition((x0 + x1) / 2, BALL_RADIUS, (z0 + z1) / 2)
    .setRotation(0, Math.atan2(-dz, dx), 0).setScale([len, 0.006, 0.006]);
}

// ---- shot flow ---------------------------------------------------------------
function doStrike(): void {
  const command = cueController.strike();
  if (!command || rules.phase !== "aiming") return;
  if (!rules.beginShot()) return;
  if (!sim.strike(command.power, command.angle, command.spin)) { rules.finishResolution(); return; }
  shotInFlight = true; stalledFrames = 0; shootingFrames = 0; pottedThisShot = [];
  lastStrikeAudio = strikeAudioMap(strikeSpeedFor(command.power));
  cueDirection("cue-strike");
  bankShotGame.juice.fire("cue-strike");
  routeEvents.push({ type: "strike", label: "strike", frame });
  objective = "Shot in flight.";
}

function applyOutcome(outcome: ShotOutcome): void {
  if (outcome.rackWon) {
    objective = rules.snapshot().sessionComplete ? "Session clear. Press R to replay." : "Rack clear. Press Space for the next rack.";
    void bankShotGame.hud.banner(rules.snapshot().sessionComplete ? "SESSION CLEAR" : "RACK CLEAR", { holdMs: 2600 });
  } else if (outcome.rackLost) {
    objective = "Rack lost. Press R to rerack.";
    void bankShotGame.hud.banner("RACK LOST", { holdMs: 2200 });
  } else if (outcome.foul) {
    objective = "Foul — ball in hand. Move with A/D/W/S, Space to place.";
    let freeX = CUE_SPOT[0], freeZ = CUE_SPOT[1];
    if (!sim.canPlaceCue(freeX, freeZ)) {
      outer: for (let r = 0.05; r <= 0.8; r += 0.05) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const tx = CUE_SPOT[0] + Math.cos(a) * r, tz = CUE_SPOT[1] + Math.sin(a) * r;
          if (sim.canPlaceCue(tx, tz)) { freeX = tx; freeZ = tz; break outer; }
        }
      }
    }
    ghost.x = freeX; ghost.z = freeZ;
  } else if (outcome.pottedLegal.length > 0) {
    objective = `Potted ${outcome.pottedLegal.join(", ")}. Aim the next shot.`;
  } else {
    objective = "Aim with A/D, hold Space to charge, release to strike.";
  }
  routeEvents.push({ type: outcome.foul ? "foul" : "resolve", label: outcome.foul ? "foul" : "resolve", frame });
}

function resolveShotNow(): void {
  if (!shotInFlight) return;
  const facts = sim.shotFacts();
  const record: ShotRecord = {
    firstContact: facts.firstContact,
    cushionAfterContact: facts.cushionAfterContact,
    potted: [...pottedThisShot]
  };
  // Determinism proof: FNV-1a hash (salvaged table.hashString) of the record.
  lastShotRecord = { ...record, hash: hashString(JSON.stringify(record)) };
  const outcome = rules.resolveShot(record);
  rules.finishResolution();
  shotInFlight = false; pottedThisShot = []; stalledFrames = 0;
  applyOutcome(outcome);
}

function resetSession(): void {
  rules.rerack(); sim.resetRack(); cueController.cancelCharge();
  shotInFlight = false; pottedThisShot = []; lastShotRecord = null; maxAngularSpeed = 0;
  ghost.x = CUE_SPOT[0]; ghost.z = CUE_SPOT[1];
  objective = "Aim with A/D, hold Space to charge, release to strike.";
  routeEvents.push({ type: "reset", label: "reset", frame });
}

function consumeShotEvents(): void {
  for (const fact of sim.consumeShotFactEvents()) {
    if (fact.type === "cue-first-contact") cueDirection("ball-impact");
    else cueDirection("cushion");
  }
  for (const impact of sim.consumeImpacts()) {
    if (impact.kind === "ball-ball" && impact.speed > 0.6) cueDirection("ball-impact");
  }
  for (const pot of sim.consumePotEvents()) {
    pottedThisShot.push(pot.ball);
    sinkingBalls.set(pot.ball, performance.now());
    cueDirection("pocket");
    bankShotGame.juice.fire("pocket");
    routeEvents.push({ type: "pocket", label: `pocket:${pot.ball}`, frame });
  }
}



// ---- visual sync -------------------------------------------------------------
function syncVisuals(): void {
  const snap = rules.snapshot();
  for (const pose of sim.poses()) {
    const h = handle(pose.name);
    if (!h) continue;
    const number = Number(pose.name.slice(5));
    if (snap.potted.includes(number) || pose.position[1] < -1) {
      const t0 = sinkingBalls.get(number);
      if (t0 !== undefined && pose.position[1] > -1) {
        const t = (performance.now() - t0) / 120;
        if (t < 1) h.setVisible(true).setPosition(pose.position[0], pose.position[1] - 0.06 * t, pose.position[2]);
        else { park(h); sinkingBalls.delete(number); }
      } else park(h);
      prevQuat.delete(pose.name);
      continue;
    }
    h.setVisible(true).setScale(BALL_DIAMETER)
      .setPosition(pose.position[0], pose.position[1], pose.position[2])
      .setRotation(...ballEulerFromBody(pose.rotation));
    const prev = prevQuat.get(pose.name);
    if (prev) {
      const dot = Math.abs(prev[0] * pose.rotation[0] + prev[1] * pose.rotation[1] + prev[2] * pose.rotation[2] + prev[3] * pose.rotation[3]);
      const speed = 2 * Math.acos(Math.min(1, dot)) * 60;
      if (speed > maxAngularSpeed) maxAngularSpeed = speed;
    }
    prevQuat.set(pose.name, pose.rotation);
  }
  const cueInfo = sim.ballInfos().find((b) => b.number === 0);
  const cueStick = handle("cue-stick"), aimLine = handle("aim-line"), aimBank = handle("aim-bank"), cueGhost = handle("cue-ghost");
  if (!cueInfo?.live || rules.phase === "rack-won" || rules.phase === "rack-lost" || rules.phase === "shooting") {
    park(cueStick); park(aimLine); park(aimBank); park(cueGhost);
    return;
  }
  if (rules.phase === "ball-in-hand") {
    park(cueStick); park(aimLine); park(aimBank);
    cueGhost?.setVisible(true).setScale(BALL_DIAMETER).setPosition(ghost.x, BALL_RADIUS, ghost.z);
    return;
  }
  park(cueGhost);
  const angle = cueController.aimAngle;
  const dirX = Math.cos(angle), dirZ = Math.sin(angle);
  const pullback = 0.055 + cueController.state().charge * 0.3;
  // Cue stick GLB: tip at local origin, shaft along -X, strike axis +X.
  cueStick?.setVisible(true).setScale(1)
    .setPosition(cueInfo.x - dirX * pullback, BALL_RADIUS + 0.014, cueInfo.z - dirZ * pullback)
    .setRotation(0, -angle, 0);
  const sweep = sim.sweepFromCue(angle);
  poseLine(aimLine, cueInfo.x, cueInfo.z, sweep.ghostX, sweep.ghostZ);
  if (sweep.kind === "cushion") {
    const dot = dirX * sweep.normalX + dirZ * sweep.normalZ;
    poseLine(aimBank, sweep.ghostX, sweep.ghostZ,
      sweep.ghostX + (dirX - 2 * dot * sweep.normalX) * 0.45,
      sweep.ghostZ + (dirZ - 2 * dot * sweep.normalZ) * 0.45);
  } else park(aimBank);
}

// ---- HUD + evidence ------------------------------------------------------------
function syncHud(): void {
  const snap = rules.snapshot();
  bankShotGame.hud.set("score", snap.score);
  bankShotGame.hud.set("objective", objective);
  bankShotGame.hud.set("rack", `RACK ${snap.rack} · ${snap.phase.toUpperCase()} · SUNK ${snap.potted.join(" ") || "-"}`);
}

function publishEvidence(): void {
  const snap = rules.snapshot();
  const cueInfo = sim.ballInfos().find((b) => b.number === 0);
  const diagnostics = app.diagnostics();
  const sound = bankShotGame.sound?.evidence;
  for (const node of sound?.playingNodes ?? []) {
    if (DIRECTION_AUDIO_EVENTS.has(node.cue)) playedAudioEvents.add(node.cue);
  }
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score: snap.score,
      objective,
      events: routeEvents.events().map((e: { readonly label: string }) => e.label)
    },
    assets: { typedAssets: 3, missingAssets: [] },
    source: { expectsGame: true }
  });
  const snapshot: BankShotEvidence = {
    framed: diagnostics.drawCalls > 0 && sim.liveBallCount() > 0,
    frame,
    state: snap.phase,
    look: { id: LOOK_ID },
    table: {
      rack: snap.rack, phase: snap.phase, score: snap.score, suit: snap.suit,
      fouls: snap.fouls, ballsRemaining: snap.ballsRemaining, clockMs: snap.clockMs,
      potted: snap.potted, pottedThisShot: pottedThisShot.length,
      sessionComplete: snap.sessionComplete, shotCount: snap.shotCount, backend: sim.backend
    },
    balls: {
      liveCount: sim.liveBallCount(),
      ballsPocketed: snap.potted.length,
      maxAngularSpeed,
      cue: cueInfo ? { x: cueInfo.x, z: cueInfo.z, speed: cueInfo.speed } : null
    },
    aim: cueController.state(),
    currentShot: { inFlight: shotInFlight, frames: shootingFrames },
    lastShotRecord,
    poseHash: sim.poseHash(),
    freshRackHash,
    drawCalls: diagnostics.drawCalls,
    events: routeEvents.events().map((e: { readonly label: string }) => e.label),
    audio: {
      requestedEvents: [...requestedAudioEvents].sort(),
      playedEvents: [...playedAudioEvents].sort(),
      playedCueCount: sound?.playedCueCount ?? 0,
      suppressedCueCount: sound?.suppressedCueCount ?? 0,
      synthCues: 0,
      contextState: sound?.contextState ?? "none",
      unlocked: sound?.unlocked ?? false,
      lastStrike: lastStrikeAudio
    },
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

// ---- frame loop ------------------------------------------------------------------
app.onFrame(({ dt }) => {
  frame += 1;
  (bankShotGame.touch as { update?: () => void } | null)?.update?.();
  const paused = bankShotGame.session.paused;
  if (!paused) {
    if (input.pressed("reset")) resetSession();
    cueController.updateCharge(dt);
    if (rules.phase === "aiming") {
      if (input.held("aimLeft")) cueController.aimBy(-AIM_STEP);
      if (input.held("aimRight")) cueController.aimBy(AIM_STEP);
      if (input.held("aimFineLeft")) cueController.aimBy(-AIM_STEP * 0.25);
      if (input.held("aimFineRight")) cueController.aimBy(AIM_STEP * 0.25);
      if (input.held("spinUp")) cueController.spinBy(SPIN_STEP);
      if (input.held("spinDown")) cueController.spinBy(-SPIN_STEP);
      if (input.pressed("strike") && !cueController.charging && sim.cueAtRest()) cueController.beginCharge();
      if (input.released("strike") && cueController.charging) doStrike();
    } else if (rules.phase === "ball-in-hand") {
      const step = 0.03, m = BALL_RADIUS + 0.02;
      if (input.held("aimLeft") || input.held("aimFineLeft")) ghost.x = Math.max(-PLAY_HALF_X + m, ghost.x - step);
      if (input.held("aimRight") || input.held("aimFineRight")) ghost.x = Math.min(PLAY_HALF_X - m, ghost.x + step);
      if (input.held("spinUp")) ghost.z = Math.max(-PLAY_HALF_Z + m, ghost.z - step);
      if (input.held("spinDown")) ghost.z = Math.min(PLAY_HALF_Z - m, ghost.z + step);
      if (input.pressed("strike") && sim.canPlaceCue(ghost.x, ghost.z)) {
        if (sim.restoreCueAt(ghost.x, ghost.z) && rules.confirmBallInHand()) {
          objective = "Ball in hand placed. Aim the next shot.";
        }
      }
    } else if (rules.phase === "rack-won" && input.pressed("strike")) {
      rules.advanceRack(); sim.resetRack();
      objective = `Rack ${rules.snapshot().rack}. Aim the break.`;
    }
    if (rules.phase === "shooting" && shotInFlight) {
      sim.stepFixed(1);
      consumeShotEvents();
      shootingFrames += 1;
      stalledFrames = sim.allAtRest(0.08) ? stalledFrames + 1 : 0;
      if (stalledFrames >= 18 || shootingFrames >= 300) resolveShotNow();
    }
    if (rules.tickClock(dt * 1000)) {
      objective = "Clock expired — rack lost. Press R to rerack.";
      void bankShotGame.hud.banner("RACK LOST", { holdMs: 2200 });
    }
  }
  syncVisuals();
  if (frame % 6 === 0) syncHud();
  publishEvidence();
});

// Optional deterministic fixtures (?scenario=pocket|foul|eight-finish|rack-fail)
// resolve fixed ShotRecords through the real RulesEngine (salvaged scenarios).
const scenario = new URL(location.href).searchParams.get("scenario");
if (scenario) {
  applyBankShotScenario(scenario, {
    rules, sim, applyOutcome,
    sync: () => { syncVisuals(); syncHud(); publishEvidence(); }
  });
}
syncVisuals();
syncHud();
publishEvidence();
