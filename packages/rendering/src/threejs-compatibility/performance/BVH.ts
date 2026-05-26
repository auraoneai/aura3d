export interface ThreeCompatBvhNode {
  readonly id: number;
  readonly triangleStart: number;
  readonly triangleCount: number;
}

export class BVHThreeCompat {
  readonly nodes: ThreeCompatBvhNode[];

  constructor(public readonly triangleCount: number) {
    const nodeCount = Math.max(1, Math.ceil(triangleCount / 64));
    this.nodes = Array.from({ length: nodeCount }, (_, id) => ({ id, triangleStart: id * 64, triangleCount: Math.min(64, triangleCount - id * 64) }));
  }
}
