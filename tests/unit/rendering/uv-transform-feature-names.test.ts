import { describe, expect, it } from "vitest";
import { PRD04_SHADER_FEATURES } from "../../../packages/rendering/src/materials/features";

const feature = PRD04_SHADER_FEATURES.find((entry) => entry.id === "prd04.uvTransform")!;
const SLOTS = [
  "baseColor", "normal", "metallicRoughness", "occlusion", "emissive",
  "clearcoat", "clearcoatRoughness", "clearcoatNormal",
  "transmission", "diffuseTransmission", "diffuseTransmissionColor",
  "volumeThickness", "specular", "specularColor",
  "sheenColor", "sheenRoughness", "anisotropy",
  "iridescence", "iridescenceThickness"
];

describe("prd04.uvTransform parameter names", () => {
  it("selects the slot mask and binds the same u_<slot>UvTransform names", () => {
    const transform = new Float32Array(9).fill(1);
    const params = new Map<string, unknown>([
      ["u_normalUvTransform", transform],
      ["u_sheenRoughnessUvTransform", transform],
      ["u_emissiveUvTransform", new Float32Array(4)] // wrong shape: ignored
    ]);
    const requested: string[] = [];
    const material = { getParameter(name: string) { requested.push(name); return params.get(name); } };
    const item = { material } as never;
    const mask = feature.select!({ item } as never);
    expect(mask).toBe((1 << SLOTS.indexOf("normal")) | (1 << SLOTS.indexOf("sheenRoughness")));
    expect(requested).toEqual(SLOTS.map((slot) => `u_${slot}UvTransform`));
    const bound: Array<[string, unknown]> = [];
    feature.bindUniforms!(mask!, item, ((name: string, value: unknown) => bound.push([name, value])) as never);
    expect(bound).toEqual([["u_normalUvTransform", transform], ["u_sheenRoughnessUvTransform", transform]]);
    expect(feature.select!({ item: { material: { getParameter: () => undefined } } } as never)).toBeUndefined();
  });
});
