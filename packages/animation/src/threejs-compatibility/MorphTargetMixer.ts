export interface ThreeCompatMorphTargetWeight {
  readonly name: string;
  readonly weight: number;
}

export class MorphTargetMixerThreeCompat {
  private readonly weights = new Map<string, number>();

  setWeight(name: string, weight: number): void {
    this.weights.set(name, Math.max(0, Math.min(1, weight)));
  }

  getWeights(): readonly ThreeCompatMorphTargetWeight[] {
    return [...this.weights.entries()].map(([name, weight]) => ({ name, weight }));
  }
}
