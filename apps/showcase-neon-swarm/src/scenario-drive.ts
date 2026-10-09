/**
 * scenario-drive.ts — imperative drive surface for `?capture=scenario`
 * staging (PRD-09). Bound once from main.ts; scenario definitions call these
 * rather than reaching for route globals.
 */
export interface NeonDrive {
  jumpToWave(target: number): void;
  stageFinalePulse(): void;
  finishFinale(): void;
  stepFixed(frames: number): void;
}

let drive: NeonDrive | undefined;

export function bindNeonDrive(d: NeonDrive): void {
  drive = d;
}

export function neonDrive(): NeonDrive {
  if (!drive) throw new Error("neon drive unbound (scenario requested before boot)");
  return drive;
}
