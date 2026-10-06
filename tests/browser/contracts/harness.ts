/** Browser variant of the unit conformance harness (CONTRACTS.md §1.1). */
export function conformance<T>(slot: { stub: T; provided?: T }, suite: (impl: T, label: "stub" | "real") => void): void {
  suite(slot.stub, "stub");
  if (slot.provided !== undefined) suite(slot.provided, "real");
}
