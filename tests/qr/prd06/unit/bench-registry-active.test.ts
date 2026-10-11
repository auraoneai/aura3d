// T0-EXIT-2 (lane 06): every prd06 lane scene must be `active` in the
// benchmark registry. A quarantined scene (missing registry fields, missing
// adapter, owner mismatch) is silently dropped from `window.__QR_SCENES__`,
// so no capture or flags-bisect run ever renders it.

import { describe, expect, it } from "vitest";
import { REGISTRY } from "../../../../benchmarks/quality-rebuild/shared/registry";
import { scenes as prd06Scenes } from "../../../../benchmarks/quality-rebuild/scenes/prd06/index";

describe("prd06 lane scenes are active in the benchmark registry", () => {
  for (const registration of prd06Scenes) {
    it(`${registration.id} is active`, () => {
      const entry = REGISTRY.find((candidate) => candidate.id === registration.id);
      expect(entry, `${registration.id} missing from REGISTRY`).toBeDefined();
      expect(entry!.status, `${registration.id}: ${entry!.quarantineReason ?? ""}`).toBe("active");
    });
  }
});
