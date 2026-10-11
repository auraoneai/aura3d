/**
 * alpha-mask-render-state.test.ts — #259 (Q-04-2, lane 10 -> lane 04): forward
 * glTF materials honour `alphaMode: "MASK"`, `alphaToCoverage` and
 * `doubleSided` in `renderStateForGLTFMaterial` (C-15 / P5-5, PRD-04 E23).
 *
 *  - MASK is a cutout, never blended: blend off, depth writes on (foliage cards
 *    sort and occlude like opaque geometry);
 *  - flag on (`materialsR185`): MASK requests alpha-to-coverage; flag off omits
 *    the key entirely (legacy state shape unchanged);
 *  - doubleSided -> cullMode "none"; flag on honours authored doubleSided on the
 *    clearcoat shell that the legacy path back-face culls (E23 fudge).
 * The `u_alphaCutoff` uniform and the shader-side cutoff are covered by
 * alpha-to-coverage.test.ts (feature select) and the prd04-alpha-mask capture.
 */
import { describe, expect, it } from "vitest";
import { renderStateForGLTFMaterial, type GLTFMaterialAsset } from "../../../../packages/assets/src";

function material(overrides: Partial<GLTFMaterialAsset> = {}): GLTFMaterialAsset {
  return {
    name: "foliage-card",
    unlit: false,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 0.8,
    emissiveFactor: [0, 0, 0],
    emissiveStrength: 1,
    alphaMode: "OPAQUE",
    alphaCutoff: 0.5,
    doubleSided: false,
    ...overrides
  } as GLTFMaterialAsset;
}

type State = ReturnType<typeof renderStateForGLTFMaterial> & { alphaToCoverage?: boolean };
const state = (m: GLTFMaterialAsset, flagOn: boolean): State =>
  renderStateForGLTFMaterial(m, [], flagOn) as State;

describe("#259 alphaMode MASK on forward glTF materials", () => {
  for (const flagOn of [false, true]) {
    it(`MASK is a cutout, not a blend (flag ${flagOn ? "on" : "off"})`, () => {
      const s = state(material({ alphaMode: "MASK", baseColorFactor: [1, 1, 1, 0.3] }), flagOn);
      expect(s.blend).toBe(false);
      expect(s.depthWrite).toBe(true);
    });
  }

  it("flag on: MASK requests alpha-to-coverage", () => {
    expect(state(material({ alphaMode: "MASK" }), true).alphaToCoverage).toBe(true);
  });

  it("flag off: no alphaToCoverage key (legacy state shape)", () => {
    expect(state(material({ alphaMode: "MASK" }), false)).not.toHaveProperty("alphaToCoverage");
  });

  it("OPAQUE and BLEND never request alpha-to-coverage", () => {
    expect(state(material({ alphaMode: "OPAQUE" }), true)).not.toHaveProperty("alphaToCoverage");
    expect(state(material({ alphaMode: "BLEND", baseColorFactor: [1, 1, 1, 0.5] }), true)).not.toHaveProperty("alphaToCoverage");
  });
});

describe("#259 doubleSided on forward glTF materials", () => {
  for (const flagOn of [false, true]) {
    it(`doubleSided MASK card disables culling; single-sided culls back (flag ${flagOn ? "on" : "off"})`, () => {
      expect(state(material({ alphaMode: "MASK", doubleSided: true }), flagOn).cullMode).toBe("none");
      expect(state(material({ alphaMode: "MASK", doubleSided: false }), flagOn).cullMode).toBe("back");
    });
  }

  it("E23: flag on honours authored doubleSided on a metallic clearcoat shell; flag off keeps the legacy back-face cull", () => {
    const shell = material({
      doubleSided: true,
      metallicFactor: 0.9,
      roughnessFactor: 0.2,
      clearcoat: { factor: 1, roughnessFactor: 0.05 } as GLTFMaterialAsset["clearcoat"]
    });
    expect(state(shell, false).cullMode).toBe("back");
    expect(state(shell, true).cullMode).toBe("none");
  });
});
