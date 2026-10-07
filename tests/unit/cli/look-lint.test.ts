import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  lookFromAmbientCodemod,
  runLookLintScan
} from "../../../packages/aura3d-cli/src/look/lint-static";
import { doctorRulesAll, registerDoctorRule } from "../../../packages/aura3d-cli/src/contracts/commands";

function project(src: Record<string, string>): string {
  const cwd = mkdtempSync(join(tmpdir(), "look-lint-"));
  for (const [file, text] of Object.entries(src)) {
    const path = join(cwd, "src", file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
  return cwd;
}

const CURRENT_MINI_GAME_SNIPPET = `import { createAuraApp } from "@aura3d/engine";
import { game } from "@aura3d/lean/game";
createAuraApp("#app", {
  scene: game.platformer({ hero: assets.hero }),
  diagnostics: { overlay: true }
});
`;

const CURRENT_RACING_SNIPPET = `import { createAuraApp, lights, scene } from "@aura3d/engine";
const evidence = { routeAlignedToVisibleTrack: true };
scene()
  .add(lights.ambient({ name: "race ambient", intensity: 0.38 }))
  .add(lights.directional({ intensity: 1 }));
const params = new URLSearchParams(location.search);
const capture = params.get("capture");
`;

const LOOK_FIRST_SCENE = `import { createAuraApp, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("outdoor-day"))
    .add(model(assets.hero)),
  ...looks.appOptions("outdoor-day")
});
`;

describe("look lint — current template fixtures flagged", () => {
  it("flags the lean import + overlay default of the current mini-game", () => {
    const cwd = project({ "main.ts": CURRENT_MINI_GAME_SNIPPET });
    const report = runLookLintScan(cwd);
    const rules = report.findings.map((f) => f.rule);
    expect(rules).toContain("look/lean-import");
    expect(rules).toContain("look/overlay-default");
    expect(report.errors).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
  });

  it("flags ambient-without-env, evidence constant and capture branch of the current racing-starter", () => {
    const cwd = project({ "main.ts": CURRENT_RACING_SNIPPET });
    const report = runLookLintScan(cwd);
    const rules = report.findings.map((f) => f.rule);
    expect(rules).toContain("look/ambient-without-env");
    expect(rules).toContain("look/evidence-constant");
    expect(rules).toContain("look/capture-branch");
    expect(report.ok).toBe(false);
  });

  it("flags renderer overrides", () => {
    const cwd = project({
      "main.ts": `import { WebGLRenderer, ACESFilmicToneMapping } from "three";
const renderer = new WebGLRenderer();
renderer.toneMapping = ACESFilmicToneMapping;
renderer.setPixelRatio(1);
`
    });
    const report = runLookLintScan(cwd);
    const rules = report.findings.map((f) => f.rule);
    expect(rules.filter((r) => r === "look/renderer-override")).toHaveLength(2);
  });

  it("passes the look-first rewritten scene", () => {
    const cwd = project({ "main.ts": LOOK_FIRST_SCENE });
    const report = runLookLintScan(cwd);
    expect(report.errors).toBe(0);
    expect(report.ok).toBe(true);
  });
});

describe("look lint — C-39 doctor rules", () => {
  it("runs a test-registered doctor rule over the scanned files", () => {
    const code = `test/evidence-only-${Date.now()}`;
    registerDoctorRule({
      code,
      owner: "test",
      check: (file) => file.text.includes("forbiddenToken")
        ? [{ line: 1, message: "forbiddenToken present", severity: "error" as const }]
        : []
    });
    expect(doctorRulesAll().some((r) => r.code === code)).toBe(true);
    const cwd = project({ "main.ts": LOOK_FIRST_SCENE, "other.ts": "const forbiddenToken = 1;\n" });
    const report = runLookLintScan(cwd);
    expect(report.doctorRules).toContain(code);
    expect(report.findings.some((f) => f.rule === code && f.file.endsWith("other.ts"))).toBe(true);
  });
});

describe("look-from-ambient codemod (§11.5)", () => {
  it("replaces bare lights.ambient with a look preset + TODO", () => {
    const source = `import { createAuraApp, lights, model, scene } from "@aura3d/engine";
scene().add(lights.ambient({ intensity: 0.4 })).add(model(assets.hero));
`;
    const result = lookFromAmbientCodemod.transform(source, "src/main.ts");
    expect(result.code).toContain('looks.preset("outdoor-day")');
    expect(result.code).toContain("TODO");
    expect(result.code).not.toContain("lights.ambient(");
    expect(result.rows[0].mapping).toBe("approximate");
  });

  it("leaves ambient alone when the file already carries a look/env", () => {
    const source = `import { environments, lights, scene } from "@aura3d/engine";
scene().add(environments.studio()).add(lights.ambient({ intensity: 0.4 }));
`;
    const result = lookFromAmbientCodemod.transform(source, "src/main.ts");
    expect(result.code).toBe(source);
    expect(result.rows).toHaveLength(0);
  });

  it("removes renderer qualityProfile 'safe-basic'", () => {
    const source = `const renderer = { qualityProfile: "safe-basic", antialias: true };
`;
    const result = lookFromAmbientCodemod.transform(source, "src/main.ts");
    expect(result.code).not.toContain("safe-basic");
    expect(result.code).toContain("antialias");
  });

  it("renames report.visualSystems to report.appliedEffects", () => {
    const source = `for (const s of report.visualSystems) console.log(s);\n`;
    const result = lookFromAmbientCodemod.transform(source, "src/main.ts");
    expect(result.code).toContain("report.appliedEffects");
    expect(result.code).not.toContain("visualSystems");
  });

  it("is pure on a look-first fixture (no edits, no rows)", () => {
    const result = lookFromAmbientCodemod.transform(LOOK_FIRST_SCENE, "src/main.ts");
    expect(result.code).toBe(LOOK_FIRST_SCENE);
    expect(result.rows).toHaveLength(0);
  });
});
