/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface ClashDrive {
  pumpFrames(frames: number): void;
  setPositions(playerX: number, rivalX: number): void;
  queuePlayerAttack(move: string): void;
  reset(): void;
}
let drive: ClashDrive | undefined;
export function bindClashDrive(d: ClashDrive): void { drive = d; }
export function clashDrive(): ClashDrive {
  if (!drive) throw new Error("clash drive unbound (scenario requested before boot)");
  return drive;
}
