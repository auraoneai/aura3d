/** Imperative drive surface for `?capture=scenario` staging (PRD-09). */
export interface VaultDrive {
  pumpFrames(frames: number): void;
  stage(id: string): string;
}
let drive: VaultDrive | undefined;
export function bindVaultDrive(d: VaultDrive): void { drive = d; }
export function vaultDrive(): VaultDrive {
  if (!drive) throw new Error("vault drive unbound (scenario requested before boot)");
  return drive;
}
