import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createA3DProject } from "../../../packages/create-aura3d/src/index.js";
import { CAPABILITY_PROJECT_FILES, CAPABILITY_SCAFFOLD_TEMPLATE, makeCapabilityProject } from "../../../tools/agent-examples/index.js";

function files(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.set(relative(dir, path).split("\\").join("/"), readFileSync(path));
    }
  };
  walk(dir);
  return out;
}

const scratch: string[] = [];
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("native capability example projects", () => {
  it("are an untouched create-aura3d scaffold plus only the capability source files", () => {
    const root = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "aura3d-capability-scaffold-"));
    scratch.push(dir);
    const scaffoldDir = join(dir, "scaffold"), projectDir = join(dir, "project");
    createA3DProject({ targetDir: scaffoldDir, template: CAPABILITY_SCAFFOLD_TEMPLATE, rootDir: resolve(root, "packages/create-aura3d") });
    expect(makeCapabilityProject(root, projectDir, "bounds-query")).toEqual([...CAPABILITY_PROJECT_FILES]);

    const scaffold = files(scaffoldDir), project = files(projectDir);
    // Manifest, configs, entry HTML and typed assets come from the scaffold byte for byte.
    for (const path of ["package.json", "tsconfig.json", "vite.config.ts", "index.html", "aura.assets.json", "src/aura-assets.ts", "public/aura-assets/kaykit-barbarian.glb"]) {
      expect(scaffold.has(path), path).toBe(true);
      expect(project.get(path)?.equals(scaffold.get(path)!), path).toBe(true);
    }
    expect(scaffold.get("index.html")!.toString("utf8")).toContain('<script type="module" src="./src/main.ts"></script>');
    // Only the capability files differ; nothing from the scaffold is removed.
    const changed = [...new Set([...scaffold.keys(), ...project.keys()])]
      .filter((path) => !scaffold.get(path) || !project.get(path) || !scaffold.get(path)!.equals(project.get(path)!))
      .sort();
    expect(changed).toEqual([...CAPABILITY_PROJECT_FILES].sort());
    expect(project.get("src/scenario.ts")!.equals(readFileSync(resolve(root, "examples/native-capabilities/index.ts")))).toBe(true);
    const entry = project.get("src/main.ts")!.toString("utf8");
    expect(entry).toContain('from "./scenario"');
    expect(entry).toContain('mountNativeCapabilityScenario("bounds-query"');
  });
});
