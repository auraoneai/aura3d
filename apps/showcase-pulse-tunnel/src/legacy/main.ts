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
import {
  createFxParticlePass,
  createGame,
  createJuice,
  createOverlayDriver,
  createRumbleDriver,
  createTweenEngine
} from "@aura3d/game";
import { bindPulseEvidence } from "../evidence";
import { bindPulseDrive } from "../scenario-drive";
import { pulseScenarios } from "../scenarios";
import { assets } from "../../../../src/aura-assets";
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
// Candidate Meshy reactor-deck arena shell. Opt-in only via ?arena=candidate so
// the release-validated V11 shell stays the default for players, specs, and
// the review capture. Non-colliding presentation; lanes, chart, collisions,
// and scoring remain route-authoritative.
const pulseArenaCandidateEnabled =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("arena") === "candidate";

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

const pulseTween = createTweenEngine();
const pulseFx = createFxParticlePass(app.effects);
const pulseJuice = createJuice<
  "lane-switch" | "jump" | "slide" | "graze" | "shield-hit" | "shield-break" | "section-rise" | "run-over"
>({
  events: {
    "lane-switch": { fx: { kind: "streak", count: 4, color: "#48d9f2" }, shake: 0.03 },
    jump: { fx: { kind: "dust", count: 6, color: "#9fd8ff" } },
    slide: { fx: { kind: "dust", count: 6, color: "#8fb4d8" } },
    graze: { fx: { kind: "spark", count: 8, color: "#ffe08a" }, shake: 0.05 },
    "shield-hit": { flash: { color: "#ff8d5a", peak: 0.14, ms: 150 }, shake: 0.16 },
    "shield-break": { flash: { color: "#ff4d4d", peak: 0.24, ms: 260 }, shake: 0.3, hitStop: 0.055, vignette: { amount: 0.32, ms: 420, color: "#26060a" } },
    "section-rise": { punch: { fovDeg: 2.2, ms: 170 }, fx: { kind: "ring", count: 14, color: "#48e5ff" } },
    "run-over": { flash: { color: "#ffdca8", peak: 0.18, ms: 280 }, vignette: { amount: 0.38, ms: 520, color: "#120812" } }
  },
  camera: app.camera,
  session: pulseGame.session,
  fx: pulseFx,
  overlay: createOverlayDriver({ app }),
  tweens: pulseTween,
  rumble: createRumbleDriver()
});

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
bindPulseEvidence(() => evidence);
bindPulseDrive({
  beginRun,
  applySection: (id: string, announce: boolean) => applySection(id as PulseSectionId, announce),
  seekAhead(seconds: number): void {
    const remainingCaptureWindow = Math.max(
      0,
      PULSE_RUN_SECONDS - PULSE_CAPTURE_HEADROOM_SECONDS - beatClock.time()
    );
    beatClock.advanceScheduler(Math.min(Math.max(0, seconds), remainingCaptureWindow));
    gateSystem.respace();
  },
  endRun
});
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
      pulseJuice.fire("graze", { position: [playerState.x, playerState.y + 0.42, PULSE_PLAYER_Z - 0.2] });
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
        .scale( scale)
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
  .position(0, 1.0, -4.65).scale( [2.8, 2.8, 0.22])
  .runtime(game.runtimeNode('pulse-finale-beacon', { tags: ['finale-landmark', 'set-dressing'] }));
const finaleTerminalSentryBuilder = model(assets.pulseTerminalSentry, {
  name: "pulse original terminal sentry",
  targetMaxDimension: 2.74
})
  // The review lens gives the terminal its own, farther right-hand depth plane.
  // It is still purely non-colliding presentation: runner movement, lanes, and
  // the beat chart retain their existing coordinates and authority.
  .position( 0,  0.08,  -5.16)
  .rotate(0, Math.PI + 0.18, 0)
  .scale( 0.86)
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
  hiddenNodeNames:  undefined
})
  .position(0, 0, 0)
  .runtime(game.runtimeNode("pulse-finale-arena-shell", {
    tags: ["finale-arena", "typed-world", "release-probed", "renderer-owned", "non-colliding"]
  }));
// Meshy candidate reactor-deck arena (quality: candidate). Same enclosure
// footprint class as the V11 shell it swaps with; shown only when
// ?arena=candidate is set.
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
    .position( side * 1.12, upper ? 1.78 : 0.5,  -4.58)
    .rotate(0, side * 0.18, side * (upper ? -0.5 : 0.5))
    .scale( [0.78, 0.13, 0.42])
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
      .scale( [radius, radius, 0.028 + index * 0.008])
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
      .scale( [2.75, 0.025, 0.055])
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
// Review-only practicals keep the reactor bay legible as a place.  They sit
// one value step below the typed runner/sentry, adding cool/warm depth without
// flattening the encounter into another neon diagram.
// Packet cores are deliberately spherical and high-value.  The previous
// capsule-only packets rasterized as a row of vertical spikes in the frozen
// review frame, which made the exchange read as decoration rather than fire.
// A bright core plus a separate directional wake keeps the projectile as a
// legible volume while the wake communicates travel direction.

// The encounter stage is intentionally built from a small authored material
// family rather than a single dark floor.  These inset panels and hazard
// strips give the lane a readable construction rhythm at the review camera:
// cool graphite slabs carry the runners, while the warm seams establish the
// sentinel's pressure side.  They are renderer-owned set dressing only; the
// chart, collider, and typed actors remain the gameplay authority.

// A sparse set of asymmetrical bulkheads and signal braces gives the review
// lens an authored room profile instead of a blank gradient. These stay outside
// all three gameplay lanes and are not collision or timing surfaces.

// The review composition previously stopped at two dark buttresses and a
// single backplate. These restrained reactor panels add a visible rear plane,
// repeatable floor scale, and a warm/cool material cadence without becoming
// a second hero asset. They are renderer-owned set dressing only; the chart,
// lanes, and collision systems remain unchanged.

// The current typed encounter already establishes the deck and impact shelf,
// but its upper half still reads as empty negative space in a frozen frame.
// These low-intensity windows, side columns, floor chevrons, and horizon beams
// build a continuous reactor-bay silhouette. They are renderer-owned dressing
// outside all three gameplay lanes; the chart, collider, and typed assets stay
// the only gameplay authorities.

// Broken basalt plates and hot/cool seams give the encounter a terrain story
// closer to the comparator's playable arena.  They sit outside the authored
// three-lane collider envelope and are renderer-owned set dressing only.

// The previous review frame had a deck, side rails, and a handful of flat
// plates, but the player and sentry still appeared to hover in the same plane
// as the exchange. These three stepped encounter islands establish a real
// launch pad, impact shelf, and sentinel dock. They are renderer-owned
// set-dressing only: no island is part of the chart, lane, or collider model.
// The low circular profiles deliberately echo the broken basalt forms in Furi
// while preserving the route's Pulse steel/cyan/rose identity.

// Irregular side shelves close the horizon and supply the tiered depth that
// the comparator's arena gets from broad rock platforms. They stay outside
// the three playable lanes and never become a second character or collision
// surface. Staggering their height and yaw prevents a repeated fence pattern.

// Explicit in-scene origin markers and tapered connector beams make the
// projectile ownership inspectable: cyan fire leaves the runner's launch
// muzzle, rose fire leaves the sentry's weapon plane, and both streams meet at
// the same impact shelf. These are renderer-owned support nodes; gate events,
// shields, score, and the authored chart remain the gameplay authority.

// Readability accents are attached to the typed silhouettes, not substitutes
// for them: a cool edge traces the runner's wing line, a warm return marker
// identifies the sentry's fire lane, and a small impact cluster marks the
// actual exchange midpoint. Each node is renderer-owned support geometry with
// no gameplay or collision role.

// The typed terminal sentry's authored gunmetal/obsidian shell is intentionally
// dark, but at the exact review distance its shoulder mass can merge into the
// reactor backplate. These small, non-colliding armour and reactor markers are
// attached to the sentry's review pose so its silhouette reads as a deliberate
// combatant rather than a blocky black cut-out. The GLB remains the only primary
// character; this is renderer-owned contour support, not a replacement body.

// A few compact contour pieces reinforce the two typed silhouettes at the
// frozen review distance.  The runner receives cyan engine collars and a
// canopy spine; the sentry receives a rose sensor visor and paired weapon
// rails.  These are explicitly support geometry, never a replacement body or
// a second gameplay collider, so the typed GLBs remain the only named actors.

// The final visual pass uses a purpose-built, three-plane encounter stage. The
// old custom footprint prism was broad enough to become a single blank floor
// under safe-basic; these smaller authored modules create a clear launch apron,
// recessed exchange lane, and raised sentinel dock while leaving all timing and
// collision authority in the existing chart/gate systems.

// Compact modeled packet cores replace the old review cylinders, whose
// safe-basic orientation could rasterize as opaque cards or vertical spikes.
// They are still renderer-owned three-dimensional scene nodes: the route
// animates them between typed actors, while the gate chart remains the only
// gameplay authority.

// Each authored packet now leaves a short, dimmer 3D wake. The wakes are
// intentionally separate nodes so their direction and depth can be inspected
// in the exact frame; they are not CSS trails or gameplay/collision geometry.
// A box is used here instead of a Y-axis capsule so the runtime can aim the
// wake in the actual X/Z travel direction with one deterministic yaw. The
// sphere packet remains the bright projectile core; this directional support
// piece is what makes the two streams read as fire instead of a pile of dots.

// A small radial burst at the exchange midpoint supplies an authored impact
// hierarchy between the two typed actors. It remains a presentation cue only;
// shield loss, graze, and chart timing continue to come from gateSystem.

// Impact sparks are separate emissive scene nodes rather than a single bright
// card.  Their radial placement and pulse give the frozen capture a readable
// contact moment between the opposing streams; they remain presentation-only
// and never feed shield, gate, or score state.

// Directional impact rays read more like a parry/explosion than a static ball
// cluster.  They are short capsules with alternating cool/warm materials and
// remain locked to the event impact plane; no ray participates in collision or
// score resolution.

// Event rings and a cross-shaped contact flash turn the latest gate result into
// a legible in-scene beat. They are driven from `reviewCombatPulse` below (the
// same PulsePassEvent published to evidence), so a pass/graze/collision can be
// inspected at the impact plane without inventing a second combat simulation.
// Keep the public neonTunnel rails, wall washes, streaks, braces, sparks, and
// fog, but omit its decorative circular torus bands. The route's thin
// section-colored frames above own anticipation; thick concentric rings hid
// the player lane and incoming obstacle at phone width.
const tunnelBackdrop = prefabs.neonTunnel({ rings: 8 }).filter((node) => {
  const name = "name" in node ? String(node.name ?? "") : "";
  return !name.includes("true circular neon tunnel tube ring");
});

const pulseGame = createGame({
  id: "showcase-pulse-tunnel",
  target: "#app",
  scene: () => pulseScene,
  physics: {
    seed: 20260912,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
  scenarios: pulseScenarios,
  evidence: {
    schema: 1,
    sections: async () => (await import("../evidence")).sections,
    legacyGlobals: ["__PULSE_TUNNEL_EVIDENCE__", "__AURA3D_SHOWCASE_PULSE_TUNNEL__"]
  },
  qualityRebuild: { flags: ["game"] }
});
const pulseScene = scene()
    .background( "#180b28")
    .addMany([
      ...( tunnelBackdrop),
      ...hueBuilders,
      ...( depthTrackBuilders),
      ...( cavernRockBuilders),
      ...( cavernSpireBuilders),
      ...( lavaChannelBuilders),
      ...rainBuilders,
      ...( ledgeBuilders),
      ...( finaleArenaBuilders),
      finaleBeaconBuilder,
      ...finaleShieldVaneBuilders,
      ...(pulseArenaCandidateEnabled ? [finaleArenaCandidateBuilder] : [finaleArenaShellBuilder]),
      finaleTerminalSentryBuilder,
      ...finaleProjectileBuilders,
      // A real Aura3D particle effect supplies the encounter's volumetric
      // discharge layer.  It is review-only set dressing around the typed
      // runner/sentry exchange; route-owned pass events still determine the
      // packet positions and impact state below.
      ...( []),
      effects.neonBloom({ intensity:  reducedMotion ? 0.2 : 0.82, threshold:  0.74, maxIntensity:  0.72, antiBlowout: true, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.colorGrade({ exposure: 1.05, contrast: 1.07, saturation: 1.12 }),
      effects.antiAlias({ mode: "fxaa" }),
      effects.fog({ name: "pulse downbeat fog pulse", density:  0.065, color:  "#241044" })
        .runtime(game.runtimeNode("pulse-fog-pulse", { tags: ["downbeat-fog"] })),
      // Review capture uses a deliberate three-plane lighting setup: neutral
      // front key on the player, warm terminal key, and a cooler crown/rim on
      // the deck and ribs. This is all renderer lighting—not an overlay—and
      // preserves the same world/material language in the playable route.
      lights.directional({ name: "corridor sun", color:  "#38bdf8", intensity:  1.6 }).position(-5, 10, 6),
      lights.directional({ name: "terminal warm edge", color: "#ffc08a", intensity:  0.34 }).position(4.5, 5.8, -3.6),
      lights.ambient({ name: "corridor ambient", color:  "#1e1b4b", intensity:  1.2 }),
      // The V11 hulls use real dark panel materials; broad practicals keep
      // those authored values visible instead of reducing both actors to
      // black silhouettes under the reactor roof. These are local scene lights
      // (not material replacement or CSS) and are bounded to the review lens.
      lights.point({ name: "review runner cyan fill", color: "#48e5ff", intensity:  1.15 }).position(-1.72, 1.72, 2.65),
      lights.point({ name: "runner silhouette front key", color: "#d6edff", intensity:  0.7 }).position(-0.7, 1.72, 3.2),
      lights.point({ name: "runner cyan underside bounce", color: "#48dfff", intensity:  0.7 }).position(-1.5, 0.42, 1.25),
      lights.point({ name: "exchange impact key", color: "#ffb46b", intensity:  0 }).position(0.04, 1.1, -2.18),
      lights.point({ name: "cavern cyan practical", color: "#22d3ee", intensity: 1.35 }).position(-2.8, 1.1, -5),
      lights.point({ name: "cavern magenta practical", color: "#d946ef", intensity: 1.25 }).position(2.8, 1.4, -9),
      lights.point({ name: "cavern ember practical", color: "#fb7185", intensity: 1.1 }).position(0.3, 0.9, -14),
      lights.point({ name: "finale core rose key", color: "#fb7185", intensity:  3.4 }).position(0, 2.4, -4.4),
      lights.point({ name: "finale arena cyan rim", color: "#22d3ee", intensity:  2.2 }).position(-3.2, 1.4, -2.8),
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
        .scale( [3.6, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Left Lane Divider Neon Line
      primitives.plane({
        name: "track lane line left",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.2 })
      })
        .position(-0.6, -0.04, -8)
        .scale( [0.04, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Right Lane Divider Neon Line
      primitives.plane({
        name: "track lane line right",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.2 })
      })
        .position(0.6, -0.04, -8)
        .scale( [0.04, 1, 28])
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
      // Hover light: a soft cyan pool on the deck under the craft. The craft
      // floats with a real gap above the track, and without a grounding cue
      // the gap reads as a compositing error. Renderer-owned dressing only.
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
        // Tucked fully under the hull silhouette: the chase camera sits low
        // and close behind the craft, so any pool peeking toward the viewer
        // foreshortens into a solid-looking ramp. Only its rim escapes the
        // hull occlusion, which reads as bounce light rather than geometry.
        .position(0, -0.03, PULSE_PLAYER_Z - 0.1)
        .scale([0.5, 0.35, 1])
        .rotate(-1.5708, 0, 0)
        .runtime(game.runtimeNode("pulse-ship-hover-light", {
          tags: ["player", "craft", "hover-cue", "renderer-owned", "non-colliding", "alpha-blended"]
        })),
      ...gateSlotBuilders,
      ...sparkBuilders
    ])
    .camera(camera.perspective( { position: [0, 0.72, 3.8], target: [0, 0.32, -8], fov: 50 }));

const app = pulseGame.app;
pulseGame.start();

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
const finaleBeacon = requireHandle("pulse-finale-beacon");
const finaleShieldVanes = finaleShieldVaneBuilders.map((_, index) => requireHandle("pulse-finale-shield-vane-" + index));
const finaleArenaShell = requireHandle(pulseArenaCandidateEnabled ? "pulse-finale-arena-candidate" : "pulse-finale-arena-shell");
const finaleTerminalSentry = requireHandle("pulse-finale-terminal-sentry");
const finaleProjectiles = finaleProjectileBuilders.map((_, index) => requireHandle("pulse-finale-projectile-" + index));
// The authored basalt arena is finale dressing, not a permanent spawn-room
// floor.  Before this state gate the large concentric rings/perimeter were
// visible from the ready/intro frame, filling the route-primary probe and
// obscuring the playable lane before any finale encounter existed.  Keep the
// same renderer-owned modules and IDs, but make their visibility follow the
// actual finale state just like the typed sentry and shield architecture.
const finaleArenaDressing: RuntimeNodeHandleLike[] = ! [];
const rainHandles = rainBuilders.map((_, index) => requireHandle("pulse-rain-" + index));
// Preserve each typed asset's authored material separation in review capture.
// Replacing all sub-materials with one finish collapsed the runner/sentry into
// high-contrast slabs, hiding the primary silhouettes that the exact frame must
// make legible. Review lighting now supplies the encounter palette while the
// typed GLBs retain their own hull/optic/armor values.
fogPulse.setVisible(false);
hitFlash.setVisible(false);
finaleBeacon.setVisible(false);
for (const vane of finaleShieldVanes) vane.setVisible(false);
finaleArenaShell.setVisible(false);
finaleTerminalSentry.setVisible(false);
for (const dressing of finaleArenaDressing) dressing.setVisible(false);
for (const projectile of finaleProjectiles) projectile.setVisible(false);
for (const rain of rainHandles) rain.setVisible(false);

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
      // Keep this seam deterministic without allowing a large requested seek
      // to cross the natural `finished` boundary before the caller can freeze
      // the finale frame. Normal gameplay and the live clock are unchanged.
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
  if (announce) {
    void tunnelAudio.sfx("sectionRise");
    pulseJuice.fire("section-rise");
  }
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
  pulseJuice.fire("run-over");
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
  lastSection = "intro";
  pulseGame.session.resume();
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
    const shieldCue = evidence.shields === 2 ? "shieldHit" : "shieldBreak";
    void tunnelAudio.sfx(shieldCue);
    pulseJuice.fire(shieldCue === "shieldHit" ? "shield-hit" : "shield-break", { position: [playerState.x, playerState.y + 0.42, PULSE_PLAYER_Z - 0.2] });
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
  pulseTween.tick(dt);
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
    if (pulseGame.session.paused) {
      pulseGame.session.resume();
      runState = "running";
      void tunnelAudio.resume();
    } else {
      pulseGame.session.pause("user");
      runState = "paused";
      void tunnelAudio.suspend();
    }
  }
  if (runState !== "running" || pulseGame.session.paused) {
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
    if (eventName === "lane-left" || eventName === "lane-right") {
      void tunnelAudio.sfx("laneSwitch");
      pulseJuice.fire("lane-switch", { position: [playerState.x, playerState.y + 0.42, PULSE_PLAYER_Z - 0.2] });
    } else if (eventName === "jump") {
      void tunnelAudio.sfx("jump");
      pulseJuice.fire("jump", { position: [playerState.x, playerState.y + 0.42, PULSE_PLAYER_Z - 0.2] });
    } else if (eventName === "slide") {
      void tunnelAudio.sfx("slide");
      pulseJuice.fire("slide", { position: [playerState.x, playerState.y + 0.42, PULSE_PLAYER_Z - 0.2] });
    }
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
  if (reviewCombatPulse) {
    reviewCombatPulse.ageSeconds += dt;
    if (evidence.latestCombatEvent) evidence.latestCombatEvent.ageSeconds = reviewCombatPulse.ageSeconds;
  }
  const laneBank = (playerState.targetLane - playerState.lane) * -0.18;
  // The evidence lens keeps the complete typed pod inside frame. Its full
  // silhouette is the player-side anchor for the terminal exchange; only its
  // route-local transform changes, never the player collider or controls.
  // Stand scale 0.72 (from 0.8): with the raised ride height the old size
  // filled the frame and the pods still grazed the paint. Slide narrows and
  // drops its center so the canopy (top ~0.36) ducks the 0.38 high-gate bar
  // instead of clipping 0.14 into it as before.
  const craftScale =  playerState.sliding ? [0.68, 0.36, 0.72] as const : [0.72, 0.72, 0.72] as const;
  const shipPlayerX = playerState.x;
  const shipPlayerZ = PULSE_PLAYER_Z;
  // The craft floats: its visual center sits +0.50 above the gameplay feet so
  // the turbine pods clear the deck with a visible hover gap (the old +0.34
  // put the pod undersides exactly on the track paint). Gameplay feet, jump
  // apex, and gate overlap math are untouched; only the presentation rides
  // higher, and the raised top (0.74) now matches the 0.72 stand collider.
  // Sliding drops the center to +0.24 so the squashed canopy ducks under the
  // high-gate bar instead of riding through it.
  const craftCenterY = playerState.sliding && ! 0.50;
  shipBody.setPosition(shipPlayerX, playerState.y + craftCenterY, shipPlayerZ)
    .setScale(craftScale)
    .setRotation(0,  0, laneBank);
  shipGlow.setPosition(shipPlayerX, playerState.y + craftCenterY + 0.10, shipPlayerZ + 0.34)
    .setScale( [0.34, 0.34, 0.34]);
  // The hover pool stays on the deck under the craft: it tracks lane x (and
  // the review island offset) but never lifts with jumps.
  shipHoverLight.setPosition(shipPlayerX,  -0.03, shipPlayerZ - 0.1);
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
  finaleBeacon.setVisible(finaleActive);
  // The old primitive interceptor/core are deliberately suppressed for this
  // typed-sentry finale state. They have no collision or chart role.
  for (const vane of finaleShieldVanes) vane.setVisible(finaleActive);
  // The release-probed typed reactor world is the encounter enclosure in both
  // lenses.  V11 is authored as a continuous deck/arch/bay composition (no
  // billboard card), so keeping it visible in the exact review frame restores
  // material depth behind the player↔sentry exchange without changing any
  // chart, lane, collision, or projectile authority.
  // The typed reactor world is now safe to show in the review lens: the
  // occluding roof-rib/cabinet nodes are filtered at import above, while the
  // authored deck, rails, rear bay, and copper service structure provide the
  // material depth the prior custom-only frame lacked.  It remains
  // renderer-owned/non-colliding; gameplay timing and lanes are unchanged.
  finaleArenaShell.setVisible(finaleActive);
  finaleTerminalSentry.setVisible(finaleActive);
  for (const dressing of finaleArenaDressing) dressing.setVisible(finaleActive);
  // Continuous line bars from the previous composition are intentionally
  // retired. Discrete projectile packets now connect the typed craft and
  // sentry to the separate shield impact plane without becoming an opaque
  // central pile.
  // The review packets are the visible exchange. Hide the older gameplay pool
  // in this lens because its small cylinders can alias into flat cards at the
  // final screenshot resolution.
  for (const projectile of finaleProjectiles) projectile.setVisible(finaleActive);
  for (const rain of rainHandles) rain.setVisible(finaleActive);
  // In the review lens, the warm return packets originate at the typed
  // sentinel itself. The old torus halo flattened into a bright bar across its
  // torso, so it is intentionally retired instead of obscuring the target.
                      if (finaleActive) {
    // Review captures pause on a deterministic scheduler time. Using the
    // scheduler here keeps the final actor/impact pose stable across clean
    // contexts while live mode retains its continuous motion clock.
    const pulse =  performance.now() / 1000;
    // Keep the exchange close to the authored centerline, but bias it toward
    // the lane/height of the latest resolved chart gate.  This is the visual
    // counterpart of the event object published in evidence.latestCombatEvent;
    // it prevents a decorative, always-center impact from claiming causality.
    const eventLaneBias = 0;
    const eventResponse = reviewCombatPulse
      ? Math.max(0.16, Math.exp(-reviewCombatPulse.ageSeconds * 1.9))
      : 0.16;
    const eventKindOffset = 0;
    const impactX = 0.04 + eventLaneBias;
    const impactY = 0.96;
    const impactZ = -2.18 + eventKindOffset;
    const impactPulse = 1 + eventResponse * 0.28 + (Math.sin(pulse * 4.2) * 0.5 + 0.5) * 0.14;
                // Concentric wave rings and a bright cross expand from the exact same
    // impact coordinates.  The first wave is the warm return, the second is
    // the runner's cyan lance, and the outer amber wave marks the resolved
    // gate beat.  Their scale is keyed to the event response age, not a free
    // running cosmetic timer.
    finaleBeacon.setRotation(0, 0, pulse * 0.75);
    finaleTerminalSentry
      .setPosition( 0, ( 0.08) + Math.sin(pulse * 1.7) * 0.024,  -5.16)
      .setRotation(0, Math.PI + 0.18 + Math.sin(pulse * 1.1) * 0.025, 0)
      .setScale( [0.86, 0.86, 0.86]);
    
    const arenaPulse = 1 + (Math.sin(pulse * 3.2) * 0.5 + 0.5) * 0.08;
            // Keep the live pulse cadence in the typed sentry and shield architecture;
    // no abstract boss ring competes with the sentry silhouette.
    finaleProjectiles.forEach((projectile, index) => {
      
        // The default playable finale uses the same authored cause/effect
        // relationship as the review lens: cyan lances leave the runner,
        // converge on the active gate impact plane, and rose cutters return
        // from the typed sentry.  The old free-running lane sweep looked like
        // unrelated decoration and made it impossible to tell who fired.
        const outgoing = index < 10;
        const localIndex = outgoing ? index : index - 10;
        const column = localIndex % 5 - 2;
        const row = Math.floor(localIndex / 5);
        const latestEvent = reviewCombatPulse?.event ?? gateEventLog[gateEventLog.length - 1];
        const latestEntry = latestEvent ? chart.find((entry) => entry.id === latestEvent.gateId) : undefined;
        const latestGeometry = latestEntry ? pulseGateGeometry(latestEntry, beatClock.time()) : undefined;
        const impactX = latestGeometry?.centerX ?? 0;
        const impactY = latestGeometry
          ? Math.max(0.48, Math.min(1.18, (latestGeometry.bottomY + latestGeometry.topY) * 0.5 + 0.12))
          : 0.78;
        const impactZ = -2.18;
        const sourceX = outgoing ? playerState.x : 0;
        const sourceY = outgoing ? playerState.y + 0.44 : 1.12;
        const sourceZ = outgoing ? PULSE_PLAYER_Z - 0.18 : -4.78;
        const targetX = outgoing ? impactX : playerState.x;
        const targetY = outgoing ? impactY : playerState.y + 0.44;
        const targetZ = outgoing ? impactZ : PULSE_PLAYER_Z - 0.18;
        // Stagger the streams by beat phase so each packet remains spatially
        // separated while preserving one shared, deterministic rhythm source.
        const phase = (pulse * 0.52 + localIndex * 0.11 + (outgoing ? 0.04 : 0.26)) % 1;
        const progress = 0.16 + phase * 0.66 + row * 0.035;
        const arc = Math.sin(progress * Math.PI) * (outgoing ? 0.14 : -0.11) + column * 0.028;
        const x = sourceX + (targetX - sourceX) * progress + arc;
        const y = sourceY + (targetY - sourceY) * progress + Math.sin(progress * Math.PI) * (0.08 + row * 0.035);
        const z = sourceZ + (targetZ - sourceZ) * progress;
        projectile.setVisible(true).setPosition(x, y, z)
          .setScale([0.082 + (localIndex % 2) * 0.012, 0.42, 0.082 + (localIndex % 2) * 0.012])
          .setRotation(Math.PI / 2, (targetX - sourceX) * 0.16, outgoing ? 0.05 : -0.05);
      
    });
    
                            
    rainHandles.forEach((rain, index) => {
      const column = index % 10;
      const depth = Math.floor(index / 10);
      const x = -3.05 + column * 0.68 + (depth % 2) * 0.12;
      const baseY = 0.72 + (index % 5) * 0.42;
      const fall = reducedMotion ? 0 : (evidence.beatCount * 0.13 + pulse * 1.8 + index * 0.17) % 1.25;
      // The review lens freezes motion for deterministic capture, but the
      // atmospheric strokes still need to be visible.  Previously we updated
      // their positions without re-enabling visibility, leaving the Furi-style
      // rain layer absent from the exact comparison frame.
      rain.setPosition(x, baseY - fall, -4.2 - depth * 8.1 - (index % 3) * 0.55)
        .setVisible(true);
    });
  } else {
    for (const projectile of finaleProjectiles) projectile.setVisible(false);
    for (const rain of rainHandles) rain.setVisible(false);
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
  evidence.paused = pulseGame.session.paused;
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
