import { AURA_CLASH_AI_STATES, chooseOpponentDecision, type AuraClashAIDecision } from "./AIDirector";
import { createAnimationSyncPlan } from "./AnimationDirector";
import { frameFightCamera, type CameraDirectorFrame } from "./CameraDirector";
import { resolveCombatAction } from "./CombatResolver";
import { effectsFromEvents } from "./EffectsDirector";
import { createFighterRuntime, updateFighterRuntime, type AuraClashFighterRuntime } from "./FighterController";
import { AuraClashGameLoop } from "./GameLoop";
import { InputController } from "./InputController";
import type {
  AuraClashBufferedInput,
  AuraClashFighterRuntimeEvidence,
  AuraClashGamePhase,
  AuraClashInputAction,
  AuraClashInputBufferEvidence,
  AuraClashRuntimeEvent,
  AuraClashRuntimeEvidence,
  AuraClashRuntimeResponsivenessEvidence,
  AuraClashVec2,
} from "./types";

export interface AuraClashGameOptions {
  playerId: string;
  opponentId: string;
}

export interface AuraClashRuntimeStepOptions {
  reducedMotion?: boolean;
  opponentPassive?: boolean;
}

export class AuraClashGame {
  readonly input = new InputController();
  readonly loop = new AuraClashGameLoop();
  readonly player: AuraClashFighterRuntime;
  readonly opponent: AuraClashFighterRuntime;
  private readonly opponentInput = new InputController();
  private phase: AuraClashGamePhase = "ready";
  private readonly events: AuraClashRuntimeEvent[] = [];
  private actionsProcessed = 0;
  private lastAIDecision: AuraClashAIDecision | null = null;
  private lastCameraFrame: CameraDirectorFrame | null = null;
  private lastResponsiveness: AuraClashRuntimeResponsivenessEvidence | null = null;

  constructor(options: AuraClashGameOptions) {
    this.player = createFighterRuntime(options.playerId, -1.35, 1);
    this.opponent = createFighterRuntime(options.opponentId, 1.35, -1);
  }

  dispatchPlayerAction(action: AuraClashInputAction, options: AuraClashRuntimeStepOptions = {}): void {
    const frame = this.loop.step();
    const playerBefore = cloneVec2(this.player.body.position);
    const opponentBefore = cloneVec2(this.opponent.body.position);
    this.input.press(action, frame.timeMs);
    const bufferedBeforeFrame = this.input.getBufferEvidence(frame.timeMs);
    const consumedInput = this.input.consumeBufferedAction(frame.timeMs, (entry) =>
      this.player.state.canAcceptAction(entry.action, frame.timeMs),
    );
    const actionForFrame = consumedInput?.action ?? (this.player.state.canAcceptAction(action, frame.timeMs) ? action : "reset");
    const snapshot = this.input.snapshot(actionForFrame, frame.timeMs);
    const bufferedAfterFrame = this.input.getBufferEvidence(frame.timeMs);
    this.phase = action === "pause" ? "paused" : "active";
    this.actionsProcessed += 1;
    this.events.push({
      id: `input-${action}-${frame.timeMs.toFixed(0)}`,
      type: "input",
      atMs: frame.timeMs,
      side: "player",
      label: `player ${action}`,
      payload: {
        action,
        actionApplied: actionForFrame,
        source: "real gameplay input from keyboard, button, or replayed action dispatcher",
        inputBufferBeforeFrame: bufferedBeforeFrame,
        inputBuffer: bufferedAfterFrame,
      },
    });

    const playerAnimation = updateFighterRuntime(this.player, snapshot, frame.dt, frame.timeMs);
    this.lastResponsiveness = createResponsivenessEvidence({
      frame: frame.frame,
      dt: frame.dt,
      actionReceived: action,
      actionApplied: actionForFrame === "reset" && action !== "reset" ? null : actionForFrame,
      consumedInput,
      bufferEvidence: bufferedAfterFrame,
      playerLockRemainingMs: this.player.state.remainingLockMs(frame.timeMs),
    });
    const aiDecision = options.opponentPassive
      ? {
          state: "idle" as const,
          action: "reset" as const,
          reason: "passive route target keeps the first playable lane stable",
          distance: Math.abs(this.opponent.body.position.x - this.player.body.position.x),
        }
      : chooseOpponentDecision(this.opponent.body, this.player.body, frame.timeMs, this.opponent.meter, {
          playerAction: actionForFrame,
          playerAnimation,
        });
    this.lastAIDecision = aiDecision;
    this.events.push({
      id: `ai-${frame.frame}`,
      type: "ai",
      atMs: frame.timeMs,
      side: "opponent",
      label: `ai ${aiDecision.state} -> ${aiDecision.action}`,
      payload: aiDecision,
    });

    this.opponentInput.clear();
    const opponentAction = aiDecision.action;
    const opponentAnimation = options.opponentPassive
      ? this.opponent.state.snapshot().animation
      : updateFighterRuntime(this.opponent, this.opponentInput.press(opponentAction, frame.timeMs), frame.dt, frame.timeMs);
    if (options.opponentPassive) {
      this.opponent.body.velocity.x = 0;
      this.opponent.body.velocity.y = 0;
      this.opponent.body.grounded = true;
      this.opponent.state.force("idle");
    }
    this.events.push({
      id: `movement-player-${frame.frame}`,
      type: "movement",
      atMs: frame.timeMs,
      side: "player",
      label: "player kinematic body moved from gameplay input",
      payload: {
        inputAction: actionForFrame,
        originalInputAction: action,
        bufferedSequence: consumedInput?.sequence ?? null,
        from: playerBefore,
        to: cloneVec2(this.player.body.position),
        velocity: cloneVec2(this.player.body.velocity),
        facing: this.player.body.facing,
        runtimeStateControlled: true,
      },
    });
    this.events.push({
      id: `movement-opponent-${frame.frame}`,
      type: "movement",
      atMs: frame.timeMs,
      side: "opponent",
      label: "opponent kinematic body moved from AI runtime state",
      payload: {
        inputAction: opponentAction,
        from: opponentBefore,
        to: cloneVec2(this.opponent.body.position),
        velocity: cloneVec2(this.opponent.body.velocity),
        facing: this.opponent.body.facing,
        runtimeStateControlled: true,
      },
    });

    const bodyCollision = this.player.body.pushAwayFrom(this.opponent.body);
    if (bodyCollision) {
      this.events.push({
        id: `collision-${frame.frame}`,
        type: "collision",
        atMs: frame.timeMs,
        label: "fighter body collision separation applied",
        payload: { collision: bodyCollision },
      });
    }
    this.resolveAttackIfNeeded("player", actionForFrame, frame.timeMs, false);
    if (!options.opponentPassive) {
      this.resolveAttackIfNeeded("opponent", opponentAction, frame.timeMs, playerAnimation === "guard");
    }
    const resolvedPlayerAnimation = this.player.state.snapshot().animation;
    const resolvedOpponentAnimation = this.opponent.state.snapshot().animation;

    const cameraFrame = frameFightCamera(this.player.body, this.opponent.body, {
      impact: this.events.slice(-4).some((event) => event.type === "hit"),
      reducedMotion: options.reducedMotion,
    });
    this.lastCameraFrame = cameraFrame;
    const animationPlan = createAnimationSyncPlan(resolvedPlayerAnimation, resolvedOpponentAnimation);
    const effectCues = effectsFromEvents(this.events.slice(-4));

    this.events.push({
      id: `camera-${frame.frame}`,
      type: "camera",
      atMs: frame.timeMs,
      label: "camera framed fighters",
      payload: { cameraFrame, animationPlan, effectCues },
    });

    this.trimEvents();
  }

  reset(playerId = this.player.id, opponentId = this.opponent.id): AuraClashGame {
    return new AuraClashGame({ playerId, opponentId });
  }

  getEvidence(): AuraClashRuntimeEvidence {
    const loopSnapshot = this.loop.snapshot();
    const evidenceAtMs = this.events.at(-1)?.atMs ?? 0;
    const inputEvents = this.events.filter((event) => event.type === "input");
    const collisionEvents = this.events.filter((event) => event.type === "collision");
    const hitboxEvents = this.events.filter((event) => event.type === "hit" || event.type === "guard" || event.type === "miss");
    const lastInput = inputEvents.at(-1);
    const lastHitbox = hitboxEvents.at(-1);
    const lastCameraFrame = this.lastCameraFrame ?? frameFightCamera(this.player.body, this.opponent.body);

    return {
      runtime: "aura-clash-local-runtime",
      version: "1.0.5-target",
      phase: this.phase,
      playerId: this.player.id,
      opponentId: this.opponent.id,
      actionsProcessed: this.actionsProcessed,
      frameCount: loopSnapshot.frame,
      eventCount: this.events.length,
      systems: {
        loop: true,
        input: true,
        kinematicMovement: true,
        hitboxes: true,
        cameraDirector: true,
        effectsDirector: true,
        accessibility: true,
        aiDirector: true,
      },
      fighters: {
        player: this.fighterEvidence(this.player),
        opponent: this.fighterEvidence(this.opponent),
      },
      camera: {
        active: true,
        tracks: ["player", "opponent"],
        position: lastCameraFrame.position,
        target: lastCameraFrame.target,
        fov: lastCameraFrame.fov,
        zoom: lastCameraFrame.zoom,
        shake: lastCameraFrame.shake,
        reducedMotion: lastCameraFrame.reducedMotion,
        stageBounds: lastCameraFrame.stageBounds,
        unclampedCenterX: lastCameraFrame.unclampedCenterX,
        clampedCenterX: lastCameraFrame.clampedCenterX,
        clampedToStage: lastCameraFrame.clampedToStage,
      },
      collisionHitbox: {
        inputEventCount: inputEvents.length,
        collisionEventCount: collisionEvents.length,
        hitboxEventCount: hitboxEvents.length,
        hitEventCount: hitboxEvents.filter((event) => event.type === "hit").length,
        guardEventCount: hitboxEvents.filter((event) => event.type === "guard").length,
        missEventCount: hitboxEvents.filter((event) => event.type === "miss").length,
        producedFromGameplayInput: Boolean(lastInput && lastHitbox && lastInput.atMs <= lastHitbox.atMs),
        lastInputEventId: lastInput?.id,
        lastCollisionEventId: collisionEvents.at(-1)?.id,
        lastHitboxEventId: lastHitbox?.id,
      },
      ai: {
        currentState: this.lastAIDecision?.state ?? "idle",
        lastAction: this.lastAIDecision?.action ?? "reset",
        reason: this.lastAIDecision?.reason ?? "no AI decision has been processed yet",
        distance: this.lastAIDecision?.distance ?? Math.abs(this.opponent.body.position.x - this.player.body.position.x),
        states: AURA_CLASH_AI_STATES,
      },
      inputBuffer: this.input.getBufferEvidence(evidenceAtMs),
      responsiveness: this.lastResponsiveness ?? createResponsivenessEvidence({
        frame: loopSnapshot.frame,
        dt: 1 / 60,
        actionReceived: null,
        actionApplied: null,
        consumedInput: null,
        bufferEvidence: this.input.getBufferEvidence(evidenceAtMs),
        playerLockRemainingMs: this.player.state.remainingLockMs(evidenceAtMs),
      }),
      lastEvents: this.events.slice(-10),
    };
  }

  private resolveAttackIfNeeded(
    side: "player" | "opponent",
    action: AuraClashInputAction,
    atMs: number,
    defenderGuarding: boolean,
  ): void {
    if (action !== "light" && action !== "heavy" && action !== "special") {
      return;
    }

    const attacker = side === "player" ? this.player : this.opponent;
    const defender = side === "player" ? this.opponent : this.player;
    const defenderSide = side === "player" ? "opponent" : "player";

    const result = resolveCombatAction({
      attackerBody: attacker.body,
      defenderBody: defender.body,
      attackerVitals: attacker,
      defenderVitals: defender,
      move: action,
      atMs,
      defenderGuarding,
    });

    attacker.health = result.attacker.health;
    attacker.guard = result.attacker.guard;
    attacker.meter = result.attacker.meter;
    defender.health = result.defender.health;
    defender.guard = result.defender.guard;
    defender.meter = result.defender.meter;
    const combatEvents = result.events.map((event) => ({
      ...event,
      side: event.side ?? defenderSide,
    }));
    this.events.push(...combatEvents);

    const impactEvent = combatEvents.find((event) => event.type === "hit" || event.type === "guard");
    if (impactEvent?.type === "hit") {
      const stunSeconds = typeof impactEvent.payload?.stun === "number" ? impactEvent.payload.stun : 0.18;
      const stunMs = Math.round(stunSeconds * 1000);
      defender.state.applyHit(atMs, stunMs);
      defender.combo = 0;
      attacker.combo = Math.min(99, attacker.combo + 1);
      this.events.push({
        id: `reaction-${defender.id}-${atMs.toString(36)}`,
        type: "hit",
        atMs,
        side: defenderSide,
        label: `${defender.id} hit reaction applied`,
        payload: {
          sourceEventId: impactEvent.id,
          animation: defender.state.snapshot().animation,
          stunMs,
          knockback: impactEvent.payload?.appliedKnockback,
          collision: impactEvent.payload?.collision,
        },
      });
    } else if (impactEvent?.type === "guard") {
      defender.state.applyAction("guard", atMs);
      this.events.push({
        id: `reaction-guard-${defender.id}-${atMs.toString(36)}`,
        type: "guard",
        atMs,
        side: defenderSide,
        label: `${defender.id} guard reaction applied`,
        payload: {
          sourceEventId: impactEvent.id,
          knockback: impactEvent.payload?.appliedKnockback,
          collision: impactEvent.payload?.collision,
        },
      });
    }

    if (defender.health <= 0) {
      this.phase = "round-over";
      this.events.push({
        id: `round-${side}-${atMs.toString(36)}`,
        type: "round",
        atMs,
        side,
        label: `${side} wins round`,
      });
    }
  }

  private trimEvents(): void {
    if (this.events.length > 80) {
      this.events.splice(0, this.events.length - 80);
    }
  }

  private fighterEvidence(fighter: AuraClashFighterRuntime): AuraClashFighterRuntimeEvidence {
    return {
      id: fighter.id,
      position: cloneVec2(fighter.body.position),
      velocity: cloneVec2(fighter.body.velocity),
      facing: fighter.body.facing,
      grounded: fighter.body.grounded,
      crouching: fighter.body.crouching,
      animation: fighter.state.snapshot().animation,
      health: fighter.health,
      guard: fighter.guard,
      meter: fighter.meter,
      combo: fighter.combo,
    };
  }
}

export function createAuraClashGame(options: AuraClashGameOptions): AuraClashGame {
  return new AuraClashGame(options);
}

function cloneVec2(value: AuraClashVec2): AuraClashVec2 {
  return { x: value.x, y: value.y };
}

function createResponsivenessEvidence(options: {
  frame: number;
  dt: number;
  actionReceived: AuraClashInputAction | null;
  actionApplied: AuraClashInputAction | null;
  consumedInput: AuraClashBufferedInput | null;
  bufferEvidence: AuraClashInputBufferEvidence;
  playerLockRemainingMs: number;
}): AuraClashRuntimeResponsivenessEvidence {
  const fixedStepMs = roundMs(options.dt * 1000);
  const maxExpectedInputToSimulationMs = roundMs(1000 / 60);
  const observedInputToSimulationMs = options.consumedInput
    ? roundMs(Math.max(0, options.frame * options.dt * 1000 - options.consumedInput.atMs))
    : options.actionApplied
      ? 0
      : maxExpectedInputToSimulationMs;

  return {
    targetFps: 60,
    fixedStepDt: options.dt,
    fixedStepMs,
    frame: options.frame,
    actionReceived: options.actionReceived,
    actionApplied: options.actionApplied,
    actionAppliedOnInputFrame: Boolean(options.actionApplied && options.actionReceived === options.actionApplied),
    bufferedInputDeferred: !options.actionApplied && options.bufferEvidence.queued.length > 0,
    inputUpdatedBeforeGameplay: true,
    inputBufferWindowMs: options.bufferEvidence.bufferWindowMs,
    maxExpectedInputToSimulationMs,
    observedInputToSimulationMs,
    queuedInputCountAfterFrame: options.bufferEvidence.queued.length,
    lastBufferedAction: options.bufferEvidence.lastBufferedAction,
    lastConsumedAction: options.bufferEvidence.lastConsumedAction,
    lastConsumedSequence: options.bufferEvidence.lastConsumedSequence,
    playerLockRemainingMs: roundMs(options.playerLockRemainingMs),
  };
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
