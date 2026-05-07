import type { AudioContextLike } from "./AudioContextManager";
import type { Vec3Like } from "./AudioListener";

export interface SpatialAudioOptions {
  readonly context: AudioContextLike;
  readonly destination?: AudioNode;
  readonly position?: Vec3Like;
  readonly maxDistance?: number;
  readonly refDistance?: number;
  readonly rolloffFactor?: number;
}

export class SpatialAudio {
  readonly panner: PannerNode;

  constructor(options: SpatialAudioOptions) {
    this.panner = options.context.createPanner();
    this.panner.panningModel = "HRTF";
    this.panner.distanceModel = "inverse";
    this.panner.maxDistance = options.maxDistance ?? 10_000;
    this.panner.refDistance = options.refDistance ?? 1;
    this.panner.rolloffFactor = options.rolloffFactor ?? 1;
    this.panner.connect(options.destination ?? options.context.destination);
    this.setPosition(options.position ?? { x: 0, y: 0, z: 0 });
  }

  setPosition(position: Vec3Like): void {
    this.panner.positionX.value = position.x;
    this.panner.positionY.value = position.y;
    this.panner.positionZ.value = position.z;
  }

  dispose(): void {
    this.panner.disconnect();
  }
}
