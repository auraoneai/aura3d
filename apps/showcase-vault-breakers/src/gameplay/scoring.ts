/**
 * Vault Breakers scoring (PRD VB-08): points table, multiplier ladder, balls.
 * Pure state — unit-tested directly by tests/unit/apps/vault-breakers-scoring.test.ts.
 */
export const SCORE_TABLE = {
  bumper: 150,
  sling: 75,
  target: 500,
  bankClear: 2500,
  orbitLoop: 1000,
  jackpot: 10000
} as const;

export type ScoreableEvent = keyof typeof SCORE_TABLE;

export const BALLS_PER_GAME = 3;

/** Multiplier ladder: 0-1 banks x1, 2-3 x2, 4 x4, 5+ (vault) x6. */
export function multiplierForBanks(banksDown: number, vaultOpen: boolean): number {
  if (vaultOpen || banksDown >= 5) return 6;
  if (banksDown >= 4) return 4;
  if (banksDown >= 2) return 2;
  return 1;
}

export interface ScoreSnapshot {
  readonly score: number;
  readonly multiplier: number;
  readonly banksDown: number;
  readonly vaultOpen: boolean;
  readonly ballsRemaining: number;
  readonly ball: number;
}

export class ScoreKeeper {
  private scoreValue = 0;
  private banksDownValue = 0;
  private vaultOpenValue = false;
  private ballValue = 1;
  private gameOverValue = false;

  get score(): number {
    return this.scoreValue;
  }

  get banksDown(): number {
    return this.banksDownValue;
  }

  get vaultOpen(): boolean {
    return this.vaultOpenValue;
  }

  get ball(): number {
    return this.ballValue;
  }

  get multiplier(): number {
    return multiplierForBanks(this.banksDownValue, this.vaultOpenValue);
  }

  get ballsRemaining(): number {
    return this.gameOverValue ? 0 : BALLS_PER_GAME - this.ballValue + 1;
  }

  add(event: ScoreableEvent, count = 1): number {
    const gained = SCORE_TABLE[event] * count * this.multiplier;
    this.scoreValue += gained;
    return gained;
  }

  registerBankClear(): void {
    this.banksDownValue = Math.min(5, this.banksDownValue + 1);
  }

  registerVaultOpen(): void {
    this.vaultOpenValue = true;
  }

  advanceBall(): boolean {
    if (this.ballValue >= BALLS_PER_GAME) {
      this.gameOverValue = true;
      return false;
    }
    this.ballValue += 1;
    return true;
  }

  reset(): void {
    this.scoreValue = 0;
    this.banksDownValue = 0;
    this.vaultOpenValue = false;
    this.ballValue = 1;
    this.gameOverValue = false;
  }

  snapshot(): ScoreSnapshot {
    return {
      score: this.scoreValue,
      multiplier: this.multiplier,
      banksDown: this.banksDownValue,
      vaultOpen: this.vaultOpenValue,
      ballsRemaining: this.ballsRemaining,
      ball: this.ballValue
    };
  }
}
