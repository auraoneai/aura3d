/**
 * `?finishAfter=<sec>` capture shortcut: the match ends on its score after that much live play and the results card is held
 * (autoplay does not roll on), so the final screen can be captured on a real GPU. Without the parameter autoplay still
 * leaves the results after AUTOPLAY_RESULTS_SEC.
 */
import { describe, expect, it } from "vitest";
import { AUTOPLAY_RESULTS_SEC, autoplayLeavesResults, finishAfterSec } from "../../../apps/showcase-aura-diamond-3d/src/autoplay";

describe("aura-diamond results capture (?finishAfter=)", () => {
  it("parses only positive finite seconds", () => {
    expect(finishAfterSec("")).toBeNull();
    expect(finishAfterSec("?autoplay=1")).toBeNull();
    expect(finishAfterSec("?finishAfter=")).toBeNull();
    expect(finishAfterSec("?finishAfter=0")).toBeNull();
    expect(finishAfterSec("?finishAfter=-3")).toBeNull();
    expect(finishAfterSec("?finishAfter=abc")).toBeNull();
    expect(finishAfterSec("?autoplay=1&finishAfter=45")).toBe(45);
    expect(finishAfterSec("?finishAfter=2.5")).toBe(2.5);
  });
  it("holds the results card only when a capture asks for it", () => {
    expect(autoplayLeavesResults(AUTOPLAY_RESULTS_SEC + 0.1, true, false)).toBe(true);
    expect(autoplayLeavesResults(AUTOPLAY_RESULTS_SEC - 0.1, true, false)).toBe(false);
    expect(autoplayLeavesResults(60, true, true)).toBe(false);
    expect(autoplayLeavesResults(60, false, false)).toBe(false);
  });
});
