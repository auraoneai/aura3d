/**
 * material-presets-defaults.test.ts — PRD-04 P2-10 (R15), row 04-S13.
 *
 * `resolveMaterialSpecDefaults(defaults, options)` + `AURA_PRESET_DEFAULTS`
 * (agent-api/nodes/material.ts):
 *  - the marker records exactly the keys the preset defaulted, never the
 *    caller-supplied ones;
 *  - preset specs keep their authored legacy values (neon
 *    `emissiveIntensity: 2.8` stays on the spec);
 *  - the C-15 lowering — the only bridge since 4.0 Live Fix E2 deleted the
 *    legacy tint path — substitutes R15's r185-corrected defaults for
 *    preset-defaulted values (neon 2.8 -> 2.0, defaulted colour dropped)
 *    while authored values pass through untouched.
 */
import { describe, expect, it } from "vitest";
import {
  AURA_PRESET_DEFAULTS,
  material,
  resolveMaterialSpecDefaults
} from "../../../../packages/engine/src/agent-api/nodes/material";
import { applyModelTintBridge } from "../../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { lowerModelMaterialOverrides } from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import type { AuraModelNode } from "../../../../packages/engine/src/agent-api/index";
import type { AuraMaterialSpec } from "../../../../packages/engine/src/agent-api/nodes/types";

const defaultedKeys = (spec: AuraMaterialSpec): ReadonlySet<string> | undefined =>
  (spec as { [AURA_PRESET_DEFAULTS]?: ReadonlySet<string> })[AURA_PRESET_DEFAULTS];

const modelNode = (spec: AuraMaterialSpec): AuraModelNode =>
  ({ kind: "model", url: "asset://duck", material: spec }) as unknown as AuraModelNode;

type Lowered = { baseColorMultiply?: number[]; emissiveColor?: number[]; emissiveStrength?: number };

describe("resolveMaterialSpecDefaults marks preset-defaulted keys", () => {
  it("records defaulted keys and excludes caller-supplied ones", () => {
    const spec = resolveMaterialSpecDefaults({ color: "#ffffff", roughness: 0.5 }, { roughness: 0.2 });
    expect(spec.color).toBe("#ffffff");
    expect(spec.roughness).toBe(0.2);
    expect([...(defaultedKeys(spec) ?? [])]).toEqual(["color"]);
  });

  it("an own undefined option keeps the legacy merge and is not marked preset-defaulted", () => {
    // Legacy shape: `{ ...defaults, ...options }` lets an own undefined win. The marker must
    // agree with the value — a key whose value did not come from the preset is never marked.
    const spec = resolveMaterialSpecDefaults({ color: "#ffffff" }, { color: undefined });
    expect(spec.color).toBeUndefined();
    expect(defaultedKeys(spec)?.has("color")).toBe(false);
  });

  it("uses Symbol.for('aura3d.presetDefaults') so the actor path reads it import-free", () => {
    expect(AURA_PRESET_DEFAULTS).toBe(Symbol.for("aura3d.presetDefaults"));
  });

  it("stamps every built-in preset; caller keys never appear in the marker", () => {
    const presets = ["pbr", "emissive", "metal", "rubber", "glass", "clearcoat", "neon", "fabric", "chrome"] as const;
    for (const name of presets) {
      const factory = (material as unknown as Record<string, (o?: AuraMaterialSpec) => AuraMaterialSpec>)[name];
      const stock = defaultedKeys(factory());
      expect(stock, `${name} stamps a marker`).toBeInstanceOf(Set);
      expect(stock?.has("color"), `${name} defaults color`).toBe(true);
      const authored = defaultedKeys(factory({ color: "#123456", roughness: 0.3 }));
      expect(authored?.has("color"), `${name} authored color`).toBe(false);
      expect(authored?.has("roughness"), `${name} authored roughness`).toBe(false);
    }
  });
});

describe("preset specs keep their authored values", () => {
  it("neon keeps its legacy preset values", () => {
    const neon = material.neon();
    expect(neon.emissiveIntensity).toBe(2.8);
    expect(neon.color).toBe("#0a1020");
    expect(neon.roughness).toBe(0.18);
  });
});

describe("bridge always lowers — R15 defaults for preset-defaulted values only", () => {
  it("preset-defaulted neon emissiveIntensity 2.8 lowers to the r185 default 2.0", () => {
    const out = applyModelTintBridge(modelNode(material.neon())) as { materialOverrides?: Lowered[]; tint?: unknown };
    expect(out.tint).toBeUndefined();
    const emissive = (out.materialOverrides ?? []).find((o) => o.emissiveStrength !== undefined);
    expect(emissive?.emissiveStrength).toBe(2.0);
  });

  it("an authored emissiveIntensity of 2.8 passes through unchanged", () => {
    const lowered = lowerModelMaterialOverrides(material.neon({ emissiveIntensity: 2.8 }), undefined) as Lowered[];
    expect(lowered.find((o) => o.emissiveStrength !== undefined)?.emissiveStrength).toBe(2.8);
  });

  it("a preset-defaulted colour is not lowered; an authored colour is", () => {
    const stock = lowerModelMaterialOverrides(material.metal(), undefined) as Lowered[];
    expect(stock.some((o) => o.baseColorMultiply !== undefined)).toBe(false);
    const authored = lowerModelMaterialOverrides(material.metal({ color: "#ff0000" }), undefined) as Lowered[];
    expect(authored.some((o) => o.baseColorMultiply !== undefined)).toBe(true);
  });

  it("emissive without emissiveIntensity resolves to the r185 default 1.0", () => {
    const lowered = lowerModelMaterialOverrides(material.emissive(), undefined) as Lowered[];
    expect(lowered.find((o) => o.emissiveColor !== undefined)?.emissiveStrength).toBe(1.0);
  });
});

describe("R-14-14 presets (#80, #84) and visualQA deprecation (#192)", () => {
  it("felt is a sheen lobe preset; lacquer and carPaint carry a clearcoat lobe", () => {
    const felt = material.felt();
    expect(felt.sheen).toBeGreaterThan(0);
    expect(felt.clearcoat ?? 0).toBe(0);
    expect(material.lacquer().clearcoat).toBe(1);
    const paint = material.carPaint();
    expect(paint.clearcoat).toBe(1);
    expect(paint.metallic).toBeGreaterThan(0.5);
    expect(material.presets()).toHaveProperty("carPaint");
  });

  it("new presets stamp the marker and honour caller overrides", () => {
    const paint = material.carPaint({ color: "#0000ff" });
    expect(paint.color).toBe("#0000ff");
    expect(defaultedKeys(paint)?.has("color")).toBe(false);
    expect(defaultedKeys(paint)?.has("clearcoat")).toBe(true);
  });

  it("planet delegates to the solar preset table; every preset field is marked defaulted", () => {
    const ice = material.planet("ice");
    expect(ice.color).toBe("#93c5fd");
    expect(ice.clearcoat).toBe(1);
    const keys = defaultedKeys(ice);
    expect(keys?.has("color")).toBe(true);
    expect(keys?.has("clearcoat")).toBe(true);
    const custom = material.planet("moon", { color: "#ffffff" });
    expect(custom.color).toBe("#ffffff");
    expect(defaultedKeys(custom)?.has("color")).toBe(false);
  });

  it("atmosphere is a translucent emissive shell", () => {
    const shell = material.atmosphere();
    expect(shell.opacity).toBeLessThan(1);
    expect(shell.emissive).toBeDefined();
  });
});
