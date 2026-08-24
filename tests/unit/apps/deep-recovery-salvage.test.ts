import { describe, expect, it } from "vitest";
import {
  initialCrateSpawns,
  tryGrappleCrates,
  releaseTethers,
  updateTetherPhysics,
  bankSecuredCrates,
  CONTRACTS,
  GRAPPLE_RANGE
} from "../../../apps/showcase-deep-recovery/src/salvage";

describe("Deep Recovery — Salvage, Tether, and Banking Mechanics", () => {
  it("initializes 8 crates across shallow, mid, and abyssal zones", () => {
    const crates = initialCrateSpawns();
    expect(crates.length).toBe(8);
    expect(crates.filter((c) => c.kind === "crate-standard").length).toBe(3);
    expect(crates.filter((c) => c.kind === "crate-heavy").length).toBe(5);
  });

  it("latches nearest crate within grapple range", () => {
    const crates = initialCrateSpawns();
    const crate = crates[0]!;
    // Position sub near crate-s1
    const subPos = { x: crate.x + 1.0, y: crate.y, z: crate.z };

    const res = tryGrappleCrates(subPos, crates);
    expect(res.latchedCrate).not.toBeNull();
    expect(res.latchedCrate?.id).toBe(crate.id);
    expect(res.latchedCrate?.tethered).toBe(true);

    // Release
    const released = releaseTethers(crates);
    expect(released).toBe(1);
    expect(crate.tethered).toBe(false);
  });

  it("applies spring force to pull tethered crate and generates tow drag", () => {
    const crates = initialCrateSpawns();
    const crate = crates[0]!;
    crate.tethered = true;
    crate.x = 0;
    crate.y = -10;
    crate.z = 0;

    // Sub is 4.0m away (+X)
    const subPos = { x: 4.0, y: -10, z: 0 };
    const { towDragForce } = updateTetherPhysics(subPos, crates, 0.1);

    expect(towDragForce).toBeGreaterThan(0);
    expect(crate.vx).toBeGreaterThan(0); // crate pulled toward sub
  });

  it("banks secured crates at surface buoy with zone value multipliers", () => {
    const crates = initialCrateSpawns();
    const crate = crates[0]!; // crate-s1: baseValue 400
    crate.tethered = true;
    crate.x = 0;
    crate.y = -2; // inside buoy zone, zone 1 -> 1.0x
    crate.z = 0;

    // At buoy (x:0, z:0, y:-2)
    const subPos = { x: 0, y: -2, z: 0 };
    const bankRes = bankSecuredCrates(subPos, crates, 5.5);

    expect(bankRes.bankedCount).toBe(1);
    expect(bankRes.bankedValue).toBe(400);
    expect(crate.banked).toBe(true);
    expect(crate.tethered).toBe(false);
  });

  it("makes heavy salvage measurably harder to tow than standard salvage", () => {
    const standard = initialCrateSpawns()[0]!;
    standard.tethered = true;
    const standardDrag = updateTetherPhysics({ x: standard.x, y: standard.y, z: standard.z }, [standard], 1 / 60).towDragForce;

    const heavy = initialCrateSpawns().find((crate) => crate.kind === "crate-heavy")!;
    heavy.tethered = true;
    const heavyDrag = updateTetherPhysics({ x: heavy.x, y: heavy.y, z: heavy.z }, [heavy], 1 / 60).towDragForce;

    expect(standardDrag).toBeCloseTo(0.12);
    expect(heavyDrag).toBeCloseTo(0.28);
    expect(heavyDrag).toBeGreaterThan(standardDrag * 2);
  });

  it("banks only when both submarine and tethered crate enter the buoy zone", () => {
    const crate = initialCrateSpawns()[0]!;
    crate.tethered = true;
    const result = bankSecuredCrates({ x: 0, y: -1, z: 0 }, [crate], 5.5);
    expect(result.bankedCount).toBe(0);
    expect(crate.banked).toBe(false);
  });

  it("validates contract specs and quotas", () => {
    expect(CONTRACTS.length).toBe(3);
    expect(CONTRACTS[0]!.quotaValue).toBe(1200);
    expect(CONTRACTS[1]!.quotaValue).toBe(2800);
    expect(CONTRACTS[2]!.quotaValue).toBe(5500);
  });
});
