/**
 * Gravity Post unit evidence — score formula and shift-fail math.
 */
import { describe, expect, it } from "vitest";
import { CONTRACTS } from "../../../apps/showcase-gravity-post/src/contracts";
import { PROPELLANT_CAPACITY } from "../../../apps/showcase-gravity-post/src/pod";
import {
  ASSIST_BONUS_PER_WELL,
  FLYBY_BONUS,
  PRECISION_MAX,
  SCORE_BASE,
  SCORE_PER_FUEL_PERCENT,
  SHIFT_FAIL_LIMIT,
  applyContractFail,
  fuelMargin,
  precisionScore,
  scoreContract
} from "../../../apps/showcase-gravity-post/src/scoring";

describe("gravity post scoring", () => {
  it("scores base + fuel% + precision + assists + flyby exactly", () => {
    const breakdown = scoreContract({
      propellant: 80,
      distanceToCore: 0,
      dockRadius: DOCK_RADIUS,
      assists: ["sol", "gale"],
      bonusBodyHit: true
    });
    expect(breakdown.base).toBe(SCORE_BASE);
    expect(breakdown.fuelPoints).toBe(80 * SCORE_PER_FUEL_PERCENT);
    expect(breakdown.precisionPoints).toBe(PRECISION_MAX);
    expect(breakdown.assistPoints).toBe(2 * ASSIST_BONUS_PER_WELL);
    expect(breakdown.flybyPoints).toBe(FLYBY_BONUS);
    expect(breakdown.total).toBe(
      breakdown.base + breakdown.fuelPoints + breakdown.precisionPoints + breakdown.assistPoints + breakdown.flybyPoints
    );
  });

  it("decays precision linearly with dock distance and floors at zero", () => {
    expect(precisionScore(0, 0.42)).toBe(PRECISION_MAX);
    expect(precisionScore(0.21, 0.42)).toBe(Math.round(PRECISION_MAX * 0.5));
    expect(precisionScore(0.42, 0.42)).toBe(0);
    expect(precisionScore(9, 0.42)).toBe(0);
    expect(precisionScore(Number.NaN, 0.42)).toBe(0);
  });

  it("counts distinct wells only for assist bonuses", () => {
    const setBreakdown = scoreContract({ propellant: 50, distanceToCore: 0, dockRadius: 1, assists: new Set(["a", "a", "b"]), bonusBodyHit: false });
    const arrayBreakdown = scoreContract({ propellant: 50, distanceToCore: 0, dockRadius: 1, assists: ["a", "b"], bonusBodyHit: false });
    expect(setBreakdown.assistPoints).toBe(arrayBreakdown.assistPoints);
    expect(setBreakdown.assistPoints).toBe(2 * ASSIST_BONUS_PER_WELL);
  });

  it("computes fuel margin against each contract par", () => {
    const contract = CONTRACTS[2]!;
    expect(fuelMargin(contract.parFuel, contract)).toBe(0);
    expect(fuelMargin(contract.parFuel + 7, contract)).toBe(7);
    expect(fuelMargin(10, contract)).toBeLessThan(0);
  });

  it("full tank scores its percentage through the shared formula", () => {
    const breakdown = scoreContract({
      propellant: PROPELLANT_CAPACITY,
      distanceToCore: 0,
      dockRadius: 0.42,
      assists: [],
      bonusBodyHit: false
    });
    expect(breakdown.fuelPoints).toBe(PROPELLANT_CAPACITY * SCORE_PER_FUEL_PERCENT);
  });

  it("ends the shift on the third failed contract and resets cleanly", () => {
    const shift = { failedContracts: 0 };
    expect(applyContractFail(shift).shiftOver).toBe(false);
    expect(applyContractFail(shift).shiftOver).toBe(false);
    const third = applyContractFail(shift);
    expect(third.failedContracts).toBe(SHIFT_FAIL_LIMIT);
    expect(third.shiftOver).toBe(true);

    // Campaign reset returns to a clean shift.
    shift.failedContracts = 0;
    expect(applyContractFail(shift).shiftOver).toBe(false);
  });

  it("ships exactly four contracts for the direct/assist/chain/hazard arc", () => {
    expect(CONTRACTS).toHaveLength(4);
    const ids = new Set(CONTRACTS.map((contract) => contract.id));
    expect(ids.size).toBe(4);
    expect(CONTRACTS.map((contract) => contract.title)).toEqual([
      "Delivery 1 — Direct dispatch",
      "Delivery 2 — Single assist",
      "Delivery 3 — Chained curve",
      "Delivery 4 — Hazard mail"
    ]);
    for (const contract of CONTRACTS) {
      expect(contract.captureLimit).toBeGreaterThan(0);
      expect(contract.parFuel).toBeGreaterThan(0);
      expect(contract.originStationId).not.toBe(contract.destinationStationId);
    }
  });
});

const DOCK_RADIUS = 0.42;
