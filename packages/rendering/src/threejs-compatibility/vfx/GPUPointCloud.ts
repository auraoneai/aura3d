export class GPUPointCloudV5 {
  constructor(public readonly pointCount: number, public readonly stride = 16) {}

  get estimatedBytes(): number {
    return this.pointCount * this.stride;
  }
}
