// Audio controller + cue log — extracted from boot.ts for 14-LOC.
import { createGravityPostAudio } from "../legacy/post-audio";

export function createPostAudioBlock() {
  const audio = createGravityPostAudio();
  const audioCueLog: string[] = [];
  function pushCue(cue: Parameters<typeof audio.play>[0]): void {
    audioCueLog.push(cue);
    if (audioCueLog.length > 64) audioCueLog.shift();
    audio.play(cue);
  }
  const unlockAudio = () => void audio.unlock();
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });

  return { audio, audioCueLog, pushCue, unlockAudio };
}
