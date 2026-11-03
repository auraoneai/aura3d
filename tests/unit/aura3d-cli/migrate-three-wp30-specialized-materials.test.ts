import { describe, expect, it } from "vitest";
import { emitMigratedSource } from "../../../packages/aura3d-cli/src/migrate-three/emit";
import { THREE_TO_A3D_MAPPINGS, threeMappingFor } from "../../../packages/aura3d-cli/src/migrate-three/mappings";
import { buildMigrateReport } from "../../../packages/aura3d-cli/src/migrate-three/report";
import { applyModelTintBridge } from "../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { createProductionPrimitiveMaterial } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { defineAuraAssets, material, model, primitives, scene, texture } from "../../../packages/engine/src/public/index";
import { DepthPreviewMaterial } from "../../../packages/rendering/src/DepthPreviewMaterial";

const cases = [
  {
    construct: "MeshDepthMaterial",
    target: "material.depth",
    args: "{ depthPacking: THREE.RGBADepthPacking, alphaMap: mask }",
    boundaries: ["near white", "far black", "camera clip planes", "WebGL2", "GLSL/WGSL", "WebGPU", "GLB/model", "scene override", "clipping", "deformation"]
  },
  {
    construct: "MeshDistanceMaterial",
    target: "material.distance",
    args: "{ referencePosition: light.position, nearDistance: 2, farDistance: 12 }",
    boundaries: ["radial distance", "near black", "far white", "snapshot", "not a light binding", "not a packed", "GLSL/WGSL", "WebGPU", "GLB", "skinned"]
  },
  {
    construct: "MeshMatcapMaterial",
    target: "material.matcap",
    args: "{ matcap: capTexture, map: baseTexture, normalMap: normalTexture }",
    boundaries: ["required map", "texture handle", "three's matcap", "view-normal xy", "not scene lights", "GLSL/WGSL", "WebGPU", "GLB", "skinned"]
  },
  {
    construct: "MeshToonMaterial",
    target: "material.toon",
    args: "{ gradientMap: gradient, color: 0xff8844, normalMap: normalTexture }",
    boundaries: ["steps", "typed texture asset", "not a direct gradientMap", "direct-light luminance", "hemisphere", "directional sun shadow", "rect-area", "No WebGPU", "GLB", "skinned"]
  },
  {
    construct: "ShadowMaterial",
    target: "material.shadow",
    args: "{ color: 0x123456, opacity: 0.4 }",
    boundaries: ["receiving primitive with normals", "shadow-casting light", "directional", "point", "spot", "not a light ID", "pointLight/spotLight packets", "local atlas", "GLSL/WGSL", "WebGPU", "GLB", "skinned"]
  }
] as const;

/** Guidance is a line comment; check executable code separately from suggestions in that comment. */
function executableLines(code: string): string {
  return code.split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n");
}

describe("migrate three: specialized material guidance (WP-30)", () => {
  it.each(cases)("maps $construct to a public, comment-only approximate alternative", ({ construct, target, boundaries }) => {
    const matches = THREE_TO_A3D_MAPPINGS.filter((entry) => entry.construct === construct);
    expect(matches).toHaveLength(1);
    const entry = matches[0]!;
    expect(entry).toMatchObject({ construct, target, mapping: "approximate", emit: "comment", engineImport: "material" });
    expect(typeof material[target.slice("material.".length) as "depth" | "distance" | "matcap" | "toon" | "shadow"]).toBe("function");
    for (const boundary of boundaries) expect(entry.note, `${construct}: ${boundary}`).toContain(boundary);
  });

  it.each(cases)("annotates a namespace $construct without transforming its options", ({ construct, target, args }) => {
    const original = `new THREE.${construct}(${args})`;
    const source = `import * as THREE from "three";\nconst surface = ${original};`;
    const { code, rows, rewrittenConstructs } = emitMigratedSource(source);
    const entry = threeMappingFor(construct)!;
    expect(code).toContain(`import { material } from "@aura3d/engine";`);
    expect(code).toContain(`// a3d: ${construct} → ${target} — ${entry.note}`);
    expect(code).toContain(original);
    expect(executableLines(code)).not.toContain(`${target}(`);
    expect(rows).toEqual([{ construct, line: 2, mapping: "approximate", note: `${target} — ${entry.note}` }]);
    expect(rewrittenConstructs).toBe(1); // The emitter counts annotated sites, not just replaced constructors.
  });

  it.each(cases)("also annotates a bare, no-argument $construct without calling its factory", ({ construct, target }) => {
    const source = `import { ${construct} } from "three";\nconst surface = new ${construct}();`;
    const { code, rows } = emitMigratedSource(source);
    expect(code).toContain(`new ${construct}()`);
    expect(code).toContain(`// a3d: ${construct} → ${target} — `);
    expect(executableLines(code)).not.toContain(`${target}(`);
    expect(rows).toMatchObject([{ construct, line: 2, mapping: "approximate" }]);
  });

  it("reports five approximate rows while preserving an unrelated unmapped construct", () => {
    const source = [
      `import * as THREE from "three";`,
      ...cases.map(({ construct }) => `new THREE.${construct}();`),
      "new THREE.PlaneHelper(plane);"
    ].join("\n");
    const { code, rows, rewrittenConstructs } = emitMigratedSource(source);
    const report = buildMigrateReport(rows);
    expect(report.counts).toEqual({ exact: 0, approximate: 5, none: 1, pending: 0 });
    expect(rows.map(({ construct }) => construct)).toEqual([...cases.map(({ construct }) => construct), "PlaneHelper"]);
    expect(rows.at(-1)).toMatchObject({ construct: "PlaneHelper", line: 7, mapping: "none" });
    expect(code).toContain("new THREE.PlaneHelper(plane)");
    expect(rewrittenConstructs).toBe(5);
  });

  it("can rewrite an independently recognized nested construct while leaving the outer constructor", () => {
    const source = `import * as THREE from "three";
const surface = new THREE.MeshDistanceMaterial({
  referencePosition: new THREE.Vector3(1, 2, 3)
});`;
    const { code, rows } = emitMigratedSource(source);
    expect(rows.map(({ construct }) => construct)).toEqual(["MeshDistanceMaterial", "Vector3"]);
    expect(code).toContain("new THREE.MeshDistanceMaterial({");
    expect(code).toContain("new Vector3(1, 2, 3)");
    expect(executableLines(code)).not.toContain("material.distance(");
  });

  it("does not resolve a renamed three constructor and therefore emits no mapping row", () => {
    const source = `import { MeshToonMaterial as Toon } from "three";\nconst surface = new Toon();`;
    const { code, rows } = emitMigratedSource(source);
    expect(rows).toEqual([]);
    expect(code).toContain("new Toon()");
    expect(code).not.toContain("material.toon");
  });
});

describe("migrate three: suggested public material options", () => {
  it("authors the documented primitive alternatives and their actual shader/range contracts", () => {
    const ramp = defineAuraAssets({ ramp: { type: "texture", format: "png", url: "/ramp.png" } }).ramp;
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]) });
    try {
      const cap = material.matcap({ map, color: "#80ffff", opacity: 0.75, side: "back" });
      expect(() => material.matcap({} as never)).toThrow(/map/i);
      expect(cap.custom).toMatchObject({ side: "back", transparent: true, uniforms: { matcapMap: { type: "texture2d", value: map } } });
      expect(cap.custom!.glsl.fragment).toContain("viewNormal.xy * 0.5 + 0.5");
      expect(cap.custom!.wgsl?.fragment).toBeTruthy();

      const depth = material.depth({ near: 2, far: 12, side: "double" });
      expect(depth.depthPreview).toEqual({ near: 2, far: 12, side: "double" });
      const compiled = createProductionPrimitiveMaterial(primitives.box({ material: depth }).toJSON());
      try {
        expect(compiled).toBeInstanceOf(DepthPreviewMaterial);
        const preview = compiled as DepthPreviewMaterial;
        expect(preview.sources.glsl.fragment).toContain("1.0 - clamp((v_viewDepth - u_depthPreviewNear) / u_depthPreviewSpan");
        expect(preview.sources.wgsl?.fragment).toContain("(viewDepth - aura.u_depthPreviewNear) / aura.u_depthPreviewSpan");
      } finally {
        compiled.dispose();
      }

      const referencePosition: [number, number, number] = [1, 2, 3];
      const distance = material.distance({ referencePosition, near: 2, far: 12 });
      referencePosition[0] = 99;
      expect(distance.custom!.uniforms!.distanceOrigin).toEqual({ type: "vec3", value: [1, 2, 3] });
      expect(distance.custom!.glsl.fragment).toContain("length(vPreviewWorld - distanceOrigin)");
      expect(distance.custom!.wgsl?.fragment).toBeTruthy();

      for (const light of ["directional", "point", "spot"] as const) {
        const shadow = material.shadow({ color: "#123456", opacity: 0.4, light });
        expect(shadow.custom).toMatchObject({ transparent: true, depthWrite: false });
        expect(shadow.custom!.glsl.fragment).toContain(light === "directional" ? "a3dSunShadowAuto" : `u_${light}ShadowMapTexture`);
        expect(shadow.custom!.wgsl?.fragment).toBeTruthy();
        expect(primitives.plane({ material: shadow }).toJSON().material).toBe(shadow);
      }

      const toon = material.toon({ color: "#ff8844", steps: 4, ramp });
      expect(toon.custom!.uniforms!.toonSteps).toEqual({ type: "f32", value: 4 });
      expect(toon.custom!.uniforms!.toonRamp).toEqual({ type: "texture2d", value: ramp });
      expect(toon.custom!.glsl.fragment).toContain("a3dDirect(");
      expect(toon.custom!.wgsl).toBeUndefined();
      for (const spec of [cap, depth, distance, toon]) {
        expect(primitives.box({ material: spec }).toJSON().material).toBe(spec);
      }
    } finally {
      map.dispose();
    }
  });

  it("keeps depth off GLBs and scene overrides, and custom alternatives off skinned GLBs and PBR slot overrides", () => {
    const asset = defineAuraAssets({ mesh: { type: "model", format: "glb", url: "/mesh.glb" } }).mesh;
    const depth = material.depth();
    expect(() => model(asset, { material: depth })).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
    expect(() => scene().overrideMaterial(depth)).toThrow(/DEPTH_PREVIEW_OVERRIDE_UNSUPPORTED/);

    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    try {
      for (const spec of [material.matcap({ map }), material.distance(), material.shadow(), material.toon()]) {
        const node = model(asset, { material: spec }).toJSON();
        const bridge = applyModelTintBridge(node) as {
          customMaterialFactory: (context: { skinned: boolean; adoptTextureWork: () => void }) => unknown;
        };
        expect(() => bridge.customMaterialFactory({ skinned: true, adoptTextureWork() {} })).toThrow(/skinned custom shaders/i);
        expect(() => applyModelTintBridge({ ...node, materialOverrides: [{}] } as typeof node)).toThrow(/PBR materialOverrides/);
      }
    } finally {
      map.dispose();
    }
  });
});
