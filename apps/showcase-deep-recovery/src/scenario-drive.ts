/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface DeepDrive {
  stepSim(dt: number): void;
  stepRender(dt: number): void;
}
let drive: DeepDrive | undefined;
export function bindDeepDrive(d: DeepDrive): void { drive = d; }
export function deepDrive(): DeepDrive {
  if (!drive) throw new Error("deep drive unbound (scenario requested before boot)");
  return drive;
}
