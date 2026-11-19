import { describe, expect, it } from "vitest";
import { emitMigratedSource } from "../../../packages/aura3d-cli/src/migrate-three/emit";

describe("directional shadow normal bias", () => {
  it("reports the directional assignment and its conversion from world units to shadow texels", () => {
    const source = `import * as THREE from "three";
const lamp = new THREE.DirectionalLight();
lamp.shadow.normalBias = settings.offset;`;
    const { rows, code } = emitMigratedSource(source);
    const row = rows.find(r => r.construct === "DirectionalLight.shadow.normalBias");
    expect(row).toMatchObject({ line: 3, mapping: "approximate" });
    expect(row?.note).toContain("world units per texel");
    expect(row?.note).toContain("fitted directional cascade extent / effective shadow map size");
    expect(code).toContain("// a3d: DirectionalLight.shadow.normalBias");
  });

  it("leaves point-light bias and reads on directional lights alone", () => {
    const source = `const p = new THREE.PointLight();
p.shadow.normalBias = 1;
const d = new THREE.DirectionalLight();
if (d.shadow.normalBias === 0) {}
const bias = d.shadow.normalBias;`;
    expect(emitMigratedSource(source).rows.some(row => row.construct === "DirectionalLight.shadow.normalBias")).toBe(false);
  });
});
