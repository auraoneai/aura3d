import { describe, expect, it } from "vitest";
import { RequirementMissingError, integratedPending, requireOrSkip } from "../../support/requireOrSkip";
import { classifySkip } from "../../support/noSkipInCiReporter";

function fakeTest() {
  const calls: Array<[boolean, string | undefined]> = [];
  return { calls, skip: (c: boolean, d?: string) => void calls.push([c, d]) };
}

describe("P-22 requireOrSkip", () => {
  it("does nothing when the requirement holds", () => {
    const t = fakeTest();
    requireOrSkip(t, true, "webgl2", "needs WebGL2", { CI: "true" });
    expect(t.calls).toEqual([]);
  });

  it("skips locally with the requirement id in the reason", () => {
    const t = fakeTest();
    requireOrSkip(t, false, "webgl2", "needs WebGL2", {});
    expect(t.calls).toEqual([[true, "requireOrSkip:webgl2 — needs WebGL2"]]);
  });

  it("fails on CI for an unlisted requirement instead of skipping", () => {
    const t = fakeTest();
    expect(() => requireOrSkip(t, false, "webgl2", "needs WebGL2", { CI: "true" })).toThrow(RequirementMissingError);
    expect(t.calls).toEqual([]);
  });

  it("integrated-pending entries are well-formed and unexpired-filtered", () => {
    for (const entry of integratedPending()) {
      expect(entry.issue).toBeGreaterThan(0);
      expect(Date.parse(entry.expires)).not.toBeNaN();
    }
    expect(integratedPending(new Date("2999-01-01"))).toEqual([]);
  });

  it("reporter treats plain test.skip and unlisted requireOrSkip ids as unlisted", () => {
    expect(classifySkip("no v2 tree yet")).toBeNull();
    expect(classifySkip("requireOrSkip:not-a-listed-id — x")).toBeNull();
  });
});
