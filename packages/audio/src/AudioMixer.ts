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

  dispose(): void {
    for (const bus of [...this.buses.values()].reverse()) {
      bus.dispose();
    }
    this.buses.clear();
  }
}
