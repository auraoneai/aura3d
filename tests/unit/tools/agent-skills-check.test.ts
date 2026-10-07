// T2.2 fixtures — one positive and one negative case per new check.ts rule.
// Rule helpers are pure functions over text; no fixture files needed.
import { describe, expect, it } from "vitest";
import {
  AGENT_LOOK_CATEGORIES,
  checkCraftTargets,
  checkFencedBlock,
  checkQualityBarCategories,
  checkRecipeDensity,
  checkSectionOrder,
  checkVisualQAUsage,
  REQUIRED_SECTION_ORDER
} from "../../../tools/agent-skills/check";
import type { CraftFileReport } from "../../../tools/agent-skills/craft-ratio";

const GOOD_SECTIONS = [
  "---\nname: x\ndescription: d. Use when y.\n---\n",
  ...REQUIRED_SECTION_ORDER.map((s) => `## ${s}\n`)
].join("\n");

describe("T2.2(a) section order", () => {
  it("accepts the required order", () => {
    expect(checkSectionOrder("skill/SKILL.md", GOOD_SECTIONS)).toEqual([]);
  });
  it("fails a missing section", () => {
    const missing = GOOD_SECTIONS.replace("## Look-dev loop\n", "");
    expect(checkSectionOrder("skill/SKILL.md", missing).join()).toMatch(/Look-dev loop/);
  });
  it("fails an out-of-order section", () => {
    // Move "## Procedure" ahead of "## Look target".
    const swapped = GOOD_SECTIONS.replace("## Procedure\n", "").replace("## Look target\n", "## Procedure\n\n## Look target\n");
    expect(checkSectionOrder("skill/SKILL.md", swapped).join()).toMatch(/out of order/);
  });
});

describe("T2.2(c) fenced code blocks", () => {
  it("fails lights.ambient( without an environment in the block", () => {
    const fails = checkFencedBlock("s/SKILL.md", 0, "scene().add(lights.ambient({ intensity: 0.4 }))");
    expect(fails.join()).toMatch(/lights\.ambient/);
  });
  it("passes lights.ambient( when the block also builds a look", () => {
    expect(checkFencedBlock("s/SKILL.md", 0, "scene().add(looks.preset(\"outdoor-day\")).add(lights.ambient({ intensity: 0.1 }))")).toEqual([]);
  });
  it.each([
    ["qualityProfile", "{ renderer: { qualityProfile: \"safe\" } }"],
    ["pixelRatio", "{ pixelRatio: 1 }"],
    ["safe-basic", "qualityProfile: \"safe-basic\""],
    ["softKnee", "softKnee: 0.4"],
    ["fxaa", 'antiAlias({ mode: "fxaa" })'],
    ["replaceTextures", "assets.update({ replaceTextures: true })"],
    ["lean import", 'import { app } from "@aura3d/lean"']
  ])("fails %s in a fenced block", (_label, block) => {
    expect(checkFencedBlock("s/SKILL.md", 0, block).length).toBeGreaterThan(0);
  });
  it("passes a clean block", () => {
    expect(checkFencedBlock("s/SKILL.md", 0, 'scene().add(looks.preset("product-studio"))')).toEqual([]);
  });
});

describe("T2.2(d) visualQA( confinement", () => {
  it("fails visualQA( in an ordinary skill file", () => {
    expect(checkVisualQAUsage("aura3d-performance/SKILL.md", "run `material.visualQA(nodes)`\n").length).toBeGreaterThan(0);
  });
  it("passes in failure-gallery.md", () => {
    expect(checkVisualQAUsage("aura3d-art-direction/references/failure-gallery.md", "`product.visualQA(nodes)` is diagnostic-only\n")).toEqual([]);
  });
  it("passes in the legacy files pending their rewrite tasks", () => {
    expect(checkVisualQAUsage("aura3d-evidence-review/SKILL.md", "`material.visualQA(nodes)`\n")).toEqual([]);
  });
});

describe("T2.4 look-recipes row density", () => {
  const good = "| Genre | Look |\n|---|---|\n| platformer | `outdoor-day` fov 50 |\n| racing | `golden-hour` fov 60 |\n";
  it("passes rows carrying numbers/API names", () => {
    expect(checkRecipeDensity("look-recipes.md", good)).toEqual([]);
  });
  it("fails when most rows are prose-only", () => {
    const bad = "| Genre | Look |\n|---|---|\n| platformer | pretty |\n| racing | nice |\n| fighting | ok |\n";
    expect(checkRecipeDensity("look-recipes.md", bad).length).toBeGreaterThan(0);
  });
});

describe("T2.5 quality-bar categories", () => {
  it("passes when all 12 categories are present", () => {
    const text = AGENT_LOOK_CATEGORIES.map((c) => `## ${c}\n- anchors`).join("\n");
    expect(checkQualityBarCategories("quality-bar.md", text)).toEqual([]);
  });
  it("fails on a missing category", () => {
    const text = AGENT_LOOK_CATEGORIES.slice(1).map((c) => `## ${c}`).join("\n");
    expect(checkQualityBarCategories("quality-bar.md", text).join()).toMatch(/lighting/);
  });
});

describe("T2.2(b) craft-ratio targets", () => {
  const row = (file: string, visualOnly: number, evidenceOnly: number): CraftFileReport => ({
    file, group: "skill", nonBlankLines: 10, proseLines: 10,
    evidenceOnly, visualOnly, both: 0, neither: 0, evidenceShare: 0, visualShare: 0
  });
  it("passes a corpus meeting all §6.5 targets", () => {
    const files = [
      row("packages/aura3d-cli/skills/aura3d-core/SKILL.md", 30, 10),
      row("packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md", 30, 10),
      row("packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md", 30, 10),
      row("docs/guides/build-a-browser-game.md", 20, 10),
      row("docs/agents/game-example-standards.md", 20, 10),
      row("llms.txt", 20, 10)
    ];
    expect(checkCraftTargets(files)).toEqual([]);
  });
  it("fails each violated target independently", () => {
    const files = [row("llms.txt", 0, 50)];
    expect(checkCraftTargets(files).length).toBeGreaterThanOrEqual(1);
    expect(checkCraftTargets(files).join()).toMatch(/llms\.txt craft/);
  });
});
