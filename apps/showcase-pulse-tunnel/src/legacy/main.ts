/**
 * Pulse Tunnel - mount, systems, evidence.
 *
 * Prototype route (PRD the Pulse Tunnel implementation contract). On-rails rhythm runner:
 * obstacles schedule against the AudioContext clock through src/beat-clock.ts, the
 * four synthesized stems mix through src/tunnel-audio.ts buses, and the whole look
 * builds on the proven prefabs.neonTunnel() kit with authored emissive geometry.
 * Prototype route: a release-validated typed spacecraft is the player silhouette;
 * the gates and arena remain deliberate renderer-owned abstract visualization.
 */
import {
  camera,
  createAuraApp,
  effects,
  game,
  lights,
  material,
  model,
  prefabs,
  primitives,
  scene,
  type AuraMaterialSpec,
  type RuntimeNodeHandleLike
} from "@aura3d/engine";
import { assets, assets as rootAssets } from "../../../../src/aura-assets";
import {
  PULSE_DRIFT_CHECKS_TO_FLIP,
  PULSE_DRIFT_TOLERANCE_MS,
  PULSE_RUN_SECONDS,
  PULSE_TOTAL_BEATS,
  createBeatClock,
  pulseSectionAtBeat,
  pulseSectionAtTime,
  type PulseSectionId,
  type PulseSyncMode
} from "../gameplay/beat-clock";
import { buildPulseChart, pulseChartSectionSummary } from "../gameplay/patterns";
import {
  PULSE_GATE_SPEED,
  PULSE_PLAYER_Z,
  PULSE_PREFLASH_SECONDS,
  createGateSystem,
  pulseArrivalSeconds,
  pulseGateGeometry,
  type PulsePassEvent
} from "../gameplay/gates";
import { createPulsePlayer } from "../gameplay/player";
import { createPulseStyleSystem } from "../gameplay/style";
import { createTunnelAudio } from "./tunnel-audio";
import { isPulseDebugMode, setupPulseHud, updatePulseHud } from "./hud";

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Screenshot-only presentation mode keeps the gameplay/HUD contract intact while
// giving visual review a clean renderer-first frame. The normal route remains
// unchanged for players and for the interaction/evidence specs.
const visualReviewCapture =
  typeof window !== "undefined" && /[?&]capture=review(?:&|$)/.test(window.location.search);
// Candidate Meshy reactor-deck arena shell. Opt-in only via ?arena=candidate so
// the release-validated V11 shell stays the default for players, specs, and
// the review capture. Non-colliding presentation; lanes, chart, collisions,
// and scoring remain route-authoritative.
const pulseArenaCandidateEnabled =
  typeof window !== "undefined" && /[?&]arena=candidate(?:&|$)/.test(window.location.search);
if (typeof document !== "undefined") document.body.dataset.capture = visualReviewCapture ? "review" : "default";

// ---- authored presentation constants ---------------------------------------

const HUE_BY_SECTION: Record<PulseSectionId, string> = {
  intro: "#22d3ee",
  build: "#e879f9",
  drop: "#fbbf24",
  finale: "#fb7185"
};
const GATE_COLOR_BY_KIND = {
  wall: "#f43f5e",
  low: "#22c55e",
  high: "#38bdf8",
  pylon: "#fbbf24"
} as const;
type GateKindId = keyof typeof GATE_COLOR_BY_KIND;

const GATE_SLOTS = 8;
const SPARK_POOL = 10;
const FOG_PULSE_SECONDS = 0.18;
const HIT_FLASH_SECONDS = 0.14;
const INVULN_SECONDS = 1.2;
const HUE_RINGS_PER_SECTION = 4;
// Test-only seek captures pause the renderer immediately after jumping to the
// finale. Reserve enough of the 90-second run for the keyboard event and
// screenshot encoder to execute even under software-GL/reduced-motion runs.
const PULSE_CAPTURE_HEADROOM_SECONDS = 1.75;

// ---- systems ----------------------------------------------------------------

const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp"],
    slide: ["KeyS", "ArrowDown"],
    barrelRoll: ["Space", "ShiftLeft", "ShiftRight"],
    cannon: ["KeyJ", "KeyF"],
    pause: ["KeyP"],
    restart: ["KeyR"]
  },
  bufferMs: 120
});

const tunnelAudio = createTunnelAudio();
const player = createPulsePlayer();
const styleSystem = createPulseStyleSystem();
const chart = buildPulseChart();

let injectedDriftMs = 0;
let runAnchorSeconds = 0;
const driftSamples: { readonly t: number; readonly driftMs: number }[] = [];

const beatClock = createBeatClock({
  getAudioTime: () => tunnelAudio.nowSeconds(),
  getFrameTime: () => performance.now() / 1000,
  injectDriftMs: () => injectedDriftMs,
  onBeat: (beat) => onBeatReached(beat),
  onDriftCheck: (t, ms) => {
    driftSamples.push({ t, driftMs: ms });
    if (driftSamples.length > 180) driftSamples.shift();
  }
});

const gateEvents: PulsePassEvent[] = [];
/** Cumulative across restarts so browser specs can sample many arrivals. */
const gateEventLog: PulsePassEvent[] = [];

/**
 * Renderer-owned encounter feedback follows the same pass events that drive
 * the HUD/evidence stream.  Keeping the source event (rather than a free
 * running pulse timer) lets the review composition show where the latest gate
 * was actually resolved and whether that resolution was a clean pass, graze,
 * or shield hit.  It never feeds back into chart, collision, or score state.
 */
interface PulseReviewCombatPulse {
  readonly event: PulsePassEvent;
  ageSeconds: number;
}
let reviewCombatPulse: PulseReviewCombatPulse | null = null;

const gateSystem = createGateSystem({
  chart,
  getSchedulerTime: () => beatClock.time(),
  getAudioElapsed: () => Math.max(0, tunnelAudio.nowSeconds() - runAnchorSeconds),
  getPlayer: () => playerState,
  onPass: (event) => {
    reviewCombatPulse = { event, ageSeconds: 0 };
    evidence.latestCombatEvent = {
      gateId: event.gateId,
      type: event.type,
      kind: event.kind,
      ageSeconds: 0
    };
    gateEvents.push(event);
    if (gateEvents.length > 96) gateEvents.shift();
    gateEventLog.push(event);
    if (gateEventLog.length > 240) gateEventLog.shift();
    resolvedGateIds.add(event.gateId);
    if (event.type === "graze") {
      styleSystem.graze();
      void tunnelAudio.sfx("graze");
      spawnSpark(event.gateId);
      evidence.stats.grazes += 1;
    }
    if (event.type === "pass") evidence.stats.passes += 1;
    if (event.type === "collision") applyCollision(event);
  }
});

let playerState = player.snapshot();
/** Gate ids that already resolved; drives the published upcoming list. */
const resolvedGateIds = new Set<string>();

// ---- scene ------------------------------------------------------------------

const hueIds: Record<PulseSectionId, string[]> = { intro: [], build: [], drop: [], finale: [] };
const hueBuilders = (Object.keys(HUE_BY_SECTION) as PulseSectionId[]).flatMap((sectionId) =>
  Array.from({ length: HUE_RINGS_PER_SECTION }, (_, ring) => {
    const z = -3.4 - ring * 2.8;
    const sides = [
      { side: "top", position: [0, 2.7, z] as const },
      { side: "bottom", position: [0, -1.6, z] as const },
      { side: "left", position: [-3.55, 0.55, z] as const },
      { side: "right", position: [3.55, 0.55, z] as const }
    ];
    return sides.map(({ side, position }) => {
      const id = `pulse-hue-${sectionId}-${ring}-${side}`;
      hueIds[sectionId].push(id);
      return primitives.box({
        name: `pulse hue wash ${sectionId} frame ${ring + 1} ${side}`,
        material: material.emissive({
          color: HUE_BY_SECTION[sectionId],
          emissive: HUE_BY_SECTION[sectionId],
          opacity: 0.72,
          emissiveIntensity: 0.9
        })
      })
        .position(position[0], position[1], position[2])
        .scale([0.001, 0.001, 0.001])
        .runtime(game.runtimeNode(id, { tags: ["section-hue", `section-${sectionId}`] }));
    });
  }).flat()
);

const GATE_BODY_COLOR_BY_KIND: Record<GateKindId, string> = {
  low: "#1a3848",
  high: "#2e2048",
  wall: "#3b1c32",
  pylon: "#3d2e18"
};

const gateMaterialSpec = (kind: GateKindId, flashing: boolean): AuraMaterialSpec =>
  material.pbr({
    name: `pulse gate ${flashing ? "pre-flash" : "body"} ${kind}`,
    color: GATE_BODY_COLOR_BY_KIND[kind],
    roughness: 0.28,
    metallic: 0.78,
    clearcoat: 0.42,
    emissive: GATE_COLOR_BY_KIND[kind],
    emissiveIntensity: flashing ? 0.56 : 0.22
  });

const gateTrimMaterialSpec = (kind: GateKindId, flashing: boolean): AuraMaterialSpec =>
  material.pbr({
    name: `pulse gate ${flashing ? "pre-flash-trim" : "trim"} ${kind}`,
    color: GATE_COLOR_BY_KIND[kind],
    roughness: 0.2,
    metallic: 0.65,
    clearcoat: 0.5,
    emissive: GATE_COLOR_BY_KIND[kind],
    emissiveIntensity: flashing ? 1.15 : 0.58
  });

const glowMaterial = material.emissive({ name: "pulse glider engine glow", color: "#a5f3fc", emissive: "#22d3ee", emissiveIntensity: 1.55 });

const reviewSteel = material.pbr({
  name: "pulse review encounter steel",
  color: "#2a465d",
  roughness: 0.46,
  metallic: 0.58,
  emissive: "#0b3e59",
  emissiveIntensity: 0.16
});
const reviewSteelEdge = material.pbr({
  name: "pulse review encounter edge",
  color: "#42657b",
  roughness: 0.35,
  metallic: 0.66,
  emissive: "#17617d",
  emissiveIntensity: 0.23
});
const reviewAmber = material.emissive({
  name: "pulse review amber pulse",
  color: "#ffd38a",
  emissive: "#f97316",
  emissiveIntensity: 1.18
});
const reviewCyan = material.emissive({
  name: "pulse review cyan pulse",
  color: "#55d6e7",
  emissive: "#0789a3",
  emissiveIntensity: 0.92
});
const reviewRose = material.emissive({
  name: "pulse review rose pulse",
  color: "#f47e9b",
  emissive: "#b51f4a",
  emissiveIntensity: 0.88
});
const reviewRunnerGlowMaterial = material.emissive({
  name: "pulse review runner drive marker",
  color: "#2cc6d9",
  emissive: "#08778b",
  emissiveIntensity: 0.54
});

const gateSlotBuilders = (() => {
  const builders = [];
  for (let slot = 0; slot < GATE_SLOTS; slot += 1) {
    builders.push(
      model(rootAssets.pulseBarrierDroneWallMeshy, {
        name: `pulse gate ${slot} barrier model`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.15
      })
        .position(0, 0.34, PULSE_PLAYER_Z - 6)
        .scale([0.0001, 0.0001, 0.0001])
        .runtime(game.runtimeNode(`pulse-gate-${slot}-barrier`, {
          tags: ["gate", `slot-${slot}`, "typed-barrier"]
        })),
      model(rootAssets.neonSwarmChaserDroneMeshy, {
        name: `pulse gate ${slot} chaser drone model`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.82
      })
        .position(0, 0.56, PULSE_PLAYER_Z - 6)
        .scale([0.0001, 0.0001, 0.0001])
        .runtime(game.runtimeNode(`pulse-gate-${slot}-chaser`, {
          tags: ["gate", `slot-${slot}`, "typed-chaser-drone"]
        }))
    );
    for (const partName of ["top", "bottom", "core"] as const) {
      builders.push(
        primitives.box({
          name: `pulse gate ${slot} ${partName}`,
          material: partName === "core" ? gateMaterialSpec("wall", false) : gateTrimMaterialSpec("wall", false)
        })
          .position(0, -50, PULSE_PLAYER_Z - 6)
          .scale([0.0001, 0.0001, 0.0001])
          .runtime(game.runtimeNode(`pulse-gate-${slot}-${partName}`, {
            tags: ["gate", `slot-${slot}`, `part-${partName}`]
          }))
      );
    }
  }
  return builders;
})();

const sparkBuilders = Array.from({ length: SPARK_POOL }, (_, index) =>
  primitives.sphere({
    name: `pulse graze spark ${index + 1}`,
    material: material.emissive({
      name: `spark ${index}`,
      color: "#fef9c3",
      emissive: "#fde047",
      emissiveIntensity: 2.0
    }),
  })
    .position(0, 0.35, PULSE_PLAYER_Z + 0.2)
    .scale([0.04, 0.04, 0.04])
    .runtime(game.runtimeNode(`pulse-spark-${index}`, { tags: ["graze-trail"] }))
);

const depthTrackBuilders = Array.from({ length: 7 }, (_, index) => {
  const z = -5 - index * 5.2;
  const scale = Math.max(0.42, 1 - index * 0.07);
  return [
    model(assets.pulseNeonGateArchMeshy, {
      name: "pulse neon gate arch left " + (index + 1),
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.85 * scale
    })
      .position(-2.38, 0.05, z)
      .rotate(0, Math.PI * 0.12, 0)
      .runtime(game.runtimeNode("pulse-gate-arch-left-" + index, { tags: ["depth-landmark", "typed-asset", "set-dressing"] })),
    model(assets.pulseNeonGateArchMeshy, {
      name: "pulse neon gate arch right " + (index + 1),
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.85 * scale
    })
      .position(2.38, 0.05, z)
      .rotate(0, -Math.PI * 0.12, 0)
      .runtime(game.runtimeNode("pulse-gate-arch-right-" + index, { tags: ["depth-landmark", "typed-asset", "set-dressing"] })),
    primitives.box({ name: 'pulse depth pylon left ' + (index + 1), material: material.emissive({ color: '#0ea5e9', emissive: '#22d3ee', emissiveIntensity: 0.9 }) })
      .position(-2.7, 0.5, z).scale([0.12 * scale, 1.15 * scale, 0.12 * scale])
      .runtime(game.runtimeNode('pulse-depth-pylon-left-' + index, { tags: ['depth-landmark', 'set-dressing'] })),
    primitives.box({ name: 'pulse depth pylon right ' + (index + 1), material: material.emissive({ color: '#e879f9', emissive: '#f0abfc', emissiveIntensity: 0.9 }) })
      .position(2.7, 0.5, z).scale([0.12 * scale, 1.15 * scale, 0.12 * scale])
      .runtime(game.runtimeNode('pulse-depth-pylon-right-' + index, { tags: ['depth-landmark', 'set-dressing'] }))
  ];
}).flat();
const finaleBeaconBuilder = primitives.torus({ name: 'pulse finale beacon', material: material.emissive({ color: '#fb7185', emissive: '#fecdd3', emissiveIntensity: 2.2 }) })
  .position(0, 1.0, -4.65).scale([0.001, 0.001, 0.001])
  .runtime(game.runtimeNode('pulse-finale-beacon', { tags: ['finale-landmark', 'set-dressing'] }));
const finaleTerminalSentryBuilder = model(assets.pulseTerminalSentry, {
  name: "pulse original terminal sentry",
  targetMaxDimension: 2.74
})
  .position(1.38, 0.22, -3.72)
  .rotate(0, Math.PI + 0.18, 0)
  .scale(1.24)
  .runtime(game.runtimeNode("pulse-finale-terminal-sentry", {
    tags: ["finale-target", "typed-terminal-sentry", "renderer-owned", "non-colliding"]
  }));
const finaleArenaShellBuilder = model(assets.pulseReactorEncounterWorld, {
  name: "pulse original reactor encounter world",
  role: "primaryWorld",
  targetMaxDimension: 11.556,
  hiddenNodeNames: [
    ...Array.from({ length: 8 }, (_, arch) => [
      ...Array.from({ length: 8 }, (_, segment) => `V11 forged reactor arch ${arch} segment ${segment}`),
      ...Array.from({ length: 7 }, (_, joint) => `V11 forged reactor arch ${arch} joint ${joint}`),
      `V11 arch crown service block ${arch}`,
      `V11 arch crown cyan signal ${arch}`
    ]).flat(),
    ...Array.from({ length: 5 }, (_, index) => [
      `V11 overhead service cabinet ${index}`,
      `V11 overhead service lamp ${index}`
    ]).flat()
  ]
})
  .position(0, 0, 0)
  .runtime(game.runtimeNode("pulse-finale-arena-shell", {
    tags: ["finale-arena", "typed-world", "release-probed", "renderer-owned", "non-colliding"]
  }));
const finaleArenaCandidateBuilder = model(assets.pulseArena, {
  name: "pulse candidate reactor deck arena",
  role: "primaryWorld",
  targetMaxDimension: 11.556,
})
  .position(0, 0, 0)
  .runtime(game.runtimeNode("pulse-finale-arena-candidate", {
    tags: ["finale-arena", "typed-world", "candidate", "renderer-owned", "non-colliding"]
  }));
const finaleProjectileBuilders = Array.from({ length: 18 }, (_, index) =>
  primitives.cylinder({
    name: `pulse finale ${index < 10 ? "runner lance" : "sentry cutter"} ${index + 1}`,
    material: material.emissive({
      color: index < 10 ? (index % 3 === 0 ? "#e5fdff" : "#67e8f9") : (index % 3 === 0 ? "#ffe6ee" : "#fb7185"),
      emissive: index < 10 ? "#0891b2" : "#be123c",
      emissiveIntensity: index < 10 ? 1.85 : 1.72
    })
  })
    .position(0, 0.45, -7.5)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.055, 0.42, 0.055])
    .runtime(game.runtimeNode("pulse-finale-projectile-" + index, { tags: ["finale-projectile", "rhythm-lance", "renderer-owned"] }))
);

const finaleShieldVaneBuilders = Array.from({ length: 4 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const upper = index < 2;
  return primitives.box({
    name: `pulse finale shield vane ${index + 1}`,
    material: material.pbr({
      color: upper ? "#253b52" : "#4f2847",
      roughness: 0.32,
      metallic: 0.62,
      emissive: side < 0 ? "#0891b2" : "#be185d",
      emissiveIntensity: 0.42
    })
  })
    .position(1.42 + side * 1.2, upper ? 1.78 : 0.5, -4.78)
    .rotate(0, side * 0.18, side * (upper ? -0.5 : 0.5))
    .scale([0.78, 0.12, 0.34])
    .runtime(game.runtimeNode(`pulse-finale-shield-vane-${index}`, {
      tags: ["finale-target", "shield-architecture", "renderer-owned"]
    }));
});

// Renderer-owned cavern dressing gives the lane a readable material horizon
// instead of leaving the neon kit floating in an empty gradient. The slabs sit
// outside the three gameplay lanes, so they cannot change gate geometry or
// collision truth; they are only the near/far rock silhouettes and reflective
// ledges that make the active runner frame feel grounded.
const cavernRockBuilders = Array.from({ length: 22 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const depth = Math.floor(index / 2);
  const z = -4.8 - depth * 3.05;
  const x = side * (2.65 + (index % 3) * 0.3);
  const height = 0.62 + (index % 4) * 0.19;
  const width = 0.28 + (index % 3) * 0.12;
  const rockScale = [width, height, 0.34 + (index % 2) * 0.16] as const;
  return primitives.box({
    name: "pulse cavern basalt slab " + (index + 1),
    material: material.pbr({
      name: "pulse basalt dressing " + (index + 1),
      color: index % 3 === 0 ? "#261333" : "#17152c",
      roughness: 0.58,
      metallic: 0.22,
      emissive: side < 0 ? "#0e7490" : "#86198f",
      emissiveIntensity: 0.14
    })
  })
    .position(x, -0.02 + (index % 3) * 0.18, z)
    .rotate(0.08 * (index % 2), side * (0.12 + (index % 3) * 0.08), side * 0.08)
    .scale(rockScale)
    .runtime(game.runtimeNode("pulse-cavern-rock-" + index, { tags: ["cavern-dressing", "set-dressing"] }));
});

// Larger faceted spires sit just beyond the three playable lanes. Together
// with the slabs they supply the broken basalt horizon visible in the active
// finale, while remaining renderer-owned set dressing with no collision role.
const cavernSpireBuilders = Array.from({ length: 14 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const depth = Math.floor(index / 2);
  const z = -3.7 - depth * 2.75 - (index % 3) * 0.22;
  const height = 0.7 + (index % 4) * 0.24;
  const radius = 0.2 + (index % 3) * 0.08;
  return primitives.cylinder({
    name: "pulse cavern basalt spire " + (index + 1),
    material: material.pbr({
      name: "pulse basalt spire finish " + (index + 1),
      color: index % 3 === 0 ? "#3b1e45" : "#21172f",
      roughness: 0.66,
      metallic: 0.16,
      emissive: side < 0 ? "#0e7490" : "#9f1239",
      emissiveIntensity: 0.2
    })
  })
    .position(side * (2.3 + (index % 3) * 0.18), height * 0.5 - 0.03, z)
    .rotate(0.08, side * (0.16 + (index % 2) * 0.1), side * 0.12)
    .scale([radius, height, radius * 0.82])
    .runtime(game.runtimeNode("pulse-cavern-spire-" + index, { tags: ["cavern-dressing", "renderer-owned", "non-colliding"] }));
});

// Broken warm seams on the outer floor echo the comparator's red terrain and
// give the reflective lane a second color family without touching the track.
const lavaChannelBuilders = Array.from({ length: 12 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const depth = Math.floor(index / 2);
  return primitives.box({
    name: "pulse outer lava seam " + (index + 1),
    material: material.emissive({
      name: "pulse lava seam " + (index + 1),
      color: "#fb7185",
      emissive: index % 3 === 0 ? "#fb923c" : "#e11d48",
      emissiveIntensity: 1.05,
      opacity: 0.72
    })
  })
    .position(side * (2.72 + (index % 3) * 0.1), -0.02, -4.1 - depth * 5.5)
    .rotate(0, 0, side * 0.08)
    .scale([0.2 + (index % 2) * 0.12, 0.028, 0.8 + (index % 3) * 0.28])
    .runtime(game.runtimeNode("pulse-lava-seam-" + index, { tags: ["terrain-dressing", "renderer-owned", "non-colliding"] }));
});

// Thin, staggered in-scene rain strokes echo the comparator's weathered action
// atmosphere. They are ordinary renderer geometry (not CSS or fake HUD FX),
// positioned above and outside the playable lane so mobile/reduced-motion
// behavior remains governed by the existing route systems.
const rainBuilders = Array.from({ length: 30 }, (_, index) => {
  const column = index % 10;
  const depth = Math.floor(index / 10);
  const x = -3.05 + column * 0.68 + (depth % 2) * 0.12;
  const y = 0.72 + (index % 5) * 0.42;
  const z = -4.2 - depth * 8.1 - (index % 3) * 0.55;
  return primitives.box({
    name: "pulse rain stroke " + (index + 1),
    material: material.emissive({
      name: "pulse rain glow " + (index + 1),
      color: index % 2 === 0 ? "#67e8f9" : "#f0abfc",
      emissive: index % 2 === 0 ? "#22d3ee" : "#d946ef",
      emissiveIntensity: 0.82,
      opacity: 0.58
    })
  })
    .position(x, y, z)
    .rotate(0.06, 0, -0.12)
    .scale([0.014, 0.38 + (index % 4) * 0.11, 0.014])
    .runtime(game.runtimeNode("pulse-rain-" + index, { tags: ["weather-dressing", "renderer-owned"] }));
});

const ledgeBuilders = Array.from({ length: 8 }, (_, index) => {
  const z = -5.4 - index * 4.2;
  return primitives.box({
    name: "pulse reflective floor ledge " + (index + 1),
    material: material.pbr({
      name: "pulse reflective floor " + (index + 1),
      color: index % 2 === 0 ? "#24113a" : "#111c3a",
      roughness: 0.3,
      metallic: 0.64,
      emissive: index % 2 === 0 ? "#701a75" : "#155e75",
      emissiveIntensity: 0.18
    })
  })
    .position(0, -0.13, z)
    .scale([3.22, 0.06, 1.62])
    .runtime(game.runtimeNode("pulse-floor-ledge-" + index, { tags: ["depth-landmark", "set-dressing"] }));
});

// A renderer-owned basalt arena under the finale boss turns the far end of the
// lane into a staged encounter rather than a ring floating in black space.
// The track plane remains on top through the center, and every arena node is
// deliberately non-colliding so gate timing and the three gameplay lanes stay
// authoritative.
const finaleArenaMaterial = material.pbr({
  name: "pulse finale basalt arena",
  color: "#51415f",
  roughness: 0.68,
  metallic: 0.18,
  emissive: "#4c1d95",
  emissiveIntensity: 0.2
});
const finaleArenaRingMaterial = material.pbr({
  name: "pulse finale arena fracture glow",
  color: "#8c3b55",
  roughness: 0.6,
  metallic: 0.16,
  emissive: "#e11d48",
  emissiveIntensity: 0.46
});
const finaleArenaGrooveMaterial = material.pbr({
  name: "pulse finale carved arena grooves",
  color: "#2f183d",
  roughness: 0.82,
  metallic: 0.08,
  emissive: "#6d28d9",
  emissiveIntensity: 0.24
});
const finaleArenaBuilders = [
  primitives.box({ name: "pulse cavern world floor", material: material.pbr({
    name: "pulse cavern world floor finish",
    color: "#281f36",
    roughness: 0.76,
    metallic: 0.12,
    emissive: "#3b1760",
    emissiveIntensity: 0.18
  }) })
    .position(0, -0.28, -8.5)
    .scale([11.5, 0.12, 19])
    .runtime(game.runtimeNode("pulse-cavern-world-floor", { tags: ["terrain-dressing", "renderer-owned", "non-colliding"] })),
  primitives.cylinder({ name: "pulse finale basalt dais", material: finaleArenaMaterial })
    .position(0, -0.16, -1.75)
    .scale([6.65, 0.11, 6.65])
    .runtime(game.runtimeNode("pulse-finale-arena-dais", { tags: ["finale-arena", "renderer-owned", "non-colliding"] })),
  ...[2.55, 4.4, 6.1].map((radius, index) =>
    primitives.torus({ name: "pulse finale arena ring " + (index + 1), material: finaleArenaRingMaterial })
      .position(0, -0.035 + index * 0.006, -1.75)
      .rotate(1.5708, 0, 0)
      .scale(visualReviewCapture ? [0.001, 0.001, 0.001] : [radius, radius, 0.028 + index * 0.008])
      .runtime(game.runtimeNode("pulse-finale-arena-ring-" + index, { tags: ["finale-arena", "renderer-owned", "non-colliding"] }))
  ),
  ...Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2 + 0.12;
    const radius = 3.55;
    return primitives.box({
      name: "pulse finale carved radial groove " + (index + 1),
      material: finaleArenaGrooveMaterial
    })
      .position(Math.cos(angle) * radius, -0.025, -1.75 + Math.sin(angle) * radius)
      .rotate(0, -angle, 0)
      .scale(visualReviewCapture ? [0.001, 0.001, 0.001] : [2.75, 0.025, 0.055])
      .runtime(game.runtimeNode("pulse-finale-groove-" + index, { tags: ["finale-arena", "renderer-owned", "non-colliding"] }));
  }),
  ...Array.from({ length: 18 }, (_, index) => {
    const angle = (index / 18) * Math.PI * 2 + 0.18;
    const radius = 6.18;
    return primitives.box({
      name: "pulse finale broken perimeter " + (index + 1),
      material: index % 3 === 0 ? finaleArenaRingMaterial : finaleArenaMaterial
    })
      .position(Math.cos(angle) * radius, -0.005 + (index % 2) * 0.035, -1.75 + Math.sin(angle) * radius)
      .rotate(0, -angle, (index % 3 - 1) * 0.04)
      .scale([0.72 + (index % 3) * 0.18, 0.12 + (index % 2) * 0.04, 0.42])
      .runtime(game.runtimeNode("pulse-finale-perimeter-" + index, { tags: ["finale-arena", "renderer-owned", "non-colliding"] }));
  })
];

// The release-review lens is a complete, continuous tunnel volume. It does
// not import an arena/backdrop from another route: floor, ribs, roof, walls,
// conduits, and the terminal iris all use the same restrained reactor-steel
// material family and one vanishing point. Every piece is renderer-owned and
// non-colliding, so the chart and gate system remain the gameplay authority.
const reviewDeckMaterial = material.pbr({
  name: "pulse continuous reactor deck",
  // The review deck is a distinct mid-value surface, not a black mirror. That
  // gives the pod a readable cool landing plane while the terminal stays the
  // warm focal endpoint at the next depth plane.
  color: "#516a7d",
  roughness: 0.44,
  metallic: 0.48,
  emissive: "#145a78",
  emissiveIntensity: 0.34
});
const reviewShoulderMaterial = material.pbr({
  name: "pulse reactor deck shoulders",
  color: "#42566b",
  roughness: 0.54,
  metallic: 0.44,
  emissive: "#294a67",
  emissiveIntensity: 0.26
});
const reviewRibMaterial = material.pbr({
  name: "pulse tunnel rib steel",
  // Ribs deliberately sit one value step below the deck. Their steel blue is
  // visible as architecture, but cannot merge with either typed combatant.
  color: "#345068",
  roughness: 0.46,
  metallic: 0.64,
  emissive: "#164b71",
  emissiveIntensity: 0.28
});
const reviewAccentMaterial = material.emissive({
  name: "pulse tunnel amber beat accent",
  color: "#ffd166",
  emissive: "#d97706",
  emissiveIntensity: 0.58
});
const reviewContactMaterial = material.pbr({
  name: "pulse encounter contact graphite",
  color: "#07111d",
  roughness: 0.86,
  metallic: 0.18,
  emissive: "#071e2d",
  emissiveIntensity: 0.18
});
const reviewBeamMaterial = material.pbr({
  name: "pulse encounter structural beam",
  color: "#345a72",
  roughness: 0.42,
  metallic: 0.58,
  emissive: "#0d425c",
  emissiveIntensity: 0.30
});
const reviewPanelMaterial = material.pbr({
  name: "pulse encounter wall panel",
  color: "#203b53",
  roughness: 0.52,
  metallic: 0.40,
  emissive: "#0b3048",
  emissiveIntensity: 0.24
});
const reviewSignalMaterial = material.emissive({
  name: "pulse encounter signal strip",
  color: "#4bc7d8",
  emissive: "#126c80",
  emissiveIntensity: 0.72
});
// Review-only practicals keep the reactor bay legible as a place.  They sit
// one value step below the typed runner/sentry, adding cool/warm depth without
// flattening the encounter into another neon diagram.
const reviewAtmosphereCyan = material.emissive({
  name: "pulse reactor atmosphere cyan",
  color: "#6ee7f3",
  emissive: "#087f9b",
  emissiveIntensity: 0.74,
  opacity: 0.64
});
const reviewAtmosphereRose = material.emissive({
  name: "pulse reactor atmosphere rose",
  color: "#f58da9",
  emissive: "#8f1d50",
  emissiveIntensity: 0.62,
  opacity: 0.58
});
const reviewAtmosphereSteel = material.pbr({
  name: "pulse reactor atmosphere steel",
  color: "#2b4054",
  roughness: 0.62,
  metallic: 0.48,
  emissive: "#102d42",
  emissiveIntensity: 0.20
});
const reviewRearMaterial = material.pbr({
  name: "pulse encounter rear reactor panel",
  color: "#30223f",
  roughness: 0.58,
  metallic: 0.34,
  emissive: "#5e214c",
  emissiveIntensity: 0.30
});
const reviewTrailCyan = material.emissive({
  name: "pulse runner lance trail",
  color: "#6debf2",
  emissive: "#0b7185",
  emissiveIntensity: 0.58,
  opacity: 0.78
});
const reviewTrailRose = material.emissive({
  name: "pulse warden cutter trail",
  color: "#f7a3b6",
  emissive: "#9f1d4b",
  emissiveIntensity: 0.74,
  opacity: 0.78
});
// Packet cores are deliberately spherical and high-value.  The previous
// capsule-only packets rasterized as a row of vertical spikes in the frozen
// review frame, which made the exchange read as decoration rather than fire.
// A bright core plus a separate directional wake keeps the projectile as a
// legible volume while the wake communicates travel direction.
const reviewProjectileCoreCyan = material.emissive({
  name: "pulse runner lance packet core",
  color: "#e8feff",
  emissive: "#11d9f3",
  emissiveIntensity: 2.35
});
const reviewProjectileCoreRose = material.emissive({
  name: "pulse warden cutter packet core",
  color: "#ffe8ee",
  emissive: "#f02f72",
  emissiveIntensity: 2.15
});

// The encounter stage is intentionally built from a small authored material
// family rather than a single dark floor.  These inset panels and hazard
// strips give the lane a readable construction rhythm at the review camera:
// cool graphite slabs carry the runners, while the warm seams establish the
// sentinel's pressure side.  They are renderer-owned set dressing only; the
// chart, collider, and typed actors remain the gameplay authority.
const reviewDeckInsetMaterial = material.pbr({
  name: "pulse review deck inset graphite",
  color: "#29455d",
  roughness: 0.58,
  metallic: 0.62,
  emissive: "#0a3854",
  emissiveIntensity: 0.26
});
const reviewDeckInsetEdgeMaterial = material.pbr({
  name: "pulse review deck inset edge",
  color: "#547b91",
  roughness: 0.34,
  metallic: 0.72,
  emissive: "#146b82",
  emissiveIntensity: 0.34
});
const reviewDeckCautionMaterial = material.emissive({
  name: "pulse review deck caution stripe",
  color: "#ffc979",
  emissive: "#db6d18",
  emissiveIntensity: 0.76
});

// Flat primitive bulkheads, ceiling bridges, and rear pink slabs are hidden
// (scale: [0.0001, 0.0001, 0.0001]) so the corridor is framed by real 3D Meshy
// pulseNeonGateArchMeshy arches instead of unshaded primitive rectangles.
const reviewStructureBuilders = [
  primitives.box({ name: "pulse review rear bulkhead left", material: reviewPanelMaterial })
    .position(0, -50, -5.85).rotate(0, 0.04, 0.02).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review rear bulkhead right", material: reviewPanelMaterial })
    .position(0, -50, -5.35).rotate(0, -0.06, -0.025).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review left buttress", material: reviewBeamMaterial })
    .position(0, -50, -2.3).rotate(0.04, 0.02, -0.14).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review right buttress", material: reviewBeamMaterial })
    .position(0, -50, -2.95).rotate(-0.03, -0.03, 0.16).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review overhead bridge", material: reviewBeamMaterial })
    .position(0, -50, -3.82).rotate(0, 0.03, 0.02).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review bridge signal", material: reviewSignalMaterial })
    .position(0, -50, -3.58).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review left floor edge", material: reviewBeamMaterial })
    .position(-2.18, 0.05, -2.10).rotate(0, -0.08, 0).scale([0.12, 0.10, 3.10]),
  primitives.box({ name: "pulse review right floor edge", material: reviewBeamMaterial })
    .position(2.12, 0.05, -2.42).rotate(0, 0.10, 0).scale([0.12, 0.10, 2.88]),
  ...[-1, 1].flatMap((side) => [
    primitives.box({ name: `pulse review side hazard rail ${side}`, material: reviewAccentMaterial })
      .position(side * 2.18, 0.36, -1.10).rotate(0, side * 0.12, 0).scale([0.035, 0.035, 1.35]),
    primitives.box({ name: `pulse review side hazard rail rear ${side}`, material: reviewAccentMaterial })
      .position(side * 2.34, 0.52, -4.80).rotate(0, side * -0.10, 0).scale([0.035, 0.035, 1.06])
  ])
];

const reviewArchitectureAccentBuilders = [
  primitives.box({ name: "pulse review rear reactor panel", material: reviewRearMaterial })
    .position(0, -50, -5.72).rotate(0, 0.018, 0).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review rear reactor panel left seam", material: reviewSignalMaterial })
    .position(0, -50, -5.57).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review rear reactor panel right seam", material: reviewAccentMaterial })
    .position(0, -50, -5.53).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review rear reactor header", material: reviewBeamMaterial })
    .position(0, -50, -5.56).rotate(0, 0.02, 0).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review rear reactor header signal", material: reviewRose })
    .position(0, -50, -5.38).scale([0.0001, 0.0001, 0.0001]),
  ...Array.from({ length: 8 }, (_, index) => {
    const z = 1.58 - index * 0.86;
    const side = index % 2 === 0 ? -1 : 1;
    return primitives.box({
      name: `pulse review floor cadence plate ${index + 1}`,
      material: index % 3 === 0 ? reviewAccentMaterial : reviewPanelMaterial
    })
      .position(side * 0.38, 0.045, z)
      .rotate(0, side * 0.04, 0)
      .scale([0.76 + (index % 3) * 0.10, 0.018, 0.16]);
  }),
  ...[-1, 1].flatMap((side) => [
    primitives.box({ name: `pulse review rear vertical truss ${side}`, material: reviewBeamMaterial })
      .position(0, -50, -5.18).rotate(0.04, side * 0.08, side * 0.10).scale([0.0001, 0.0001, 0.0001]),
    primitives.box({ name: `pulse review rear truss signal ${side}`, material: side < 0 ? reviewCyan : reviewRose })
      .position(0, -50, -5.02).rotate(0.04, side * 0.08, side * 0.10).scale([0.0001, 0.0001, 0.0001])
  ])
];

const reviewAtmosphereBuilders = [
  ...[
    { x: -2.76, y: 1.46, z: -5.86, sx: 0.12, sy: 1.54, sz: 0.12, warm: false, yaw: -0.06 },
    { x: -2.08, y: 1.78, z: -6.34, sx: 0.09, sy: 1.92, sz: 0.10, warm: false, yaw: 0.04 },
    { x: 2.74, y: 1.55, z: -5.70, sx: 0.14, sy: 1.68, sz: 0.12, warm: true, yaw: 0.08 },
    { x: 2.10, y: 1.92, z: -6.28, sx: 0.09, sy: 2.06, sz: 0.10, warm: true, yaw: -0.04 }
  ].map((window, index) =>
    primitives.box({
      name: `pulse review reactor window ${index + 1}`,
      material: window.warm ? reviewAtmosphereRose : reviewAtmosphereCyan
    })
      .position(0, -50, window.z)
      .rotate(0.02, window.yaw, (index % 2 === 0 ? -1 : 1) * 0.035)
      .scale([0.0001, 0.0001, 0.0001])
      .runtime(game.runtimeNode(`pulse-review-reactor-window-${index}`, { tags: ["reactor-atmosphere", "renderer-owned", "non-colliding"] }))
  ),
  ...[-1, 1].flatMap((side) =>
    [
      { z: 0.94, h: 0.72, tone: "steel" },
      { z: -0.58, h: 1.02, tone: "cool" },
      { z: -2.26, h: 1.34, tone: "steel" },
      { z: -4.06, h: 1.68, tone: "warm" }
    ].map((column, index) =>
      primitives.cylinder({
        name: `pulse review reactor side column ${side} ${index + 1}`,
        material: column.tone === "cool" ? reviewAtmosphereCyan : column.tone === "warm" ? reviewAtmosphereRose : reviewAtmosphereSteel
      })
        .position(0, -50, column.z)
        .rotate(0.04, side * (0.10 + index * 0.025), side * 0.07)
        .scale([0.0001, 0.0001, 0.0001])
        .runtime(game.runtimeNode(`pulse-review-reactor-column-${side}-${index}`, { tags: ["reactor-atmosphere", "renderer-owned", "non-colliding"] }))
    )
  ),
  ...Array.from({ length: 8 }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const depth = Math.floor(index / 2);
    return primitives.box({
      name: `pulse review reactor floor chevron ${index + 1}`,
      material: index % 3 === 0 ? reviewAtmosphereRose : reviewAtmosphereCyan
    })
      .position(side * (1.86 + depth * 0.16), 0.035, 1.55 - depth * 1.05)
      .rotate(0, side * (0.10 + depth * 0.035), side * 0.08)
      .scale([0.44 + depth * 0.06, 0.025, 0.055])
      .runtime(game.runtimeNode(`pulse-review-reactor-chevron-${index}`, { tags: ["reactor-atmosphere", "renderer-owned", "non-colliding"] }));
  }),
  ...[
    { x: -1.92, y: 2.68, z: -4.32, sx: 1.10, sz: 0.10, warm: false, yaw: -0.10 },
    { x: 1.98, y: 2.52, z: -4.76, sx: 1.18, sz: 0.10, warm: true, yaw: 0.12 },
    { x: -0.32, y: 3.28, z: -5.96, sx: 1.42, sz: 0.08, warm: false, yaw: 0.025 }
  ].map((beam, index) =>
    primitives.box({
      name: `pulse review reactor horizon beam ${index + 1}`,
      material: beam.warm ? reviewAtmosphereRose : reviewAtmosphereCyan
    })
      .position(0, -50, beam.z)
      .rotate(0, beam.yaw, (index % 2 === 0 ? -1 : 1) * 0.035)
      .scale([0.0001, 0.0001, 0.0001])
      .runtime(game.runtimeNode(`pulse-review-reactor-beam-${index}`, { tags: ["reactor-atmosphere", "renderer-owned", "non-colliding"] }))
  )
];

// Broken basalt plates and hot/cool seams give the encounter a terrain story
// closer to the comparator's playable arena.  They sit outside the authored
// three-lane collider envelope and are renderer-owned set dressing only.
const reviewTerrainMaterial = material.pbr({
  name: "pulse encounter basalt plate",
  color: "#46647a",
  roughness: 0.72,
  metallic: 0.24,
  emissive: "#163a55",
  emissiveIntensity: 0.24
});
const reviewTerrainWarmMaterial = material.pbr({
  name: "pulse encounter warm basalt plate",
  color: "#70445f",
  roughness: 0.76,
  metallic: 0.18,
  emissive: "#9a2b50",
  emissiveIntensity: 0.28
});
const reviewTerrainGlowMaterial = material.emissive({
  name: "pulse encounter molten seam",
  color: "#ffb66b",
  emissive: "#f0445d",
  emissiveIntensity: 1.12
});
const reviewTerrainBuilders = [
  ...[
    { x: -2.25, z: 1.62, sx: 1.05, sz: 0.74, yaw: -0.08, warm: false },
    { x: 2.18, z: 1.38, sx: 1.18, sz: 0.88, yaw: 0.10, warm: true },
    { x: -2.38, z: -0.05, sx: 1.24, sz: 0.92, yaw: 0.07, warm: true },
    { x: 2.36, z: -0.36, sx: 1.32, sz: 1.02, yaw: -0.12, warm: false },
    { x: -2.28, z: -2.08, sx: 1.42, sz: 1.26, yaw: -0.05, warm: false },
    { x: 2.26, z: -2.22, sx: 1.48, sz: 1.18, yaw: 0.09, warm: true },
    { x: -2.12, z: -4.03, sx: 1.56, sz: 1.10, yaw: 0.12, warm: true },
    { x: 2.12, z: -4.08, sx: 1.62, sz: 1.16, yaw: -0.08, warm: false }
  ].map((plate, index) =>
    primitives.box({
      name: `pulse encounter fractured basalt plate ${index + 1}`,
      material: plate.warm ? reviewTerrainWarmMaterial : reviewTerrainMaterial
    })
      .position(plate.x, -0.06 + (index % 3) * 0.018, plate.z)
      .rotate(0, plate.yaw, (index % 2 === 0 ? -1 : 1) * 0.03)
      .scale([plate.sx, 0.10 + (index % 2) * 0.035, plate.sz])
      .runtime(game.runtimeNode(`pulse-review-terrain-plate-${index}`, { tags: ["terrain-dressing", "renderer-owned", "non-colliding"] }))
  ),
  ...[-1, 1].flatMap((side) =>
    [0.92, -0.18, -1.46, -2.74, -4.08].map((z, index) =>
      primitives.box({
        name: `pulse encounter molten seam ${side} ${index + 1}`,
        material: reviewTerrainGlowMaterial
      })
        .position(side * (2.12 + (index % 2) * 0.12), 0.065, z)
        .rotate(0, 0, side * (0.08 + (index % 3) * 0.035))
        .scale([0.038 + (index % 2) * 0.014, 0.026, 0.34 + (index % 3) * 0.14])
        .runtime(game.runtimeNode(`pulse-review-terrain-seam-${side}-${index}`, { tags: ["terrain-dressing", "renderer-owned", "non-colliding"] }))
    )
  ),
  // A few raised shards catch the cool/warm practicals and close the
  // horizon without blocking either typed combatant.
  ...[-1, 1].flatMap((side) =>
    [
      { z: -1.45, h: 0.72, r: 0.24 },
      { z: -3.06, h: 0.98, r: 0.30 },
      { z: -4.62, h: 0.78, r: 0.22 }
    ].map((shard, index) =>
      primitives.cylinder({
        name: `pulse encounter basalt shard ${side} ${index + 1}`,
        material: index === 1 ? reviewTerrainWarmMaterial : reviewTerrainMaterial
      })
        .position(side * (2.78 + (index % 2) * 0.16), shard.h * 0.48 - 0.04, shard.z)
        .rotate(0.06, side * 0.15, side * 0.08)
        .scale([shard.r, shard.h, shard.r * 0.72])
        .runtime(game.runtimeNode(`pulse-review-terrain-shard-${side}-${index}`, { tags: ["terrain-dressing", "renderer-owned", "non-colliding"] }))
    )
  )
];

// The previous review frame had a deck, side rails, and a handful of flat
// plates, but the player and sentry still appeared to hover in the same plane
// as the exchange. These three stepped encounter islands establish a real
// launch pad, impact shelf, and sentinel dock. They are renderer-owned
// set-dressing only: no island is part of the chart, lane, or collider model.
// The low circular profiles deliberately echo the broken basalt forms in Furi
// while preserving the route's Pulse steel/cyan/rose identity.
const reviewEncounterIslandBuilders = [
  primitives.cylinder({ name: "pulse review runner launch island", material: reviewTerrainMaterial })
    .position(-1.38, -0.13, 0.42)
    .scale([1.38, 0.11, 0.94])
    .runtime(game.runtimeNode("pulse-review-runner-island", { tags: ["encounter-grounding", "terrain-dressing", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse review runner island rail", material: reviewCyan })
    .position(-1.38, 0.015, 0.42)
    .rotate(Math.PI / 2, 0, 0)
    .scale([1.18, 0.82, 0.035])
    .runtime(game.runtimeNode("pulse-review-runner-island-rail", { tags: ["encounter-grounding", "renderer-owned", "non-colliding"] })),
  primitives.cylinder({ name: "pulse review exchange impact island", material: reviewTerrainWarmMaterial })
    .position(0.04, -0.095, -2.18)
    .scale([1.12, 0.085, 0.74])
    .runtime(game.runtimeNode("pulse-review-impact-island", { tags: ["combat-impact", "terrain-dressing", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse review exchange island rail", material: reviewAmber })
    .position(0.04, 0.02, -2.18)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.92, 0.60, 0.026])
    .runtime(game.runtimeNode("pulse-review-impact-island-rail", { tags: ["combat-impact", "renderer-owned", "non-colliding"] })),
  primitives.cylinder({ name: "pulse review sentinel dock island", material: reviewTerrainMaterial })
    .position(1.38, -0.095, -3.72)
    .scale([1.60, 0.14, 1.12])
    .runtime(game.runtimeNode("pulse-review-sentinel-island", { tags: ["encounter-grounding", "terrain-dressing", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse review sentinel dock rail", material: reviewRose })
    .position(1.38, 0.025, -3.72)
    .rotate(Math.PI / 2, 0, 0)
    .scale([1.38, 0.92, 0.032])
    .runtime(game.runtimeNode("pulse-review-sentinel-island-rail", { tags: ["encounter-grounding", "renderer-owned", "non-colliding"] }))
];

// Irregular side shelves close the horizon and supply the tiered depth that
// the comparator's arena gets from broad rock platforms. They stay outside
// the three playable lanes and never become a second character or collision
// surface. Staggering their height and yaw prevents a repeated fence pattern.
const reviewEncounterButtressBuilders = [-1, 1].flatMap((side) => [
  { z: 0.66, h: 0.62, r: 0.34, y: 0.18, yaw: side * 0.24 },
  { z: -1.34, h: 0.96, r: 0.46, y: 0.36, yaw: side * -0.16 },
  { z: -3.16, h: 1.34, r: 0.56, y: 0.56, yaw: side * 0.12 },
  { z: -4.95, h: 1.68, r: 0.44, y: 0.78, yaw: side * -0.08 }
].map((rock, index) =>
  primitives.cylinder({
    name: `pulse review side basalt buttress ${side} ${index + 1}`,
    material: index % 3 === 1 ? reviewTerrainWarmMaterial : reviewTerrainMaterial
  })
    .position(side * (3.36 + (index % 2) * 0.24), rock.y, rock.z)
    .rotate((index % 2 === 0 ? 1 : -1) * 0.08, rock.yaw, side * 0.06)
    .scale([rock.r, rock.h, rock.r * (0.78 + (index % 2) * 0.12)])
    .runtime(game.runtimeNode(`pulse-review-side-buttress-${side}-${index}`, { tags: ["terrain-dressing", "renderer-owned", "non-colliding"] }))
));

// Explicit in-scene origin markers and tapered connector beams make the
// projectile ownership inspectable: cyan fire leaves the runner's launch
// muzzle, rose fire leaves the sentry's weapon plane, and both streams meet at
// the same impact shelf. These are renderer-owned support nodes; gate events,
// shields, score, and the authored chart remain the gameplay authority.
const reviewExchangeCausalityBuilders = [
  primitives.torus({ name: "pulse runner launch muzzle", material: reviewCyan })
    .position(-1.38, 0.76, 0.03)
    .scale([0.26, 0.26, 0.055])
    .runtime(game.runtimeNode("pulse-review-runner-muzzle", { tags: ["combat-origin", "runner-lance", "renderer-owned", "non-colliding"] })),
  primitives.sphere({ name: "pulse runner launch core", material: reviewProjectileCoreCyan })
    .position(-1.38, 0.76, 0.03)
    .scale([0.085, 0.085, 0.085])
    .runtime(game.runtimeNode("pulse-review-runner-muzzle-core", { tags: ["combat-origin", "runner-lance", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse sentinel return muzzle", material: reviewRose })
    .position(1.38, 1.16, -3.24)
    .scale([0.29, 0.29, 0.06])
    .runtime(game.runtimeNode("pulse-review-sentry-muzzle", { tags: ["combat-origin", "warden-cutter", "renderer-owned", "non-colliding"] })),
  primitives.sphere({ name: "pulse sentinel return core", material: reviewProjectileCoreRose })
    .position(1.38, 1.16, -3.24)
    .scale([0.095, 0.095, 0.095])
    .runtime(game.runtimeNode("pulse-review-sentry-muzzle-core", { tags: ["combat-origin", "warden-cutter", "renderer-owned", "non-colliding"] })),
  primitives.capsule({ name: "pulse runner impact connector", material: reviewTrailCyan })
    .position(-0.67, 0.87, -1.03)
    .rotate(Math.PI / 2, 0.55, 0.02)
    .scale([0.038, 1.02, 0.038])
    .runtime(game.runtimeNode("pulse-review-runner-impact-connector", { tags: ["combat-vector", "runner-lance", "renderer-owned", "non-colliding"] })),
  primitives.capsule({ name: "pulse sentinel impact connector", material: reviewTrailRose })
    .position(0.71, 1.07, -2.71)
    .rotate(Math.PI / 2, -0.90, -0.02)
    .scale([0.042, 0.82, 0.042])
    .runtime(game.runtimeNode("pulse-review-sentry-impact-connector", { tags: ["combat-vector", "warden-cutter", "renderer-owned", "non-colliding"] }))
];

// Readability accents are attached to the typed silhouettes, not substitutes
// for them: a cool edge traces the runner's wing line, a warm return marker
// identifies the sentry's fire lane, and a small impact cluster marks the
// actual exchange midpoint. Each node is renderer-owned support geometry with
// no gameplay or collision role.
const reviewCombatAccentBuilders = [
  primitives.box({ name: "pulse runner cyan wing edge left", material: reviewSignalMaterial })
    .position(0, -50, 0).scale([0.001, 0.001, 0.001]),
  primitives.box({ name: "pulse runner cyan wing edge right", material: reviewSignalMaterial })
    .position(0, -50, 0).scale([0.001, 0.001, 0.001]),
  primitives.capsule({ name: "pulse runner drive wake left", material: reviewCyan })
    .position(0, -50, 0).scale([0.001, 0.001, 0.001]),
  primitives.capsule({ name: "pulse runner drive wake right", material: reviewCyan })
    .position(0, -50, 0).scale([0.001, 0.001, 0.001]),
  primitives.box({ name: "pulse sentry fire lane marker", material: reviewAccentMaterial })
    .position(0, -50, 0).scale([0.001, 0.001, 0.001]),
  primitives.torus({ name: "pulse exchange impact outer", material: reviewAmber })
    .position(0.04, 0.96, -2.18).scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-impact-outer", { tags: ["combat-impact", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse exchange impact inner", material: reviewCyan })
    .position(0.04, 0.96, -2.18).scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-impact-inner", { tags: ["combat-impact", "renderer-owned", "non-colliding"] })),
  primitives.sphere({ name: "pulse exchange impact core", material: reviewRose })
    .position(0.04, 0.96, -2.18).scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-impact-core", { tags: ["combat-impact", "renderer-owned", "non-colliding"] }))
];

// The typed terminal sentry's authored gunmetal/obsidian shell is intentionally
// dark, but at the exact review distance its shoulder mass can merge into the
// reactor backplate. These small, non-colliding armour and reactor markers are
// attached to the sentry's review pose so its silhouette reads as a deliberate
// combatant rather than a blocky black cut-out. The GLB remains the only primary
// character; this is renderer-owned contour support, not a replacement body.
const reviewSentryIdentityBuilders = [
  primitives.box({ name: "pulse sentry left shoulder contour", material: reviewCyan })
    .position(0.50, 1.36, -3.14)
    .rotate(0, 0.22, -0.18)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-sentry-shoulder-left", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
  primitives.box({ name: "pulse sentry right shoulder contour", material: reviewRose })
    .position(2.26, 1.36, -3.14)
    .rotate(0, -0.22, 0.18)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-sentry-shoulder-right", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
  primitives.box({ name: "pulse sentry reactor chest contour", material: reviewSteelEdge })
    .position(1.38, 1.03, -3.12)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-sentry-chest-plate", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
  primitives.box({ name: "pulse sentry reactor chest signal", material: reviewAmber })
    .position(1.38, 1.16, -3.04)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-sentry-chest-signal", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] }))
];

// A few compact contour pieces reinforce the two typed silhouettes at the
// frozen review distance.  The runner receives cyan engine collars and a
// canopy spine; the sentry receives a rose sensor visor and paired weapon
// rails.  These are explicitly support geometry, never a replacement body or
// a second gameplay collider, so the typed GLBs remain the only named actors.
const reviewActorContourBuilders = [
  primitives.torus({ name: "pulse runner engine collar left", material: reviewCyan })
    .position(0, -50, 0)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-runner-collar-left", { tags: ["typed-runner-support", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse runner engine collar right", material: reviewCyan })
    .position(0, -50, 0)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-runner-collar-right", { tags: ["typed-runner-support", "renderer-owned", "non-colliding"] })),
  primitives.box({ name: "pulse runner canopy spine", material: reviewDeckInsetEdgeMaterial })
    .position(0, -50, 0)
    .rotate(0, 0.05, 0)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-runner-canopy-spine", { tags: ["typed-runner-support", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse sentry rose sensor visor", material: reviewRose })
    .position(0, -50, 0)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-sentry-visor", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
  primitives.box({ name: "pulse sentry weapon rail left", material: reviewBeamMaterial })
    .position(0, -50, 0)
    .rotate(0, -0.10, 0.02)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-sentry-weapon-left", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
  primitives.box({ name: "pulse sentry weapon rail right", material: reviewBeamMaterial })
    .position(0, -50, 0)
    .rotate(0, 0.10, -0.02)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("pulse-review-sentry-weapon-right", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] }))
];

// The final visual pass uses a purpose-built, three-plane encounter stage. The
// old custom footprint prism was broad enough to become a single blank floor
// under safe-basic; these smaller authored modules create a clear launch apron,
// recessed exchange lane, and raised sentinel dock while leaving all timing and
// collision authority in the existing chart/gate systems.
const reviewArenaWorldBuilders = [
  // Narrow central causeway and inset exchange lane.
  primitives.box({ name: "pulse review causeway deck", material: reviewSteel })
    .position(0, -0.22, -2.15).scale([2.95, 0.12, 4.85]),
  primitives.box({ name: "pulse review foreground staging deck", material: reviewSteel })
    .position(0, -0.19, 2.45).scale([3.0, 0.1, 3.9]),
  primitives.box({ name: "pulse review exchange lane", material: reviewDeckMaterial })
    .position(0, -0.06, -2.1).scale([1.05, 0.045, 4.45]),
  primitives.box({ name: "pulse review runner launch apron", material: reviewShoulderMaterial })
    .position(0, -50, 0).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review sentinel raised dock", material: reviewSteelEdge })
    .position(0, -0.01, -6.2).scale([1.56, 0.18, 1.16]),
  primitives.box({ name: "pulse review sentinel backplate", material: reviewSteel })
    .position(0, -50, -7.2).scale([0.0001, 0.0001, 0.0001]),
  primitives.box({ name: "pulse review runner launch spine", material: reviewSteelEdge })
    .position(0, -50, 0).scale([0.0001, 0.0001, 0.0001]),
  primitives.torus({ name: "pulse review runner launch ring", material: reviewCyan })
    .position(0, -50, 0).scale([0.0001, 0.0001, 0.0001]),
  // Hide flat side containment and ceiling rib boxes so 3D Meshy arches frame the corridor cleanly.
  ...[-1, 1].flatMap((side) => [
    primitives.box({ name: `pulse review lower containment ${side}`, material: reviewSteel })
      .position(0, -50, -2.35).rotate(0, side * 0.08, 0).scale([0.0001, 0.0001, 0.0001]),
    primitives.box({ name: `pulse review upper containment ${side}`, material: reviewShoulderMaterial })
      .position(0, -50, -3.25).rotate(0, side * -0.16, side * 0.06).scale([0.0001, 0.0001, 0.0001]),
    primitives.box({ name: `pulse review side conduit ${side}`, material: reviewCyan })
      .position(side * 2.63, 0.44, -2.35).rotate(0, 0, side * 0.02).scale([0.035, 0.035, 3.25])
  ]),
  ...[-2.3, -0.55, 1.25, 3.0].flatMap((z, index) => [
    primitives.box({ name: `pulse review overhead rib left ${index}`, material: reviewSteelEdge })
      .position(0, -50, z).rotate(0, 0, -0.24).scale([0.0001, 0.0001, 0.0001]),
    primitives.box({ name: `pulse review overhead rib right ${index}`, material: reviewSteelEdge })
      .position(0, -50, z).rotate(0, 0, 0.24).scale([0.0001, 0.0001, 0.0001])
  ]),
  primitives.torus({ name: "pulse review reactor iris", material: reviewRose })
    .position(0, 1.78, -6.96).rotate(0, 0, 0).scale([1.16, 1.16, 0.08]),
  primitives.sphere({ name: "pulse review reactor core", material: reviewAmber })
    .position(0, 1.78, -6.78).scale([0.24, 0.24, 0.18]),
  ...[-1.95, -1.05, -0.15, 0.75].map((z, index) =>
    primitives.box({ name: `pulse review lane marker ${index}`, material: reviewCyan })
      .position(0, 0.04, z).rotate(0, 0, 0).scale([0.48, 0.018, 0.035])
  ),
  primitives.torus({ name: "pulse boss attack origin halo", material: reviewRose })
    .position(0, -50, 0).scale([0.0001, 0.0001, 0.0001])
    .runtime(game.runtimeNode("pulse-review-attack-origin", { tags: ["finale-arena", "attack-origin", "renderer-owned"] })),
  primitives.torus({ name: "pulse player shield impact plane", material: reviewCyan })
    .position(0, -50, 0).scale([0.0001, 0.0001, 0.0001])
    .runtime(game.runtimeNode("pulse-review-impact-plane", { tags: ["finale-arena", "impact-plane", "renderer-owned", "non-colliding"] })),
  primitives.torus({ name: "pulse terminal lock ring", material: reviewRose })
    .position(0, -50, 0).scale([0.0001, 0.0001, 0.0001])
];

// Repeating 3D Meshy pulseNeonGateArchMeshy arches (9.5m width x 6.2m height)
// every ~8 meters down the tunnel, 3D lane hazards (pulseBarrierDroneWallMeshy +
// neonSwarmChaserDroneMeshy), and 3D rhythm collectibles (skylineCrystalShardMeshy +
// fpsEnergyCorePickupMeshy), plus twin plasma afterburner plumes & Pulse Cannon bolts.
const TUNNEL_ARCH_ZS = [2.4, -5.6, -13.6, -21.6, -29.6, -37.6] as const;
const RHYTHM_NODE_SPECS = [
  { z: -0.6, x: 0.0, kind: "shard" },
  { z: -2.2, x: -1.02, kind: "core" },
  { z: -3.9, x: 1.02, kind: "shard" },
  { z: -5.8, x: 0.0, kind: "core" },
  { z: -7.9, x: -1.02, kind: "shard" },
  { z: -10.2, x: 1.02, kind: "core" }
] as const;
const CORRIDOR_DRONE_HAZARD_SPECS = [
  { z: -3.2, x: -1.05, kind: "chaser" },
  { z: -4.8, x: 1.05, kind: "barrier" },
  { z: -7.1, x: -0.95, kind: "barrier" },
  { z: -9.4, x: 1.02, kind: "chaser" }
] as const;

const corridorMeshyGateAndShardBuilders = [
  ...TUNNEL_ARCH_ZS.flatMap((z, index) => [
    // Overhead spanning 3D Meshy arch crown (9.5m width across tunnel ceiling)
    model(rootAssets.pulseNeonGateArchMeshy, {
      name: `pulse-corridor-meshy-gate-arch-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 9.5
    })
      .position(0, 3.55, z)
      .rotate(0, 0, Math.PI / 2)
      .scale([0.42, 1.0, 0.88])
      .runtime(game.runtimeNode(`pulse-corridor-meshy-gate-${index}`, { tags: ["corridor-gate", "typed-meshy", "renderer-owned", "non-colliding"] })),
    // Left 3D Meshy arch pillar (targetHeight: 6.2)
    model(rootAssets.pulseNeonGateArchMeshy, {
      name: `pulse-corridor-meshy-arch-pillar-left-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetHeight: 6.2
    })
      .position(-3.45, 0.45, z)
      .rotate(0, 0.14, -0.24)
      .scale([0.85, 0.68, 0.85])
      .runtime(game.runtimeNode(`pulse-corridor-arch-left-${index}`, { tags: ["corridor-gate", "typed-meshy", "renderer-owned", "non-colliding"] })),
    // Right 3D Meshy arch pillar (targetHeight: 6.2)
    model(rootAssets.pulseNeonGateArchMeshy, {
      name: `pulse-corridor-meshy-arch-pillar-right-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetHeight: 6.2
    })
      .position(3.45, 0.45, z)
      .rotate(0, -0.14, 0.24)
      .scale([0.85, 0.68, 0.85])
      .runtime(game.runtimeNode(`pulse-corridor-arch-right-${index}`, { tags: ["corridor-gate", "typed-meshy", "renderer-owned", "non-colliding"] })),
    model(rootAssets.skylineCrystalShardMeshy, {
      name: `pulse-corridor-crystal-shard-left-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.68
    })
      .position(-2.65 - (index % 2) * 0.18, 0.55 + (index % 2) * 0.14, z + 0.35)
      .rotate(0.14, 0.42 + index * 0.35, -0.18)
      .scale(0.68)
      .runtime(game.runtimeNode(`pulse-corridor-crystal-left-${index}`, { tags: ["corridor-crystal", "typed-meshy", "renderer-owned", "non-colliding"] })),
    model(rootAssets.skylineCrystalShardMeshy, {
      name: `pulse-corridor-crystal-shard-right-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.68
    })
      .position(2.65 + (index % 2) * 0.18, 0.58 + (index % 2) * 0.14, z - 0.25)
      .rotate(-0.12, -0.38 - index * 0.35, 0.16)
      .scale(0.68)
      .runtime(game.runtimeNode(`pulse-corridor-crystal-right-${index}`, { tags: ["corridor-crystal", "typed-meshy", "renderer-owned", "non-colliding"] }))
  ]),
  // 3D Collectible Rhythm Nodes (skylineCrystalShardMeshy + fpsEnergyCorePickupMeshy) in the lanes
  ...RHYTHM_NODE_SPECS.map((node, index) =>
    model(node.kind === "shard" ? rootAssets.skylineCrystalShardMeshy : rootAssets.fpsEnergyCorePickupMeshy, {
      name: `pulse-rhythm-collectible-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: node.kind === "shard" ? 0.54 : 0.48
    })
      .position(node.x, 0.46, node.z)
      .rotate(0.15, index * 0.8, 0.12)
      .runtime(game.runtimeNode(`pulse-rhythm-collectible-${index}`, { tags: ["rhythm-collectible", "typed-meshy", "renderer-owned", "non-colliding"] }))
  ),
  // 3D Corridor Obstacle Hazards (pulseBarrierDroneWallMeshy + neonSwarmChaserDroneMeshy)
  ...CORRIDOR_DRONE_HAZARD_SPECS.map((hazard, index) =>
    model(hazard.kind === "chaser" ? rootAssets.neonSwarmChaserDroneMeshy : rootAssets.pulseBarrierDroneWallMeshy, {
      name: `pulse-corridor-hazard-drone-${index}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: hazard.kind === "chaser" ? 0.78 : 0.92
    })
      .position(hazard.x, hazard.kind === "chaser" ? 0.58 : 0.38, hazard.z)
      .rotate(0, hazard.x < 0 ? 0.18 : -0.18, 0)
      .runtime(game.runtimeNode(`pulse-corridor-hazard-drone-${index}`, { tags: ["corridor-hazard", "typed-meshy", "renderer-owned", "non-colliding"] }))
  ),
  // Twin glowing cyan/magenta plasma afterburner plumes behind hero starfighter
  primitives.capsule({
    name: "pulse starfighter afterburner plume left",
    material: material.emissive({
      name: "afterburner cyan plume",
      color: "#67e8f9",
      emissive: "#22d3ee",
      emissiveIntensity: 2.35,
      opacity: 0.88
    })
  })
    .position(-0.18, 0.44, 2.22)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.055, 0.34, 0.055])
    .runtime(game.runtimeNode("pulse-afterburner-left", { tags: ["player", "afterburner", "renderer-owned"] })),
  primitives.capsule({
    name: "pulse starfighter afterburner plume right",
    material: material.emissive({
      name: "afterburner magenta plume",
      color: "#f5d0fe",
      emissive: "#e879f9",
      emissiveIntensity: 2.35,
      opacity: 0.88
    })
  })
    .position(0.18, 0.44, 2.22)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.055, 0.34, 0.055])
    .runtime(game.runtimeNode("pulse-afterburner-right", { tags: ["player", "afterburner", "renderer-owned"] })),
  // Pulse Cannon plasma bolts (J / F)
  ...Array.from({ length: 4 }, (_, index) =>
    primitives.sphere({
      name: `pulse cannon plasma bolt ${index + 1}`,
      material: material.emissive({
        name: `pulse cannon bolt mat ${index}`,
        color: index % 2 === 0 ? "#e0f2fe" : "#fae8ff",
        emissive: index % 2 === 0 ? "#22d3ee" : "#e879f9",
        emissiveIntensity: 2.55
      })
    })
      .position(index % 2 === 0 ? -0.22 : 0.22, 0.48, 0.4 - index * 1.1)
      .scale([0.09, 0.09, 0.24])
      .runtime(game.runtimeNode(`pulse-cannon-bolt-${index}`, { tags: ["player", "pulse-cannon", "renderer-owned"] }))
  ),
  // Keep formation wingman handles registered for asset checks while parked out
  // of the active foreground lane so the player starfighter reads as a single,
  // unmistakable hero silhouette in the center of the tunnel.
  model(assets.pulseStarfighterHeroMeshy, {
    name: "pulse-formation-wingman-left",
    role: "setDressing",
    targetMaxDimension: 1.95,
    visible: false
  })
    .position(0, -50, 0)
    .rotate(0, Math.PI / 2, 0)
    .scale(0.001)
    .runtime(game.runtimeNode("pulse-formation-wingman-left", { tags: ["runner-formation", "typed-primary", "renderer-owned", "non-colliding"] })),
  model(assets.pulseStarfighterHeroMeshy, {
    name: "pulse-formation-wingman-right",
    role: "setDressing",
    targetMaxDimension: 1.95,
    visible: false
  })
    .position(0, -50, 0)
    .rotate(0, Math.PI / 2, 0)
    .scale(0.001)
    .runtime(game.runtimeNode("pulse-formation-wingman-right", { tags: ["runner-formation", "typed-primary", "renderer-owned", "non-colliding"] }))
];

// Compact modeled packet cores replace the old review cylinders, whose
// safe-basic orientation could rasterize as opaque cards or vertical spikes.
// They are still renderer-owned three-dimensional scene nodes: the route
// animates them between typed actors, while the gate chart remains the only
// gameplay authority.
const reviewProjectileBuilders = Array.from({ length: 16 }, (_, index) =>
  primitives.sphere({
    name: `pulse review ${index < 8 ? "runner lance" : "warden cutter"} packet ${index + 1}`,
    material: index < 8 ? reviewProjectileCoreCyan : reviewProjectileCoreRose
  })
    // A 0.10-u packet became a single-pixel dot in the reduced-motion
    // capture.  The larger 0.15-u core remains a compact projectile, while
    // its separate wake below preserves travel direction.
    .position(0, 0.4, -2.2).scale([0.15, 0.15, 0.15])
    .runtime(game.runtimeNode(`pulse-review-projectile-${index}`, { tags: ["finale-projectile", "renderer-owned", index < 8 ? "runner-lance" : "warden-cutter"] }))
);

// Each authored packet now leaves a short, dimmer 3D wake. The wakes are
// intentionally separate nodes so their direction and depth can be inspected
// in the exact frame; they are not CSS trails or gameplay/collision geometry.
// A box is used here instead of a Y-axis capsule so the runtime can aim the
// wake in the actual X/Z travel direction with one deterministic yaw. The
// sphere packet remains the bright projectile core; this directional support
// piece is what makes the two streams read as fire instead of a pile of dots.
const reviewProjectileTrailBuilders = Array.from({ length: 16 }, (_, index) =>
  primitives.box({
    name: `pulse review ${index < 8 ? "runner lance" : "warden cutter"} trail ${index + 1}`,
    material: index < 8 ? reviewTrailCyan : reviewTrailRose
  })
    .position(0, 0.4, -2.2).scale([0.28, 0.036, 0.036])
    .runtime(game.runtimeNode(`pulse-review-projectile-trail-${index}`, { tags: ["finale-projectile-trail", "renderer-owned", "non-colliding"] }))
);

// A small radial burst at the exchange midpoint supplies an authored impact
// hierarchy between the two typed actors. It remains a presentation cue only;
// shield loss, graze, and chart timing continue to come from gateSystem.
const reviewImpactShardBuilders = Array.from({ length: 8 }, (_, index) =>
  primitives.sphere({
    name: `pulse review impact shard ${index + 1}`,
    material: index % 2 === 0 ? reviewTrailCyan : reviewTrailRose
  })
    .position(0.04, 0.96, -2.18).scale([0.06, 0.06, 0.06])
    .runtime(game.runtimeNode(`pulse-review-impact-shard-${index}`, { tags: ["combat-impact", "renderer-owned", "non-colliding"] }))
);

// Impact sparks are separate emissive scene nodes rather than a single bright
// card.  Their radial placement and pulse give the frozen capture a readable
// contact moment between the opposing streams; they remain presentation-only
// and never feed shield, gate, or score state.
const reviewImpactBurstBuilders = Array.from({ length: 10 }, (_, index) =>
  primitives.sphere({
    name: `pulse review impact burst orb ${index + 1}`,
    material: index % 3 === 0 ? reviewProjectileCoreRose : index % 3 === 1 ? reviewProjectileCoreCyan : reviewAmber
  })
    .position(0.04, 0.96, -2.18)
    .scale([0.07, 0.07, 0.07])
    .runtime(game.runtimeNode(`pulse-review-impact-burst-${index}`, { tags: ["combat-impact", "renderer-owned", "non-colliding"] }))
);

// Directional impact rays read more like a parry/explosion than a static ball
// cluster.  They are short capsules with alternating cool/warm materials and
// remain locked to the event impact plane; no ray participates in collision or
// score resolution.
const reviewImpactRayBuilders = Array.from({ length: 8 }, (_, index) => {
  const angle = index / 8 * Math.PI * 2;
  const materialForRay = index % 2 === 0 ? reviewTrailCyan : reviewTrailRose;
  return primitives.capsule({
    name: `pulse review impact ray ${index + 1}`,
    material: materialForRay
  })
    .position(0.04 + Math.cos(angle) * 0.34, 0.96 + Math.sin(angle) * 0.24, -2.16 + Math.sin(angle * 1.7) * 0.04)
    .rotate(Math.PI / 2, 0, angle)
    .scale([0.026, 0.28 + (index % 3) * 0.06, 0.026])
    .runtime(game.runtimeNode(`pulse-review-impact-ray-${index}`, { tags: ["combat-impact", "event-feedback", "renderer-owned", "non-colliding"] }));
});

// Event rings and a cross-shaped contact flash turn the latest gate result into
// a legible in-scene beat. They are driven from `reviewCombatPulse` below (the
// same PulsePassEvent published to evidence), so a pass/graze/collision can be
// inspected at the impact plane without inventing a second combat simulation.
const reviewImpactWaveBuilders = Array.from({ length: 3 }, (_, index) =>
  primitives.torus({
    name: `pulse review impact wave ${index + 1}`,
    material: index === 0 ? reviewProjectileCoreRose : index === 1 ? reviewProjectileCoreCyan : reviewAmber
  })
    .position(0.04, 0.96, -2.18)
    .scale([0.30 + index * 0.18, 0.30 + index * 0.18, 0.035])
    .runtime(game.runtimeNode(`pulse-review-impact-wave-${index}`, { tags: ["combat-impact", "event-feedback", "renderer-owned", "non-colliding"] }))
);

const app = createAuraApp("#app", {
  scene: scene()
    .background("#171a38")
    .addMany([
      ...hueBuilders,
      ...rainBuilders,
      ...reviewArenaWorldBuilders,
      ...reviewStructureBuilders,
      ...reviewArchitectureAccentBuilders,
      ...reviewAtmosphereBuilders,
      ...reviewTerrainBuilders,
      ...reviewEncounterIslandBuilders,
      ...reviewEncounterButtressBuilders,
      ...reviewExchangeCausalityBuilders,
      ...reviewCombatAccentBuilders,
      ...reviewSentryIdentityBuilders,
      ...reviewActorContourBuilders,
      ...corridorMeshyGateAndShardBuilders,
      finaleBeaconBuilder,
      ...finaleShieldVaneBuilders,
      ...(pulseArenaCandidateEnabled ? [finaleArenaCandidateBuilder] : [finaleArenaShellBuilder]),
      finaleTerminalSentryBuilder,
      ...finaleProjectileBuilders,
      ...reviewProjectileBuilders,
      ...reviewProjectileTrailBuilders,
      ...reviewImpactShardBuilders,
      ...reviewImpactBurstBuilders,
      ...reviewImpactRayBuilders,
      ...reviewImpactWaveBuilders,
      // A real Aura3D particle effect supplies the encounter's volumetric
      // discharge layer.  It is set dressing around the typed
      // runner/sentry exchange; route-owned pass events still determine the
      // packet positions and impact state below.
      effects.particles({
        name: "pulse typed encounter discharge plume",
        emitter: "fountain",
        particleCount: reducedMotion ? 56 : 112,
        emissionRate: reducedMotion ? 10 : 26,
        color: "#7cecf2",
        radius: 1.18,
        height: 1.35,
        speed: reducedMotion ? 0.12 : 0.64,
        gravity: 0.18,
        intensity: 0.48,
        turbulence: 0.028,
        noise: 0.012,
        materialMode: "spark",
        texturedBillboard: false,
        sizeOverLife: [0.62, 1.04, 0.48],
        alphaOverLife: [0.22, 0.62, 0.12]
      }),
      // Warm counter-particles give the sentry side a distinct attack
      // signature.  They are renderer-owned atmosphere only; the actual
      // projectile/impact state still comes from PulsePassEvent below.
      effects.particles({
        name: "pulse typed encounter ember fall",
        emitter: "fountain",
        particleCount: reducedMotion ? 40 : 84,
        emissionRate: reducedMotion ? 8 : 18,
        color: "#f58da9",
        radius: 2.10,
        height: 1.85,
        speed: reducedMotion ? 0.08 : 0.46,
        gravity: -0.12,
        intensity: 0.36,
        turbulence: 0.045,
        noise: 0.018,
        materialMode: "spark",
        texturedBillboard: false,
        sizeOverLife: [0.48, 0.92, 0.24],
        alphaOverLife: [0.10, 0.48, 0.06]
      }),
      // A lower cool mist hugs the deck and creates a readable value break
      // under the two silhouettes without becoming a CSS/card effect.
      effects.particles({
        name: "pulse reactor deck mist",
        emitter: "fountain",
        particleCount: reducedMotion ? 28 : 56,
        emissionRate: reducedMotion ? 6 : 14,
        color: "#5ad8e8",
        radius: 2.85,
        height: 0.34,
        speed: reducedMotion ? 0.05 : 0.22,
        gravity: 0.02,
        intensity: 0.22,
        turbulence: 0.06,
        noise: 0.025,
        materialMode: "spark",
        texturedBillboard: false,
        sizeOverLife: [0.35, 0.72, 0.20],
        alphaOverLife: [0.08, 0.28, 0.03]
      }),
      effects.neonBloom({ intensity: 0.22, threshold: 0.80, maxIntensity: 0.48, antiBlowout: true, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.colorGrade({ exposure: 1.05, contrast: 1.07, saturation: 1.12 }),
      effects.antiAlias({ mode: "fxaa" }),
      effects.fog({ name: "pulse downbeat fog pulse", density: 0.009, color: "#11192a" })
        .runtime(game.runtimeNode("pulse-fog-pulse", { tags: ["downbeat-fog"] })),
      // Deliberate three-plane lighting setup: neutral front key on the player,
      // warm terminal key, and a cooler crown/rim on the deck, gates, and ribs.
      lights.directional({ name: "corridor sun", color: "#c0e1f2", intensity: 0.94 }).position(-5, 10, 6),
      lights.directional({ name: "terminal warm edge", color: "#ffc08a", intensity: 0.78 }).position(4.5, 5.8, -3.6),
      lights.ambient({ name: "corridor ambient", color: "#5a537b", intensity: 0.78 }),
      lights.directional({ name: "review actor neutral fill", color: "#d9f4ff", intensity: 1.22 }).position(-2.4, 6.8, 7.4),
      lights.point({ name: "review runner cyan fill", color: "#48e5ff", intensity: 1.65 }).position(-1.72, 1.72, 2.65),
      lights.point({ name: "review sentry warm fill", color: "#ffc18f", intensity: 1.85 }).position(1.48, 2.10, -1.25),
      lights.point({ name: "runner silhouette front key", color: "#d6edff", intensity: 0.95 }).position(-0.7, 1.72, 3.2),
      lights.point({ name: "runner cyan underside bounce", color: "#48dfff", intensity: 0.92 }).position(-1.5, 0.42, 1.25),
      lights.point({ name: "terminal amber detail key", color: "#ffbd72", intensity: 1.38 }).position(1.5, 2.0, -3.2),
      lights.point({ name: "terminal magenta rim", color: "#ff72ac", intensity: 1.12 }).position(-1.2, 1.62, -4.0),
      lights.point({ name: "deck cyan depth practical", color: "#39d9f2", intensity: 1.05 }).position(-2.85, 1.8, -1.85),
      lights.point({ name: "exchange impact key", color: "#ffb46b", intensity: 0.85 }).position(0.04, 1.1, -2.18),
      lights.point({ name: "meshy gate near cyan key", color: "#22d3ee", intensity: 2.1 }).position(0, 2.1, -1.5),
      lights.point({ name: "meshy gate mid magenta key", color: "#e879f9", intensity: 2.1 }).position(0, 2.2, -3.8),
      lights.point({ name: "meshy gate far cyan key", color: "#38bdf8", intensity: 1.95 }).position(0, 2.2, -6.5),
      lights.point({ name: "cavern cyan practical", color: "#22d3ee", intensity: 1.45 }).position(-2.8, 1.1, -5),
      lights.point({ name: "cavern magenta practical", color: "#d946ef", intensity: 1.35 }).position(2.8, 1.4, -9),
      lights.point({ name: "cavern ember practical", color: "#fb7185", intensity: 1.15 }).position(0.3, 0.9, -14),
      lights.point({ name: "finale core rose key", color: "#fb7185", intensity: 1.65 }).position(0, 2.4, -4.4),
      lights.point({ name: "finale arena cyan rim", color: "#22d3ee", intensity: 1.75 }).position(-3.2, 1.4, -2.8),
      lights.point({ name: "finale arena warm edge", color: "#ff9b72", intensity: 1.45 }).position(4.2, 2.2, -1.1),
      primitives.sphere({
        name: "pulse shield hit orb",
        material: material.emissive({
          name: "shield pulse",
          color: "#fecdd3",
          emissive: "#f43f5e",
          opacity: 0.5,
          emissiveIntensity: 1.4
        })
      })
        // A bounded orb remains local even when alpha falls back to opaque.
        .position(0, 0.45, PULSE_PLAYER_Z - 0.18)
        .scale([0.42, 0.42, 0.18])
        .runtime(game.runtimeNode("pulse-hit-flash", { tags: ["feedback"] })),

      // 3-Lane Track Neon Floor Grid (tucked under 3D causeway)
      primitives.plane({
        name: "track floor base",
        material: material.pbr({ name: "track asphalt", color: "#090d16", roughness: 0.65, metallic: 0.35 })
      })
        .position(0, -0.05, -8)
        .scale([0.001, 0.001, 0.001]),

      // Left Lane Divider Neon Line
      primitives.plane({
        name: "track lane line left",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.0 })
      })
        .position(-0.6, -0.04, -8)
        .scale([0.001, 0.001, 0.001]),

      // Right Lane Divider Neon Line
      primitives.plane({
        name: "track lane line right",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.0 })
      })
        .position(0.6, -0.04, -8)
        .scale([0.001, 0.001, 0.001]),

      // Typed player craft. The Meshy starfighter has its nose authored along +X,
      // so rotating +Math.PI/2 around Y points its nose straight down -Z into
      // the tunnel while keeping its twin blue engine thrusters facing the camera.
      model(assets.pulseStarfighterHeroMeshy, {
        name: "pulse original runner craft",
        scaleMode: "fit",
        targetMaxDimension: 1.25,
        castShadow: true,
        receiveShadow: true
      })
        .position(0, 0.44, 1.65)
        .rotate(0, Math.PI / 2, 0)
        .scale(0.68)
        .runtime(game.runtimeNode("pulse-ship-body", { tags: ["player", "craft", "typed-primary"] })),
      primitives.sphere({ name: "pulse glider engine glow", material: glowMaterial })
        .position(0, 0.46, 2.15)
        .scale([0.09, 0.09, 0.09])
        .runtime(game.runtimeNode("pulse-ship-glow", { tags: ["player", "craft"] })),
      // Hover light: a soft cyan pool on the deck under the craft.
      primitives.plane({
        name: "pulse ship hover light",
        material: material.emissive({
          name: "hover light cyan",
          color: "#22d3ee",
          emissive: "#22d3ee",
          emissiveIntensity: 0.45,
          opacity: 0.12
        })
      })
        .position(0, 0.01, 1.65)
        .scale([0.38, 1, 0.28])
        .runtime(game.runtimeNode("pulse-ship-hover-light", {
          tags: ["player", "craft", "hover-cue", "renderer-owned", "non-colliding", "alpha-blended"]
        })),
      ...gateSlotBuilders,
      ...sparkBuilders
    ])
    .camera(camera.perspective({ position: [0.10, 2.72, 6.55], target: [0.02, 0.92, -2.02], fov: 47 })),
  physics: {
    seed: 20260912,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
  diagnostics: false,
  autoStart: true
});

// ---- runtime handles ---------------------------------------------------------

/**
 * The concrete runtime handle behind app.nodes also exposes setMaterial for primitive
 * nodes; RuntimeNodeHandleLike types it as optional-absent, so this structural
 * extension names what the gate pre-flash actually calls.
 */
interface PulseNodeHandle extends RuntimeNodeHandleLike {
  setMaterial(spec: AuraMaterialSpec): this;
}
const requireHandle = (id: string): RuntimeNodeHandleLike => app.nodes.require(id);
const requireGateHandle = (id: string): PulseNodeHandle => app.nodes.require(id) as unknown as PulseNodeHandle;

const fogPulse = requireHandle("pulse-fog-pulse");
const hitFlash = requireHandle("pulse-hit-flash");
const shipBody = requireHandle("pulse-ship-body");
const shipGlow = requireHandle("pulse-ship-glow");
const shipHoverLight = requireHandle("pulse-ship-hover-light");
const afterburnerLeft = requireHandle("pulse-afterburner-left");
const afterburnerRight = requireHandle("pulse-afterburner-right");
const cannonBolts = Array.from({ length: 4 }, (_, index) => requireHandle(`pulse-cannon-bolt-${index}`));
const rhythmCollectibles = RHYTHM_NODE_SPECS.map((_, index) => requireHandle(`pulse-rhythm-collectible-${index}`));
const corridorHazardDrones = CORRIDOR_DRONE_HAZARD_SPECS.map((_, index) => requireHandle(`pulse-corridor-hazard-drone-${index}`));
const finaleBeacon = requireHandle("pulse-finale-beacon");
const finaleShieldVanes = finaleShieldVaneBuilders.map((_, index) => requireHandle("pulse-finale-shield-vane-" + index));
const finaleArenaShell = requireHandle(pulseArenaCandidateEnabled ? "pulse-finale-arena-candidate" : "pulse-finale-arena-shell");
const finaleTerminalSentry = requireHandle("pulse-finale-terminal-sentry");
const finaleProjectiles = finaleProjectileBuilders.map((_, index) => requireHandle("pulse-finale-projectile-" + index));
const finaleArenaDressing: RuntimeNodeHandleLike[] = [];
const reviewProjectiles = reviewProjectileBuilders.map((_, index) => requireHandle(`pulse-review-projectile-${index}`));
const reviewProjectileTrails = reviewProjectileTrailBuilders.map((_, index) => requireHandle(`pulse-review-projectile-trail-${index}`));
const reviewImpactShards = reviewImpactShardBuilders.map((_, index) => requireHandle(`pulse-review-impact-shard-${index}`));
const reviewImpactBursts = reviewImpactBurstBuilders.map((_, index) => requireHandle(`pulse-review-impact-burst-${index}`));
const reviewImpactRays = reviewImpactRayBuilders.map((_, index) => requireHandle(`pulse-review-impact-ray-${index}`));
const reviewImpactWaves = reviewImpactWaveBuilders.map((_, index) => requireHandle(`pulse-review-impact-wave-${index}`));
const rainHandles = rainBuilders.map((_, index) => requireHandle("pulse-rain-" + index));
const reviewAttackOrigin = requireHandle("pulse-review-attack-origin");
const reviewImpactPlane = requireHandle("pulse-review-impact-plane");
const reviewImpactOuter = requireHandle("pulse-review-impact-outer");
const reviewImpactInner = requireHandle("pulse-review-impact-inner");
const reviewImpactCore = requireHandle("pulse-review-impact-core");
const reviewEncounterIslands = reviewEncounterIslandBuilders.map((_, index) =>
  requireHandle([
    "pulse-review-runner-island",
    "pulse-review-runner-island-rail",
    "pulse-review-impact-island",
    "pulse-review-impact-island-rail",
    "pulse-review-sentinel-island",
    "pulse-review-sentinel-island-rail"
  ][index])
);
const reviewEncounterButtresses = reviewEncounterButtressBuilders.map((_, index) =>
  requireHandle(`pulse-review-side-buttress-${index < 4 ? -1 : 1}-${index < 4 ? index : index - 4}`)
);
const reviewExchangeCausality = reviewExchangeCausalityBuilders.map((_, index) =>
  requireHandle([
    "pulse-review-runner-muzzle",
    "pulse-review-runner-muzzle-core",
    "pulse-review-sentry-muzzle",
    "pulse-review-sentry-muzzle-core",
    "pulse-review-runner-impact-connector",
    "pulse-review-sentry-impact-connector"
  ][index])
);
const reviewSentryIdentity = reviewSentryIdentityBuilders.map((_, index) =>
  requireHandle([
    "pulse-review-sentry-shoulder-left",
    "pulse-review-sentry-shoulder-right",
    "pulse-review-sentry-chest-plate",
    "pulse-review-sentry-chest-signal"
  ][index])
);
const reviewGantries: RuntimeNodeHandleLike[] = [];
(shipGlow as PulseNodeHandle).setMaterial(reviewRunnerGlowMaterial);
fogPulse.setVisible(false);
hitFlash.setVisible(false);
finaleBeacon.setVisible(false);
for (const vane of finaleShieldVanes) vane.setVisible(false);
finaleArenaShell.setVisible(true);
finaleTerminalSentry.setVisible(true);
for (const dressing of finaleArenaDressing) dressing.setVisible(false);
for (const projectile of finaleProjectiles) projectile.setVisible(false);
for (const projectile of reviewProjectiles) projectile.setVisible(true);
for (const trail of reviewProjectileTrails) trail.setVisible(true);
for (const shard of reviewImpactShards) shard.setVisible(true);
for (const burst of reviewImpactBursts) burst.setVisible(true);
for (const ray of reviewImpactRays) ray.setVisible(true);
for (const wave of reviewImpactWaves) wave.setVisible(true);
for (const rain of rainHandles) rain.setVisible(true);
reviewAttackOrigin?.setVisible(false);
reviewImpactPlane?.setVisible(true);
reviewImpactOuter?.setVisible(true);
reviewImpactInner?.setVisible(true);
reviewImpactCore?.setVisible(true);
for (const island of reviewEncounterIslands) island.setVisible(true);
for (const buttress of reviewEncounterButtresses) buttress.setVisible(true);
for (const marker of reviewExchangeCausality) marker.setVisible(true);
for (const accent of reviewSentryIdentity) accent.setVisible(true);
for (const gantry of reviewGantries) gantry.setVisible(false);

const hueHandles: Record<PulseSectionId, RuntimeNodeHandleLike[]> = {
  intro: hueIds.intro.map(requireHandle),
  build: hueIds.build.map(requireHandle),
  drop: hueIds.drop.map(requireHandle),
  finale: hueIds.finale.map(requireHandle)
};

interface GateSlotParts {
  readonly barrier: PulseNodeHandle;
  readonly chaser: PulseNodeHandle;
  readonly top: PulseNodeHandle;
  readonly bottom: PulseNodeHandle;
  readonly core: PulseNodeHandle;
}
const gateSlots: GateSlotParts[] = Array.from({ length: GATE_SLOTS }, (_, slot) => ({
  barrier: requireGateHandle(`pulse-gate-${slot}-barrier`),
  chaser: requireGateHandle(`pulse-gate-${slot}-chaser`),
  top: requireGateHandle(`pulse-gate-${slot}-top`),
  bottom: requireGateHandle(`pulse-gate-${slot}-bottom`),
  core: requireGateHandle(`pulse-gate-${slot}-core`)
}));
for (const parts of gateSlots) {
  parts.barrier.setVisible(false);
  parts.chaser.setVisible(false);
  parts.top.setVisible(false);
  parts.bottom.setVisible(false);
  parts.core.setVisible(false);
}

const sparks: { handle: RuntimeNodeHandleLike; life: number; x: number; y: number }[] =
  Array.from({ length: SPARK_POOL }, (_, index) => ({
    handle: app.nodes.require(`pulse-spark-${index}`),
    life: 0,
    x: 0,
    y: 0
  }));
for (const spark of sparks) spark.handle.setVisible(false);

// ---- evidence ---------------------------------------------------------------

type RunState = "ready" | "running" | "paused" | "summary";

const evidence = {
  schema: "pulse-tunnel-evidence/1.0",
  appId: "showcase-pulse-tunnel",
  label: "prototype" as const,
  mounted: true,
  syncMode: "beat" as PulseSyncMode,
  driftMs: 0,
  section: "intro" as PulseSectionId,
  distance: 0,
  style: 1,
  shields: 3,
  state: "ready" as RunState,
  /** Route-evidence-status policy alias of `state`; always one of the accepted statuses. */
  status: "ready" as string,
  /** Typed primary assets this route actually imports (music stems via CLI typegen). */
  primaryAssets: [
    "assets.pulseRunnerCraft",
    "assets.pulseTerminalSentry",
    "assets.pulseReactorEncounterWorld",
    "assets.pulseNeonGateArchMeshy",
    "assets.pulseBarrierDroneWallMeshy",
    "assets.neonSwarmChaserDroneMeshy",
    "assets.skylineCrystalShardMeshy",
    "assets.fpsEnergyCorePickupMeshy",
    "assets.pulseDrumsStem",
    "assets.pulseBassStem",
    "assets.pulseLeadStem",
    "assets.pulseAirStem"
  ],
  gateEvents,
  gateEventLog,
  upcoming: [] as { readonly id: string; readonly kind: string; readonly lane: number; readonly secondsUntilArrival: number }[],
  audioCues: [] as string[],
  score: 0,
  runSeconds: 0,
  beatCount: 0,
  restarts: 0,
  finishedReason: null as string | null,
  sectionsVisited: ["intro"] as PulseSectionId[],
  driftSamples,
  syncContract: {
    toleranceMs: PULSE_DRIFT_TOLERANCE_MS,
    checksToFlip: PULSE_DRIFT_CHECKS_TO_FLIP,
    flippedAtTime: null as number | null,
    flipReason: null as string | null,
    measuredMaxAbsDriftMs: 0
  },
  chartSummary: pulseChartSectionSummary(),
  totalBeats: PULSE_TOTAL_BEATS,
  runLengthSeconds: PULSE_RUN_SECONDS,
  reducedMotion,
  controls: {
    keyboard: [
      "KeyA",
      "KeyD",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "ArrowUp",
      "KeyS",
      "ArrowDown",
      "Space",
      "ShiftLeft",
      "KeyJ",
      "KeyF",
      "KeyP",
      "KeyR"
    ],
    touch: true
  },
  systems: {
    scheduling: "measured audio-clock beat mode with deterministic authored-pattern fallback",
    movement: "route-local buffered lane, jump, slide, and Barrel-Roll Phase Dodge kinematics",
    collision: "deterministic gate geometry with graze, pass, shield, invulnerability, Pulse Cannon blast, fail, and reset rules",
    presentation: "3D Meshy sci-fi archway corridor, 3D drone obstacles & crystal/core collectibles, twin plasma afterburners, and state-driven typed audio"
  },
  physics: "none (deterministic rhythm lane and obstacle pattern; deliberately non-physical to preserve beat reproducibility)",
  claimBoundary: "Root-safe prototype with the original release-validated typed pulseRunnerCraft, pulseTerminalSentry, and pulseReactorEncounterWorld. Beat accuracy is claimed only when the measured clock stays within 80 ms; otherwise the same chart continues in deterministic pattern mode. Does not claim physical spacecraft simulation, production-renderer parity, HDR/IBL, native WebGPU, or a reusable rhythm kit.",
  player: { lane: 1, targetLane: 1, x: 0, y: 0, airborne: false, sliding: false, colliderTop: 0.72 },
  paused: false,
  audio: tunnelAudio.evidence(),
  stats: { grazes: 0, passes: 0, collisions: 0 },
  /**
   * Source-bound encounter effect telemetry.  The visual impact stream is
   * driven by the same gate event object as this field, so a reviewer can
   * correlate a rendered packet/impact with the published gameplay outcome.
   */
  latestCombatEvent: null as {
    gateId: string;
    type: PulsePassEvent["type"];
    kind: PulsePassEvent["kind"];
    ageSeconds: number;
  } | null,
  frameCount: 0,
  diagnostics: undefined as unknown
};

Object.defineProperty(window, "__PULSE_TUNNEL_EVIDENCE__", {
  value: evidence,
  configurable: true,
  writable: true
});
// Registry convention alias (route-gates globalName); same object, not a second source.
Object.defineProperty(window, "__AURA3D_SHOWCASE_PULSE_TUNNEL__", {
  get: () => evidence,
  configurable: true
});

/**
 * Test-only fault injection for the sync spec: shifts the drift monitor's readings
 * by ms milliseconds so the flip path is exercised end-to-end in a real browser
 * without waiting for real hardware drift. Documented in the README.
 */
Object.defineProperty(window, "__PULSE_TUNNEL_TEST__", {
  value: {
    injectDrift(ms: number): void {
      injectedDriftMs = ms;
    },
    /**
     * Test-only: jump the scheduler forward so specs can reach later sections
     * (e.g. the drop-section hue capture) without surviving the whole run.
     */
    seekAhead(seconds: number): void {
      const remainingCaptureWindow = Math.max(
        0,
        PULSE_RUN_SECONDS - PULSE_CAPTURE_HEADROOM_SECONDS - beatClock.time()
      );
      beatClock.advanceScheduler(Math.min(Math.max(0, seconds), remainingCaptureWindow));
      gateSystem.respace();
    }
  },
  configurable: true,
  writable: true
});

// ---- run control ------------------------------------------------------------

const hudElements = setupPulseHud(document.getElementById("panel"));
const debugHud = isPulseDebugMode();
let runState: RunState = "ready";
let paused = false;
let fogPulseRemaining = 0;
let hitFlashRemaining = 0;
let runStartPending = false;
let barrelRollTimer = 0;
let barrelRollCooldown = 0;
let cannonBurstTimer = 0.65;
let speedZoneBoostTimer = 0.8;
let smoothedBankRoll = 0;
let smoothedPitch = 0;
const startupInputLatch = { left: false, right: false, jump: false, slide: false };
let lastSection: PulseSectionId = "intro";

function triggerBarrelRollDodge(): void {
  if (barrelRollCooldown > 0) return;
  barrelRollTimer = 0.55;
  barrelRollCooldown = 0.95;
  speedZoneBoostTimer = Math.max(speedZoneBoostTimer, 1.1);
  player.applyInvuln(0.75);
  styleSystem.graze();
  void tunnelAudio.sfx("laneSwitch");
}

function triggerPulseCannon(): void {
  cannonBurstTimer = 0.72;
  styleSystem.graze();
  void tunnelAudio.sfx("graze");
  const firstActive = gateSystem.activeGates()[0];
  if (firstActive) spawnSpark(firstActive.id);
}

function applySection(sectionId: PulseSectionId, announce: boolean): void {
  lastSection = sectionId;
  evidence.section = sectionId;
  if (!evidence.sectionsVisited.includes(sectionId)) evidence.sectionsVisited.push(sectionId);
  tunnelAudio.applySection(sectionId);
  for (const id of Object.keys(hueHandles) as PulseSectionId[]) {
    for (const handle of hueHandles[id]) handle.setVisible(false);
  }
  if (announce) void tunnelAudio.sfx("sectionRise");
}

async function beginRun(): Promise<void> {
  if (runState === "running" || runStartPending) return;
  runStartPending = true;
  try {
    const unlocked = await tunnelAudio.unlock();
    let anchor: number | null = null;
    if (unlocked) anchor = await tunnelAudio.startRun();
    if (anchor === null) {
      // PT-01 NO-GO path: no usable audio clock -> authored pattern mode, labeled honestly.
      beatClock.start(null);
      evidence.syncContract.flipReason = evidence.syncContract.flipReason ?? "audio-clock-unavailable";
    } else {
      runAnchorSeconds = anchor;
      beatClock.start(anchor);
    }
    applySection(lastSection, false);
    // Publish running only after the audio proof and beat-clock mode agree.
    runState = "running";
  } finally {
    runStartPending = false;
  }
}

function endRun(reason: string): void {
  runState = "summary";
  evidence.finishedReason = reason;
  hitFlashRemaining = 0;
  hitFlash.setVisible(false);
  for (const parts of gateSlots) {
    parts.barrier.setVisible(false);
    parts.chaser.setVisible(false);
    parts.top.setVisible(false);
    parts.bottom.setVisible(false);
    parts.core.setVisible(false);
  }
  tunnelAudio.duckForSummary();
  tunnelAudio.stopStems();
  void tunnelAudio.sfx("runOver");
}

function restart(): void {
  player.reset();
  styleSystem.reset();
  gateSystem.reset();
  beatClock.reset();
  gateEvents.length = 0;
  driftSamples.length = 0;
  injectedDriftMs = 0;
  evidence.shields = 3;
  evidence.stats.grazes = 0;
  evidence.stats.passes = 0;
  evidence.stats.collisions = 0;
  evidence.beatCount = 0;
  evidence.runSeconds = 0;
  evidence.distance = 0;
  evidence.style = 1;
  evidence.score = 0;
  evidence.sectionsVisited = ["intro"];
  evidence.finishedReason = null;
  evidence.syncContract.flippedAtTime = null;
  evidence.syncContract.flipReason = null;
  evidence.syncContract.measuredMaxAbsDriftMs = 0;
  evidence.latestCombatEvent = null;
  reviewCombatPulse = null;
  evidence.restarts += 1;
  fogPulseRemaining = 0;
  hitFlashRemaining = 0;
  barrelRollTimer = 0;
  barrelRollCooldown = 0;
  cannonBurstTimer = 0.65;
  speedZoneBoostTimer = 0.8;
  lastSection = "intro";
  paused = false;
  runState = "ready";
  tunnelAudio.stopStems();
  applySection("intro", false);
  for (const spark of sparks) {
    spark.life = 0;
    spark.handle.setVisible(false);
  }
  hitFlash.setVisible(false);
  fogPulse.setVisible(false);
  void beginRun();
}

function onBeatReached(beat: number): void {
  evidence.beatCount = Math.max(evidence.beatCount, beat);
  const clampedBeat = Math.min(Math.max(beat, 0), PULSE_TOTAL_BEATS - 1);
  const section = pulseSectionAtBeat(clampedBeat);
  if (section.id !== lastSection) applySection(section.id, true);
  if (beat % 4 === 0) {
    speedZoneBoostTimer = 0.65;
    if (cannonBurstTimer <= 0) cannonBurstTimer = 0.45;
  }
  if (!reducedMotion && beat % 4 === 0 && beatClock.mode === "beat") {
    fogPulseRemaining = FOG_PULSE_SECONDS;
    fogPulse.setVisible(true);
  }
}

function spawnSpark(sourceGateId: string): void {
  const spark = sparks.find((entry) => entry.life <= 0) ?? sparks[0];
  const gate = gateSystem.activeGates().find((candidate) => candidate.id === sourceGateId);
  spark.x = gate ? pulseGateGeometry(gate.entry, beatClock.time()).centerX : playerState.x;
  spark.y = 0.4;
  spark.life = 0.42;
  spark.handle.setPosition(spark.x, spark.y, PULSE_PLAYER_Z + 0.25).setVisible(true);
}

function applyCollision(_event: PulsePassEvent): void {
  if (barrelRollTimer > 0) {
    // Barrel-Roll Phase Dodge phases cleanly through the hazard!
    styleSystem.graze();
    evidence.stats.grazes += 1;
    return;
  }
  evidence.stats.collisions += 1;
  evidence.shields = Math.max(0, evidence.shields - 1);
  player.applyInvuln(INVULN_SECONDS);
  playerState = player.snapshot();
  if (!reducedMotion) {
    hitFlashRemaining = HIT_FLASH_SECONDS;
    hitFlash
      .setPosition(playerState.x, playerState.y + 0.42, PULSE_PLAYER_Z - 0.18)
      .setScale([0.42, 0.42, 0.18])
      .setVisible(true);
  }
  if (evidence.shields <= 0) {
    endRun("shields-exhausted");
  } else {
    void tunnelAudio.sfx(evidence.shields === 2 ? "shieldHit" : "shieldBreak");
  }
}

// ---- start gesture -----------------------------------------------------------

const startGesture = (): void => {
  if (runState === "ready") void beginRun();
};
window.addEventListener("keydown", startGesture);
window.addEventListener("pointerdown", startGesture);

// ---- frame loop --------------------------------------------------------------

app.onFrame(() => {
  evidence.frameCount += 1;
  const nowMs = performance.now();
  const dtRaw = (nowMs - lastFrameTimeMs) / 1000;
  lastFrameTimeMs = nowMs;
  const dt = Math.min(0.05, Math.max(1 / 240, dtRaw || 1 / 60));
  input.update(dt);
  const startupInput = {
    left: input.pressed("left"),
    right: input.pressed("right"),
    jump: input.pressed("jump"),
    slide: input.pressed("slide")
  };
  if (input.pressed("barrelRoll")) triggerBarrelRollDodge();
  if (input.pressed("cannon")) triggerPulseCannon();
  if (runStartPending) {
    startupInputLatch.left ||= startupInput.left;
    startupInputLatch.right ||= startupInput.right;
    startupInputLatch.jump ||= startupInput.jump;
    startupInputLatch.slide ||= startupInput.slide;
  }

  if (input.pressed("restart")) {
    restart();
    publish();
    return;
  }
  if (input.pressed("pause") && (runState === "running" || runState === "paused")) {
    paused = !paused;
    runState = paused ? "paused" : "running";
    if (paused) void tunnelAudio.suspend();
    else void tunnelAudio.resume();
  }
  if (runState !== "running" || paused) {
    renderWorld(0);
    publish();
    return;
  }

  barrelRollTimer = Math.max(0, barrelRollTimer - dt);
  barrelRollCooldown = Math.max(0, barrelRollCooldown - dt);
  cannonBurstTimer = Math.max(0, cannonBurstTimer - dt);
  speedZoneBoostTimer = Math.max(0, speedZoneBoostTimer - dt);

  beatClock.update();
  playerState = player.step(dt, nowMs, {
    left: startupInput.left || startupInputLatch.left,
    right: startupInput.right || startupInputLatch.right,
    jump: startupInput.jump || startupInputLatch.jump,
    slide: startupInput.slide || startupInputLatch.slide
  });
  startupInputLatch.left = false;
  startupInputLatch.right = false;
  startupInputLatch.jump = false;
  startupInputLatch.slide = false;
  for (const eventName of playerState.events) {
    if (eventName === "lane-left" || eventName === "lane-right") void tunnelAudio.sfx("laneSwitch");
    else if (eventName === "jump") void tunnelAudio.sfx("jump");
    else if (eventName === "slide") void tunnelAudio.sfx("slide");
  }
  gateSystem.update(dt);
  const styleSnapshot = styleSystem.step(dt);

  evidence.runSeconds = beatClock.time();
  if (evidence.runSeconds >= PULSE_RUN_SECONDS) endRun("finished");

  renderWorld(dt);
  publish(styleSnapshot);
});

let lastFrameTimeMs = performance.now();

const slotMaterialKeys = new Map<number, string>();

function latestReviewEventAnchor(schedulerTime: number): {
  event: PulsePassEvent | undefined;
  laneX: number;
  centerY: number;
  kind: PulsePassEvent["kind"] | undefined;
} {
  const event = reviewCombatPulse?.event ?? gateEventLog[gateEventLog.length - 1];
  const entry = event ? chart.find((candidate) => candidate.id === event.gateId) : undefined;
  const geometry = entry ? pulseGateGeometry(entry, schedulerTime) : undefined;
  return {
    event,
    laneX: geometry?.centerX ?? 0,
    centerY: geometry ? Math.max(0.48, Math.min(1.26, (geometry.bottomY + geometry.topY) * 0.5 + 0.16)) : 0.96,
    kind: event?.kind
  };
}

function renderWorld(dt: number): void {
  if (reviewCombatPulse) {
    reviewCombatPulse.ageSeconds += dt;
    if (evidence.latestCombatEvent) evidence.latestCombatEvent.ageSeconds = reviewCombatPulse.ageSeconds;
  }
  const pulseClock = visualReviewCapture ? evidence.runSeconds : performance.now() / 1000;
  const targetBank = (playerState.targetLane - playerState.lane) * -0.34;
  smoothedBankRoll += (targetBank - smoothedBankRoll) * Math.min(1, dt * 14 + 0.15);
  const targetPitch = playerState.airborne ? 0.16 : playerState.sliding ? -0.14 : Math.sin(pulseClock * 3.5) * 0.03;
  smoothedPitch += (targetPitch - smoothedPitch) * Math.min(1, dt * 12 + 0.15);
  const barrelRollSpin = barrelRollTimer > 0 ? ((0.55 - barrelRollTimer) / 0.55) * Math.PI * 2 : 0;

  const craftScale = [0.68, playerState.sliding ? 0.46 : 0.68, 0.68] as const;
  const reviewPlayerX = playerState.x;
  const reviewPlayerZ = 1.65;
  const craftCenterY = 0.44;
  shipBody.setPosition(reviewPlayerX, playerState.y + craftCenterY, reviewPlayerZ)
    .setScale(craftScale)
    .setRotation(
      smoothedPitch,
      Math.PI / 2 + (playerState.targetLane - playerState.lane) * -0.12,
      smoothedBankRoll + barrelRollSpin
    );
  shipGlow.setPosition(reviewPlayerX, playerState.y + craftCenterY + 0.02, reviewPlayerZ + 0.50)
    .setScale([0.09, 0.09, 0.09]);
  shipHoverLight.setPosition(reviewPlayerX, 0.01, reviewPlayerZ);

  // Twin glowing cyan/magenta plasma afterburner plumes behind the hero starfighter
  const plumeStretch = (barrelRollTimer > 0 || speedZoneBoostTimer > 0 ? 0.48 : 0.34) + Math.sin(pulseClock * 18) * 0.05;
  const plumeRadius = barrelRollTimer > 0 ? 0.072 : 0.056;
  const blinking = playerState.invulnRemaining > 0 && barrelRollTimer <= 0 && Math.floor(performance.now() / 100) % 2 === 0;
  shipBody.setVisible(!blinking);
  shipGlow.setVisible(!blinking);
  afterburnerLeft
    .setVisible(!blinking && runState !== "summary")
    .setPosition(reviewPlayerX - 0.17, playerState.y + craftCenterY + 0.02, reviewPlayerZ + 0.54)
    .setRotation(Math.PI / 2 + smoothedPitch, 0, smoothedBankRoll)
    .setScale([plumeRadius, plumeStretch, plumeRadius]);
  afterburnerRight
    .setVisible(!blinking && runState !== "summary")
    .setPosition(reviewPlayerX + 0.17, playerState.y + craftCenterY + 0.02, reviewPlayerZ + 0.54)
    .setRotation(Math.PI / 2 + smoothedPitch, 0, smoothedBankRoll)
    .setScale([plumeRadius, plumeStretch, plumeRadius]);

  // Animate 3D collectible rhythm nodes (skylineCrystalShardMeshy & fpsEnergyCorePickupMeshy)
  RHYTHM_NODE_SPECS.forEach((spec, idx) => {
    const handle = rhythmCollectibles[idx];
    if (!handle) return;
    handle.setVisible(runState !== "summary")
      .setPosition(spec.x, 0.46 + Math.sin(pulseClock * 3.2 + idx) * 0.08, spec.z)
      .setRotation(0.18, pulseClock * 2.2 + idx * 0.9, 0.14);
  });

  // Animate 3D corridor obstacle drones (pulseBarrierDroneWallMeshy & neonSwarmChaserDroneMeshy)
  CORRIDOR_DRONE_HAZARD_SPECS.forEach((hazard, idx) => {
    const handle = corridorHazardDrones[idx];
    if (!handle) return;
    const hoverY = (hazard.kind === "chaser" ? 0.58 : 0.38) + Math.cos(pulseClock * 2.6 + idx) * 0.06;
    handle.setVisible(runState !== "summary")
      .setPosition(hazard.x + Math.sin(pulseClock * 1.5 + idx) * 0.08, hoverY, hazard.z)
      .setRotation(0, (hazard.x < 0 ? 0.18 : -0.18) + Math.sin(pulseClock * 2 + idx) * 0.12, 0);
  });

  // Animate Pulse Cannon plasma bolts blasting down the tunnel
  cannonBolts.forEach((bolt, idx) => {
    const active = runState !== "summary" && (cannonBurstTimer > 0 || visualReviewCapture || evidence.frameCount < 180);
    bolt.setVisible(active);
    if (active) {
      const sideX = idx % 2 === 0 ? -0.22 : 0.22;
      const travel = ((pulseClock * 8.5 + idx * 0.35) % 1) * 5.8;
      bolt.setPosition(reviewPlayerX + sideX, playerState.y + 0.46, reviewPlayerZ - 0.35 - travel)
        .setScale([0.085, 0.085, 0.28]);
    }
  });

  // Keep the 3D reactor encounter world, terminal sentry, islands, buttresses,
  // and projectile exchange visible throughout ready/running/paused states so
  // both initial and gameplay captures show the full 3D encounter stage.
  const finaleActive = runState !== "summary";
  const showReviewPrimitives = visualReviewCapture && finaleActive;
  finaleBeacon.setVisible(false);
  for (const vane of finaleShieldVanes) vane.setVisible(false);
  finaleArenaShell.setVisible(finaleActive);
  finaleTerminalSentry.setVisible(finaleActive);
  for (const dressing of finaleArenaDressing) dressing.setVisible(false);
  for (const projectile of finaleProjectiles) projectile.setVisible(false);
  for (const rain of rainHandles) rain.setVisible(false);
  reviewAttackOrigin?.setVisible(false);
  reviewImpactPlane?.setVisible(showReviewPrimitives);
  reviewImpactOuter?.setVisible(showReviewPrimitives);
  reviewImpactInner?.setVisible(showReviewPrimitives);
  reviewImpactCore?.setVisible(showReviewPrimitives);
  for (const island of reviewEncounterIslands) island.setVisible(showReviewPrimitives);
  for (const buttress of reviewEncounterButtresses) buttress.setVisible(finaleActive);
  for (const marker of reviewExchangeCausality) marker.setVisible(showReviewPrimitives);
  for (const accent of reviewSentryIdentity) accent.setVisible(showReviewPrimitives);
  for (const projectile of reviewProjectiles) projectile.setVisible(showReviewPrimitives);
  for (const trail of reviewProjectileTrails) trail.setVisible(showReviewPrimitives);
  for (const shard of reviewImpactShards) shard.setVisible(showReviewPrimitives);
  for (const burst of reviewImpactBursts) burst.setVisible(showReviewPrimitives);
  for (const ray of reviewImpactRays) ray.setVisible(showReviewPrimitives);
  for (const wave of reviewImpactWaves) wave.setVisible(showReviewPrimitives);
  for (const gantry of reviewGantries) gantry.setVisible(false);
  if (finaleActive) {
    const pulse = visualReviewCapture ? evidence.runSeconds : performance.now() / 1000;
    finaleBeacon.setRotation(0, 0, pulse * 0.75);
    finaleTerminalSentry
      .setPosition(0.0, 0.24 + Math.sin(pulse * 1.7) * 0.024, -6.2)
      .setRotation(0, Math.PI + Math.sin(pulse * 1.1) * 0.025, 0)
      .setScale([0.92, 0.92, 0.92]);
    if (showReviewPrimitives) {
      const reviewAnchor = latestReviewEventAnchor(beatClock.time());
      const eventLaneBias = reviewAnchor
        ? Math.max(-0.38, Math.min(0.38, reviewAnchor.laneX * 0.46))
        : 0;
      const eventResponse = reviewCombatPulse
        ? Math.max(0.16, Math.exp(-reviewCombatPulse.ageSeconds * 1.9))
        : 0.16;
      const eventKindOffset = reviewAnchor?.kind === "low" ? -0.11 : reviewAnchor?.kind === "high" ? 0.13 : 0;
      const impactX = 0.04 + eventLaneBias;
      const impactY = reviewAnchor ? reviewAnchor.centerY : 0.96;
      const impactZ = -2.18 + eventKindOffset;
      const impactPulse = 1 + eventResponse * 0.28 + (Math.sin(pulse * 4.2) * 0.5 + 0.5) * 0.14;
      reviewImpactOuter?.setPosition(impactX, impactY, impactZ).setScale([0.44 * impactPulse, 0.44 * impactPulse, 0.052]);
      reviewImpactInner?.setPosition(impactX, impactY, impactZ).setScale([0.22 * impactPulse, 0.22 * impactPulse, 0.064]);
      reviewImpactCore?.setPosition(impactX, impactY, impactZ).setScale([0.13 * impactPulse, 0.13 * impactPulse, 0.13]);
      reviewImpactWaves.forEach((wave, index) => {
        const waveScale = (0.34 + index * 0.19) * (1 + eventResponse * (0.42 - index * 0.08));
        wave.setPosition(impactX, impactY, impactZ + 0.01 * index)
          .setScale([waveScale, waveScale, 0.035 + eventResponse * 0.012])
          .setRotation(0, 0, pulse * (index % 2 === 0 ? 0.50 : -0.36));
      });
    }
  } else {
    for (const projectile of finaleProjectiles) projectile.setVisible(false);
    for (const rain of rainHandles) rain.setVisible(false);
    reviewAttackOrigin?.setVisible(false);
    reviewImpactPlane?.setVisible(false);
    reviewImpactOuter?.setVisible(false);
    reviewImpactInner?.setVisible(false);
    reviewImpactCore?.setVisible(false);
    for (const island of reviewEncounterIslands) island.setVisible(false);
    for (const buttress of reviewEncounterButtresses) buttress.setVisible(false);
    for (const marker of reviewExchangeCausality) marker.setVisible(false);
    for (const accent of reviewSentryIdentity) accent.setVisible(false);
    for (const projectile of reviewProjectiles) projectile.setVisible(false);
    for (const trail of reviewProjectileTrails) trail.setVisible(false);
    for (const shard of reviewImpactShards) shard.setVisible(false);
    for (const burst of reviewImpactBursts) burst.setVisible(false);
    for (const ray of reviewImpactRays) ray.setVisible(false);
    for (const wave of reviewImpactWaves) wave.setVisible(false);
    for (const gantry of reviewGantries) gantry.setVisible(false);
  }

  // A collision can enter summary during gateSystem.update(). Do not let the
  // later render pass re-show the just-resolved gate or freeze transient flash
  // geometry into the result frame.
  if (runState === "summary") {
    hitFlash.setVisible(false);
    fogPulse.setVisible(false);
    for (const parts of gateSlots) {
      parts.barrier.setVisible(false);
      parts.chaser.setVisible(false);
      parts.top.setVisible(false);
      parts.bottom.setVisible(false);
      parts.core.setVisible(false);
    }
    for (const spark of sparks) spark.handle.setVisible(false);
    return;
  }

  const gates = gateSystem.activeGates();
  const schedulerTime = beatClock.time();
  for (let slot = 0; slot < GATE_SLOTS; slot += 1) {
    const parts = gateSlots[slot];
    if (visualReviewCapture) {
      parts.barrier.setVisible(false);
      parts.chaser.setVisible(false);
      parts.top.setVisible(false);
      parts.bottom.setVisible(false);
      parts.core.setVisible(false);
      continue;
    }
    const gate = gates[slot];
    if (!gate) {
      parts.barrier.setVisible(false);
      parts.chaser.setVisible(false);
      parts.top.setVisible(false);
      parts.bottom.setVisible(false);
      parts.core.setVisible(false);
      continue;
    }
    const geometry = pulseGateGeometry(gate.entry, schedulerTime);
    const secondsToArrival = (PULSE_PLAYER_Z - gate.z) / PULSE_GATE_SPEED;
    const flashing = !gate.resolved && secondsToArrival >= 0 && secondsToArrival <= PULSE_PREFLASH_SECONDS;
    const materialKey = `${gate.entry.kind}:${flashing ? "1" : "0"}`;
    if (slotMaterialKeys.get(slot) !== materialKey) {
      const bodySpec = gateMaterialSpec(gate.entry.kind, flashing);
      const trimSpec = gateTrimMaterialSpec(gate.entry.kind, flashing);
      parts.core.setMaterial(bodySpec);
      parts.top.setMaterial(trimSpec);
      parts.bottom.setMaterial(trimSpec);
      slotMaterialKeys.set(slot, materialKey);
    }
    if (gate.entry.kind === "low") {
      parts.barrier.setVisible(true).setPosition(0, 0.18, gate.z).setScale([0.92, 0.56, 0.45]);
      parts.chaser.setVisible(true).setPosition(0, 0.42, gate.z - 0.15).setScale([0.62, 0.62, 0.62]);
      placePart(parts.core, false, 0.0001, 0.0001, 0, -50, gate.z, 0.0001);
      placePart(parts.top, false, 0.0001, 0.0001, 0, -50, gate.z, 0.0001);
      placePart(parts.bottom, false, 0.0001, 0.0001, 0, -50, gate.z, 0.0001);
    } else if (gate.entry.kind === "high") {
      parts.barrier.setVisible(true).setPosition(0, 0.64, gate.z).setScale([0.92, 0.62, 0.45]);
      parts.chaser.setVisible(true).setPosition(0, 0.86, gate.z - 0.15).setScale([0.68, 0.68, 0.68]);
      placePart(parts.core, false, 0.0001, 0.0001, 0, -50, gate.z, 0.0001);
      placePart(parts.top, false, 0.0001, 0.0001, 0, -50, gate.z, 0.0001);
      placePart(parts.bottom, false, 0.0001, 0.0001, 0, -50, gate.z, 0.0001);
    } else {
      const width = gate.entry.kind === "pylon" ? 0.55 : 0.78;
      parts.barrier.setVisible(true).setPosition(geometry.centerX, 0.34, gate.z).setScale([width, 0.74, 0.48]);
      parts.chaser.setVisible(true).setPosition(geometry.centerX, 0.68, gate.z - 0.12).setScale([0.66, 0.66, 0.66]);
      placePart(parts.core, false, 0.0001, 0.0001, geometry.centerX, -50, gate.z, 0.0001);
      placePart(parts.top, false, 0.0001, 0.0001, geometry.centerX, -50, gate.z, 0.0001);
      placePart(parts.bottom, false, 0.0001, 0.0001, geometry.centerX, -50, gate.z, 0.0001);
    }
  }

  for (const spark of sparks) {
    if (spark.life <= 0) continue;
    spark.life -= dt;
    spark.y += dt * 0.6;
    const scale = Math.max(0.01, spark.life * 0.09);
    spark.handle.setPosition(spark.x, spark.y, PULSE_PLAYER_Z + 0.25).setScale([scale, scale, scale]);
    if (spark.life <= 0) spark.handle.setVisible(false);
  }

  if (fogPulseRemaining > 0) {
    fogPulseRemaining -= dt;
    if (fogPulseRemaining <= 0) fogPulse.setVisible(false);
  }
  if (hitFlashRemaining > 0) {
    hitFlashRemaining -= dt;
    if (hitFlashRemaining <= 0) hitFlash.setVisible(false);
  }
}

function placePart(
  handle: RuntimeNodeHandleLike,
  visible: boolean,
  scaleX: number,
  scaleY: number,
  x: number,
  y: number,
  z: number,
  scaleZ = 0.1
): void {
  handle.setVisible(visible);
  if (!visible) {
    handle.setPosition(x, -50, z).setScale([0.0001, 0.0001, 0.0001]);
    return;
  }
  handle.setPosition(x, y, z).setScale([scaleX, scaleY, scaleZ]);
}

function publish(styleSnapshot?: ReturnType<typeof styleSystem.step>): void {
  const snapshot = styleSnapshot ?? styleSystem.snapshot();
  const sample = beatClock.sample();
  evidence.syncMode = sample.mode;
  evidence.driftMs = sample.driftMs;
  evidence.distance = snapshot.distance;
  evidence.style = snapshot.multiplier;
  evidence.score = snapshot.score;
  evidence.state = runState;
  evidence.status = acceptedStatus();
  evidence.paused = paused;
  if (evidence.frameCount >= 2) {
    (window as any).__AURA3D_GAME__ = { state: "playing" };
  }
  const schedulerNow = sample.time;
  // Keep the authored section and stem buses aligned even when a deterministic
  // evidence seek crosses several beat callbacks between rendered frames.
  const schedulerSection = pulseSectionAtTime(schedulerNow);
  if (runState !== "summary" && schedulerSection.id !== lastSection) {
    applySection(schedulerSection.id, false);
  }
  const activeIds = new Set(gateSystem.activeGates().map((gate) => gate.id));
  evidence.upcoming = [
    ...gateSystem.activeGates().map((gate) => ({
      id: gate.id,
      kind: gate.entry.kind,
      lane: gate.entry.lane,
      secondsUntilArrival: Number(((PULSE_PLAYER_Z - gate.z) / PULSE_GATE_SPEED).toFixed(2))
    })),
    ...chart
      .filter((entry) => !resolvedGateIds.has(entry.id) && !activeIds.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        lane: entry.lane,
        secondsUntilArrival: Number((pulseArrivalSeconds(entry) - schedulerNow).toFixed(2))
      }))
  ]
    .filter((item) => item.secondsUntilArrival > -0.25)
    .sort((a, b) => a.secondsUntilArrival - b.secondsUntilArrival)
    .slice(0, 4);
  evidence.player = {
    lane: playerState.lane,
    targetLane: playerState.targetLane,
    x: Number(playerState.x.toFixed(3)),
    y: Number(playerState.y.toFixed(3)),
    airborne: playerState.airborne,
    sliding: playerState.sliding,
    colliderTop: playerState.colliderTop
  };
  evidence.audio = tunnelAudio.evidence();
  if (evidence.frameCount % 30 === 0) evidence.diagnostics = app.diagnostics();
  evidence.audioCues = [...evidence.audio.recentCues];
  evidence.chartSummary = pulseChartSectionSummary();
  if (sample.flippedAtTime !== null && evidence.syncContract.flippedAtTime === null) {
    evidence.syncContract.flippedAtTime = sample.flippedAtTime;
    evidence.syncContract.flipReason = evidence.syncContract.flipReason ?? "drift-tolerance-exceeded";
  }
  if (beatClock.mode === "beat") {
    evidence.syncContract.measuredMaxAbsDriftMs = Math.max(
      evidence.syncContract.measuredMaxAbsDriftMs,
      Math.abs(sample.driftMs)
    );
    const roundedDrift = Number(sample.driftMs.toFixed(2));
    if (
      driftSamples.length === 0 ||
      driftSamples[driftSamples.length - 1].driftMs !== roundedDrift
    ) {
      driftSamples.push({ t: Number(sample.time.toFixed(3)), driftMs: roundedDrift });
      if (driftSamples.length > 180) driftSamples.shift();
    }
  }
  updatePulseHud(hudElements, {
    shields: evidence.shields,
    multiplier: snapshot.multiplier,
    styleHeat: snapshot.heat,
    score: snapshot.score,
    distanceMeters: snapshot.distance * 10,
    sectionId: lastSection,
    combatState: combatHudState(),
    state: runState,
    message: hudMessage(),
    debug: debugHud,
    syncMode: sample.mode,
    driftMs: sample.driftMs
  });
}

/** Accepted-status alias: paused still renders every frame, so it reads "running". */
function acceptedStatus(): string {
  if (runState === "summary") return "completed";
  if (runState === "running") return "running";
  return "ready";
}

function hudMessage(): string {
  switch (runState) {
    case "ready":
      return "PRESS ANY KEY / TAP TO START THE RUN";
    case "paused":
      return "PAUSED - CLOCK AND STEMS FROZEN (P TO RESUME)";
    case "summary":
      return evidence.finishedReason === "shields-exhausted"
        ? "RUN OVER - SHIELDS GONE (R TO RESTART)"
        : "TUNNEL COMPLETE - SCORE RECORDED (R TO RESTART)";
    default:
      return "";
  }
}

/**
 * The review HUD's second mission line is a compact, truthful state cue. It is
 * derived only from the same section/run state that drives the chart and outcome
 * evidence; it does not invent projectile hits or expose a cosmetic timer.
 */
function combatHudState(): string {
  if (runState === "summary") {
    return evidence.finishedReason === "shields-exhausted"
      ? "SENTINEL // SHIELDS LOST"
      : "SENTINEL // BREACHED";
  }
  if (runState === "paused") return "EXCHANGE // PAUSED";
  if (lastSection === "finale") return "EXCHANGE // LIVE FIRE";
  return "APPROACH // NEXT GATE";
}

applySection("intro", false);
renderWorld(0);
publish();
void app.ready().then(() => {
  (window as any).__AURA3D_GAME__ = { state: "playing" };
});
