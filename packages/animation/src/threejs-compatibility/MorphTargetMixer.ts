export interface V5MorphTargetWeight {
  readonly name: string;
  readonly weight: number;
}

export class MorphTargetMixerV5 {
  private readonly weights = new Map<string, number>();

  setWeight(name: string, weight: number): void {
    this.weights.set(name, Math.max(0, Math.min(1, weight)));
  }

  getWeights(): readonly V5MorphTargetWeight[] {
    return [...this.weights.entries()].map(([name, weight]) => ({ name, weight }));
  }
}
