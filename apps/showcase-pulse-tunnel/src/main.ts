// Pulse Tunnel — single-path rebuild on the salvaged gameplay core.
// Every URL boots this module; the former legacy/v2 dispatcher is deleted.
//
// Salvaged gameplay core (unchanged):
// - gameplay/beat-clock.ts (120 BPM beat clock, ±80 ms drift monitor, pattern fallback)
// - gameplay/gates.ts (gate spawner, pass/graze/collision classification, respace)
// - gameplay/patterns.ts (authored 90 s chart across intro/build/drop/finale)
// - gameplay/player.ts (3-lane switching, jump/slide kinematics, invulnerability)
// - gameplay/style.ts (distance/graze heat, multiplier, score)
// - gameplay/conveyor.ts (tunnel hoop segment pool recycling)
import {
  camera,
  createGameAudio,
  effects,
  environments,
  game as engineGame,
  instances,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraCameraPose,
  type AuraCameraRig,
  type AuraCameraRigContext,
  type AuraNodeInput,
  type AuraTransformSpec,
  type GameAudio,
  type GameAudioContextLike
} from "@aura3d/engine";
import { createGame, lookManifest, type Game } from "@aura3d/engine/game";
import {
  createBeatClock,
  pulseSectionAtTime,
  pulseTimeForBeat,
  type BeatClockSample
} from "./gameplay/beat-clock";
import {
  createGateSystem,
  pulseGateGeometry,
  PULSE_GATE_SPEED,
  PULSE_PLAYER_Z,
  PULSE_SPAWN_Z
} from "./gameplay/gates";
import { createPulseConveyor, PULSE_CONVEYOR_BUDGET, type PulseConveyor } from "./gameplay/conveyor";
import { buildPulseChart, type PulseGateKind } from "./gameplay/patterns";
import {
  createPulsePlayer,
  PULSE_INVULN_SECONDS,
  PULSE_LANE_X,
  type PulsePlayerState
} from "./gameplay/player";
import { createPulseStyleSystem, type StyleSnapshot } from "./gameplay/style";
import direction from "../art/direction";
import { assets } from "./aura-assets";

export const PULSE_EVIDENCE_ID = "showcase-pulse-tunnel";
const MAX_SHIELDS = 3;
const RUN_SECONDS = 90;
const TUNNEL_BG = "#150b2e";
const TUNNEL_FLOOR_Y = -0.54;
const GATE_POOL_SIZE = 4;

export type RunState = "ready" | "running" | "summary";

export type PulseSfxCue =
  | "laneSwitch"
  | "jump"
  | "slide"
  | "graze"
  | "shieldHit"
  | "shieldBreak"
  | "sectionRise"
  | "runOver"
  | "uiConfirm";

type PulseStemCue = "stemDrums" | "stemBass" | "stemLead" | "stemAir";
type PulseAudioCue = PulseSfxCue | PulseStemCue;
const PULSE_STEM_BUS_IDS = ["drums", "bass", "lead", "air"] as const;
type PulseStemBusId = (typeof PULSE_STEM_BUS_IDS)[number];

const PULSE_SECTION_BUSES: Record<string, readonly PulseStemBusId[]> = {
  intro: ["drums"],
  build: ["drums", "bass"],
  drop: ["drums", "bass", "lead"],
  finale: ["drums", "bass", "lead", "air"]
};

const STEM_LEVEL = 0.2;
const SFX_LEVEL = 0.45;
const START_LEAD_SECONDS = 0.12;

export interface PulseRunSnapshot {
  readonly state: RunState;
  readonly sectionId: string;
  readonly beat: number;
  readonly elapsed: number;
  readonly shields: number;
  readonly passed: number;
  readonly passedOnBeat: number;
  readonly grazes: number;
  readonly collisions: number;
  readonly finishedReason: string | null;
}

export interface PulseTunnelSnapshot {
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly run: PulseRunSnapshot;
  readonly gates: {
    readonly active: number;
    readonly pending: number;
    readonly passed: number;
    readonly passedOnBeat: number;
    readonly grazes: number;
    readonly collisions: number;
  };
  readonly player: {
    readonly lane: number;
    readonly x: number;
    readonly y: number;
    readonly airborne: boolean;
    readonly sliding: boolean;
    readonly colliderTop: number;
    readonly invulnerable: boolean;
  };
  readonly style: StyleSnapshot;
  readonly sync: {
    readonly mode: BeatClockSample["mode"];
    readonly time: number;
    readonly driftMs: number;
    readonly driftChecksFailed: number;
    readonly flipped: boolean;
  };
  readonly fx: { readonly liveCount: number; readonly backend: string };
  readonly framing: {
    readonly rig: string;
    readonly subjectScreenHeightFraction: number | null;
    readonly pose: unknown;
    readonly canvasMatchesViewport: boolean;
  };
  readonly look: { readonly id: string; readonly category: string };
  readonly appliedLook: Record<string, unknown>;
  readonly audio: { readonly cues: readonly string[] };
  readonly evidence: unknown;
}

declare global {
  interface Window {
    __aura3dGameSnapshot?: PulseTunnelSnapshot;
  }
}

// ---------------------------------------------------------------- materials --

const TUNNEL_DECK = material.reflectiveFloor({
  color: "#070b18",
  roughness: 0.1,
  metallic: 0.5,
  clearcoat: 0.85
});
const TUNNEL_BRUSHED_ARCH = material.brushedMetal({
  color: "#1e293b",
  roughness: 0.24,
  anisotropy: 0.85
});
const TUNNEL_CHROME_TRIM = material.chrome({
  color: "#e2e8f0",
  roughness: 0.03,
  clearcoat: 0.35
});
const NEON_PINK_BAR = material.neon({
  color: "#ec4899",
  emissive: "#ec4899",
  emissiveIntensity: 2.1,
  practical: true
});
const NEON_CYAN_BAR = material.neon({
  color: "#38bdf8",
  emissive: "#38bdf8",
  emissiveIntensity: 2.1,
  practical: true
});
const LANE_GUIDE = material.neon({
  color: "#38bdf8",
  emissive: "#3ff2ff",
  emissiveIntensity: 1.75,
  opacity: 0.82,
  practical: true
});
const CONVEYOR_CYAN = material.neon({
  color: "#38bdf8",
  emissive: "#38bdf8",
  emissiveIntensity: 1.65,
  practical: true
});
const CONVEYOR_MAGENTA = material.neon({
  color: "#ec4899",
  emissive: "#ff5bd7",
  emissiveIntensity: 1.6,
  practical: true
});
const GATE_WALL = material.neon({
  color: "#ec4899",
  emissive: "#ff4fd8",
  emissiveIntensity: 1.55,
  practical: true
});
const GATE_LOW = material.neon({
  color: "#ffb454",
  emissive: "#ff9a3d",
  emissiveIntensity: 1.6,
  practical: true
});
const GATE_HIGH = material.neon({
  color: "#8b5cf6",
  emissive: "#a78bfa",
  emissiveIntensity: 1.4,
  practical: true
});
const GATE_PYLON = material.neon({
  color: "#38bdf8",
  emissive: "#67e8f9",
  emissiveIntensity: 1.55,
  practical: true
});
const GATE_MATERIALS = {
  wall: GATE_WALL,
  low: GATE_LOW,
  high: GATE_HIGH,
  pylon: GATE_PYLON
} as const;
const CRAFT_ACCENT = material.neon({
  color: "#38bdf8",
  emissive: "#3ff2ff",
  emissiveIntensity: 1.65,
  practical: true
});
const SHIELD_PLANE = material.emissive({
  color: "#3ff2ff",
  emissive: "#67e8f9",
  emissiveIntensity: 0.85,
  opacity: 0.55
});
const GRAZE_FLASH = material.neon({
  color: "#ffd166",
  emissive: "#ffd166",
  emissiveIntensity: 1.6,
  practical: true
});
const BEAT_RING = material.neon({
  color: "#ec4899",
  emissive: "#ff4fd8",
  emissiveIntensity: 1.25,
  opacity: 0.65,
  practical: true
});
const HULL_DARK = material.brushedMetal({
  color: "#1e293b",
  roughness: 0.24,
  anisotropy: 0.85
});

// -------------------------------------------------------------------- world --

function tunnelBackdropNodes(): AuraNodeInput[] {
  const archTransforms: AuraTransformSpec[] = [];
  const chromeTransforms: AuraTransformSpec[] = [];
  const cyanEqTransforms: AuraTransformSpec[] = [];
  const pinkEqTransforms: AuraTransformSpec[] = [];
  const ringCount = 8;

  for (let index = 0; index < ringCount; index += 1) {
    const progress = index / (ringCount - 1);
    const z = 0.8 - index * 1.65;
    const scale = 1.32 - progress * 0.36;
    const halfSpan = 1.62 * scale;
    const pillarH = 1.58 * scale;
    const eqH = (0.48 + ((index * 3) % 5) * 0.16) * scale;

    archTransforms.push(
      { position: [-halfSpan, TUNNEL_FLOOR_Y + pillarH * 0.5, z], rotation: [0, 0, -0.1], scale: [0.12 * scale, pillarH, 0.22] },
      { position: [halfSpan, TUNNEL_FLOOR_Y + pillarH * 0.5, z], rotation: [0, 0, 0.1], scale: [0.12 * scale, pillarH, 0.22] },
      { position: [0, TUNNEL_FLOOR_Y + pillarH + 0.08 * scale, z], scale: [halfSpan * 2.06, 0.1 * scale, 0.24] }
    );
    chromeTransforms.push(
      { position: [-halfSpan + 0.08 * scale, TUNNEL_FLOOR_Y + pillarH * 0.5, z + 0.04], scale: [0.035 * scale, pillarH * 0.92, 0.08] },
      { position: [halfSpan - 0.08 * scale, TUNNEL_FLOOR_Y + pillarH * 0.5, z + 0.04], scale: [0.035 * scale, pillarH * 0.92, 0.08] }
    );
    const eqLeft: AuraTransformSpec = {
      position: [-halfSpan + 0.22 * scale, TUNNEL_FLOOR_Y + eqH * 0.5, z - 0.35],
      scale: [0.07 * scale, eqH, 0.12]
    };
    const eqRight: AuraTransformSpec = {
      position: [halfSpan - 0.22 * scale, TUNNEL_FLOOR_Y + eqH * 0.5, z - 0.35],
      scale: [0.07 * scale, eqH, 0.12]
    };
    if (index % 2 === 0) {
      cyanEqTransforms.push(eqLeft);
      pinkEqTransforms.push(eqRight);
    } else {
      pinkEqTransforms.push(eqLeft);
      cyanEqTransforms.push(eqRight);
    }
  }

  return [
    primitives.plane({
      name: "glossy black neon tunnel floor",
      material: TUNNEL_DECK,
      castShadow: false,
      receiveShadow: true
    })
      .position(0, TUNNEL_FLOOR_Y, -5.2)
      .scale([5.4, 1, 13.6])
      .toJSON(),
    primitives.box({
      name: "left brushed metal side rail",
      material: TUNNEL_BRUSHED_ARCH,
      castShadow: false
    })
      .position(-1.42, TUNNEL_FLOOR_Y + 0.08, -5.0)
      .scale([0.16, 0.14, 13.2])
      .toJSON(),
    primitives.box({
      name: "right brushed metal side rail",
      material: TUNNEL_BRUSHED_ARCH,
      castShadow: false
    })
      .position(1.42, TUNNEL_FLOOR_Y + 0.08, -5.0)
      .scale([0.16, 0.14, 13.2])
      .toJSON(),
    primitives.box({
      name: "left vanishing light rail",
      material: NEON_CYAN_BAR,
      castShadow: false
    })
      .position(-1.28, TUNNEL_FLOOR_Y + 0.15, -5.0)
      .scale([0.055, 0.045, 13.0])
      .toJSON(),
    primitives.box({
      name: "right vanishing light rail",
      material: NEON_PINK_BAR,
      castShadow: false
    })
      .position(1.28, TUNNEL_FLOOR_Y + 0.15, -5.0)
      .scale([0.055, 0.045, 13.0])
      .toJSON(),
    primitives.box({
      name: "center flythrough camera path glow",
      material: LANE_GUIDE,
      castShadow: false
    })
      .position(0, TUNNEL_FLOOR_Y + 0.015, -5.0)
      .scale([0.045, 0.02, 12.6])
      .toJSON(),
    instances.box({
      name: "brushed metal tunnel arches",
      material: TUNNEL_BRUSHED_ARCH,
      castShadow: false,
      transforms: archTransforms
    }).toJSON(),
    instances.box({
      name: "chrome tunnel arch accents",
      material: TUNNEL_CHROME_TRIM,
      castShadow: false,
      transforms: chromeTransforms
    }).toJSON(),
    instances.box({
      name: "cyan neon equalizer pillars",
      material: NEON_CYAN_BAR,
      castShadow: false,
      transforms: cyanEqTransforms
    }).toJSON(),
    instances.box({
      name: "magenta neon equalizer pillars",
      material: NEON_PINK_BAR,
      castShadow: false,
      transforms: pinkEqTransforms
    }).toJSON(),
    effects.fog({ density: 0.058, color: "#1e1b4b" }).toJSON(),
    effects.contactOcclusion({ intensity: 0.24, radius: 0.58 }).toJSON(),
    effects.bloom({ intensity: 0.22, color: "#ec4899", threshold: 0.86, radius: 0.22, maxIntensity: 0.28 }).toJSON()
  ];
}

function laneRailNodes(): AuraNodeInput[] {
  return PULSE_LANE_X.map((x, index) =>
    primitives.box({
      name: `pulse lane guide ${index + 1}`,
      material: LANE_GUIDE,
      castShadow: false
    })
      .position(x, TUNNEL_FLOOR_Y + 0.02, (PULSE_PLAYER_Z - 13.5) / 2)
      .scale([0.1, 0.025, 8.0])
      .runtime(engineGame.runtimeNode(`pulse-lane-guide-${index + 1}`, {
        tags: ["lane-guide", "set-dressing", "renderer-owned"]
      }))
      .toJSON()
  );
}

function gatePoolNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  const kinds: PulseGateKind[] = ["wall", "low", "high", "pylon"];
  for (let index = 0; index < GATE_POOL_SIZE; index += 1) {
    nodes.push(
      primitives.box({
        name: `pulse gate frame ${index + 1}`,
        material: GATE_MATERIALS[kinds[index % kinds.length]!],
        castShadow: false
      })
        .position(0, -30, -30)
        .scale([0.1, 0.1, 0.1])
        .runtime(engineGame.runtimeNode(`pulse-gate-${index + 1}`, {
          tags: ["gate-frame", "sim-synced", "renderer-owned"]
        }))
        .toJSON()
    );
  }
  return nodes;
}

function buildPulseWorld(conveyor: PulseConveyor): {
  readonly nodes: AuraNodeInput[];
  readonly gateNodeNames: readonly string[];
} {
  const nodes: AuraNodeInput[] = [
    ...tunnelBackdropNodes(),
    model(assets.pulseReactorEncounterWorld, {
      name: "pulse reactor encounter world",
      targetMaxDimension: 18,
      role: "primaryWorld",
      castShadow: false
    })
      .position(0, 0.2, -6.5)
      .runtime(engineGame.runtimeNode("pulse-reactor-world", {
        tags: ["world", "typed-primary"]
      })),
    model(assets.pulseTerminalSentry, {
      name: "pulse terminal sentry",
      targetMaxDimension: 3.6,
      role: "primaryWorld",
      castShadow: false
    })
      .position(0, 0.85, -12.6)
      .runtime(engineGame.runtimeNode("pulse-terminal-sentry", {
        tags: ["prop", "sentry", "typed-primary"]
      })),
    instances.torus({
      name: "tunnel conveyor hoops cyan",
      material: CONVEYOR_CYAN,
      castShadow: false,
      transforms: conveyor.segments.filter((_, index) => index % 2 === 0)
    }),
    instances.torus({
      name: "tunnel conveyor hoops magenta",
      material: CONVEYOR_MAGENTA,
      castShadow: false,
      transforms: conveyor.segments.filter((_, index) => index % 2 === 1)
    }),
    ...laneRailNodes(),
    model(assets.pulseRunnerCraft, {
      name: "pulse runner craft",
      targetMaxDimension: 2.4,
      castShadow: true
    })
      .position(0, 0.08, PULSE_PLAYER_Z)
      .scale(0.8)
      .runtime(engineGame.runtimeNode("pulse-runner-craft", {
        tags: ["player", "craft", "typed-primary"]
      })),
    primitives.sphere({ name: "pulse craft engine glow", material: CRAFT_ACCENT, castShadow: false })
      .position(0, 0.2, PULSE_PLAYER_Z + 0.32)
      .scale([0.2, 0.2, 0.2])
      .runtime(engineGame.runtimeNode("pulse-craft-glow", {
        tags: ["player", "craft", "renderer-owned"]
      })),
    primitives.torus({ name: "pulse shield impact plane", material: SHIELD_PLANE, castShadow: false })
      .position(0, 0.35, PULSE_PLAYER_Z + 0.15)
      .scale([0.85, 0.62, 1])
      .runtime(engineGame.runtimeNode("pulse-shield-plane", {
        tags: ["player", "shield", "renderer-owned"]
      })),
    primitives.box({ name: "pulse runner hull plate", material: HULL_DARK, castShadow: false, receiveShadow: true })
      .position(0, TUNNEL_FLOOR_Y - 0.02, PULSE_PLAYER_Z)
      .scale([2.6, 0.02, 2.0])
      .runtime(engineGame.runtimeNode("pulse-hull-plate", {
        tags: ["set-dressing", "renderer-owned"]
      })),
    ...gatePoolNodes(),
    primitives.sphere({ name: "pulse graze flash", material: GRAZE_FLASH, castShadow: false })
      .position(0, -20, -20)
      .scale([0.22, 0.22, 0.22])
      .runtime(engineGame.runtimeNode("pulse-graze-flash", {
        tags: ["event-feedback", "renderer-owned"]
      })),
    primitives.torus({ name: "pulse beat ring", material: BEAT_RING, castShadow: false })
      .position(0, 0.35, PULSE_PLAYER_Z + 0.15)
      .scale([0.9, 0.66, 1])
      .runtime(engineGame.runtimeNode("pulse-beat-ring", {
        tags: ["beat-feedback", "renderer-owned"]
      })),
    primitives.box({
      name: "pulse section far glow",
      material: material.neon({
        color: "#8b5cf6",
        emissive: "#b18cff",
        emissiveIntensity: 1.35,
        opacity: 0.62,
        practical: true
      }),
      castShadow: false
    })
      .position(0, 0.9, -13.2)
      .scale([4.8, 2.9, 0.05])
      .runtime(engineGame.runtimeNode("pulse-far-glow", {
        tags: ["set-dressing", "renderer-owned"]
      }))
  ];
  return {
    nodes,
    gateNodeNames: Array.from({ length: GATE_POOL_SIZE }, (_, i) => `pulse-gate-${i + 1}`)
  };
}

function lightingNodes(): AuraNodeInput[] {
  return [
    lights.spot({
      name: "tunnel mouth key",
      color: "#b8ecff",
      intensity: 3.4,
      position: [0, 4.6, 4.4],
      target: [0, 0.2, -6],
      shadow: true
    }).toJSON(),
    lights.point({
      name: "cyan lane practical",
      color: "#2ee6ff",
      intensity: 3.1,
      position: [-1.6, 0.5, -3]
    }).toJSON(),
    lights.point({
      name: "magenta lane practical",
      color: "#ff3fd4",
      intensity: 3.1,
      position: [1.6, 0.5, -3]
    }).toJSON(),
    lights.point({
      name: "deep tunnel violet practical",
      color: "#9d6bff",
      intensity: 2.3,
      position: [0, 1.8, -10]
    }).toJSON(),
    environments.hdri({
      name: "deep space dome reflections",
      texture: assets.synthwaveDomeHdr,
      intensity: 0.85
    }).toJSON()
  ];
}

// ------------------------------------------------------------------- camera --

const EYE_Z = PULSE_PLAYER_Z + 2.6;
const EYE_Y = 0.85;
const TARGET_Z = -8;
const TARGET_Y = 0.4;
const FOV = 62;
const EYE_X_FRACTION = 0.4;
const EYE_Y_FRACTION = 0.55;
const TARGET_X_FRACTION = 0.55;
const TARGET_Y_FRACTION = 0.45;

function createPulseRig(state: { x: number; y: number }): AuraCameraRig {
  const pose: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    up: [number, number, number];
    roll: number;
  } = {
    position: [0, EYE_Y, EYE_Z],
    target: [0, TARGET_Y, TARGET_Z],
    fov: FOV,
    up: [0, 1, 0],
    roll: 0
  };

  return {
    id: "pulse-tunnel.chase",
    reset: () => {
      pose.position = [0, EYE_Y, EYE_Z];
      pose.target = [0, TARGET_Y, TARGET_Z];
    },
    update(ctx: AuraCameraRigContext): AuraCameraPose {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.1);
      pose.position[0] += (state.x * EYE_X_FRACTION - pose.position[0]) * k;
      pose.position[1] += (EYE_Y + state.y * EYE_Y_FRACTION - pose.position[1]) * k;
      pose.target[0] += (state.x * TARGET_X_FRACTION - pose.target[0]) * k;
      pose.target[1] += (TARGET_Y + state.y * TARGET_Y_FRACTION - pose.target[1]) * k;
      return { ...pose, near: 0.1, far: 120 };
    }
  };
}

// -------------------------------------------------------------------- audio --

function createTunnelAudio() {
  let context: AudioContext | null = null;
  try {
    const Ctor = window.AudioContext;
    if (typeof Ctor === "function") context = new Ctor();
  } catch {
    context = null;
  }

  const stems: Record<PulseStemCue, { url: string }> = {
    stemDrums: { url: assets.pulseDrumsStem.url },
    stemBass: { url: assets.pulseBassStem.url },
    stemLead: { url: assets.pulseLeadStem.url },
    stemAir: { url: assets.pulseAirStem.url }
  };

  const decoded = new Map<PulseStemCue, AudioBuffer>();
  const activeSources = new Set<AudioBufferSourceNode>();
  let scheduledAnchor: number | null = null;

  function makeStemPlay(cue: PulseStemCue) {
    return (audioContext: GameAudioContextLike, destination: AudioNode): void => {
      if (!context) return;
      const buffer = decoded.get(cue);
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      const when = scheduledAnchor ?? audioContext.currentTime + START_LEAD_SECONDS;
      source.start(when);
      source.onended = () => activeSources.delete(source);
      activeSources.add(source);
    };
  }

  const audio: GameAudio<PulseAudioCue> = createGameAudio<PulseAudioCue>({
    ...(context ? { context } : {}),
    buses: [
      { id: "drums", volume: STEM_LEVEL },
      { id: "bass", volume: 0 },
      { id: "lead", volume: 0 },
      { id: "air", volume: 0 },
      { id: "sfx", volume: SFX_LEVEL }
    ],
    cues: {
      stemDrums: { id: "stemDrums", bus: "drums", volume: STEM_LEVEL, play: makeStemPlay("stemDrums") },
      stemBass: { id: "stemBass", bus: "bass", volume: STEM_LEVEL, play: makeStemPlay("stemBass") },
      stemLead: { id: "stemLead", bus: "lead", volume: STEM_LEVEL, play: makeStemPlay("stemLead") },
      stemAir: { id: "stemAir", bus: "air", volume: STEM_LEVEL, play: makeStemPlay("stemAir") },
      laneSwitch: { id: "laneSwitch", bus: "sfx", asset: assets.pulseLaneSwitchSfx },
      jump: { id: "jump", bus: "sfx", asset: assets.pulseJumpSfx },
      slide: { id: "slide", bus: "sfx", asset: assets.pulseSlideSfx },
      graze: { id: "graze", bus: "sfx", asset: assets.pulseGrazeSfx },
      shieldHit: { id: "shieldHit", bus: "sfx", asset: assets.pulseShieldHitSfx },
      shieldBreak: { id: "shieldBreak", bus: "sfx", asset: assets.pulseShieldBreakSfx },
      sectionRise: { id: "sectionRise", bus: "sfx", asset: assets.pulseSectionRiseSfx },
      runOver: { id: "runOver", bus: "sfx", asset: assets.pulseRunOverSfx },
      uiConfirm: { id: "uiConfirm", bus: "sfx", asset: assets.pulseUiConfirmSfx }
    }
  });

  async function decodeStems(): Promise<number> {
    if (!context) return 0;
    const entries: [PulseStemCue, string][] = [
      ["stemDrums", stems.stemDrums.url],
      ["stemBass", stems.stemBass.url],
      ["stemLead", stems.stemLead.url],
      ["stemAir", stems.stemAir.url]
    ];
    await Promise.all(
      entries.map(async ([cue, url]) => {
        if (decoded.has(cue)) return;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`stem fetch failed: ${url}`);
        const bytes = await response.arrayBuffer();
        decoded.set(cue, await context!.decodeAudioData(bytes));
      })
    );
    return decoded.size;
  }

  function stopActiveSources(): void {
    for (const source of [...activeSources]) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    activeSources.clear();
  }

  return {
    async unlock(): Promise<boolean> {
      if (!context) return false;
      try {
        await audio.unlock();
        await decodeStems();
        return context.state === "running";
      } catch {
        return false;
      }
    },
    async startRun(): Promise<number | null> {
      if (!context || decoded.size < 4) return null;
      stopActiveSources();
      scheduledAnchor = context.currentTime + START_LEAD_SECONDS;
      audio.cue("stemDrums");
      audio.cue("stemBass");
      audio.cue("stemLead");
      audio.cue("stemAir");
      return scheduledAnchor;
    },
    stopStems(): void {
      stopActiveSources();
    },
    applySection(sectionId: string): void {
      const audible = PULSE_SECTION_BUSES[sectionId] ?? PULSE_SECTION_BUSES.intro;
      for (const bus of PULSE_STEM_BUS_IDS) {
        audio.setBusVolume(bus, audible.includes(bus) ? STEM_LEVEL : 0);
      }
    },
    duckForSummary(): void {
      for (const bus of PULSE_STEM_BUS_IDS) audio.setBusVolume(bus, 0);
    },
    async suspend(): Promise<void> {
      if (context && context.state === "running") await context.suspend().catch(() => undefined);
    },
    async resume(): Promise<void> {
      if (context && context.state === "suspended") await context.resume().catch(() => undefined);
    },
    async sfx(name: PulseSfxCue): Promise<void> {
      await audio.cue(name);
    },
    nowSeconds(): number {
      return context?.currentTime ?? 0;
    }
  };
}

// ---------------------------------------------------------------- sim state --

const target = document.getElementById("app") ?? document.body;
const player = createPulsePlayer();
const style = createPulseStyleSystem();
const chart = buildPulseChart();
const bootedAtMs = performance.now();
let frame = 0;
let autoplayEnabled = false;
let actionSparkPin = false;

const rs = {
  runState: "ready" as RunState,
  shields: MAX_SHIELDS,
  passed: 0,
  passedOnBeat: 0,
  grazes: 0,
  collisions: 0,
  finishedReason: null as string | null,
  lastSection: "intro",
  lastBeat: -1,
  runAnchorSeconds: 0,
  pendingStart: false
};

const rigState = { x: 0, y: 0 };
const conveyor = createPulseConveyor({
  segmentLength: 1.35,
  liveCount: PULSE_CONVEYOR_BUDGET.high,
  headZ: PULSE_SPAWN_Z - 1.1,
  recycleZ: PULSE_PLAYER_Z + 0.2,
  y: 0.32,
  scale: [1.94, 1.48, 1]
});
const world = buildPulseWorld(conveyor);

function buildScene() {
  return scene()
    .background(TUNNEL_BG)
    .camera(camera.perspective({
      position: [0, EYE_Y, EYE_Z],
      target: [0, TARGET_Y, TARGET_Z],
      fov: FOV
    }))
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

const tunnelAudio = createTunnelAudio();
const audioCueLog: string[] = [];
const routeEvents = engineGame.eventLog({ label: "pulse tunnel events", maxEvents: 24 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" }
] as const;

function pushCue(cue: PulseSfxCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  routeEvents.push({ type: cue, label: cue });
  void tunnelAudio.sfx(cue).catch(() => undefined);
}

const unlockAudio = () => void tunnelAudio.unlock().catch(() => undefined);
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// --------------------------------------------------------------------- game --

let latestSnapshot: PulseTunnelSnapshot | undefined;

const pulseGame = createGame({
  id: PULSE_EVIDENCE_ID,
  target,
  layout: "full-bleed",
  scene: buildScene,
  diagnostics: {
    overlay: false,
    performancePanel: false
  },
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "score", kind: "prompt", anchor: "top-left", label: "SCORE" },
      { id: "multiplier", kind: "prompt", anchor: "top-right", label: "MULT" },
      { id: "section", kind: "prompt", anchor: "top", label: "SECTION" },
      { id: "shields", kind: "prompt", anchor: "bottom-left", label: "SHIELDS" },
      { id: "message", kind: "prompt", anchor: "bottom", label: "RUN" }
    ]
  },
  touch: {
    preset: "lane-swipe",
    bindings: {
      left: "swipe-left",
      right: "swipe-right",
      jump: "swipe-up",
      slide: "swipe-down",
      confirm: "tap",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      "lane-switch": { asset: assets.pulseLaneSwitchSfx },
      "jump": { asset: assets.pulseJumpSfx },
      "slide": { asset: assets.pulseSlideSfx },
      "graze": { asset: assets.pulseGrazeSfx },
      "shield-hit": { asset: assets.pulseShieldHitSfx },
      "shield-break": { asset: assets.pulseShieldBreakSfx },
      "section-rise": { asset: assets.pulseSectionRiseSfx },
      "run-over": { asset: assets.pulseRunOverSfx },
      "ui-confirm": { asset: assets.pulseUiConfirmSfx },
      "stem-drums": { asset: assets.pulseDrumsStem },
      "stem-bass": { asset: assets.pulseBassStem },
      "stem-lead": { asset: assets.pulseLeadStem },
      "stem-air": { asset: assets.pulseAirStem }
    }
  },
  juice: {
    "shield-hit": { hitStopMs: 50, trauma: 0.3 },
    "shield-break": { hitStopMs: 80, trauma: 0.5 },
    "section-rise": { hitStopMs: 40, trauma: 0.22 },
    "run-clear": { trauma: 0.25 },
    "run-fail": { hitStopMs: 90, trauma: 0.55 }
  },
  qualityRebuild: {
    flags: ["game"]
  }
});

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, pulseGame.app.nodes.get(name));
  return handles.get(name);
}

// ----------------------------------------------------------------------- fx --

let beatRingScale = 0;
let grazeFlashRemaining = 0;

const fx = {
  laneSwitch(x: number, y: number, z: number): void {
    pulseGame.fx.burst("streak", [x, Math.max(y, 0.1), z], { count: 7, speed: 2.4, color: "#3ff2ff" });
  },
  jump(x: number, _y: number, z: number): void {
    pulseGame.fx.burst("dust", [x, 0.05, z], { count: 4, speed: 1.6, color: "#bae6fd" });
  },
  slide(x: number, _y: number, z: number): void {
    pulseGame.fx.burst("streak", [x, 0.08, z], { count: 4, speed: 3, color: "#67e8f9" });
  },
  graze(x: number, y: number, z: number): void {
    handle("pulse-graze-flash")?.setPosition(x, Math.max(y, 0.2), z).setVisible(true);
    grazeFlashRemaining = 0.35;
    pulseGame.fx.burst("pickup", [x, Math.max(y, 0.2), z], { count: 6, speed: 2.2, color: "#ffd166" });
    pulseGame.app.camera?.shake.add(0.08);
  },
  shieldHit(x: number, y: number, z: number, final: boolean): void {
    pulseGame.fx.burst("ring", [x, Math.max(y, 0.35), z + 0.15], { count: 8, speed: 4, color: "#ff4fd8" });
    pulseGame.fx.burst("debris", [x, 0.4, z], { count: 6, speed: 3 });
    pulseGame.app.camera?.shake.add(final ? 0.5 : 0.3);
    pulseGame.session.hitStop(final ? 0.08 : 0.05);
  },
  gatePassed(x: number, z: number): void {
    pulseGame.fx.burst("spark", [x, 0.5, z], { count: 9, speed: 1.8, color: "#7df3ff" });
  },
  beat(beat: number): void {
    beatRingScale = beat % 4 === 0 ? 1.35 : 1.12;
    if (beat % 4 === 0) {
      pulseGame.fx.burst("ring", [0, 0.35, 1.55], { count: 4, speed: 1.2, color: "#ff4fd8" });
    }
  },
  sectionRise(): void {
    pulseGame.fx.burst("ring", [0, 0.35, 1.55], { count: 14, speed: 5, color: "#a78bfa" });
    pulseGame.app.camera?.shake.add(0.22);
    pulseGame.session.hitStop(0.04);
  },
  runOver(completed: boolean): void {
    pulseGame.app.camera?.shake.add(completed ? 0.25 : 0.55);
    pulseGame.session.hitStop(completed ? 0.03 : 0.09);
    if (!completed) {
      pulseGame.fx.burst("explosion-small", [0, 0.4, 1.55], { count: 18, speed: 4.5 });
    }
  },
  step(dt: number): void {
    if (beatRingScale > 0.9) {
      beatRingScale = Math.max(0.9, beatRingScale - dt * 1.6);
      handle("pulse-beat-ring")?.setScale([0.9 * beatRingScale, 0.66 * beatRingScale, 1]);
    }
    if (grazeFlashRemaining > 0) {
      grazeFlashRemaining -= dt;
      if (grazeFlashRemaining <= 0) {
        handle("pulse-graze-flash")?.setPosition(0, -20, -20).setVisible(false);
      }
    }
    if (actionSparkPin && pulseGame.fx.liveCount === 0) {
      pulseGame.fx.burst("spark", [0, 0.5, PULSE_PLAYER_Z], { count: 12, speed: 2.2, color: "#7df3ff" });
    }
  }
};

// --------------------------------------------------------- clock & run state --

const clock = createBeatClock({
  getAudioTime: () => tunnelAudio.nowSeconds(),
  getFrameTime: () => performance.now() / 1000,
  onBeat: (beat) => fx.beat(beat),
  onDriftCheck: () => undefined
});

const gateSystem = createGateSystem({
  chart,
  getSchedulerTime: () => clock.time(),
  getAudioElapsed: () => Math.max(0, tunnelAudio.nowSeconds() - rs.runAnchorSeconds),
  getPlayer: () => player.snapshot(),
  onPass: (event) => {
    if (event.type === "collision") {
      rs.collisions += 1;
      applyShieldHit();
    } else {
      rs.passed += 1;
      rs.passedOnBeat += 1;
      if (event.type === "graze") {
        rs.grazes += 1;
        style.graze();
        fx.graze(player.snapshot().x, player.snapshot().y, PULSE_PLAYER_Z);
        pushCue("graze");
      } else {
        fx.gatePassed(player.snapshot().x, PULSE_PLAYER_Z);
      }
    }
  }
});

function startRun(): void {
  if (rs.runState === "running") return;
  player.reset();
  style.reset();
  gateSystem.reset();
  clock.reset();
  rs.shields = MAX_SHIELDS;
  rs.passed = 0;
  rs.passedOnBeat = 0;
  rs.grazes = 0;
  rs.collisions = 0;
  rs.finishedReason = null;
  rs.lastSection = "intro";
  rs.lastBeat = -1;
  rs.runState = "running";
  rs.pendingStart = false;
  pushCue("uiConfirm");
  void tunnelAudio
    .unlock()
    .then(() => tunnelAudio.startRun())
    .then((anchor) => {
      rs.runAnchorSeconds = anchor ?? 0;
      clock.start(anchor);
    })
    .catch(() => clock.start(null));
}

function endRun(reason: string): void {
  rs.runState = "summary";
  rs.finishedReason = reason;
  tunnelAudio.stopStems();
  tunnelAudio.duckForSummary();
  pushCue("runOver");
  fx.runOver(reason === "completed");
}

function applyShieldHit(): void {
  rs.shields = Math.max(0, rs.shields - 1);
  player.applyInvuln(PULSE_INVULN_SECONDS);
  const p = player.snapshot();
  fx.shieldHit(p.x, p.y, PULSE_PLAYER_Z, rs.shields <= 0);
  pushCue(rs.shields <= 0 ? "shieldBreak" : "shieldHit");
  if (rs.shields <= 0) endRun("shields-exhausted");
}

function resetToReady(): void {
  tunnelAudio.stopStems();
  player.reset();
  style.reset();
  gateSystem.reset();
  clock.reset();
  rs.shields = MAX_SHIELDS;
  rs.passed = 0;
  rs.passedOnBeat = 0;
  rs.grazes = 0;
  rs.collisions = 0;
  rs.finishedReason = null;
  rs.lastSection = "intro";
  rs.lastBeat = -1;
  rs.runState = "ready";
  rs.pendingStart = false;
  rigState.x = 0;
  rigState.y = 0;
  routeEvents.push({ type: "reset", label: "reset" });
}

// ------------------------------------------------------------- gate visuals --

const gateSlots = new Map<string, number>();
interface GateSlotCache {
  visible: boolean;
  kind: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}
const gateSlotCache: GateSlotCache[] = Array.from({ length: GATE_POOL_SIZE }, () => ({
  visible: true,
  kind: "",
  x: 0,
  y: -30,
  z: -30,
  w: 0.1,
  h: 0.1
}));

function syncGates(): void {
  const active = gateSystem.activeGates();
  if (active.length === 0 && gateSlots.size === 0) return;
  const liveIds = new Set(active.map((g) => g.id));
  for (const [id, slot] of gateSlots) {
    if (!liveIds.has(id)) {
      gateSlots.delete(id);
      const cached = gateSlotCache[slot]!;
      if (cached.visible || cached.y !== -30 || cached.z !== -30) {
        cached.visible = false;
        cached.x = 0;
        cached.y = -30;
        cached.z = -30;
        handle(world.gateNodeNames[slot]!)?.setPosition(0, -30, -30).setVisible(false);
      }
    }
  }
  const nowTime = clock.time();
  for (const gate of active) {
    let slot = gateSlots.get(gate.id);
    if (slot === undefined) {
      const used = new Set(gateSlots.values());
      slot = [0, 1, 2, 3].find((i) => !used.has(i));
      if (slot === undefined) continue;
      gateSlots.set(gate.id, slot);
      const cached = gateSlotCache[slot]!;
      const kind = gate.entry.kind as PulseGateKind;
      const nodeHandle = handle(world.gateNodeNames[slot]!);
      if (cached.kind !== kind) {
        cached.kind = kind;
        nodeHandle?.setMaterial(GATE_MATERIALS[kind] ?? GATE_MATERIALS.wall);
      }
      if (!cached.visible) {
        cached.visible = true;
        nodeHandle?.setVisible(true);
      }
    }
    const geometry = pulseGateGeometry(gate.entry, nowTime);
    const centerY = (geometry.bottomY + geometry.topY) / 2;
    const width = geometry.halfWidth * 2;
    const height = Math.max(0.08, geometry.topY - geometry.bottomY);
    const cached = gateSlotCache[slot]!;
    const nodeHandle = handle(world.gateNodeNames[slot]!);
    if (
      Math.abs(cached.x - geometry.centerX) > 1e-4 ||
      Math.abs(cached.y - centerY) > 1e-4 ||
      Math.abs(cached.z - gate.z) > 1e-4
    ) {
      cached.x = geometry.centerX;
      cached.y = centerY;
      cached.z = gate.z;
      nodeHandle?.setPosition(geometry.centerX, centerY, gate.z);
    }
    if (Math.abs(cached.w - width) > 1e-4 || Math.abs(cached.h - height) > 1e-4) {
      cached.w = width;
      cached.h = height;
      nodeHandle?.setScale([width, height, 0.12]);
    }
  }
}

// -------------------------------------------------------------------- input --

const input = engineGame.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp", "Space"],
    slide: ["KeyS", "ArrowDown"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"],
    confirm: ["Enter", "KeyJ"]
  },
  bufferMs: 90
});

window.addEventListener(
  "keydown",
  (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  },
  { passive: false }
);

interface PulseTouchActions {
  left: boolean;
  right: boolean;
  jump: boolean;
  slide: boolean;
  confirm: boolean;
}

const touchActions: PulseTouchActions = {
  left: false,
  right: false,
  jump: false,
  slide: false,
  confirm: false
};
let swipeStartX = 0;
let swipeStartY = 0;
let swipeAt = 0;

target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  swipeStartX = e.clientX;
  swipeStartY = e.clientY;
  swipeAt = performance.now();
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
target.addEventListener("pointerup", (e: PointerEvent) => {
  if (swipeAt <= 0) return;
  const dx = e.clientX - swipeStartX;
  const dy = e.clientY - swipeStartY;
  const dist = Math.hypot(dx, dy);
  if (performance.now() - swipeAt < 240 && dist < 16) {
    touchActions.confirm = true;
  } else if (dist >= 24) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx < 0) touchActions.left = true;
      else touchActions.right = true;
    } else if (dy < 0) {
      touchActions.jump = true;
    } else {
      touchActions.slide = true;
    }
  }
  swipeAt = 0;
});
target.addEventListener("pointercancel", () => {
  swipeAt = 0;
});

function consumeTouchActions(): PulseTouchActions {
  const out = { ...touchActions };
  touchActions.left = false;
  touchActions.right = false;
  touchActions.jump = false;
  touchActions.slide = false;
  touchActions.confirm = false;
  return out;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pulseGame.session.pause("visibility");
    void tunnelAudio.suspend();
  } else {
    pulseGame.sessionImpl.releasePause("visibility");
    void tunnelAudio.resume();
  }
});

// ---------------------------------------------------------------------- HUD --

const hudRoot = createHudDom();

function createHudDom(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "pulse-tunnel-hud";
  root.style.cssText = [
    "position:fixed",
    "left:14px",
    "bottom:54px",
    "z-index:5",
    "max-width:260px",
    "font:500 11px/1.35 system-ui, sans-serif",
    "color:#ecf8ff",
    "background:rgba(15,9,35,0.74)",
    "border:1px solid rgba(63,242,255,0.38)",
    "border-radius:8px",
    "padding:7px 10px",
    "opacity:0.88",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

let lastHudSignature = "";
let lastHudWrite = 0;

function syncHud(): void {
  const snapshot = style.snapshot();
  const remaining = Math.max(0, RUN_SECONDS - clock.elapsed());
  const signature = [
    rs.runState,
    rs.lastSection,
    Math.round(snapshot.score),
    snapshot.multiplier.toFixed(1),
    rs.shields,
    Math.ceil(remaining)
  ].join("|");
  if (signature === lastHudSignature && frame - lastHudWrite < 120) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  const shieldsText = `SHIELDS ${"▮".repeat(rs.shields)}${"▯".repeat(MAX_SHIELDS - rs.shields)}`;
  const statusMsg =
    rs.runState === "ready"
      ? "PRESS ANY KEY / SWIPE TO START"
      : rs.runState === "summary"
        ? `${rs.finishedReason === "completed" ? "RUN COMPLETE" : "SHIELDS EXHAUSTED"} — R TO RUN AGAIN`
        : `${Math.ceil(remaining)}s`;
  pulseGame.hud.set("score", `${Math.round(snapshot.score)}`);
  pulseGame.hud.set("multiplier", `x${snapshot.multiplier.toFixed(1)}`);
  pulseGame.hud.set("section", rs.lastSection.toUpperCase());
  pulseGame.hud.set("shields", shieldsText);
  pulseGame.hud.set("message", statusMsg);
  hudRoot.innerHTML = [
    `<strong>Pulse Tunnel</strong>`,
    `<div>State ${rs.runState.toUpperCase()} | Section ${rs.lastSection.toUpperCase()} | Sync ${clock.sample().mode}</div>`,
    `<div>Score ${Math.round(snapshot.score)} | Mult x${snapshot.multiplier.toFixed(1)} | ${shieldsText}</div>`,
    `<div>Gates ${rs.passed} passed | ${rs.grazes} grazes | ${statusMsg}</div>`,
    `<div>A/D lane switch. W/Space jump. S slide. P pause. R reset.</div>`
  ].join("");
}

// ----------------------------------------------------------------- evidence --

const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(pulseGame.lookSource()),
  postPreset: "neon-night",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "pulse-tunnel.chase"
});

function buildRunSnapshot(): PulseRunSnapshot {
  return {
    state: rs.runState,
    sectionId: rs.lastSection,
    beat: rs.lastBeat,
    elapsed: clock.elapsed(),
    shields: rs.shields,
    passed: rs.passed,
    passedOnBeat: rs.passedOnBeat,
    grazes: rs.grazes,
    collisions: rs.collisions,
    finishedReason: rs.finishedReason
  };
}

let hasPresentedDraw = false;
const typedAssetCount = Object.keys(assets).length;

function isCanvasMatchingViewport(): boolean {
  const canvas = pulseGame.app.canvas;
  if (!canvas) return false;
  const dpr = window.devicePixelRatio || 1;
  return (
    Math.abs(canvas.width - window.innerWidth * dpr) <= 2 &&
    Math.abs(canvas.height - window.innerHeight * dpr) <= 2
  );
}

function buildFramingSnapshot() {
  const ev = pulseGame.app.camera?.evidence?.();
  return {
    rig: ev?.rig ?? "pulse-tunnel.chase",
    subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
    pose: ev?.pose ?? null,
    canvasMatchesViewport: isCanvasMatchingViewport()
  };
}

function installGlobalEvidence(): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[PULSE_EVIDENCE_ID] = {
    get playback() {
      return {
        state: pulseGame.session.state,
        paused: pulseGame.session.paused,
        simTime: pulseGame.session.simTime,
        timeScale: pulseGame.session.timeScale,
        frame
      };
    },
    get run() {
      return buildRunSnapshot();
    },
    get gates() {
      return {
        active: gateSystem.activeGates().length,
        pending: gateSystem.pendingCount(),
        passed: rs.passed,
        passedOnBeat: rs.passedOnBeat,
        grazes: rs.grazes,
        collisions: rs.collisions
      };
    },
    get player() {
      const p: PulsePlayerState = player.snapshot();
      return {
        lane: p.lane,
        x: p.x,
        y: p.y,
        airborne: p.airborne,
        sliding: p.sliding,
        colliderTop: p.colliderTop,
        invulnerable: p.invulnRemaining > 0
      };
    },
    get style() {
      const s = style.snapshot();
      return {
        heat: s.heat,
        multiplier: s.multiplier,
        score: s.score,
        distance: s.distance,
        grazes: s.grazes
      };
    },
    get sync() {
      const c = clock.sample();
      return {
        mode: c.mode,
        time: c.time,
        driftMs: c.driftMs,
        driftChecksFailed: c.driftChecksFailed,
        flipped: c.flippedAtTime !== null
      };
    },
    get fx() {
      return { liveCount: pulseGame.fx.liveCount, backend: pulseGame.fx.backend };
    },
    get framing() {
      return buildFramingSnapshot();
    },
    get render() {
      const d = pulseGame.app.diagnostics();
      return {
        backend: d.backend,
        drawCalls: d.drawCalls,
        renderSize: d.renderSize,
        fps: d.fps,
        errors: d.errors,
        warnings: d.warnings
      };
    },
    get appliedLook() {
      return appliedLook;
    },
    get audio() {
      return { cues: [...audioCueLog] };
    },
    get boot() {
      return { bootedAtMs, frame };
    }
  };
}

function publishSnapshot(): void {
  const s = style.snapshot();
  const p = player.snapshot();
  const c = clock.sample();
  const runSnap = buildRunSnapshot();
  if (!hasPresentedDraw && pulseGame.app.diagnostics().drawCalls > 0) {
    hasPresentedDraw = true;
  }
  let cachedFraming: PulseTunnelSnapshot["framing"] | undefined;
  let cachedEvidence: unknown;
  const snapshot: PulseTunnelSnapshot = {
    framed: hasPresentedDraw && isCanvasMatchingViewport(),
    state: pulseGame.session.state,
    frame,
    run: runSnap,
    gates: {
      active: gateSystem.activeGates().length,
      pending: gateSystem.pendingCount(),
      passed: rs.passed,
      passedOnBeat: rs.passedOnBeat,
      grazes: rs.grazes,
      collisions: rs.collisions
    },
    player: {
      lane: p.lane,
      x: p.x,
      y: p.y,
      airborne: p.airborne,
      sliding: p.sliding,
      colliderTop: p.colliderTop,
      invulnerable: p.invulnRemaining > 0
    },
    style: s,
    sync: {
      mode: c.mode,
      time: c.time,
      driftMs: c.driftMs,
      driftChecksFailed: c.driftChecksFailed,
      flipped: c.flippedAtTime !== null
    },
    fx: { liveCount: pulseGame.fx.liveCount, backend: pulseGame.fx.backend },
    get framing() {
      cachedFraming ??= buildFramingSnapshot();
      return cachedFraming;
    },
    look: { id: "neon-night", category: "stylized" },
    appliedLook,
    audio: { cues: [...audioCueLog] },
    get evidence() {
      cachedEvidence ??= pulseGame.app.evidence({
        input,
        events: routeEvents,
        hud: hudBindings,
        appState: {
          score: Math.round(s.score),
          objective: `Section ${rs.lastSection.toUpperCase()} — ${rs.shields} shields`
        },
        assets: { typedAssets: typedAssetCount, missingAssets: [] },
        source: { expectsGame: true }
      });
      return cachedEvidence;
    }
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
  void latestSnapshot;
}

installGlobalEvidence();

// ---------------------------------------------------------------- scenarios --

function startHeadlessRun(): void {
  if (rs.runState !== "running") {
    rs.runState = "running";
    rs.pendingStart = false;
    player.reset();
    style.reset();
    gateSystem.reset();
    clock.reset();
    clock.start(null);
  }
}

function seekToBeat(beat: number): void {
  const delta = Math.max(0, pulseTimeForBeat(beat) - clock.time());
  clock.advanceScheduler(delta);
  gateSystem.respace();
  rs.lastBeat = Math.floor(clock.elapsed() / 0.5);
  rs.lastSection = pulseSectionAtTime(clock.elapsed()).id;
}

const params = new URL(location.href).searchParams;
if (params.get("autorun") === "1") {
  autoplayEnabled = true;
  rs.pendingStart = true;
}
const scenario = params.get("scenario");
if (scenario === "02-opening") {
  startHeadlessRun();
  seekToBeat(12);
} else if (scenario === "03-mid" || scenario === "mid-run") {
  startHeadlessRun();
  seekToBeat(56);
  rs.passed = Math.max(rs.passed, 2);
  rs.passedOnBeat = Math.max(rs.passedOnBeat, 2);
  style.step(2);
} else if (scenario === "04-action" || scenario === "drop") {
  startHeadlessRun();
  seekToBeat(80);
  rs.passed = Math.max(rs.passed, 4);
  rs.passedOnBeat = Math.max(rs.passedOnBeat, 4);
  style.step(4);
  actionSparkPin = true;
  pulseGame.fx.burst("spark", [0, 0.5, PULSE_PLAYER_Z], { count: 12, speed: 2.2, color: "#7df3ff" });
} else if (scenario === "low-shields") {
  startHeadlessRun();
  seekToBeat(20);
  for (let i = 0; i < 2; i += 1) {
    if (rs.shields > 0) {
      rs.shields = Math.max(0, rs.shields - 1);
      player.applyInvuln(PULSE_INVULN_SECONDS);
    }
  }
}

// --------------------------------------------------------------- frame loop --

let lastCraftX = Number.NaN;
let lastCraftY = Number.NaN;
let lastCraftVy = Number.NaN;
let lastCraftSliding: boolean | undefined;

function syncCraftVisuals(x: number, y: number, vy: number, sliding: boolean): void {
  const posChanged = Math.abs(x - lastCraftX) > 1e-4 || Math.abs(y - lastCraftY) > 1e-4;
  const slideChanged = sliding !== lastCraftSliding;
  const vyChanged = Math.abs(vy - lastCraftVy) > 1e-4;
  if (!posChanged && !slideChanged && !vyChanged) return;

  lastCraftX = x;
  lastCraftY = y;
  lastCraftVy = vy;
  lastCraftSliding = sliding;

  const craftHandle = handle("pulse-runner-craft");
  if (posChanged) {
    craftHandle?.setPosition(x, 0.08 + y, PULSE_PLAYER_Z);
    handle("pulse-shield-plane")?.setPosition(x, 0.35 + y, PULSE_PLAYER_Z + 0.15);
    handle("pulse-beat-ring")?.setPosition(x, 0.35 + y, PULSE_PLAYER_Z + 0.15);
  }
  if (slideChanged) {
    craftHandle?.setRotation(0, 0, sliding ? 0.18 : 0);
  }
  const glowHandle = handle("pulse-craft-glow");
  if (posChanged) {
    glowHandle?.setPosition(x, 0.2 + y, PULSE_PLAYER_Z + 0.32);
  }
  if (vyChanged) {
    const glowScale = 0.2 * (1 + vy * 0.4);
    glowHandle?.setScale([glowScale, glowScale, 0.2]);
  }
}

pulseGame.app.onFrame?.(({ dt: rawDt }) => {
  const baseDt = Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1 / 60;
  const scaledDt = pulseGame.session.scaledDt(baseDt);
  frame += 1;
  input.update(baseDt);

  if (input.pressed("pause") && rs.runState === "running") {
    if (pulseGame.session.paused) pulseGame.session.resume();
    else pulseGame.session.pause();
  }
  if (input.pressed("reset")) {
    resetToReady();
    syncCraftVisuals(0, 0, 0, false);
    syncGates();
    syncHud();
    publishSnapshot();
    return;
  }

  if (pulseGame.session.paused || scaledDt <= 0) {
    publishSnapshot();
    return;
  }

  const stepSeconds = Math.min(0.05, Math.max(1 / 240, scaledDt));
  const pressedNow = consumeTouchActions();
  const wantsStart =
    input.pressed("left") ||
    input.pressed("right") ||
    input.pressed("jump") ||
    input.pressed("slide") ||
    input.pressed("confirm") ||
    pressedNow.left ||
    pressedNow.right ||
    pressedNow.jump ||
    pressedNow.slide ||
    pressedNow.confirm;

  if (rs.runState === "ready" || rs.runState === "summary") {
    if (wantsStart || rs.pendingStart) startRun();
    rigState.x = 0;
    rigState.y = 0;
    syncCraftVisuals(0, 0, 0, false);
    syncGates();
    fx.step(stepSeconds);
    syncHud();
    publishSnapshot();
    return;
  }

  clock.update();
  const pressed = {
    left: input.pressed("left") || pressedNow.left,
    right: input.pressed("right") || pressedNow.right,
    jump: input.pressed("jump") || pressedNow.jump,
    slide: input.pressed("slide") || pressedNow.slide
  };

  if (autoplayEnabled) {
    const snap = player.snapshot();
    const nextGate = gateSystem.activeGates()[0];
    if (nextGate && nextGate.z > PULSE_PLAYER_Z - 3.2 && nextGate.z < PULSE_PLAYER_Z + 0.2) {
      if (nextGate.entry.kind === "low" && !snap.airborne) {
        pressed.jump = true;
      } else if (nextGate.entry.kind === "high" && !snap.sliding) {
        pressed.slide = true;
      } else if (nextGate.entry.lane === snap.lane) {
        if (snap.lane > 0) pressed.left = true;
        else pressed.right = true;
      }
    }
  }

  const nowMs = performance.now();
  const playerState = player.step(stepSeconds, nowMs, pressed);
  for (const eventName of playerState.events) {
    if (eventName === "lane-left" || eventName === "lane-right") {
      pushCue("laneSwitch");
      fx.laneSwitch(playerState.x, playerState.y, PULSE_PLAYER_Z);
    } else if (eventName === "jump") {
      pushCue("jump");
      fx.jump(playerState.x, playerState.y, PULSE_PLAYER_Z);
    } else if (eventName === "slide") {
      pushCue("slide");
      fx.slide(playerState.x, playerState.y, PULSE_PLAYER_Z);
    }
  }

  gateSystem.update(stepSeconds);
  conveyor.advance(PULSE_GATE_SPEED * stepSeconds);
  style.step(stepSeconds);

  rs.lastBeat = Math.floor(clock.elapsed() / 0.5);

  const section = pulseSectionAtTime(clock.elapsed());
  if (section.id !== rs.lastSection) {
    rs.lastSection = section.id;
    tunnelAudio.applySection(section.id);
    pushCue("sectionRise");
    fx.sectionRise();
  }

  if (clock.elapsed() >= RUN_SECONDS && rs.runState === "running") {
    endRun("completed");
  }

  rigState.x = playerState.x;
  rigState.y = playerState.y;
  syncCraftVisuals(playerState.x, playerState.y, playerState.vy, playerState.sliding);

  syncGates();
  fx.step(stepSeconds);
  syncHud();
  publishSnapshot();
});

syncCraftVisuals(0, 0, 0, false);
syncGates();
syncHud();
publishSnapshot();

// --------------------------------------------------------------------- boot --

pulseGame.start();
void pulseGame.ready().then(() => {
  pulseGame.app.camera?.use?.(createPulseRig(rigState), { blend: 0.4 });
  pulseGame.app.setOutput?.({
    preset: "neon-night",
    exposure: Math.pow(2, direction.lighting.exposureEV)
  });
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: PULSE_EVIDENCE_ID,
    get app() {
      return pulseGame.app;
    },
    get scene() {
      return pulseGame.app.scene;
    },
    get state() {
      return pulseGame.session.state;
    },
    get session() {
      return pulseGame.session;
    },
    get frame() {
      return frame;
    },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
  publishSnapshot();
});
