import { afterEach, describe, expect, it } from "vitest";
import { createAuraApp, primitives, scene } from "@aura3d/engine";
import { setWorldBuilderFlags, worldBuilderFlagOn, worldBuilderFlags } from "../../../../packages/engine/src/agent-api/world/flags";

/**
 * GU47 eint EG-1 (E-G handoff, optional): `createAuraApp` installs its resolved flags for the world builders, next to
 * `setQrAnimationFlags`, so builders called after the app exists (runtime `app.nodes.add(water.surface())`, scene
 * rebuilds) decide with the app's flags without `world.useAppFlags`.
 */
afterEach(() => setWorldBuilderFlags(null));

describe("GU47 eint EG-1: createAuraApp installs the world builder flags", () => {
  it("builders after the app see its qualityRebuild flags", () => {
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(false);
    const app = createAuraApp(null, { qualityRebuild: { flags: ["world"] }, scene: scene().add(primitives.box()) });
    try {
      expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(true);
      expect(worldBuilderFlags().on("A3D_QR_WORLD")).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("an app without declared flags leaves the builder on the defaults", () => {
    const app = createAuraApp(null, { scene: scene().add(primitives.box()) });
    try {
      expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(false);
    } finally {
      app.dispose();
    }
  });
});
