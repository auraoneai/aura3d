/**
 * Patrol Wing input-replay ghost (PRD PW-09).
 *
 * The route records a per-fixed-frame control script (the 9-bit frame from
 * weapons.ts: six axis bits + throttle bits + fire). Playback steps a second
 * FlightModel with the identical authored step function, which is what makes
 * the ghost provably deterministic: identical script + identical model =
 * identical trajectory hash (unit-proven). The script hash is an FNV-1a over
 * the frame codes so "same ghost" is checkable in evidence.
 */
import {
  FlightModel,
  FLIGHT_DT,
  hashString,
  type FlightFrame,
  type LandingContext
} from "./flight";
import { decodeControlFrame } from "./weapons";

export interface GhostSnapshot {
  readonly recorded: boolean;
  readonly frames: number;
  readonly playing: boolean;
  readonly playbackFrame: number;
  readonly scriptHash: string | null;
  readonly trajectoryHash: string | null;
}

/** Records control frames each fixed step while a patrol is live. */
export class GhostRecorder {
  private frames: number[] = [];
  private active = false;

  begin(): void {
    this.frames = [];
    this.active = true;
  }

  record(code: number): void {
    if (!this.active) return;
    this.frames.push(code);
    if (this.frames.length > 60 * 240) this.frames.shift(); // 4 min cap
  }

  end(): readonly number[] {
    this.active = false;
    return this.frames;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  scriptHash(): string {
    return hashString(this.frames.join(","));
  }
}

/**
 * Ghost playback: one FlightModel driven by the recorded script. `step()`
 * advances one fixed frame and returns the ghost's flight state for the
 * visual sync (translucent plane node in main.ts).
 */
export class GhostPlayer {
  private readonly model: FlightModel;
  private frameIndex = 0;
  private playingValue = false;

  constructor(
    private readonly script: readonly number[],
    spawn: { position: readonly [number, number, number]; headingYaw: number }
  ) {
    this.model = new FlightModel({ position: spawn.position, headingYaw: spawn.headingYaw, throttle: 0, speed: 0 });
  }

  start(): void {
    this.frameIndex = 0;
    this.playingValue = true;
  }

  stop(): void {
    this.playingValue = false;
  }

  get playing(): boolean {
    return this.playingValue;
  }

  get frameIndexValue(): number {
    return this.frameIndex;
  }

  get flight(): FlightModel {
    return this.model;
  }

  step(
    terrainHeight: (x: number, z: number) => number,
    landing?: LandingContext
  ): FlightFrame | null {
    if (!this.playingValue) return null;
    if (this.frameIndex >= this.script.length) {
      this.playingValue = false;
      return null;
    }
    const { input } = decodeControlFrame(this.script[this.frameIndex]!);
    this.frameIndex += 1;
    return this.model.step(input, FLIGHT_DT, terrainHeight, landing);
  }

  trajectoryHash(): string {
    return this.model.trajectoryHash();
  }
}
