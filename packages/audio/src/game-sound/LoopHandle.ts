/**
 * game-sound/LoopHandle.ts — live loop control (§6.8).
 *
 * `setRate`/`setGain` use `AudioParam.setTargetAtTime` (τ = rampMs/3 per
 * AudioSource.setPlaybackRate convention). The handle fronts a running
 * `VoiceRecord` (or several, for engine layers — see EngineLoop.ts).
 */

import { dbToGain } from "./types";
import type { Vec3 } from "./types";
import type { SpatialNode } from "./SpatialVoice";
import type { VoiceRecord } from "./Voice";

export class LoopHandleImpl {
  private stopped = false;

  constructor(
    private readonly ctx: { currentTime: number },
    private readonly voice: VoiceRecord,
    private readonly spatial: SpatialNode | undefined,
    private readonly stopVoice: (r: VoiceRecord) => void
  ) {}

  get id(): number {
    return this.voice.id;
  }
  get ended(): boolean {
    return this.stopped || this.voice.ended;
  }

  stop(fadeMs = 0): void {
    if (this.stopped) return;
    this.stopped = true;
    const gain = this.voice.gain as unknown as {
      gain?: { setTargetAtTime?(v: number, t: number, tau: number): void; value: number };
    };
    if (fadeMs > 0 && gain.gain?.setTargetAtTime) {
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, fadeMs / 3000);
      const voice = this.voice;
      const release = () => this.stopVoice(voice);
      setTimeout(release, fadeMs + 30).unref?.();
    } else {
      this.stopVoice(this.voice);
    }
  }

  setPosition(p: Vec3): void {
    this.spatial?.setPosition(p);
  }

  setPositionVelocity(p: Vec3, v?: Vec3): void {
    this.spatial?.setPosition(p);
    if (v) this.spatial?.setVelocity(v);
  }

  setOcclusion(amount01: number): void {
    this.spatial?.setOcclusion(amount01);
  }

  setRate(rate: number, rampMs = 0): void {
    const param = this.voice.source.playbackRate;
    if (!param) return;
    const next = Math.max(0.0625, rate);
    if (rampMs > 0 && param.setTargetAtTime) {
      param.setTargetAtTime(next, this.ctx.currentTime, rampMs / 3000);
    } else {
      param.value = next;
    }
  }

  setGain(gainDb: number, rampMs = 0): void {
    const linear = dbToGain(gainDb);
    const gain = this.voice.gain as unknown as {
      gain?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
    };
    if (!gain.gain) return;
    if (rampMs > 0 && gain.gain.setTargetAtTime) {
      gain.gain.setTargetAtTime(Math.min(4, Math.max(0, linear)), this.ctx.currentTime, rampMs / 3000);
    } else {
      gain.gain.value = Math.min(4, Math.max(0, linear));
    }
  }
}

export type { VoiceRecord };
