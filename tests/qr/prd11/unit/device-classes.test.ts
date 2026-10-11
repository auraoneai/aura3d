import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEVICE_CLASS_TABLE_VERSION, DEVICE_CLASSES } from "../../../../packages/rendering/src/quality/DeviceClasses";
import { TierResolver } from "../../../../packages/rendering/src/quality/TierResolver";
import type { DeviceProbe } from "../../../../packages/rendering/src/contracts/device";

/**
 * PRD-11 11-S8: every renderer string in the fixture resolves to its expected
 * tier and confidence, every class row has at least 10 real strings, and each
 * §17.1 tier names one reference device (#53).
 */

interface FixtureEntry {
  readonly string: string;
  readonly mobile: boolean;
  readonly expectedTier: string;
  readonly expectedConfidence: "high" | "low";
  readonly expectedClass?: string;
  readonly reference?: string;
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/renderer-strings.json", import.meta.url), "utf8")
) as { readonly tableVersion: number; readonly entries: readonly FixtureEntry[] };

/** Desktop-class probe: passes every hard floor; no CPU/RAM signal so step 3 never adjusts. */
function probeFor(entry: FixtureEntry): DeviceProbe {
  return {
    backend: "webgl2",
    rendererString: "WebKit WebGL",
    unmaskedRenderer: entry.string,
    unmaskedVendor: null,
    maxTextureSize: 16384,
    maxSamples: 4,
    floatColorBuffer: true,
    halfFloatColorBuffer: true,
    timerQuery: false,
    parallelShaderCompile: true,
    multiDraw: true,
    devicePixelRatio: 1,
    screen: [1920, 1080],
    hardwareConcurrency: null,
    deviceMemoryGB: null,
    mobile: entry.mobile
  };
}

const RUNNER = "ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)";

describe("11-S8 renderer-string fixture (DeviceClasses + TierResolver)", () => {
  const resolver = new TierResolver();

  it("fixture targets the current class-table version", () => {
    expect(fixture.tableVersion).toBe(DEVICE_CLASS_TABLE_VERSION);
  });

  it.each(fixture.entries.map((entry) => [entry.string, entry] as const))("%s", (_name, entry) => {
    const decision = resolver.detect(probeFor(entry));
    expect({ tier: decision.tier, confidence: decision.confidence }).toEqual({
      tier: entry.expectedTier,
      confidence: entry.expectedConfidence
    });
    if (entry.expectedClass) expect(decision.matchedClass).toBe(entry.expectedClass);
    else expect(decision.matchedClass).toBe(entry.expectedTier);
  });

  it("every class row has at least 10 real strings", () => {
    for (const row of DEVICE_CLASSES) {
      const count = fixture.entries.filter((entry) => entry.expectedTier === row.tier && !entry.expectedClass).length;
      expect({ row: row.id, count: count >= 10 }).toEqual({ row: row.id, count: true });
    }
  });

  it("names exactly one §17.1 reference device per tier (#53)", () => {
    for (const tier of ["low", "medium", "high", "ultra"]) {
      const references = fixture.entries.filter((entry) => entry.reference === tier);
      expect({ tier, references: references.length }).toEqual({ tier, references: 1 });
      expect(references[0]!.expectedTier).toBe(tier);
    }
  });

  it("the macos-14 CI runner string resolves to Low via the class table", () => {
    const entry = fixture.entries.find((candidate) => candidate.string === RUNNER);
    expect(entry).toBeDefined();
    const decision = resolver.detect(probeFor(entry!));
    expect(decision).toMatchObject({ tier: "low", confidence: "high", matchedClass: "low" });
  });
});
