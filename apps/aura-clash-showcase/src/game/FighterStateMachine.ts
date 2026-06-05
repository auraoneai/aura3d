import type { AuraClashAnimationName, AuraClashInputAction } from "./types";

export interface FighterStateMachineSnapshot {
  animation: AuraClashAnimationName;
  lockedUntilMs: number;
  hitstunUntilMs: number;
}

export class FighterStateMachine {
  private animation: AuraClashAnimationName = "idle";
  private lockedUntilMs = 0;
  private hitstunUntilMs = 0;

  applyAction(action: AuraClashInputAction, atMs: number): AuraClashAnimationName {
    if (!this.canAcceptAction(action, atMs)) {
      if (atMs < this.hitstunUntilMs) {
        this.animation = "stun";
      }
      return this.animation;
    }

    if (atMs < this.hitstunUntilMs) {
      this.animation = "stun";
      return this.animation;
    }

    const next = actionToAnimation(action);
    this.animation = next.animation;
    this.lockedUntilMs = atMs + next.lockMs;
    return this.animation;
  }

  canAcceptAction(action: AuraClashInputAction, atMs: number): boolean {
    if (atMs < this.hitstunUntilMs) {
      return false;
    }

    if (atMs < this.lockedUntilMs && action !== "guard" && action !== "crouch") {
      return false;
    }

    return true;
  }

  remainingLockMs(atMs: number): number {
    return Math.max(0, Math.max(this.lockedUntilMs, this.hitstunUntilMs) - atMs);
  }

  applyHit(atMs: number, stunMs: number): void {
    this.hitstunUntilMs = atMs + stunMs;
    this.lockedUntilMs = this.hitstunUntilMs;
    this.animation = stunMs > 360 ? "knockdown" : "hit";
  }

  force(animation: AuraClashAnimationName): void {
    this.animation = animation;
  }

  snapshot(): FighterStateMachineSnapshot {
    return {
      animation: this.animation,
      lockedUntilMs: this.lockedUntilMs,
      hitstunUntilMs: this.hitstunUntilMs,
    };
  }
}

function actionToAnimation(action: AuraClashInputAction): { animation: AuraClashAnimationName; lockMs: number } {
  switch (action) {
    case "moveLeft":
      return { animation: "walkBack", lockMs: 0 };
    case "moveRight":
      return { animation: "walkForward", lockMs: 0 };
    case "jump":
      return { animation: "jump", lockMs: 360 };
    case "crouch":
      return { animation: "crouch", lockMs: 80 };
    case "dash":
      return { animation: "dash", lockMs: 220 };
    case "guard":
      return { animation: "guard", lockMs: 90 };
    case "light":
      return { animation: "light", lockMs: 220 };
    case "heavy":
      return { animation: "heavy", lockMs: 390 };
    case "special":
      return { animation: "special", lockMs: 720 };
    default:
      return { animation: "idle", lockMs: 0 };
  }
}
