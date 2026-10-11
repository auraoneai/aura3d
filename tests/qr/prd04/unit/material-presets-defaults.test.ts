/**
 * material-presets-defaults.test.ts — PRD-04 P2-10 (R15), row 04-S13.
 *
 * `resolveMaterialSpecDefaults(defaults, options)` + `AURA_PRESET_DEFAULTS`
 * (agent-api/nodes/material.ts):
 *  - the marker records exactly the keys the preset defaulted, never the
 *    caller-supplied ones;
 *  - flag OFF: preset specs and the legacy tint bridge are unchanged (legacy
 *    preset values such as neon `emissiveIntensity: 2.8` pass through);
 *  - flag ON: the C-15 lowering substitutes R15's r185-corrected defaults for
 *    preset-defaulted values (neon 2.8 -> 2.0, defaulted colour dropped) while
 *    authored values pass through untouched.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  AURA_PRESET_DEFAULTS,
  material,
  resolveMaterialSpecDefaults
} from "../../../../packages/engine/src/agent-api/nodes/material";
import { applyModelTintBridge } from "../../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { lowerModelMaterialOverrides } from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import { setTypedGLBActorQrFlags } from "../../../../packages/engine/src/production-runtime/actor/extensions";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraModelNode } from "../../../../packages/engine/src/agent-api/index";
import type { AuraMaterialSpec } from "../../../../packages/engine/src/agent-api/nodes/types";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_MATERIALS: true } });
const FLAGS_OFF = resolveQrFlags({ options: {} });

afterEach(() => setTypedGLBActorQrFlags(FLAGS_OFF));

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

describe("flag off — presets and legacy bridge unchanged", () => {
  it("neon keeps its legacy preset values", () => {
    const neon = material.neon();
    expect(neon.emissiveIntensity).toBe(2.8);
    expect(neon.color).toBe("#0a1020");
    expect(neon.roughness).toBe(0.18);
  });

  it("legacy tint forwards the preset emissiveIntensity verbatim (no R15 substitution)", () => {
    setTypedGLBActorQrFlags(FLAGS_OFF);
    const out = applyModelTintBridge(modelNode(material.neon())) as { tint?: { emissiveStrength?: number } };
    expect(out.tint?.emissiveStrength).toBe(2.8);
    expect(out).not.toHaveProperty("materialOverrides");
  });
});

describe("flag on — R15 defaults for preset-defaulted values only", () => {
  it("preset-defaulted neon emissiveIntensity 2.8 lowers to the r185 default 2.0", () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
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
