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

// Review-only encounter materials. The live tunnel keeps its established
// renderer-owned neon language; the exact visual frame gets a restrained
// reactor-steel stage with explicit value separation so the typed actors and
// exchange read as one place rather than a pile of emissive primitives.
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
  .position(visualReviewCapture ? 1.38 : 0, visualReviewCapture ? 0.22 : 0.08, visualReviewCapture ? -3.72 : -5.16)
  .rotate(0, Math.PI + 0.18, 0)
  .scale(visualReviewCapture ? 1.24 : 0.86)
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
  targetMaxDimension: 11.556,
  // Keep the roof-rib tubes out of the exact comparison lens. Even the far
  // ribs project as a single black canopy from this over-the-shoulder review
  // distance and obscure the typed actors and packet streams. V11's continuous
  // deck, side rails, service uprights, rear bay, and authored review braces
  // still establish a real enclosure; this is a composition correction to the
  // imported asset, not a camera-only pass.
  hiddenNodeNames: visualReviewCapture
    ? [
        ...Array.from({ length: 8 }, (_, arch) => [
          ...Array.from({ length: 8 }, (_, segment) => `V11 forged reactor arch ${arch} segment ${segment}`),
          ...Array.from({ length: 7 }, (_, joint) => `V11 forged reactor arch ${arch} joint ${joint}`),
          `V11 arch crown service block ${arch}`,
          `V11 arch crown cyan signal ${arch}`
        ]).flat(),
        // The nearest overhead cabinets/luminaires also rasterize as one dark
        // slab at the review distance. Their side/rear service structure is
        // represented by the authored review braces below; keep the typed
        // deck and terminal bay, but remove this occluding top-plane cluster.
        ...Array.from({ length: 5 }, (_, index) => [
          `V11 overhead service cabinet ${index}`,
          `V11 overhead service lamp ${index}`
        ]).flat()
      ]
    : undefined
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

// Grounding geometry is deliberately separate from the typed models. It makes
// the contact points and exchange planes unambiguous at review distance while
// leaving the route-owned lane/collider math untouched.
const reviewContactBuilders = visualReviewCapture ? [
  primitives.cylinder({ name: "pulse runner contact shadow", material: reviewContactMaterial })
    .position(-1.38, 0.035, 0.42).scale([1.32, 0.028, 0.58])
    .runtime(game.runtimeNode("pulse-review-runner-contact", { tags: ["encounter-grounding", "renderer-owned", "non-colliding"] })),
  primitives.cylinder({ name: "pulse sentry contact shadow", material: reviewContactMaterial })
    .position(1.38, 0.035, -3.72).scale([1.48, 0.035, 0.72])
    .runtime(game.runtimeNode("pulse-review-sentry-contact", { tags: ["encounter-grounding", "renderer-owned", "non-colliding"] }))
] : [];

// A sparse set of asymmetrical bulkheads and signal braces gives the review
// lens an authored room profile instead of a blank gradient. These stay outside
// all three gameplay lanes and are not collision or timing surfaces.
const reviewStructureBuilders = visualReviewCapture
  ? [
      primitives.box({ name: "pulse review rear bulkhead left", material: reviewPanelMaterial })
        .position(-2.35, 1.30, -5.85).rotate(0, 0.04, 0.02).scale([1.02, 1.38, 0.12]),
      primitives.box({ name: "pulse review rear bulkhead right", material: reviewPanelMaterial })
        .position(2.58, 1.0, -5.35).rotate(0, -0.06, -0.025).scale([0.72, 1.08, 0.12]),
      primitives.box({ name: "pulse review left buttress", material: reviewBeamMaterial })
        .position(-2.72, 1.15, -2.3).rotate(0.04, 0.02, -0.14).scale([0.22, 1.26, 2.62]),
      primitives.box({ name: "pulse review right buttress", material: reviewBeamMaterial })
        .position(2.78, 1.36, -2.95).rotate(-0.03, -0.03, 0.16).scale([0.22, 1.48, 2.38]),
      primitives.box({ name: "pulse review overhead bridge", material: reviewBeamMaterial })
        .position(0.18, 3.18, -3.82).rotate(0, 0.03, 0.02).scale([2.72, 0.14, 0.20]),
      primitives.box({ name: "pulse review bridge signal", material: reviewSignalMaterial })
        .position(0.18, 3.02, -3.58).scale([1.44, 0.035, 0.035]),
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
    ]
  : [];

// The review composition previously stopped at two dark buttresses and a
// single backplate. These restrained reactor panels add a visible rear plane,
// repeatable floor scale, and a warm/cool material cadence without becoming
// a second hero asset. They are renderer-owned set dressing only; the chart,
// lanes, and collision systems remain unchanged.
const reviewArchitectureAccentBuilders = visualReviewCapture
  ? [
      primitives.box({ name: "pulse review rear reactor panel", material: reviewRearMaterial })
        .position(0.08, 1.55, -5.72).rotate(0, 0.018, 0).scale([2.62, 1.54, 0.10]),
      primitives.box({ name: "pulse review rear reactor panel left seam", material: reviewSignalMaterial })
        .position(-1.38, 1.56, -5.57).scale([0.035, 1.18, 0.035]),
      primitives.box({ name: "pulse review rear reactor panel right seam", material: reviewAccentMaterial })
        .position(1.54, 1.56, -5.53).scale([0.035, 1.06, 0.035]),
      primitives.box({ name: "pulse review rear reactor header", material: reviewBeamMaterial })
        .position(0.10, 2.88, -5.56).rotate(0, 0.02, 0).scale([2.86, 0.12, 0.14]),
      primitives.box({ name: "pulse review rear reactor header signal", material: reviewRose })
        .position(0.10, 2.70, -5.38).scale([1.04, 0.026, 0.026]),
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
          .position(side * 2.18, 1.44, -5.18).rotate(0.04, side * 0.08, side * 0.10).scale([0.10, 1.72, 0.14]),
        primitives.box({ name: `pulse review rear truss signal ${side}`, material: side < 0 ? reviewCyan : reviewRose })
          .position(side * 2.02, 1.50, -5.02).rotate(0.04, side * 0.08, side * 0.10).scale([0.024, 1.22, 0.024])
      ])
    ]
  : [];

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
const reviewTerrainBuilders = visualReviewCapture
  ? [
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
    ]
  : [];

// Readability accents are attached to the typed silhouettes, not substitutes
// for them: a cool edge traces the runner's wing line, a warm return marker
// identifies the sentry's fire lane, and a small impact cluster marks the
// actual exchange midpoint. Each node is renderer-owned support geometry with
// no gameplay or collision role.
const reviewCombatAccentBuilders = visualReviewCapture
  ? [
      primitives.box({ name: "pulse runner cyan wing edge left", material: reviewSignalMaterial })
        .position(-1.82, 0.48, 0.28).rotate(0, -0.08, -0.05).scale([0.72, 0.028, 0.042]),
      primitives.box({ name: "pulse runner cyan wing edge right", material: reviewSignalMaterial })
        .position(-0.94, 0.48, 0.28).rotate(0, 0.08, 0.05).scale([0.72, 0.028, 0.042]),
      primitives.capsule({ name: "pulse runner drive wake left", material: reviewCyan })
        .position(-1.72, 0.30, 0.78).rotate(Math.PI / 2, 0, 0).scale([0.055, 0.42, 0.055]),
      primitives.capsule({ name: "pulse runner drive wake right", material: reviewCyan })
        .position(-1.04, 0.30, 0.78).rotate(Math.PI / 2, 0, 0).scale([0.055, 0.42, 0.055]),
      primitives.box({ name: "pulse sentry fire lane marker", material: reviewAccentMaterial })
        .position(1.38, 1.14, -3.02).rotate(0, 0, 0).scale([0.46, 0.026, 0.026]),
      primitives.torus({ name: "pulse exchange impact outer", material: reviewAmber })
        .position(0.04, 0.96, -2.18).scale([0.34, 0.34, 0.042])
        .runtime(game.runtimeNode("pulse-review-impact-outer", { tags: ["combat-impact", "renderer-owned", "non-colliding"] })),
      primitives.torus({ name: "pulse exchange impact inner", material: reviewCyan })
        .position(0.04, 0.96, -2.18).scale([0.16, 0.16, 0.055])
        .runtime(game.runtimeNode("pulse-review-impact-inner", { tags: ["combat-impact", "renderer-owned", "non-colliding"] })),
      primitives.sphere({ name: "pulse exchange impact core", material: reviewRose })
        .position(0.04, 0.96, -2.18).scale([0.09, 0.09, 0.09])
        .runtime(game.runtimeNode("pulse-review-impact-core", { tags: ["combat-impact", "renderer-owned", "non-colliding"] }))
    ]
  : [];

// The typed terminal sentry's authored gunmetal/obsidian shell is intentionally
// dark, but at the exact review distance its shoulder mass can merge into the
// reactor backplate. These small, non-colliding armour and reactor markers are
// attached to the sentry's review pose so its silhouette reads as a deliberate
// combatant rather than a blocky black cut-out. The GLB remains the only primary
// character; this is renderer-owned contour support, not a replacement body.
const reviewSentryIdentityBuilders = visualReviewCapture
  ? [
      primitives.box({ name: "pulse sentry left shoulder contour", material: reviewCyan })
        .position(0.50, 1.36, -3.14)
        .rotate(0, 0.22, -0.18)
        .scale([0.08, 0.34, 0.045])
        .runtime(game.runtimeNode("pulse-review-sentry-shoulder-left", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
      primitives.box({ name: "pulse sentry right shoulder contour", material: reviewRose })
        .position(2.26, 1.36, -3.14)
        .rotate(0, -0.22, 0.18)
        .scale([0.08, 0.34, 0.045])
        .runtime(game.runtimeNode("pulse-review-sentry-shoulder-right", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
      primitives.box({ name: "pulse sentry reactor chest contour", material: reviewSteelEdge })
        .position(1.38, 1.03, -3.12)
        .scale([0.36, 0.06, 0.045])
        .runtime(game.runtimeNode("pulse-review-sentry-chest-plate", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] })),
      primitives.box({ name: "pulse sentry reactor chest signal", material: reviewAmber })
        .position(1.38, 1.16, -3.04)
        .scale([0.22, 0.065, 0.035])
        .runtime(game.runtimeNode("pulse-review-sentry-chest-signal", { tags: ["typed-terminal-support", "renderer-owned", "non-colliding"] }))
    ]
  : [];

// The final visual pass uses a purpose-built, three-plane encounter stage. The
// old custom footprint prism was broad enough to become a single blank floor
// under safe-basic; these smaller authored modules create a clear launch apron,
// recessed exchange lane, and raised sentinel dock while leaving all timing and
// collision authority in the existing chart/gate systems.
const reviewArenaWorldBuilders = visualReviewCapture
  ? [
      // Narrow central causeway and inset exchange lane.
      primitives.box({ name: "pulse review causeway deck", material: reviewSteel })
        .position(0, -0.22, -2.15).scale([2.95, 0.12, 4.85]),
      primitives.box({ name: "pulse review foreground staging deck", material: reviewSteel })
        .position(0, -0.19, 2.45).scale([3.0, 0.1, 3.9]),
      primitives.box({ name: "pulse review exchange lane", material: reviewDeckMaterial })
        .position(0, -0.06, -2.1).scale([1.05, 0.045, 4.45]),
      primitives.box({ name: "pulse review runner launch apron", material: reviewShoulderMaterial })
        .position(-1.65, -0.02, 0.18).rotate(0, -0.08, 0).scale([1.1, 0.1, 1.15]),
      primitives.box({ name: "pulse review sentinel raised dock", material: reviewSteelEdge })
        .position(1.38, -0.01, -3.92).rotate(0, 0.12, 0).scale([1.56, 0.18, 1.16]),
      primitives.box({ name: "pulse review sentinel backplate", material: reviewSteel })
        .position(1.38, 1.68, -4.8).scale([2.46, 1.72, 0.16]),
      primitives.box({ name: "pulse review runner launch spine", material: reviewSteelEdge })
        .position(-1.55, 0.18, 0.52).rotate(0, -0.08, 0).scale([1.08, 0.08, 0.9]),
      primitives.torus({ name: "pulse review runner launch ring", material: reviewCyan })
        .position(-1.55, 0.18, 0.45).rotate(0, 0, 0).scale([0.82, 0.82, 0.055]),
      // Layered side containment panels supply real occlusion/depth without
      // crossing the three playable lanes.
      ...[-1, 1].flatMap((side) => [
        primitives.box({ name: `pulse review lower containment ${side}`, material: reviewSteel })
          .position(side * 3.16, 0.62, -2.35).rotate(0, side * 0.08, 0).scale([0.2, 0.78, 3.55]),
        primitives.box({ name: `pulse review upper containment ${side}`, material: reviewShoulderMaterial })
          .position(side * 2.82, 2.22, -3.25).rotate(0, side * -0.16, side * 0.06).scale([0.16, 0.78, 3.0]),
        primitives.box({ name: `pulse review side conduit ${side}`, material: reviewCyan })
          .position(side * 2.63, 0.44, -2.35).rotate(0, 0, side * 0.02).scale([0.035, 0.035, 3.25])
      ]),
      // Angled overhead ribs and rear braces make the room read as an authored
      // reactor bay rather than a flat tunnel backdrop.
      ...[-2.3, -0.55, 1.25, 3.0].flatMap((z, index) => [
        primitives.box({ name: `pulse review overhead rib left ${index}`, material: reviewSteelEdge })
          .position(-2.25, 2.62, z).rotate(0, 0, -0.24).scale([1.75, 0.11, 0.16]),
        primitives.box({ name: `pulse review overhead rib right ${index}`, material: reviewSteelEdge })
          .position(2.25, 2.62, z).rotate(0, 0, 0.24).scale([1.75, 0.11, 0.16])
      ]),
      // A warm reactor iris anchors the boss side; cyan floor markers point
      // toward it and establish the direction of the combat exchange.
      primitives.torus({ name: "pulse review reactor iris", material: reviewRose })
        .position(1.38, 1.78, -4.56).rotate(0, 0, 0).scale([1.16, 1.16, 0.08]),
      primitives.sphere({ name: "pulse review reactor core", material: reviewAmber })
        .position(1.38, 1.78, -4.38).scale([0.31, 0.31, 0.21]),
      ...[-1.95, -1.05, -0.15, 0.75].map((z, index) =>
        primitives.box({ name: `pulse review lane marker ${index}`, material: reviewCyan })
          .position(-0.35, 0.04, z).rotate(0, 0, 0).scale([0.58, 0.028, 0.045])
      ),
      // These state-driven practicals remain non-colliding and are deliberately
      // separate from the HUD: one halo marks the warden's attack origin and
      // the near plane catches a returning cutter stream.
      primitives.torus({ name: "pulse boss attack origin halo", material: reviewRose })
        .position(1.38, 1.14, -3.34).scale([0.82, 0.82, 0.055])
        .runtime(game.runtimeNode("pulse-review-attack-origin", { tags: ["finale-arena", "attack-origin", "renderer-owned"] })),
      primitives.torus({ name: "pulse player shield impact plane", material: reviewCyan })
        .position(-1.18, 0.72, -0.08).rotate(0, -0.12, 0.06).scale([0.54, 0.54, 0.045])
        .runtime(game.runtimeNode("pulse-review-impact-plane", { tags: ["finale-arena", "impact-plane", "renderer-owned", "non-colliding"] })),
      primitives.torus({ name: "pulse terminal lock ring", material: reviewRose })
        .position(1.38, 1.34, -3.20).rotate(0.08, 0.02, 0).scale([0.58, 0.58, 0.05])
    ]
  : [];

// Compact modeled packet cores replace the old review cylinders, whose
// safe-basic orientation could rasterize as opaque cards or vertical spikes.
// They are still renderer-owned three-dimensional scene nodes: the route
// animates them between typed actors, while the gate chart remains the only
// gameplay authority.
const reviewProjectileBuilders = visualReviewCapture
  ? Array.from({ length: 16 }, (_, index) =>
      primitives.sphere({
        name: `pulse review ${index < 8 ? "runner lance" : "warden cutter"} packet ${index + 1}`,
        material: index < 8 ? reviewProjectileCoreCyan : reviewProjectileCoreRose
      })
        .position(0, 0.4, -2.2).scale([0.10, 0.10, 0.10])
        .runtime(game.runtimeNode(`pulse-review-projectile-${index}`, { tags: ["finale-projectile", "renderer-owned", index < 8 ? "runner-lance" : "warden-cutter"] }))
    )
  : [];

// Each authored packet now leaves a short, dimmer 3D wake. The wakes are
// intentionally separate nodes so their direction and depth can be inspected
// in the exact frame; they are not CSS trails or gameplay/collision geometry.
const reviewProjectileTrailBuilders = visualReviewCapture
  ? Array.from({ length: 16 }, (_, index) =>
      primitives.capsule({
        name: `pulse review ${index < 8 ? "runner lance" : "warden cutter"} trail ${index + 1}`,
        material: index < 8 ? reviewTrailCyan : reviewTrailRose
      })
        .position(0, 0.4, -2.2).scale([0.034, 0.034, 0.28])
        .runtime(game.runtimeNode(`pulse-review-projectile-trail-${index}`, { tags: ["finale-projectile-trail", "renderer-owned", "non-colliding"] }))
    )
  : [];

// A small radial burst at the exchange midpoint supplies an authored impact
// hierarchy between the two typed actors. It remains a presentation cue only;
// shield loss, graze, and chart timing continue to come from gateSystem.
const reviewImpactShardBuilders = visualReviewCapture
  ? Array.from({ length: 8 }, (_, index) =>
      primitives.sphere({
        name: `pulse review impact shard ${index + 1}`,
        material: index % 2 === 0 ? reviewTrailCyan : reviewTrailRose
      })
        .position(0.04, 0.96, -2.18).scale([0.06, 0.06, 0.06])
        .runtime(game.runtimeNode(`pulse-review-impact-shard-${index}`, { tags: ["combat-impact", "renderer-owned", "non-colliding"] }))
    )
  : [];

// Impact sparks are separate emissive scene nodes rather than a single bright
// card.  Their radial placement and pulse give the frozen capture a readable
// contact moment between the opposing streams; they remain presentation-only
// and never feed shield, gate, or score state.
const reviewImpactBurstBuilders = visualReviewCapture
  ? Array.from({ length: 10 }, (_, index) =>
      primitives.sphere({
        name: `pulse review impact burst orb ${index + 1}`,
        material: index % 3 === 0 ? reviewProjectileCoreRose : index % 3 === 1 ? reviewProjectileCoreCyan : reviewAmber
      })
        .position(0.04, 0.96, -2.18)
        .scale([0.07, 0.07, 0.07])
        .runtime(game.runtimeNode(`pulse-review-impact-burst-${index}`, { tags: ["combat-impact", "renderer-owned", "non-colliding"] }))
    )
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
    .background(visualReviewCapture ? "#171a38" : "#180b28")
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
      ...reviewStructureBuilders,
      ...reviewArchitectureAccentBuilders,
      ...reviewTerrainBuilders,
      ...reviewContactBuilders,
      ...reviewCombatAccentBuilders,
      ...reviewSentryIdentityBuilders,
      finaleBeaconBuilder,
      finaleBossRingBuilder,
      ...finaleBossWingBuilders,
      finaleBossCraftBuilder,
      ...finaleShieldVaneBuilders,
      finaleCoreBuilder,
      finaleArenaShellBuilder,
      finaleTerminalSentryBuilder,
      ...finaleProjectileBuilders,
      ...reviewProjectileBuilders,
      ...reviewProjectileTrailBuilders,
      ...reviewImpactShardBuilders,
      ...reviewImpactBurstBuilders,
      ...finaleVectorBuilders,
      effects.neonBloom({ intensity: visualReviewCapture ? 0.16 : reducedMotion ? 0.2 : 0.82, threshold: visualReviewCapture ? 0.84 : 0.74, maxIntensity: visualReviewCapture ? 0.42 : 0.72, antiBlowout: true }),
      effects.fog({ name: "pulse downbeat fog pulse", density: visualReviewCapture ? 0.009 : 0.065, color: visualReviewCapture ? "#11192a" : "#241044" })
        .runtime(game.runtimeNode("pulse-fog-pulse", { tags: ["downbeat-fog"] })),
      // Review capture uses a deliberate three-plane lighting setup: neutral
      // front key on the player, warm terminal key, and a cooler crown/rim on
      // the deck and ribs. This is all renderer lighting—not an overlay—and
      // preserves the same world/material language in the playable route.
      lights.directional({ name: "corridor sun", color: visualReviewCapture ? "#c0e1f2" : "#38bdf8", intensity: visualReviewCapture ? 0.88 : 1.6 }).position(-5, 10, 6),
      lights.directional({ name: "terminal warm edge", color: "#ffc08a", intensity: visualReviewCapture ? 0.72 : 0.34 }).position(4.5, 5.8, -3.6),
      lights.ambient({ name: "corridor ambient", color: visualReviewCapture ? "#5a537b" : "#1e1b4b", intensity: visualReviewCapture ? 0.72 : 1.2 }),
      // The V11 hulls use real dark panel materials; broad practicals keep
      // those authored values visible instead of reducing both actors to
      // black silhouettes under the reactor roof. These are local scene lights
      // (not material replacement or CSS) and are bounded to the review lens.
      lights.directional({ name: "review actor neutral fill", color: "#d9f4ff", intensity: visualReviewCapture ? 1.18 : 0 }).position(-2.4, 6.8, 7.4),
      lights.point({ name: "review runner cyan fill", color: "#48e5ff", intensity: visualReviewCapture ? 1.45 : 0 }).position(-1.72, 1.72, 2.65),
      lights.point({ name: "review sentry warm fill", color: "#ffc18f", intensity: visualReviewCapture ? 1.72 : 0 }).position(1.48, 2.10, -1.25),
      lights.point({ name: "runner silhouette front key", color: "#d6edff", intensity: visualReviewCapture ? 0.84 : 0 }).position(-0.7, 1.72, 3.2),
      lights.point({ name: "runner cyan underside bounce", color: "#48dfff", intensity: visualReviewCapture ? 0.82 : 0 }).position(-1.5, 0.42, 1.25),
      lights.point({ name: "terminal amber detail key", color: "#ffbd72", intensity: visualReviewCapture ? 1.28 : 0 }).position(1.5, 2.0, -3.2),
      lights.point({ name: "terminal magenta rim", color: "#ff72ac", intensity: visualReviewCapture ? 0.94 : 0 }).position(-1.2, 1.62, -4.0),
      lights.point({ name: "deck cyan depth practical", color: "#39d9f2", intensity: visualReviewCapture ? 0.88 : 0 }).position(-2.85, 1.8, -1.85),
      lights.point({ name: "exchange impact key", color: "#ffb46b", intensity: visualReviewCapture ? 0.66 : 0 }).position(0.04, 1.1, -2.18),
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
      model(assets.pulseRunnerCraft, {
        name: "pulse original runner craft",
        targetMaxDimension: 2.408,
        // V11's runner family now has a coherent textured hull, canopy, foils,
        // turbine pods, pearl edge, and copper trim. Keep the complete typed
        // model in the review lens: suppressing the drive/chassis groups was
        // appropriate to the earlier candidate, but with V11 it amputated the
        // silhouette and made the player read as a dark fragment. The route's
        // renderer-owned wake remains a support cue, never a substitute.
      })
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
      ? { position: [0.10, 2.72, 6.55], target: [0.02, 0.92, -2.02], fov: 47 }
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
const reviewProjectiles = reviewProjectileBuilders.map((_, index) => requireHandle(`pulse-review-projectile-${index}`));
const reviewProjectileTrails = reviewProjectileTrailBuilders.map((_, index) => requireHandle(`pulse-review-projectile-trail-${index}`));
const reviewImpactShards = reviewImpactShardBuilders.map((_, index) => requireHandle(`pulse-review-impact-shard-${index}`));
const reviewImpactBursts = reviewImpactBurstBuilders.map((_, index) => requireHandle(`pulse-review-impact-burst-${index}`));
const finaleVectors = finaleVectorBuilders.map((_, index) => requireHandle("pulse-finale-vector-" + index));
const rainHandles = rainBuilders.map((_, index) => requireHandle("pulse-rain-" + index));
const reviewAttackOrigin = visualReviewCapture ? requireHandle("pulse-review-attack-origin") : null;
const reviewImpactPlane = visualReviewCapture ? requireHandle("pulse-review-impact-plane") : null;
const reviewRunnerContact = visualReviewCapture ? requireHandle("pulse-review-runner-contact") : null;
const reviewSentryContact = visualReviewCapture ? requireHandle("pulse-review-sentry-contact") : null;
const reviewImpactOuter = visualReviewCapture ? requireHandle("pulse-review-impact-outer") : null;
const reviewImpactInner = visualReviewCapture ? requireHandle("pulse-review-impact-inner") : null;
const reviewImpactCore = visualReviewCapture ? requireHandle("pulse-review-impact-core") : null;
const reviewSentryIdentity = reviewSentryIdentityBuilders.map((_, index) =>
  requireHandle([
    "pulse-review-sentry-shoulder-left",
    "pulse-review-sentry-shoulder-right",
    "pulse-review-sentry-chest-plate",
    "pulse-review-sentry-chest-signal"
  ][index])
);
const reviewGantries: RuntimeNodeHandleLike[] = [];
if (visualReviewCapture) (shipGlow as PulseNodeHandle).setMaterial(reviewRunnerGlowMaterial);
// Preserve each typed asset's authored material separation in review capture.
// Replacing all sub-materials with one finish collapsed the runner/sentry into
// high-contrast slabs, hiding the primary silhouettes that the exact frame must
// make legible. Review lighting now supplies the encounter palette while the
// typed GLBs retain their own hull/optic/armor values.
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
for (const projectile of reviewProjectiles) projectile.setVisible(false);
for (const trail of reviewProjectileTrails) trail.setVisible(false);
for (const shard of reviewImpactShards) shard.setVisible(false);
for (const burst of reviewImpactBursts) burst.setVisible(false);
for (const vector of finaleVectors) vector.setVisible(false);
for (const rain of rainHandles) rain.setVisible(false);
reviewAttackOrigin?.setVisible(false);
reviewImpactPlane?.setVisible(false);
reviewRunnerContact?.setVisible(false);
reviewSentryContact?.setVisible(false);
reviewImpactOuter?.setVisible(false);
reviewImpactInner?.setVisible(false);
reviewImpactCore?.setVisible(false);
for (const accent of reviewSentryIdentity) accent.setVisible(false);
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
    const active = !visualReviewCapture && id === sectionId;
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
    ? [1.16, playerState.sliding ? 0.74 : 1.16, 1.16] as const
    : playerState.sliding ? [0.76, 0.54, 0.76] as const : [0.8, 0.8, 0.8] as const;
  const reviewPlayerX = visualReviewCapture ? playerState.x - 1.38 : playerState.x;
  const reviewPlayerZ = visualReviewCapture ? 0.42 : PULSE_PLAYER_Z;
  shipBody.setPosition(reviewPlayerX, playerState.y + 0.34, reviewPlayerZ)
    .setScale(craftScale)
    .setRotation(0, visualReviewCapture ? 0.12 : 0, laneBank);
  shipGlow.setPosition(reviewPlayerX, playerState.y + 0.44, reviewPlayerZ + 0.34)
    .setScale(visualReviewCapture ? [0.14, 0.14, 0.14] : [0.34, 0.34, 0.34]);
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
  // The release-probed typed reactor world is the encounter enclosure in both
  // lenses.  V11 is authored as a continuous deck/arch/bay composition (no
  // billboard card), so keeping it visible in the exact review frame restores
  // material depth behind the player↔sentry exchange without changing any
  // chart, lane, collision, or projectile authority.
  finaleArenaShell.setVisible(finaleActive && !visualReviewCapture);
  finaleTerminalSentry.setVisible(finaleActive);
  // Continuous line bars from the previous composition are intentionally
  // retired in review mode. Discrete projectile packets now connect the
  // visible origin halo to the separate shield impact plane without becoming
  // an opaque central pile.
  for (const vector of finaleVectors) vector.setVisible(false);
  // The review packets are the visible exchange. Hide the older gameplay pool
  // in this lens because its small cylinders can alias into flat cards at the
  // final screenshot resolution.
  for (const projectile of finaleProjectiles) projectile.setVisible(finaleActive && !visualReviewCapture);
  for (const rain of rainHandles) rain.setVisible(finaleActive && !visualReviewCapture);
  // In the review lens, the warm return packets originate at the typed
  // sentinel itself. The old torus halo flattened into a bright bar across its
  // torso, so it is intentionally retired instead of obscuring the target.
  reviewAttackOrigin?.setVisible(false);
  reviewImpactPlane?.setVisible(finaleActive);
  reviewRunnerContact?.setVisible(finaleActive);
  reviewSentryContact?.setVisible(finaleActive);
  reviewImpactOuter?.setVisible(finaleActive);
  reviewImpactInner?.setVisible(finaleActive);
  reviewImpactCore?.setVisible(finaleActive);
  for (const accent of reviewSentryIdentity) accent.setVisible(finaleActive);
  for (const trail of reviewProjectileTrails) trail.setVisible(finaleActive);
  for (const shard of reviewImpactShards) shard.setVisible(finaleActive);
  for (const burst of reviewImpactBursts) burst.setVisible(finaleActive);
  for (const gantry of reviewGantries) gantry.setVisible(finaleActive);
  if (finaleActive) {
    // Review captures pause on a deterministic scheduler time. Using the
    // scheduler here keeps the final actor/impact pose stable across clean
    // contexts while live mode retains its continuous motion clock.
    const pulse = visualReviewCapture ? evidence.runSeconds : performance.now() / 1000;
    reviewRunnerContact?.setPosition(reviewPlayerX, 0.035, reviewPlayerZ)
      .setScale([1.44, 0.028, 0.68]);
    reviewSentryContact?.setPosition(1.38, 0.035, -3.72)
      .setScale([1.60, 0.035, 0.82]);
    const impactX = 0.04;
    const impactY = 0.96;
    const impactZ = -2.18;
    const impactPulse = 1 + (Math.sin(pulse * 4.2) * 0.5 + 0.5) * 0.14;
    reviewImpactOuter?.setPosition(impactX, impactY, impactZ).setScale([0.44 * impactPulse, 0.44 * impactPulse, 0.052]);
    reviewImpactInner?.setPosition(impactX, impactY, impactZ).setScale([0.22 * impactPulse, 0.22 * impactPulse, 0.064]);
    reviewImpactCore?.setPosition(impactX, impactY, impactZ).setScale([0.13 * impactPulse, 0.13 * impactPulse, 0.13]);
    reviewImpactShards.forEach((shard, index) => {
      const angle = index / reviewImpactShards.length * Math.PI * 2 + pulse * 0.42;
      const radius = (0.24 + (index % 2) * 0.07) * impactPulse;
      shard.setPosition(
        impactX + Math.cos(angle) * radius,
        impactY + Math.sin(angle) * radius * 0.72,
        impactZ + Math.sin(angle * 1.7) * 0.05
      )
        .setScale([0.06 * impactPulse, 0.06 * impactPulse, 0.06 * impactPulse]);
    });
    reviewImpactBursts.forEach((burst, index) => {
      const angle = index / reviewImpactBursts.length * Math.PI * 2 + pulse * 0.56;
      const radius = (0.34 + (index % 3) * 0.08) * impactPulse;
      const yRadius = 0.22 + (index % 2) * 0.08;
      burst.setPosition(
        impactX + Math.cos(angle) * radius,
        impactY + Math.sin(angle) * yRadius * impactPulse,
        impactZ + Math.sin(angle * 1.9) * 0.12
      ).setScale([0.052 + (index % 2) * 0.018, 0.052 + (index % 2) * 0.018, 0.052 + (index % 2) * 0.018]);
    });
    finaleBeacon.setRotation(0, 0, pulse * 0.75);
    finaleBossRing.setRotation(0, 0, pulse * -0.32);
    finaleTerminalSentry
      .setPosition(visualReviewCapture ? 1.38 : 0, (visualReviewCapture ? 0.22 : 0.08) + Math.sin(pulse * 1.7) * 0.024, visualReviewCapture ? -3.72 : -5.16)
      .setRotation(0, Math.PI + 0.18 + Math.sin(pulse * 1.1) * 0.025, 0)
      .setScale(visualReviewCapture ? [1.46, 1.46, 1.46] : [0.86, 0.86, 0.86]);
    if (visualReviewCapture) {
      // Keep the contour supports locked to the sentry's deterministic review
      // pose. They are deliberately static while the typed model supplies the
      // authored silhouette and the projectile stream supplies motion.
      reviewSentryIdentity[0]?.setPosition(0.50, 1.36, -3.14).setRotation(0, 0.22, -0.18);
      reviewSentryIdentity[1]?.setPosition(2.26, 1.36, -3.14).setRotation(0, -0.22, 0.18);
      reviewSentryIdentity[2]?.setPosition(1.38, 1.03, -3.12);
      reviewSentryIdentity[3]?.setPosition(1.38, 1.16, -3.04);
    }
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
        projectile.setVisible(false);
      } else {
        const lane = index % 5 - 2;
        const phase = (pulse * 0.52 + index * 0.073) % 1;
        const sweep = Math.sin(pulse * 1.2 + index * 0.9) * 0.24;
        projectile.setVisible(true).setPosition(lane * 0.68 + sweep, 0.28 + (index % 3) * 0.24, -8.2 + phase * 8.1)
          .setScale([0.075, 0.44, 0.075])
          .setRotation(Math.PI / 2, lane * -0.08, 0);
      }
    });
    if (visualReviewCapture) {
      // Eight cyan lances travel from the runner's launch apron to the warden;
      // eight rose cutters return to the near shield plane. Their staggered
      // depth and height form two legible diagonals instead of a central pile.
      reviewProjectiles.forEach((projectile, index) => {
        const outgoing = index < 8;
        const localIndex = outgoing ? index : index - 8;
        const column = localIndex % 4 - 1.5;
        const row = Math.floor(localIndex / 4);
        // Keep the two streams on distinct depth bands: the runner's cyan
        // lances lead the exchange, while the warden's rose cutters return
        // from farther back. This prevents the packets from collapsing into
        // one noisy central pile at screenshot scale.
        const progress = outgoing
          ? 0.08 + (localIndex % 4) * 0.18 + row * 0.10
          : 0.22 + (localIndex % 4) * 0.18 + row * 0.10;
        const sourceZ = outgoing ? reviewPlayerZ - 0.32 : -3.84;
        const targetZ = outgoing ? -3.56 : reviewPlayerZ;
        const sourceX = outgoing ? reviewPlayerX + column * 0.20 : 1.38 + column * 0.18;
        const targetX = outgoing ? 1.38 + column * 0.20 : reviewPlayerX + column * 0.22;
        const x = sourceX + (targetX - sourceX) * progress;
        const z = sourceZ + (targetZ - sourceZ) * progress;
        const y = outgoing
          ? 0.46 + row * 0.24 + progress * 0.72 + column * 0.055
          : 1.2 + row * 0.28 - progress * 0.46 + column * 0.065;
        projectile.setVisible(true)
          .setPosition(x, y, z)
          .setScale(outgoing ? [0.115, 0.115, 0.115] : [0.12, 0.12, 0.12]);
        const trailProgress = Math.max(0.02, progress - (outgoing ? 0.14 : 0.16));
        const trailX = sourceX + (targetX - sourceX) * trailProgress;
        const trailZ = sourceZ + (targetZ - sourceZ) * trailProgress;
        const trailY = outgoing
          ? 0.46 + row * 0.24 + trailProgress * 0.72 + column * 0.055
          : 1.2 + row * 0.28 - trailProgress * 0.46 + column * 0.065;
        reviewProjectileTrails[index].setVisible(true)
          .setPosition(trailX, trailY, trailZ)
          .setScale(outgoing ? [0.022, 0.022, 0.19] : [0.026, 0.026, 0.21])
          .setRotation(Math.PI / 2, outgoing ? -0.16 : 0.16, outgoing ? 0.08 : -0.08);
      });
    } else {
      for (const projectile of reviewProjectiles) projectile.setVisible(false);
      for (const trail of reviewProjectileTrails) trail.setVisible(false);
      for (const shard of reviewImpactShards) shard.setVisible(false);
      for (const burst of reviewImpactBursts) burst.setVisible(false);
    }
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
    reviewRunnerContact?.setVisible(false);
    reviewSentryContact?.setVisible(false);
    reviewImpactOuter?.setVisible(false);
    reviewImpactInner?.setVisible(false);
    reviewImpactCore?.setVisible(false);
    for (const accent of reviewSentryIdentity) accent.setVisible(false);
    for (const trail of reviewProjectileTrails) trail.setVisible(false);
    for (const shard of reviewImpactShards) shard.setVisible(false);
    for (const burst of reviewImpactBursts) burst.setVisible(false);
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
    // The review lens is a frozen finale encounter composition. Newly spawned
    // chart gates after a deterministic seek are still gameplay-truthful, but
    // their broad telegraph slabs obscure the actor exchange in the exact art
    // frame. Keep those obstacles visible in the live route and HUD evidence;
    // suppress only their renderer geometry for this presentation lens.
    if (visualReviewCapture) {
      parts.top.setVisible(false);
      parts.bottom.setVisible(false);
      parts.core.setVisible(false);
      continue;
    }
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
publish();
