// Audio block — extracted from boot.ts for 14-LOC.
import { createBlockfallReactorAudio } from "../gameplay/reactor-audio";
import type { BlockfallAudioCue } from "../gameplay/blockfall-audio-manifest";

export function createBlockfallAudioBlock(reducedMotion: boolean) {
  const audio = createBlockfallReactorAudio(reducedMotion);
  const audioCueLog: string[] = [];
  function pushCue(cue: BlockfallAudioCue): void {
    audioCueLog.push(cue);
    if (audioCueLog.length > 64) audioCueLog.shift();
    void audio.cue(cue).catch(() => undefined);
  }
  const unlockAudio = () => void audio.unlock();
  return { audio, audioCueLog, pushCue, unlockAudio };
}
