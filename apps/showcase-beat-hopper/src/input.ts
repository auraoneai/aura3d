/**
 * Beat Hopper input queue (no DOM): collects keyboard and pointer events between fixed steps and hands the sim one
 * Input per step.
 *
 * Keyboard: Space/ArrowUp hop on keydown; Shift+Space/ArrowUp, W, E or Shift trigger a higher Big / Boost Jump
 * (~2.35 m arc, ~1.05 s hangtime). ArrowDown/S duck while held and never hop. ArrowLeft/ArrowRight/A/D step one lane.
 * Pointer: immediate tap/click jumps on pointerdown, right-click / Shift+click / double-tap fires Big Jump, horizontal
 * swipe steers lanes, and downward swipe or HUD DUCK pill ducks. Raw `press`/`drag`/`release` remain intact for replay/tests.
 */
import { IDLE, type Input } from "./sim";

export const HOP_KEYS: readonly string[] = ["Space", "ArrowUp", "KeyW"];
export const BOOST_KEYS: readonly string[] = ["KeyE", "ShiftLeft", "ShiftRight"];
export const DUCK_KEYS: readonly string[] = ["ArrowDown", "KeyS"];
export const STEER_KEYS: Readonly<Record<string, number>> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
/** Keys the game owns during play: their default action (scroll, activating a focused button) is always suppressed. */
export const isGameKey = (code: string): boolean =>
  HOP_KEYS.includes(code) || BOOST_KEYS.includes(code) || DUCK_KEYS.includes(code) || code in STEER_KEYS;

export class InputQueue {
  private pending: Input = { ...IDLE };
  /** A release that arrives in the same step as its press waits one step, so a very quick tap/duck still registers. */
  private deferredUp = false;
  private readonly ducks = new Set<string>();

  /** Immediate regular hop (pointerdown tap or HUD JUMP pill). */
  jump(): void {
    this.pending.hop = true;
  }

  /** Immediate Big / Boost Jump (Shift, W, E, right-click, double-tap, or HUD BIG JUMP pill). */
  boostJump(): void {
    this.pending.boostJump = true;
  }

  /** Immediate whole-lane step (-1 left, +1 right). */
  steer(deltaLane: number): void {
    this.pending.lane += deltaLane;
  }

  /** Engage duck from a pointer swipe-down or HUD DUCK pill, coordinated with keyboard duck keys. */
  duckStart(source = "pointer"): void {
    const first = this.ducks.size === 0;
    this.ducks.add(source);
    if (first) {
      this.pending.down = true;
      this.pending.duck = true;
    }
  }

  /** End duck from a pointer swipe-down or HUD DUCK pill once no other duck source remains held. */
  duckEnd(source = "pointer"): void {
    if (this.ducks.delete(source) && this.ducks.size === 0) {
      this.release();
    }
  }

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
  keyDown(code: string, repeat: boolean, playing: boolean, shiftKey = false): boolean {
    if (!isGameKey(code)) return false;
    if (repeat || !playing) return true;
    const steer = STEER_KEYS[code];
    if (steer !== undefined) {
      this.pending.lane += steer;
    } else if (code === "KeyW" || BOOST_KEYS.includes(code) || (HOP_KEYS.includes(code) && shiftKey)) {
      this.pending.boostJump = true;
    } else if (HOP_KEYS.includes(code)) {
      this.pending.hop = true;
    } else {
      this.duckStart(code);
    }
    return true;
  }

  /** A keyup. Returns true when the key is a game key. */
  keyUp(code: string): boolean {
    if (!isGameKey(code)) return false;
    if (DUCK_KEYS.includes(code)) this.duckEnd(code);
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
