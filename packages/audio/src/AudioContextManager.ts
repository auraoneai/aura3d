export type AudioContextState = "locked" | "running" | "suspended" | "closed";

export interface AudioContextLike {
  readonly state: AudioContextState | string;
  readonly destination: AudioNode;
  currentTime: number;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
  createPanner(): PannerNode;
  createBiquadFilter(): BiquadFilterNode;
  createConvolver(): ConvolverNode;
  /**
   * Optional like the other non-essential factories on the package's wider
   * `SoundGraphContext`: real contexts provide it; minimal fakes may not.
   * `AudioAnalyser` throws a clear error when it is absent.
   */
  createAnalyser?(): AnalyserNode;
}

export interface AudioContextManagerOptions {
  readonly context?: AudioContextLike;
  readonly createContext?: () => AudioContextLike;
}

export class AudioContextManager {
  private contextRef?: AudioContextLike;
  private unlocked = false;

  constructor(private readonly options: AudioContextManagerOptions = {}) {
    this.contextRef = options.context;
  }

  get context(): AudioContextLike {
    if (!this.contextRef) {
      const createContext = this.options.createContext ?? (() => new AudioContext() as unknown as AudioContextLike);
      this.contextRef = createContext();
    }
    return this.contextRef;
  }

  get state(): AudioContextState {
    if (!this.contextRef) {
      return "locked";
    }
    if (this.contextRef.state === "running") {
      return "running";
    }
    if (this.contextRef.state === "closed") {
      return "closed";
    }
    return this.unlocked ? "suspended" : "locked";
  }

  async unlock(): Promise<void> {
    if (this.state === "closed") {
      throw new Error("Cannot unlock a closed audio context");
    }
    await this.context.resume();
    this.unlocked = true;
  }

  async suspend(): Promise<void> {
    if (this.state !== "closed") {
      await this.context.suspend();
    }
  }

  async resume(): Promise<void> {
    await this.unlock();
  }

  async dispose(): Promise<void> {
    if (this.contextRef && this.contextRef.state !== "closed") {
      await this.contextRef.close();
    }
  }
}
