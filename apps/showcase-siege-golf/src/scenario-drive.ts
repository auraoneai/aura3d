/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface SiegeDrive {
  pumpFrames(frames: number): void;
}
let drive: SiegeDrive | undefined;
export function bindSiegeDrive(d: SiegeDrive): void { drive = d; }
export function siegeDrive(): SiegeDrive {
  if (!drive) throw new Error("siege drive unbound (scenario requested before boot)");
  return drive;
}
