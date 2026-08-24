/**
 * Typed audio controller for Deep Recovery.
 */
import { assets } from "../../../src/aura-assets";

export type DeepAudioCue =
  | "sonar-ping"
  | "sonar-return"
  | "hull-creak"
  | "breach-alarm"
  | "patch-seal"
  | "grapple-latch"
  | "crate-bank"
  | "oxygen-warn"
  | "blackout"
  | "surface-break"
  | "ambient-deep";

export class DeepAudioController {
  private readonly audioElements = new Map<DeepAudioCue, HTMLAudioElement>();
  private ambienceElement: HTMLAudioElement | null = null;
  private readonly cueHistory: DeepAudioCue[] = [];

  async init(): Promise<void> {
    if (typeof window === "undefined") return;

    const cueMap: Record<DeepAudioCue, string> = {
      "sonar-ping": assets.deepRecoverySonarPingSfx.url,
      "sonar-return": assets.deepRecoverySonarReturnSfx.url,
      "hull-creak": assets.deepRecoveryHullCreakSfx.url,
      "breach-alarm": assets.deepRecoveryBreachAlarmSfx.url,
      "patch-seal": assets.deepRecoveryPatchSealSfx.url,
      "grapple-latch": assets.deepRecoveryGrappleLatchSfx.url,
      "crate-bank": assets.deepRecoveryCrateBankSfx.url,
      "oxygen-warn": assets.deepRecoveryOxygenWarnSfx.url,
      "blackout": assets.deepRecoveryBlackoutSfx.url,
      "surface-break": assets.deepRecoverySurfaceBreakSfx.url,
      "ambient-deep": assets.deepRecoveryAmbientDeepSfx.url
    };

    for (const [cue, url] of Object.entries(cueMap) as [DeepAudioCue, string][]) {
      const audio = new Audio(url);
      audio.preload = "auto";
      this.audioElements.set(cue, audio);
    }
  }

  playCue(cue: DeepAudioCue, volume = 1.0): void {
    this.cueHistory.push(cue);
    const audio = this.audioElements.get(cue);
    if (!audio) return;

    try {
      audio.currentTime = 0;
      audio.volume = Math.max(0, Math.min(1, volume * 0.8));
      audio.play().catch(() => {});
    } catch {
      // Audio autoplay policy fallback
    }
  }

  startAmbience(): void {
    const audio = this.audioElements.get("ambient-deep");
    if (!audio) return;
    this.ambienceElement = audio;
    audio.loop = true;
    audio.volume = 0.35;
    audio.play().catch(() => {});
  }

  stopAmbience(): void {
    if (this.ambienceElement) {
      this.ambienceElement.pause();
    }
  }

  getHistory(): readonly DeepAudioCue[] {
    return this.cueHistory;
  }
}
