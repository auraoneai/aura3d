/**
 * #751 (02-DEPTH input): `depthVariantFeaturesFor(flags)` exposes the C-11
 * depth-variant registry's active set, flag-gated and in (order, id) order.
 */

import { afterEach, describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { depthVariantFeaturesFor, registerDepthVariantFeature, type DepthVariantFeature } from "../../../../packages/rendering/src/contracts/shadows";

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length > 0) disposers.pop()!();
});

function feature(id: string, flag: DepthVariantFeature["flag"], order?: number): DepthVariantFeature {
  return {
    id, owner: "prd01", flag, passes: ["depth", "distance"], chunks: [], hooks: [], select: () => true, defines: () => ({}),
    ...(order !== undefined ? { order } : {})
  } as DepthVariantFeature;
}

describe("#751 depthVariantFeaturesFor", () => {
  it("returns only features whose flag is on, in (order, id) order", () => {
    disposers.push(registerDepthVariantFeature(feature("prd01.t751b", "A3D_QR_CORE", 20)));
    disposers.push(registerDepthVariantFeature(feature("prd01.t751a", "A3D_QR_CORE", 10)));
    disposers.push(registerDepthVariantFeature(feature("prd01.t751world", "A3D_QR_WORLD", 5)));
    const core = depthVariantFeaturesFor(resolveQrFlags({ env: { A3D_QR: "core" } })).map((f) => f.id).filter((id) => id.startsWith("prd01.t751"));
    expect(core).toEqual(["prd01.t751a", "prd01.t751b"]);
    const both = depthVariantFeaturesFor(resolveQrFlags({ env: { A3D_QR: "core,world" } })).map((f) => f.id).filter((id) => id.startsWith("prd01.t751"));
    expect(both).toEqual(["prd01.t751world", "prd01.t751a", "prd01.t751b"]);
  });

  it("flags off: none of them", () => {
    disposers.push(registerDepthVariantFeature(feature("prd01.t751off", "A3D_QR_CORE")));
    expect(depthVariantFeaturesFor(resolveQrFlags({ env: { A3D_QR: "none" } })).some((f) => f.id === "prd01.t751off")).toBe(false);
  });

  it("unregistering removes the feature", () => {
    const unreg = registerDepthVariantFeature(feature("prd01.t751gone", "A3D_QR_CORE"));
    const flags = resolveQrFlags({ env: { A3D_QR: "core" } });
    expect(depthVariantFeaturesFor(flags).some((f) => f.id === "prd01.t751gone")).toBe(true);
    unreg();
    expect(depthVariantFeaturesFor(flags).some((f) => f.id === "prd01.t751gone")).toBe(false);
  });
});
