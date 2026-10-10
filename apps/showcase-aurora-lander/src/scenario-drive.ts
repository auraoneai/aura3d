/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface AuroraDrive {
  stepSim(dt: number): void;
  stepRender(dt: number): void;
}
let drive: AuroraDrive | undefined;
export function bindAuroraDrive(d: AuroraDrive): void { drive = d; }
export function auroraDrive(): AuroraDrive {
  if (!drive) throw new Error("aurora drive unbound (scenario requested before boot)");
  return drive;
}
