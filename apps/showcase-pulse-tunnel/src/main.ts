/**
 * Pulse Tunnel - mount, systems, evidence.
 *
 * Prototype route (PRD NextGames-PRD/06-Pulse-Tunnel.md). On-rails rhythm runner:
 * obstacles schedule against the AudioContext clock through src/beat-clock.ts, the
 * four synthesized stems mix through src/tunnel-audio.ts buses, and the whole look
 * builds on the proven prefabs.neonTunnel() kit with authored emissive geometry.
 * Abstract-labeled route: the glider and gates are deliberate abstract visualization,
 * stated in the README, not typed character/world claims.
 */
import {
  camera,
  createAuraApp,
  effects,
  game,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  type AuraMaterialSpec,
  type RuntimeNodeHandleLike
} from "@aura3d/engine";
import {
  PULSE_DRIFT_CHECKS_TO_FLIP,
  PULSE_DRIFT_TOLERANCE_MS,
  PULSE_RUN_SECONDS,
  PULSE_TOTAL_BEATS,
  createBeatClock,
  pulseSectionAtBeat,
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
        .scale(scale)
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

const shipMaterial = material.pbr({ name: "pulse glider hull", color: "#0f172a", roughness: 0.25, metallic: 0.85 });
const canopyMaterial = material.emissive({ name: "pulse glider canopy", color: "#38bdf8", emissive: "#0ea5e9", emissiveIntensity: 1.8 });
const wingMaterial = material.pbr({ name: "pulse glider wing", color: "#1e293b", roughness: 0.3, metallic: 0.8 });
const glowMaterial = material.emissive({ name: "pulse glider engine glow", color: "#67e8f9", emissive: "#06b6d4", emissiveIntensity: 2.4 });

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
    })
  })
    .position(0, 0.35, PULSE_PLAYER_Z + 0.2)
    .scale([0.04, 0.04, 0.04])
    .runtime(game.runtimeNode(`pulse-spark-${index}`, { tags: ["graze-trail"] }))
);

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
    .background("#030712")
    .addMany([
      ...tunnelBackdrop,
      ...hueBuilders,
      effects.fog({ name: "pulse downbeat fog pulse", density: 0.08, color: "#0c4a6e" })
        .runtime(game.runtimeNode("pulse-fog-pulse", { tags: ["downbeat-fog"] })),
      lights.directional({ name: "corridor sun", color: "#38bdf8", intensity: 1.6 }).position(0, 8, 4),
      lights.ambient({ name: "corridor ambient", color: "#1e1b4b", intensity: 1.2 }),
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
        .scale([3.6, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Left Lane Divider Neon Line
      primitives.plane({
        name: "track lane line left",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.2 })
      })
        .position(-0.6, -0.04, -8)
        .scale([0.04, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Right Lane Divider Neon Line
      primitives.plane({
        name: "track lane line right",
        material: material.emissive({ name: "lane line cyan", color: "#06b6d4", emissive: "#22d3ee", emissiveIntensity: 1.2 })
      })
        .position(0.6, -0.04, -8)
        .scale([0.04, 1, 28])
        .rotate(-1.5708, 0, 0),

      // Player Cyber Glider Craft
      primitives.box({ name: "pulse glider fuselage", material: shipMaterial })
        .position(0, 0.28, PULSE_PLAYER_Z)
        .scale([0.34, 0.12, 0.52])
        .runtime(game.runtimeNode("pulse-ship-body", { tags: ["player", "craft"] })),
      primitives.box({ name: "pulse glider left wing", material: wingMaterial })
        .position(-0.26, 0.27, PULSE_PLAYER_Z)
        .scale([0.22, 0.04, 0.34])
        .rotate(0, 0, -0.12)
        .runtime(game.runtimeNode("pulse-ship-wing-left", { tags: ["player", "craft"] })),
      primitives.box({ name: "pulse glider right wing", material: wingMaterial })
        .position(0.26, 0.27, PULSE_PLAYER_Z)
        .scale([0.22, 0.04, 0.34])
        .rotate(0, 0, 0.12)
        .runtime(game.runtimeNode("pulse-ship-wing-right", { tags: ["player", "craft"] })),
      primitives.sphere({ name: "pulse glider engine glow", material: glowMaterial })
        .position(0, 0.2, PULSE_PLAYER_Z + 0.3)
        .scale([0.16, 0.16, 0.16])
        .runtime(game.runtimeNode("pulse-ship-glow", { tags: ["player", "craft"] })),
      ...gateSlotBuilders,
      ...sparkBuilders
    ])
    .camera(camera.perspective({ position: [0, 0.72, 3.8], target: [0, 0.32, -8], fov: 56 })),
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
const shipWingLeft = requireHandle("pulse-ship-wing-left");
const shipWingRight = requireHandle("pulse-ship-wing-right");
const shipGlow = requireHandle("pulse-ship-glow");
fogPulse.setVisible(false);
hitFlash.setVisible(false);

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
    presentation: "root-safe abstract primitives and state-driven typed audio"
  },
  claimBoundary: "Abstract root-safe prototype. Beat accuracy is claimed only when the measured clock stays within 80 ms; otherwise the same chart continues in deterministic pattern mode. No typed visual primary, production-renderer parity, HDR/IBL, native WebGPU, or reusable rhythm-kit claim.",
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
  if (runState === "running") return;
  runState = "running";
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
    left: input.pressed("left"),
    right: input.pressed("right"),
    jump: input.pressed("jump"),
    slide: input.pressed("slide")
  });
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
  const wingTiltLeft = playerState.targetLane < playerState.lane ? 0.35 : -0.12;
  const wingTiltRight = playerState.targetLane > playerState.lane ? -0.35 : 0.12;
  shipBody.setPosition(playerState.x, playerState.y + 0.28, PULSE_PLAYER_Z)
    .setScale([0.34, playerState.sliding ? 0.07 : 0.12, 0.52]);
  shipWingLeft.setPosition(playerState.x - 0.26, playerState.y + 0.27, PULSE_PLAYER_Z)
    .setScale([0.2, 0.05, 0.3]).setRotation(0, 0, wingTiltLeft);
  shipWingRight.setPosition(playerState.x + 0.26, playerState.y + 0.27, PULSE_PLAYER_Z)
    .setScale([0.2, 0.05, 0.3]).setRotation(0, 0, wingTiltRight);
  shipGlow.setPosition(playerState.x, playerState.y + 0.2, PULSE_PLAYER_Z + 0.3)
    .setScale([0.16, 0.16, 0.16]);
  const blinking = playerState.invulnRemaining > 0 && Math.floor(performance.now() / 100) % 2 === 0;
  shipBody.setVisible(!blinking);
  shipWingLeft.setVisible(!blinking);
  shipWingRight.setVisible(!blinking);
  shipGlow.setVisible(!blinking);

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
