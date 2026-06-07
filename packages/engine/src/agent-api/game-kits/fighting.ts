import {
  createCombatWorld,
  createGameCameraDirector,
  createGameEffects,
  createGameInput,
  createGameKinematicBody,
  type GameCombatMove,
  type GameCombatWorld,
  type GameInputController,
  type GameKinematicBody,
  type GameVec3
} from "../GameRuntime";
import type { AuraRuntimeNodeSpec, AuraSceneNode } from "../index";

export interface FightingControls {
  readonly actions: Record<string, readonly string[]>;
  readonly axes: Record<string, { readonly negative?: string; readonly positive?: string; readonly gamepadAxis?: number }>;
}

export interface FightingStageOptions {
  readonly id?: string;
  readonly width?: number;
  readonly floorY?: number;
  readonly depth?: number;
  readonly safeInset?: number;
  readonly palette?: {
    readonly floor?: string;
    readonly lane?: string;
    readonly aura?: string;
    readonly warning?: string;
    readonly skyline?: string;
    readonly fog?: string;
  };
}

export interface FightingStageSafeZone {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface FightingStageLayer {
  readonly id: string;
  readonly role: "foreground" | "combat-lane" | "midground" | "background" | "skyline" | "parallax";
  readonly parallax: number;
  readonly cameraSafe: boolean;
  readonly blocksFighters: boolean;
  readonly nodeIds: readonly string[];
}

export interface FightingStageEvidence {
  readonly stageId: string;
  readonly layerCount: number;
  readonly safeZone: FightingStageSafeZone;
  readonly combatBounds: FightingStageSafeZone;
  readonly collisionBounds: FightingStageSafeZone;
  readonly noBlockingGeometry: boolean;
  readonly lightRigCount: number;
  readonly screenshotAcceptanceHints: readonly string[];
}

export interface FightingStageBuild {
  readonly kind: "aura-fighting-stage";
  readonly id: string;
  readonly nodes: readonly AuraSceneNode[];
  readonly layers: readonly FightingStageLayer[];
  readonly safeZone: FightingStageSafeZone;
  readonly combatBounds: FightingStageSafeZone;
  readonly evidence: FightingStageEvidence;
}

export type FightingStagePresetName = "training-grid" | "rooftop-city" | "neon-dojo" | "industrial-arena";

export interface FightingStageValidationIssue {
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly path?: string | undefined;
}

export const fightingStagePresets: Record<FightingStagePresetName, FightingStageOptions> = {
  "training-grid": {
    id: "training-grid",
    width: 6.8,
    depth: 2.45,
    safeInset: 0.42,
    palette: {
      floor: "#101923",
      lane: "#31e6b1",
      aura: "#5cff87",
      warning: "#ffb84d",
      skyline: "#123247",
      fog: "#0a261e"
    }
  },
  "rooftop-city": {
    id: "rooftop-city",
    width: 7.4,
    depth: 2.65,
    safeInset: 0.48,
    palette: {
      floor: "#121820",
      lane: "#68d8ff",
      aura: "#8af7ff",
      warning: "#ffd166",
      skyline: "#1d3557",
      fog: "#081421"
    }
  },
  "neon-dojo": {
    id: "neon-dojo",
    width: 6.9,
    depth: 2.5,
    safeInset: 0.44,
    palette: {
      floor: "#130b18",
      lane: "#ff5cbe",
      aura: "#32ffd2",
      warning: "#ffec70",
      skyline: "#2b1640",
      fog: "#10071c"
    }
  },
  "industrial-arena": {
    id: "industrial-arena",
    width: 7.1,
    depth: 2.75,
    safeInset: 0.5,
    palette: {
      floor: "#171b1c",
      lane: "#f28f3b",
      aura: "#f7c948",
      warning: "#ff5c5c",
      skyline: "#263238",
      fog: "#101515"
    }
  }
};

export function fightingStagePreset(name: FightingStagePresetName, overrides: FightingStageOptions = {}): FightingStageBuild {
  const preset = fightingStagePresets[name];
  return createFightingStage({
    ...preset,
    ...overrides,
    palette: {
      ...preset.palette,
      ...overrides.palette
    }
  });
}

export interface FightingGameKitOptions {
  readonly playerId?: string;
  readonly opponentId?: string;
  readonly autoListen?: boolean;
  readonly target?: EventTarget;
  readonly stage?: FightingStageOptions;
  readonly opponentAi?: boolean;
  readonly random?: () => number;
}

export type FightingActorState = "idle" | "walk" | "jump" | "dash" | "guard" | "light" | "heavy" | "special" | "hitstun";

export interface FightingGameSnapshot {
  readonly kind: "aura-fighting-game-kit";
  readonly player: ReturnType<GameKinematicBody["snapshot"]>;
  readonly opponent: ReturnType<GameKinematicBody["snapshot"]>;
  readonly combat: ReturnType<GameCombatWorld["snapshot"]>;
  readonly states: {
    readonly player: FightingActorState;
    readonly opponent: FightingActorState;
  };
}

export interface FightingDebugHitboxOverlayOptions {
  readonly enabled?: boolean;
}

export interface FightingDebugHitboxOverlayVolume {
  readonly id: string;
  readonly ownerId: string;
  readonly moveId: string;
  readonly active: boolean;
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: string;
}

export interface FightingDebugHitboxOverlay {
  readonly kind: "aura-fighting-debug-hitbox-overlay";
  readonly enabled: boolean;
  readonly normalPassVisible: false;
  readonly volumes: readonly FightingDebugHitboxOverlayVolume[];
}

export interface FightingGameKit {
  readonly kind: "aura-fighting-game-kit";
  readonly controls: FightingControls;
  readonly moves: Record<string, GameCombatMove>;
  readonly input: GameInputController;
  readonly bodies: {
    readonly player: GameKinematicBody;
    readonly opponent: GameKinematicBody;
  };
  readonly combat: ReturnType<typeof createCombatWorld>;
  readonly camera: ReturnType<typeof createGameCameraDirector>;
  readonly effects: ReturnType<typeof createGameEffects>;
  debugHitboxOverlay(options?: FightingDebugHitboxOverlayOptions): FightingDebugHitboxOverlay;
  update(dt: number): FightingGameSnapshot;
  snapshot(): FightingGameSnapshot;
}

export function fighterRuntimeNode(id: string, tags: readonly string[] = ["fighter"]): AuraRuntimeNodeSpec {
  return {
    id,
    mutable: true,
    tags
  };
}

export function defaultFightingControls(): FightingControls {
  return {
    actions: {
      moveLeft: ["KeyA", "ArrowLeft", "GamepadDPadLeft"],
      moveRight: ["KeyD", "ArrowRight", "GamepadDPadRight"],
      jump: ["KeyW", "ArrowUp", "Space", "GamepadA"],
      crouch: ["KeyS", "ArrowDown", "GamepadDPadDown"],
      dash: ["ShiftLeft", "ShiftRight", "GamepadRB"],
      guard: ["KeyK", "GamepadLB"],
      light: ["KeyJ", "GamepadX"],
      heavy: ["KeyI", "GamepadY"],
      special: ["KeyL", "GamepadB"],
      pause: ["Escape", "GamepadStart"]
    },
    axes: {
      moveX: { negative: "moveLeft", positive: "moveRight", gamepadAxis: 0 }
    }
  };
}

export function fightingDebugHitboxOverlay(
  snapshot: FightingGameSnapshot,
  options: FightingDebugHitboxOverlayOptions = {}
): FightingDebugHitboxOverlay {
  const enabled = options.enabled === true;
  return {
    kind: "aura-fighting-debug-hitbox-overlay",
    enabled,
    normalPassVisible: false,
    volumes: enabled
      ? snapshot.combat.activeAttacks.flatMap((attack) =>
          attack.hitboxes.map((box, index) => ({
            id: box.id ?? `${attack.moveId}-hitbox-${index}`,
            ownerId: attack.attackerId,
            moveId: attack.moveId,
            active: attack.active,
            offset: box.offset ?? [0, 0, 0],
            size: box.size,
            color: attack.active ? "#ef4444" : "#f97316"
          }))
        )
      : []
  };
}

export function defaultFightingMoves(): Record<string, GameCombatMove> {
  return {
    light: {
      id: "light",
      name: "Light Strike",
      damage: 6,
      guardDamage: 3,
      hitStop: 0.045,
      hitStun: 10,
      blockStun: 6,
      recovery: 8,
      activeFrames: [3, 6],
      durationFrames: 16,
      knockback: [0.12, 0.02, 0],
      hitboxes: [{ id: "light-palm", offset: [0.52, 0.94, 0], size: [0.5, 0.38, 0.5] }]
    },
    heavy: {
      id: "heavy",
      name: "Heavy Breaker",
      damage: 12,
      guardDamage: 8,
      hitStop: 0.07,
      hitStun: 16,
      blockStun: 10,
      recovery: 14,
      activeFrames: [6, 10],
      durationFrames: 28,
      knockback: [0.28, 0.05, 0],
      hitboxes: [{ id: "heavy-arc", offset: [0.66, 0.98, 0], size: [0.68, 0.5, 0.56] }]
    },
    special: {
      id: "aura-burst",
      name: "Aura Burst",
      damage: 18,
      guardDamage: 12,
      hitStop: 0.1,
      hitStun: 24,
      blockStun: 14,
      recovery: 22,
      activeFrames: [8, 18],
      durationFrames: 42,
      knockback: [0.46, 0.12, 0],
      hitboxes: [{ id: "aura-burst-wave", offset: [0.9, 0.9, 0], size: [1.25, 0.9, 0.72] }]
    },
    sweep: {
      id: "sweep",
      name: "Low Sweep",
      damage: 8,
      guardDamage: 5,
      hitStop: 0.05,
      hitStun: 18,
      recovery: 13,
      activeFrames: [5, 9],
      durationFrames: 24,
      knockback: [0.18, -0.02, 0],
      hitboxes: [{ id: "low-sweep", offset: [0.54, 0.35, 0], size: [0.7, 0.28, 0.52] }]
    }
  };
}

export function createFightingStage(options: FightingStageOptions = {}): FightingStageBuild {
  const id = options.id ?? "aura-training-grid";
  const width = options.width ?? 6.8;
  const depth = options.depth ?? 2.45;
  const floorY = options.floorY ?? -0.04;
  const safeInset = options.safeInset ?? 0.42;
  const palette = {
    floor: options.palette?.floor ?? "#101923",
    lane: options.palette?.lane ?? "#31e6b1",
    aura: options.palette?.aura ?? "#5cff87",
    warning: options.palette?.warning ?? "#ffb84d",
    skyline: options.palette?.skyline ?? "#123247",
    fog: options.palette?.fog ?? "#0a261e"
  };

  const safeZone: FightingStageSafeZone = {
    minX: -width / 2 + safeInset,
    maxX: width / 2 - safeInset,
    minY: 0,
    maxY: 2.8,
    minZ: -0.62,
    maxZ: 0.62
  };
  const combatBounds: FightingStageSafeZone = {
    minX: -width / 2,
    maxX: width / 2,
    minY: 0,
    maxY: 3.2,
    minZ: -0.72,
    maxZ: 0.72
  };

  const nodes: AuraSceneNode[] = [
    primitive("plane", "fighting foreground floor plane", [0, floorY, 0], [width, 1, depth], palette.floor),
    primitive("box", "left camera safe boundary marker", [-width / 2, 0.18, 0], [0.06, 0.42, 2.2], palette.warning, true),
    primitive("box", "right camera safe boundary marker", [width / 2, 0.18, 0], [0.06, 0.42, 2.2], palette.warning, true),
    primitive("box", "center aura combat lane", [0, 0.012, 0], [0.045, 0.035, 2.1], palette.aura, true),
    primitive("box", "player start lane glow", [-1.45, 0.018, 0.02], [0.78, 0.03, 0.12], palette.lane, true),
    primitive("box", "opponent start lane glow", [1.45, 0.018, 0.02], [0.78, 0.03, 0.12], palette.warning, true),
    primitive("box", "midground left light tower", [-2.85, 0.95, -0.92], [0.16, 1.8, 0.1], palette.lane, true),
    primitive("box", "midground right light tower", [2.85, 0.95, -0.92], [0.16, 1.8, 0.1], palette.warning, true),
    primitive("box", "background skyline slab low", [-1.8, 1.18, -1.22], [1.25, 1.65, 0.08], palette.skyline),
    primitive("box", "background skyline slab high", [0.1, 1.45, -1.28], [1.7, 2.1, 0.08], palette.skyline),
    primitive("box", "background skyline slab right", [2.05, 1.08, -1.18], [1.05, 1.45, 0.08], palette.skyline),
    primitive("plane", "far parallax fog card", [0, 1.24, -1.45], [width * 0.92, 1, 1.75], palette.fog),
    {
      kind: "label",
      label: "hud",
      name: "fighting runtime evidence hud",
      text: "Aura Clash runtime: input / bodies / hitboxes / camera / effects",
      position: [0, 2.25, 0],
      color: "#eafff7",
      background: "#06131a",
      size: 0.24,
      runtime: fighterRuntimeNode("fight-hud", ["hud", "runtime-evidence"])
    } as AuraSceneNode
  ];
  const layers: readonly FightingStageLayer[] = [
    {
      id: `${id}:foreground`,
      role: "foreground",
      parallax: 1,
      cameraSafe: true,
      blocksFighters: false,
      nodeIds: ["fighting foreground floor plane"]
    },
    {
      id: `${id}:combat-lane`,
      role: "combat-lane",
      parallax: 1,
      cameraSafe: true,
      blocksFighters: false,
      nodeIds: ["center aura combat lane", "player start lane glow", "opponent start lane glow"]
    },
    {
      id: `${id}:midground`,
      role: "midground",
      parallax: 0.72,
      cameraSafe: true,
      blocksFighters: false,
      nodeIds: ["midground left light tower", "midground right light tower"]
    },
    {
      id: `${id}:skyline`,
      role: "skyline",
      parallax: 0.38,
      cameraSafe: true,
      blocksFighters: false,
      nodeIds: ["background skyline slab low", "background skyline slab high", "background skyline slab right"]
    },
    {
      id: `${id}:parallax-fog`,
      role: "parallax",
      parallax: 0.18,
      cameraSafe: true,
      blocksFighters: false,
      nodeIds: ["far parallax fog card"]
    }
  ];
  return {
    kind: "aura-fighting-stage",
    id,
    nodes,
    layers,
    safeZone,
    combatBounds,
    evidence: {
      stageId: id,
      layerCount: layers.length,
      safeZone,
      combatBounds,
      collisionBounds: combatBounds,
      noBlockingGeometry: layers.every((layer) => !layer.blocksFighters),
      lightRigCount: 2,
      screenshotAcceptanceHints: [
        "fighters remain inside the safe zone at default camera framing",
        "midground and skyline nodes stay behind the combat lane",
        "foreground floor remains below fighter silhouettes",
        "parallax fog is background-only and must not occlude HUD or fighters"
      ]
    }
  };
}

export function fightingStageNodes(options: FightingStageOptions = {}): readonly AuraSceneNode[] {
  return createFightingStage(options).nodes;
}

export function validateFightingStage(stage: FightingStageBuild): readonly FightingStageValidationIssue[] {
  const issues: FightingStageValidationIssue[] = [];
  const requiredRoles: readonly FightingStageLayer["role"][] = ["foreground", "combat-lane", "midground", "skyline", "parallax"];
  for (const role of requiredRoles) {
    if (!stage.layers.some((layer) => layer.role === role)) {
      issues.push({
        severity: "error",
        code: "fighting-stage-layer-missing",
        message: `Fighting stage "${stage.id}" is missing a ${role} layer.`,
        path: `layers.${role}`
      });
    }
  }
  for (const layer of stage.layers) {
    if (layer.blocksFighters) {
      issues.push({
        severity: "error",
        code: "fighting-stage-blocking-layer",
        message: `Layer "${layer.id}" must not block fighter silhouettes at the default camera.`,
        path: `layers.${layer.id}.blocksFighters`
      });
    }
    if (!layer.cameraSafe) {
      issues.push({
        severity: "warning",
        code: "fighting-stage-layer-not-camera-safe",
        message: `Layer "${layer.id}" is not marked camera safe.`,
        path: `layers.${layer.id}.cameraSafe`
      });
    }
  }
  if (stage.safeZone.minX >= stage.safeZone.maxX || stage.safeZone.minY >= stage.safeZone.maxY || stage.safeZone.minZ >= stage.safeZone.maxZ) {
    issues.push({
      severity: "error",
      code: "fighting-stage-safe-zone-invalid",
      message: `Fighting stage "${stage.id}" safe zone must have positive x, y, and z area.`,
      path: "safeZone"
    });
  }
  if (
    stage.safeZone.minX < stage.combatBounds.minX ||
    stage.safeZone.maxX > stage.combatBounds.maxX ||
    stage.safeZone.minZ < stage.combatBounds.minZ ||
    stage.safeZone.maxZ > stage.combatBounds.maxZ
  ) {
    issues.push({
      severity: "error",
      code: "fighting-stage-safe-zone-outside-combat-bounds",
      message: `Fighting stage "${stage.id}" safe zone must stay inside combat bounds.`,
      path: "safeZone"
    });
  }
  return issues;
}

export function createFightingGameKit(options: FightingGameKitOptions = {}): FightingGameKit {
  const playerId = options.playerId ?? "player";
  const opponentId = options.opponentId ?? "opponent";
  const stageWidth = options.stage?.width ?? 6.8;
  const opponentAi = options.opponentAi ?? true;
  const random = () => (options.random ? options.random() : Math.random());
  const controls = defaultFightingControls();
  const moves = defaultFightingMoves();
  const input = createGameInput({
    actions: controls.actions,
    axes: controls.axes,
    target: options.target,
    autoListen: options.autoListen
  });
  const player = createGameKinematicBody({
    id: playerId,
    position: [-1.25, 0, 0],
    bounds: { minX: -stageWidth / 2, maxX: stageWidth / 2, minZ: -0.55, maxZ: 0.55 }
  });
  const opponent = createGameKinematicBody({
    id: opponentId,
    position: [1.25, 0, 0],
    bounds: { minX: -stageWidth / 2, maxX: stageWidth / 2, minZ: -0.55, maxZ: 0.55 }
  });
  const combat = createCombatWorld();
  const camera = createGameCameraDirector({ stageBounds: { minX: -stageWidth / 2, maxX: stageWidth / 2 } });
  const effects = createGameEffects();
  combat.addActor({ id: playerId, team: "p1", position: player.position, facing: 1 });
  combat.addActor({ id: opponentId, team: "p2", position: opponent.position, facing: -1, guarding: false });
  let playerState: FightingActorState = "idle";
  let opponentState: FightingActorState = "idle";

  const update = (dt: number): FightingGameSnapshot => {
    input.update(dt);
    const moveX = input.axis("moveX");
    let nextPlayerState: FightingActorState = Math.abs(moveX) > 0.01 ? "walk" : player.grounded ? "idle" : "jump";
    player.move(moveX, input.held("crouch") ? 1.4 : 2.7);
    if (input.pressed("jump") && player.jump()) nextPlayerState = "jump";
    if (input.held("guard")) nextPlayerState = "guard";
    if (input.pressed("dash")) {
      player.dash([player.facing, 0, 0], 7.6);
      nextPlayerState = "dash";
    }
    player.update(dt);

    const distance = player.position[0] - opponent.position[0];
    const aiAxis = opponentAi && Math.abs(distance) > 1.05 ? Math.sign(distance) : 0;
    let nextOpponentState: FightingActorState = Math.abs(aiAxis) > 0.01 ? "walk" : opponent.grounded ? "idle" : "jump";
    opponent.move(aiAxis, 1.7);
    opponent.update(dt);
    const opponentGuarding = opponentAi && Math.abs(distance) < 0.85 && random() < 0.025;
    if (opponentGuarding) nextOpponentState = "guard";

    combat.setActor(playerId, {
      position: player.position,
      facing: player.facing,
      guarding: input.held("guard")
    });
    combat.setActor(opponentId, {
      position: opponent.position,
      facing: opponent.position[0] > player.position[0] ? -1 : 1,
      guarding: opponentGuarding
    });
    if (input.pressed("light")) {
      combat.beginAttack(playerId, moves.light);
      nextPlayerState = "light";
    }
    if (input.pressed("heavy")) {
      combat.beginAttack(playerId, moves.heavy);
      nextPlayerState = "heavy";
    }
    if (input.pressed("special")) {
      combat.beginAttack(playerId, moves.special);
      effects.auraBurst(player.position, { ownerId: playerId });
      camera.special(player.position);
      nextPlayerState = "special";
    }
    if (opponentAi && Math.abs(distance) < 0.82 && random() < 0.018) {
      combat.beginAttack(opponentId, moves.light);
      nextOpponentState = "light";
    }
    const combatSnapshot = combat.update(dt);
    const playerActor = combatSnapshot.actors.find((actor) => actor.id === playerId);
    const opponentActor = combatSnapshot.actors.find((actor) => actor.id === opponentId);
    playerState = (playerActor?.stun ?? 0) > 0 ? "hitstun" : nextPlayerState;
    opponentState = (opponentActor?.stun ?? 0) > 0 ? "hitstun" : nextOpponentState;
    for (const event of combatSnapshot.events) {
      if (event.type === "hit") {
        effects.hitSpark(event.position, { ownerId: event.attackerId });
        camera.impact(1.1);
        const targetBody = event.targetId === playerId ? player : event.targetId === opponentId ? opponent : undefined;
        if (targetBody && event.knockback) targetBody.applyKnockback(event.knockback);
      }
      if (event.type === "blocked") {
        effects.blockSpark(event.position, { ownerId: event.attackerId });
        camera.impact(0.55);
      }
    }
    effects.update(dt);
    camera.update(dt, [{ id: playerId, position: player.position }, { id: opponentId, position: opponent.position }]);
    return snapshot();
  };
  const snapshot = (): FightingGameSnapshot => ({
    kind: "aura-fighting-game-kit",
    player: player.snapshot(),
    opponent: opponent.snapshot(),
    combat: combat.snapshot(),
    states: {
      player: playerState,
      opponent: opponentState
    }
  });
  return {
    kind: "aura-fighting-game-kit",
    controls,
    moves,
    input,
    bodies: { player, opponent },
    combat,
    camera,
    effects,
    debugHitboxOverlay: (debugOptions) => fightingDebugHitboxOverlay(snapshot(), debugOptions),
    update,
    snapshot
  };
}

export const fighting = {
  controls: defaultFightingControls,
  moves: defaultFightingMoves,
  runtimeNode: fighterRuntimeNode,
  stagePreset: fightingStagePreset,
  stagePresets: fightingStagePresets,
  stage: createFightingStage,
  validateStage: validateFightingStage,
  stageNodes: fightingStageNodes,
  createKit: createFightingGameKit
} as const;

function primitive(
  primitiveKind: "box" | "sphere" | "plane" | "cylinder" | "capsule" | "torus",
  name: string,
  position: GameVec3,
  scale: number | GameVec3,
  color: string,
  emissive = false
): AuraSceneNode {
  return {
    kind: "primitive",
    primitive: primitiveKind,
    name,
    position,
    scale,
    material: emissive
      ? { color, emissive: color, emissiveIntensity: 0.82, roughness: 0.25 }
      : { color, roughness: 0.62, metallic: 0.12 },
    castShadow: primitiveKind !== "plane",
    receiveShadow: true
  } as AuraSceneNode;
}
