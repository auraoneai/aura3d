import { describe, expect, it } from "vitest";
import { parseThreeSource } from "../../../packages/aura3d-cli/src/migrate-three/parse";
import { THREE_TO_A3D_MAPPINGS } from "../../../packages/aura3d-cli/src/migrate-three/mappings";
import { emitMigratedSource } from "../../../packages/aura3d-cli/src/migrate-three/emit";

const constructsOf = (source: string): string[] => parseThreeSource(source).map((c) => c.construct).filter((c) => c !== "import");

describe("codemod: scene.overrideMaterial detection (SG-10)", () => {
  it("detects a write on a variable declared as a Scene", () => {
    const source = `import * as THREE from "three";\nconst world = new THREE.Scene();\nworld.overrideMaterial = new THREE.MeshNormalMaterial();`;
    expect(constructsOf(source)).toContain("Scene.overrideMaterial");
  });

  it("detects the conventional `scene` identifier even when it is a parameter", () => {
    expect(constructsOf(`function render(scene) {\n  scene.overrideMaterial = depthMat;\n}`)).toContain("Scene.overrideMaterial");
  });

  it("detects clearing it with null", () => {
    expect(constructsOf(`const scene = new THREE.Scene();\nscene.overrideMaterial = null;`)).toContain("Scene.overrideMaterial");
  });

  it("ignores comparisons and non-Scene objects", () => {
    expect(constructsOf(`const scene = new THREE.Scene();\nif (scene.overrideMaterial == null) {}\nif (scene.overrideMaterial === mat) {}`)).not.toContain("Scene.overrideMaterial");
    expect(constructsOf(`const pass = new RenderPass();\npass.overrideMaterial = depthMat;`)).not.toContain("Scene.overrideMaterial");
  });
});

describe("codemod: Lensflare / overrideMaterial rows", () => {
  const row = (construct: string) => THREE_TO_A3D_MAPPINGS.find((m) => m.construct === construct);

  it("are honestly approximate and name their engine targets", () => {
    expect(row("Scene.overrideMaterial")).toMatchObject({ mapping: "approximate", target: "scene().overrideMaterial" });
    expect(row("Lensflare")).toMatchObject({ mapping: "approximate", target: "lights.lensFlare", engineImport: "lights" });
    expect(row("LensflareElement")).toMatchObject({ mapping: "approximate", target: "lights.lensFlare", engineImport: "lights" });
  });

  it("state the occlusion difference from three instead of hiding it", () => {
    expect(row("Lensflare")!.note).toMatch(/occlusion query/);
  });

  it("emit guidance comments for a migrated file", () => {
    const source = `import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";\nimport * as THREE from "three";\nconst scene = new THREE.Scene();\nconst flare = new Lensflare();\nflare.addElement(new LensflareElement(tex, 60, 0.6));\nscene.overrideMaterial = mat;`;
    const { code, rows } = emitMigratedSource(source);
    expect(code).toContain("a3d: Lensflare → lights.lensFlare");
    expect(code).toContain("a3d: LensflareElement → lights.lensFlare");
    expect(code).toContain("a3d: Scene.overrideMaterial → scene().overrideMaterial");
    const mapped = Object.fromEntries(rows.map((r) => [r.construct, r.mapping]));
    expect(mapped["Lensflare"]).toBe("approximate");
    expect(mapped["LensflareElement"]).toBe("approximate");
    expect(mapped["Scene.overrideMaterial"]).toBe("approximate");
  });
});
