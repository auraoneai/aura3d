import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  historicalAdditionIssues,
  historicalBundleIssues,
  historicalComplexityIssues,
  historicalDeveloperIssues,
  historicalDisclosureIssues,
  historicalEngineLayerIssues,
  historicalFrictionFieldsIssues,
  historicalRouteDisclosureIssues
} from "../../../tools/native-evidence-analysis/historical-checks";

// These objects are invented test inputs. They are not measurements, reports,
// source-candidate receipts, or evidence about the current library.
function syntheticBundle() {
  return { pass: true, scenarios: [
    { id: "scenario-1-core-primitive-scene", ratio: 1.1, maxRatio: 1.25, pass: true },
    { id: "scenario-2-product-viewer", ratio: 1.2, maxRatio: 1.25, pass: true },
    { id: "scenario-3-game-runtime", ratio: 1.3, maxRatio: 1.5, pass: true }
  ] };
}

function syntheticFriction() {
  const side = { authoredLines: 12, imports: 2, dependencyCount: 1, typecheckMs: 3 };
  const startup = { median: 10, sampleCount: 3 };
  const installation = { sampleCount: 3, medianMs: 10, varianceMs2: 2 };
  return {
    scenarios: Array.from({ length: 3 }, () => ({ aura3d: { ...side }, threejs: { ...side } })),
    summary: { totalScenarios: 3, scenariosWhereAura3dNeedsFewerLines: 3,
      scenariosWhereAura3dNeedsFewerOrEqualDependencies: 3, gapReportWorkflows: 6,
      gapReportWorkflowsWhereAura3dNeedsFewerLines: 6 },
    runtimeStartupToFirstFrame: { methodology: { sessions: 3, identicalCameraAndContent: true },
      aura3d: { ...startup }, threejs: { ...startup } },
    installToFirstCube: { summary: { cold: { aura3d: { ...installation }, threejs: { ...installation } },
      warm: { aura3d: { ...installation }, threejs: { ...installation } } },
      samples: Array.from({ length: 12 }, () => ({ verifiedChangedPixels: 1001 })) },
    unmeasured: []
  };
}

describe("historical evidence analyzers with synthetic inputs", () => {
  it("requires the original scenario inventory and limits, and rejects failed or missing data", () => {
    const bundle = syntheticBundle();
    expect(historicalBundleIssues(bundle)).toEqual([]);
    bundle.scenarios[0]!.maxRatio = 1.26;
    expect(historicalBundleIssues(bundle)).toContain("bundle scenario invalid: scenario-1-core-primitive-scene");
    bundle.scenarios[1]!.pass = false;
    expect(historicalBundleIssues(bundle)).toContain("bundle scenario failed or budget exceeded");
    expect(historicalBundleIssues(undefined)).toEqual(expect.arrayContaining(["bundle report did not pass", "bundle scenarios missing"]));
  });

  it("requires the historical comparison, browser sample and pixel thresholds", () => {
    const friction = syntheticFriction();
    expect(historicalDeveloperIssues(friction)).toEqual([]);
    expect(historicalFrictionFieldsIssues(friction)).toEqual([]);
    friction.summary.scenariosWhereAura3dNeedsFewerLines = 2;
    friction.runtimeStartupToFirstFrame.aura3d.sampleCount = 2;
    friction.installToFirstCube.samples[0]!.verifiedChangedPixels = 1000;
    expect(historicalDeveloperIssues(friction)).toEqual(expect.arrayContaining([
      "developer comparison summary invalid", "startup samples invalid: aura3d", "install pixel samples invalid"
    ]));
    expect(historicalDeveloperIssues(null)).toContain("developer scenarios missing");
    expect(historicalFrictionFieldsIssues({ scenarios: [{ aura3d: {} }] })).toContain("friction scenario inventory invalid");
  });

  it("requires over-budget disclosure and the rounded values from supplied data", () => {
    const report = { pass: false, scenarios: [{ id: "synthetic", ratio: 1.256 }] };
    expect(historicalDisclosureIssues("Over budget: 1.26x.", report)).toEqual([]);
    expect(historicalDisclosureIssues("Within budget", report)).toEqual(expect.arrayContaining([
      "bundle over-budget disclosure missing", "bundle ratio undisclosed: 1.26x"
    ]));
    expect(historicalDisclosureIssues("Over budget", undefined)).toEqual(["bundle measurement missing"]);
    expect(historicalDisclosureIssues("No disclosure needed for a passing report", { pass: true })).toEqual([]);
  });

  it("does not treat missing route results as successful route disclosure", () => {
    expect(historicalRouteDisclosureIssues("Known issue in /apps/example", { failures: ["/apps/example/"] })).toEqual([]);
    expect(historicalRouteDisclosureIssues("No routes listed", { failures: ["/apps/example/"] })).toEqual(["broken route undisclosed: example"]);
    expect(historicalRouteDisclosureIssues("", undefined)).toEqual(["route-health failures missing"]);
  });

  it("rejects complexity, ratio and architecture inventory regressions", () => {
    expect(historicalComplexityIssues({ baseline: { packageSourceLines: 5 }, current: { packageSourceLines: 5, duplicateOwnershipViolations: 0 } })).toEqual([]);
    expect(historicalComplexityIssues({ baseline: { packageSourceLines: 5 }, current: { packageSourceLines: 6, duplicateOwnershipViolations: 1 } })).toHaveLength(2);
    expect(historicalEngineLayerIssues({ pass: true, ratio: 0.9, threshold: 0.9 })).toEqual([]);
    expect(historicalEngineLayerIssues({ pass: true, ratio: 0.89, threshold: 0.9 })).not.toEqual([]);
    expect(historicalAdditionIssues(["A\tb", "A\ta"], ["A\ta", "A\tb"])).toEqual([]);
    expect(historicalAdditionIssues(["A\ta", "A\ta"], ["A\ta", "A\tb"])).not.toEqual([]);
  });
});

describe("historical claims that can be checked from current source", () => {
  const readme = readFileSync("README.md", "utf8");

  it("does not make the original broad superiority or unreachable-physics claims", () => {
    for (const pattern of [/faster than three\.?js/i, /better than three\.?js/i, /smaller than three\.?js/i,
      /replaces three\.?js/i, /beats three\.?js/i, /faster than babylon/i, /better than babylon/i,
      /drop-in replacement for three\.?js/i, /unreachable from the public API/i]) {
      expect(pattern.test(readme), String(pattern)).toBe(false);
    }
    const contract = readFileSync("tests/unit/physics/public-physics-runtime.test.ts", "utf8");
    expect(contract).toMatch(/import \{[\s\S]*createPhysicsRuntime[\s\S]*\} from "@aura3d\/engine"/);
  });

  it("retains the required limitations section", () => {
    expect(readme).toMatch(/what is still not resolved/i);
  });

  it("resolves every registered architectural decision from source files", () => {
    const registry = JSON.parse(readFileSync("tools/final-subsystem-ownership/adr-registry.json", "utf8")) as {
      addedPackages: Record<string, string>; addedPackageSource: Record<string, string>;
    };
    const adrs = readdirSync("docs/architecture/adr").filter((name) => name.endsWith(".md") && name !== "README.md")
      .map((name) => `docs/architecture/adr/${name}`);
    expect(adrs.length).toBeGreaterThanOrEqual(2);
    expect(adrs.some((name) => name.includes("retain-ecs-and-scripting"))).toBe(true);
    expect(adrs.some((name) => name.includes("racing-kit-force-model"))).toBe(true);
    for (const [source, adr] of Object.entries({ ...registry.addedPackages, ...registry.addedPackageSource })) {
      expect(adrs, source).toContain(adr);
    }
  });
});
