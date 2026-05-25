export interface V5LineSegment {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly width: number;
}

export class LineRendererV5 {
  readonly segments: V5LineSegment[] = [];

  addSegment(segment: V5LineSegment): void {
    this.segments.push(segment);
  }
}
