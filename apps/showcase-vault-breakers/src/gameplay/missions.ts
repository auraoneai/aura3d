/**
 * Vault Breakers missions (PRD VB-07/08): five target banks of three, an orbit
 * loop mission per ball, vault open at five banks, multiball at the vault.
 *
 * Bank state persists across balls (classic standup behavior); orbit progress
 * resets each ball. Mission line text uses the extruded-text catalog alphabet
 * (uppercase alphanumerics + spaces only).
 */
import { BANK_IDS, type BankId, TARGETS_PER_BANK } from "./table";

export const ORBIT_TARGET = 3;

export interface MissionSnapshot {
  readonly banksDown: number;
  readonly vaultOpen: boolean;
  readonly orbitLoops: number;
  readonly missionLine: string;
  readonly completedTargets: readonly string[];
}

export type MissionEvent =
  | { readonly type: "target-down"; readonly id: string; readonly bank: BankId }
  | { readonly type: "bank-clear"; readonly bank: BankId }
  | { readonly type: "all-banks-clear" }
  | { readonly type: "orbit-loop"; readonly loops: number }
  | { readonly type: "orbit-complete" }
  | { readonly type: "mission-line"; readonly line: string };

export class MissionTracker {
  private readonly downTargets = new Set<string>();
  private readonly clearedBanks = new Set<BankId>();
  private vaultOpenValue = false;
  private orbitLoopsValue = 0;

  get banksDown(): number {
    return this.clearedBanks.size;
  }

  get vaultOpen(): boolean {
    return this.vaultOpenValue;
  }

  get orbitLoops(): number {
    return this.orbitLoopsValue;
  }

  registerTargetDown(id: string): readonly MissionEvent[] {
    const events: MissionEvent[] = [];
    if (this.downTargets.has(id)) return events;
    const bank = bankForTarget(id);
    if (!bank) return events;
    this.downTargets.add(id);
    events.push({ type: "target-down", id, bank });
    if (bankComplete(bank, this.downTargets) && !this.clearedBanks.has(bank)) {
      this.clearedBanks.add(bank);
      events.push({ type: "bank-clear", bank });
      if (this.clearedBanks.size >= BANK_IDS.length) {
        this.vaultOpenValue = true;
        events.push({ type: "all-banks-clear" });
      }
    }
    events.push({ type: "mission-line", line: this.missionLine() });
    return events;
  }

  registerOrbitLoop(): readonly MissionEvent[] {
    const events: MissionEvent[] = [];
    this.orbitLoopsValue += 1;
    events.push({ type: "orbit-loop", loops: this.orbitLoopsValue });
    if (this.orbitLoopsValue === ORBIT_TARGET) {
      events.push({ type: "orbit-complete" });
    }
    events.push({ type: "mission-line", line: this.missionLine() });
    return events;
  }

  /** Orbit progress is per-ball; banks persist. */
  newBall(): void {
    this.orbitLoopsValue = 0;
  }

  reset(): void {
    this.downTargets.clear();
    this.clearedBanks.clear();
    this.vaultOpenValue = false;
    this.orbitLoopsValue = 0;
  }

  missionLine(): string {
    if (this.vaultOpenValue) return "VAULT IS OPEN";
    if (this.banksDown >= BANK_IDS.length) return "VAULT IS OPEN";
    const next = BANK_IDS.filter((bank) => !this.clearedBanks.has(bank)).length;
    if (this.orbitLoopsValue > 0 && this.orbitLoopsValue < ORBIT_TARGET) {
      return `CLEAR 5 BANKS  ORBIT ${this.orbitLoopsValue} OF ${ORBIT_TARGET}`;
    }
    return `HIT TARGET BANKS  ${this.banksDown} DOWN ${next} TO GO`;
  }

  snapshot(): MissionSnapshot {
    return {
      banksDown: this.banksDown,
      vaultOpen: this.vaultOpenValue,
      orbitLoops: this.orbitLoopsValue,
      missionLine: this.missionLine(),
      completedTargets: [...this.downTargets]
    };
  }
}

function bankForTarget(id: string): BankId | undefined {
  const bank = id.split(":t")[0];
  return (BANK_IDS as readonly string[]).includes(bank) ? (bank as BankId) : undefined;
}

function bankComplete(bank: BankId, down: Set<string>): boolean {
  for (let t = 0; t < TARGETS_PER_BANK; t += 1) {
    if (!down.has(`${bank}:t${t}`)) return false;
  }
  return true;
}
