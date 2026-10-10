// Audio block — extracted from boot.ts for 14-LOC. Cue log + unlock gesture
// wiring unchanged; listeners attach on construction like before.
import { createSwarmAudio, type SwarmCue } from "../legacy/swarm-audio";

export function createSwarmAudioBlock() {
  const audio = createSwarmAudio();
  const audioCueLog: string[] = [];
  let audioUnlocked = false;
  function pushCue(cue: SwarmCue): void {
    audioCueLog.push(cue);
    if (audioCueLog.length > 64) audioCueLog.shift();
    void audio.cue(cue).catch(() => undefined);
  }
  const unlockAudio = () => {
    if (audioUnlocked) return;
    void audio.unlock().then(() => { audioUnlocked = true; }).catch(() => undefined);
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
  return { audio, audioCueLog, pushCue, unlockAudio };
}
