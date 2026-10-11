// Audio controller + cue log — extracted from boot.ts for 14-LOC.
import { instrumentAudio } from "./audio-proof";
import { DeepAudioController } from "../legacy/deep-audio";
import type { DeepAudioCue } from "../legacy/deep-audio";

export function createDeepAudioBlock() {
  const audio = instrumentAudio(new DeepAudioController(), { playCue: null, startAmbience: "ambient-deep" });
  void audio.init();
  const audioCueLog: string[] = [];
  type DeepAudioCue = Parameters<DeepAudioController["playCue"]>[0];
  function pushCue(cue: DeepAudioCue, volume = 0.9): void {
    audioCueLog.push(cue);
    if (audioCueLog.length > 64) audioCueLog.shift();
    audio.playCue(cue, volume);
  }
  const unlockAudio = () => void audio.startAmbience();
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });

  return { audio, audioCueLog, pushCue, unlockAudio };
}
