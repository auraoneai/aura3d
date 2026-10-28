import ts from "typescript";
import { describe, expect, it } from "vitest";
import { emitMigratedSource } from "../../../packages/aura3d-cli/src/migrate-three/emit";

// Review findings on the mutable @aura3d/math/three rows: Color/Euler/Vector3 are classes now, but Aura3D option
// fields (scene.background, light/fog colour, material colour, node specs) still take hex strings and tuples. The
// codemod must emit the primitive at option sites it can see, keep the class at standalone sites, and never nest
// block comments.

function syntaxErrors(code: string): string[] {
  const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

const emit = (source: string): string => emitMigratedSource(source).code;

describe("migrate three: Color/Euler/Vector3 option sites vs standalone sites", () => {
  it("scene.background = new THREE.Color(...) emits the hex string option, with no class import", () => {
    const code = emit(`import * as THREE from "three";\nconst s = new THREE.Scene();\ns.background = new THREE.Color(0x112233);\n`);
    expect(code).toContain(`s.background = "#112233"`);
    expect(code).not.toContain("new Color");
    expect(code).not.toContain("@aura3d/math/three");
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("fog and light colours built from THREE.Color emit hex strings", () => {
    const code = emit(`import * as THREE from "three";\nconst f = new THREE.Fog(new THREE.Color(0x87ceeb), 20, 120);\nconst p = new THREE.PointLight(new THREE.Color("#ff0000"), 1);\n`);
    expect(code).toContain(`effects.fog({ color: "#87ceeb" })`);
    expect(code).toContain(`lights.point({ color: "#ff0000", intensity: 1 })`);
    expect(code).not.toContain("new Color");
    expect(code).not.toContain("@aura3d/math/three");
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("a non-literal colour argument converts through the class and imports it", () => {
    const code = emit(`import * as THREE from "three";\nconst p = new THREE.PointLight(new THREE.Color(r, g, b), 1);\n`);
    expect(code).toContain("lights.point({ color: `#${new Color(r, g, b).getHexString()}`, intensity: 1 })");
    expect(code).toMatch(/import \{ Color \} from "@aura3d\/math\/three"/);
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("a Color nested in a material option does not nest block comments and the file parses", () => {
    const code = emit(`import * as THREE from "three";\nconst m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xff0000), roughness: 0.4, map: tex });\n`);
    expect(code).toContain(`color: "#ff0000"`);
    expect(syntaxErrors(code)).toEqual([]);
    // No block comment opens inside another one.
    for (const comment of code.matchAll(/\/\*([\s\S]*?)\*\//g)) expect(comment[1]).not.toContain("/*");
    expect(code).not.toMatch(/\*\/\s*\*\//);
  });

  it("a comment that embeds a class-emitting argument stays one balanced comment", () => {
    // Euler with a non-XYZ order emits a trailing comment; it is nested inside the generic `map args` comment of an unknown-shape consumer.
    const code = emit(`import * as THREE from "three";\nconst m = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(1, 0, 0), aoMap: new THREE.Euler(0, 1, 0, "YXZ") });\n`);
    expect(syntaxErrors(code)).toEqual([]);
    for (const comment of code.matchAll(/\/\*([\s\S]*?)\*\//g)) expect(comment[1]).not.toContain("/*");
  });

  it("object-literal keys (position, rotation, color) get tuples and strings", () => {
    const code = emit(`import * as THREE from "three";\nconst spec = { position: new THREE.Vector3(1, 2, 3), rotation: new THREE.Euler(0, 1.5, 0, "XYZ"), color: new THREE.Color(0xabcdef) };\n`);
    expect(code).toContain("position: [1, 2, 3]");
    expect(code).toContain("rotation: [0, 1.5, 0]");
    expect(code).toContain(`color: "#abcdef"`);
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("standalone sites keep the mutable classes (the exact claim: v.add(w) mutates)", () => {
    const code = emit(`import * as THREE from "three";\nconst c = new THREE.Color(0x334455);\nconst v = new THREE.Vector3(1, 2, 3);\nconst e = new THREE.Euler(0, 1, 0);\nc.setHex(0xffffff);\nv.add(v);\n`);
    expect(code).toContain("new Color(0x334455)");
    expect(code).toContain("new Vector3(1, 2, 3)");
    expect(code).toContain("new Euler(0, 1, 0)");
    expect(code).toMatch(/import \{ Color, Euler, Vector3 \} from "@aura3d\/math\/three"/);
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("a variable named color is not mistaken for an option key", () => {
    const code = emit(`import * as THREE from "three";\nconst color = new THREE.Color(0x334455);\ncolor.offsetHSL(0.1, 0, 0);\n`);
    expect(code).toContain("const color = new Color(0x334455)");
  });

  it("math classes still take class arguments: a Plane built from a Vector3 stays a class", () => {
    const code = emit(`import * as THREE from "three";\nconst p = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);\n`);
    expect(code).toMatch(/new Plane\(new Vector3\(0, 1, 0\)(?: \/\*[^*]*\*\/)?, 0\)/);
    expect(syntaxErrors(code)).toEqual([]);
  });
});
