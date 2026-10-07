// PRD-02 Phase 2 — C-36 option coverage + handler wiring for the lane's
// builders (lights.*, environments.*, shadows.*, probes.*, effects.contactShadows).
// `tests/unit/agent-api/optionCoverage.test.ts` is PRD 15's file per the
// checklist; this lane-scoped file asserts the PRD-02 rows exist.

import { describe, expect, it } from "vitest";
import { optionCoverageRows, nodeHandlerFor, registerNodeHandler } from "../../../packages/engine/src/contracts/compiler.js";
import "@aura3d/engine/lanes"; // triggers prd02 registrations

const rowKey = (builder: string, field: string) => `${builder}.${field}`;

describe("prd02 C-36 option coverage", () => {
  const rows = optionCoverageRows();
  const keys = new Set(rows.map((r) => rowKey(r.builder, r.field)));

  it("covers every lights.* flag-path field", () => {
    for (const key of [
      "lights.ambient.color", "lights.ambient.intensity",
      "lights.hemisphere.skyColor", "lights.hemisphere.groundColor", "lights.hemisphere.intensity",
      "lights.directional.shadow", "lights.directional.target", "lights.directional.intensity", "lights.directional.color",
      "lights.point.power", "lights.point.distance", "lights.point.decay", "lights.point.shadow", "lights.point.intensity",
      "lights.spot.power", "lights.spot.distance", "lights.spot.decay", "lights.spot.shadow", "lights.spot.angle", "lights.spot.penumbra",
      "lights.rect.shadow", "lights.rect.twoSided", "lights.softbox.shadow", "lights.softbox.twoSided"
    ]) {
      expect(keys, `missing coverage for ${key}`).toContain(key);
    }
  });

  it("covers environments.*, shadows.*, probes.* and effects.contactShadows", () => {
    for (const key of [
      "environments.preset.intensity", "environments.preset.background", "environments.preset.diffuseIntensity", "environments.preset.specularIntensity", "environments.preset.rotation",
      "environments.neutral.intensity", "environments.capture.include", "environments.capture.resolution", "environments.capture.update",
      "environments.hdri.background", "environments.hdri.intensity",
      "environments.studio.background", "environments.nightCinematic.background",
      "shadows.blobShadow.footprint", "shadows.blobShadow.opacity", "shadows.contact.footprint",
      "probes.reflection.resolution", "probes.reflection.update", "probes.reflection.box", "probes.reflection.blendDistance",
      "probes.irradianceVolume.bounds", "probes.irradianceVolume.resolution", "probes.irradianceVolume.update",
      "effects.contactShadows.length", "effects.contactShadows.steps", "effects.contactShadows.lights", "effects.contactShadows.intensity", "effects.contactShadows.thickness"
    ]) {
      expect(keys, `missing coverage for ${key}`).toContain(key);
    }
  });

  it("all prd02 rows carry ownerPrd 2 and two probe values", () => {
    const mine = rows.filter((r) => r.ownerPrd === 2);
    expect(mine.length).toBeGreaterThanOrEqual(60);
    for (const r of mine) {
      expect(r.probeValueA).not.toBe(r.probeValueB);
    }
  });
});

describe("prd02 C-36 node handlers", () => {
  it("light / environment / probe handlers registered with flag A3D_QR_LIGHTING", () => {
    for (const kind of ["light", "environment", "probe"] as const) {
      const handler = nodeHandlerFor(kind);
      expect(handler, `no handler for ${kind}`).toBeDefined();
      expect(handler!.owner).toBe("prd02");
      expect(handler!.flag).toBe("A3D_QR_LIGHTING");
    }
  });

  it("a same-flag duplicate registration throws NODE_HANDLER_DUPLICATE", () => {
    expect(() => registerNodeHandler({
      kind: "light", owner: "prd02", flag: "A3D_QR_LIGHTING",
      compile: () => {}
    })).toThrowError(/NODE_HANDLER_DUPLICATE:light/);
  });
});
