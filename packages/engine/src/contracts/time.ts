/**
 * C-23 — time controller, feel bus, screen-feel uniforms (CONTRACTS.md). Provider: PRD 08.
 * Flag: A3D_QR_CAMERA.
 */

import type { AuraVec3, AuraRuntimeNodeHandle } from "../agent-api/index";

export interface AuraTimeController {
  scale: number;
  scaleTo(value: number, halflife: number): void;
  hitStop(seconds: number, o?: { scope?: "global" | readonly (string | AuraRuntimeNodeHandle)[] }): void;
  slowMo(scale: number, seconds: number, o?: { easeOut?: number }): void;
  readonly simTime: number; readonly realTime: number; readonly hitStopRemaining: number;
}
export interface AuraLoopOptions { readonly fixedDt?: number; readonly maxSubSteps?: number /* default 6 */; readonly maxFrameDt?: number /* 0.1 */; readonly overload?: "slow-motion" | "catch-up"; readonly interpolation?: boolean; readonly renderPerSubstep?: boolean; }
// AuraRuntimeNodeHandle additions (via C-37 extension "prd08.time"): interpolate: boolean; timeScale: number; teleport(x: number, y: number, z: number, rotation?: AuraVec3): this
export interface AuraFeelEventSpec { readonly shake?: number; readonly punch?: { readonly fov?: number; readonly dolly?: number }; readonly hitStop?: { readonly seconds: number; readonly scope?: "global" | "actors" }; readonly haptics?: { readonly strong?: number; readonly weak?: number; readonly ms?: number }; readonly audio?: { readonly cue: string; readonly pitchJitter?: number; readonly gainJitter?: number; readonly positional?: boolean }; readonly vfx?: { readonly kind: string; readonly count?: number }; readonly screen?: { readonly flash?: number; readonly chroma?: number; readonly radialBlur?: number; readonly vignette?: number }; }
export interface AuraFeelBus { define(event: string, spec: AuraFeelEventSpec): void; emit(event: string, at?: { position?: AuraVec3; actors?: readonly string[]; strength?: number }): void; preset(name: "arcade" | "fighting" | "racing" | "platformer" | "puzzle" | "calm"): void; evidence(): { readonly emitted: number; readonly executed: Readonly<Record<string, number>> }; }
export interface AuraScreenFeelUniforms { readonly flash: number; readonly chroma: number; readonly radialBlur: number; readonly vignette: number; readonly center: readonly [number, number]; }
export const SCREEN_FEEL_BLACKBOARD_KEY: "prd08.screenFeel" = "prd08.screenFeel";   // published per frame on the C-01 blackboard
// AuraApp: readonly time: AuraTimeController; readonly feel: AuraFeelBus; onRender(cb: (f: { alpha: number; realDt: number; simTime: number }) => void): () => void   (via C-38)

/**
 * PR 0a real stub: AuraTimeController is pure state — scale ramps at a
 * halflife, hitStop counts down, slowMo eases out. Wired to FrameLoop via
 * setTimeScale in PR 0b.
 */
export class StubTimeController implements AuraTimeController {
  public scale = 1;
  public simTime = 0;
  public realTime = 0;
  public hitStopRemaining = 0;
  private ramp: { from: number; to: number; halflife: number; startedAt: number } | null = null;
  private slowMoState: { scale: number; remaining: number; easeOut: number } | null = null;

  scaleTo(value: number, halflife: number): void {
    this.ramp = { from: this.scale, to: value, halflife: Math.max(1e-6, halflife), startedAt: this.realTime };
  }

  hitStop(seconds: number, _o?: { scope?: "global" | readonly (string | AuraRuntimeNodeHandle)[] }): void {
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds);
  }

  slowMo(scale: number, seconds: number, o?: { easeOut?: number }): void {
    this.slowMoState = { scale, remaining: seconds, easeOut: o?.easeOut ?? 0.1 };
    this.scale = scale;
  }

  /** Called by the loop seam with the real dt. */
  advance(realDt: number): number {
    this.realTime += realDt;
    if (this.ramp) {
      const elapsed = this.realTime - this.ramp.startedAt;
      const k = elapsed <= 0 ? 0 : 1 - Math.pow(0.5, elapsed / this.ramp.halflife);
      this.scale = this.ramp.from + (this.ramp.to - this.ramp.from) * k;
      if (k >= 0.999) { this.scale = this.ramp.to; this.ramp = null; }
    }
    if (this.slowMoState) {
      this.slowMoState.remaining -= realDt;
      if (this.slowMoState.remaining <= 0) {
        const back = this.slowMoState.easeOut;
        this.slowMoState = null;
        if (back > 0) this.scaleTo(1, back); else this.scale = 1;
      }
    }
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining = Math.max(0, this.hitStopRemaining - realDt);
      this.simTime += 0;
      return 0;
    }
    this.simTime += realDt * this.scale;
    return realDt * this.scale;
  }
}

/** PR 0a feel bus: events registered and emitted; executed counts only real channels (shake/punch are no-ops until PRD 08 lands). */
export class StubFeelBus implements AuraFeelBus {
  private readonly specs = new Map<string, AuraFeelEventSpec>();
  private emitted = 0;
  private executed: Record<string, number> = {};

  define(event: string, spec: AuraFeelEventSpec): void {
    this.specs.set(event, spec);
  }

  emit(event: string, at?: { position?: AuraVec3; actors?: readonly string[]; strength?: number }): void {
    void at;
    const spec = this.specs.get(event);
    if (!spec) return;
    this.emitted += 1;
    if (spec.hitStop) this.executed.hitStop = (this.executed.hitStop ?? 0) + 1;
    if (spec.audio) this.executed.audio = (this.executed.audio ?? 0) + 1;
    if (spec.vfx) this.executed.vfx = (this.executed.vfx ?? 0) + 1;
  }

  preset(_name: "arcade" | "fighting" | "racing" | "platformer" | "puzzle" | "calm"): void { /* presets land with PRD 08 */ }

  evidence(): { readonly emitted: number; readonly executed: Readonly<Record<string, number>> } {
    return { emitted: this.emitted, executed: { ...this.executed } };
  }
}
