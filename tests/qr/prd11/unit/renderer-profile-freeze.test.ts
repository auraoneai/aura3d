import { describe, expect, it } from "vitest";

import {
  normalizeCreateAppRendererOptions,
  resolveBackendOptions,
  resolveRendererQualityProfile
} from "../../../../packages/engine/src/agent-api/app/rendererOptions";

// 5.0 contract (docs/migration/4-to-5.md B5, CHANGELOG 5.0.0 "Renderer options
// are validated"): the PRD 11 freeze is lifted. `experimental-webgpu` no
// longer throws AuraMigrationError; it resolves and requests the WebGPU
// backend with fallback off unless the caller opts in.
describe("experimental-webgpu quality profile (PRD 11 §6.2, unfrozen in 5.0 B5)", () => {
  it("resolves the experimental profile instead of throwing", () => {
    const profile = resolveRendererQualityProfile("experimental-webgpu");
    expect(profile.id).toBe("experimental-webgpu");
    expect(profile.status).toBe("experimental");
  });

  it("normalizeCreateAppRendererOptions accepts it and the backend request is webgpu without fallback", () => {
    expect(normalizeCreateAppRendererOptions({ qualityProfile: "experimental-webgpu" }).profile.id).toBe("experimental-webgpu");
    expect(resolveBackendOptions({ qualityProfile: "experimental-webgpu" })).toMatchObject({ requested: "webgpu", allowFallback: false });
    expect(resolveBackendOptions({ qualityProfile: "experimental-webgpu", backend: "auto" })).toMatchObject({ requested: "auto", allowFallback: true });
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
