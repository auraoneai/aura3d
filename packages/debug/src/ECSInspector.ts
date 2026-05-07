export interface ECSWorldLike {
  entities?(): readonly unknown[];
  query?(...args: unknown[]): Iterable<unknown>;
  readonly entityCount?: number;
  profiler?: { snapshot(): unknown };
}

export interface ECSInspectorSnapshot {
  readonly entityCount: number;
  readonly profiler?: unknown;
}

export class ECSInspector {
  snapshot(world: ECSWorldLike): ECSInspectorSnapshot {
    const entityCount = typeof world.entityCount === "number"
      ? world.entityCount
      : world.entities?.().length ?? 0;
    return {
      entityCount,
      ...(world.profiler ? { profiler: world.profiler.snapshot() } : {})
    };
  }
}
