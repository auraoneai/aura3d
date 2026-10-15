/**
 * Audio controller for Rooftop Buckets.
 */
import { assets } from "../../../../src/aura-assets";

export type BucketsAudioCue =
  | "chargeTick"
  | "rimClank"
  | "boardThud"
  | "swish"
  | "brickMiss"
  | "fireIgnite"
  | "goldBall"
  | "heatAdvance"
  | "buzzerFail"
  | "ambientRooftop";

export class BucketsAudioController {
  private readonly cueUrls: Readonly<Record<BucketsAudioCue, string>> = {
    chargeTick: assets.rooftopBucketsChargeTickSfx.url,
    rimClank: assets.rooftopBucketsRimClankSfx.url,
    boardThud: assets.rooftopBucketsBoardThudSfx.url,
    swish: assets.rooftopBucketsSwishSfx.url,
    brickMiss: assets.rooftopBucketsBrickMissSfx.url,
    fireIgnite: assets.rooftopBucketsFireIgniteSfx.url,
    goldBall: assets.rooftopBucketsGoldBallSfx.url,
    heatAdvance: assets.rooftopBucketsHeatAdvanceSfx.url,
    buzzerFail: assets.rooftopBucketsBuzzerFailSfx.url,
    ambientRooftop: assets.rooftopBucketsAmbientRooftopSfx.url
  };
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public readonly audioCuesHeard: string[] = [];

  constructor() {
    void this.cueUrls;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (typeof Ctor === "function") {
        try {
          this.ctx = new Ctor();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.08 * white) / 1.08;
      data[i] = last * 1.8;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  public playCue(cue: BucketsAudioCue, volume = 0.8): void {
    this.audioCuesHeard.push(cue);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const scale = Math.max(0, Math.min(1, volume));
    const now = ctx.currentTime;

    try {
      switch (cue) {
        case "chargeTick": {
          // Soft, short warm marimba tap (440 -> 587 Hz, 0.04s, gain 0.06, lowpass 1200 Hz)
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(587, now + 0.04);
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(1200, now);
          const peak = 0.06 * Math.max(0.35, scale);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(peak, now + 0.005);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }
        case "swish": {
          // Crisp filtered noise net swish (0.18s bandpass 1800 Hz) + warm two-note chime (523.25 Hz, 659.25 Hz)
          const src = ctx.createBufferSource();
          src.buffer = this.getNoiseBuffer(ctx);
          const bandpass = ctx.createBiquadFilter();
          bandpass.type = "bandpass";
          bandpass.frequency.setValueAtTime(1800, now);
          bandpass.Q.setValueAtTime(1.8, now);
          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.0001, now);
          noiseGain.gain.linearRampToValueAtTime(0.14 * scale, now + 0.02);
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
          src.connect(bandpass);
          bandpass.connect(noiseGain);
          noiseGain.connect(ctx.destination);
          src.start(now);
          src.stop(now + 0.19);

          const notes = [523.25, 659.25];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.055;
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(0.09 * scale, start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.23);
          });
          break;
        }
        case "rimClank": {
          // Metallic rim ping (680 Hz + 1020 Hz damped sine 0.12s + soft thud 140 Hz)
          const partials = [
            { freq: 680, dur: 0.12, amp: 0.1 * scale },
            { freq: 1020, dur: 0.09, amp: 0.06 * scale },
            { freq: 140, dur: 0.08, amp: 0.12 * scale }
          ];
          for (const p of partials) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(p.freq, now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(p.amp, now + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + p.dur + 0.01);
          }
          break;
        }
        case "boardThud": {
          // Warm lowpass wood/acrylic thud (110 -> 65 Hz sine 0.12s)
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(110, now);
          osc.frequency.exponentialRampToValueAtTime(65, now + 0.12);
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(320, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.16 * scale, now + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.125);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.13);
          break;
        }
        case "brickMiss": {
          // Soft low thud (95 -> 60 Hz triangle 0.15s)
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(95, now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(280, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.14 * scale, now + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.155);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        }
        case "fireIgnite":
        case "goldBall":
        case "heatAdvance": {
          // Warm major triad arpeggio chime (C5-E5-G5-B5 soft triangle with lowpass filter)
          const chord = [523.25, 659.25, 783.99, 987.77];
          chord.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            const start = now + idx * 0.055;
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, start);
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(2200, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(0.08 * scale, start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.29);
          });
          break;
        }
        case "buzzerFail": {
          // Clean arena horn chord (smooth lowpass-filtered triangle 220 Hz + 277 Hz, 0.35s, gain 0.12)
          for (const freq of [220, 277.18]) {
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, now);
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(640, now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.06 * scale, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.36);
          }
          break;
        }
        case "ambientRooftop":
          break;
      }
    } catch {
      // Ignore WebAudio scheduling errors when context is closed/blocked
    }
  }

  public startAmbience(): void {
    // Intentionally silent: no looping background drone or buzzing oscillator.
  }

  public stopAmbience(): void {
    // No-op since ambient drone is disabled.
  }
}
