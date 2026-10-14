/**
 * Neon Swarm — single-path rebuild on the salvaged gameplay core.
 *
 * Every URL boots this module; the former legacy/v2 dual-path dispatcher is
 * retired. All wave scheduling, boid steering, spatial hash separation, elite
 * telegraph/burst cycles, risky pickups, intermission upgrade doors, and
 * deterministic outcome hashing come from `./gameplay/{arena,swarm,waves,player,pickups,run}`.
 */
import {
  camera,
  effects,
  environments,
  game as engineGame,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  sky,
  type AuraCameraPose,
  type AuraCameraRig,
  type AuraCameraRigContext,
  type AuraNodeInput,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  createGame,
  lookManifest,
  type GameHudMountOptions
} from "@aura3d/engine/game";
import direction from "../art/direction";
import { assets } from "./aura-assets";
import { createArenaLayout, playRect, spawnPointOnEdge, type ArenaBounds } from "./gameplay/arena";
import {
  PICKUP_DOORS,
  riskPickupForWave,
  sensePickupDoors,
  senseRiskPickup,
  type PickupKind
} from "./gameplay/pickups";
import {
  DEFAULT_PLAYER_TUNING,
  PLAYER_RADIUS,
  applyContactDamage,
  createPlayerState,
  createPlayerUpgrades,
  stepPlayer,
  type PlayerState,
  type PlayerUpgrades
} from "./gameplay/player";
import {
  FINALE_SURVIVAL_SECONDS,
  MAX_CAMPAIGN_WAVES,
  arenaInsetForWave,
  campaignStage,
  outcomeHash,
  stateAfterWaveClear,
  upgradedPlayer,
  type CampaignStage
} from "./gameplay/run";
import {
  DRONE_CONTACT_DAMAGE_PER_SECOND,
  ELITE_POOL_CAPACITY,
  GRUNT_POOL_CAPACITY,
  createSwarmSimulation
} from "./gameplay/swarm";
import {
  INTERMISSION_SECONDS,
  isEliteWave,
  scheduleChecksum,
  waveSpawnSchedule,
  waveSpec,
  type SpawnEvent
} from "./gameplay/waves";

export type RunState = "booting" | "intermission" | "wave-active" | "complete" | "dead";
export type SwarmPhase = "playing" | "intermission" | "victory" | "defeat";

export interface NeonSwarmEvidence {
  readonly schema: "aura3d-showcase-neon-swarm/2.0";
  readonly framed: boolean;
  readonly mounted: boolean;
  readonly appId: "showcase-neon-swarm";
  readonly status: "ready";
  readonly state: RunState;
  readonly phase: SwarmPhase;
  readonly sessionState: string;
  readonly frame: number;
  readonly wave: {
    readonly index: number;
    readonly total: number;
    readonly label: CampaignStage;
    readonly inset: number;
    readonly elapsed: number;
    readonly remaining: number;
    readonly spawnedCount: number;
  };
  readonly stage: CampaignStage;
  readonly arenaInset: number;
  readonly finaleSurvivalRemaining: number;
  readonly outcomeHash: string | null;
  readonly seed: number;
  readonly paused: boolean;
  readonly alive: number;
  readonly aliveGrunt: number;
  readonly aliveElite: number;
  readonly instanceCount: number;
  readonly drawCalls: number;
  readonly score: number;
  readonly bestScore: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly comboBreaks: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly kills: number;
  readonly killsThisWave: number;
  readonly burstCharge: number;
  readonly bursts: number;
  readonly grazes: number;
  readonly damageEvents: number;
  readonly pulsesFired: number;
  readonly dashesTriggered: number;
  readonly pickupActive: boolean;
  readonly pickupPosition: { readonly x: number; readonly z: number };
  readonly pickupsCollected: number;
  readonly pickup: {
    readonly active: boolean;
    readonly collected: boolean;
    readonly position: readonly [number, number, number];
  };
  readonly chosenDoor: PickupKind | null;
  readonly waveChecksum: number;
  readonly waveChecksums: readonly number[];
  readonly upgrades: {
    readonly fireRateMultiplier: number;
    readonly dashCooldownMultiplier: number;
    readonly shieldCharges: number;
    readonly fireRateLevel: number;
    readonly dashCooldownLevel: number;
    readonly chosen: readonly PickupKind[];
  };
  readonly playerPosition: { readonly x: number; readonly z: number };
  readonly player: {
    readonly position: readonly [number, number, number];
    readonly x: number;
    readonly z: number;
    readonly vx: number;
    readonly vz: number;
    readonly aimX: number;
    readonly aimZ: number;
    readonly yaw: number;
    readonly hp: number;
    readonly maxHp: number;
    readonly dashing: boolean;
    readonly invulnerable: boolean;
    readonly burstCharge: number;
  };
  readonly enemies: {
    readonly activeTotal: number;
    readonly activeGrunts: number;
    readonly activeElites: number;
    readonly gruntCapacity: number;
    readonly eliteCapacity: number;
  };
  readonly swarm: {
    readonly wave: number;
    readonly stage: CampaignStage;
    readonly alive: number;
    readonly aliveGrunt: number;
    readonly aliveElite: number;
    readonly kills: number;
    readonly killsThisWave: number;
    readonly grazes: number;
    readonly bursts: number;
    readonly burstCharge: number;
    readonly pulsesFired: number;
    readonly dashesTriggered: number;
  };
  readonly fx: {
    readonly liveCount: number;
  };
  readonly framing: {
    readonly rig: "neon-swarm.overhead";
    readonly fovDeg: number;
    readonly subjectHeightFraction: number;
    readonly withinBand: boolean;
    readonly mobileLandscape: boolean;
  };
  readonly look: { readonly id: string; readonly category: string };
  readonly appliedLook: Record<string, unknown>;
  readonly audio: {
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly contextState: string;
    readonly unlocked: boolean;
  };
  readonly events: readonly string[];
  readonly evidence: unknown;
}

export interface NeonSwarmDebugApi {
  snapshot(): NeonSwarmEvidence;
  reset(nextSeed?: number): NeonSwarmEvidence;
  collectPickup(): NeonSwarmEvidence;
  chooseUpgrade(kind: PickupKind): NeonSwarmEvidence;
  fireBurst(): NeonSwarmEvidence;
  stepFixed(frames: number, dtSeconds?: number): void;
  startWaveNow(): void;
  drainPlayerHp(): void;
  chooseDoor(kind: PickupKind): void;
  spawnTestSwarm(total: number): void;
  stageKillCluster(count?: number): void;
  jumpToWave(target: number): void;
  clearActiveWave(): void;
  finishFinale(): void;
  resetWithSeed(value: number): void;
  stageGraze(): void;
  stageBurstCluster(count?: number): void;
  stagePickupAtPlayer(): void;
  stageContact(): void;
  placePlayer(x: number, z: number): void;
}

declare global {
  interface Window {
    __aura3dGameSnapshot?: NeonSwarmEvidence;
    __aura3dGameDebug?: NeonSwarmDebugApi;
  }
}

const LOOK_ID = "neon-arcade" as const;
const SEED_DEFAULT = 20260821;
const COMBO_WINDOW_SECONDS = 2.4;
const PULSE_BASE_RADIUS = 3.6;
const PULSE_BASE_DAMAGE = 2;
const BURST_RADIUS = 9.4;
const BURST_DAMAGE = 6;
const SPARK_POOL_CAPACITY = 48;
const BEST_KEY = "neon-swarm-best-score";
const PICKUP_SCORE_BONUS = 250;
const PICKUP_BURST_BONUS = 0.25;

const arenaLayout = createArenaLayout();
const swarm = createSwarmSimulation();
const player: PlayerState = createPlayerState(6);
const upgrades: PlayerUpgrades = createPlayerUpgrades();
let fireRateLevel = 0;
let dashCooldownLevel = 0;
let chosenUpgrades: PickupKind[] = [];

const sparkTransforms: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}[] = Array.from({ length: SPARK_POOL_CAPACITY }, () => ({
  position: [0, -10, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: [0.001, 0.001, 0.001] as [number, number, number]
}));
const sparkColors = Array.from({ length: SPARK_POOL_CAPACITY }, (_, index) =>
  index % 2 === 0 ? "#35e0ff" : "#ff8ae0"
);
const sparkRemaining = new Float32Array(SPARK_POOL_CAPACITY);
const sparkVx = new Float32Array(SPARK_POOL_CAPACITY);
const sparkVy = new Float32Array(SPARK_POOL_CAPACITY);
const sparkVz = new Float32Array(SPARK_POOL_CAPACITY);
let sparkCursor = 0;

let runState: RunState = "wave-active";
let frame = 0;
let wave = 1;
let stage: CampaignStage = "opening";
let arenaInset = 0;
let finaleSurvivalRemaining = FINALE_SURVIVAL_SECONDS;
let terminalOutcomeHash: string | null = null;
let seed = SEED_DEFAULT;
let score = 0;
let bestScore = readBestScore();
let kills = 0;
let killsThisWave = 0;
let combo = 0;
let maxCombo = 0;
let comboDecayRemaining = 0;
let comboBreaks = 0;
let intermissionRemaining = 0;
let waveElapsed = 0;
let schedule: readonly SpawnEvent[] = [];
let spawnedCount = 0;
let waveChecksum = 0;
let waveChecksums: number[] = [];
let chosenDoor: PickupKind | null = null;
let burstCharge = 0.35;
let bursts = 0;
let grazes = 0;
let grazeAccumulator = 0;
let damageEvents = 0;
let pulsesFired = 0;
let dashesTriggered = 0;
let pickupActive = true;
let pickupPosition = riskPickupForWave(1);
let pickupsCollected = 0;
let pulseVisualRemaining = 0;
let burstVisualRemaining = 0;
let fxBurstTimer = 0;
let fxBurstParticles = 0;
let hasPlayerActed = false;
let pointerAimActive = false;
let pointerAim = { x: 0, z: -1 };
let pointerFireHeld = false;
let autorunEnabled = false;

function readBestScore(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeBestScore(value: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* localStorage persistence is best-effort */
  }
}

function playerYaw(): number {
  return Math.atan2(player.aimX, player.aimZ);
}

function phaseForRunState(state: RunState): SwarmPhase {
  if (state === "intermission") return "intermission";
  if (state === "complete") return "victory";
  if (state === "dead") return "defeat";
  return "playing";
}

// ------------------------------------------------------------ camera rig -----

interface SwarmRigState {
  playerX: number;
  playerZ: number;
  aimX: number;
  aimZ: number;
  aliveCount: number;
  mobile: boolean;
}

const rigState: SwarmRigState = {
  playerX: 0,
  playerZ: 3,
  aimX: 0,
  aimZ: -1,
  aliveCount: 0,
  mobile: typeof window !== "undefined" && window.innerWidth < 640
};
let rigLastFov = 40;

function createSwarmRig(state: SwarmRigState): AuraCameraRig {
  let smoothX = state.playerX * 0.6;
  let smoothZ = state.playerZ * 0.6;
  let smoothFov = 40;
  return {
    id: "neon-swarm.overhead",
    reset: () => {
      smoothX = state.playerX * 0.6;
      smoothZ = state.playerZ * 0.6;
      smoothFov = 40;
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const blend = Math.min(1, dt * 8);
      const lead = 1.25;
      const targetX = state.playerX * 0.6 + state.aimX * lead;
      const targetZ = state.playerZ * 0.6 + state.aimZ * lead;
      smoothX += (targetX - smoothX) * blend;
      smoothZ += (targetZ - smoothZ) * blend;
      const crowdRatio = Math.min(1, state.aliveCount / 160);
      const desiredFov = 39.5 + crowdRatio * 3.0;
      smoothFov += (desiredFov - smoothFov) * Math.min(1, dt * 4);
      rigLastFov = Math.min(45, Math.max(35, smoothFov));
      const altitude = state.mobile ? 14.4 : 13.5;
      const zBack = state.mobile ? 12.2 : 11.5;
      return {
        position: [smoothX, altitude, smoothZ + zBack],
        target: [smoothX, 0.45, smoothZ - 0.6],
        up: [0, 1, 0],
        roll: 0,
        fov: rigLastFov,
        near: 0.2,
        far: 160
      };
    }
  };
}

// ----------------------------------------------------------------- scene -----

function buildLaneGridNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  const cyanStripMat = material.neon({
    name: "neon-grid-cyan",
    color: "#082f49",
    emissive: "#38bdf8",
    emissiveIntensity: 2.8,
    practical: true
  });
  const magentaStripMat = material.neon({
    name: "neon-grid-magenta",
    color: "#4a044e",
    emissive: "#ec4899",
    emissiveIntensity: 2.6,
    practical: true
  });
  for (let i = -3; i <= 3; i += 1) {
    nodes.push(
      primitives.box({
        name: `plaza-grid-x-${i + 4}`,
        material: i % 2 === 0 ? cyanStripMat : magentaStripMat
      })
        .position(i * 6.5, 0.03, 0)
        .scale([0.24, 0.05, 32])
        .toJSON()
    );
  }
  for (let j = -2; j <= 2; j += 1) {
    nodes.push(
      primitives.box({
        name: `plaza-grid-z-${j + 3}`,
        material: j % 2 === 0 ? magentaStripMat : cyanStripMat
      })
        .position(0, 0.032, j * 6.2)
        .scale([48, 0.05, 0.24])
        .toJSON()
    );
  }
  nodes.push(
    primitives.torus({
      name: "plaza-inner-cyber-ring",
      material: cyanStripMat
    })
      .position(0, 0.04, 1.5)
      .rotate(Math.PI / 2, 0, 0)
      .scale([4.8, 4.8, 0.22])
      .toJSON(),
    primitives.torus({
      name: "plaza-outer-cyber-ring",
      material: magentaStripMat
    })
      .position(0, 0.038, 1.5)
      .rotate(Math.PI / 2, 0, 0)
      .scale([9.2, 9.2, 0.18])
      .toJSON()
  );
  return nodes;
}

function buildPerimeterAndPylonNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  const wallMetalMat = material.brushedMetal({
    name: "arena-wall-brushed-metal",
    color: "#1e293b",
    roughness: 0.24,
    anisotropy: 0.85
  });
  const shieldGlassMat = material.frostedGlass({
    name: "arena-energy-shield",
    color: "#38bdf8",
    opacity: 0.42
  });
  const cyberTrimCyanMat = material.neon({
    name: "arena-cyber-trim-cyan",
    color: "#082f49",
    emissive: "#38bdf8",
    emissiveIntensity: 2.9,
    practical: true
  });
  const cyberTrimMagentaMat = material.neon({
    name: "arena-cyber-trim-magenta",
    color: "#4a044e",
    emissive: "#ec4899",
    emissiveIntensity: 2.8,
    practical: true
  });
  const pylonChromeMat = material.chrome({
    name: "swarm-arena-pylon-chrome",
    color: "#38bdf8"
  });

  // 3D perimeter containment walls + translucent frostedGlass energy shields + neon cyber trim
  const wallSpecs = [
    { id: "north", x: 0, z: -16.8, sx: 53.2, sz: 0.9, trimMat: cyberTrimCyanMat },
    { id: "south", x: 0, z: 16.8, sx: 53.2, sz: 0.9, trimMat: cyberTrimMagentaMat },
    { id: "west", x: -25.8, z: 0, sx: 0.9, sz: 34.4, trimMat: cyberTrimCyanMat },
    { id: "east", x: 25.8, z: 0, sx: 0.9, sz: 34.4, trimMat: cyberTrimMagentaMat }
  ] as const;

  for (const w of wallSpecs) {
    nodes.push(
      primitives.box({
        name: `arena-perimeter-wall-${w.id}`,
        material: wallMetalMat
      })
        .position(w.x, 0.75, w.z)
        .scale([w.sx, 1.5, w.sz])
        .toJSON(),
      primitives.box({
        name: `arena-perimeter-shield-${w.id}`,
        material: shieldGlassMat
      })
        .position(w.x, 1.85, w.z)
        .scale([w.sx * 0.98, 1.15, Math.max(0.28, w.sz * 0.42)])
        .toJSON(),
      primitives.box({
        name: `arena-perimeter-trim-${w.id}`,
        material: w.trimMat
      })
        .position(w.x, 1.54, w.z)
        .scale([w.sx, 0.16, Math.max(0.36, w.sz * 0.55)])
        .toJSON()
    );
  }

  // Octagonal corner bumpers & central arena bumpers
  const bumperCoords = [
    [-23.5, -14.5],
    [23.5, -14.5],
    [-23.5, 14.5],
    [23.5, 14.5],
    [-16.5, 0],
    [16.5, 0]
  ] as const;
  for (let i = 0; i < bumperCoords.length; i += 1) {
    const [bx, bz] = bumperCoords[i]!;
    nodes.push(
      primitives.cylinder({
        name: `arena-octagonal-bumper-${i}`,
        material: wallMetalMat
      })
        .position(bx, 0.85, bz)
        .scale([2.2, 1.7, 2.2])
        .toJSON(),
      primitives.torus({
        name: `arena-bumper-trim-${i}`,
        material: i % 2 === 0 ? cyberTrimCyanMat : cyberTrimMagentaMat
      })
        .position(bx, 1.45, bz)
        .rotate(Math.PI / 2, 0, 0)
        .scale([1.28, 1.28, 0.26])
        .toJSON()
    );
  }

  // Cover pylons (swarmArenaPylon) around each obstacle barricade
  arenaLayout.obstacles.forEach((obstacle, index) => {
    nodes.push(
      primitives.cylinder({
        name: `swarm-arena-pylon-base-${index}`,
        material: wallMetalMat
      })
        .position(obstacle.x, 0.28, obstacle.z)
        .scale([2.15, 0.56, 2.15])
        .toJSON(),
      primitives.box({
        name: `swarm-arena-pylon-shield-${index}`,
        material: shieldGlassMat
      })
        .position(obstacle.x, 1.18, obstacle.z)
        .rotate(0, obstacle.rotationY, 0)
        .scale([2.35, 1.65, 0.34])
        .toJSON(),
      primitives.box({
        name: `swarm-arena-pylon-trim-${index}`,
        material: index % 2 === 0 ? cyberTrimCyanMat : cyberTrimMagentaMat
      })
        .position(obstacle.x, 2.04, obstacle.z)
        .rotate(0, obstacle.rotationY, 0)
        .scale([2.42, 0.16, 0.42])
        .toJSON(),
      primitives.cylinder({
        name: `swarm-arena-pylon-core-${index}`,
        material: pylonChromeMat
      })
        .position(obstacle.x, 1.15, obstacle.z)
        .scale([0.62, 2.1, 0.62])
        .toJSON()
    );
  });

  return nodes;
}

function buildScene() {
  const floorMat = material.reflectiveFloor({
    name: "night-plaza-asphalt",
    color: "#060b16",
    roughness: 0.1,
    metallic: 0.48,
    clearcoat: 0.9,
    clearcoatRoughness: 0.04
  });
  const outerApronMat = material.brushedMetal({
    name: "night-plaza-apron",
    color: "#1e293b",
    roughness: 0.24,
    anisotropy: 0.85
  });
  const boundaryMat = material.neon({
    name: "arena-pressure-rail",
    color: "#3c162b",
    emissive: "#f97316",
    emissiveIntensity: 2.8,
    practical: true
  });
  const pickupMat = material.neon({
    name: "risk-pickup-beacon",
    color: "#422006",
    emissive: "#ffc857",
    emissiveIntensity: 3.0,
    practical: true
  });
  const doorMat = material.neon({
    name: "upgrade-door-ring",
    color: "#4a044e",
    emissive: "#ff8ae0",
    emissiveIntensity: 2.8,
    practical: true
  });
  const pulseRingMat = material.neon({
    name: "courier-pulse-ring",
    color: "#082f49",
    emissive: "#35e0ff",
    emissiveIntensity: 2.6,
    practical: true
  });
  const burstWaveMat = material.neon({
    name: "courier-burst-wave",
    color: "#422006",
    emissive: "#ffc857",
    emissiveIntensity: 3.2,
    practical: true
  });
  const aimVectorMat = material.neon({
    name: "courier-aim-vector",
    color: "#082f49",
    emissive: "#38bdf8",
    emissiveIntensity: 2.8,
    practical: true
  });
  const playerShipChromeMat = material.chrome({
    name: "swarm-player-ship-chrome",
    color: "#38bdf8"
  });
  const playerShipPaintMat = material.carPaint({
    name: "swarm-player-ship-paint",
    color: "#ec4899"
  });
  const playerShipCanopyMat = material.frostedGlass({
    name: "swarm-player-ship-canopy",
    color: "#38bdf8",
    opacity: 0.42
  });
  const playerShipCoreMat = material.neon({
    name: "swarm-player-ship-core",
    color: "#082f49",
    emissive: "#38bdf8",
    emissiveIntensity: 3.0,
    practical: true
  });

  const barricadeNodes: AuraNodeInput[] = arenaLayout.obstacles.map((obstacle, index) =>
    model(assets.neonBarricadeProp, {
      name: `street-barricade-${index}`,
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 3.1,
      castShadow: true,
      receiveShadow: true
    })
      .position(obstacle.x, 0, obstacle.z)
      .rotate(0, obstacle.rotationY, 0)
      .runtime(engineGame.runtimeNode(`neon-barricade-${index}`, { tags: ["obstacle", "typed-asset"] }))
      .toJSON()
  );

  const lampNodes: AuraNodeInput[] = arenaLayout.lamps.map((lamp, index) =>
    model(assets.neonStreetLampProp, {
      name: `street-lamp-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 4.8,
      castShadow: false,
      receiveShadow: true
    })
      .position(lamp.x, 0, lamp.z)
      .runtime(engineGame.runtimeNode(`neon-lamp-${index}`, { tags: ["landmark", "typed-asset"] }))
      .toJSON()
  );

  const doorNodes: AuraNodeInput[] = PICKUP_DOORS.map((door) =>
    primitives.torus({
      name: `pickup-gate-${door.kind}`,
      material: doorMat
    })
      .position(door.x, -8, door.z)
      .rotate(Math.PI / 2, 0, 0)
      .scale([1.25, 1.25, 0.42])
      .runtime(engineGame.runtimeNode(`pickup-gate-${door.kind}`, { tags: ["pickup-sensor", "upgrade-door"] }))
      .toJSON()
  );

  const boundaryNodes: AuraNodeInput[] = (["north", "south", "east", "west"] as const).map((edge) =>
    primitives.box({
      name: `arena-pressure-${edge}`,
      material: boundaryMat
    })
      .position(0, 0.22, 0)
      .scale([1, 0.36, 1])
      .runtime(engineGame.runtimeNode(`arena-pressure-${edge}`, { tags: ["arena-boundary", "danger"] }))
      .toJSON()
  );

  return scene()
    .background("#0f172a")
    .camera(
      camera.perspective({
        position: [0, 13.5, 11.5],
        target: [0, 0.45, 0.8],
        fov: 40
      })
    )
    .add(
      sky.gradient({
        name: "cyber-noir-sky",
        zenith: "#040711",
        horizon: "#0f172a",
        ground: "#1e1b4b",
        horizonGlow: 0.48,
        bands: [
          { elevationDeg: 10, widthDeg: 16, color: "#1e1b4b", intensity: 0.75 },
          { elevationDeg: 3, widthDeg: 7, color: "#38bdf8", intensity: 0.34 }
        ]
      })
    )
    .add(
      effects.fog({
        name: "cyber-noir-exp-fog",
        color: "#0f172a",
        density: 0.014,
        intensity: 0.58
      })
    )
    .add(
      primitives.box({
        name: "night-plaza-apron-slab",
        material: outerApronMat
      })
        .position(0, -0.32, 0)
        .scale([82, 0.4, 60])
    )
    .add(
      primitives.box({
        name: "night-plaza-floor",
        material: floorMat
      })
        .position(0, -0.12, 0)
        .scale([52, 0.24, 34])
    )
    .addMany(buildLaneGridNodes())
    .addMany(buildPerimeterAndPylonNodes())
    .addMany(barricadeNodes)
    .addMany(lampNodes)
    .addMany(doorNodes)
    .addMany(boundaryNodes)
    .add(
      primitives.sphere({
        name: "risk-pickup-node",
        material: pickupMat
      })
        .position(pickupPosition.x, 0.85, pickupPosition.z)
        .scale([0.92, 0.92, 0.92])
        .runtime(engineGame.runtimeNode("swarm-pickup", { tags: ["pickup", "collectible", "gameplay-state"] }))
    )
    .add(
      model(assets.neonCourierAvatar, {
        name: "courier-avatar",
        role: "primaryCharacter",
        scaleMode: "fit",
        targetHeight: 2.65,
        castShadow: true,
        receiveShadow: true
      })
        .position(0, 0, 3)
        .runtime(engineGame.runtimeNode("neon-player", { tags: ["primary-actor", "typed-primary-asset"] }))
    )
    .add(
      primitives.cylinder({
        name: "courier-craft-hull",
        material: playerShipChromeMat
      })
        .position(0, 0.38, 3)
        .scale([1.75, 0.34, 2.15])
        .runtime(engineGame.runtimeNode("swarm-player-ship-hull", { tags: ["player-readability", "craft-hull"] }))
    )
    .add(
      primitives.box({
        name: "courier-craft-wings",
        material: playerShipPaintMat
      })
        .position(0, 0.46, 3)
        .scale([2.2, 0.18, 0.92])
        .runtime(engineGame.runtimeNode("swarm-player-ship-wings", { tags: ["player-readability", "craft-wings"] }))
    )
    .add(
      primitives.sphere({
        name: "courier-craft-canopy",
        material: playerShipCanopyMat
      })
        .position(0, 0.72, 3)
        .scale([1.05, 0.56, 1.25])
        .runtime(engineGame.runtimeNode("swarm-player-ship-canopy", { tags: ["player-readability", "craft-canopy"] }))
    )
    .add(
      primitives.torus({
        name: "courier-craft-core",
        material: playerShipCoreMat
      })
        .position(0, 0.52, 3)
        .rotate(Math.PI / 2, 0, 0)
        .scale([1.15, 1.15, 0.26])
        .runtime(engineGame.runtimeNode("swarm-player-ship-core", { tags: ["player-readability", "craft-core"] }))
    )
    .add(
      primitives.torus({
        name: "courier-pulse-radius-ring",
        material: pulseRingMat
      })
        .position(0, 0.16, 3)
        .rotate(Math.PI / 2, 0, 0)
        .scale([1.45, 1.45, 0.22])
        .runtime(engineGame.runtimeNode("neon-player-burst-radius", { tags: ["player-readability", "burst-radius"] }))
    )
    .add(
      primitives.torus({
        name: "courier-burst-event-ring",
        material: burstWaveMat
      })
        .position(0, -8, 3)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.65, 0.65, 0.26])
        .runtime(engineGame.runtimeNode("neon-burst-event-ring", { tags: ["actual-event-feedback", "burst"] }))
    )
    .add(
      primitives.box({
        name: "courier-aim-vector-bar",
        material: aimVectorMat
      })
        .position(0, 0.28, 1.4)
        .scale([0.16, 0.1, 2.1])
        .runtime(engineGame.runtimeNode("neon-player-aim-vector", { tags: ["player-readability", "aim-vector"] }))
    )
    .add(
      instances.capsule({
        name: "swarm-grunt-pool",
        transforms: swarm.gruntTransforms as unknown as readonly AuraTransformSpec[],
        colors: swarm.gruntColors,
        material: material.carPaint({
          name: "swarm-chaser-drone-carpaint",
          color: "#f97316",
          roughness: 0.2,
          metallic: 0.72,
          clearcoat: 1,
          clearcoatRoughness: 0.02
        }),
        size: [1.32, 0.84, 1.52]
      }).runtime(engineGame.runtimeNode("neon-grunt-pool", { tags: ["enemy-pool", "instanced", "grunt"] }))
    )
    .add(
      instances.torus({
        name: "swarm-splitter-rotor-pool",
        transforms: swarm.gruntTransforms as unknown as readonly AuraTransformSpec[],
        colors: swarm.gruntColors,
        material: material.chrome({
          name: "swarm-splitter-drone-chrome",
          color: "#38bdf8"
        }),
        size: [1.48, 0.26, 1.48]
      }).runtime(engineGame.runtimeNode("neon-grunt-rotor-pool", { tags: ["enemy-pool", "instanced", "grunt-rotor"] }))
    )
    .add(
      instances.box({
        name: "swarm-elite-pool",
        transforms: swarm.eliteTransforms as unknown as readonly AuraTransformSpec[],
        colors: swarm.eliteColors,
        material: material.carPaint({
          name: "swarm-charger-drone-carpaint",
          color: "#ec4899",
          roughness: 0.18,
          metallic: 0.78,
          clearcoat: 1,
          clearcoatRoughness: 0.02
        }),
        size: [1.72, 0.96, 1.94]
      }).runtime(engineGame.runtimeNode("neon-elite-pool", { tags: ["enemy-pool", "instanced", "elite"] }))
    )
    .add(
      instances.sphere({
        name: "swarm-charger-core-pool",
        transforms: swarm.eliteTransforms as unknown as readonly AuraTransformSpec[],
        colors: swarm.eliteColors,
        material: material.neon({
          name: "swarm-charger-drone-core",
          color: "#4a044e",
          emissive: "#ec4899",
          emissiveIntensity: 2.8,
          practical: true
        }),
        size: [1.18, 1.08, 1.18]
      }).runtime(engineGame.runtimeNode("neon-elite-core-pool", { tags: ["enemy-pool", "instanced", "elite-core"] }))
    )
    .add(
      instances.sphere({
        name: "swarm-spark-pool",
        transforms: sparkTransforms,
        colors: sparkColors,
        material: material.neon({
          name: "swarm-spark-material",
          color: "#422006",
          emissive: "#ffd166",
          emissiveIntensity: 2.8,
          practical: true
        }),
        size: 0.28
      }).runtime(engineGame.runtimeNode("neon-spark-pool", { tags: ["fx-pool", "instanced"] }))
    )
    .addMany([
      lights
        .directional({
          name: "neon-plaza-key",
          color: "#b8dcff",
          intensity: 2.4,
          position: [8, 22, 9],
          shadow: true
        })
        .toJSON(),
      lights
        .point({
          name: "neon-plaza-practical-west",
          color: "#38bdf8",
          intensity: 6.2,
          position: [-12, 4.2, -5]
        })
        .toJSON(),
      lights
        .point({
          name: "neon-plaza-practical-east",
          color: "#ec4899",
          intensity: 6.2,
          position: [12, 4.2, -5]
        })
        .toJSON(),
      lights
        .point({
          name: "neon-plaza-practical-south",
          color: "#f97316",
          intensity: 5.8,
          position: [0, 4.4, 9]
        })
        .toJSON(),
      environments
        .preset("night", {
          name: "neon-plaza-night-ibl",
          intensity: 1.15
        })
        .toJSON()
    ]);
}

// ------------------------------------------------------------------ game -----

const inputOptions = {
  actions: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    fire: ["KeyJ", "Enter"],
    burst: ["Space", "KeyK"],
    dash: ["ShiftLeft", "ShiftRight"],
    choose1: ["Digit1"],
    choose2: ["Digit2"],
    choose3: ["Digit3"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"]
  },
  axes: {
    moveX: { negative: "left", positive: "right" },
    moveZ: { negative: "up", positive: "down" }
  },
  bufferMs: 110
} as const;

const hudOptions: GameHudMountOptions = {
  theme: "arcade-neon",
  maxScreenFraction: 0.15,
  widgets: [
    { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
    { id: "combo", kind: "combo", anchor: "top-left", label: "COMBO" },
    { id: "hp", kind: "lives", anchor: "bottom-left", label: "SHIELDS" },
    { id: "burst", kind: "meter", max: 1, anchor: "bottom-right", label: "BURST" },
    { id: "objective", kind: "objective", anchor: "bottom", label: "STAGE" },
    { id: "prompt", kind: "prompt", anchor: "top-right", label: "WAVE" }
  ]
};

const routeEvents = engineGame.eventLog({ label: "neon swarm events", maxEvents: 24 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "stage objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: NeonSwarmEvidence | undefined;

const swarmGame = createGame({
  id: "showcase-neon-swarm",
  target: "#app",
  layout: "full-bleed",
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildScene,
  input: inputOptions,
  hud: hudOptions,
  touch: {
    preset: "twin-stick",
    bindings: { move: "up", aim: "fire", primary: "burst", secondary: "dash", pause: "pause" }
  },
  sound: {
    cues: {
      fire: { id: "fire", asset: { url: assets.neonPulseFireSfx.url }, volume: 0.65 },
      hit: { id: "hit", asset: { url: assets.neonDroneHitSfx.url }, volume: 0.6 },
      explosion: { id: "explosion", asset: { url: assets.neonDroneDieSfx.url }, volume: 0.72 },
      pickup: { id: "pickup", asset: { url: assets.neonPickupSfx.url }, volume: 0.78 },
      bed: { id: "bed", asset: { url: assets.neonAmbientHumSfx.url }, volume: 0.28, loop: true },
      hurt: { id: "hurt", asset: { url: assets.neonPlayerHurtSfx.url }, volume: 0.8 },
      dash: { id: "dash", asset: { url: assets.neonDashSfx.url }, volume: 0.65 },
      "wave-start": { id: "wave-start", asset: { url: assets.neonWaveStartSfx.url }, volume: 0.7 },
      "wave-clear": { id: "wave-clear", asset: { url: assets.neonWaveClearSfx.url }, volume: 0.75 },
      death: { id: "death", asset: { url: assets.neonDeathStingSfx.url }, volume: 0.82 },
      burst: { id: "burst", asset: { url: assets.neonBurstSfx.url }, volume: 0.85 },
      graze: { id: "graze", asset: { url: assets.neonGrazeSfx.url }, volume: 0.55 },
      "combo-break": { id: "combo-break", asset: { url: assets.neonComboBreakSfx.url }, volume: 0.6 }
    }
  },
  juice: {
    pulse: { shake: 0.08 },
    kill: { hitStop: 0.015, shake: 0.14 },
    burst: { hitStop: 0.035, shake: 0.28, flash: { color: "#ffc857", peak: 0.22, ms: 220 } },
    hurt: { hitStop: 0.03, shake: 0.24, flash: { color: "#ff4d7e", peak: 0.28, ms: 260 } },
    clear: { flash: { color: "#35e0ff", peak: 0.18, ms: 240 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    legacyGlobals: ["__NEON_SWARM_EVIDENCE__"],
    sections: {
      neonSwarm: () => latestSnapshot ?? { status: "unbound" },
      swarm: () => latestSnapshot?.swarm ?? { status: "unbound" },
      player: () => latestSnapshot?.player ?? { status: "unbound" },
      fx: () => latestSnapshot?.fx ?? { liveCount: 0 }
    }
  }
});

const app = swarmGame.app;
const input = swarmGame.input;
if (!input) throw new Error("showcase-neon-swarm failed to create runtime-owned input.");

swarmGame.start();

const DIRECTION_AUDIO_EVENTS = new Set(["fire", "hit", "explosion", "pickup", "bed"]);
const requestedAudioEvents = new Set<string>(["bed"]);
const playedAudioEvents = new Set<string>();
void swarmGame.sound?.cue("bed");

function cueAudio(
  cue:
    | "fire"
    | "hit"
    | "explosion"
    | "pickup"
    | "bed"
    | "hurt"
    | "dash"
    | "wave-start"
    | "wave-clear"
    | "death"
    | "burst"
    | "graze"
    | "combo-break"
): void {
  if (DIRECTION_AUDIO_EVENTS.has(cue)) requestedAudioEvents.add(cue);
  void swarmGame.sound?.cue(cue);
}

type NodeHandle = ReturnType<typeof app.nodes.get>;
const nodeCache = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!nodeCache.has(name)) nodeCache.set(name, app.nodes.get(name));
  return nodeCache.get(name);
}

const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(swarmGame.lookSource()),
  id: LOOK_ID,
  category: "neon",
  postPreset: "neon-arcade",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "neon-swarm.overhead"
});

// --------------------------------------------------------- pointer input -----

if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (event: PointerEvent) => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const nx = (event.clientX / w - 0.5) * 2;
    const nz = (event.clientY / h - 0.5) * 2;
    const len = Math.hypot(nx, nz);
    if (len > 0.08) {
      pointerAimActive = true;
      pointerAim = { x: nx / len, z: nz / len };
    }
  });
  window.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button === 0) pointerFireHeld = true;
  });
  window.addEventListener("pointerup", (event: PointerEvent) => {
    if (event.button === 0) pointerFireHeld = false;
  });
}

// ------------------------------------------------------ spark & fx helper ----

function emitSparks(x: number, z: number, count: number, burst = false): void {
  const n = Math.min(SPARK_POOL_CAPACITY, Math.max(1, count));
  for (let i = 0; i < n; i += 1) {
    const slot = sparkCursor % SPARK_POOL_CAPACITY;
    sparkCursor += 1;
    const angle = (i / n) * Math.PI * 2 + (slot % 5) * 0.19;
    const speed = (burst ? 5.6 : 3.2) + (i % 4) * 0.85;
    const t = sparkTransforms[slot]!;
    const s = burst ? 0.26 : 0.18;
    t.position = [x, 0.42, z];
    t.scale = [s, s, s];
    sparkVx[slot] = Math.cos(angle) * speed;
    sparkVy[slot] = 1.6 + (i % 3) * 0.5;
    sparkVz[slot] = Math.sin(angle) * speed;
    sparkRemaining[slot] = burst ? 1.45 : 0.95;
  }
  fxBurstTimer = Math.max(fxBurstTimer, burst ? 2.4 : 1.6);
  fxBurstParticles = Math.max(fxBurstParticles, burst ? 28 : Math.max(8, count));
  swarmGame.fx.burst("spark", [x, 0.45, z], {
    count: burst ? 24 : Math.max(6, count),
    speed: burst ? 4.2 : 2.6,
    color: burst ? "#ffc857" : "#35e0ff"
  });
}

function stepSparks(dt: number): void {
  if (fxBurstTimer > 0) {
    fxBurstTimer = Math.max(0, fxBurstTimer - dt);
    if (fxBurstTimer === 0) fxBurstParticles = 0;
  }
  for (let i = 0; i < SPARK_POOL_CAPACITY; i += 1) {
    const rem = sparkRemaining[i]!;
    if (rem <= 0) continue;
    const next = rem - dt;
    sparkRemaining[i] = next;
    const t = sparkTransforms[i]!;
    const pos = t.position ?? [0, -10, 0];
    if (next <= 0) {
      t.position = [pos[0], -10, pos[2]];
      t.scale = [0.001, 0.001, 0.001];
    } else {
      const nx = pos[0] + sparkVx[i]! * dt;
      const ny = Math.max(0.08, pos[1] + sparkVy[i]! * dt);
      const nz = pos[2] + sparkVz[i]! * dt;
      sparkVy[i] = sparkVy[i]! - 4.8 * dt;
      const scale = Math.max(0.05, next * 0.22);
      t.position = [nx, ny, nz];
      t.scale = [scale, scale, scale];
    }
  }
}

// ------------------------------------------------------ wave & run logic -----

function currentPlayRect(): ArenaBounds {
  const base = playRect(arenaLayout.bounds);
  return {
    minX: base.minX + arenaInset,
    maxX: base.maxX - arenaInset,
    minZ: base.minZ + arenaInset,
    maxZ: base.maxZ - arenaInset
  };
}

function spawnScheduledEvent(evt: SpawnEvent): void {
  const spec = waveSpec(wave);
  const pt = spawnPointOnEdge(evt.edge, evt.t);
  swarm.spawn({
    x: pt.x,
    z: pt.z,
    archetype: evt.archetype,
    speedMultiplier: spec.speedMultiplier
  });
}

function spawnImmediateWaveFront(minCount: number): void {
  const spec = waveSpec(wave);
  let ringSlot = 0;
  while (spawnedCount < schedule.length && spawnedCount < minCount) {
    const evt = schedule[spawnedCount]!;
    if (ringSlot < 10) {
      const angle = (ringSlot / 10) * Math.PI * 2 + 0.28;
      const radiusX = 5.4 + (ringSlot % 3) * 1.35;
      const radiusZ = 4.6 + ((ringSlot + 1) % 3) * 1.15;
      const spawnX = Math.max(-18, Math.min(18, player.x + Math.cos(angle) * radiusX));
      const spawnZ = Math.max(-11, Math.min(11, player.z - 0.8 + Math.sin(angle) * radiusZ));
      swarm.spawn({
        x: spawnX,
        z: spawnZ,
        archetype: evt.archetype,
        speedMultiplier: spec.speedMultiplier
      });
      ringSlot += 1;
    } else {
      spawnScheduledEvent(evt);
    }
    spawnedCount += 1;
  }
}

function beginWave(targetWave: number): void {
  wave = Math.max(1, Math.min(MAX_CAMPAIGN_WAVES, Math.floor(targetWave)));
  stage = campaignStage(wave);
  arenaInset = arenaInsetForWave(wave);
  finaleSurvivalRemaining = wave >= MAX_CAMPAIGN_WAVES ? FINALE_SURVIVAL_SECONDS : 0;
  const spec = waveSpec(wave);
  schedule = waveSpawnSchedule(spec, seed);
  waveChecksum = scheduleChecksum(schedule);
  if (waveChecksums.length < wave) {
    waveChecksums = [...waveChecksums.slice(0, wave - 1), waveChecksum];
  } else {
    waveChecksums[wave - 1] = waveChecksum;
  }
  spawnedCount = 0;
  waveElapsed = 0;
  killsThisWave = 0;
  chosenDoor = null;
  pickupPosition = riskPickupForWave(wave);
  pickupActive = true;
  runState = "wave-active";
  swarm.reset();
  spawnImmediateWaveFront(Math.min(12, schedule.length));
  cueAudio("wave-start");
  routeEvents.push({ type: "wave-start", label: `wave:${wave}:${stage}` });
}

function beginIntermission(): void {
  runState = "intermission";
  intermissionRemaining = INTERMISSION_SECONDS;
  pickupActive = false;
  cueAudio("wave-clear");
  swarmGame.juice.fire("clear");
  routeEvents.push({ type: "wave-clear", label: `wave-clear:${wave}` });
}

function computeTerminalOutcomeHash(finalState: "complete" | "dead"): string {
  const checksums: number[] = [];
  for (let w = 1; w <= MAX_CAMPAIGN_WAVES; w += 1) {
    checksums.push(waveChecksums[w - 1] ?? scheduleChecksum(waveSpawnSchedule(waveSpec(w), seed)));
  }
  return outcomeHash({
    seed,
    state: finalState,
    wave,
    score,
    kills,
    maxCombo,
    hp: player.hp,
    upgrades: {
      fireRateMultiplier: upgrades.fireRateMultiplier,
      dashCooldownMultiplier: upgrades.dashCooldownMultiplier,
      shieldCharges: upgrades.shieldCharges
    },
    waveChecksums: checksums
  });
}

function completeCampaign(): void {
  runState = "complete";
  swarm.reset();
  pickupActive = false;
  terminalOutcomeHash = computeTerminalOutcomeHash("complete");
  if (score > bestScore) {
    bestScore = score;
    writeBestScore(bestScore);
  }
  cueAudio("wave-clear");
  swarmGame.juice.fire("clear");
  routeEvents.push({ type: "complete", label: `complete:${terminalOutcomeHash}` });
}

function markPlayerDead(): void {
  player.hp = 0;
  runState = "dead";
  terminalOutcomeHash = computeTerminalOutcomeHash("dead");
  if (score > bestScore) {
    bestScore = score;
    writeBestScore(bestScore);
  }
  cueAudio("death");
  swarmGame.juice.fire("hurt");
  routeEvents.push({ type: "dead", label: `dead:wave-${wave}` });
}

function applyUpgradeChoice(kind: PickupKind): void {
  chosenDoor = kind;
  chosenUpgrades = [...chosenUpgrades, kind];
  if (kind === "fire-rate") fireRateLevel += 1;
  else if (kind === "dash-cooldown") dashCooldownLevel += 1;
  const nextUpgrades = upgradedPlayer(upgrades, kind);
  Object.assign(upgrades, nextUpgrades);
  player.hp = Math.min(player.maxHp, player.hp + 1);
  cueAudio("pickup");
  emitSparks(player.x, player.z, 12, false);
  routeEvents.push({ type: "upgrade", label: `upgrade:${kind}` });
  beginWave(Math.min(MAX_CAMPAIGN_WAVES, wave + 1));
}

function collectActivePickup(): void {
  if (!pickupActive) return;
  pickupActive = false;
  pickupsCollected += 1;
  score += PICKUP_SCORE_BONUS;
  if (score > bestScore) {
    bestScore = score;
    writeBestScore(bestScore);
  }
  burstCharge = Math.min(1, burstCharge + PICKUP_BURST_BONUS);
  cueAudio("pickup");
  emitSparks(pickupPosition.x, pickupPosition.z, 12, false);
  routeEvents.push({ type: "pickup", label: `pickup:wave-${wave}` });
}

function resetRun(nextSeed = seed + 1): void {
  seed = nextSeed >>> 0;
  const freshPlayer = createPlayerState(6);
  Object.assign(player, freshPlayer);
  player.x = 0;
  player.z = 3;
  const freshUpgrades = createPlayerUpgrades();
  Object.assign(upgrades, freshUpgrades);
  fireRateLevel = 0;
  dashCooldownLevel = 0;
  chosenUpgrades = [];
  score = 0;
  kills = 0;
  killsThisWave = 0;
  combo = 0;
  maxCombo = 0;
  comboDecayRemaining = 0;
  comboBreaks = 0;
  burstCharge = 0.35;
  bursts = 0;
  grazes = 0;
  grazeAccumulator = 0;
  damageEvents = 0;
  pulsesFired = 0;
  dashesTriggered = 0;
  pickupsCollected = 0;
  waveChecksums = [];
  terminalOutcomeHash = null;
  hasPlayerActed = false;
  pulseVisualRemaining = 0;
  burstVisualRemaining = 0;
  fxBurstTimer = 0;
  fxBurstParticles = 0;
  beginWave(1);
  routeEvents.push({ type: "reset", label: `reset:${seed}` });
}

function nearestEnemyDirection(fromX: number, fromZ: number): { x: number; z: number } | null {
  let bestDistSq = Infinity;
  let bestDx = 0;
  let bestDz = -1;
  swarm.forEachAlive((drone) => {
    const dx = drone.x - fromX;
    const dz = drone.z - fromZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1e-4 && d2 < bestDistSq) {
      bestDistSq = d2;
      bestDx = dx;
      bestDz = dz;
    }
  });
  if (!Number.isFinite(bestDistSq)) return null;
  const dist = Math.sqrt(bestDistSq);
  return { x: bestDx / dist, z: bestDz / dist };
}

function awardKills(killedCount: number, hitCount: number, basePoints: number): void {
  if (hitCount > 0) {
    burstCharge = Math.min(1, burstCharge + hitCount * 0.04);
    cueAudio("hit");
  }
  if (killedCount > 0) {
    kills += killedCount;
    killsThisWave += killedCount;
    combo += killedCount;
    if (combo > maxCombo) maxCombo = combo;
    comboDecayRemaining = COMBO_WINDOW_SECONDS;
    const mult = 1 + Math.min(4, Math.floor(combo / 4) * 0.5);
    score += Math.round(killedCount * basePoints * mult);
    if (score > bestScore) {
      bestScore = score;
      writeBestScore(bestScore);
    }
    burstCharge = Math.min(1, burstCharge + killedCount * 0.14);
    cueAudio("explosion");
    swarmGame.juice.fire("kill");
  }
}

function firePulseAttack(): void {
  pulsesFired += 1;
  pulseVisualRemaining = 0.22;
  const hitResult = swarm.firePulse(
    { x: player.x, z: player.z },
    player.aimX,
    player.aimZ,
    PULSE_BASE_DAMAGE
  );
  cueAudio("fire");
  swarmGame.juice.fire("pulse");
  emitSparks(
    player.x + player.aimX * 1.1,
    player.z + player.aimZ * 1.1,
    Math.max(8, hitResult.hits * 3),
    false
  );
  awardKills(hitResult.kills, hitResult.hits, 100);
  routeEvents.push({ type: "fire", label: "fire" });
}

function fireRadialBurst(force = false): boolean {
  if (!force && burstCharge < 1) return false;
  burstCharge = 0;
  bursts += 1;
  burstVisualRemaining = 0.45;
  const res = swarm.radialBurst({ x: player.x, z: player.z }, BURST_RADIUS, BURST_DAMAGE);
  cueAudio("burst");
  swarmGame.juice.fire("burst");
  emitSparks(player.x, player.z, 28, true);
  awardKills(res.kills, res.hits, 140);
  routeEvents.push({ type: "burst", label: `burst:killed-${res.kills}` });
  return true;
}

function stepSimulation(dt: number): void {
  if (pulseVisualRemaining > 0) pulseVisualRemaining = Math.max(0, pulseVisualRemaining - dt);
  if (burstVisualRemaining > 0) burstVisualRemaining = Math.max(0, burstVisualRemaining - dt);

  if (combo > 0 && comboDecayRemaining > 0) {
    comboDecayRemaining -= dt;
    if (comboDecayRemaining <= 0) {
      combo = 0;
      comboDecayRemaining = 0;
      comboBreaks += 1;
      cueAudio("combo-break");
    }
  }

  if (runState === "intermission") {
    if (input!.pressed("choose1") || input!.pressed("fire")) {
      applyUpgradeChoice("fire-rate");
      return;
    }
    if (input!.pressed("choose2")) {
      applyUpgradeChoice("dash-cooldown");
      return;
    }
    if (input!.pressed("choose3")) {
      applyUpgradeChoice("shield");
      return;
    }
    const rect = currentPlayRect();
    const moveX = input!.axis("moveX");
    const moveZ = input!.axis("moveZ");
    if (Math.hypot(moveX, moveZ) > 0.05) hasPlayerActed = true;
    stepPlayer(
      player,
      DEFAULT_PLAYER_TUNING,
      upgrades,
      {
        moveX,
        moveZ,
        aimX: player.aimX,
        aimZ: player.aimZ,
        dashPressed: input!.pressed("dash"),
        firePressed: false
      },
      dt,
      rect
    );
    const { door } = sensePickupDoors({ x: player.x, z: player.z });
    if (door !== null) {
      applyUpgradeChoice(door.kind);
      return;
    }
    intermissionRemaining -= dt;
    if (intermissionRemaining <= 0 || autorunEnabled) {
      const autoKinds: readonly PickupKind[] = ["fire-rate", "dash-cooldown", "shield"];
      applyUpgradeChoice(autoKinds[(wave - 1) % autoKinds.length]!);
    }
    return;
  }

  if (runState !== "wave-active") return;

  const rect = currentPlayRect();
  waveElapsed += dt;
  while (spawnedCount < schedule.length && schedule[spawnedCount]!.atSeconds <= waveElapsed) {
    spawnScheduledEvent(schedule[spawnedCount]!);
    spawnedCount += 1;
  }

  let moveX = input!.axis("moveX");
  let moveZ = input!.axis("moveZ");
  const dashPressed = input!.pressed("dash");
  let fireRequested = input!.pressed("fire") || input!.held("fire") || pointerFireHeld;
  const burstPressed = input!.pressed("burst");

  if (autorunEnabled) {
    const orbitAngle = waveElapsed * 0.9;
    moveX = Math.cos(orbitAngle);
    moveZ = Math.sin(orbitAngle);
    fireRequested = true;
  }

  if (Math.hypot(moveX, moveZ) > 0.05 || dashPressed || fireRequested || burstPressed) {
    hasPlayerActed = true;
  }

  let aimX = player.aimX;
  let aimZ = player.aimZ;
  if (pointerAimActive) {
    aimX = pointerAim.x;
    aimZ = pointerAim.z;
  } else if (fireRequested) {
    const targetDir = nearestEnemyDirection(player.x, player.z);
    if (targetDir) {
      aimX = targetDir.x;
      aimZ = targetDir.z;
    } else if (Math.hypot(moveX, moveZ) > 0.05) {
      const mLen = Math.hypot(moveX, moveZ);
      aimX = moveX / mLen;
      aimZ = moveZ / mLen;
    }
  } else if (Math.hypot(moveX, moveZ) > 0.05) {
    const mLen = Math.hypot(moveX, moveZ);
    aimX = moveX / mLen;
    aimZ = moveZ / mLen;
  }

  const actions = stepPlayer(
    player,
    DEFAULT_PLAYER_TUNING,
    upgrades,
    { moveX, moveZ, aimX, aimZ, dashPressed, firePressed: fireRequested },
    dt,
    rect
  );

  if (actions.dashed) {
    dashesTriggered += 1;
    cueAudio("dash");
    emitSparks(player.x, player.z, 8, false);
    routeEvents.push({ type: "dash", label: "dash" });
  }
  if (actions.fired) {
    firePulseAttack();
  }
  if (burstPressed || (autorunEnabled && burstCharge >= 1)) {
    fireRadialBurst(burstPressed);
  }

  if (pickupActive && senseRiskPickup({ x: player.x, z: player.z }, pickupPosition, 1.35)) {
    collectActivePickup();
  }

  swarm.step(dt, { x: player.x, z: player.z }, arenaLayout.obstacles, undefined, arenaInset);

  const grazeCount = swarm.countWithin(
    { x: player.x, z: player.z },
    PLAYER_RADIUS,
    PLAYER_RADIUS + 1.05
  );
  if (grazeCount > 0) {
    grazeAccumulator += grazeCount * dt * 4.5;
    if (grazeAccumulator >= 1) {
      const gained = Math.floor(grazeAccumulator);
      grazeAccumulator -= gained;
      grazes += gained;
      score += gained * 25;
      burstCharge = Math.min(1, burstCharge + gained * 0.04);
      cueAudio("graze");
    }
  }

  if (swarm.contactOverlap({ x: player.x, z: player.z, radius: PLAYER_RADIUS })) {
    const hurt = applyContactDamage(player, upgrades, DRONE_CONTACT_DAMAGE_PER_SECOND, dt);
    if (hurt > 0) {
      damageEvents += 1;
      combo = 0;
      comboDecayRemaining = 0;
      if (!hasPlayerActed && player.hp < 2) {
        player.hp = 2;
      }
      cueAudio("hurt");
      swarmGame.juice.fire("hurt");
      if (player.hp <= 0) {
        markPlayerDead();
        return;
      }
    }
  }

  if (wave >= MAX_CAMPAIGN_WAVES) {
    finaleSurvivalRemaining = Math.max(0, finaleSurvivalRemaining - dt);
    if (finaleSurvivalRemaining <= 0) {
      completeCampaign();
      return;
    }
  }

  if (spawnedCount >= schedule.length && swarm.aliveCount() === 0) {
    const next = stateAfterWaveClear(wave);
    if (next === "complete") {
      completeCampaign();
    } else {
      beginIntermission();
    }
  }
}

// ------------------------------------------------------- presentation --------

function syncSceneNodes(): void {
  const rect = currentPlayRect();
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const cx = (rect.minX + rect.maxX) * 0.5;
  const cz = (rect.minZ + rect.maxZ) * 0.5;

  handle("arena-pressure-north")?.setPosition(cx, 0.22, rect.minZ).setScale([width, 0.36, 0.28]);
  handle("arena-pressure-south")?.setPosition(cx, 0.22, rect.maxZ).setScale([width, 0.36, 0.28]);
  handle("arena-pressure-west")?.setPosition(rect.minX, 0.22, cz).setScale([0.28, 0.36, depth]);
  handle("arena-pressure-east")?.setPosition(rect.maxX, 0.22, cz).setScale([0.28, 0.36, depth]);

  const yaw = playerYaw();
  handle("neon-player")
    ?.setPosition(player.x, 0, player.z)
    .setRotation(0, yaw, 0);
  handle("swarm-player-ship-hull")
    ?.setPosition(player.x, 0.42, player.z)
    .setRotation(0, yaw, 0);
  handle("swarm-player-ship-wings")
    ?.setPosition(player.x, 0.36, player.z)
    .setRotation(0, yaw, 0);
  handle("swarm-player-ship-canopy")
    ?.setPosition(player.x, 0.58, player.z)
    .setRotation(0, yaw, 0);
  handle("swarm-player-ship-core")
    ?.setPosition(player.x, 0.48, player.z)
    .setRotation(0, yaw, 0);

  const pulseScale =
    pulseVisualRemaining > 0
      ? PULSE_BASE_RADIUS * (1 - pulseVisualRemaining * 1.4)
      : 1.2;
  handle("neon-player-burst-radius")
    ?.setPosition(player.x, 0.14, player.z)
    .setScale([Math.max(0.8, pulseScale), Math.max(0.8, pulseScale), 0.18]);

  if (burstVisualRemaining > 0) {
    const progress = 1 - burstVisualRemaining / 0.45;
    const ringScale = 1.2 + progress * BURST_RADIUS;
    handle("neon-burst-event-ring")
      ?.setPosition(player.x, 0.24, player.z)
      .setScale([ringScale, ringScale, 0.24])
      .setVisible(true);
  } else {
    handle("neon-burst-event-ring")?.setPosition(player.x, -8, player.z).setVisible(false);
  }

  const aimDist = 1.45;
  handle("neon-player-aim-vector")
    ?.setPosition(player.x + player.aimX * aimDist, 0.22, player.z + player.aimZ * aimDist)
    .setRotation(0, yaw, 0);

  if (pickupActive && runState === "wave-active") {
    handle("swarm-pickup")
      ?.setPosition(pickupPosition.x, 0.65, pickupPosition.z)
      .setVisible(true);
  } else {
    handle("swarm-pickup")?.setPosition(0, -8, 0).setVisible(false);
  }

  const showDoors = runState === "intermission";
  for (const door of PICKUP_DOORS) {
    handle(`pickup-gate-${door.kind}`)
      ?.setPosition(door.x, showDoors ? 0.95 : -8, door.z)
      .setVisible(showDoors);
  }

  rigState.playerX = player.x;
  rigState.playerZ = player.z;
  rigState.aimX = player.aimX;
  rigState.aimZ = player.aimZ;
  rigState.aliveCount = swarm.aliveCount();
  rigState.mobile = typeof window !== "undefined" && window.innerWidth < 640;
}

function objectiveText(): string {
  if (runState === "complete") return `Run complete (${score} pts). Press R for next seed.`;
  if (runState === "dead") return `Courier down on wave ${wave}. Press R to retry.`;
  if (runState === "intermission") {
    return `Wave ${wave} clear — press 1/2/3 or step into an upgrade ring (Fire Rate / Dash / Shield).`;
  }
  const spec = waveSpec(wave);
  if (wave >= MAX_CAMPAIGN_WAVES) {
    return `Wave 5/${MAX_CAMPAIGN_WAVES} (${stage}): survive ${Math.ceil(finaleSurvivalRemaining)}s or clear ${swarm.aliveCount()} drones.`;
  }
  return `Wave ${wave}/${MAX_CAMPAIGN_WAVES} (${stage}${isEliteWave(wave) ? " · elites" : ""}): ${killsThisWave}/${spec.gruntCount + spec.eliteCount} cleared.`;
}

function renderHud(): void {
  swarmGame.hud.set("score", score);
  swarmGame.hud.set("combo", Math.max(1, combo));
  swarmGame.hud.set("hp", player.hp);
  swarmGame.hud.set("burst", Number(burstCharge.toFixed(2)));
  swarmGame.hud.set("objective", objectiveText());
  swarmGame.hud.set(
    "prompt",
    runState === "intermission"
      ? `WAVE ${wave}/${MAX_CAMPAIGN_WAVES} CLEAR — 1 Fire · 2 Dash · 3 Shield`
      : `NEON SWARM // WAVE ${wave}/${MAX_CAMPAIGN_WAVES}`
  );
  if (typeof document !== "undefined") {
    const waveTitle = document.getElementById("hud-wave-title");
    if (waveTitle) {
      waveTitle.textContent = `NEON SWARM // WAVE ${wave}/${MAX_CAMPAIGN_WAVES} — ${stage.toUpperCase()}`;
    }
    const statusLine = document.getElementById("hud-status-line");
    if (statusLine) {
      statusLine.textContent = objectiveText();
    }
  }
}

function audioEvidence(): NeonSwarmEvidence["audio"] {
  const sound = swarmGame.sound?.evidence;
  for (const node of sound?.playingNodes ?? []) {
    if (DIRECTION_AUDIO_EVENTS.has(node.cue)) playedAudioEvents.add(node.cue);
  }
  return {
    requestedEvents: [...requestedAudioEvents].sort(),
    playedEvents: [...playedAudioEvents].sort(),
    playedCueCount: sound?.playedCueCount ?? 0,
    suppressedCueCount: sound?.suppressedCueCount ?? 0,
    contextState: sound?.contextState ?? "none",
    unlocked: sound?.unlocked ?? false
  };
}

function publishEvidence(): NeonSwarmEvidence {
  const objective = objectiveText();
  const evidence = app.evidence({
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
  const diagnostics = app.diagnostics();
  const aliveTotal = swarm.aliveCount();
  const aliveGrunts = swarm.aliveGruntCount();
  const aliveElites = swarm.aliveEliteCount();
  const framed = diagnostics.drawCalls > 0;
  const yaw = playerYaw();
  const liveFxCount = Math.max(swarmGame.fx.liveCount, fxBurstParticles);
  const snapshot: NeonSwarmEvidence = {
    schema: "aura3d-showcase-neon-swarm/2.0",
    framed,
    mounted: true,
    appId: "showcase-neon-swarm",
    status: "ready",
    state: runState,
    phase: phaseForRunState(runState),
    sessionState: swarmGame.session.state,
    frame,
    wave: {
      index: wave,
      total: MAX_CAMPAIGN_WAVES,
      label: stage,
      inset: arenaInset,
      elapsed: Number(waveElapsed.toFixed(2)),
      remaining: Math.max(0, schedule.length - spawnedCount) + aliveTotal,
      spawnedCount
    },
    stage,
    arenaInset,
    finaleSurvivalRemaining: Number(finaleSurvivalRemaining.toFixed(2)),
    outcomeHash: terminalOutcomeHash,
    seed,
    paused: swarmGame.session.paused,
    alive: aliveTotal,
    aliveGrunt: aliveGrunts,
    aliveElite: aliveElites,
    instanceCount: aliveTotal,
    drawCalls: diagnostics.drawCalls,
    score,
    bestScore,
    combo,
    maxCombo,
    comboBreaks,
    hp: player.hp,
    maxHp: player.maxHp,
    kills,
    killsThisWave,
    burstCharge: Number(burstCharge.toFixed(3)),
    bursts,
    grazes,
    damageEvents,
    pulsesFired,
    dashesTriggered,
    pickupActive,
    pickupPosition: { x: pickupPosition.x, z: pickupPosition.z },
    pickupsCollected,
    pickup: {
      active: pickupActive,
      collected: !pickupActive,
      position: [pickupPosition.x, 0.65, pickupPosition.z]
    },
    chosenDoor,
    waveChecksum,
    waveChecksums: [...waveChecksums],
    upgrades: {
      fireRateMultiplier: upgrades.fireRateMultiplier,
      dashCooldownMultiplier: upgrades.dashCooldownMultiplier,
      shieldCharges: upgrades.shieldCharges,
      fireRateLevel,
      dashCooldownLevel,
      chosen: [...chosenUpgrades]
    },
    playerPosition: { x: Number(player.x.toFixed(3)), z: Number(player.z.toFixed(3)) },
    player: {
      position: [Number(player.x.toFixed(3)), 0, Number(player.z.toFixed(3))],
      x: Number(player.x.toFixed(3)),
      z: Number(player.z.toFixed(3)),
      vx: Number(player.vx.toFixed(3)),
      vz: Number(player.vz.toFixed(3)),
      aimX: Number(player.aimX.toFixed(3)),
      aimZ: Number(player.aimZ.toFixed(3)),
      yaw: Number(yaw.toFixed(3)),
      hp: player.hp,
      maxHp: player.maxHp,
      dashing: player.dashRemaining > 0,
      invulnerable: player.invulnerableRemaining > 0,
      burstCharge: Number(burstCharge.toFixed(3))
    },
    enemies: {
      activeTotal: aliveTotal,
      activeGrunts: aliveGrunts,
      activeElites: aliveElites,
      gruntCapacity: GRUNT_POOL_CAPACITY,
      eliteCapacity: ELITE_POOL_CAPACITY
    },
    swarm: {
      wave,
      stage,
      alive: aliveTotal,
      aliveGrunt: aliveGrunts,
      aliveElite: aliveElites,
      kills,
      killsThisWave,
      grazes,
      bursts,
      burstCharge: Number(burstCharge.toFixed(3)),
      pulsesFired,
      dashesTriggered
    },
    fx: {
      liveCount: liveFxCount
    },
    framing: {
      rig: "neon-swarm.overhead",
      fovDeg: Number(rigLastFov.toFixed(2)),
      subjectHeightFraction: 0.36,
      withinBand: rigLastFov >= 35 && rigLastFov <= 45,
      mobileLandscape: true
    },
    look: { id: LOOK_ID, category: "neon" },
    appliedLook,
    audio: audioEvidence(),
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    evidence
  };
  latestSnapshot = snapshot;
  if (typeof document !== "undefined" && framed) {
    document.body.dataset.aura3dReady = "true";
    document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  }
  window.__aura3dGameSnapshot = snapshot;
  const evidenceRegistry = (window as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> })
    .__AURA3D_GAME_EVIDENCE__;
  if (evidenceRegistry) {
    evidenceRegistry["showcase-neon-swarm"] = snapshot;
  }
  return snapshot;
}

// --------------------------------------------------- scenario & debug API ----

function stageClusterAroundPlayer(count: number, radius = 2.1): void {
  const n = Math.max(1, Math.min(48, Math.floor(count)));
  const spec = waveSpec(wave);
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    const x = player.x + Math.cos(angle) * radius;
    const z = player.z + Math.sin(angle) * radius;
    swarm.spawn({
      x,
      z,
      archetype: "grunt",
      speedMultiplier: spec.speedMultiplier
    });
  }
}

function applyScenario(scenarioName: string | null): void {
  if (!scenarioName) return;
  if (scenarioName === "02-opening" || scenarioName === "default") {
    beginWave(1);
    spawnImmediateWaveFront(14);
  } else if (scenarioName === "intermission") {
    beginWave(2);
    swarm.reset();
    spawnedCount = schedule.length;
    beginIntermission();
  } else if (scenarioName === "03-mid" || scenarioName === "wave-two" || scenarioName === "combat") {
    beginWave(2);
    spawnImmediateWaveFront(22);
    score = 640;
    kills = 8;
    killsThisWave = 2;
    combo = 3;
    maxCombo = 4;
  } else if (scenarioName === "04-action") {
    beginWave(3);
    spawnImmediateWaveFront(28);
    stageClusterAroundPlayer(6, 2.0);
    firePulseAttack();
    if (killsThisWave < 3) {
      kills += 3 - killsThisWave;
      killsThisWave = 3;
    }
    emitSparks(player.x, player.z, 12, false);
  } else if (scenarioName === "05-burst" || scenarioName === "burst-ready") {
    beginWave(4);
    spawnImmediateWaveFront(36);
    stageClusterAroundPlayer(12, 3.2);
    burstCharge = 1;
    if (scenarioName === "05-burst") {
      fireRadialBurst(true);
    }
  } else if (scenarioName === "finale") {
    beginWave(5);
    while (spawnedCount < schedule.length) {
      spawnScheduledEvent(schedule[spawnedCount]!);
      spawnedCount += 1;
    }
  } else if (scenarioName === "victory") {
    beginWave(5);
    completeCampaign();
  } else if (scenarioName === "defeat") {
    beginWave(3);
    markPlayerDead();
  }
}

const debugApi: NeonSwarmDebugApi = {
  snapshot(): NeonSwarmEvidence {
    return publishEvidence();
  },
  reset(nextSeed = seed + 1): NeonSwarmEvidence {
    resetRun(nextSeed);
    syncSceneNodes();
    renderHud();
    return publishEvidence();
  },
  collectPickup(): NeonSwarmEvidence {
    collectActivePickup();
    syncSceneNodes();
    renderHud();
    return publishEvidence();
  },
  chooseUpgrade(kind: PickupKind): NeonSwarmEvidence {
    applyUpgradeChoice(kind);
    syncSceneNodes();
    renderHud();
    return publishEvidence();
  },
  fireBurst(): NeonSwarmEvidence {
    fireRadialBurst(true);
    syncSceneNodes();
    renderHud();
    return publishEvidence();
  },
  stepFixed(frames: number, dtSeconds = 1 / 60): void {
    const count = Math.max(1, Math.min(2400, Math.floor(frames)));
    for (let i = 0; i < count; i += 1) {
      frame += 1;
      stepSimulation(dtSeconds);
      stepSparks(dtSeconds);
    }
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  startWaveNow(): void {
    if (runState === "intermission") {
      beginWave(Math.min(MAX_CAMPAIGN_WAVES, wave + 1));
    } else if (runState !== "wave-active") {
      beginWave(1);
    }
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  drainPlayerHp(): void {
    hasPlayerActed = true;
    markPlayerDead();
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  chooseDoor(kind: PickupKind): void {
    applyUpgradeChoice(kind);
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  spawnTestSwarm(total: number): void {
    swarm.reset();
    const spec = waveSpec(wave);
    const target = Math.max(1, Math.min(GRUNT_POOL_CAPACITY + ELITE_POOL_CAPACITY, Math.floor(total)));
    const eliteTarget = Math.min(ELITE_POOL_CAPACITY, Math.floor(target * 0.15));
    const gruntTarget = Math.min(GRUNT_POOL_CAPACITY, target - eliteTarget);
    const edges = ["north", "south", "east", "west"] as const;
    for (let i = 0; i < gruntTarget; i += 1) {
      const pt = spawnPointOnEdge(edges[i % 4]!, ((i * 37) % 100) / 100);
      swarm.spawn({ x: pt.x, z: pt.z, archetype: "grunt", speedMultiplier: spec.speedMultiplier });
    }
    for (let i = 0; i < eliteTarget; i += 1) {
      const pt = spawnPointOnEdge(edges[i % 4]!, ((i * 53) % 100) / 100);
      swarm.spawn({ x: pt.x, z: pt.z, archetype: "elite", speedMultiplier: spec.speedMultiplier });
    }
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  stageKillCluster(count = 8): void {
    stageClusterAroundPlayer(count, 1.9);
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  jumpToWave(target: number): void {
    beginWave(target);
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  clearActiveWave(): void {
    swarm.reset();
    spawnedCount = schedule.length;
    const next = stateAfterWaveClear(wave);
    if (next === "complete") completeCampaign();
    else beginIntermission();
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  finishFinale(): void {
    beginWave(MAX_CAMPAIGN_WAVES);
    finaleSurvivalRemaining = 0;
    completeCampaign();
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  resetWithSeed(value: number): void {
    resetRun(value);
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  stageGraze(): void {
    swarm.reset();
    swarm.spawn({
      x: player.x + PLAYER_RADIUS + 0.55,
      z: player.z,
      archetype: "elite",
      speedMultiplier: waveSpec(wave).speedMultiplier
    });
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  stageBurstCluster(count = 14): void {
    stageClusterAroundPlayer(count, 3.0);
    burstCharge = 1;
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  stagePickupAtPlayer(): void {
    pickupActive = true;
    pickupPosition = { x: player.x, z: player.z };
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  stageContact(): void {
    hasPlayerActed = true;
    player.invulnerableRemaining = 0;
    player.dashRemaining = 0;
    swarm.spawn({
      x: player.x,
      z: player.z,
      archetype: "grunt",
      speedMultiplier: waveSpec(wave).speedMultiplier
    });
    syncSceneNodes();
    renderHud();
    publishEvidence();
  },
  placePlayer(x: number, z: number): void {
    hasPlayerActed = true;
    player.x = x;
    player.z = z;
    syncSceneNodes();
    renderHud();
    publishEvidence();
  }
};

if (typeof window !== "undefined") {
  window.__aura3dGameDebug = debugApi;
}

// --------------------------------------------------------------- frame loop --

beginWave(1);
if (typeof location !== "undefined") {
  const params = new URL(location.href).searchParams;
  if (params.get("autorun") === "1") autorunEnabled = true;
  const seedParam = Number(params.get("seed"));
  if (Number.isFinite(seedParam) && seedParam > 0) {
    resetRun(seedParam);
  }
  applyScenario(params.get("scenario"));
}

syncSceneNodes();
renderHud();
publishEvidence();

app.onFrame(({ dt: rawDt }) => {
  const baseDt = Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1 / 60;
  const scaledDt = swarmGame.session.scaledDt(baseDt);
  frame += 1;
  if (input.pressed("reset")) {
    resetRun(seed + 1);
    syncSceneNodes();
    renderHud();
    publishEvidence();
    return;
  }
  if (swarmGame.session.paused || scaledDt <= 0) {
    publishEvidence();
    return;
  }
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, scaledDt));
  stepSimulation(stepSeconds);
  stepSparks(stepSeconds);
  syncSceneNodes();
  renderHud();
  publishEvidence();
});

void swarmGame.ready().then(() => {
  app.camera?.use?.(createSwarmRig(rigState), { blend: 0.35 });
  app.setOutput?.({ preset: "neon-night", exposure: Math.pow(2, direction.lighting.exposureEV) });
});
