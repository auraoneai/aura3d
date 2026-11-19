import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS } from "../../../apps/showcase-teleoperator/src/collision";
import { CURB_BOLLARD_OFFSETS, PARKED_X_EXTENT } from "../../../apps/showcase-teleoperator/src/dressing";
import { PLAYER_X_LIMIT } from "../../../apps/showcase-teleoperator/src/rules";
import { WALKERS } from "../../../apps/showcase-teleoperator/src/walkers";

/**
 * Owner QA (Nov 18): no solid street furniture stands where the car can drive. The car is clamped to |x| <= PLAYER_X_LIMIT
 * (body half width PLAYER_RADIUS), so everything static must stand beyond that reach; traffic and rivals are the colliders.
 */
describe("Grid Dispatch pass-through", () => {
  const reach = PLAYER_X_LIMIT + PLAYER_RADIUS;
  it("kerb furniture, parked cars, street trees and walkers all stand outside the car's reach", () => {
    expect(reach).toBeLessThan(10.8 - 0.3); // kerb (lamp globes at 10.8, poles behind it)
    for (const [x] of CURB_BOLLARD_OFFSETS) expect(Math.abs(x) - 0.2).toBeGreaterThan(reach);
    expect(PARKED_X_EXTENT[0]).toBeGreaterThan(reach);
    expect(12.2 - 0.8).toBeGreaterThan(reach); // street tree trunks at |x| 12.2 (main.ts)
    for (const w of WALKERS) expect(Math.abs(w.x) - 0.4).toBeGreaterThan(reach);
  });
});
