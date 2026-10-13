// Mech Hangar — rebuilt single-path. Every URL boots this module; the
// former legacy/v2 dispatcher, gameplay shims and MH-2M parts catalog are
// deleted. The honest loop is assemble -> test-drive checklist -> rating:
// cycle a rigged chassis GLB and an optional support drone (the only
// slots backed by real typed assets — see src/parts.ts), lock the build,
// drive the mech down the hangar lane, and strike three target dummies.
// There is no rival bout: no admitted modular mech-part set exists to
// build one from, so none is faked.
import {
  camera,
  game,
  gameFeel,
  looks,
  material,
  model,
  scene,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import {
  aggregateStats,
  ARENA_MAX_X,
  ARENA_MIN_X,
  cycleIndex,
  DEFAULT_BUILD,
  DUMMY_ASSET_KEY,
  DUMMY_HP,
  DUMMY_POSITIONS,
  DUMMY_SCALE,
  MECH_SLOTS,
  PART_OPTIONS,
  partFor,
  ratingFor,
  STRIKE_RANGE,
  type BuildSelection,
  type MechSlot,
  type Rating
} from "./parts";

declare global {
  interface Window {
    __aura3dGameSnapshot?: MechHangarEvidence;
  }
}

type HangarState = "assemble" | "test-drive" | "rated";

interface MechHangarEvidence {
  readonly framed: boolean;
  readonly state: HangarState;
  readonly attachedParts: Readonly<Record<MechSlot, string>>;
  readonly stats: ReturnType<typeof aggregateStats>;
  readonly mech: { readonly x: number; readonly y: number; readonly z: number; readonly chassis: string };
  readonly checklist: { readonly moved: boolean; readonly struck: boolean; readonly dummiesDown: number; readonly dummiesTotal: number };
  readonly rating: Rating | null;
  readonly elapsedSeconds: number;
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly drawCalls: number;
  readonly evidence: unknown;
}

const LOOK_ID = "interior-industrial" as const;
const inputOptions = {
  actions: {
    slotChassis: ["Digit1"],
    slotSupport: ["Digit2"],
    cyclePrev: ["ArrowLeft"],
    cycleNext: ["ArrowRight"],
    lock: ["Enter"],
    left: ["KeyA"],
    right: ["KeyD"],
    strike: ["KeyJ", "Space"],
    reset: ["KeyR"]
  },
  bufferMs: 100
} as const;

const routeEvents = game.eventLog({ label: "mech hangar events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:dummies", label: "dummies down", source: "app-state", valuePath: "appState.dummiesDown", format: "number", a11yLabel: "dummies down" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: MechHangarEvidence | undefined;
let state: HangarState = "assemble";
let selection: BuildSelection = { ...DEFAULT_BUILD };
let activeSlot: MechSlot = "chassis";
let mechX = -3.4;
let facing = 1;
let moved = false;
let struck = false;
let driveStartedAt: number | null = null;
let elapsedSeconds = 0;
let rating: Rating | null = null;
let strikeClipUntil = 0;
let objective = "Assemble: 1 chassis, 2 support, arrows cycle part, Enter locks the build.";
const dummyHp = DUMMY_POSITIONS.map(() => DUMMY_HP);

const hangarGame = createGame({
  id: "mech-hangar",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "arcade-neon",
    widgets: [
      { id: "dummies", kind: "score", anchor: "top-left", label: "DUMMIES" },
      { id: "rating", kind: "score", anchor: "top-right", label: "RATING" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", dash: "cycleNext", jump: "lock", attack: "strike" }
  },
  sound: {
    cues: {
      cycle: { id: "cycle", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.35 },
      lock: { id: "lock", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.6 },
      strike: { id: "strike", asset: { url: sfxUrl("impact.metal.medium.00") }, volume: 0.7 },
      "dummy-down": { id: "dummy-down", asset: { url: sfxUrl("impact.metal.heavy.00") }, volume: 0.8 },
      rated: { id: "rated", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 }
    }
  },
  juice: {
    strike: { hitStop: 0.03, shake: 0.2, rumble: { strong: 0.4, ms: 120 } },
    "dummy-down": { flash: { color: "#ffb454", peak: 0.22, ms: 240 }, rumble: { weak: 0.5, ms: 200 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { mechHangar: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = hangarGame.app;
const maybeInput = hangarGame.input;
if (!maybeInput) throw new Error("mech-hangar failed to create runtime-owned input.");
const input = maybeInput;
hangarGame.start();

const chassisNodes = new Map<string, AuraRuntimeNodeHandle>(
  PART_OPTIONS.chassis.map((part) => [part.id, app.nodes.require(`chassis-${part.id}`)])
);
const droneNode = app.nodes.require("support-drone");
const dummyNodes = DUMMY_POSITIONS.map((_, index) => app.nodes.require(`dummy-${index}`));
const hudRoot = createHud();

app.camera?.use(
  camera.rigs.static({
    position: [0, 2.2, 7],
    target: [0, 1, 0]
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("fighting");

playChassisClip("idle");
syncBuildVisibility();
renderHud();
publishEvidence();

app.onFrame(({ dt }) => {
  feel.update(dt * 1000);
  if (input.pressed("reset")) resetRun();
  if (state === "assemble") updateAssemble();
  else if (state === "test-drive") updateTestDrive(dt);
  syncMechNodes();
  renderHud();
  publishEvidence();
});

function updateAssemble(): void {
  if (input.pressed("slotChassis")) activeSlot = "chassis";
  if (input.pressed("slotSupport")) activeSlot = "support";
  const delta = input.pressed("cycleNext") ? 1 : input.pressed("cyclePrev") ? -1 : 0;
  if (delta !== 0) {
    const count = PART_OPTIONS[activeSlot].length;
    selection = { ...selection, [activeSlot]: cycleIndex(selection[activeSlot], delta, count) };
    routeEvents.push({ type: "attach", label: `attach:${activeSlot}:${partFor(selection, activeSlot).id}` });
    objective = `${activeSlot} attached: ${partFor(selection, activeSlot).displayName}. Enter locks the build.`;
    void hangarGame.sound?.cue("cycle");
    syncBuildVisibility();
    playChassisClip("idle");
  }
  if (input.pressed("lock")) {
    state = "test-drive";
    driveStartedAt = performance.now();
    routeEvents.push({ type: "lock", label: "lock:test-drive" });
    objective = "Test drive: A/D move, J strike the three target dummies.";
    void hangarGame.sound?.cue("lock");
  }
}

function updateTestDrive(dt: number): void {
  const stats = aggregateStats(selection);
  const dir = (input.held("right") || input.held("cycleNext") ? 1 : 0) - (input.held("left") || input.held("cyclePrev") ? 1 : 0);
  if (dir !== 0) {
    mechX = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, mechX + dir * stats.moveSpeed * Math.min(dt, 0.05)));
    facing = dir;
    if (!moved) {
      moved = true;
      routeEvents.push({ type: "move", label: "move:first" });
    }
    playChassisClip("walk");
  } else if (performance.now() >= strikeClipUntil) {
    playChassisClip("idle");
  }
  if (input.pressed("strike")) strike();
  if (driveStartedAt !== null) elapsedSeconds = Math.round(((performance.now() - driveStartedAt) / 1000) * 10) / 10;
  if (dummyHp.every((hp) => hp <= 0)) {
    state = "rated";
    rating = ratingFor(elapsedSeconds);
    routeEvents.push({ type: "rated", label: `rated:${rating}` });
    objective = `Test drive complete. Rating ${rating} in ${elapsedSeconds}s. Press R to rebuild.`;
    void hangarGame.sound?.cue("rated");
  }
}

function strike(): void {
  struck = true;
  strikeClipUntil = performance.now() + 450;
  playChassisClip("strike");
  const stats = aggregateStats(selection);
  const index = DUMMY_POSITIONS.findIndex((x, i) => dummyHp[i]! > 0 && Math.abs(x - mechX) <= STRIKE_RANGE);
  routeEvents.push({ type: "strike", label: index >= 0 ? `strike:hit:${index}` : "strike:miss" });
  if (index < 0) return;
  dummyHp[index] = Math.max(0, dummyHp[index]! - stats.strikeDamage);
  hangarGame.juice.fire("strike");
  void hangarGame.sound?.cue("strike");
  if (dummyHp[index] <= 0) {
    dummyNodes[index]?.setVisible(false);
    hangarGame.juice.fire("dummy-down");
    void hangarGame.sound?.cue("dummy-down");
    routeEvents.push({ type: "dummy-down", label: `dummy-down:${index}`, severity: "success" });
    objective = `Dummy ${index + 1} down. ${dummyHp.filter((hp) => hp <= 0).length}/${DUMMY_POSITIONS.length} cleared.`;
  }
}

function resetRun(): void {
  state = "assemble";
  mechX = -3.4;
  facing = 1;
  moved = false;
  struck = false;
  driveStartedAt = null;
  elapsedSeconds = 0;
  rating = null;
  for (let i = 0; i < dummyHp.length; i += 1) dummyHp[i] = DUMMY_HP;
  dummyNodes.forEach((node) => node.setVisible(true));
  routeEvents.push({ type: "reset", label: "reset" });
  objective = "Assemble: 1 chassis, 2 support, arrows cycle part, Enter locks the build.";
  syncBuildVisibility();
  playChassisClip("idle");
}

function playChassisClip(kind: "idle" | "walk" | "strike"): void {
  const chassis = partFor(selection, "chassis");
  if (!chassis.clips) return;
  chassisNodes.get(chassis.id)?.play(chassis.clips[kind]);
}

function syncBuildVisibility(): void {
  const chassis = partFor(selection, "chassis");
  for (const [id, node] of chassisNodes) node.setVisible(id === chassis.id);
  droneNode.setVisible(partFor(selection, "support").assetKey !== null);
}

function syncMechNodes(): void {
  const yaw = facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  for (const node of chassisNodes.values()) node.setPosition(mechX, 0, 0).setRotation(0, yaw, 0);
  droneNode.setPosition(mechX - facing * 0.9, 2.1, -0.4).setRotation(0, yaw, 0);
}

function buildScene() {
  const nodes: AuraNodeInput[] = [
    model(assets.quaterniusWallModular, { name: "hangar back wall", castShadow: true })
      .position(0, 1.6, -1.6)
      .scale([3.2, 1.6, 1]),
    model(assets.quaterniusCubeCrate, {
      name: "hangar floor",
      material: material.pbr({ color: "#232c38", roughness: 0.35, metalness: 0.5 })
    })
      .position(0, -0.55, 0.4)
      .scale([2.6, 0.28, 1.1]),
    model(assets.quaterniusCubeCrate, { name: "hangar crate left" })
      .position(-4.6, 0.35, -0.9)
      .scale(0.36),
    model(assets.quaterniusCubeCrate, { name: "hangar crate right" })
      .position(4.6, 0.35, -0.9)
      .scale(0.36),
    ...PART_OPTIONS.chassis.map((part) =>
      model(chassisAsset(part.assetKey!), { name: `chassis ${part.id}`, castShadow: true })
        .position(mechX, 0, 0)
        .scale(part.scale)
        .runtime(game.runtimeNode(`chassis-${part.id}`, { tags: ["mech", "chassis", "runtime"] }))
    ),
    model(assets.quaterniusFlyingGunDrone, { name: "support drone", castShadow: true })
      .position(mechX - 0.9, 2.1, -0.4)
      .scale(partFor({ chassis: 0, support: 1 }, "support").scale)
      .runtime(game.runtimeNode("support-drone", { tags: ["support", "runtime"] })),
    ...DUMMY_POSITIONS.map((x, index) =>
      model(assets[DUMMY_ASSET_KEY], { name: `target dummy ${index}`, castShadow: true })
        .position(x, 0, 0)
        .scale(DUMMY_SCALE)
        .runtime(game.runtimeNode(`dummy-${index}`, { tags: ["dummy", "runtime"] }))
    )
  ];
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({ position: [0, 2.2, 7], target: [0, 1, 0], fov: 50 }));
}

function chassisAsset(assetKey: string) {
  switch (assetKey) {
    case "quaterniusMech":
      return assets.quaterniusMech;
    case "quaterniusRobotEnemyLarge":
      return assets.quaterniusRobotEnemyLarge;
    case "quaterniusRobotEnemy":
      return assets.quaterniusRobotEnemy;
    default:
      throw new Error(`mech-hangar: unknown chassis asset ${assetKey}`);
  }
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "mech-hangar-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:330px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(8,12,20,0.72)",
    "border:1px solid rgba(98,248,231,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  const stats = aggregateStats(selection);
  const down = dummyHp.filter((hp) => hp <= 0).length;
  hangarGame.hud.set("dummies", down);
  hangarGame.hud.set("rating", rating ?? "--");
  hangarGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Mech Hangar</strong>`,
    `<div>State ${state} | Chassis ${partFor(selection, "chassis").displayName} | Support ${partFor(selection, "support").displayName}</div>`,
    `<div>Speed ${stats.speed} (${stats.moveSpeed} m/s) | Power ${stats.power} (${stats.strikeDamage} dmg) | Dummies ${down}/${DUMMY_POSITIONS.length}${rating ? ` | Rating ${rating}` : ""}</div>`,
    `<div>${objective}</div>`,
    `<div>Assemble 1/2 + arrows, Enter lock. Drive A/D, J strike, R reset.</div>`
  ].join("");
}

function publishEvidence(): void {
  const stats = aggregateStats(selection);
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      dummiesDown: dummyHp.filter((hp) => hp <= 0).length,
      objective,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });
  const diagnostics = app.diagnostics();
  const snapshot: MechHangarEvidence = {
    framed: diagnostics.drawCalls > 0,
    state,
    attachedParts: {
      chassis: partFor(selection, "chassis").id,
      support: partFor(selection, "support").id
    },
    stats,
    mech: { x: Math.round(mechX * 1000) / 1000, y: 0, z: 0, chassis: partFor(selection, "chassis").id },
    checklist: {
      moved,
      struck,
      dummiesDown: dummyHp.filter((hp) => hp <= 0).length,
      dummiesTotal: DUMMY_POSITIONS.length
    },
    rating,
    elapsedSeconds,
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    look: { id: LOOK_ID, category: "interior" },
    drawCalls: diagnostics.drawCalls,
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}
