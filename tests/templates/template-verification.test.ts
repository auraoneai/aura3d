import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const templates = ["vite-vanilla", "react", "vue", "svelte"] as const;
const appTemplates = [
  {
    name: "product-configurator",
    entry: "src/main.ts",
    requiredImports: ["@aura3d/rendering"],
    expectedSource: ["Renderer.create", 'backend: "webgl2"', "PBRMaterial", "variants"],
  },
  {
    name: "game-slice",
    entry: "src/main.ts",
    requiredImports: ["@aura3d/rendering", "@aura3d/input", "@aura3d/physics", "@aura3d/animation"],
    expectedSource: ["Renderer.create", 'backend: "webgl2"', "InputSystem", "PhysicsWorld", "AnimationMixer"],
  },
  {
    name: "asset-viewer",
    entry: "src/main.ts",
    requiredImports: ["@aura3d/assets"],
    expectedSource: ["AssetManager", "GLTFLoader", "createGLTFRenderResources", "createInlineTriangleGltfUrl"],
  },
] as const;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("starter templates", () => {
  it("include common frontend stacks with public renderer imports", () => {
    for (const template of templates) {
      const base = `templates/${template}`;
      expect(existsSync(join(root, base, "package.json")), `${template} package`).toBe(true);
      expect(existsSync(join(root, base, "index.html")), `${template} index`).toBe(true);

      const packageJson = JSON.parse(read(`${base}/package.json`)) as {
        private: boolean;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {})
      };

      expect(packageJson.private, `${template} remains a scaffold`).toBe(true);
      expect(packageJson.scripts?.build, `${template} build script`).toBe("vite build");
      expect(deps, `${template} public renderer dependency`).toHaveProperty("@aura3d/rendering");
      expect(deps["@aura3d/rendering"], `${template} version`).toBe("0.0.0-rebuild");
      expect(JSON.stringify(deps), `${template} should not use workspace protocol dependencies`).not.toContain("workspace:");
    }
  });

  it("keeps template verification wired to all template directories", () => {
    const verifier = read("tools/template-verification/index.ts");
    for (const template of templates) {
      expect(verifier).toContain(`name: "${template}"`);
    }
    expect(verifier).toContain("verifyFreshTemplateBuild");
    expect(verifier).toContain("npm\", [\"install\"");
    expect(verifier).toContain("npm\", [\"run\", \"build\"");
    expect(verifier).toContain("copyLocalRuntimePackages");
    expect(verifier).toContain("This is starter-template CI evidence, not registry publishing or independent clean-checkout evidence.");
  });
});

describe("application templates", () => {
  it("include product configurator, game slice, and asset viewer scaffolds with public package imports", () => {
    for (const template of appTemplates) {
      const base = `templates/${template.name}`;
      expect(existsSync(join(root, base, "package.json")), `${template.name} package`).toBe(true);
      expect(existsSync(join(root, base, "index.html")), `${template.name} index`).toBe(true);
      expect(existsSync(join(root, base, template.entry)), `${template.name} entry`).toBe(true);

      const packageJson = JSON.parse(read(`${base}/package.json`)) as {
        private: boolean;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      };
      const entry = read(`${base}/${template.entry}`);

      expect(packageJson.private, `${template.name} remains a scaffold`).toBe(true);
      expect(packageJson.scripts?.build, `${template.name} build script`).toBe("vite build");
      expect(JSON.stringify(deps), `${template.name} should not use workspace protocol dependencies`).not.toContain("workspace:");

      for (const requiredImport of template.requiredImports) {
        expect(deps, `${template.name} dependency ${requiredImport}`).toHaveProperty(requiredImport);
        expect(entry, `${template.name} public import ${requiredImport}`).toContain(requiredImport);
      }

      for (const expectedSource of template.expectedSource) {
        expect(entry, `${template.name} source marker ${expectedSource}`).toContain(expectedSource);
      }
    }
  });
});
