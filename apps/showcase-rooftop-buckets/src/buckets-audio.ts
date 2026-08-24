/**
 * Audio controller for Rooftop Buckets.
 */
import { assets } from "../../../src/aura-assets";

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
  private readonly audioElements = new Map<BucketsAudioCue, HTMLAudioElement>();
  private ambienceElement: HTMLAudioElement | null = null;
  public readonly audioCuesHeard: string[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioBuffers();
    }
  }

  private initAudioBuffers(): void {
    const cueMap: Record<BucketsAudioCue, string> = {
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

    for (const [cue, url] of Object.entries(cueMap) as [BucketsAudioCue, string][]) {
      const audio = new Audio(url);
      audio.preload = "auto";
      this.audioElements.set(cue, audio);
    }
  }

  public playCue(cue: BucketsAudioCue, volume = 0.8): void {
    this.audioCuesHeard.push(cue);
    const audio = this.audioElements.get(cue);
    if (!audio) return;

    try {
      audio.currentTime = 0;
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => {});
    } catch {
      // Audio autoplay policy fallback
    }
  }

  public startAmbience(): void {
    const audio = this.audioElements.get("ambientRooftop");
    if (!audio) return;
    this.ambienceElement = audio;
    audio.loop = true;
    audio.volume = 0.35;
    audio.play().catch(() => {});
  }

  public stopAmbience(): void {
    if (this.ambienceElement) {
      this.ambienceElement.pause();
    }
  }
}
