/**
 * Vault Breakers plunger (PRD VB-06): hold-to-charge, release-to-serve.
 *
 * Charge maps monotonically to launch speed (table.ts owns the actual impulse);
 * a sub-frame tap still serves at minimum power instead of vanishing.
 */
export interface PlungerState {
  readonly phase: "idle" | "charging";
  readonly charge: number;
}

const CHARGE_SECONDS = 1.1;

export class PlungerController {
  private chargingValue = false;
  private chargeValue = 0;

  beginCharge(): void {
    if (this.chargingValue) return;
    this.chargingValue = true;
    this.chargeValue = 0;
  }

  cancelCharge(): void {
    this.chargingValue = false;
    this.chargeValue = 0;
  }

  update(dt: number): void {
    if (this.chargingValue) {
      this.chargeValue = Math.min(1, this.chargeValue + dt / CHARGE_SECONDS);
    }
  }

  /** Release: returns the charge to serve with, or null when not charging. */
  release(): number | null {
    if (!this.chargingValue) return null;
    const charge = Math.max(0.12, this.chargeValue);
    this.chargingValue = false;
    this.chargeValue = 0;
    return charge;
  }

  get charging(): boolean {
    return this.chargingValue;
  }

  state(): PlungerState {
    return { phase: this.chargingValue ? "charging" : "idle", charge: this.chargeValue };
  }
}
