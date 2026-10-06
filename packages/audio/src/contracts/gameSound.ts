/**
 * C-25 — game sound (CONTRACTS.md). Provider: PRD 09. Flag: A3D_QR_GAME.
 * Pure types; engine binds the slot.
 */

export type GameBusId = "master" | "music" | "sfx" | "ui" | "ambience" | "voice";
export interface AudioAssetRef { readonly url: string; readonly hash: string; readonly license: string; readonly provenance: "sample" | "synth"; }
export interface SoundCueSpec { readonly asset?: AudioAssetRef | readonly AudioAssetRef[]; readonly play?: (ctx: AudioContext, dest: AudioNode) => void; readonly bus: GameBusId; readonly volumeDb?: number; readonly pitchJitterSemitones?: number; readonly gainJitterDb?: number; readonly maxVoices?: number; readonly cooldownMs?: number; readonly loop?: boolean; readonly spatial?: boolean; readonly priority?: number; }
export interface VoiceHandle { stop(fadeMs?: number): void; setPosition(p: readonly [number, number, number]): void; }
export interface LoopHandle extends VoiceHandle { setRate(rate: number, rampMs?: number): void; setGain(gainDb: number, rampMs?: number): void; }
export interface EngineLoopHandle { setRpm(rpm: number): void; setLoad(load01: number): void; setPosition(p: readonly [number, number, number]): void; stop(fadeMs?: number): void; }
export interface MusicController { play(track: string, o?: { crossfadeMs?: number }): void; setIntensity(level01: number): void; stinger(cue: string, o?: { quantize?: "beat" | "bar" | "none" }): void; stop(fadeMs?: number): void; }
export interface GameSoundProof { readonly contextState: AudioContextState | "none"; readonly voicesPlayed: number; readonly assetCues: number; readonly synthCues: number; readonly limiterEngaged: boolean; }
export interface GameSoundOptions<TCue extends string> { readonly cues: Readonly<Record<TCue, SoundCueSpec>>; readonly reverb?: "none" | "small-room" | "hall" | "street" | "hangar" | "underwater"; readonly voiceLimit?: number; }
export interface GameSound<TCue extends string> {
  play(cue: TCue, o?: { position?: readonly [number, number, number]; velocity?: readonly [number, number, number]; volumeDb?: number; rate?: number }): VoiceHandle | null;
  loop(cue: TCue, o?: { position?: readonly [number, number, number]; bus?: GameBusId }): LoopHandle | null;
  engine(spec: { readonly cue: TCue; readonly rpmRange: readonly [number, number]; readonly pitchRange: readonly [number, number] }): EngineLoopHandle;
  readonly music: MusicController;
  setListener(pose: { position: readonly [number, number, number]; forward: readonly [number, number, number]; up: readonly [number, number, number] }): void;
  setBusVolume(bus: GameBusId, v: number): void; setMuted(muted: boolean): void; duck(bus: GameBusId, ratio01: number, ms: number): void;
  suspend(): Promise<void>; resume(): Promise<void>; unlock(): Promise<void>; proof(): GameSoundProof; dispose(): void;
}
// createGameSoundEngine: implemented as the stub factory below (PR 0a).
// AudioSource.setPlaybackRate(rate: number, rampMs?: number): void  (packages/audio/src/AudioSource.ts, PRD 09)

class StubVoiceHandle implements VoiceHandle, LoopHandle {
  stop(_fadeMs?: number): void { /* noop */ }
  setPosition(_p: readonly [number, number, number]): void { /* noop */ }
  setRate(_rate: number, _rampMs?: number): void { /* noop */ }
  setGain(_gainDb: number, _rampMs?: number): void { /* noop */ }
}

class StubEngineLoopHandle implements EngineLoopHandle {
  setRpm(_rpm: number): void { /* noop */ }
  setLoad(_load01: number): void { /* noop */ }
  setPosition(_p: readonly [number, number, number]): void { /* noop */ }
  stop(_fadeMs?: number): void { /* noop */ }
}

class StubMusicController implements MusicController {
  play(_track: string, _o?: { crossfadeMs?: number }): void { /* noop */ }
  setIntensity(_level01: number): void { /* noop */ }
  stinger(_cue: string, _o?: { quantize?: "beat" | "bar" | "none" }): void { /* noop */ }
  stop(_fadeMs?: number): void { /* noop */ }
}

/** PR 0a stub engine: every call is safe and silent; `proof()` reports `contextState: "none"`. */
export function createGameSoundEngine<TCue extends string>(options: GameSoundOptions<TCue>): GameSound<TCue> {
  let voicesPlayed = 0;
  let muted = false;
  const proof: GameSoundProof = {
    contextState: "none",
    voicesPlayed: 0,
    assetCues: 0,
    synthCues: 0,
    limiterEngaged: false
  };
  return {
    play: (cue, _o) => {
      void cue;
      if (muted) return null;
      voicesPlayed += 1;
      return new StubVoiceHandle();
    },
    loop: (cue, _o) => {
      void cue;
      if (muted) return null;
      return new StubVoiceHandle();
    },
    engine: (_spec) => new StubEngineLoopHandle(),
    music: new StubMusicController(),
    setListener: (_pose) => { /* noop */ },
    setBusVolume: (_bus, _v) => { /* noop */ },
    setMuted: (m) => { muted = m; },
    duck: (_bus, _ratio01, _ms) => { /* noop */ },
    suspend: async () => { /* noop */ },
    resume: async () => { /* noop */ },
    unlock: async () => { /* noop */ },
    proof: () => ({ ...proof, voicesPlayed }),
    dispose: () => { /* noop */ }
  };
}
