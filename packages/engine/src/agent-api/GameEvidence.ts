import type {
  GameCameraDirector,
  GameCombatWorld,
  GameEffectsController,
  GameAccessibilitySource,
  GameHudBinding,
  GameInputController,
  GameKinematicBody,
  GameRuntimeSubsystemOwnership
} from "./GameRuntime";

export interface GameRuntimeEvidenceApp {
  readonly runtime?: {
    readonly frame: number;
    readonly time: number;
    readonly paused: boolean;
    readonly fixedDt?: number;
    readonly alpha?: number;
  };
  readonly nodes?: {
    ids(): readonly string[];
    all?(): readonly unknown[];
  };
}

export interface GameRuntimeEvidenceOptions {
  readonly input?: GameInputController;
  readonly bodies?: readonly GameKinematicBody[] | Record<string, GameKinematicBody>;
  readonly combat?: GameCombatWorld;
  readonly effects?: GameEffectsController;
  readonly camera?: GameCameraDirector;
  readonly animation?: {
    readonly controllers?: number;
    readonly activeClips?: readonly string[];
    readonly eventCount?: number;
  };
  readonly assets?: {
    readonly typedAssets?: number;
    readonly missingAssets?: readonly string[];
  };
  readonly stage?: {
    readonly id?: string;
    readonly safeZones?: boolean;
    readonly bounds?: unknown;
    readonly warnings?: readonly string[];
  };
  readonly hud?: readonly GameHudBinding[];
  readonly accessibility?: readonly GameAccessibilitySource[];
  readonly ownership?: readonly GameRuntimeSubsystemOwnership[];
  readonly source?: {
    readonly mode?: "mounted-runtime" | "scene-source";
    readonly expectsGame?: boolean;
    readonly label?: string;
  };
}

export interface GameRuntimeSourceEvidence {
  readonly kind: "aura-game-runtime-source-evidence";
  readonly mode: "mounted-runtime" | "scene-source";
  readonly expectsGame: boolean;
  readonly label?: string;
  readonly aura3dOwned: readonly string[];
  readonly appOwned: readonly string[];
  readonly shared: readonly string[];
}

export interface GameRuntimeEvidence {
  readonly kind: "aura-game-runtime-evidence";
  readonly source: GameRuntimeSourceEvidence;
  readonly ownership: readonly GameRuntimeSubsystemOwnership[];
  readonly loop: {
    readonly frame: number;
    readonly time: number;
    readonly fixedDt?: number;
    readonly alpha?: number;
    readonly paused: boolean;
  };
  readonly runtimeNodes: {
    readonly count: number;
    readonly ids: readonly string[];
    readonly debugLabels: Record<string, string>;
    readonly runtimeUpdatesReconstructScene: false;
    readonly sceneReconstructionRequired: false;
  };
  readonly systems: {
    readonly mutableNodes: boolean;
    readonly frameLoop: boolean;
    readonly inputPlan: boolean;
    readonly physicsPlan: boolean;
    readonly animationPlan: boolean;
    readonly effectsPlan: boolean;
    readonly cameraPlan: boolean;
    readonly collisionPlan: boolean;
    readonly stagePlan: boolean;
  };
  readonly input: {
    readonly configured: boolean;
    readonly actions: readonly string[];
    readonly axes: readonly string[];
    readonly activeBindings: readonly string[];
    readonly frame: number;
  };
  readonly physics: {
    readonly kinematicBodies: number;
    readonly groundedBodies: number;
  };
  readonly collision: {
    readonly combatWorld: boolean;
    readonly actors: number;
    readonly activeAttacks: number;
    readonly events: number;
  };
  readonly animation: {
    readonly controllers: number;
    readonly activeClips: readonly string[];
    readonly eventCount: number;
  };
  readonly effects: {
    readonly active: number;
    readonly spawned: number;
    readonly pooled: number;
  };
  readonly camera: {
    readonly active: boolean;
    readonly fov?: number;
    readonly zoom?: number;
    readonly shake?: number;
    readonly reducedMotion?: boolean;
  };
  readonly assets: {
    readonly typedAssets: number;
    readonly missingAssets: readonly string[];
  };
  readonly stage: {
    readonly id?: string;
    readonly safeZones: boolean;
    readonly bounds?: unknown;
    readonly warnings: readonly string[];
  };
  readonly hud: {
    readonly bindings: number;
    readonly kinds: readonly GameHudBinding["binding"][];
    readonly targetIds: readonly string[];
    readonly debugToggles: number;
    readonly interactive: number;
    readonly warnings: readonly string[];
  };
  readonly accessibility: {
    readonly sources: number;
    readonly labels: number;
    readonly focusScopes: number;
    readonly reducedMotion: boolean;
    readonly reducedFlash: boolean;
    readonly highContrast: boolean;
    readonly pauseControls: boolean;
    readonly warnings: readonly string[];
  };
  readonly warnings: readonly string[];
}

function collectRuntimeNodeDebugLabels(
  ids: readonly string[],
  nodes: readonly unknown[] = []
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const value of nodes) {
    if (!value || typeof value !== "object") continue;
    const node = value as {
      readonly id?: unknown;
      readonly debugLabel?: unknown;
      readonly name?: unknown;
      readonly kind?: unknown;
    };
    if (typeof node.id !== "string") continue;
    if (typeof node.debugLabel === "string") labels[node.id] = node.debugLabel;
    else {
      const kind = typeof node.kind === "string" ? node.kind : "runtime";
      const name = typeof node.name === "string" && node.name ? `:${node.name}` : "";
      labels[node.id] = `${kind}${name}#${node.id}`;
    }
  }
  for (const id of ids) {
    if (!labels[id]) labels[id] = `runtime:${id}`;
  }
  return labels;
}

export function collectGameRuntimeEvidence(
  app: GameRuntimeEvidenceApp,
  options: GameRuntimeEvidenceOptions = {}
): GameRuntimeEvidence {
  const ids = app.nodes?.ids() ?? [];
  const nodeDebugLabels = collectRuntimeNodeDebugLabels(ids, app.nodes?.all?.());
  const inputSnapshot = options.input?.snapshot();
  const bodies = normalizeBodies(options.bodies);
  const combatSnapshot = options.combat?.snapshot();
  const effectsSnapshot = options.effects?.snapshot();
  const cameraSnapshot = options.camera?.snapshot();
  const sourceMode = options.source?.mode ?? "mounted-runtime";
  const expectsGame = options.source?.expectsGame ?? true;
  const hudBindings = options.hud ?? [];
  const accessibilitySources = options.accessibility ?? [];
  const ownership = collectSubsystemOwnership({
    ids,
    inputConfigured: Boolean(options.input),
    bodiesConfigured: bodies.length > 0,
    combatConfigured: Boolean(options.combat),
    effectsConfigured: Boolean(options.effects),
    cameraConfigured: Boolean(options.camera),
    animationConfigured: Boolean(options.animation),
    assetsConfigured: Boolean(options.assets),
    stageConfigured: Boolean(options.stage),
    hudConfigured: hudBindings.length > 0,
    accessibilityConfigured: accessibilitySources.length > 0,
    frameAdvanced: (app.runtime?.frame ?? 0) > 0,
    additional: options.ownership
  });
  const hudWarnings = collectHudWarnings(hudBindings, expectsGame);
  const accessibilityWarnings = collectAccessibilityWarnings(accessibilitySources, expectsGame);
  const warnings = [
    ...(ids.length === 0 && expectsGame ? ["No runtime nodes were registered. Add .runtime(game.runtimeNode(\"id\")) to mutable scene nodes."] : []),
    ...(app.runtime && app.runtime.frame <= 0 && sourceMode !== "scene-source" ? ["Frame loop has not advanced yet. Call app.step(dt) or resume the app before collecting runtime evidence."] : []),
    ...(options.stage?.warnings ?? []),
    ...hudWarnings,
    ...accessibilityWarnings,
    ...((options.assets?.missingAssets ?? []).map((asset) => `Missing typed asset: ${asset}`))
  ];
  return {
    kind: "aura-game-runtime-evidence",
    source: {
      kind: "aura-game-runtime-source-evidence",
      mode: sourceMode,
      expectsGame,
      label: options.source?.label,
      aura3dOwned: ownership.filter((entry) => entry.owner === "aura3d").map((entry) => entry.subsystem),
      appOwned: ownership.filter((entry) => entry.owner === "app").map((entry) => entry.subsystem),
      shared: ownership.filter((entry) => entry.owner === "shared").map((entry) => entry.subsystem)
    },
    ownership,
    loop: {
      frame: app.runtime?.frame ?? 0,
      time: app.runtime?.time ?? 0,
      fixedDt: app.runtime?.fixedDt,
      alpha: app.runtime?.alpha,
      paused: app.runtime?.paused ?? true
    },
    runtimeNodes: {
      count: ids.length,
      ids,
      debugLabels: nodeDebugLabels,
      runtimeUpdatesReconstructScene: false,
      sceneReconstructionRequired: false
    },
    systems: {
      mutableNodes: ids.length > 0,
      frameLoop: (app.runtime?.frame ?? 0) > 0,
      inputPlan: Boolean(options.input),
      physicsPlan: bodies.length > 0,
      animationPlan: Boolean(options.animation),
      effectsPlan: Boolean(options.effects),
      cameraPlan: Boolean(options.camera),
      collisionPlan: Boolean(options.combat),
      stagePlan: Boolean(options.stage)
    },
    input: {
      configured: Boolean(options.input),
      actions: Object.keys(options.input?.actions ?? {}),
      axes: Object.keys(options.input?.axes ?? {}),
      activeBindings: inputSnapshot?.activeBindings ?? [],
      frame: inputSnapshot?.frame ?? 0
    },
    physics: {
      kinematicBodies: bodies.length,
      groundedBodies: bodies.filter((body) => body.grounded).length
    },
    collision: {
      combatWorld: Boolean(options.combat),
      actors: combatSnapshot?.actors.length ?? 0,
      activeAttacks: combatSnapshot?.activeAttacks.length ?? 0,
      events: combatSnapshot?.events.length ?? 0
    },
    animation: {
      controllers: options.animation?.controllers ?? 0,
      activeClips: options.animation?.activeClips ?? [],
      eventCount: options.animation?.eventCount ?? 0
    },
    effects: {
      active: effectsSnapshot?.active ?? 0,
      spawned: effectsSnapshot?.spawned ?? 0,
      pooled: effectsSnapshot?.pooled ?? 0
    },
    camera: {
      active: Boolean(options.camera),
      fov: cameraSnapshot?.fov,
      zoom: cameraSnapshot?.zoom,
      shake: cameraSnapshot?.shake,
      reducedMotion: cameraSnapshot?.reducedMotion
    },
    assets: {
      typedAssets: options.assets?.typedAssets ?? 0,
      missingAssets: options.assets?.missingAssets ?? []
    },
    stage: {
      id: options.stage?.id,
      safeZones: options.stage?.safeZones ?? false,
      bounds: options.stage?.bounds,
      warnings: options.stage?.warnings ?? []
    },
    hud: {
      bindings: hudBindings.length,
      kinds: unique(hudBindings.map((binding) => binding.binding)),
      targetIds: unique(hudBindings.map((binding) => binding.targetId).filter((targetId): targetId is string => Boolean(targetId))),
      debugToggles: hudBindings.filter((binding) => binding.binding === "debug-toggle").length,
      interactive: hudBindings.filter((binding) => binding.interactive).length,
      warnings: hudWarnings
    },
    accessibility: {
      sources: accessibilitySources.length,
      labels: accessibilitySources.filter((source) => source.feature === "label").length,
      focusScopes: accessibilitySources.filter((source) => source.feature === "focus").length,
      reducedMotion: accessibilitySources.some((source) => source.feature === "reduced-motion"),
      reducedFlash: accessibilitySources.some((source) => source.feature === "reduced-flash"),
      highContrast: accessibilitySources.some((source) => source.feature === "high-contrast"),
      pauseControls: accessibilitySources.some((source) => source.feature === "pause-controls"),
      warnings: accessibilityWarnings
    },
    warnings
  };
}

function normalizeBodies(bodies: GameRuntimeEvidenceOptions["bodies"]): readonly GameKinematicBody[] {
  if (!bodies) return [];
  return Array.isArray(bodies) ? bodies : Object.values(bodies);
}

function collectSubsystemOwnership(options: {
  readonly ids: readonly string[];
  readonly inputConfigured: boolean;
  readonly bodiesConfigured: boolean;
  readonly combatConfigured: boolean;
  readonly effectsConfigured: boolean;
  readonly cameraConfigured: boolean;
  readonly animationConfigured: boolean;
  readonly assetsConfigured: boolean;
  readonly stageConfigured: boolean;
  readonly hudConfigured: boolean;
  readonly accessibilityConfigured: boolean;
  readonly frameAdvanced: boolean;
  readonly additional?: readonly GameRuntimeSubsystemOwnership[];
}): readonly GameRuntimeSubsystemOwnership[] {
  const defaults: GameRuntimeSubsystemOwnership[] = [
    {
      subsystem: "runtime-nodes",
      owner: "aura3d",
      configured: options.ids.length > 0,
      evidence: "Aura3D registers scene nodes marked with .runtime(game.runtimeNode(id)); app code mutates the returned handles."
    },
    {
      subsystem: "frame-loop",
      owner: "aura3d",
      configured: options.frameAdvanced,
      evidence: "Aura3D owns app.onFrame(), app.pause(), app.resume(), and app.step(); app code owns per-frame gameplay decisions."
    },
    {
      subsystem: "input",
      owner: "app",
      configured: options.inputConfigured,
      evidence: "App code declares action maps, axes, buffering, combos, and when input.update(dt) is called."
    },
    {
      subsystem: "kinematic-bodies",
      owner: "app",
      configured: options.bodiesConfigured,
      evidence: "App code owns gameplay body state and syncs body snapshots to Aura3D runtime node handles."
    },
    {
      subsystem: "combat",
      owner: "app",
      configured: options.combatConfigured,
      evidence: "App code owns actors, teams, hitboxes, move timing, damage, guard, meter, and combat event handling."
    },
    {
      subsystem: "effects",
      owner: "shared",
      configured: options.effectsConfigured,
      evidence: "Aura3D provides pooled effect helpers; app code decides when gameplay events spawn or suppress effects."
    },
    {
      subsystem: "camera",
      owner: "shared",
      configured: options.cameraConfigured,
      evidence: "Aura3D provides camera director math; app code supplies targets and applies camera state to the route."
    },
    {
      subsystem: "animation",
      owner: "shared",
      configured: options.animationConfigured,
      evidence: "Aura3D stores animation clips on runtime nodes; app code chooses clips, restart rules, and timing."
    },
    {
      subsystem: "assets",
      owner: "aura3d",
      configured: options.assetsConfigured,
      evidence: "Aura3D typed assets prove catalog/manifest provenance; app code imports typed assets instead of string ids."
    },
    {
      subsystem: "stage",
      owner: "shared",
      configured: options.stageConfigured,
      evidence: "Aura3D stage helpers can provide safe bounds; app code owns game-specific rules inside those bounds."
    },
    {
      subsystem: "hud",
      owner: "app",
      configured: options.hudConfigured,
      evidence: "App code owns DOM/text rendering; Aura3D source helpers type HUD bindings for evidence and diagnostics."
    },
    {
      subsystem: "accessibility",
      owner: "app",
      configured: options.accessibilityConfigured,
      evidence: "App code owns labels, focus, contrast, and pause UI; Aura3D helpers expose source evidence and reduced-motion/reduced-flash flags."
    }
  ];
  return [...defaults, ...(options.additional ?? [])];
}

function collectHudWarnings(bindings: readonly GameHudBinding[], expectsGame: boolean): readonly string[] {
  if (!expectsGame) return [];
  if (bindings.length === 0) return ["No HUD source bindings were supplied. Add game.hud helpers for health, meter, timer, combo, round, and debug toggles."];
  const required: readonly GameHudBinding["binding"][] = ["health", "meter", "timer", "combo", "round", "debug-toggle"];
  const present = new Set(bindings.map((binding) => binding.binding));
  return required
    .filter((binding) => !present.has(binding))
    .map((binding) => `Missing HUD ${binding} binding source evidence.`);
}

function collectAccessibilityWarnings(sources: readonly GameAccessibilitySource[], expectsGame: boolean): readonly string[] {
  if (!expectsGame) return [];
  if (sources.length === 0) return ["No accessibility source helpers were supplied. Add labels, focus, reduced-motion, reduced-flash, high-contrast, and pause-controls evidence."];
  const required: readonly GameAccessibilitySource["feature"][] = ["label", "focus", "reduced-motion", "reduced-flash", "high-contrast", "pause-controls"];
  const present = new Set(sources.map((source) => source.feature));
  return required
    .filter((feature) => !present.has(feature))
    .map((feature) => `Missing accessibility ${feature} source evidence.`);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort();
}
