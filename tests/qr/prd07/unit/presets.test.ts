// PRD-07 P2-T2 — every AuraVfxKind and every PRD 09 GameFxKind resolves to a
// preset with at least one emitter layer.

import { describe, expect, it } from "vitest";
import type { AuraVfxKind } from "../../../../packages/engine/src/contracts/effects";
import type { GameFxKind } from "../../../../packages/engine/src/contracts/game";
import { createAuraApp, scene } from "../../../../packages/engine/src";

const VFX_KINDS: AuraVfxKind[] = ["spark", "dust", "debris", "ring", "streak", "pickup", "explosion-small", "muzzle", "splash", "bubble", "impact-flash", "super-flash", "impact-decal", "aura-burst"];
const GAME_KINDS: GameFxKind[] = ["spark", "dust", "debris", "ring", "streak", "pickup", "explosion-small", "muzzle", "splash", "bubble"];

describe("P2-T2 effect presets", () => {
  const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });

  it("every AuraVfxKind resolves to a preset with ≥ 1 emitter layer", () => {
    for (const kind of VFX_KINDS) {
      const preset = app.effects.presets[kind];
      expect(preset, kind).toBeTruthy();
      expect(preset.name).toBe(kind);
      expect(preset.layers.some((l) => l.type === "emitter"), kind).toBe(true);
    }
  });

  it("every GameFxKind maps onto a resolvable preset (§7.8 parity)", () => {
    for (const kind of GAME_KINDS) {
      expect(app.effects.presets[kind as AuraVfxKind], kind).toBeTruthy();
    }
  });

  it("registerPreset overrides a kind", () => {
    const spec = { name: "spark", layers: [{ type: "emitter", speed: 9 }] } as never;
    app.effects.registerPreset("spark", spec);
    expect(app.effects.presets.spark).toBe(spec);
    app.dispose();
  });
});
