/**
 * Beat Hopper input queue (no DOM): collects keyboard and pointer events between fixed steps and hands the sim one
 * Input per step.
 *
 * Keyboard: Space/ArrowUp/W hop on keydown (one press = one hop, auto-repeat ignored, the key-up does nothing).
 * ArrowDown/S duck while held and never hop. ArrowLeft/ArrowRight/A/D step one lane.
 * Pointer: press = `down`, release = `up` (the sim tells tap = hop, still hold = duck and drag = steer apart).
 */
import { IDLE, type Input } from "./sim";

export const HOP_KEYS: readonly string[] = ["Space", "ArrowUp", "KeyW"];
export const DUCK_KEYS: readonly string[] = ["ArrowDown", "KeyS"];
export const STEER_KEYS: Readonly<Record<string, number>> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
/** Keys the game owns during play: their default action (scroll, activating a focused button) is always suppressed. */
export const isGameKey = (code: string): boolean => HOP_KEYS.includes(code) || DUCK_KEYS.includes(code) || code in STEER_KEYS;

export class InputQueue {
  private pending: Input = { ...IDLE };
  /** A release that arrives in the same step as its press waits one step, so a very quick tap/duck still registers. */
  private deferredUp = false;
  private readonly ducks = new Set<string>();

  /** Pointer press (playing). */
  press(): void {
    this.pending.down = true;
  }

  /** Pointer drag travel in CSS px while pressed. */
  drag(dx: number): void {
    this.pending.dx += dx;
  }

  /** Pointer release, or the last duck key let go. */
  release(): void {
    if (this.pending.down) this.deferredUp = true;
    else this.pending.up = true;
  }

  start(on = true): void {
    this.pending.start = on;
  }

  /** Focus loss, pause, dialog: forget held keys and end any hold. */
  drop(): void {
    this.ducks.clear();
    this.pending.up = true;
  }

  /**
   * A keydown. `playing` = the run is live. Returns true when the key is a game key (the caller should
   * preventDefault, also for auto-repeats, so held Space never scrolls or clicks a focused button).
   */
  keyDown(code: string, repeat: boolean, playing: boolean): boolean {
    if (!isGameKey(code)) return false;
    if (repeat || !playing) return true;
    const steer = STEER_KEYS[code];
    if (steer !== undefined) {
      this.pending.lane += steer;
    } else if (HOP_KEYS.includes(code)) {
      this.pending.hop = true;
    } else {
      const first = this.ducks.size === 0;
      this.ducks.add(code);
      if (first) {
        this.pending.down = true;
        this.pending.duck = true;
      }
    }
    return true;
  }

  /** A keyup. Returns true when the key is a game key. */
  keyUp(code: string): boolean {
    if (!isGameKey(code)) return false;
    if (DUCK_KEYS.includes(code) && this.ducks.delete(code) && this.ducks.size === 0) this.release();
    return true;
  }

  /** The Input for the next step; clears the queue. */
  take(): Input {
    const input = this.pending;
    this.pending = { ...IDLE };
    if (this.deferredUp) {
      this.pending.up = true;
      this.deferredUp = false;
    }
    return input;
  }
}
