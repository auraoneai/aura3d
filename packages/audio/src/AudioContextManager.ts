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
  addEventListener?(type: "statechange", listener: () => void): void;
  removeEventListener?(type: "statechange", listener: () => void): void;
}

export interface AudioContextManagerOptions {
  readonly context?: AudioContextLike;
  readonly createContext?: () => AudioContextLike;
}

export class AudioContextManager {
  private contextRef?: AudioContextLike;
  private attachedContext?: AudioContextLike;
  private unlocked = false;
  private intentionalSuspend = false;
  private readonly stateListeners = new Set<(state: AudioContextState) => void>();

  private readonly handleStateChange = (): void => {
    const raw = this.contextRef?.state;
    if (raw === "running") {
      this.intentionalSuspend = false;
    } else if (raw === "interrupted" || (raw === "suspended" && !this.intentionalSuspend) || raw === "closed") {
      this.unlocked = false;
    }
    const next = this.state;
    for (const listener of [...this.stateListeners]) {
      listener(next);
    }
  };

  constructor(private readonly options: AudioContextManagerOptions = {}) {
    this.contextRef = options.context;
    if (this.contextRef) {
      this.bindContext(this.contextRef);
    }
  }

  private bindContext(ctx: AudioContextLike): void {
    if (this.attachedContext === ctx) {
      return;
    }
    this.attachedContext?.removeEventListener?.("statechange", this.handleStateChange);
    this.attachedContext = ctx;
    ctx.addEventListener?.("statechange", this.handleStateChange);
  }

  get context(): AudioContextLike {
    if (!this.contextRef) {
      const createContext = this.options.createContext ?? (() => new AudioContext() as unknown as AudioContextLike);
      this.contextRef = createContext();
      this.bindContext(this.contextRef);
    }
    return this.contextRef;
  }

  get state(): AudioContextState {
    if (!this.contextRef) {
      return "locked";
    }
    const raw = this.contextRef.state;
    if (raw === "running") {
      return "running";
    }
    if (raw === "closed") {
      return "closed";
    }
    if (raw === "interrupted") {
      this.unlocked = false;
      return "locked";
    }
    if (raw === "suspended") {
      if (!this.intentionalSuspend) {
        this.unlocked = false;
        return "locked";
      }
      return this.unlocked ? "suspended" : "locked";
    }
    return this.unlocked ? "suspended" : "locked";
  }

  onStateChange(listener: (state: AudioContextState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  async unlock(): Promise<void> {
    if (this.state === "closed") {
      throw new Error("Cannot unlock a closed audio context");
    }
    this.intentionalSuspend = false;
    const ctx = this.context;
    await ctx.resume();
    this.unlocked = ctx.state === "running";
  }

  async suspend(): Promise<void> {
    if (this.state !== "closed") {
      this.intentionalSuspend = true;
      await this.context.suspend();
    }
  }

  async resume(): Promise<void> {
    await this.unlock();
  }

  async dispose(): Promise<void> {
    this.attachedContext?.removeEventListener?.("statechange", this.handleStateChange);
    this.attachedContext = undefined;
    this.stateListeners.clear();
    this.unlocked = false;
    this.intentionalSuspend = false;
    if (this.contextRef && this.contextRef.state !== "closed") {
      await this.contextRef.close();
    }
  }
}
