export interface ReflectionProbe {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly radius: number;
  readonly intensity: number;
}

export function createReflectionProbe(probe: ReflectionProbe): ReflectionProbe {
  if (!probe.id.trim()) throw new Error("ReflectionProbe id is required.");
  if (!Number.isFinite(probe.radius) || probe.radius <= 0) throw new Error("ReflectionProbe radius must be positive.");
  if (!Number.isFinite(probe.intensity) || probe.intensity < 0) throw new Error("ReflectionProbe intensity must be non-negative.");
  return probe;
}
