import type { AudioContextLike } from "./AudioContextManager";
import type { Vec3Like } from "./AudioListener";

/** The Web Audio PannerNode default orientation (unit +X) when none is authored. */
const DEFAULT_ORIENTATION: Vec3Like = { x: 1, y: 0, z: 0 };

export interface SpatialAudioOptions {
  readonly context: AudioContextLike;
  readonly destination?: AudioNode;
  readonly position?: Vec3Like;
  /**
   * Direction the source's cone axis points (unit vector is not required).
   * Panner semantics: a listener located along this vector from the source
   * hears `coneInnerAngle` gain; behind the outer cone, `coneOuterGain`.
   */
  readonly orientation?: Vec3Like;
  readonly maxDistance?: number;
  readonly refDistance?: number;
  readonly rolloffFactor?: number;
  /** AU-02: was hard-wired to "inverse"; now authored per emitter (three.js parity). */
  readonly distanceModel?: DistanceModelType;
  readonly panningModel?: PanningModelType;
  /** Degrees. Inside this cone: no attenuation. Spec default 360 (omni). */
  readonly coneInnerAngle?: number;
  /** Degrees. Outside this cone: `coneOuterGain`. Spec default 360. */
  readonly coneOuterAngle?: number;
  /** Linear gain applied outside the outer cone, [0, 1]. Spec default 0. */
  readonly coneOuterGain?: number;
}

export class SpatialAudio {
  readonly panner: PannerNode;
  private orientationRef: Vec3Like = { ...DEFAULT_ORIENTATION };

  constructor(options: SpatialAudioOptions) {
    this.panner = options.context.createPanner();
    this.panner.panningModel = options.panningModel ?? "HRTF";
    this.panner.distanceModel = options.distanceModel ?? "inverse";
    this.panner.maxDistance = options.maxDistance ?? 10_000;
    this.panner.refDistance = options.refDistance ?? 1;
    this.panner.rolloffFactor = options.rolloffFactor ?? 1;
    this.panner.coneInnerAngle = options.coneInnerAngle ?? 360;
    this.panner.coneOuterAngle = options.coneOuterAngle ?? 360;
    this.panner.coneOuterGain = options.coneOuterGain ?? 0;
    this.panner.connect(options.destination ?? options.context.destination);
    this.setPosition(options.position ?? { x: 0, y: 0, z: 0 });
    if (options.orientation) {
      this.setOrientation(options.orientation);
    }
  }

  get orientation(): Vec3Like {
    return { ...this.orientationRef };
  }

  setPosition(position: Vec3Like): void {
    this.panner.positionX.value = position.x;
    this.panner.positionY.value = position.y;
    this.panner.positionZ.value = position.z;
  }

  /**
   * Point the emitter's cone axis. Prefers the `orientationX/Y/Z` AudioParams;
   * falls back to the legacy `setOrientation` for contexts (or minimal fakes)
   * that predate the AudioParam surface — the same dual path `syncListener`
   * uses for the listener.
   */
  setOrientation(orientation: Vec3Like): void {
    this.orientationRef = { ...orientation };
    const panner = this.panner as PannerNode & {
      setOrientation?: (x: number, y: number, z: number) => void;
    };
    if (panner.orientationX && panner.orientationY && panner.orientationZ) {
      panner.orientationX.value = orientation.x;
      panner.orientationY.value = orientation.y;
      panner.orientationZ.value = orientation.z;
      return;
    }
    panner.setOrientation?.(orientation.x, orientation.y, orientation.z);
  }

  dispose(): void {
    this.panner.disconnect();
  }
}
