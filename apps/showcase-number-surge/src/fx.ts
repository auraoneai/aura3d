/**
 * Number Surge screen effects: sim event-counter diffs mapped to kit ScreenFx
 * flashes, camera shake and the milestone FOV punch. Pure mapping (unit-tested);
 * the DOM driver applies it with the reduced-motion caps.
 */
import { ScreenFx, flashStrength } from "../../../examples/shared/runner-kit/index";
import { LOOK } from "./look";
import type { EventCounters } from "./sim";

export interface FxBurst {
  readonly cue: keyof EventCounters;
  readonly color: string;
  readonly strength: number;
  readonly shake: number;
  readonly fovPunch: number;
}

const TABLE: Record<keyof EventCounters, { color: string; strength: number; shake: number; fovPunch: number }> = {
  pickGood: { ...LOOK.fx.pickGoodFlash, shake: 0, fovPunch: 0 },
  pickBad: { ...LOOK.fx.pickBadFlash, shake: 0, fovPunch: 0 },
  smash: { ...LOOK.fx.smashFlash, shake: LOOK.fx.shakeOnSmash, fovPunch: LOOK.fx.fovPunchDeg },
  wallFail: { ...LOOK.fx.wallFailFlash, shake: LOOK.fx.shakeOnFail, fovPunch: 0 },
  wallBlock: { color: LOOK.palette.shield, strength: 0.18, shake: 0.15, fovPunch: 0 },
  powerup: { ...LOOK.fx.powerupFlash, shake: 0, fovPunch: 0 },
  milestone: { ...LOOK.fx.milestoneFlash, shake: 0, fovPunch: LOOK.fx.fovPunchDeg },
  gameover: { color: LOOK.palette.danger, strength: 0.2, shake: 0, fovPunch: 0 }
};

/** One flash per event counter that advanced between the two frames (pure). */
export function diffFx(prev: EventCounters | null, next: EventCounters): FxBurst[] {
  if (!prev) return [];
  const out: FxBurst[] = [];
  for (const key of Object.keys(TABLE) as (keyof EventCounters)[]) {
    if (next[key] > prev[key]) out.push({ cue: key, ...TABLE[key] });
  }
  return out;
}

export class FxDriver {
  private readonly screen: ScreenFx;
  private punch = 0;

  constructor(host: HTMLElement, private readonly reducedMotion: () => boolean) {
    this.screen = new ScreenFx(host);
  }

  /** Apply the diffs; returns the current FOV punch (decays outside). */
  apply(bursts: readonly FxBurst[]): number {
    const reduced = this.reducedMotion();
    for (const b of bursts) {
      this.screen.flash(b.color, flashStrength(b.strength, reduced));
      if (!reduced) this.punch = Math.max(this.punch, b.fovPunch);
    }
    return this.punch;
  }

  /** Decay the punch per sim step; returns the value to draw this frame. */
  step(): number {
    this.punch = Math.max(0, this.punch - 0.25);
    return this.punch;
  }

  vignette(mult: number, x2: boolean, seconds: number): void {
    this.screen.vignette(mult, x2, LOOK.palette.skyZenith, seconds, this.reducedMotion());
  }

  reveal(on: boolean): void {
    if (on) this.screen.reveal(LOOK.palette.danger, this.reducedMotion());
    else this.screen.clearReveal();
  }
}