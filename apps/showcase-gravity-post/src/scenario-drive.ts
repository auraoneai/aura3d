/**
 * scenario-drive.ts — imperative drive surface for `?capture=scenario`
 * staging (PRD-09). Bound once from main.ts.
 */
export interface GravityDrive {
  stepSim(dt: number): void;
  stepRender(dt: number): void;
  launch(direction: readonly [number, number], speed: number): void;
  nextContract(): void;
  retryContract(): void;
}

let drive: GravityDrive | undefined;

export function bindGravityDrive(d: GravityDrive): void {
  drive = d;
}

export function gravityDrive(): GravityDrive {
  if (!drive) throw new Error("gravity drive unbound (scenario requested before boot)");
  return drive;
}
