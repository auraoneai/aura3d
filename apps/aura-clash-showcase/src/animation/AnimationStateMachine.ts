import type { FighterAnimationState } from "./FighterAnimationMap";

export interface AnimationTransition {
  from: FighterAnimationState;
  to: FighterAnimationState;
  reason: string;
  atMs: number;
}

export interface AnimationStateSnapshot {
  current: FighterAnimationState;
  previous: FighterAnimationState;
  lockedUntilMs: number;
  transitions: AnimationTransition[];
}

const lockedDurations: Partial<Record<FighterAnimationState, number>> = {
  dash: 220,
  jump: 340,
  light: 180,
  heavy: 310,
  special: 650,
  hitstun: 280,
  victory: 1200,
  defeat: 1200,
};

export class AnimationStateMachine {
  private current: FighterAnimationState = "idle";
  private previous: FighterAnimationState = "idle";
  private lockedUntilMs = 0;
  private transitions: AnimationTransition[] = [];

  transition(to: FighterAnimationState, reason: string, atMs: number): AnimationStateSnapshot {
    if (atMs < this.lockedUntilMs && to !== "hitstun" && to !== "defeat") {
      return this.snapshot();
    }

    if (to !== this.current) {
      this.previous = this.current;
      this.current = to;
      this.lockedUntilMs = atMs + (lockedDurations[to] ?? 0);
      this.transitions = [
        ...this.transitions.slice(-11),
        {
          from: this.previous,
          to,
          reason,
          atMs,
        },
      ];
    }

    return this.snapshot();
  }

  releaseToIdle(atMs: number, reason = "auto-release"): AnimationStateSnapshot {
    if (atMs < this.lockedUntilMs || this.current === "idle" || this.current === "guard") {
      return this.snapshot();
    }

    return this.transition("idle", reason, atMs);
  }

  snapshot(): AnimationStateSnapshot {
    return {
      current: this.current,
      previous: this.previous,
      lockedUntilMs: this.lockedUntilMs,
      transitions: [...this.transitions],
    };
  }
}
