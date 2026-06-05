import type { AuraClashBufferedInput, AuraClashInputAction, AuraClashInputBufferEvidence } from "./types";

export type AuraClashBufferedInputPredicate = (entry: AuraClashBufferedInput) => boolean;

export interface AuraClashInputSnapshot {
  action: AuraClashInputAction;
  held: ReadonlySet<AuraClashInputAction>;
  axisX: -1 | 0 | 1;
  jump: boolean;
  crouch: boolean;
  attack: "light" | "heavy" | "special" | null;
  guard: boolean;
  dash: boolean;
  bufferedAction: AuraClashInputAction | null;
  buffered: readonly AuraClashBufferedInput[];
}

const holdableActions = new Set<AuraClashInputAction>(["moveLeft", "moveRight", "guard", "crouch"]);
const bufferedActions = new Set<AuraClashInputAction>(["jump", "crouch", "dash", "guard", "light", "heavy", "special"]);
const DEFAULT_INPUT_BUFFER_WINDOW_MS = 160;

export class InputController {
  private readonly held = new Set<AuraClashInputAction>();
  private readonly buffer: AuraClashBufferedInput[] = [];
  private lastConsumed: AuraClashBufferedInput | null = null;
  private nextSequence = 1;

  constructor(private readonly bufferWindowMs = DEFAULT_INPUT_BUFFER_WINDOW_MS) {}

  press(action: AuraClashInputAction, atMs = 0): AuraClashInputSnapshot {
    if (action === "reset") {
      this.buffer.length = 0;
    }

    if (holdableActions.has(action)) {
      this.held.add(action);
    }

    this.recordBufferedAction(action, atMs);
    return this.snapshot(action, atMs);
  }

  release(action: AuraClashInputAction, atMs = 0): AuraClashInputSnapshot {
    this.held.delete(action);
    return this.snapshot("reset", atMs);
  }

  clear(): void {
    this.held.clear();
    this.buffer.length = 0;
    this.lastConsumed = null;
  }

  consumeBufferedAction(atMs = 0, predicate: AuraClashBufferedInputPredicate = () => true): AuraClashBufferedInput | null {
    this.pruneExpired(atMs);
    const index = this.buffer.findIndex(predicate);
    if (index < 0) {
      return null;
    }

    const entry = this.buffer[index];
    if (!entry) {
      return null;
    }

    this.buffer.splice(0, index + 1);
    this.lastConsumed = { ...entry };
    return { ...entry };
  }

  snapshot(action: AuraClashInputAction = "reset", atMs = 0): AuraClashInputSnapshot {
    this.pruneExpired(atMs);
    const left = this.held.has("moveLeft") || action === "moveLeft";
    const right = this.held.has("moveRight") || action === "moveRight";
    const axisX: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;
    const attack = action === "light" || action === "heavy" || action === "special" ? action : null;
    const buffered = this.buffer.map((entry) => ({ ...entry }));
    const bufferedAction = buffered.at(-1)?.action ?? null;

    return {
      action,
      held: new Set(this.held),
      axisX,
      jump: action === "jump",
      crouch: this.held.has("crouch") || action === "crouch",
      attack,
      guard: this.held.has("guard") || action === "guard",
      dash: action === "dash",
      bufferedAction,
      buffered,
    };
  }

  getBufferEvidence(atMs = 0): AuraClashInputBufferEvidence {
    this.pruneExpired(atMs);
    const queued = this.buffer.map((entry) => ({
      ...entry,
      ageMs: Math.max(0, atMs - entry.atMs),
    }));

    return {
      bufferWindowMs: this.bufferWindowMs,
      queued,
      lastBufferedAction: queued.at(-1)?.action ?? null,
      lastConsumedAction: this.lastConsumed?.action ?? null,
      lastConsumedSequence: this.lastConsumed?.sequence ?? null,
      lastConsumedAgeMs: this.lastConsumed ? Math.max(0, atMs - this.lastConsumed.atMs) : null,
    };
  }

  private recordBufferedAction(action: AuraClashInputAction, atMs: number): void {
    if (!bufferedActions.has(action)) {
      return;
    }

    this.buffer.push({
      action,
      atMs,
      sequence: this.nextSequence,
    });
    this.nextSequence += 1;
    this.pruneExpired(atMs);

    if (this.buffer.length > 8) {
      this.buffer.splice(0, this.buffer.length - 8);
    }
  }

  private pruneExpired(atMs: number): void {
    if (atMs <= 0) {
      return;
    }

    while (this.buffer.length > 0 && atMs - this.buffer[0]!.atMs > this.bufferWindowMs) {
      this.buffer.shift();
    }
  }
}
