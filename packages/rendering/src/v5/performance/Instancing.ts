export class InstancingV5 {
  constructor(public readonly instanceCount: number, public readonly drawCallCount = 1) {}
  get transformsBytes(): number { return this.instanceCount * 64; }
}
