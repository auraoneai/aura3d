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
  /**
   * Configure iOS/Safari `navigator.audioSession.type` on unlock/resume so Web
   * Audio is treated as intentional media playback (bypasses hardware silent
   * switch and enables AirPlay/Screen Mirroring audio routing). Defaults to
   * `"playback"`; pass `false` to disable.
   */
  readonly audioSessionType?: "playback" | "ambient" | "solo-ambient" | "transient" | "transient-solo" | "play-and-record" | false;
  /**
   * Maintain a silent looped `<audio>` element (`disableRemotePlayback = true`,
   * `x-webkit-airplay="deny"`) while unlocked in browser DOM environments so
   * iOS/macOS Safari keeps Web Audio bound to an active media playback session
   * without hijacking Screen Mirroring / AirPlay media handoff. Defaults to `true`.
   */
  readonly airplayKeepalive?: boolean;
}

const AIRPLAY_BRIDGE_KEY = Symbol.for("aura3d.airplayKeepaliveBridge");

export interface AirplayKeepaliveBridge {
  acquire(): void;
  release(): void;
  play(): void;
  pause(): void;
}

function buildSilentWavDataUri(): string {
  // 0.25s @ 8000 Hz, 16-bit mono PCM (all-zero digital silence, zero DC click).
  const sampleRate = 8000;
  const numSamples = 2000;
  const dataBytes = numSamples * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  if (typeof globalThis.btoa === "function") {
    return `data:audio/wav;base64,${globalThis.btoa(binary)}`;
  }
  return "";
}

function configureAudioSession(sessionType: Exclude<AudioContextManagerOptions["audioSessionType"], false | undefined>): void {
  try {
    const nav = Reflect.get(globalThis, "navigator") as unknown;
    if (!nav || typeof nav !== "object") return;
    const session = Reflect.get(nav, "audioSession") as unknown;
    if (!session || typeof session !== "object") return;
    if (Reflect.get(session, "type") !== sessionType) {
      Reflect.set(session, "type", sessionType);
    }
  } catch {
    // Ignore environments where navigator.audioSession is absent or read-only.
  }
}

function getSharedAirplayBridge(): AirplayKeepaliveBridge | null {
  const doc = Reflect.get(globalThis, "document") as Document | undefined;
  if (!doc || typeof doc.createElement !== "function") return null;
  const existing = Reflect.get(globalThis, AIRPLAY_BRIDGE_KEY) as AirplayKeepaliveBridge | undefined;
  if (existing && typeof existing.acquire === "function" && typeof existing.play === "function") {
    return existing;
  }

  let refs = 0;
  let element: HTMLAudioElement | null = null;
  let silentSrc: string | null = null;

  const ensureElement = (): HTMLAudioElement | null => {
    if (element) return element;
    const currentDoc = Reflect.get(globalThis, "document") as Document | undefined;
    if (!currentDoc || typeof currentDoc.createElement !== "function") return null;
    if (silentSrc === null) silentSrc = buildSilentWavDataUri();
    if (!silentSrc) return null;
    try {
      const el = currentDoc.createElement("audio");
      el.loop = true;
      el.preload = "auto";
      el.muted = false;
      el.volume = 1;
      el.hidden = true;
      if ("disableRemotePlayback" in el) {
        el.disableRemotePlayback = true;
      }
      if (el.style) {
        el.style.display = "none";
      }
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.setAttribute("x-webkit-airplay", "deny");
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("data-a3d-airplay-keepalive", "true");
      if (currentDoc.body && typeof currentDoc.body.appendChild === "function") {
        currentDoc.body.appendChild(el);
      }
      el.src = silentSrc;
      element = el;
      return element;
    } catch {
      return null;
    }
  };

  const bridge: AirplayKeepaliveBridge = {
    acquire(): void {
      refs += 1;
    },
    release(): void {
      refs = Math.max(0, refs - 1);
      if (refs > 0 || !element) return;
      try {
        element.pause();
        element.removeAttribute("src");
        element.load();
        if (typeof element.remove === "function") {
          element.remove();
        }
      } catch {
        // Ignore cleanup errors on minimal DOM fakes.
      }
      element = null;
    },
    play(): void {
      const el = ensureElement();
      if (!el || typeof el.play !== "function") return;
      try {
        const result = el.play();
        if (result && typeof result.catch === "function") {
          void result.catch(() => undefined);
        }
      } catch {
        // Ignore playback rejections when no user gesture or audio device is present.
      }
    },
    pause(): void {
      if (!element || typeof element.pause !== "function") return;
      try {
        element.pause();
      } catch {
        // Ignore pause errors on minimal DOM fakes.
      }
    }
  };

  Reflect.set(globalThis, AIRPLAY_BRIDGE_KEY, bridge);
  return bridge;
}

function isPageHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden" || document.hidden === true;
}

export class AudioContextManager {
  private static sharedInstance: AudioContextManager | null = null;

  /** Shared page-wide `AudioContextManager` so multiple SFX/music subsystems share one `AudioContext`. */
  static shared(options?: AudioContextManagerOptions): AudioContextManager {
    if (!AudioContextManager.sharedInstance || AudioContextManager.sharedInstance.state === "closed") {
      AudioContextManager.sharedInstance = new AudioContextManager(options);
    }
    return AudioContextManager.sharedInstance;
  }

  private contextRef?: AudioContextLike;
  private attachedContext?: AudioContextLike;
  private unlocked = false;
  private everUnlocked = false;
  private interrupted = false;
  private intentionalSuspend = false;
  private visibilitySuspended = false;
  private airplayBridge: AirplayKeepaliveBridge | null = null;
  private bridgeAcquired = false;
  private readonly stateListeners = new Set<(state: AudioContextState) => void>();

  private readonly handleVisibilityChange = (): void => {
    if (isPageHidden()) {
      this.pauseAirplayBridge();
      if (this.contextRef && this.contextRef.state === "running" && !this.intentionalSuspend) {
        this.visibilitySuspended = true;
        void this.contextRef.suspend().catch(() => undefined);
      }
      return;
    }
    if (this.visibilitySuspended && !this.intentionalSuspend && this.contextRef && this.contextRef.state === "suspended") {
      this.visibilitySuspended = false;
      if (this.everUnlocked) {
        this.ensurePlaybackRouting(true);
      }
      void this.contextRef.resume().catch(() => undefined);
    }
  };

  private readonly handlePageHide = (): void => {
    this.pauseAirplayBridge();
    if (this.contextRef && this.contextRef.state === "running" && !this.intentionalSuspend) {
      this.visibilitySuspended = true;
      void this.contextRef.suspend().catch(() => undefined);
    }
  };

  private readonly handleStateChange = (): void => {
    const raw = this.contextRef?.state;
    const wasInterrupted = this.interrupted;
    if (raw === "running") {
      this.interrupted = false;
      this.intentionalSuspend = false;
      this.visibilitySuspended = false;
      if (isPageHidden()) {
        this.pauseAirplayBridge();
        this.visibilitySuspended = true;
        void this.contextRef?.suspend().catch(() => undefined);
      } else if (this.everUnlocked) {
        this.unlocked = true;
        this.ensurePlaybackRouting(true);
      }
    } else if (raw === "interrupted") {
      this.interrupted = true;
      this.unlocked = false;
    } else if (raw === "suspended" && !this.intentionalSuspend && !this.visibilitySuspended) {
      this.interrupted = false;
      this.unlocked = false;
      if (wasInterrupted && this.everUnlocked && this.contextRef && !isPageHidden()) {
        // After an iOS AirPlay/Screen Mirroring interruption finishes, WebKit
        // transitions interrupted -> suspended; try a non-blocking resume so
        // playback recovers automatically when the playback AudioSession allows it.
        this.ensureAudioSession();
        void this.contextRef.resume().catch(() => undefined);
      }
    } else if (raw === "closed") {
      this.interrupted = false;
      this.unlocked = false;
      this.visibilitySuspended = false;
      this.pauseAirplayBridge();
    }
    const next = this.state;
    for (const listener of [...this.stateListeners]) {
      listener(next);
    }
  };

  constructor(private readonly options: AudioContextManagerOptions = {}) {
    this.ensureAudioSession();
    this.contextRef = options.context;
    if (this.contextRef) {
      this.bindContext(this.contextRef);
    }
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", this.handlePageHide);
    }
  }

  private ensureAudioSession(): void {
    const type = this.options.audioSessionType;
    if (type === false) return;
    configureAudioSession(type ?? "playback");
  }

  private ensurePlaybackRouting(playBridge: boolean): void {
    this.ensureAudioSession();
    if (this.options.airplayKeepalive === false) return;
    if (!this.airplayBridge) {
      this.airplayBridge = getSharedAirplayBridge();
    }
    if (!this.airplayBridge) return;
    if (!this.bridgeAcquired) {
      this.airplayBridge.acquire();
      this.bridgeAcquired = true;
    }
    if (playBridge) {
      this.airplayBridge.play();
    }
  }

  private pauseAirplayBridge(): void {
    this.airplayBridge?.pause();
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
      this.ensureAudioSession();
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
      if (this.visibilitySuspended) {
        return this.everUnlocked || this.unlocked ? "suspended" : "locked";
      }
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
    this.interrupted = false;
    if (isPageHidden()) {
      this.visibilitySuspended = true;
      this.pauseAirplayBridge();
      const ctx = this.context;
      if (ctx.state === "running") {
        await ctx.suspend().catch(() => undefined);
      }
      return;
    }
    this.visibilitySuspended = false;
    this.ensurePlaybackRouting(true);
    const ctx = this.context;
    await ctx.resume();
    this.unlocked = ctx.state === "running";
    if (this.unlocked) {
      this.everUnlocked = true;
    } else {
      this.pauseAirplayBridge();
    }
  }

  async suspend(): Promise<void> {
    if (this.state !== "closed") {
      this.intentionalSuspend = true;
      this.pauseAirplayBridge();
      await this.context.suspend();
    }
  }

  async resume(): Promise<void> {
    await this.unlock();
  }

  async dispose(): Promise<void> {
    if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("pagehide", this.handlePageHide);
    }
    if (AudioContextManager.sharedInstance === this) {
      AudioContextManager.sharedInstance = null;
    }
    this.attachedContext?.removeEventListener?.("statechange", this.handleStateChange);
    this.attachedContext = undefined;
    this.stateListeners.clear();
    this.unlocked = false;
    this.everUnlocked = false;
    this.interrupted = false;
    this.intentionalSuspend = false;
    this.visibilitySuspended = false;
    if (this.bridgeAcquired && this.airplayBridge) {
      this.airplayBridge.release();
      this.bridgeAcquired = false;
    }
    this.airplayBridge = null;
    if (this.contextRef && this.contextRef.state !== "closed") {
      await this.contextRef.close();
    }
  }
}
