import { createWingAudio, type WingAudioCue } from "../legacy/wing-audio";
import type { PatrolCtx } from "./state";

export function createPatrolAudioBlock(ctx: PatrolCtx) {
// ------------------------------------------------------------------ audio ---

const audio = createWingAudio();
const audioCueLog: string[] = [];
function pushCue(cue: WingAudioCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue);
}
function cueReady(name: string, gapFrames: number): boolean {
  const last = ctx.lastCueAt.get(name) ?? -1e9;
  if (ctx.frame - last < gapFrames) return false;
  ctx.lastCueAt.set(name, ctx.frame);
  return true;
}
const unlockAudio = () => void audio.unlock();

  return { audio, audioCueLog, pushCue, cueReady, unlockAudio };
}
