/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface SkylineDrive {
  stepSim(dt: number): void;
  stepRender(dt: number): void;
  pumpFrames(frames: number): void;
}
let drive: SkylineDrive | undefined;
export function bindSkylineDrive(d: SkylineDrive): void { drive = d; }
export function skylineDrive(): SkylineDrive {
  if (!drive) throw new Error("skyline drive unbound (scenario requested before boot)");
  return drive;
}
