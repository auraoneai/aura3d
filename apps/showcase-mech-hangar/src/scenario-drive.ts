/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface MechDrive {
  pumpFrames(frames: number): void;
  enterArena(): void;
}
let drive: MechDrive | undefined;
export function bindMechDrive(d: MechDrive): void { drive = d; }
export function mechDrive(): MechDrive {
  if (!drive) throw new Error("mech drive unbound (scenario requested before boot)");
  return drive;
}
