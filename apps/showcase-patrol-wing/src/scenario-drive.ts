/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface PatrolDrive {
  pumpFrames(frames: number): void;
  stage(id: string): string;
}
let drive: PatrolDrive | undefined;
export function bindPatrolDrive(d: PatrolDrive): void { drive = d; }
export function patrolDrive(): PatrolDrive {
  if (!drive) throw new Error("patrol drive unbound (scenario requested before boot)");
  return drive;
}
