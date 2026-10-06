/**
 * PR 0a conformance harness (CONTRACTS.md §1.1). Runs `suite(slot.stub, "stub")`
 * always; imports the lane barrels and runs `suite(real, "real")` when
 * `slot.provided`.
 */

import { describe } from "vitest";
import type { ContractSlot } from "@aura3d/rendering/contracts";

export function conformance<T>(slot: ContractSlot<T>, suite: (impl: T, label: "stub" | "real") => void): void {
  describe("stub", () => {
    suite(slot.stub, "stub");
  });
  if (slot.provided !== undefined) {
    describe("real", () => {
      suite(slot.provided as T, "real");
    });
  }
}
