import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Language = "glsl" | "wgsl";
type InterfaceEntry = { name: string; declaration: string };
type ShaderModule = {
  language: Language;
  exports: { name: string; kind: "named" | "default"; type: string }[];
  functions: { name: string; signature: string }[];
  structs: { name: string; fields: string[] }[];
  resources: string[];
};
type ModulePair = {
  name: string;
  glsl: ShaderModule;
  wgsl: ShaderModule;
  nameMatch: { common: string[]; glslOnly: string[]; wgslOnly: string[]; meaning: string };
};
type Contract = {
  schemaVersion: number;
  kind: string;
  status: string;
  limits: string[];
  interfaces: InterfaceEntry[];
  modules: ModulePair[];
};

const contract = JSON.parse(readFileSync(resolve("docs/prds/aura3d-independent-shader-api.json"), "utf8")) as Contract;
const words = (text: string) => text.split(/\s+/).filter(Boolean);
const sorted = (list: string[]) => [...list].sort();
const uniqueSorted = (list: string[]) => sorted([...new Set(list)]);
const expectedFunctions: Record<string, Record<Language, string>> = {
  anisotropy: {
    glsl: "a3dPrd04VGGXAnisotropic a3dPrd04DGGXAnisotropic a3dPrd04AnisotropyInit a3dPrd04AnisotropyDirect a3dPrd04AnisotropyBentNormal",
    wgsl: "a3dPrd04VGGXAnisotropic a3dPrd04DGGXAnisotropic a3dPrd04AnisotropyInit a3dPrd04AnisotropyDirect a3dPrd04AnisotropyBentNormal"
  },
  common: {
    glsl: "a3dPrd04GeometryRoughness a3dPrd04ResolveRoughness a3dPrd04SpecularOcclusion a3dPrd04EnvironmentBRDF a3dPrd04ComputeMultiscattering",
    wgsl: "a3dPrd04GeometryRoughness a3dPrd04ResolveRoughness a3dPrd04SpecularOcclusion a3dPrd04EnvironmentBRDF a3dPrd04ComputeMultiscattering"
  },
  clearcoat: {
    glsl: "a3dPrd04ClearcoatInit a3dPrd04ClearcoatDirect a3dPrd04ClearcoatIndirect a3dPrd04ComposeClearcoat",
    wgsl: "a3dPrd04ClearcoatInit a3dPrd04ClearcoatDirect a3dPrd04ClearcoatIndirect a3dPrd04ComposeClearcoat"
  },
  sheen: {
    glsl: "a3dPrd04SheenInit a3dPrd04DCharlie a3dPrd04VNeubelt a3dPrd04SheenDirect a3dPrd04IBLSheen a3dPrd04SheenIndirect a3dPrd04SheenEnergyCompensation a3dPrd04SheenEnergyCompensationIndirect",
    wgsl: "a3dPrd04SheenInit a3dPrd04DCharlie a3dPrd04VNeubelt a3dPrd04SheenDirect a3dPrd04IBLSheen a3dPrd04SheenIndirect a3dPrd04SheenEnergyCompensation a3dPrd04SheenEnergyCompensationIndirect"
  },
  "brdf-shim": {
    glsl: "saturate saturate pow2 pow2 pow3 pow4 max3 max4 F_Schlick F_Schlick Schlick_to_F0 BRDF_Lambert a3dDFG V_GGX_SmithCorrelated D_GGX BRDF_GGX EnvironmentBRDF BRDF_GGX_Multiscatter a3dDirectSpecular a3dDirectLight",
    wgsl: "pow2 pow2v pow4 max3 F_Schlick Schlick_to_F0 V_GGX_SmithCorrelated D_GGX a3dDFG"
  }
};
const expectedExports: Record<string, Record<Language, string>> = {
  anisotropy: { glsl: "A3D_PRD04_ANISOTROPY", wgsl: "A3D_PRD04_ANISOTROPY_WGSL default" },
  common: { glsl: "A3D_PRD04_BSDF_LOBES_COMMON", wgsl: "A3D_PRD04_BSDF_LOBES_COMMON_WGSL default" },
  clearcoat: { glsl: "A3D_PRD04_CLEARCOAT", wgsl: "A3D_PRD04_CLEARCOAT_WGSL default" },
  sheen: { glsl: "A3D_SHEEN_ALBEDO_LUT A3D_PRD04_SHEEN", wgsl: "A3D_PRD04_SHEEN_WGSL default" },
  "brdf-shim": { glsl: "BRDF_R185_SHIM_CHUNK", wgsl: "BRDF_R185_WGSL" }
};
const expectedLobeFields = words("ior:f32 clearcoat:f32 clearcoatRoughness:f32 clearcoatNormal:vec3f sheenColor:vec3f sheenRoughness:f32 iridescence:f32 iridescenceIOR:f32 iridescenceThickness:f32 iridescenceFresnel:vec3f iridescenceF0:vec3f anisotropy:f32 anisotropyT:vec3f anisotropyB:vec3f alphaT:f32 transmission:f32 thickness:f32 attenuationDistance:f32 attenuationColor:vec3f dispersion:f32");
const expectedMaterialFields = words("diffuseColor diffuseContribution specularColor specularColorBlended roughness metalness specularF90 dispersion clearcoat clearcoatRoughness clearcoatF0 clearcoatF90 iridescence iridescenceIOR iridescenceThickness iridescenceFresnel iridescenceF0 iridescenceFresnelDielectric iridescenceFresnelMetallic sheenColor sheenRoughness ior transmission transmissionAlpha thickness attenuationDistance attenuationColor anisotropy alphaT anisotropyT anisotropyB");

function safeSignature(language: Language, text: string, name: string): boolean {
  if (/\/\/|\/\*|\*\/|[{};=#"']/.test(text)) return false;
  const match = language === "wgsl"
    ? text.match(/^fn\s+([A-Za-z_]\w*)\s*\([A-Za-z0-9_,:<>\s]*\)(?:\s*->\s*[A-Za-z_]\w*(?:<[^{};=#]+>)?)?$/)
    : text.match(/^[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*\([A-Za-z0-9_,\s]*\)$/);
  return match?.[1] === name;
}

function safeField(language: Language, text: string): boolean {
  return language === "wgsl"
    ? /^[A-Za-z_]\w*\s*:\s*[A-Za-z_]\w*$/.test(text)
    : /^[A-Za-z_]\w*\s+[A-Za-z_]\w*$/.test(text);
}

function safeResource(language: Language, text: string): boolean {
  return language === "wgsl"
    ? /^@group\(\d+\)\s+@binding\(\d+\)\s+var\s+[A-Za-z_]\w*:\s+(?:texture_2d<f32>|sampler)$/.test(text)
    : /^uniform\s+sampler2D\s+[A-Za-z_]\w*$/.test(text);
}

function safeTypeDeclaration(text: string): boolean {
  if (/\/\/|\/\*|\*\//.test(text)) return false;
  const file = ts.createSourceFile("surface.d.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const parsed = file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] };
  if (parsed.parseDiagnostics.length || file.statements.length !== 1) return false;
  const statement = file.statements[0]!;
  if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) return false;
  let safe = true;
  const visit = (node: ts.Node) => {
    if (ts.isBlock(node) || ts.isArrowFunction(node) || ts.isObjectLiteralExpression(node) ||
        (ts.isParameter(node) && !!node.initializer) || (ts.isPropertyDeclaration(node) && !!node.initializer)) safe = false;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return safe;
}

describe("independent shader declaration contract", () => {
  it("has a neutral declaration-only schema with explicit unresolved limits", () => {
    expect(Object.keys(contract).sort()).toEqual(["interfaces", "kind", "limits", "modules", "schemaVersion", "status"]);
    expect(contract.schemaVersion).toBe(1);
    expect(contract.kind).toBe("declaration-only");
    expect(contract.status).toBe("behavior-unresolved");
    expect(contract.limits.join(" ")).toMatch(/numerical behavior, defaults, provenance/i);
    expect(contract.limits.join(" ")).toMatch(/conditional compilation guards/i);
    const json = JSON.stringify(contract);
    expect(json).not.toMatch(/three(?:\.js)?|babylon|playcanvas|https?:\/\/|\/Users\//i);
    expect(json).not.toMatch(/"(?:body|source|initializer|comments|constants|sampleData)"\s*:/);
    expect(json).not.toMatch(/\/\/|\/\*|\*\//);
    // Changes to any helper type, declaration or binding require an explicit contract update.
    expect(createHash("sha256").update(json).digest("hex")).toBe("8eb96695fca44820b22cb0bce3d34af7593fd09d103f0e694b916a803b306569");
  });

  it("freezes module entries, exports, function overloads, and name-only pairing", () => {
    expect(sorted(contract.modules.map((module) => module.name))).toEqual(sorted(Object.keys(expectedFunctions)));
    expect(new Set(contract.modules.map((module) => module.name)).size).toBe(contract.modules.length);
    for (const module of contract.modules) {
      expect(Object.keys(module).sort()).toEqual(["glsl", "name", "nameMatch", "wgsl"]);
      for (const language of ["glsl", "wgsl"] as const) {
        const entry = module[language];
        expect(Object.keys(entry).sort()).toEqual(["exports", "functions", "language", "resources", "structs"]);
        expect(entry.language).toBe(language);
        expect(sorted(entry.exports.map((item) => item.name))).toEqual(sorted(words(expectedExports[module.name]![language])));
        expect(sorted(entry.functions.map((item) => item.name))).toEqual(sorted(words(expectedFunctions[module.name]![language])));
        expect(new Set(entry.exports.map((item) => item.name)).size).toBe(entry.exports.length);
        expect(new Set(entry.functions.map((item) => item.signature)).size).toBe(entry.functions.length);
        for (const item of entry.exports) {
          expect(Object.keys(item).sort()).toEqual(["kind", "name", "type"]);
          expect(item.kind).toBe(item.name === "default" ? "default" : "named");
          expect(["ShaderChunk", "unresolved"]).toContain(item.type);
        }
        for (const item of entry.functions) {
          expect(Object.keys(item).sort()).toEqual(["name", "signature"]);
          expect(safeSignature(language, item.signature, item.name), `${module.name}.${language}.${item.name}`).toBe(true);
        }
      }
      expect(Object.keys(module.nameMatch).sort()).toEqual(["common", "glslOnly", "meaning", "wgslOnly"]);
      expect(module.nameMatch.meaning).toBe("name-only");
      const glsl = uniqueSorted(module.glsl.functions.map((fn) => fn.name));
      const wgsl = uniqueSorted(module.wgsl.functions.map((fn) => fn.name));
      expect(module.nameMatch.common).toEqual(glsl.filter((name) => wgsl.includes(name)));
      expect(module.nameMatch.glslOnly).toEqual(glsl.filter((name) => !wgsl.includes(name)));
      expect(module.nameMatch.wgslOnly).toEqual(wgsl.filter((name) => !glsl.includes(name)));
    }
    const shim = contract.modules.find((module) => module.name === "brdf-shim")!;
    expect(shim.glsl.functions.filter((fn) => fn.name === "pow2")).toHaveLength(2);
    expect(shim.glsl.functions.filter((fn) => fn.name === "F_Schlick")).toHaveLength(2);
    expect(shim.nameMatch.wgslOnly).toEqual(["pow2v"]);
  });

  it("freezes helper types, struct fields, and texture interfaces", () => {
    expect(sorted(contract.interfaces.map((entry) => entry.name))).toEqual(["PrdId", "ShaderChunk"]);
    expect(new Set(contract.interfaces.map((entry) => entry.name)).size).toBe(contract.interfaces.length);
    for (const entry of contract.interfaces) {
      expect(Object.keys(entry).sort()).toEqual(["declaration", "name"]);
      expect(safeTypeDeclaration(entry.declaration), entry.name).toBe(true);
    }
    const common = contract.modules.find((module) => module.name === "common")!;
    expect(common.glsl.structs.map((value) => value.name)).toEqual(["A3DPrd04Lobes"]);
    expect(common.wgsl.structs.map((value) => value.name)).toEqual(["A3DPrd04Lobes"]);
    expect(common.wgsl.structs[0]!.fields.map((field) => field.replace(/\s/g, ""))).toEqual(expectedLobeFields);
    expect(common.glsl.structs[0]!.fields.map((field) => {
      const [type, name] = field.split(/\s+/);
      return `${name}:${type === "float" ? "f32" : `${type}f`}`;
    })).toEqual(expectedLobeFields);
    const shim = contract.modules.find((module) => module.name === "brdf-shim")!;
    expect(shim.glsl.structs.map((value) => value.name)).toEqual(["PhysicalMaterial"]);
    expect(shim.glsl.structs[0]!.fields.map((field) => field.split(/\s+/)[1])).toEqual(expectedMaterialFields);
    expect(shim.wgsl.structs).toEqual([]);
    expect(shim.glsl.resources).toEqual(["uniform sampler2D u_dfgLut"]);
    expect(shim.wgsl.resources).toEqual([
      "@group(1) @binding(29) var a3d_prd04_dfgLut: texture_2d<f32>",
      "@group(1) @binding(28) var a3d_prd04_dfgSmp: sampler"
    ]);
    for (const module of contract.modules) for (const language of ["glsl", "wgsl"] as const) {
      const entry = module[language];
      expect(new Set(entry.structs.map((value) => value.name)).size).toBe(entry.structs.length);
      expect(new Set(entry.resources).size).toBe(entry.resources.length);
      for (const struct of entry.structs) {
        expect(Object.keys(struct).sort()).toEqual(["fields", "name"]);
        expect(struct.fields.every((field) => safeField(language, field)), `${module.name}.${struct.name}`).toBe(true);
      }
      for (const resource of entry.resources) expect(safeResource(language, resource), `${module.name}.${language}`).toBe(true);
    }
  });

  it("rejects bodies, comments, initializers, and sample-bearing declarations", () => {
    expect(safeSignature("wgsl", "fn value(x: f32) -> f32", "value")).toBe(true);
    expect(safeSignature("glsl", "float value(float x)", "value")).toBe(true);
    expect(safeSignature("wgsl", "fn value(x: f32) -> f32 { return x; }", "value")).toBe(false);
    expect(safeSignature("glsl", "float value(float x) /* comment */", "value")).toBe(false);
    expect(safeSignature("wgsl", "fn value(x: f32 = 1.0)", "value")).toBe(false);
    expect(safeField("wgsl", "sample: f32 = 1.0")).toBe(false);
    expect(safeResource("glsl", "uniform sampler2D image = sampleData")).toBe(false);
    expect(safeTypeDeclaration("interface X { value: number }; const sample = 1")).toBe(false);
    expect(safeTypeDeclaration("interface X { value: number /* comment */ }")).toBe(false);
  });
});
