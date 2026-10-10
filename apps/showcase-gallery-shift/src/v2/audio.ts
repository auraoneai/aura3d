// Heist audio + cue log — extracted from boot.ts for 14-LOC.
import { createHeistAudio, type HeistAudioCue } from "../legacy/heist-audio";
import type { GalleryCtx } from "./state";

const MAX_CUE_LOG = 48;

export function createHeistAudioBlock(ctx: GalleryCtx) {
  const audio = createHeistAudio();
  const audioCueLog: string[] = [];
  const lastCueFrame = new Map<string, number>();
  function pushCue(cue: HeistAudioCue): void {
    void audio.cue(cue).catch(() => undefined);
    audioCueLog.push(cue);
    if (audioCueLog.length > MAX_CUE_LOG) audioCueLog.shift();
  }
  function cueReady(name: string, gapFrames: number): boolean {
    const last = lastCueFrame.get(name) ?? -999;
    if (ctx.frameCount - last < gapFrames) return false;
    lastCueFrame.set(name, ctx.frameCount);
    return true;
  }
  const unlockAudio = () => {
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    void audio.unlock().then(() => audio.startAmbient()).catch(() => undefined);
  };

  return { audio, audioCueLog, pushCue, cueReady, unlockAudio };
}
