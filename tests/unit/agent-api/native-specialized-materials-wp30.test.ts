import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { material, texture } from "../../../packages/engine/src/public/index";

describe("WP-30 specialized public materials", () => {
  it("exports option types through both public barrels", () => {
    const names = ["AuraMatcapMaterialOptions", "AuraDepthPreviewMaterialOptions", "AuraDistanceMaterialOptions", "AuraShadowMaterialOptions"];
    for (const [path, source] of [
      ["packages/engine/src/agent-api/index.ts", "./nodes/material.js"],
      ["packages/engine/src/public/index.ts", "../agent-api/index.js"]
    ]) {
      const file = ts.createSourceFile(path!, readFileSync(path!, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const exports = file.statements.flatMap((statement) => {
        if (!ts.isExportDeclaration(statement) || !statement.isTypeOnly ||
            !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier) ||
            statement.moduleSpecifier.text !== source || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) return [];
        return statement.exportClause.elements.map((element) => element.name.text);
      });
      expect(exports, path).toEqual(expect.arrayContaining(names));
    }
  });

  it("authors a mapped matcap material", () => {
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]) });
    try {
      const spec = material.matcap({ map, color: "#80ffff", opacity: 0.75 });
      expect(spec.kind).toBe("custom");
      expect(spec.custom?.uniforms?.matcapMap).toEqual({ type: "texture2d", value: map });
      expect(spec.custom?.wgsl?.fragment).toBeTruthy();
    } finally {
      map.dispose();
    }
  });

  it("authors a view-depth preview", () => {
    const spec = material.depth({ near: 2, far: 12 });
    expect(spec.kind).toBe("depth-preview");
    expect(spec.custom).toBeUndefined();
    expect(spec.depthPreview).toEqual({ near: 2, far: 12, side: "front" });
  });

  it("authors a light-distance preview", () => {
    const spec = material.distance({ referencePosition: [1, 2, 3], near: 2, far: 12 });
    expect(spec.kind).toBe("custom");
    expect(spec.custom?.uniforms?.distanceOrigin).toEqual({ type: "vec3", value: [1, 2, 3] });
    expect(spec.custom?.wgsl?.fragment).toBeTruthy();
  });

  it("authors a transparent shadow receiver", () => {
    const spec = material.shadow({ color: "#123456", opacity: 0.4 });
    expect(spec.kind).toBe("custom");
    expect(spec.custom?.transparent).toBe(true);
    expect(spec.custom?.depthWrite).toBe(false);
    expect(spec.custom?.wgsl?.fragment).toBeTruthy();
  });

  it("rejects invalid ranges, positions, opacity, sides and absent maps", () => {
    expect(() => material.matcap({} as never)).toThrow(/map/i);
    expect(() => material.depth({ near: 2, far: 2 })).toThrow(/near and far/i);
    expect(() => material.depth({ near: -1 })).toThrow(/near and far/i);
    expect(() => material.depth({ near: 1, far: Infinity })).toThrow(/near and far/i);
    expect(() => material.distance({ near: 1, far: 1 + Number.EPSILON })).toThrow(/float32/i);
    expect(() => material.distance({ referencePosition: [0, NaN, 0] })).toThrow(/referencePosition/i);
    expect(() => material.distance({ referencePosition: null as never })).toThrow(/referencePosition/i);
    expect(() => material.depth({ near: null as never })).toThrow(/near and far/i);
    expect(() => material.shadow({ opacity: 1.1 })).toThrow(/opacity/i);
    expect(() => material.shadow({ opacity: NaN })).toThrow(/opacity/i);
    expect(() => material.shadow({ side: "invalid" as never })).toThrow(/side/i);
    expect(() => material.shadow({ light: "local-atlas" as never })).toThrow(/light/i);
    expect(() => material.shadow({ light: null as never })).toThrow(/light/i);
  });

  it("snapshots world-space distance origin and sets explicit defaults", () => {
    const referencePosition: [number, number, number] = [3, 4, 5];
    const spec = material.distance({ referencePosition });
    referencePosition[0] = 99;
    expect(spec.custom?.uniforms?.distanceOrigin).toEqual({ type: "vec3", value: [3, 4, 5] });
    expect(spec.custom?.uniforms?.distanceNear).toEqual({ type: "f32", value: 0 });
    expect(spec.custom?.uniforms?.distanceFar).toEqual({ type: "f32", value: 100 });
  });
});
