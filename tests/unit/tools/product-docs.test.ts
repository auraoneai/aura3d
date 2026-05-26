import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const demos = [
  {
    id: "product-configurator",
    readme: "examples/product-configurator/README.md",
    main: "examples/product-configurator/main.ts",
    state: "__AURA3D_PRODUCT_DEMO__",
    sourceSignals: ["variants", "setVariant", "Renderer.create", "renderer.render"],
  },
  {
    id: "architecture-viewer",
    readme: "examples/architecture-viewer/README.md",
    main: "examples/architecture-viewer/main.ts",
    state: "__AURA3D_ARCHITECTURE_DEMO__",
    sourceSignals: ["zones", "buildRenderItems", "Renderer.create", "renderer.render"],
  },
  {
    id: "game-slice",
    readme: "examples/game-slice/README.md",
    main: "examples/game-slice/main.ts",
    state: "__AURA3D_GAME_DEMO__",
    sourceSignals: ["PhysicsWorld", "AnimationMixer", "ParticleSystem", "InputSystem", "AudioSystem", "renderer.render"],
  },
] as const;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("product example docs", () => {
  it("make each product example learnable from README and source without opening tests", () => {
    for (const demo of demos) {
      const readme = read(demo.readme);
      const main = read(demo.main);

      for (const section of [
        "## Purpose",
        "## Run",
        "## Systems Used",
        "## Learning Path",
        "## Expected Output",
        "## Acceptance Target",
        "## Known Limits",
      ]) {
        expect(readme, `${demo.id} README should include ${section}`).toContain(section);
      }

      expect(readme, `${demo.id} should point learners to source`).toContain("main.ts");
      expect(readme, `${demo.id} should document runtime state`).toContain(demo.state);
      expect(readme, `${demo.id} should explain DevTools/status-panel inspection`).toMatch(/DevTools|status panel/);
      expect(readme, `${demo.id} should document WebGL2 renderer usage`).toMatch(/Renderer|WebGL2|webgl2/);
      expect(readme, `${demo.id} should include the bounded browser verification command`).toContain(
        "pnpm exec playwright test tests/browser/product-demos.spec.ts",
      );

      for (const signal of demo.sourceSignals) {
        expect(main, `${demo.id} source should contain ${signal}`).toContain(signal);
        expect(readme, `${demo.id} README should explain ${signal}`).toContain(signal);
      }
    }
  });

  it("documents useful local product-app proof without turning it into external-demo evidence", () => {
    const index = read("docs/examples/product-demos.md");
    const external = read("docs/examples/external-demos.md");
    const checklist = read("docs/project/v2-filename-level-execution-checklist.md");
    const gate = read("docs/project/v2-master-gate-evidence.md");

    for (const demo of demos) {
      expect(index).toContain(`examples/${demo.id}`);
      expect(index).toContain(demo.state);
    }

    expect(index).toContain("## Learnability Contract");
    expect(index).toContain("without requiring a reader to reverse-engineer Playwright assertions");
    expect(index).toContain("tests/reports/product-demo-validation.json");
    expect(index).toContain("not externally hosted demos");

    expect(existsSync(join(root, "docs/examples/external-demos.md"))).toBe(true);
    expect(external).toContain("does not contain evidence of externally hosted");
    expect(external).toContain("must remain unchecked");
    expect(checklist).toContain("- [x] Product examples prove Aura3D can build useful browser apps.");
    expect(checklist).toContain("- [x] A new developer can learn from example code without reading tests.");
    expect(checklist).toContain("- [ ] External demos exist.");
    expect(gate).toContain("docs/examples/external-demos.md");
    expect(gate).toContain("not externally hosted demos");
  });
});
