/**
 * Deep Recovery audio runtime — PRD-09 wave-3: raw `HTMLAudioElement` replaced
 * by `createGameSoundEngine` (`sound.cue`/`sound.engine`). The sub's propulsion
 * is a real engine loop with live rpm pitch driven by the throttle axis.
 */
import { createGameSoundEngine } from "@aura3d/audio";
import { assets } from "../../../../src/aura-assets";

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
  | "ambient-deep"
  | "thruster";

export interface DeepThrusterLoop {
  readonly start: () => void;
  readonly stop: () => void;
  /** Live pitch: |throttle| 0..1 mapped onto idle->max rpm. */
  readonly setThrottle: (throttle01: number) => void;
  readonly running: () => boolean;
}

export class DeepAudioController {
  private readonly cueHistory: DeepAudioCue[] = [];
  private readonly sound = createGameSoundEngine<DeepAudioCue>({
    buses: { sfx: 0.8, ambience: 0.4 },
    cues: {
      "sonar-ping": { id: "sonar-ping", bus: "sfx", asset: { url: assets.deepRecoverySonarPingSfx.url } },
      "sonar-return": { id: "sonar-return", bus: "sfx", asset: { url: assets.deepRecoverySonarReturnSfx.url } },
      "hull-creak": { id: "hull-creak", bus: "sfx", asset: { url: assets.deepRecoveryHullCreakSfx.url } },
      "breach-alarm": { id: "breach-alarm", bus: "sfx", priority: "high", asset: { url: assets.deepRecoveryBreachAlarmSfx.url } },
      "patch-seal": { id: "patch-seal", bus: "sfx", asset: { url: assets.deepRecoveryPatchSealSfx.url } },
      "grapple-latch": { id: "grapple-latch", bus: "sfx", asset: { url: assets.deepRecoveryGrappleLatchSfx.url } },
      "crate-bank": { id: "crate-bank", bus: "sfx", asset: { url: assets.deepRecoveryCrateBankSfx.url } },
      "oxygen-warn": { id: "oxygen-warn", bus: "sfx", priority: "high", asset: { url: assets.deepRecoveryOxygenWarnSfx.url } },
      "blackout": { id: "blackout", bus: "sfx", priority: "critical", asset: { url: assets.deepRecoveryBlackoutSfx.url } },
      "surface-break": { id: "surface-break", bus: "sfx", asset: { url: assets.deepRecoverySurfaceBreakSfx.url } },
      "ambient-deep": { id: "ambient-deep", bus: "ambience", loop: true, volume: 0.35, asset: { url: assets.deepRecoveryAmbientDeepSfx.url } },
      // The sub grind loop reuses the authored hull-creak sample as the motor
      // layer (pitch-shifted down for the idle end of the rpm range).
      "thruster": { id: "thruster", bus: "sfx", asset: { url: assets.deepRecoveryHullCreakSfx.url } }
    }
  });
  private readonly thrusterLoop = this.sound.engine({
    cue: "thruster",
    rpmRange: [260, 1500],
    pitchRange: [0.7, 1.35]
  });
  private thrusterActive = false;
  private ambiencePlaying = false;
  private ambienceHandle: { stop(fadeMs?: number): void } | null = null;

  async init(): Promise<void> {
    // No eager preload — the engine decodes on first play after unlock.
    return Promise.resolve();
  }

  playCue(cue: DeepAudioCue, volume = 1.0): void {
    this.cueHistory.push(cue);
    void this.sound.unlock().then(() => this.sound.play(cue, { volumeDb: 20 * Math.log10(Math.max(0.01, volume * 0.8)) }));
  }

  startAmbience(): void {
    if (this.ambiencePlaying) return;
    this.ambiencePlaying = true;
    void this.sound.unlock().then(() => {
      this.ambienceHandle = this.sound.loop("ambient-deep");
    });
  }

  stopAmbience(): void {
    this.ambiencePlaying = false;
    this.ambienceHandle?.stop(120);
    this.ambienceHandle = null;
  }

  readonly thruster: DeepThrusterLoop = {
    start: () => {
      if (this.thrusterActive) return;
      this.thrusterActive = true;
      void this.sound.unlock().then(() => this.thrusterLoop.start());
    },
    stop: () => {
      if (!this.thrusterActive) return;
      this.thrusterActive = false;
      this.thrusterLoop.stop();
    },
    setThrottle: (t) => {
      const x = Math.max(0, Math.min(1, t));
      this.thrusterLoop.setRpm(260 + (1500 - 260) * x);
      this.thrusterLoop.setLoad(x);
    },
    running: () => this.thrusterActive
  };

  getHistory(): readonly DeepAudioCue[] {
    return this.cueHistory;
  }
}
