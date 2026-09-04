import { AudioBus } from "./AudioBus";
import type { AudioContextLike } from "./AudioContextManager";
import { AudioMixer } from "./AudioMixer";

export interface GameMixerBusLevel {
  readonly name: string;
  readonly volume: number;
  readonly muted: boolean;
  /**
   * Effective output gain (0 when muted, else volume). This is the *target* gain,
   * not a metered loudness reading — `metered` is false unless an analyser is
   * attached, so evidence never claims audible output it did not measure.
   */
  readonly level: number;
  readonly metered: false;
}

export interface GameMixerEvidence {
  readonly kind: "game-mixer-evidence";
  readonly music: GameMixerBusLevel;
  readonly sfx: GameMixerBusLevel;
  readonly voice: GameMixerBusLevel;
  readonly duckingActive: boolean;
  readonly duckingRatio: number;
  readonly muted: boolean;
  readonly errors: readonly string[];
}

export interface GameMixerOptions {
  readonly musicVolume?: number;
  readonly sfxVolume?: number;
  readonly voiceVolume?: number;
  readonly duckingRatio?: number;
  readonly muted?: boolean;
}

export interface GameMixer {
  readonly mixer: AudioMixer;
  readonly music: AudioBus;
  readonly sfx: AudioBus;
  readonly voice: AudioBus;
  setMusicVolume(value: number): GameMixerEvidence;
  setSfxVolume(value: number): GameMixerEvidence;
  setVoiceVolume(value: number): GameMixerEvidence;
  /** Duck the music bus while dialogue/voice is active; restores the base volume after. */
  setDialogueActive(active: boolean): GameMixerEvidence;
  setDuckingRatio(ratio: number): GameMixerEvidence;
  setMuted(muted: boolean): GameMixerEvidence;
  evidence(): GameMixerEvidence;
}

function validateVolume(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function busLevel(bus: AudioBus): GameMixerBusLevel {
  return {
    name: bus.name,
    volume: bus.volume,
    muted: bus.isMuted,
    level: bus.isMuted ? 0 : bus.volume,
    metered: false
  };
}

/**
 * Game mixers on top of `AudioMixer`: music/sfx/voice buses with dialogue
 * ducking and a single mute switch. Ducking scales the *effective* music gain
 * while the authored base volume is retained for restore.
 */
export function createGameMixer(context: AudioContextLike, options: GameMixerOptions = {}): GameMixer {
  const mixer = new AudioMixer(context);
  const music = mixer.createBus("music");
  const sfx = mixer.createBus("sfx");
  const voice = mixer.createBus("voice");
  let baseMusicVolume = options.musicVolume ?? 0.55;
  let duckingRatio = options.duckingRatio ?? 0.35;
  let duckingActive = false;
  let muted = false;
  const errors: string[] = [];
  validateVolume(baseMusicVolume, "Game mixer musicVolume");
  validateVolume(options.sfxVolume ?? 0.9, "Game mixer sfxVolume");
  validateVolume(options.voiceVolume ?? 1, "Game mixer voiceVolume");
  if (!Number.isFinite(duckingRatio) || duckingRatio < 0 || duckingRatio > 1) {
    throw new Error("Game mixer duckingRatio must be between 0 and 1");
  }
  music.setVolume(baseMusicVolume);
  sfx.setVolume(options.sfxVolume ?? 0.9);
  voice.setVolume(options.voiceVolume ?? 1);

  const applyMusicGain = (): void => {
    music.setVolume(duckingActive ? baseMusicVolume * duckingRatio : baseMusicVolume);
  };

  const snapshot = (): GameMixerEvidence => ({
    kind: "game-mixer-evidence",
    music: busLevel(music),
    sfx: busLevel(sfx),
    voice: busLevel(voice),
    duckingActive,
    duckingRatio,
    muted,
    errors: [...errors]
  });

  const gameMixer: GameMixer = {
    mixer,
    music,
    sfx,
    voice,
    setMusicVolume(value) {
      validateVolume(value, "Game mixer musicVolume");
      baseMusicVolume = value;
      applyMusicGain();
      return snapshot();
    },
    setSfxVolume(value) {
      validateVolume(value, "Game mixer sfxVolume");
      sfx.setVolume(value);
      return snapshot();
    },
    setVoiceVolume(value) {
      validateVolume(value, "Game mixer voiceVolume");
      voice.setVolume(value);
      return snapshot();
    },
    setDialogueActive(active) {
      duckingActive = active;
      applyMusicGain();
      return snapshot();
    },
    setDuckingRatio(ratio) {
      if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        throw new Error("Game mixer duckingRatio must be between 0 and 1");
      }
      duckingRatio = ratio;
      applyMusicGain();
      return snapshot();
    },
    setMuted(value) {
      muted = value;
      mixer.master.mute(value);
      return snapshot();
    },
    evidence() {
      return snapshot();
    }
  };

  if (options.muted) gameMixer.setMuted(true);
  return gameMixer;
}

export type FocusMutePolicy = "mute-on-blur" | "duck-on-blur" | "none";

export interface FocusPolicyHandlers {
  readonly policy: FocusMutePolicy;
  readonly onBlur: () => void;
  readonly onFocus: () => void;
}

export interface FocusEventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Mute/focus policy for a game mixer. Blur ducks or mutes the master bus;
 * focus restores the pre-blur state. Returns a detach function.
 */
export function attachFocusPolicy(
  target: FocusEventTargetLike,
  mixer: GameMixer,
  policy: FocusMutePolicy = "duck-on-blur"
): () => void {
  const handlers = focusHandlersForMixer(mixer, policy);
  const onBlur = (): void => handlers.onBlur();
  const onFocus = (): void => handlers.onFocus();
  target.addEventListener("blur", onBlur);
  target.addEventListener("focus", onFocus);
  return () => {
    target.removeEventListener("blur", onBlur);
    target.removeEventListener("focus", onFocus);
    handlers.onFocus();
  };
}

export function focusHandlersForMixer(mixer: GameMixer, policy: FocusMutePolicy): FocusPolicyHandlers {
  let blurred = false;
  return {
    policy,
    onBlur: () => {
      if (blurred || policy === "none") return;
      blurred = true;
      if (policy === "mute-on-blur") mixer.setMuted(true);
      else mixer.setDialogueActive(true);
    },
    onFocus: () => {
      if (!blurred) return;
      blurred = false;
      if (policy === "mute-on-blur") mixer.setMuted(false);
      else mixer.setDialogueActive(false);
    }
  };
}
