export class TrailRendererV5 {
  readonly points: Array<readonly [number, number, number]> = [];

  push(point: readonly [number, number, number]): void {
    this.points.push(point);
    if (this.points.length > 256) this.points.shift();
  }
}
