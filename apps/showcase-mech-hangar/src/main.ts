/**
 * Mech Hangar -> Arena — route glue.
 *
 * One createAuraApp hosts both sets: the hangar bay (turntable, workshop key +
 * warm practicals) and the floodlit pit. The shared follow camera tracks a single
 * anchor node that each mode positions; part swaps re-mount typed GLB nodes so
 * pixels really change (the anti-skin-swap proof). Evidence publishes to
 * window.__MECH_HANGAR_EVIDENCE__ per the PRD evidence contract.
 *
 * Label: prototype. Root safe API only; combat is route-local; no kit claims.
 */
import {
  characterAssembly,
  camera,
  createAuraApp,
  lights,
  material,
  model,
  primitives,
  scene,
  game,
  type RuntimeNodeHandleLike
} from "@aura3d/engine";
import { AGGRESSION_PRESETS, RIVAL_LOADOUTS, aggregateStats, presetForBout } from "./stats";
import { createHangarAudio, AMBIENT_LOOP_SECONDS, HANGAR_AUDIO_CUES } from "./hangar-audio";
import { createHangarController } from "./hangar";
import {
  setupArenaHud,
  setupHangarHud,
  setArenaVisible,
  setHangarVisible,
  showKoCard,
  hideKoCard,
  updateArenaHud,
  updateHangarHud,
  type ArenaHudHandles,
  type HangarHudHandles
} from "./hud";
import { MECH_SLOTS, PART_OPTIONS, catalogReady, resolvePartAsset, selectedParts, type BuildSelection, type MechSlot } from "./parts-catalog";
import { PART_CURATION_VERDICT } from "./parts-generated";
import { buildMechAssemblyPlan, mountTransformForPart, validationSummary } from "./assembly";
import { createMechBout, type BoutEvent, type BoutInputs, type BoutSnapshot } from "./arena/mech-fight";

declare global {
  interface Window {
    __MECH_HANGAR_EVIDENCE__: MechHangarEvidence | undefined;
  }
}

const AGGRESSION_PRESET_COUNT = AGGRESSION_PRESETS.length;

const reducedMotion = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- world layout -----------------------------------------------------------
/** Hangar set sits at the origin; the pit is offset in -z so mode changes glide. */
const HANGAR_CENTER: readonly [number, number, number] = [0, 0, 0];
const ARENA_CENTER_Z = -34;
const arenaX = (x: number): [number, number, number] => [x, 0, ARENA_CENTER_Z];

// ---- input ------------------------------------------------------------------
const input = game.input({
  actions: {
    left: ["KeyA"],
    right: ["KeyD"],
    jump: ["Space"],
    light: ["KeyJ"],
    heavy: ["KeyK"],
    special: ["KeyL"],
    guard: ["ShiftLeft", "ShiftRight"],
    pause: ["KeyP"]
  },
  bufferMs: 90
});

// Hangar + meta keys ride raw keydown because they are UI, not held sim actions.
const hangarKeys = (code: string) => code === "Enter" || code === "Digit1" || code === "Digit2" || code === "Digit3" || code === "Digit4" || code === "ArrowLeft" || code === "ArrowRight";

// ---- audio ------------------------------------------------------------------
const audio = createHangarAudio();
const unlock = (): void => {
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  void audio.unlock();
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

// ---- mode state -------------------------------------------------------------
let mode: "hangar" | "arena" = "hangar";
let boutIndex = 0;
let lastAmbientAt = -AMBIENT_LOOP_SECONDS;
let elapsed = 0;

// ---- hangar controller ------------------------------------------------------
const hangar = createHangarController(
  audio,
  {
  onSelectionChanged: () => {
    refreshHangarPanel();
    if (mode === "hangar") remountPreview();
  },
    onLockIn: () => {
      enterArena();
    }
  },
  { reducedMotion }
);

// ---- panels -----------------------------------------------------------------
const panelHost = document.getElementById("panel")!;
const hangarHud: HangarHudHandles = setupHangarHud(panelHost, hangar.selection);
const arenaPanel = document.createElement("aside");
arenaPanel.className = "mech-panel mech-arena-panel";
arenaPanel.setAttribute("aria-label", "Mech Hangar arena HUD");
document.body.appendChild(arenaPanel);
const arenaHud: ArenaHudHandles = setupArenaHud(arenaPanel);
setArenaVisible(arenaHud, false);

function currentPlan() {
  return buildMechAssemblyPlan("mechBuild-preview", hangar.selection);
}

function assemblyStatusLine(): string {
  if (!catalogReady) return "curation spike pending - mount disabled";
  const built = currentPlan();
  if ("error" in built) return "plan error: " + built.error;
  const summary = validationSummary(built.report);
  return summary.ready
    ? "assembly validated - base + " + summary.attachedParts + "/" + Math.max(0, summary.totalParts - 1) + " socketed"
    : "INVALID BUILD (" + summary.errors + " errors)";
}

function currentAssemblyReady(): boolean {
  if (!catalogReady) return false;
  const built = currentPlan();
  return !("error" in built) && built.report.ready;
}

function refreshHangarPanel(): void {
  updateHangarHud(hangarHud, {
    selection: hangar.selection,
    activeSlot: hangar.snapshot().activeSlot,
    stats: aggregateStats(hangar.selection),
    assemblyReady: currentAssemblyReady(),
    assemblyStatusLine: assemblyStatusLine(),
    catalogReady
  });
}

// ---- scene nodes ------------------------------------------------------------
function fitForSlot(slot: MechSlot): { scaleMode: "fit"; targetHeight?: number; targetMaxDimension?: number } {
  if (slot === "chassis") return { scaleMode: "fit", targetHeight: 0.9 };
  if (slot === "legs") return { scaleMode: "fit", targetHeight: 0.72 };
  if (slot === "arms") return { scaleMode: "fit", targetMaxDimension: 2.0 };
  return { scaleMode: "fit", targetMaxDimension: 1.1 };
}

function partNodeBuilders(side: "player" | "rival"): ReturnType<typeof model>[] {
  const builders: ReturnType<typeof model>[] = [];
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      const asset = resolvePartAsset(def.assetKey);
      if (!asset) continue;
      builders.push(
        model(asset, {
          name: "mech-" + side + "-" + def.assetKey,
          role: "primaryCharacter",
          castShadow: true,
          receiveShadow: true,
          ...fitForSlot(slot)
        }).position(HANGAR_CENTER[0], -60, HANGAR_CENTER[2]).runtime(game.runtimeNode("mech-" + side + "-" + def.assetKey, {
          tags: ["mech-part", side, slot, "typed-primary-asset"]
        }))
      );
    }
  }
  return builders;
}

const camAnchorBuilder = primitives.sphere({
  name: "mech cam anchor",
  material: material.emissive({ name: "cam anchor mat", color: "#101418", emissive: "#000000", emissiveIntensity: 0 })
}).position(HANGAR_CENTER[0], 1.05, HANGAR_CENTER[2]).scale([0.001, 0.001, 0.001])
  .runtime(game.runtimeNode("mech-cam-anchor", { tags: ["camera-anchor"] }));

const sparkMaterial = material.emissive({ name: "hit spark mat", color: "#ffd27a", emissive: "#ffb454", emissiveIntensity: 2.2 });
const dustMaterial = material.pbr({ name: "pit dust mat", color: "#8b93a1", roughness: 1, metallic: 0 });

const SPARK_COUNT = 12;
const DUST_COUNT = 10;
const sparkBuilders = Array.from({ length: SPARK_COUNT }, (_, index) =>
  primitives.sphere({ name: "spark-" + index, material: sparkMaterial })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .runtime(game.runtimeNode("mech-spark-" + index, { tags: ["particle", "renderer-owned"] }))
);
const dustBuilders = Array.from({ length: DUST_COUNT }, (_, index) =>
  primitives.sphere({ name: "dust-" + index, material: dustMaterial })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .runtime(game.runtimeNode("mech-dust-" + index, { tags: ["particle", "renderer-owned"] }))
);

const turntableBuilder = primitives.cylinder({
  name: "hangar turntable",
  material: material.pbr({ name: "turntable steel", color: "#22303f", roughness: 0.55, metallic: 0.7 })
}).position(HANGAR_CENTER[0], 0.055, HANGAR_CENTER[2]).scale([2.35, 0.11, 2.35]);

const hangarFloorBuilder = primitives.box({
  name: "hangar floor",
  material: material.pbr({ name: "hangar deck", color: "#131a24", roughness: 0.9, metallic: 0.1 })
}).position(HANGAR_CENTER[0], -0.06, HANGAR_CENTER[2]).scale([16, 0.12, 14]);

const hangarBackdropBuilder = primitives.box({
  name: "hangar back wall",
  material: material.pbr({ name: "hangar wall", color: "#0e141d", roughness: 0.95, metallic: 0 })
}).position(HANGAR_CENTER[0], 3.2, HANGAR_CENTER[2] - 6.4).scale([18, 6.6, 0.3]);

const pitFloorBuilder = primitives.box({
  name: "arena armored floor",
  material: material.pbr({ name: "pit floor steel", color: "#182431", roughness: 0.82, metallic: 0.28 })
}).position(0, -0.065, ARENA_CENTER_Z).scale([10.8, 0.13, 10]);

const pitBackdropBuilder = primitives.box({
  name: "arena flood wall",
  material: material.pbr({ name: "pit back wall", color: "#111a26", roughness: 0.92, metallic: 0.08 })
}).position(0, 3.5, ARENA_CENTER_Z - 5.3).scale([11.2, 7.1, 0.28]);

const pitMarkingMaterial = material.emissive({ name: "pit lane marks", color: "#23455c", emissive: "#4cc9e8", emissiveIntensity: 0.42 });
const pitMarkingBuilders = [-3.6, -1.8, 0, 1.8, 3.6].map((x, index) =>
  primitives.box({ name: "pit lane mark " + index, material: pitMarkingMaterial })
    .position(x, 0.012, ARENA_CENTER_Z)
    .scale([0.035, 0.024, 7.6])
);

const rimMaterial = material.emissive({ name: "pit rim mat", color: "#2a4a63", emissive: "#59d7ff", emissiveIntensity: 1.1 });
const rimBuilders = [-1, 1].map((side) =>
  primitives.box({ name: "pit rim " + (side < 0 ? "west" : "east"), material: rimMaterial })
    .position(side * 4.85, 0.09, ARENA_CENTER_Z)
    .scale([0.7, 0.18, 9])
);

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  scene: scene()
    .background("#0a0e14")
    .addMany([
      // Hangar lighting: cool workshop key + warm practicals (PRD section 6).
      lights.directional({ name: "workshop cool key", position: [4.2, 5.4, 3.2], intensity: 1.45, color: "#bcd9ff" }),
      lights.point({ name: "warm practical left", position: [-2.6, 2.3, 1.9], intensity: 2.1, color: "#ffb454" }),
      lights.point({ name: "warm practical right", position: [2.7, 2.1, -1.4], intensity: 1.6, color: "#ff9a3d" }),
      lights.ambient({ name: "global fill", intensity: 0.32, color: "#33465c" }),
      // Arena floodlights over the pit.
      lights.directional({ name: "floodlight north", position: [0, 7.4, ARENA_CENTER_Z - 3.4], intensity: 1.7, color: "#eaf4ff" }),
      lights.directional({ name: "floodlight south", position: [2.4, 6.4, ARENA_CENTER_Z + 3.6], intensity: 1.25, color: "#cfe2ff" }),
      turntableBuilder,
      hangarFloorBuilder,
      hangarBackdropBuilder,
      pitFloorBuilder,
      pitBackdropBuilder,
      camAnchorBuilder
    ])
    .addMany([...pitMarkingBuilders, ...rimBuilders, ...sparkBuilders, ...dustBuilders, ...partNodeBuilders("player"), ...partNodeBuilders("rival")])
    .camera(camera.follow({
      targetNode: "mech-cam-anchor",
      distance: 8.2,
      // target-yaw rotates the offset by the anchor's yaw, so spinning the anchor
      // orbits the camera around the framed point while still looking at it.
      offsetMode: "target-yaw",
      // Explicit offset owns follow-camera distance. Keep the full ±4.2m pit
      // and both 1.7m fighters inside the frame while retaining a readable
      // three-quarter hangar preview.
      offset: [0, 1.45, 5.8],
      fov: reducedMotion ? 46 : 50,
      smoothing: 0.16
    }))
});

// ---- runtime handles --------------------------------------------------------
await app.ready();
const anchor = app.nodes.require("mech-cam-anchor") as RuntimeNodeHandleLike;
const playerNodes = new Map<string, RuntimeNodeHandleLike>();
const rivalNodes = new Map<string, RuntimeNodeHandleLike>();
for (const slot of MECH_SLOTS) {
  for (const def of PART_OPTIONS[slot]) {
    const playerHandle = app.nodes.get("mech-player-" + def.assetKey);
    if (playerHandle) playerNodes.set(def.assetKey, playerHandle as RuntimeNodeHandleLike);
    const rivalHandle = app.nodes.get("mech-rival-" + def.assetKey);
    if (rivalHandle) rivalNodes.set(def.assetKey, rivalHandle as RuntimeNodeHandleLike);
  }
}
const sparkNodes = sparkBuilders.map((_, index) => app.nodes.require("mech-spark-" + index) as RuntimeNodeHandleLike);
const dustNodes = dustBuilders.map((_, index) => app.nodes.require("mech-dust-" + index) as RuntimeNodeHandleLike);

const { createMechHangarFeel } = await import("./arena/feel");
const feel = createMechHangarFeel({ reducedMotion, sparkNodes, dustNodes });

// ---- mounting ---------------------------------------------------------------
function mountSide(
  side: "player" | "rival",
  selection: BuildSelection,
  rootPosition: readonly [number, number, number],
  yaw: number,
  nodes: Map<string, RuntimeNodeHandleLike>
): void {
  const parts = selectedParts(selection);
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      const handle = nodes.get(def.assetKey);
      if (!handle) continue;
      const mounted = parts.some((entry) => entry.assetKey === def.assetKey);
      if (!mounted) {
        handle.setVisible(false);
        continue;
      }
      const t = mountTransformForPart(def, parts, rootPosition, yaw);
      handle.setVisible(true);
      handle.setPosition(t.position[0], t.position[1], t.position[2]);
      handle.setRotation(0, t.yaw, 0);
    }
  }
}

function remountPreview(): void {
  if (mode !== "hangar") return;
  mountSide("player", hangar.selection, HANGAR_CENTER, hangar.snapshot().turntableYaw, playerNodes);
}

// ---- bout wiring ------------------------------------------------------------
/**
 * The rival build is a FIXED loadout across the session (PRD section 5 keeps
 * rival loadouts fixed for balance); rematches cycle only the aggression preset.
 */
const RIVAL_FIXED_LOADOUT = RIVAL_LOADOUTS[1]!;

let bout: ReturnType<typeof createMechBout> | null = null;
let paused = false;
let walkCueCooldown = 0;

function enterArena(): void {
  if (!catalogReady || !currentAssemblyReady()) {
    // Validation refused the lock-in; stay in the hangar and say so.
    hangar.unlockForRematchEdit();
    refreshHangarPanel();
    return;
  }
  mode = "arena";
  paused = false;
  setHangarVisible(hangarHud, false);
  setArenaVisible(arenaHud, true);
  startBout();
}

function startBout(): void {
  const presetIndex = boutIndex % AGGRESSION_PRESET_COUNT;
  bout = createMechBout({
    playerSelection: hangar.selection,
    rivalSelection: RIVAL_FIXED_LOADOUT.selection,
    presetIndex,
    seed: 20260821 + boutIndex * 7919
  });
  hideKoCard(arenaHud);
  mountSide("player", hangar.selection, arenaX(-1.9), Math.PI / 2, playerNodes);
  mountSide("rival", RIVAL_FIXED_LOADOUT.selection, arenaX(1.9), -Math.PI / 2, rivalNodes);
}

function leaveToHangar(): void {
  mode = "hangar";
  paused = false;
  bout = null;
  hangar.unlockForRematchEdit();
  setArenaVisible(arenaHud, false);
  setHangarVisible(hangarHud, true);
  for (const handle of rivalNodes.values()) handle.setVisible(false);
  remountPreview();
  refreshHangarPanel();
}

function playerInputsFromActions(): BoutInputs {
  return {
    moveX: (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0),
    jump: input.buffered("jump"),
    light: input.buffered("light"),
    heavy: input.buffered("heavy"),
    special: input.buffered("special"),
    guard: input.held("guard")
  };
}

// ---- touch controls ---------------------------------------------------------
function bindTouchButton(id: string, down: () => void, up: () => void): void {
  const button = document.querySelector("[data-touch='" + id + "']");
  if (!button) return;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    down();
  });
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
}

function ensureTouchControls(): void {
  if (document.getElementById("mech-touch")) return;
  const host = document.createElement("div");
  host.id = "mech-touch";
  const makeZone = (zoneClass: string, buttons: readonly { touch: string; label: string; glyph: string }[]) => {
    const zone = document.createElement("div");
    zone.className = "mech-touch-zone " + zoneClass;
    for (const spec of buttons) {
      const button = document.createElement("button");
      button.dataset.touch = spec.touch;
      button.setAttribute("aria-label", spec.label);
      button.textContent = spec.glyph;
      zone.appendChild(button);
    }
    return zone;
  };
  host.appendChild(makeZone("is-left", [
    { touch: "left", label: "move left", glyph: "\u2190" },
    { touch: "guard", label: "guard", glyph: "G" },
    { touch: "right", label: "move right", glyph: "\u2192" }
  ]));
  host.appendChild(makeZone("is-right", [
    { touch: "light", label: "light strike", glyph: "J" },
    { touch: "heavy", label: "heavy strike", glyph: "K" },
    { touch: "special", label: "special", glyph: "L" },
    { touch: "jump", label: "jump-thrust", glyph: "\u2191" }
  ]));
  document.body.appendChild(host);
  const press = (action: string) => () => input.setAction(action, true);
  const release = (action: string) => () => input.setAction(action, false);
  bindTouchButton("left", press("left"), release("left"));
  bindTouchButton("right", press("right"), release("right"));
  bindTouchButton("guard", press("guard"), release("guard"));
  bindTouchButton("light", press("light"), release("light"));
  bindTouchButton("heavy", press("heavy"), release("heavy"));
  bindTouchButton("special", press("special"), release("special"));
  bindTouchButton("jump", press("jump"), release("jump"));
}
ensureTouchControls();

// ---- keys -------------------------------------------------------------------
window.addEventListener("keydown", (event) => {
  if (mode === "hangar") {
    if (hangarKeys(event.code)) {
      if (hangar.handleKeyDown(event.code)) refreshHangarPanel();
    }
    return;
  }
  // KeyP belongs exclusively to game.input. Handling it here as well would
  // toggle pause twice in one key press (raw keydown, then buffered action).
  if (event.code === "KeyR" && bout && (bout.snapshot().phase === "ko" || bout.snapshot().phase === "lost")) {
    boutIndex += 1;
    startBout();
    return;
  }
  if (event.code === "Backspace") {
    leaveToHangar();
  }
});

// ---- route metadata ---------------------------------------------------------
/** Authored key bindings surfaced in evidence and README (PRD section 4). */
const ROUTE_CONTROLS = {
  hangar: { selectSlot: ["Digit1", "Digit2", "Digit3", "Digit4"], cyclePart: ["ArrowLeft", "ArrowRight"], lockBuild: ["Enter"], orbitPreview: ["pointer drag"] },
  arena: { move: ["KeyA", "KeyD"], jumpThrust: ["Space"], lightStrike: ["KeyJ"], heavyStrike: ["KeyK"], special: ["KeyL"], guard: ["ShiftLeft", "ShiftRight"], pause: ["KeyP"], rematch: ["KeyR"], backToHangar: ["Backspace"] },
  touch: "dual-zone buttons mirroring arena keys"
} as const;

/** Route-local systems inventory (no kit claims; each is glue in this app). */
const ROUTE_SYSTEMS = {
  assembly: "characterAssembly plan -> validateCharacterAssemblyPlan -> typed part node mounting",
  combat: "route-local fixed-step bout rules (windows, guard break, power, KO)",
  rival: "createCombatAi with rematch aggression presets (keep-away/balanced/rushdown)",
  feel: "renderer-owned spark/dust particle pool + follow-camera punch",
  audio: "createGameAudio 4-bus mixer over CLI-registered synthesized cues",
  curation: "deterministic in-repo MH-2M family gate (16 original CC0 parts, explicit sockets/metre scale)"
} as const;

/** Claim boundary: what this route may and may not claim (docs/agents labels). */
const CLAIM_BOUNDARY = {
  label: "prototype",
  renderer: "createAuraApp root safe API",
  allowed: [
    "typed provenance-tracked part swapping changes rendered pixels and stats",
    "route-local mech combat vs createCombatAi rival",
    "validated characterAssembly plans gate lock-in"
  ],
  notAllowed: [
    "reusable fighting/character/combat kit claims",
    "production-runtime-only feature claims from this root route",
    "public release candidate until independent human visual review passes"
  ]
} as const;

// ---- evidence ---------------------------------------------------------------
interface MechHangarEvidence {
  status: string;
  label: string;
  claimBoundary: typeof CLAIM_BOUNDARY;
  controls: typeof ROUTE_CONTROLS;
  systems: typeof ROUTE_SYSTEMS;
  playerMoveId: string | null;
  mounted: boolean;
  mode: string;
  slots: readonly MechSlot[];
  selectedParts: readonly string[];
  primaryAssetRefs: readonly string[];
  stats: ReturnType<typeof aggregateStats>;
  assemblyValidated: boolean;
  boutState: string;
  rivalAggression: string;
  koEvents: readonly unknown[];
  audioCues: readonly string[];
  catalogReady: boolean;
  curationVerdict: typeof PART_CURATION_VERDICT;
  outcomeHash: string;
  pauseFreezesSimulation: boolean;
  reducedMotion: boolean;
  registeredAudioCues: number;
  diagnostics: { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly runtimeBackend?: string };
  fighterPositions: { playerX: number; rivalX: number };
  fighterVitals: { playerHp: number; rivalHp: number; playerGuard: number; playerPower: number };
  feel: unknown;
}

let lastBoutState = "idle";
let lastOutcomeHash = "";
const publishedKoEvents: unknown[] = [];

/**
 * Live fighter positions in evidence so route specs can measure behaviour
 * (approach/retreat profiles per aggression preset) instead of trusting labels.
 */
let lastFighterPositions = { playerX: -1.9, rivalX: 1.9 };
let lastFighterVitals = { playerHp: 1, rivalHp: 1, playerGuard: 1, playerPower: 0.5 };

/** Time warp scales how many fixed steps run per display frame. Sim stays 60Hz-fixed. */
let timeWarp = 1;
(window as unknown as Record<string, unknown>).__MECH_HANGAR_SET_TIME_WARP__ = (warp: number) => {
  timeWarp = Math.max(1, Math.min(4, Math.floor(warp)));
};

/**
 * Synchronous bout pacing for route specs and accessibility: advances the SAME
 * fixed-step simulation (and its event pipeline -> HUD/audio/feel/KO card)
 * without waiting on wall-clock frames. This is pacing, not a shortcut: every
 * rule (windows, guard, power, KO, rematch presets) runs identically.
 */
(window as unknown as Record<string, unknown>).__MECH_HANGAR_SIM_TICK__ = (frames: number, options?: {
  toward?: boolean;
  strike?: "none" | "light" | "heavy" | "special";
  guard?: boolean;
}) => {
  if (!bout || paused) return null;
  const strikeEvery = options?.strike && options.strike !== "none" ? 34 : Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < frames; index += 1) {
    const gap = lastFighterPositions.rivalX - lastFighterPositions.playerX;
    const inputs: BoutInputs = {
      moveX: options?.toward ? Math.sign(gap) : 0,
      jump: false,
      light: options?.strike === "light" && index % strikeEvery === 0 ? true : false,
      heavy: options?.strike === "heavy" && index % strikeEvery === 0 ? true : false,
      special: options?.strike === "special" && index % strikeEvery === 0 ? true : false,
      guard: Boolean(options?.guard)
    };
    bout.pushInputs(inputs);
    const snap = bout.step(1 / 60);
    for (const event of snap.events) handleBoutEvent(event);
    lastFighterPositions = { playerX: snap.player.x, rivalX: snap.rival.x };
    const boutStats = bout.stats();
    lastFighterVitals = {
      playerHp: snap.player.hp / boutStats.player.hpMax,
      rivalHp: snap.rival.hp / boutStats.rival.hpMax,
      playerGuard: snap.player.guard / boutStats.player.guardMax,
      playerPower: snap.player.power / boutStats.player.powerMax
    };
    mountSide("player", hangar.selection, [snap.player.x, snap.player.y, ARENA_CENTER_Z], Math.PI / 2, playerNodes);
    mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [snap.rival.x, snap.rival.y, ARENA_CENTER_Z], -Math.PI / 2, rivalNodes);
    if (snap.phase === "ko" || snap.phase === "lost") break;
  }
  const pacedMidX = (lastFighterPositions.playerX + lastFighterPositions.rivalX) / 2;
  anchor.setPosition(pacedMidX, 1.02, ARENA_CENTER_Z);
  anchor.setRotation(0, 0, 0);
  publishEvidence(bout.snapshot());
  return {
    phase: bout.snapshot().phase,
    vitals: { ...lastFighterVitals },
    positions: { ...lastFighterPositions },
    koEvents: publishedKoEvents.length
  };
};

(window as unknown as Record<string, unknown>).__MECH_HANGAR_VALIDATION_PROBE__ = () => {
  // Proves the live lock-gate validator refuses a floating part inside this very
  // page: take the current validated plan, strip the weapon's attachment rule,
  // and revalidate. The floating-part failure must come back not-ready.
  const built = currentPlan();
  if ("error" in built) return { ready: false, errors: 1 };
  const stripped = {
    ...built.plan,
    parts: built.plan.parts.map((part) =>
      part.role === ("weapon" as const) ? { ...part, attachment: undefined } : part
    )
  };
  const report = characterAssembly.validatePlan(stripped);
  return { ready: report.ready, errors: report.summary.errors };
};

function publishEvidence(snapshot?: BoutSnapshot): void {
  const diagnostics = app.diagnostics();
  const selected = selectedParts(hangar.selection);
  const evidence: MechHangarEvidence = {
    status: mode === "hangar" ? (catalogReady ? "ready" : "curation-pending") : paused ? "paused" : "playing",
    label: CLAIM_BOUNDARY.label,
    claimBoundary: CLAIM_BOUNDARY,
    controls: ROUTE_CONTROLS,
    systems: ROUTE_SYSTEMS,
    playerMoveId: snapshot?.player.move?.id ?? null,
    mounted: true,
    mode,
    slots: MECH_SLOTS,
    selectedParts: selected.map((part) => part.assetKey),
    primaryAssetRefs: selected.map((part) => `assets.${part.assetKey}`),
    stats: aggregateStats(hangar.selection),
    assemblyValidated: currentAssemblyReady(),
    boutState: snapshot?.phase ?? lastBoutState,
    rivalAggression: presetForBout(mode === "arena" ? boutIndex % AGGRESSION_PRESET_COUNT : 0).id,
    koEvents: publishedKoEvents,
    audioCues: [...audio.proof().recentCues],
    catalogReady,
    curationVerdict: PART_CURATION_VERDICT,
    outcomeHash: lastOutcomeHash,
    pauseFreezesSimulation: paused,
    reducedMotion,
    registeredAudioCues: HANGAR_AUDIO_CUES.length,
    diagnostics: {
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      ...(diagnostics.renderer?.runtime.backend ? { runtimeBackend: diagnostics.renderer.runtime.backend } : {})
    },
    fighterPositions: lastFighterPositions,
    fighterVitals: lastFighterVitals,
    feel: feel.snapshot()
  };
  // PRD 07 evidence contract name plus the showcase-registry canonical name
  // point at the same live object.
  window.__MECH_HANGAR_EVIDENCE__ = evidence;
  Object.defineProperty(window, "__AURA3D_SHOWCASE_MECH_HANGAR__", { value: evidence, configurable: true, writable: true });
}

// ---- frame loop -------------------------------------------------------------
let frameCount = 0;
refreshHangarPanel();
remountPreview();

function handleBoutEvent(event: BoutEvent): void {
  if (!bout) return;
  if (event.type === "hit") void audio.cue(event.heavy ? "mechHeavyHitSfx" : "mechLightHitSfx");
  else if (event.type === "blocked") void audio.cue("mechGuardBlockSfx");
  else if (event.type === "guardBreak") void audio.cue("mechGuardBreakSfx");
  else if (event.type === "specialFire") void audio.cue("mechSpecialFireSfx");
  else if (event.type === "ko") {
    void audio.cue("mechKoStingSfx");
    publishedKoEvents.push({ victimId: event.victimId, x: event.x, frame: event.frame });
    showKoCard(arenaHud, event.victimId === "rival", bout.preset());
  } else if (event.type === "land" && event.attackerId === "player") {
    feel.onEvents([{ type: "land", frame: event.frame, attackerId: "player", victimId: null, damage: 0, x: event.x, y: ARENA_CENTER_Z, heavy: false }]);
  }
}

app.onFrame(({ dt }) => {
  const stepDt = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  frameCount += 1;
  elapsed += stepDt;
  input.update(stepDt);

  if (mode === "hangar") {
    hangar.update(stepDt);
    remountPreview();
    // Anchor = the preview mech's chest; its yaw spins the world-offset around
    // the mech (target-yaw), which is the mouse-draggable orbit.
    const orbit = hangar.snapshot();
    anchor.setPosition(HANGAR_CENTER[0], 0.95, HANGAR_CENTER[2]);
    anchor.setRotation(0, orbit.orbitYaw, 0);
    if (elapsed - lastAmbientAt > AMBIENT_LOOP_SECONDS) {
      lastAmbientAt = elapsed;
      void audio.cue("mechAmbientHangarSfx");
    }
    publishEvidence();
    return;
  }

  if (!bout) {
    publishEvidence();
    return;
  }

  if (input.buffered("pause")) {
    paused = !paused;
    publishEvidence(bout.snapshot());
    return;
  }
  if (paused) {
    // Pause freezes BOTH mechs + AI: no sim step, no feel tick, no cues.
    publishEvidence(bout.snapshot());
    return;
  }

  let snap = bout.snapshot();
  for (let warpStep = 0; warpStep < timeWarp; warpStep += 1) {
    bout.pushInputs(playerInputsFromActions());
    snap = bout.step(stepDt);
    for (const event of snap.events) handleBoutEvent(event);
  }
  feel.noteHitStop(snap.hitstopFrames);

  feel.update(stepDt * timeWarp, snap.events, { x: (snap.player.x + snap.rival.x) / 2, y: 1.02, z: ARENA_CENTER_Z });
  const midX = (snap.player.x + snap.rival.x) / 2;
  anchor.setPosition(midX, 1.02, ARENA_CENTER_Z);
  anchor.setRotation(0, 0, 0);

  lastFighterPositions = { playerX: snap.player.x, rivalX: snap.rival.x };
  const boutStats = bout.stats();
  lastFighterVitals = {
    playerHp: snap.player.hp / boutStats.player.hpMax,
    rivalHp: snap.rival.hp / boutStats.rival.hpMax,
    playerGuard: snap.player.guard / boutStats.player.guardMax,
    playerPower: snap.player.power / boutStats.player.powerMax
  };
  mountSide("player", hangar.selection, [snap.player.x, snap.player.y, ARENA_CENTER_Z], Math.PI / 2, playerNodes);
  mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [snap.rival.x, snap.rival.y, ARENA_CENTER_Z], -Math.PI / 2, rivalNodes);

  walkCueCooldown -= stepDt;
  const moving = (input.held("left") || input.held("right")) && !snap.player.airborne && snap.phase === "fighting";
  if (moving && walkCueCooldown <= 0) {
    walkCueCooldown = 0.42;
    void audio.cue("mechWalkHeavySfx");
  }

  const stats = bout.stats();
  updateArenaHud(arenaHud, {
    playerHpFraction: snap.player.hp / stats.player.hpMax,
    rivalHpFraction: snap.rival.hp / stats.rival.hpMax,
    playerGuardFraction: snap.player.guard / stats.player.guardMax,
    rivalGuardFraction: snap.rival.guard / stats.rival.guardMax,
    playerPowerFraction: snap.player.power / stats.player.powerMax,
    rivalPowerFraction: snap.rival.power / stats.rival.powerMax,
    preset: bout.preset(),
    boutIndex,
    phase: snap.phase
  });

  lastBoutState = snap.phase;
  lastOutcomeHash = bout.outcomeHash();
  publishEvidence(snap);
});

publishEvidence();

export {};
