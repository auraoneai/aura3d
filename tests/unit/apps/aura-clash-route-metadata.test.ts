import { describe, expect, it } from "vitest";
import {
  auraClashRouteMetadata,
  checkAuraClashRouteMetadataSource,
  type AuraClashRouteMetadata
} from "../../../apps/aura-clash-showcase/src/seo/routeMetadata";

describe("Aura Clash route metadata", () => {
  it("keeps shipped metadata scoped to current proof instead of maturity claims", () => {
    const checks = checkAuraClashRouteMetadataSource();

    expect(checks.every((check) => check.passed), JSON.stringify(checks, null, 2)).toBe(true);
    expect(checks.map((check) => check.id)).toContain("claims:scoped-runtime");
    expect(JSON.stringify(auraClashRouteMetadata).toLowerCase()).not.toMatch(
      /\bmature\b|\bflagship\b|\bproduction[- ]ready\b|\brelease[- ]ready\b|\bcomplete game\b|\bfinished game\b/
    );
  });

  it("rejects route metadata that overclaims before release gates pass", () => {
    const overclaimed = [
      {
        ...auraClashRouteMetadata[0],
        description: "Aura Clash is a mature flagship production-ready complete game."
      },
      ...auraClashRouteMetadata.slice(1)
    ] as readonly AuraClashRouteMetadata[];

    const claimCheck = checkAuraClashRouteMetadataSource(overclaimed).find((check) => check.id === "claims:scoped-runtime");

    expect(claimCheck?.passed).toBe(false);
  });
});
