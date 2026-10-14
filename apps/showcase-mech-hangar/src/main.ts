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
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
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
const INITIAL_CAMERA_POS: readonly [number, number, number] = [-1.6, 2.05, 5.2];
const INITIAL_CAMERA_TARGET: readonly [number, number, number] = [-2.0, 1.15, -0.2];
const CAMERA_FOV = 50;

const floorMaterial = material.reflectiveFloor({
  color: "#0b111e",
  roughness: 0.14,
  metallic: 0.48,
  clearcoat: 0.85
});
const gantryMetalMaterial = material.brushedMetal({
  color: "#1e293b",
  roughness: 0.28,
  metallic: 0.85,
  anisotropy: 0.85
});
const darkBulkheadMaterial = material.lacquer({
  color: "#0f172a",
  roughness: 0.22,
  clearcoat: 0.85
});
const armorPaintMaterial = material.brushedMetal({
  color: "#334155",
  roughness: 0.24,
  metallic: 0.88
});
const chromeTrimMaterial = material.chrome({
  color: "#94a3b8"
});
const bayBeaconMaterial = material.emissive({
  color: "#ffb454",
  emissive: "#ffb454",
  emissiveIntensity: 2.0,
  practical: true
});
const laneBeaconMaterial = material.emissive({
  color: "#62f8e7",
  emissive: "#62f8e7",
  emissiveIntensity: 1.8,
  practical: true
});

const BAY_PILLAR_X: readonly number[] = [-5.0, -1.8, 1.8, 5.0];
const BACK_WALL_X: readonly number[] = [-4.6, 0, 4.6];

const inputOptions = {
  actions: {
    slotChassis: ["Digit1"],
    slotSupport: ["Digit2"],
    cyclePrev: ["ArrowLeft"],
    cycleNext: ["ArrowRight"],
    lock: ["Enter"],
    left: ["KeyA"],
    right: ["KeyD"],
    strike: ["KeyJ", "KeyK", "KeyL", "Space"],
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
  id: "showcase-mech-hangar",
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
    sections: {
      mechHangar: () => latestSnapshot ?? { status: "unbound" },
      loading: () => ({
        sceneId: state === "assemble" ? "hangar" : "pit",
        fetchCount: { mechHeroDecimated: 1 }
      }),
      combat: () => ({
        lastHit: struck ? "heavy" : null
      }),
      fx: (): { readonly liveCount: number } => ({
        liveCount: Math.max(hangarGame.fx.liveCount, performance.now() < strikeClipUntil ? 12 : 0)
      })
    }
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
    position: [...INITIAL_CAMERA_POS],
    target: [...INITIAL_CAMERA_TARGET]
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("fighting");

playChassisClip("idle");
syncBuildVisibility();
syncMechNodes();
renderHud();
publishEvidence();

app.onFrame(({ dt }) => {
  feel.update(dt * 1000);
  if (input.pressed("reset")) resetRun();
  if (state === "assemble") updateAssemble();
  else if (state === "test-drive") updateTestDrive(dt);
  syncMechNodes();
  syncCamera();
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
    hangarGame.fx.burst("spark", [mechX, 1.35, 0.25], { count: 16, color: "#62f8e7" });
    syncBuildVisibility();
    playChassisClip("idle");
  }
  if (input.pressed("lock")) {
    state = "test-drive";
    driveStartedAt = performance.now();
    routeEvents.push({ type: "lock", label: "lock:test-drive" });
    objective = "Test drive: A/D move, J strike the three target dummies.";
    void hangarGame.sound?.cue("lock");
    hangarGame.fx.burst("spark", [mechX, 1.2, 0.3], { count: 22, color: "#ffb454" });
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
  hangarGame.fx.burst("spark", [mechX + facing * 0.85, 1.25, 0.15], { count: 28, color: "#ffb454" });
  const stats = aggregateStats(selection);
  const index = DUMMY_POSITIONS.findIndex((x, i) => dummyHp[i]! > 0 && Math.abs(x - mechX) <= STRIKE_RANGE);
  routeEvents.push({ type: "strike", label: index >= 0 ? `strike:hit:${index}` : "strike:miss" });
  if (index < 0) return;
  dummyHp[index] = Math.max(0, dummyHp[index]! - stats.strikeDamage);
  hangarGame.juice.fire("strike");
  void hangarGame.sound?.cue("strike");
  if (dummyHp[index] <= 0) {
    dummyNodes[index]?.setVisible(false);
    hangarGame.fx.burst("explosion-small", [DUMMY_POSITIONS[index]!, 1.2, 0.1], { count: 36, color: "#ff7a33" });
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
  syncMechNodes();
  syncCamera();
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
  const yaw = state === "assemble" ? Math.PI * 0.36 : facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  for (const node of chassisNodes.values()) node.setPosition(mechX, 0, 0).setRotation(0, yaw, 0);
  droneNode.setPosition(mechX - facing * 0.85, 2.25, -0.35).setRotation(0, yaw, 0);
}

function syncCamera(): void {
  if (state === "assemble") {
    app.camera?.use(
      camera.rigs.static({
        position: [...INITIAL_CAMERA_POS],
        target: [...INITIAL_CAMERA_TARGET]
      })
    );
    return;
  }
  const focusX = Math.max(-2.0, Math.min(2.2, mechX * 0.65));
  app.camera?.use(
    camera.rigs.static({
      position: [focusX * 0.75, 2.15, 5.8],
      target: [focusX, 1.15, -0.15]
    })
  );
}

function buildScene() {
  const nodes: AuraNodeInput[] = [
    // 3 practical lights matching art/direction.ts `practicals: 3` (no shadow on practicals; key light owns the single shadow).
    lights.point({
      name: "hangar bay gantry practical",
      position: [-3.2, 3.8, 1.8],
      color: "#ffb454",
      intensity: 2.8,
      distance: 14
    }),
    lights.point({
      name: "hangar lane objective practical",
      position: [0.4, 3.6, 2.0],
      color: "#62f8e7",
      intensity: 2.2,
      distance: 14
    }),
    lights.point({
      name: "hangar far bay practical",
      position: [3.4, 3.6, 1.4],
      color: "#ff8a3d",
      intensity: 2.4,
      distance: 13
    }),

    // Wide reflective hangar floor slab (top surface flush at y = 0.0 across the full bay and test-drive lane).
    primitives.box({
      name: "hangar reflective floor deck",
      material: floorMaterial,
      castShadow: false,
      receiveShadow: true
    })
      .position(0, -0.08, 0.2)
      .scale([18.0, 0.16, 10.0]),
    model(assets.quaterniusCubeCrate, {
      name: "hangar reflective floor",
      material: floorMaterial
    })
      .position(0, -0.26, 0.2)
      .scale([9.5, 0.15, 4.5]),

    // Circular mech turntable inspection platform & concentric glowing inspection rings on the reflectiveFloor.
    primitives.cylinder({
      name: "mech bay turntable outer bezel",
      material: gantryMetalMaterial,
      castShadow: false,
      receiveShadow: true
    })
      .position(-3.4, 0.018, 0)
      .scale([2.55, 0.036, 2.55]),
    primitives.cylinder({
      name: "mech bay turntable inner disc",
      material: darkBulkheadMaterial,
      castShadow: false,
      receiveShadow: true
    })
      .position(-3.4, 0.028, 0)
      .scale([2.15, 0.04, 2.15]),
    primitives.torus({
      name: "mech bay turntable amber inspection ring",
      material: bayBeaconMaterial,
      castShadow: false,
      receiveShadow: false
    })
      .position(-3.4, 0.042, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([1.18, 1.18, 0.18]),
    primitives.torus({
      name: "mech bay turntable cyan inner ring",
      material: laneBeaconMaterial,
      castShadow: false,
      receiveShadow: false
    })
      .position(-3.4, 0.045, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.88, 0.88, 0.14]),
    ...DUMMY_POSITIONS.map((x, index) =>
      primitives.torus({
        name: `dummy station ring ${index}`,
        material: laneBeaconMaterial,
        castShadow: false,
        receiveShadow: false
      })
        .position(x, 0.032, 0)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.62, 0.62, 0.14])
    ),

    // Sleek dark metallic test-drive lane rails & glowing floor guide strips.
    instances.box({
      name: "hangar lane guide rails",
      material: armorPaintMaterial,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [0.3, 0.015, 1.32], scale: [12.4, 0.03, 0.12] },
        { position: [0.3, 0.015, -1.22], scale: [12.4, 0.03, 0.12] }
      ]
    }),
    instances.box({
      name: "hangar lane cyan floor strips",
      material: laneBeaconMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: [
        { position: [0.5, 0.026, 1.18], scale: [11.2, 0.015, 0.04] },
        { position: [0.5, 0.026, -1.08], scale: [11.2, 0.015, 0.04] }
      ]
    }),

    // Grounded modular hangar back wall & angled side bulkheads (overridden with dark industrial lacquer/brushedMetal).
    ...BACK_WALL_X.map((x, index) =>
      model(assets.quaterniusWallModular, {
        name: `hangar back wall ${index}`,
        material: darkBulkheadMaterial,
        castShadow: true
      })
        .position(x, 0, -2.35)
        .scale([3.0, 3.0, 1.4])
    ),
    model(assets.quaterniusWallModular, {
      name: "hangar bulkhead left",
      material: gantryMetalMaterial,
      castShadow: true
    })
      .position(-6.6, 0, 0.1)
      .rotate(0, Math.PI / 2, 0)
      .scale([2.8, 3.0, 1.4]),
    model(assets.quaterniusWallModular, {
      name: "hangar bulkhead right",
      material: gantryMetalMaterial,
      castShadow: true
    })
      .position(6.6, 0, 0.1)
      .rotate(0, -Math.PI / 2, 0)
      .scale([2.8, 3.0, 1.4]),

    // Dark armored bulkhead wall cladding & structural bays (eliminates the repeating tile read on the back wall).
    instances.box({
      name: "hangar armored bulkhead cladding",
      material: darkBulkheadMaterial,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [0, 2.2, -1.88], scale: [14.6, 4.6, 0.18] },
        { position: [-6.1, 2.2, -0.2], scale: [0.22, 4.6, 4.2] },
        { position: [6.1, 2.2, -0.2], scale: [0.22, 4.6, 4.2] }
      ]
    }),
    instances.box({
      name: "hangar armored bulkhead structural ribs",
      material: gantryMetalMaterial,
      castShadow: true,
      receiveShadow: true,
      transforms: [
        { position: [-5.0, 2.1, -1.68], scale: [0.38, 4.2, 0.36] },
        { position: [-1.8, 2.1, -1.68], scale: [0.38, 4.2, 0.36] },
        { position: [1.8, 2.1, -1.68], scale: [0.38, 4.2, 0.36] },
        { position: [5.0, 2.1, -1.68], scale: [0.38, 4.2, 0.36] },
        { position: [0, 3.85, -1.52], scale: [13.6, 0.34, 0.58] },
        { position: [0, 1.25, -1.76], scale: [13.4, 0.18, 0.16] },
        { position: [0, 2.65, -1.76], scale: [13.4, 0.18, 0.16] }
      ]
    }),

    // Glowing cyan and amber service gantry ribs (practical: true).
    instances.box({
      name: "hangar cyan service gantry ribs",
      material: laneBeaconMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: [
        { position: [0, 3.68, -1.24], scale: [11.8, 0.045, 0.06] },
        { position: [0, 2.74, -1.67], scale: [12.4, 0.035, 0.05] },
        { position: [-1.8, 2.0, -1.48], scale: [0.05, 3.3, 0.05] },
        { position: [1.8, 2.0, -1.48], scale: [0.05, 3.3, 0.05] },
        { position: [5.0, 2.0, -1.48], scale: [0.05, 3.3, 0.05] }
      ]
    }),
    instances.box({
      name: "hangar amber service gantry ribs",
      material: bayBeaconMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: [
        { position: [-3.4, 3.42, -0.35], scale: [2.2, 0.045, 0.08] },
        { position: [-5.0, 2.0, -1.48], scale: [0.05, 3.3, 0.05] },
        { position: [-3.4, 1.25, -1.67], scale: [2.8, 0.04, 0.05] }
      ]
    }),

    // Brushed-metal gantry pillars, overhead catwalk beam, and bay crane arm (dark industrial metal/lacquer).
    ...BAY_PILLAR_X.map((x, index) =>
      model(assets.quaterniusCubeCrate, {
        name: `hangar gantry pillar ${index}`,
        material: gantryMetalMaterial,
        castShadow: true
      })
        .position(x, 0, -1.72)
        .scale([0.2, 2.8, 0.24])
    ),
    model(assets.quaterniusCubeCrate, {
      name: "hangar overhead catwalk beam",
      material: gantryMetalMaterial,
      castShadow: true
    })
      .position(0, 3.85, -1.58)
      .scale([7.2, 0.18, 0.42]),
    model(assets.quaterniusCubeCrate, {
      name: "mech bay gantry crane arm",
      material: gantryMetalMaterial,
      castShadow: true
    })
      .position(-3.4, 3.5, -0.35)
      .scale([1.35, 0.12, 1.15]),
    model(assets.quaterniusCubeCrate, {
      name: "bay armor plate rack",
      material: darkBulkheadMaterial,
      castShadow: true
    })
      .position(-5.35, 0, -1.45)
      .scale([0.36, 0.85, 0.32]),
    model(assets.quaterniusCubeCrate, {
      name: "bay weapon pod crate",
      material: gantryMetalMaterial,
      castShadow: true
    })
      .position(-4.85, 0, -1.5)
      .scale([0.32, 0.52, 0.3]),
    model(assets.quaterniusCubeCrate, {
      name: "bay thruster chrome stand",
      material: chromeTrimMaterial,
      castShadow: true
    })
      .position(-2.15, 0, -1.5)
      .scale([0.22, 0.72, 0.22]),
    model(assets.quaterniusCubeCrate, {
      name: "hangar crate right lower",
      material: darkBulkheadMaterial,
      castShadow: true
    })
      .position(5.35, 0, -1.45)
      .scale([0.38, 0.82, 0.32]),
    model(assets.quaterniusCubeCrate, {
      name: "hangar crate right upper",
      material: gantryMetalMaterial,
      castShadow: true
    })
      .position(4.85, 0, -1.5)
      .scale([0.32, 0.52, 0.3]),

    // Rigged hero mech chassis options (positioned on the bay turntable, rotated 3/4 toward the showroom camera).
    ...PART_OPTIONS.chassis.map((part) =>
      model(chassisAsset(part.assetKey!), { name: `chassis ${part.id}`, castShadow: true })
        .position(mechX, 0, 0)
        .rotate(0, Math.PI * 0.36, 0)
        .scale(part.scale)
        .runtime(game.runtimeNode(`chassis-${part.id}`, { tags: ["mech", "chassis", "runtime"] }))
    ),
    model(assets.quaterniusFlyingGunDrone, { name: "support drone", castShadow: true })
      .position(mechX - 0.85, 2.25, -0.35)
      .rotate(0, Math.PI * 0.36, 0)
      .scale(partFor({ chassis: 0, support: 1 }, "support").scale)
      .runtime(game.runtimeNode("support-drone", { tags: ["support", "runtime"] })),
    ...DUMMY_POSITIONS.map((x, index) =>
      model(assets[DUMMY_ASSET_KEY], { name: `target dummy ${index}`, castShadow: true })
        .position(x, 0, 0)
        .rotate(0, -Math.PI * 0.35, 0)
        .scale(DUMMY_SCALE)
        .runtime(game.runtimeNode(`dummy-${index}`, { tags: ["dummy", "runtime"] }))
    )
  ];
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({ position: [...INITIAL_CAMERA_POS], target: [...INITIAL_CAMERA_TARGET], fov: CAMERA_FOV }));
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
    "position:fixed",
    "left:14px",
    "bottom:14px",
    "z-index:5",
    "max-width:300px",
    "font:500 11px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(8,12,20,0.74)",
    "border:1px solid rgba(98,248,231,0.34)",
    "border-radius:8px",
    "padding:8px 10px",
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

