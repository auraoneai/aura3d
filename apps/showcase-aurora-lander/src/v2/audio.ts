// Lander audio + cue log — extracted from boot.ts for 14-LOC.
import { createLanderAudio, type LanderAudioCue } from "../legacy/lander-audio";
import type { AuroraCtx } from "./state";

export function createLanderAudioBlock(ctx: AuroraCtx, reducedMotion: boolean) {
  const audio = createLanderAudio(reducedMotion);
  const audioCueLog: string[] = [];
  function pushCue(cue: LanderAudioCue): void {
    audioCueLog.push(cue);
    if (audioCueLog.length > 64) audioCueLog.shift();
    void audio.cue(cue).catch(() => undefined);
  }
  const unlockAudio = () => {
    if (ctx.audioUnlocked) return;
    ctx.audioUnlocked = true;
    void audio.unlock().then(() => pushCue("ambient-wind")).catch(() => undefined);
  };

  return { audio, audioCueLog, pushCue, unlockAudio };
}

export function wireLanderAudioUnlock(unlockAudio: () => void): void {
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
}
