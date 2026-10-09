/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface TurboDrive {
  pumpFrames(frames: number): Promise<unknown>;
  advanceTo(milestone: string): Promise<unknown>;
}
let drive: TurboDrive | undefined;
export function bindTurboDrive(d: TurboDrive): void { drive = d; }
export function turboDrive(): TurboDrive {
  if (!drive) throw new Error("turbo drive unbound (scenario requested before boot)");
  return drive;
}
