export interface ThreeCompatLineSegment {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly width: number;
}

export class LineThreeCompatRenderer {
  readonly segments: ThreeCompatLineSegment[] = [];

  addSegment(segment: ThreeCompatLineSegment): void {
    this.segments.push(segment);
  }
}
