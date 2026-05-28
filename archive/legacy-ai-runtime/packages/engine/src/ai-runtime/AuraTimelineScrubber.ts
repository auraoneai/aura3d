import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "@aura3d/rendering";

export interface AuraTimelineScrubberState {
  readonly durationSeconds: number;
  readonly currentSeconds: number;
  readonly playing: boolean;
  readonly normalizedTime: number;
}

export interface AuraTimelineScrubber {
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  play(): AuraTimelineScrubberState;
  pause(): AuraTimelineScrubberState;
  reset(): AuraTimelineScrubberState;
  scrubTo(seconds: number): AuraTimelineScrubberState;
  tick(deltaSeconds: number): AuraTimelineScrubberState;
  snapshot(): AuraTimelineScrubberState;
}

export function createAuraTimelineScrubber(durationSeconds: number): AuraTimelineScrubber {
  const duration = Math.max(0.001, durationSeconds);
  let currentSeconds = 0;
  let playing = false;
  const snapshot = (): AuraTimelineScrubberState => ({
    durationSeconds: duration,
    currentSeconds,
    playing,
    normalizedTime: currentSeconds / duration
  });
  return {
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: "timeline:scrubber",
      feature: "timeline",
      label: "Timeline scrubber",
      source: "renderer-timeline",
      diagnostics: ["Timeline playback/scrubbing is runtime state, not a decorative DOM progress bar."]
    }),
    play() {
      playing = true;
      return snapshot();
    },
    pause() {
      playing = false;
      return snapshot();
    },
    reset() {
      currentSeconds = 0;
      playing = false;
      return snapshot();
    },
    scrubTo(seconds: number) {
      currentSeconds = clamp(seconds, 0, duration);
      return snapshot();
    },
    tick(deltaSeconds: number) {
      if (playing) currentSeconds = clamp(currentSeconds + Math.max(0, deltaSeconds), 0, duration);
      if (currentSeconds >= duration) playing = false;
      return snapshot();
    },
    snapshot
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
