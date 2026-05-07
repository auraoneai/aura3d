export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class AudioListener {
  position: Vec3Like = { x: 0, y: 0, z: 0 };
  forward: Vec3Like = { x: 0, y: 0, z: -1 };
  up: Vec3Like = { x: 0, y: 1, z: 0 };

  setTransform(position: Vec3Like, forward: Vec3Like = this.forward, up: Vec3Like = this.up): void {
    this.position = { ...position };
    this.forward = { ...forward };
    this.up = { ...up };
  }
}
