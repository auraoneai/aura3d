/**
 * Pulse Tunnel - mount, systems, evidence.
 *
 * Prototype route (PRD NextGames-PRD/06-Pulse-Tunnel.md). On-rails rhythm runner:
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
  geometry,
  lights,
  material,
  model,
  prefabs,
  primitives,
  scene,
  type AuraMaterialSpec,
  type RuntimeNodeHandleLike
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
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
} from "./beat-clock";
import { buildPulseChart, pulseChartSectionSummary } from "./patterns";
import {
  PULSE_GATE_SPEED,
  PULSE_PLAYER_Z,
  PULSE_PREFLASH_SECONDS,
  createGateSystem,
  pulseArrivalSeconds,
  pulseGateGeometry,
  type PulsePassEvent
} from "./gates";
import { createPulsePlayer } from "./player";
import { createPulseStyleSystem } from "./style";
import { createTunnelAudio } from "./tunnel-audio";
import { isPulseDebugMode, setupPulseHud, updatePulseHud } from "./hud";

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Screenshot-only presentation mode keeps the gameplay/HUD contract intact while
// giving visual review a clean renderer-first frame. The normal route remains
// unchanged for players and for the interaction/evidence specs.
const visualReviewCapture =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("capture") === "review";
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

// ---- systems ----------------------------------------------------------------

const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp"],
    slide: ["KeyS", "ArrowDown"],
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

const gateSystem = createGateSystem({
  chart,
  getSchedulerTime: () => beatClock.time(),
  getAudioElapsed: () => Math.max(0, tunnelAudio.nowSeconds() - runAnchorSeconds),
  getPlayer: () => playerState,
  onPass: (event) => {
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
      { side: "top", position: [0, 2.7, z] as const, scale: [3.55, 0.035, 0.035] as const },
      { side: "bottom", position: [0, -1.6, z] as const, scale: [3.55, 0.035, 0.035] as const },
      { side: "left", position: [-3.55, 0.55, z] as const, scale: [0.035, 2.15, 0.035] as const },
      { side: "right", position: [3.55, 0.55, z] as const, scale: [0.035, 2.15, 0.035] as const }
    ];
    return sides.map(({ side, position, scale }) => {
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
        .scale(visualReviewCapture ? [0.001, 0.001, 0.001] : scale)
        .runtime(game.runtimeNode(id, { tags: ["section-hue", `section-${sectionId}`] }));
    });
  }).flat()
);

const gateMaterialSpec = (kind: GateKindId, flashing: boolean): AuraMaterialSpec =>
  material.emissive({
    name: `pulse gate ${flashing ? "pre-flash" : "body"} ${kind}`,
    color: GATE_COLOR_BY_KIND[kind],
    emissive: GATE_COLOR_BY_KIND[kind],
    emissiveIntensity: flashing ? 2.8 : 1.2
  });

const glowMaterial = material.emissive({ name: "pulse glider engine glow", color: "#a5f3fc", emissive: "#22d3ee", emissiveIntensity: 3.35 });
const reviewRunnerFinish = material.pbr({
  name: "pulse runner review graphite teal finish",
  color: "#2a6474",
  roughness: 0.34,
  metallic: 0.58,
  emissive: "#0e7490",
  emissiveIntensity: 0.16
});
const reviewSentryFinish = material.pbr({
  name: "pulse sentinel review ember graphite finish",
  color: "#594057",
  roughness: 0.4,
  metallic: 0.54,
  emissive: "#9f1239",
  emissiveIntensity: 0.15
});

const gateSlotBuilders = (() => {
  const builders = [];
  for (let slot = 0; slot < GATE_SLOTS; slot += 1) {
    for (const partName of ["top", "bottom", "core"] as const) {
      builders.push(
        primitives.box({
          name: `pulse gate ${slot} ${partName}`,
          material: gateMaterialSpec("wall", false)
        })
          .position(0, 0.4, PULSE_PLAYER_Z - 6)
          .scale([0.1, 0.1, 0.18])
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

// Receding 3D depth markers make the glider lane legible at finale capture scale.
// These are set dressing only; beat timing and collision truth remain unchanged.
const depthTrackBuilders = Array.from({ length: 7 }, (_, index) => {
  const z = -5 - index * 5.2;
  const scale = Math.max(0.42, 1 - index * 0.07);
  return [
    primitives.box({ name: 'pulse depth pylon left ' + (index + 1), material: material.emissive({ color: '#0ea5e9', emissive: '#22d3ee', emissiveIntensity: 0.9 }) })
      .position(-2.7, 0.5, z).scale([0.12 * scale, 1.15 * scale, 0.12 * scale])
      .runtime(game.runtimeNode('pulse-depth-pylon-left-' + index, { tags: ['depth-landmark', 'set-dressing'] })),
    primitives.box({ name: 'pulse depth pylon right ' + (index + 1), material: material.emissive({ color: '#e879f9', emissive: '#f0abfc', emissiveIntensity: 0.9 }) })
      .position(2.7, 0.5, z).scale([0.12 * scale, 1.15 * scale, 0.12 * scale])
      .runtime(game.runtimeNode('pulse-depth-pylon-right-' + index, { tags: ['depth-landmark', 'set-dressing'] }))
  ];
}).flat();
const finaleBeaconBuilder = primitives.torus({ name: 'pulse finale beacon', material: material.emissive({ color: '#fb7185', emissive: '#fecdd3', emissiveIntensity: 2.2 }) })
  // The final review frame is captured near the end of the 90-second lane. Keep
  // the target inside the readable depth band instead of hiding it behind the
  // far end of the fog volume.
  .position(0, 1.0, -4.65).scale(visualReviewCapture ? [0.001, 0.001, 0.001] : [2.8, 2.8, 0.22])
  .runtime(game.runtimeNode('pulse-finale-beacon', { tags: ['finale-landmark', 'set-dressing'] }));
// The live runner retains this timing landmark, but the evidence lens now
// suppresses it: a single abstract ring read as a decorative target rather
// than an opposing terminal with a concrete attack/reaction relationship.
// The chart and collision scheduler remain the gameplay authority.
const finaleBossRingBuilder = primitives.torus({
  name: "pulse finale boss ring",
  material: material.emissive({ color: "#6d28d9", emissive: "#a855f7", emissiveIntensity: 1.18, opacity: 0.86 })
})
  .position(0, 1.0, -4.5)
  .scale([3.55, 2.25, 0.15])
  .runtime(game.runtimeNode("pulse-finale-boss-ring", { tags: ["finale-landmark", "boss-silhouette", "renderer-owned"] }));
const finaleBossWingBuilders = [-1, 1].map((side) =>
  primitives.box({
    name: `pulse finale boss wing ${side < 0 ? "left" : "right"}`,
    material: material.pbr({ color: side < 0 ? "#176b87" : "#8b2b79", roughness: 0.4, metallic: 0.48, emissive: side < 0 ? "#06b6d4" : "#d946ef", emissiveIntensity: 0.3 })
  })
    .position(side * 1.65, 0.9, -4.42)
    .rotate(0, side * 0.16, side * 0.56)
    .scale([1.35, 0.24, 0.52])
    .runtime(game.runtimeNode(`pulse-finale-boss-wing-${side < 0 ? "left" : "right"}`, { tags: ["finale-landmark", "boss-silhouette", "renderer-owned"] }))
);
// The provisional interceptor housing is retained only as a hidden fallback
// node. During the real finale, the proven typed industrial sentry below owns
// the opposing endpoint of the exchange; it is deliberately non-colliding so
// the authored chart and player collider remain the gameplay authority.
const finaleBossCraftBuilder = primitives.box({
  name: "pulse terminal interceptor housing",
  material: material.pbr({
    color: "#202b42",
    roughness: 0.31,
    metallic: 0.82,
    emissive: "#7c2d12",
    emissiveIntensity: 0.24
  })
})
  .position(0, visualReviewCapture ? 1.0 : 1.0, visualReviewCapture ? -5.85 : -4.48)
  .scale(visualReviewCapture ? [0.72, 1.02, 0.28] : [1.06, 1.06, 0.42])
  .runtime(game.runtimeNode("pulse-finale-boss-craft", {
    tags: ["finale-target", "reactor-iris", "renderer-owned", "non-colliding"]
  }));
const finaleCoreBuilder = primitives.sphere({
  name: "pulse finale target core",
  material: material.emissive({ color: "#fb7185", emissive: "#e11d48", emissiveIntensity: 1.72 })
})
  .position(0, 1.02, visualReviewCapture ? -5.53 : -4.32)
  .scale(visualReviewCapture ? [0.38, 0.38, 0.16] : [0.86, 0.86, 0.86])
  .runtime(game.runtimeNode("pulse-finale-target-core", { tags: ["finale-target", "renderer-owned"] }));
const finaleTerminalSentryBuilder = model(assets.pulseTerminalSentry, {
  name: "pulse original terminal sentry",
  targetMaxDimension: 2.74
})
  // The review lens gives the terminal its own, farther right-hand depth plane.
  // It is still purely non-colliding presentation: runner movement, lanes, and
  // the beat chart retain their existing coordinates and authority.
  .position(visualReviewCapture ? 2.12 : 0, visualReviewCapture ? 0.18 : 0.08, visualReviewCapture ? -3.78 : -5.16)
  .rotate(0, Math.PI + 0.18, 0)
  .scale(visualReviewCapture ? 1.34 : 0.86)
  .runtime(game.runtimeNode("pulse-finale-terminal-sentry", {
    tags: ["finale-target", "typed-terminal-sentry", "renderer-owned", "non-colliding"]
  }));
// A release-probed authored arena shell gives the real finale exchange a
// coherent architectural enclosure. It is a typed, non-colliding world asset:
// the live chart, lanes, shields, and projectile pools retain all gameplay
// authority, and the shell appears only while the actual finale state is live.
const finaleArenaShellBuilder = model(assets.pulseReactorEncounterWorld, {
  name: "pulse original reactor encounter world",
  role: "primaryWorld",
  targetMaxDimension: 11.556
})
  .position(0, 0, 0)
  .runtime(game.runtimeNode("pulse-finale-arena-shell", {
    tags: ["finale-arena", "typed-world", "release-probed", "renderer-owned", "non-colliding"]
  }));
const finaleProjectileBuilders = Array.from({ length: 18 }, (_, index) =>
  primitives.cylinder({
    name: "pulse finale rhythm lance " + (index + 1),
    material: material.emissive({
      color: index % 3 === 0 ? "#67e8f9" : index % 3 === 1 ? "#fbbf24" : "#e879f9",
      emissive: index % 3 === 0 ? "#0891b2" : index % 3 === 1 ? "#d97706" : "#c026d3",
      emissiveIntensity: 1.75
    })
  })
    .position(0, 0.45, -7.5)
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.055, 0.42, 0.055])
    .runtime(game.runtimeNode("pulse-finale-projectile-" + index, { tags: ["finale-projectile", "rhythm-lance", "renderer-owned"] }))
);

// Three continuous vectors make the exchange readable before individual pulse
// packets resolve: cyan rails originate at the runner, while the warmer rails
// return from the interceptor. They are in-scene geometry, not UI/CSS effects.
const finaleVectorBuilders = [
  { name: "pulse runner outgoing vector left", x: 0.12, y: 0.58, z: -1.85, color: "#67e8f9", emissive: "#0891b2", length: 2.2 },
  { name: "pulse runner outgoing vector center", x: 0.42, y: 0.72, z: -2.18, color: "#a5f3fc", emissive: "#0e7490", length: 2.95 },
  { name: "pulse runner outgoing vector right", x: 0.7, y: 0.58, z: -2.06, color: "#67e8f9", emissive: "#0891b2", length: 2.35 },
  { name: "pulse interceptor incoming vector left", x: 0.58, y: 1.22, z: -3.82, color: "#fda4af", emissive: "#be123c", length: 1.95 },
  { name: "pulse interceptor incoming vector center", x: 0.92, y: 1.34, z: -4.42, color: "#fbbf24", emissive: "#b45309", length: 1.35 },
  { name: "pulse interceptor incoming vector right", x: 1.22, y: 1.22, z: -4.02, color: "#fda4af", emissive: "#be123c", length: 1.9 }
].map((vector, index) =>
  primitives.box({
    name: vector.name,
    material: material.emissive({
      color: vector.color,
      emissive: vector.emissive,
      emissiveIntensity: 1.4,
      opacity: 0.9
    })
  })
    .position(vector.x, vector.y, vector.z)
    .scale([0.035, 0.035, vector.length])
    .runtime(game.runtimeNode(`pulse-finale-vector-${index}`, { tags: ["finale-vector", "renderer-owned", "action-direction"] }))
);

// Four shield vanes frame the terminal sentry into one readable encounter
// silhouette. They flank its dock and visually explain the opposing pressure
// streams; no vane participates in runner collision or chart timing.
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
    .position(visualReviewCapture ? 1.42 + side * 1.2 : side * 1.12, upper ? 1.78 : 0.5, visualReviewCapture ? -4.78 : -4.58)
    .rotate(0, side * 0.18, side * (upper ? -0.5 : 0.5))
    .scale(visualReviewCapture ? [0.78, 0.12, 0.34] : [0.78, 0.13, 0.42])
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

// The evidence lens uses broad fractured plates instead of the gameplay
// tunnel's concentric timing guides. Uneven silhouettes and warm seams make
// the finale read as a damaged place rather than a diagrammatic target board.
const reviewArenaPlateBuilders = visualReviewCapture && false
  ? [
      { x: -2.55, z: -2.05, sx: 2.35, sz: 2.15, yaw: -0.12, tone: "#584762" },
      { x: 0.05, z: -2.35, sx: 2.05, sz: 2.5, yaw: 0.08, tone: "#69465e" },
      { x: 2.55, z: -1.85, sx: 2.2, sz: 2.0, yaw: 0.14, tone: "#4d4c68" },
      { x: -1.65, z: 0.45, sx: 2.1, sz: 1.45, yaw: 0.12, tone: "#4b425d" },
      { x: 1.25, z: 0.3, sx: 2.45, sz: 1.55, yaw: -0.09, tone: "#684353" }
    ].map((plate, index) =>
      primitives.box({
        name: "pulse review fractured arena plate " + (index + 1),
        material: material.pbr({
          color: plate.tone,
          roughness: 0.62 + (index % 3) * 0.08,
          metallic: index % 2 === 0 ? 0.24 : 0.12,
          emissive: index % 2 === 0 ? "#4c1d95" : "#9f1239",
          emissiveIntensity: 0.22
        })
      })
        .position(plate.x, -0.025 + (index % 2) * 0.045, plate.z)
        .rotate(0, plate.yaw, 0)
        .scale([plate.sx, 0.12, plate.sz])
    )
  : [];

const reviewArenaSeamBuilders = visualReviewCapture && false
  ? [
      { x: -0.6, z: -1.65, sx: 0.055, sz: 3.2, yaw: -0.28 },
      { x: 1.15, z: -1.0, sx: 0.045, sz: 2.65, yaw: 0.46 },
      { x: -2.0, z: -0.25, sx: 0.04, sz: 2.1, yaw: 0.72 }
    ].map((seam, index) =>
      primitives.box({
        name: "pulse review molten fracture " + (index + 1),
        material: material.emissive({ color: "#fb7185", emissive: index === 1 ? "#fb923c" : "#e11d48", emissiveIntensity: 1.8 })
      })
        .position(seam.x, 0.105, seam.z)
        .rotate(0, seam.yaw, 0)
        .scale([seam.sx, 0.02, seam.sz])
    )
  : [];

// Low, overlapping cliff shelves contain the encounter without becoming a wall
// of vertical columns. Their angled faces lead toward the boss and preserve a
// clear over-the-shoulder sightline from the runner through the projectile fan.
const reviewCavernButtressBuilders = visualReviewCapture && false
  ? [
      { x: -4.25, z: 0.7, y: 0.35, sx: 2.35, sy: 0.7, sz: 1.8, yaw: -0.2 },
      { x: -4.75, z: -2.15, y: 0.62, sx: 2.55, sy: 1.25, sz: 2.0, yaw: 0.12 },
      { x: -4.35, z: -5.2, y: 0.82, sx: 2.45, sy: 1.65, sz: 2.15, yaw: -0.14 },
      { x: 4.2, z: 0.65, y: 0.42, sx: 2.3, sy: 0.82, sz: 1.75, yaw: 0.22 },
      { x: 4.7, z: -2.2, y: 0.68, sx: 2.55, sy: 1.35, sz: 2.0, yaw: -0.1 },
      { x: 4.3, z: -5.25, y: 0.85, sx: 2.45, sy: 1.7, sz: 2.15, yaw: 0.13 },
      { x: -2.75, z: -7.15, y: 0.7, sx: 2.25, sy: 1.4, sz: 1.55, yaw: -0.12 },
      { x: 0, z: -7.65, y: 0.92, sx: 2.65, sy: 1.85, sz: 1.4, yaw: 0.03 },
      { x: 2.8, z: -7.1, y: 0.72, sx: 2.3, sy: 1.45, sz: 1.55, yaw: 0.11 }
    ].map((rock, index) =>
      primitives.box({
        name: "pulse review cavern shelf " + (index + 1),
        material: material.pbr({
          color: index % 3 === 0 ? "#241c31" : index % 3 === 1 ? "#29253a" : "#35202f",
          roughness: 0.76 + (index % 3) * 0.05,
          metallic: index % 2 === 0 ? 0.14 : 0.08,
          emissive: index % 2 === 0 ? "#3b1760" : "#66172f",
          emissiveIntensity: 0.16
        })
      })
        .position(rock.x, rock.y, rock.z)
        .rotate((index % 3 - 1) * 0.06, rock.yaw, (index % 2 === 0 ? -1 : 1) * 0.08)
        .scale([rock.sx, rock.sy, rock.sz])
    )
  : [];

// A distant, irregular crown closes the arena horizon. These slabs are kept
// behind the boss and share the same restrained rock finish as the side shelves,
// so the projectile field reads against a place rather than empty background.
const reviewCavernCrownBuilders = visualReviewCapture && false
  ? Array.from({ length: 7 }, (_, index) => {
      const x = (index - 3) * 1.55;
      const height = 1.75 + (index % 3) * 0.62;
      return primitives.box({
        name: `pulse review distant cliff ${index + 1}`,
        material: material.pbr({
          color: index % 2 === 0 ? "#211729" : "#2b1b2b",
          roughness: 0.88,
          metallic: 0.06,
          emissive: index % 2 === 0 ? "#32134f" : "#57152e",
          emissiveIntensity: 0.12
        })
      })
        .position(x, height * 0.72, -9.15 - (index % 2) * 0.38)
        .rotate(0, (index - 3) * -0.035, (index % 2 === 0 ? -1 : 1) * 0.09)
        .scale([1.08, height, 1.28]);
    })
  : [];

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
  color: "#44546c",
  roughness: 0.44,
  metallic: 0.48,
  emissive: "#145a78",
  emissiveIntensity: 0.26
});
const reviewShoulderMaterial = material.pbr({
  name: "pulse reactor deck shoulders",
  color: "#374257",
  roughness: 0.54,
  metallic: 0.44,
  emissive: "#293c67",
  emissiveIntensity: 0.2
});
const reviewRibMaterial = material.pbr({
  name: "pulse tunnel rib steel",
  // Ribs deliberately sit one value step below the deck. Their steel blue is
  // visible as architecture, but cannot merge with either typed combatant.
  color: "#2a3b52",
  roughness: 0.46,
  metallic: 0.64,
  emissive: "#164b71",
  emissiveIntensity: 0.19
});
const reviewAccentMaterial = material.emissive({
  name: "pulse tunnel amber beat accent",
  color: "#ffd166",
  emissive: "#d97706",
  emissiveIntensity: 0.92
});

/**
 * One joined low-poly prism from an x/z footprint. The review arena uses these
 * authored meshes instead of a stack of generic boxes: the footprint itself
 * defines the player apron, the recessed exchange lane, and the raised terminal
 * bay. That makes the three combat depth planes structural rather than a camera
 * or lighting trick.
 */
function reviewFootprintPrism(points: readonly (readonly [number, number])[], topY: number, bottomY: number) {
  const positions: [number, number, number][] = [];
  const indices: number[] = [];
  for (const y of [topY, bottomY]) {
    for (const [x, z] of points) positions.push([x, y, z]);
  }
  const count = points.length;
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index, index + 1);
    indices.push(count, count + index + 1, count + index);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, count + index, count + next, index, count + next, next);
  }
  return { kind: "aura-custom-geometry" as const, positions, indices };
}

const reviewCombatDeckGeometry = reviewFootprintPrism([
  [-3.7, 2.2], [3.25, 2.2], [3.25, -1.35], [2.75, -2.35],
  [2.75, -5.35], [3.9, -6.15], [3.9, -8.7], [-0.35, -8.7],
  [-0.35, -7.35], [-2.4, -5.7], [-2.4, -2.35], [-3.7, -1.2]
], -0.06, -0.34);
const reviewBossDaisGeometry = reviewFootprintPrism([
  [-0.25, -6.05], [0.5, -7.55], [1.95, -8.25], [3.45, -7.72],
  [4.05, -6.25], [3.35, -5.05], [1.9, -4.72], [0.55, -5.02]
], 0.16, -0.18);
const reviewPlayerApronGeometry = reviewFootprintPrism([
  [-3.45, 1.75], [-0.15, 1.75], [0.25, 0.82], [-0.15, -1.55],
  [-3.05, -1.55], [-3.6, -0.5]
], 0.055, -0.08);
const reviewRunnerHullGeometry = reviewFootprintPrism([
  [-0.22, 0.82], [0.22, 0.82], [0.62, 0.18], [0.52, -0.58],
  [0.18, -0.34], [0, -0.78], [-0.18, -0.34], [-0.52, -0.58], [-0.62, 0.18]
], 0.3, 0.14);

const reviewArenaWorldBuilders = visualReviewCapture
  ? [
      geometry.custom(reviewCombatDeckGeometry, { name: "pulse authored combat deck", material: reviewDeckMaterial }),
      geometry.custom(reviewBossDaisGeometry, { name: "pulse sentinel raised dock", material: reviewShoulderMaterial }),
      geometry.custom(reviewPlayerApronGeometry, { name: "pulse runner launch apron", material: reviewRibMaterial }),
      // The release-validated craft remains visibly nested in this restrained
      // route-local flight frame. The joined wedge supplies a continuous dark
      // silhouette behind the asset's small baked emitters; it is presentation
      // only and never replaces the typed player or its collider.
      geometry.custom(reviewRunnerHullGeometry, { name: "pulse runner flight frame", material: material.pbr({
        name: "pulse runner flight frame graphite",
        color: "#18384a",
        roughness: 0.31,
        metallic: 0.68,
        emissive: "#0e7490",
        emissiveIntensity: 0.14
      }) }).position(-1.55, 0, -0.42).scale([1.34, 1.34, 1.34]),
      primitives.sphere({ name: "pulse runner canopy lens", material: material.pbr({
        name: "pulse runner canopy smoked cyan",
        color: "#206278",
        roughness: 0.2,
        metallic: 0.45,
        emissive: "#22d3ee",
        emissiveIntensity: 0.34
      }) }).position(-1.55, 0.38, -0.48).scale([0.25, 0.14, 0.34]),
      ...[-1, 1].map((side) => primitives.box({ name: `pulse runner wing signal ${side < 0 ? "left" : "right"}`, material: reviewAccentMaterial })
        .position(-1.55 + side * 0.42, 0.24, -0.42)
        .rotate(0, side * -0.24, 0)
        .scale([0.2, 0.025, 0.035])),
      // The original typed world owns the deck, sidewalls, ribs, roof, bay,
      // and architectural anchor meshes. These two state-driven practicals
      // retain the live pulse/impact feedback contract without duplicating the
      // modeled enclosure or taking any collision authority.
      primitives.torus({ name: "pulse boss attack origin halo", material: material.emissive({ color: "#ff9b72", emissive: "#c2410c", emissiveIntensity: 0.72 }) })
        .position(1.42, 1.12, -4.92)
        .scale([0.92, 0.92, 0.055])
        .runtime(game.runtimeNode("pulse-review-attack-origin", { tags: ["finale-arena", "attack-origin", "renderer-owned"] })),
      // The near shield catches the incoming warm stream on a separate plane;
      // it is a world object tied to finale visibility, not a HUD flash.
      primitives.torus({ name: "pulse player shield impact plane", material: material.emissive({ color: "#67e8f9", emissive: "#0e7490", emissiveIntensity: 0.72, opacity: 0.78 }) })
        .position(-1.18, 0.72, 0.42)
        .rotate(0, -0.12, 0.06)
        .scale([0.72, 0.72, 0.045])
        .runtime(game.runtimeNode("pulse-review-impact-plane", { tags: ["finale-arena", "impact-plane", "renderer-owned", "non-colliding"] }))
    ]
  : [];

// Keep the public neonTunnel rails, wall washes, streaks, braces, sparks, and
// fog, but omit its decorative circular torus bands. The route's thin
// section-colored frames above own anticipation; thick concentric rings hid
// the player lane and incoming obstacle at phone width.
const tunnelBackdrop = prefabs.neonTunnel({ rings: 8 }).filter((node) => {
  const name = "name" in node ? String(node.name ?? "") : "";
  return !name.includes("true circular neon tunnel tube ring");
});

const app = createAuraApp("#app", {
  scene: scene()
    .background(visualReviewCapture ? "#101b2d" : "#180b28")
    .addMany([
      ...(visualReviewCapture ? [] : tunnelBackdrop),
      ...hueBuilders,
      ...(visualReviewCapture ? [] : depthTrackBuilders),
      ...(visualReviewCapture ? [] : cavernRockBuilders),
      ...(visualReviewCapture ? [] : cavernSpireBuilders),
      ...(visualReviewCapture ? [] : lavaChannelBuilders),
      ...rainBuilders,
      ...(visualReviewCapture ? [] : ledgeBuilders),
      ...(visualReviewCapture ? [] : finaleArenaBuilders),
      ...reviewArenaPlateBuilders,
      ...reviewArenaSeamBuilders,
      ...reviewCavernButtressBuilders,
      ...reviewCavernCrownBuilders,
      ...reviewArenaWorldBuilders,
      finaleBeaconBuilder,
      finaleBossRingBuilder,
      ...finaleBossWingBuilders,
      finaleBossCraftBuilder,
      ...finaleShieldVaneBuilders,
      finaleCoreBuilder,
      finaleArenaShellBuilder,
      finaleTerminalSentryBuilder,
      ...finaleProjectileBuilders,
      ...finaleVectorBuilders,
      effects.neonBloom({ intensity: visualReviewCapture ? 0.26 : reducedMotion ? 0.2 : 0.82, threshold: 0.74, maxIntensity: 0.72, antiBlowout: true }),
      effects.fog({ name: "pulse downbeat fog pulse", density: visualReviewCapture ? 0.009 : 0.065, color: visualReviewCapture ? "#11192a" : "#241044" })
        .runtime(game.runtimeNode("pulse-fog-pulse", { tags: ["downbeat-fog"] })),
      // Review capture uses a deliberate three-plane lighting setup: neutral
      // front key on the player, warm terminal key, and a cooler crown/rim on
      // the deck and ribs. This is all renderer lighting—not an overlay—and
      // preserves the same world/material language in the playable route.
      lights.directional({ name: "corridor sun", color: visualReviewCapture ? "#c9e4ff" : "#38bdf8", intensity: visualReviewCapture ? 1.25 : 1.6 }).position(-5, 10, 6),
      lights.directional({ name: "terminal warm edge", color: "#ffc08a", intensity: visualReviewCapture ? 0.85 : 0.34 }).position(4.5, 5.8, -3.6),
      lights.ambient({ name: "corridor ambient", color: visualReviewCapture ? "#50647f" : "#1e1b4b", intensity: visualReviewCapture ? 0.92 : 1.2 }),
      lights.point({ name: "runner silhouette front key", color: "#d6edff", intensity: visualReviewCapture ? 1.7 : 0 }).position(-0.7, 1.72, 3.2),
      lights.point({ name: "runner cyan underside bounce", color: "#48dfff", intensity: visualReviewCapture ? 1.05 : 0 }).position(-1.5, 0.42, 1.25),
      lights.point({ name: "terminal amber detail key", color: "#ffbd72", intensity: visualReviewCapture ? 1.9 : 0 }).position(1.5, 2.0, -3.2),
      lights.point({ name: "terminal magenta rim", color: "#ff72ac", intensity: visualReviewCapture ? 1.25 : 0 }).position(-1.2, 1.62, -4.0),
      lights.point({ name: "deck cyan depth practical", color: "#39d9f2", intensity: visualReviewCapture ? 1.3 : 0 }).position(-2.85, 1.8, -1.85),
      lights.point({ name: "cavern cyan practical", color: "#22d3ee", intensity: 1.35 }).position(-2.8, 1.1, -5),
      lights.point({ name: "cavern magenta practical", color: "#d946ef", intensity: 1.25 }).position(2.8, 1.4, -9),
      lights.point({ name: "cavern ember practical", color: "#fb7185", intensity: 1.1 }).position(0.3, 0.9, -14),
      lights.point({ name: "finale core rose key", color: "#fb7185", intensity: visualReviewCapture ? 1.5 : 3.4 }).position(0, 2.4, -4.4),
      lights.point({ name: "finale arena cyan rim", color: "#22d3ee", intensity: visualReviewCapture ? 1.65 : 2.2 }).position(-3.2, 1.4, -2.8),
      lights.point({ name: "finale arena warm edge", color: "#ff9b72", intensity: visualReviewCapture ? 1.4 : 0 }).position(4.2, 2.2, -1.1),
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

      // 3-Lane Track Neon Floor Grid
      primitives.plane({
        name: "track floor base",
        material: material.pbr({ name: "track asphalt", color: "#090d16", roughness: 0.65, metallic: 0.35 })
      })
        .position(0, -0.05, -8)
        .scale(visualReviewCapture ? [0.001, 0.001, 0.001] : [3.6, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Left Lane Divider Neon Line
      primitives.plane({
        name: "track lane line left",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.2 })
      })
        .position(-0.6, -0.04, -8)
        .scale(visualReviewCapture ? [0.001, 0.001, 0.001] : [0.04, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Right Lane Divider Neon Line
      primitives.plane({
        name: "track lane line right",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.2 })
      })
        .position(0.6, -0.04, -8)
        .scale(visualReviewCapture ? [0.001, 0.001, 0.001] : [0.04, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Typed player craft. This release-validated textured spacecraft already
      // has a readable nose-to-engine silhouette and durable CC-BY provenance;
      // route-local movement still owns every lane/jump/slide transform.
      model(assets.pulseRunnerCraft, { name: "pulse original runner craft", targetMaxDimension: 2.408 })
        .position(0, 0.08, PULSE_PLAYER_Z)
        .rotate(0, 0, 0)
        .scale(0.8)
        .runtime(game.runtimeNode("pulse-ship-body", { tags: ["player", "craft", "typed-primary"] })),
      primitives.sphere({ name: "pulse glider engine glow", material: glowMaterial })
        .position(0, 0.2, PULSE_PLAYER_Z + 0.3)
        .scale([0.22, 0.22, 0.22])
        .runtime(game.runtimeNode("pulse-ship-glow", { tags: ["player", "craft"] })),
      ...gateSlotBuilders,
      ...sparkBuilders
    ])
    .camera(camera.perspective(visualReviewCapture
      ? { position: [0.15, 2.55, 7.4], target: [0.1, 0.72, -2.55], fov: 43 }
      : { position: [0, 0.72, 3.8], target: [0, 0.32, -8], fov: 56 })),
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
const finaleBeacon = requireHandle("pulse-finale-beacon");
const finaleBossRing = requireHandle("pulse-finale-boss-ring");
const finaleBossWings = ["left", "right"].map((side) => requireHandle("pulse-finale-boss-wing-" + side));
const finaleBossCraft = requireHandle("pulse-finale-boss-craft");
const finaleShieldVanes = finaleShieldVaneBuilders.map((_, index) => requireHandle("pulse-finale-shield-vane-" + index));
const finaleCore = requireHandle("pulse-finale-target-core");
const finaleArenaShell = requireHandle("pulse-finale-arena-shell");
const finaleTerminalSentry = requireHandle("pulse-finale-terminal-sentry");
const finaleProjectiles = finaleProjectileBuilders.map((_, index) => requireHandle("pulse-finale-projectile-" + index));
const finaleVectors = finaleVectorBuilders.map((_, index) => requireHandle("pulse-finale-vector-" + index));
const rainHandles = rainBuilders.map((_, index) => requireHandle("pulse-rain-" + index));
const reviewAttackOrigin = visualReviewCapture ? requireHandle("pulse-review-attack-origin") : null;
const reviewImpactPlane = visualReviewCapture ? requireHandle("pulse-review-impact-plane") : null;
const reviewGantries: RuntimeNodeHandleLike[] = [];
if (visualReviewCapture) {
  (shipBody as unknown as PulseNodeHandle).setMaterial(reviewRunnerFinish);
  (finaleTerminalSentry as unknown as PulseNodeHandle).setMaterial(reviewSentryFinish);
}
fogPulse.setVisible(false);
hitFlash.setVisible(false);
finaleBeacon.setVisible(false);
finaleBossRing.setVisible(false);
for (const wing of finaleBossWings) wing.setVisible(false);
finaleBossCraft.setVisible(false);
for (const vane of finaleShieldVanes) vane.setVisible(false);
finaleCore.setVisible(false);
finaleArenaShell.setVisible(false);
finaleTerminalSentry.setVisible(false);
for (const projectile of finaleProjectiles) projectile.setVisible(false);
for (const vector of finaleVectors) vector.setVisible(false);
for (const rain of rainHandles) rain.setVisible(false);
reviewAttackOrigin?.setVisible(false);
reviewImpactPlane?.setVisible(false);
for (const gantry of reviewGantries) gantry.setVisible(false);

const hueHandles: Record<PulseSectionId, RuntimeNodeHandleLike[]> = {
  intro: hueIds.intro.map(requireHandle),
  build: hueIds.build.map(requireHandle),
  drop: hueIds.drop.map(requireHandle),
  finale: hueIds.finale.map(requireHandle)
};

interface GateSlotParts {
  readonly top: PulseNodeHandle;
  readonly bottom: PulseNodeHandle;
  readonly core: PulseNodeHandle;
}
const gateSlots: GateSlotParts[] = Array.from({ length: GATE_SLOTS }, (_, slot) => ({
  top: requireGateHandle(`pulse-gate-${slot}-top`),
  bottom: requireGateHandle(`pulse-gate-${slot}-bottom`),
  core: requireGateHandle(`pulse-gate-${slot}-core`)
}));
for (const parts of gateSlots) {
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
    keyboard: ["KeyA", "KeyD", "ArrowLeft", "ArrowRight", "KeyW", "ArrowUp", "KeyS", "ArrowDown", "KeyP", "KeyR"],
    touch: true
  },
  systems: {
    scheduling: "measured audio-clock beat mode with deterministic authored-pattern fallback",
    movement: "route-local buffered lane, jump, and slide kinematics",
    collision: "deterministic gate geometry with graze, pass, shield, invulnerability, fail, and reset rules",
    presentation: "release-validated typed spacecraft duel inside a release-probed typed reactor arena shell, with renderer-owned combat feedback and state-driven typed audio"
  },
  claimBoundary: "Root-safe prototype with the original release-validated typed pulseRunnerCraft, pulseTerminalSentry, and pulseReactorEncounterWorld. Beat accuracy is claimed only when the measured clock stays within 80 ms; otherwise the same chart continues in deterministic pattern mode. No physical spacecraft, production-renderer parity, HDR/IBL, native WebGPU, or reusable rhythm-kit claim.",
  player: { lane: 1, targetLane: 1, x: 0, y: 0, airborne: false, sliding: false, colliderTop: 0.72 },
  paused: false,
  audio: tunnelAudio.evidence(),
  stats: { grazes: 0, passes: 0, collisions: 0 },
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
      beatClock.advanceScheduler(seconds);
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
const startupInputLatch = { left: false, right: false, jump: false, slide: false };
let lastSection: PulseSectionId = "intro";

function applySection(sectionId: PulseSectionId, announce: boolean): void {
  lastSection = sectionId;
  evidence.section = sectionId;
  if (!evidence.sectionsVisited.includes(sectionId)) evidence.sectionsVisited.push(sectionId);
  tunnelAudio.applySection(sectionId);
  for (const id of Object.keys(hueHandles) as PulseSectionId[]) {
    const active = id === sectionId;
    for (const handle of hueHandles[id]) handle.setVisible(active);
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
    parts.top.setVisible(false);
    parts.bottom.setVisible(false);
    parts.core.setVisible(false);
  }
  tunnelAudio.duckForSummary();
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
  evidence.restarts += 1;
  fogPulseRemaining = 0;
  hitFlashRemaining = 0;
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
    publish();
    return;
  }

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

const slotFlashStates = new Map<number, boolean>();

function renderWorld(dt: number): void {
  const laneBank = (playerState.targetLane - playerState.lane) * -0.18;
  // The evidence lens keeps the complete typed pod inside frame. Its full
  // silhouette is the player-side anchor for the terminal exchange; only its
  // route-local transform changes, never the player collider or controls.
  const craftScale = visualReviewCapture
    ? [0.32, playerState.sliding ? 0.22 : 0.32, 0.32] as const
    : playerState.sliding ? [0.76, 0.54, 0.76] as const : [0.8, 0.8, 0.8] as const;
  const reviewPlayerX = visualReviewCapture ? playerState.x - 1.55 : playerState.x;
  const reviewPlayerZ = visualReviewCapture ? -0.42 : PULSE_PLAYER_Z;
  shipBody.setPosition(reviewPlayerX, playerState.y + 0.08, reviewPlayerZ)
    .setScale(craftScale)
    .setRotation(0, visualReviewCapture ? 2.88 : 0, laneBank);
  shipGlow.setPosition(reviewPlayerX, playerState.y + 0.2, reviewPlayerZ + 0.3)
    .setScale(visualReviewCapture ? [0.13, 0.13, 0.13] : [0.34, 0.34, 0.34]);
  const blinking = playerState.invulnRemaining > 0 && Math.floor(performance.now() / 100) % 2 === 0;
  shipBody.setVisible(!blinking);
  shipGlow.setVisible(!blinking);

  // Finale target + incoming rhythm pulses are real scene nodes, not DOM
  // decoration. They enter only after the chart reaches the finale section.
  // The typed terminal sentry owns the opposite end of the pod↔sentry exchange,
  // while the chart retains every collision/timing decision underneath.
  // Keep the finale presentation visible during a paused evidence capture as
  // well as during live play.  Pausing freezes the clock/input, not the
  // renderer-owned boss silhouette or its last projectile pose.
  const finaleActive = lastSection === "finale" && (runState === "running" || runState === "paused");
  finaleBeacon.setVisible(finaleActive && !visualReviewCapture);
  finaleBossRing.setVisible(finaleActive && !visualReviewCapture);
  for (const wing of finaleBossWings) wing.setVisible(finaleActive && !visualReviewCapture);
  // The old primitive interceptor/core are deliberately suppressed for this
  // typed-sentry finale state. They have no collision or chart role.
  finaleBossCraft.setVisible(false);
  for (const vane of finaleShieldVanes) vane.setVisible(finaleActive && !visualReviewCapture);
  finaleCore.setVisible(false);
  finaleArenaShell.setVisible(finaleActive);
  finaleTerminalSentry.setVisible(finaleActive);
  // Continuous line bars from the previous composition are intentionally
  // retired in review mode. Discrete projectile packets now connect the
  // visible origin halo to the separate shield impact plane without becoming
  // an opaque central pile.
  for (const vector of finaleVectors) vector.setVisible(false);
  for (const rain of rainHandles) rain.setVisible(finaleActive && !visualReviewCapture);
  // In the review lens, the warm return packets originate at the typed
  // sentinel itself. The old torus halo flattened into a bright bar across its
  // torso, so it is intentionally retired instead of obscuring the target.
  reviewAttackOrigin?.setVisible(false);
  reviewImpactPlane?.setVisible(finaleActive);
  for (const gantry of reviewGantries) gantry.setVisible(finaleActive);
  if (finaleActive) {
    const pulse = performance.now() / 1000;
    finaleBeacon.setRotation(0, 0, pulse * 0.75);
    finaleBossRing.setRotation(0, 0, pulse * -0.32);
    finaleTerminalSentry
      .setPosition(visualReviewCapture ? 2.12 : 0, (visualReviewCapture ? 0.18 : 0.08) + Math.sin(pulse * 1.7) * 0.024, visualReviewCapture ? -3.78 : -5.16)
      .setRotation(0, Math.PI + 0.18 + Math.sin(pulse * 1.1) * 0.025, 0)
      .setScale(visualReviewCapture ? [1.34, 1.34, 1.34] : [0.86, 0.86, 0.86]);
    const arenaPulse = 1 + (Math.sin(pulse * 3.2) * 0.5 + 0.5) * 0.08;
    reviewAttackOrigin?.setScale([0.92 * arenaPulse, 0.92 * arenaPulse, 0.055]);
    reviewImpactPlane?.setScale([0.72 + (arenaPulse - 1) * 0.8, 0.72 + (arenaPulse - 1) * 0.8, 0.045]);
    const ringPulse = 1 + (Math.sin(pulse * 2.7) * 0.5 + 0.5) * 0.08;
    finaleBossRing.setScale(visualReviewCapture
      ? [1.55 * ringPulse, 1.18 * ringPulse, 0.12]
      : [3.55 * ringPulse, 2.25 * ringPulse, 0.15]);
    // Keep the live pulse cadence in the existing ring/vane architecture while
    // the typed sentry remains the visible target. No primitive core competes
    // with the sentry silhouette in the finale capture.
    finaleProjectiles.forEach((projectile, index) => {
      if (visualReviewCapture) {
        // Nine cool packets leave the player apron for the boss halo; six warm
        // packets return toward the offset shield plane. Three spare pool nodes
        // stay hidden. The two streams occupy different height bands and never
        // collapse into the typed target silhouette.
        const outgoing = index < 6;
        const returning = index >= 12 && index < 16;
        if (!outgoing && !returning) {
          projectile.setVisible(false);
          return;
        }
        const localIndex = outgoing ? index : index - 12;
        const column = localIndex % 3 - 1;
        const step = Math.floor(localIndex / 3);
        const progress = outgoing ? 0.24 + step * 0.34 : 0.22 + step * 0.48;
        const sourceZ = outgoing ? reviewPlayerZ - 0.52 : -3.55;
        const targetZ = outgoing ? -3.9 : 0.42;
        const travel = progress;
        const z = sourceZ + (targetZ - sourceZ) * travel;
        const originX = outgoing ? reviewPlayerX : 2.12;
        const endpointX = outgoing ? 2.12 : -1.18;
        const x = originX + (endpointX - originX) * travel + column * 0.12;
        const y = outgoing ? 0.38 + column * 0.075 + travel * 0.54 : 1.08 + column * 0.1 - travel * 0.38;
        projectile.setVisible(true)
          .setPosition(x, y, z)
          .setScale(outgoing ? [0.045, 0.36, 0.045] : [0.055, 0.42, 0.055])
          .setRotation(Math.PI / 2, outgoing ? -0.18 : 0.2, 0);
      } else {
        const lane = index % 5 - 2;
        const phase = (pulse * 0.52 + index * 0.073) % 1;
        const sweep = Math.sin(pulse * 1.2 + index * 0.9) * 0.24;
        projectile.setVisible(true).setPosition(lane * 0.68 + sweep, 0.28 + (index % 3) * 0.24, -8.2 + phase * 8.1)
          .setScale([0.075, 0.44, 0.075])
          .setRotation(Math.PI / 2, lane * -0.08, 0);
      }
    });
    rainHandles.forEach((rain, index) => {
      const column = index % 10;
      const depth = Math.floor(index / 10);
      const x = -3.05 + column * 0.68 + (depth % 2) * 0.12;
      const baseY = 0.72 + (index % 5) * 0.42;
      const fall = reducedMotion ? 0 : (evidence.beatCount * 0.13 + pulse * 1.8 + index * 0.17) % 1.25;
      rain.setPosition(x, baseY - fall, -4.2 - depth * 8.1 - (index % 3) * 0.55);
    });
  } else {
    for (const projectile of finaleProjectiles) projectile.setVisible(false);
    for (const vector of finaleVectors) vector.setVisible(false);
    for (const rain of rainHandles) rain.setVisible(false);
    reviewAttackOrigin?.setVisible(false);
    reviewImpactPlane?.setVisible(false);
    for (const gantry of reviewGantries) gantry.setVisible(false);
  }

  // A collision can enter summary during gateSystem.update(). Do not let the
  // later render pass re-show the just-resolved gate or freeze transient flash
  // geometry into the result frame.
  if (runState === "summary") {
    hitFlash.setVisible(false);
    fogPulse.setVisible(false);
    for (const parts of gateSlots) {
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
    const gate = gates[slot];
    if (!gate) {
      parts.top.setVisible(false);
      parts.bottom.setVisible(false);
      parts.core.setVisible(false);
      continue;
    }
    const geometry = pulseGateGeometry(gate.entry, schedulerTime);
    const secondsToArrival = (PULSE_PLAYER_Z - gate.z) / PULSE_GATE_SPEED;
    const flashing = !gate.resolved && secondsToArrival >= 0 && secondsToArrival <= PULSE_PREFLASH_SECONDS;
    if ((slotFlashStates.get(slot) ?? false) !== flashing) {
      const spec = gateMaterialSpec(gate.entry.kind, flashing);
      parts.top.setMaterial(spec);
      parts.bottom.setMaterial(spec);
      parts.core.setMaterial(spec);
      slotFlashStates.set(slot, flashing);
    }
    placePart(parts.bottom, gate.entry.kind === "low", 2.3, 0.34, 0, 0.17, gate.z);
    placePart(parts.top, gate.entry.kind === "high", 2.3, 0.67, 0, 0.715, gate.z);
    placePart(
      parts.core,
      gate.entry.kind === "wall" || gate.entry.kind === "pylon",
      gate.entry.kind === "pylon" ? 0.36 : 0.72,
      1.05,
      geometry.centerX,
      0.525,
      gate.z
    );
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
  z: number
): void {
  handle.setVisible(visible);
  if (!visible) return;
  handle.setPosition(x, y, z).setScale([scaleX, scaleY, 0.18]);
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
  const schedulerNow = sample.time;
  // Keep the authored section and stem buses aligned even when a deterministic
  // evidence seek crosses several beat callbacks between rendered frames.
  const schedulerSection = pulseSectionAtTime(schedulerNow);
  // Re-apply every frame so accelerated evidence seeks cannot leave the mixer
  // ducked or stale when the section label has already advanced.
  applySection(schedulerSection.id, false);
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

applySection("intro", false);
publish();
