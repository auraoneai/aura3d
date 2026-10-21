import type { AudioContextLike } from "./AudioContextManager";
import { syncListener, type ListenerLike } from "./game-sound/listenerSync";

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AudioListenerOptions {
  /**
   * Bind a live context so `setTransform` also writes into `context.listener`
   * (the native Web Audio listener) through `syncListener` — the shared frame
   * driver. Without a context the pose is stored only (headless-safe).
   */
  readonly context?: AudioContextLike;
}

/**
 * AU-01: the listener pose owner. `setTransform` stores the pose and, when a
 * context is bound, pushes it into `ctx.listener` via `syncListener`
 * (`positionX…upZ` AudioParams where they exist, `setPosition`/`setOrientation`
 * legacy fallback otherwise). `SceneAudioBridge.update()` keeps calling
 * `setTransform` per frame, so the native listener follows the bound node.
 */
export class AudioListener {
  position: Vec3Like = { x: 0, y: 0, z: 0 };
  forward: Vec3Like = { x: 0, y: 0, z: -1 };
  up: Vec3Like = { x: 0, y: 1, z: 0 };

  private readonly context?: AudioContextLike;

  constructor(options: AudioListenerOptions = {}) {
    this.context = options.context;
  }

  /** The native `ctx.listener` this pose writes into, when a context is bound. */
  get nativeListener(): ListenerLike | undefined {
    // Same access pattern as `GameSoundEngine.setListener` — `AudioContextLike`
    // stays minimal, so the real-context `listener` is reached through a cast.
    return (this.context as unknown as { listener?: ListenerLike } | undefined)?.listener;
  }

  setTransform(position: Vec3Like, forward: Vec3Like = this.forward, up: Vec3Like = this.up): void {
    this.position = { ...position };
    this.forward = { ...forward };
    this.up = { ...up };
    this.sync();
  }

  /**
   * Push the stored pose into `ctx.listener`. Returns the path taken —
   * "audioparam", "legacy", or "none" when no context/listener is bound.
   * Safe to call every frame; `syncListener` ramps with τ = 20 ms.
   */
  sync(): "audioparam" | "legacy" | "none" {
    const listener = this.nativeListener;
    if (!listener) return "none";
    return syncListener(listener, this.context?.currentTime ?? 0, {
      position: this.position,
      forward: this.forward,
      up: this.up
    });
  }
}
