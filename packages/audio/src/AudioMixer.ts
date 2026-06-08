import { AudioBus } from "./AudioBus";
import type { AudioContextLike } from "./AudioContextManager";

export class AudioMixer {
  readonly master: AudioBus;
  private readonly buses = new Map<string, AudioBus>();

  constructor(private readonly context: AudioContextLike) {
    this.master = new AudioBus("master", context);
    this.buses.set(this.master.name, this.master);
  }

  createBus(name: string, destination: AudioNode = this.master.input): AudioBus {
    if (this.buses.has(name)) {
      throw new Error(`Audio bus already exists: ${name}`);
    }
    const bus = new AudioBus(name, this.context, destination);
    this.buses.set(name, bus);
    return bus;
  }

  getBus(name: string): AudioBus {
    const bus = this.buses.get(name);
    if (!bus) {
      throw new Error(`Unknown audio bus: ${name}`);
    }
    return bus;
  }

  hasBus(name: string): boolean {
    return this.buses.has(name);
  }

  listBuses(): readonly AudioBus[] {
    return [...this.buses.values()];
  }

  evidence(options: { readonly unlocked?: boolean; readonly errors?: readonly string[] } = {}): AudioMixerEvidence {
    return createAudioMixerEvidence(this, options);
  }

  dispose(): void {
    for (const bus of [...this.buses.values()].reverse()) {
      bus.dispose();
    }
    this.buses.clear();
  }
}

export interface AudioMixerBusEvidence {
  readonly name: string;
  readonly volume: number;
  readonly muted: boolean;
}

export interface AudioMixerEvidence {
  readonly kind: "audio-mixer-evidence";
  readonly unlocked: boolean;
  readonly busCount: number;
  readonly buses: readonly AudioMixerBusEvidence[];
  readonly errors: readonly string[];
}

export interface AnimationAudioMixer {
  readonly mixer: AudioMixer;
  readonly buses: {
    readonly voice: AudioBus;
    readonly music: AudioBus;
    readonly sfx: AudioBus;
    readonly ambient: AudioBus;
  };
  evidence(options?: { readonly unlocked?: boolean; readonly errors?: readonly string[] }): AudioMixerEvidence;
}

export interface AnimationAudioMixerOptions {
  readonly voiceVolume?: number;
  readonly musicVolume?: number;
  readonly sfxVolume?: number;
  readonly ambientVolume?: number;
  readonly muted?: boolean;
}

export function createAnimationAudioMixer(
  context: AudioContextLike,
  options: AnimationAudioMixerOptions = {}
): AnimationAudioMixer {
  const mixer = new AudioMixer(context);
  const voice = mixer.createBus("voice");
  const music = mixer.createBus("music");
  const sfx = mixer.createBus("sfx");
  const ambient = mixer.createBus("ambient");
  voice.setVolume(options.voiceVolume ?? 1);
  music.setVolume(options.musicVolume ?? 0.55);
  sfx.setVolume(options.sfxVolume ?? 0.9);
  ambient.setVolume(options.ambientVolume ?? 0.45);
  if (options.muted) {
    for (const bus of [mixer.master, voice, music, sfx, ambient]) {
      bus.mute(true);
    }
  }
  return {
    mixer,
    buses: { voice, music, sfx, ambient },
    evidence: (evidenceOptions = {}) => mixer.evidence(evidenceOptions)
  };
}

export function createAudioMixerEvidence(
  mixer: AudioMixer,
  options: { readonly unlocked?: boolean; readonly errors?: readonly string[] } = {}
): AudioMixerEvidence {
  return {
    kind: "audio-mixer-evidence",
    unlocked: options.unlocked ?? false,
    busCount: mixer.listBuses().length,
    buses: mixer.listBuses().map((bus) => ({
      name: bus.name,
      volume: bus.volume,
      muted: bus.isMuted
    })),
    errors: [...(options.errors ?? [])]
  };
}
