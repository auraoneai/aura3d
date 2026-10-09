/**
 * scenario-drive.ts — imperative drive surface for `?capture=scenario`
 * staging (PRD-09). Bound once from main.ts; the scenario definitions in
 * `src/scenarios/` call these rather than reaching for route globals.
 */
export interface PulseDrive {
  beginRun(): Promise<void>;
  applySection(sectionId: string, announce: boolean): void;
  seekAhead(seconds: number): void;
  endRun(reason: string): void;
}

let drive: PulseDrive | undefined;

export function bindPulseDrive(d: PulseDrive): void {
  drive = d;
}

export function pulseDrive(): PulseDrive {
  if (!drive) throw new Error("pulse drive unbound (scenario requested before boot)");
  return drive;
}
