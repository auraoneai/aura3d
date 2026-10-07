import { describe, expect, it } from "vitest";

import {
  AuraMigrationError,
  normalizeCreateAppRendererOptions,
  resolveRendererQualityProfile
} from "../../../../packages/engine/src/agent-api/app/rendererOptions";

describe("experimental-webgpu quality profile freeze (PRD 11 §6.2)", () => {
  it("throws AuraMigrationError when the frozen profile is resolved", () => {
    expect(() => resolveRendererQualityProfile("experimental-webgpu")).toThrowError(AuraMigrationError);
    expect(() => resolveRendererQualityProfile("experimental-webgpu")).toThrowError(/frozen by PRD 11/);
  });

  it("throws through normalizeCreateAppRendererOptions", () => {
    expect(() => normalizeCreateAppRendererOptions({ qualityProfile: "experimental-webgpu" })).toThrowError(AuraMigrationError);
  });

  it("keeps the frozen union member in the profile table (CCR: no removal)", async () => {
    const { rendererQualityProfiles } = await import("../../../../packages/engine/src/agent-api/app/rendererOptions");
    expect(rendererQualityProfiles["experimental-webgpu"]).toBeDefined();
  });

  it("still resolves live profiles", () => {
    expect(resolveRendererQualityProfile("safe-basic").id).toBe("safe-basic");
    expect(resolveRendererQualityProfile("production").id).toBe("production");
    expect(resolveRendererQualityProfile(undefined).id).toBe("safe-basic");
  });
});
