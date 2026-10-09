/**
 * scenario-drive.ts — gameplay-only surface the `src/scenarios/` modules use.
 * Bound once from `main.ts` after `rules`/`sim` exist; scenario files never
 * reach for route internals directly.
 */
import type { ShotOutcome, ShotRecord } from "./rules";

export interface BankShotDrive {
  resetForFixture(): void;
  resolve(record: ShotRecord): ShotOutcome;
  advanceRack(): void;
  toast(text: string): void;
  sync(): void;
}

let active: BankShotDrive | undefined;

export function bindBankShotDrive(impl: BankShotDrive): void {
  active = impl;
}

function bound(): BankShotDrive {
  if (active === undefined) {
    throw new Error("Bank Shot scenario drive is not bound yet — call createGame first.");
  }
  return active;
}

export const drive: BankShotDrive = {
  resetForFixture: () => bound().resetForFixture(),
  resolve: (record) => bound().resolve(record),
  advanceRack: () => bound().advanceRack(),
  toast: (text) => bound().toast(text),
  sync: () => bound().sync()
};
