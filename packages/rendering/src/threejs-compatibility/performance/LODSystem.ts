export interface V5LodLevel {
  readonly distance: number;
  readonly triangleRatio: number;
}

export class LODSystemV5 {
  readonly levels: readonly V5LodLevel[] = [
    { distance: 0, triangleRatio: 1 },
    { distance: 35, triangleRatio: 0.5 },
    { distance: 90, triangleRatio: 0.18 }
  ];

  select(distance: number): V5LodLevel {
    return [...this.levels].reverse().find((level) => distance >= level.distance) ?? this.levels[0];
  }
}
