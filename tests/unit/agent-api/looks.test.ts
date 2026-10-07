import { describe, expect, it } from "vitest";
import { lookPresets, lookPresetIds } from "../../../packages/engine/src";
import type { AuraLookPreset, AuraBiomeId, AuraStudioLookId } from "../../../packages/engine/src";

// T1.1 — the 15 v0 look presets. §7.1 requires the id set to equal the C-26
// AuraBiomeId union (11) plus the C-34 AuraStudioLookId union (4); the
// satisfies Record<AuraLookId, AuraLookPreset> in lookPresets.ts is the
// compile-time half of this check.
const EXPECTED_BIOME_IDS: readonly AuraBiomeId[] = [
  "outdoor-day",
  "golden-hour",
  "overcast",
  "night-city",
  "polar-night",
  "alpine-snow",
  "interior-warm",
  "interior-neutral",
  "interior-industrial",
  "space",
  "underwater"
];
const EXPECTED_STUDIO_IDS: readonly AuraStudioLookId[] = [
  "product-studio",
  "character-showcase",
  "arena-fight",
  "neon-arcade"
];

// Same channel weights as agent-api/index.ts:3544 (linear sRGB luma).
function luma(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return Number.NaN;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

describe("lookPresets (T1.1)", () => {
  it("exposes exactly the C-26 AuraBiomeId ∪ C-34 AuraStudioLookId union (15 ids)", () => {
    const expected = [...EXPECTED_BIOME_IDS, ...EXPECTED_STUDIO_IDS].sort();
    expect([...lookPresetIds].sort()).toEqual(expected);
    for (const id of EXPECTED_BIOME_IDS) {
      const preset = lookPresets[id] as AuraLookPreset;
      expect(preset.biome, `${id} is a biome pass-through`).toBe(id);
    }
  });

  it("never emits an ambient light in the v0 expansion", () => {
    for (const preset of Object.values(lookPresets)) {
      // The v0 interface has no ambient field; assert the data shape stays honest.
      expect(Object.keys(preset.v0)).not.toContain("ambient");
      expect((preset.v0.key as { type?: string }).type ?? "directional").not.toBe("ambient");
    }
  });

  it("gives every entry key.shadow === true", () => {
    for (const preset of Object.values(lookPresets)) {
      expect(preset.v0.key.shadow, `${preset.id} key.shadow`).toBe(true);
    }
  });

  it("keeps every non-exception background at luma >= 0.06", () => {
    for (const preset of Object.values(lookPresets)) {
      if (preset.backgroundException) continue;
      expect(luma(preset.v0.background), `${preset.id} background ${preset.v0.background}`).toBeGreaterThanOrEqual(0.06);
    }
  });

  it("honours the lane-chosen hdri mapping", () => {
    expect(lookPresets["outdoor-day"].v0.hdri).toBe("autumn_field_puresky_1k");
    expect(lookPresets["overcast"].v0.hdri).toBe("autumn_field_puresky_1k");
    expect(lookPresets["alpine-snow"].v0.hdri).toBe("autumn_field_puresky_1k");
    expect(lookPresets["golden-hour"].v0.hdri).toBe("kloppenheim_06_puresky_1k");
    for (const id of ["product-studio", "character-showcase", "arena-fight", "interior-warm", "interior-neutral", "interior-industrial"] as const) {
      expect(lookPresets[id].v0.hdri, id).toBe("studio_small_08_1k");
    }
    for (const id of ["night-city", "space", "underwater", "polar-night"] as const) {
      expect(lookPresets[id].v0.hdri, id).toBeNull();
      expect(lookPresets[id].backgroundException, id).toBe(true);
    }
  });

  it("freezes presets (frozen; agents can print them)", () => {
    for (const preset of Object.values(lookPresets)) {
      expect(Object.isFrozen(preset), preset.id).toBe(true);
      expect(Object.isFrozen(preset.v0)).toBe(true);
      expect(Object.isFrozen(preset.v0.key)).toBe(true);
    }
  });
});
