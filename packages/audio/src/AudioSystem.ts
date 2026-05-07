import { AudioContextManager, type AudioContextManagerOptions } from "./AudioContextManager";
import { AudioMixer } from "./AudioMixer";

export class AudioSystem {
  readonly contextManager: AudioContextManager;
  private mixerRef?: AudioMixer;

  constructor(options: AudioContextManagerOptions = {}) {
    this.contextManager = new AudioContextManager(options);
  }

  get mixer(): AudioMixer {
    this.mixerRef ??= new AudioMixer(this.contextManager.context);
    return this.mixerRef;
  }

  async unlock(): Promise<void> {
    await this.contextManager.unlock();
  }

  async suspend(): Promise<void> {
    await this.contextManager.suspend();
  }

  async resume(): Promise<void> {
    await this.contextManager.resume();
  }

  async dispose(): Promise<void> {
    this.mixerRef?.dispose();
    this.mixerRef = undefined;
    await this.contextManager.dispose();
  }
}
