export interface ThreeCompatLodLevel {
  readonly distance: number;
  readonly triangleRatio: number;
}

export class LODSystemThreeCompat {
  readonly levels: readonly ThreeCompatLodLevel[] = [
    { distance: 0, triangleRatio: 1 },
    { distance: 35, triangleRatio: 0.5 },
    { distance: 90, triangleRatio: 0.18 }
  ];

  select(distance: number): ThreeCompatLodLevel {
    return [...this.levels].reverse().find((level) => distance >= level.distance) ?? this.levels[0];
  }
}
