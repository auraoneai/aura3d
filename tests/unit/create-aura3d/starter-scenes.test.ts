import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CREATE_AURA3D_TEMPLATES } from "../../../packages/create-aura3d/src";
import { lookFloorStaticFindings, TEMPLATE_LOOK_FLOOR } from "../../../tools/agent-templates/look-floor.mjs";

// N5 starter scenes: product viewer, outdoor, interior, small game, animated presentation.
const STARTERS = ["starter-product", "starter-outdoor", "starter-interior", "starter-game", "starter-presentation"] as const;
const main = (template: string) => readFileSync(`packages/create-aura3d/templates/${template}/src/main.ts`, "utf8");

describe("create-aura3d starter scenes", () => {
  test("every starter is a scaffoldable template with a look-floor row and clean static floor", () => {
    for (const template of STARTERS) {
      expect(CREATE_AURA3D_TEMPLATES as readonly string[]).toContain(template);
      expect(TEMPLATE_LOOK_FLOOR[template], template).toBeDefined();
      expect(lookFloorStaticFindings(template), template).toEqual([]);
    }
  });

  test("starters apply their look with its app options and never hand-roll ambient light, raw model URLs or three", () => {
    for (const template of STARTERS) {
      const source = main(template);
      const look = (TEMPLATE_LOOK_FLOOR as Record<string, { look: string }>)[template]!.look;
      // invariant: every starter scaffolds its look through LOOK_ID + looks.appOptions and flags data-aura3d-ready; the look floor and the readiness probe read exactly these lines
      expect(source, template).toContain(`const LOOK_ID = "${look}" as const;`);
      expect(source, template).toContain("...looks.appOptions(LOOK_ID)");
      expect(source, template).not.toMatch(/lights\.ambient\(|from "three"|\.glb["']/);
      expect(source, template).toContain("document.body.dataset.aura3dReady");
    }
  });

  test("starters that need a camera fit use the framing helpers", () => {
    expect(main("starter-product")).toMatch(/camera\.frame\(product,/);
    expect(main("starter-product")).toMatch(/camera\.framePose\(product,/);
  });

  test("starter-game's round clock waits for app.ready and starter-presentation ignores a malformed ?t=", () => {
    const game = main("starter-game");
    expect(game).toMatch(/if \(state\.over \|\| !started\) return;/);
    expect(game).toMatch(/app\.ready\(\)\.then\(\(\) => \{\n  started = true;/);
    expect(main("starter-presentation")).toMatch(/Number\.isFinite\(frozenParam\)/);
  });

  test("starters are linked from the cheat sheet, llms.txt and the template guide", () => {
    const sheet = readFileSync("docs/agents/first-screen.md", "utf8");
    const llms = readFileSync("llms.txt", "utf8");
    const guide = readFileSync("docs/agents/templates.md", "utf8");
    expect(guide).toContain(`scaffolds one of ${CREATE_AURA3D_TEMPLATES.length} templates`);
    for (const template of STARTERS) {
      expect(sheet, template).toContain(template);
      expect(llms, template).toContain(`\`${template}\``);
      expect(guide, template).toContain(`| \`${template}\` |`);
    }
  });
});
