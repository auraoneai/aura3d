import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  classifyLine,
  classifyText,
  collectAuthoringFiles,
  runCraftRatio,
  EVIDENCE_PATTERN,
  VISUAL_PATTERN
} from "../../../tools/agent-skills/craft-ratio";

// T0.7 — reproduce the research/12 §1.2 table on a vendored copy of the 3.0.1
// authoring files (tests/unit/tools/corpus/craft-ratio/), ±3 lines per file
// per the PRD spec. The research-era counts are raw non-blank for skills rows
// and fence-excluded ("prose") for llms.txt/docs rows — recorded per row in
// expected.json's countMode.
const FIXTURE_ROOT = resolve(__dirname, "corpus/craft-ratio");
const EXPECTED = JSON.parse(readFileSync(resolve(FIXTURE_ROOT, "expected.json"), "utf8")) as {
  files: Record<string, { countMode: "raw" | "prose"; expected: [number, number, number, number] }>;
  totals: Record<"skills" | "docsAgentsGuides", { countMode: "raw" | "prose"; expected: [number, number, number, number] }>;
};

const within = (got: number, want: number, tol: number, label: string) => {
  expect(Math.abs(got - want), label).toBeLessThanOrEqual(tol);
};
const countOf = (f: { nonBlankLines: number; proseLines: number }, mode: "raw" | "prose") =>
  mode === "raw" ? f.nonBlankLines : f.proseLines;

describe("craft-ratio (T0.7)", () => {
  const report = runCraftRatio(FIXTURE_ROOT);
  const byFile = new Map(report.files.map((f) => [f.file, f]));

  it("discovers the fixture corpus (skills/**/*.md, llms.txt, docs/agents/*.md, docs/guides/*.md)", () => {
    const rels = collectAuthoringFiles(FIXTURE_ROOT).map(({ file }) => file.split("craft-ratio/")[1]);
    expect(rels.filter((r) => r?.startsWith("packages/aura3d-cli/skills/")).length).toBeGreaterThanOrEqual(14);
    expect(rels).toContain("llms.txt");
    expect(rels.filter((r) => r?.startsWith("docs/agents/")).length).toBe(21);
    expect(rels.filter((r) => r?.startsWith("docs/guides/")).length).toBe(1);
    // docs/agents/skills-examples/ is a subdirectory — the docs globs are not recursive.
    expect(rels.some((r) => r?.includes("skills-examples/"))).toBe(false);
    expect(report.schema).toBe("aura3d.craft-ratio/1");
  });

  it("reproduces the research/12 §1.2 table within ±3 lines per file", () => {
    for (const [file, row] of Object.entries(EXPECTED.files)) {
      const [n, e, v, b] = row.expected;
      const got = byFile.get(file);
      expect(got, `missing ${file}`).toBeDefined();
      within(countOf(got!, row.countMode), n, 3, `${file} lines`);
      within(got!.evidenceOnly, e, 3, `${file} evidenceOnly`);
      within(got!.visualOnly, v, 3, `${file} visualOnly`);
      within(got!.both, b, 3, `${file} both`);
    }
  });

  it("reproduces the totals rows", () => {
    // skills total: the 13 SKILL.md files + references/boundaries.md (raw mode).
    const skillsRows = Object.keys(EXPECTED.files).filter((f) => f.includes("/skills/"));
    const sumSkill = (pick: (f: (typeof report.files)[number]) => number) =>
      skillsRows.reduce((acc, f) => acc + pick(byFile.get(f)!), 0);
    const [sn, se, sv, sb] = EXPECTED.totals.skills.expected;
    within(sumSkill((f) => f.nonBlankLines), sn, 3, "skills nonBlank total");
    within(sumSkill((f) => f.evidenceOnly), se, 15, "skills evidenceOnly total");
    within(sumSkill((f) => f.visualOnly), sv, 15, "skills visualOnly total");
    within(sumSkill((f) => f.both), sb, 10, "skills both total");
    // docs total: all docs/agents/*.md + docs/guides/*.md (prose mode).
    const docsFiles = report.files.filter((f) => f.group === "docs/agents" || f.group === "docs/guides");
    const dn = docsFiles.reduce((acc, f) => acc + f.proseLines, 0);
    within(dn, EXPECTED.totals.docsAgentsGuides.expected[0], 3, "docs prose total");
  });

  it("classifies lines into evidence-only/visual-only/both/neither", () => {
    expect(classifyLine("Run the screenshot evidence gate before claiming.")).toBe("evidence-only");
    expect(classifyLine("Soft golden-hour lighting with long shadows.")).toBe("visual-only");
    expect(classifyLine("Validate the lighting looks soft in the screenshot.")).toBe("both");
    expect(classifyLine("Install dependencies with pnpm.")).toBe("neither");
    // word-boundary anchors: substrings inside other words must not count.
    expect(classifyLine("The primary directional upgrade works.")).toBe("neither");
    // fence-marker lines count raw but not prose and carry no class.
    const c = classifyText("f.md", "test", "```ts\nconst x = 1;\n```\n\ncontent\n");
    expect(c.nonBlankLines).toBe(4);
    expect(c.proseLines).toBe(2);
  });

  it("writes the report shape", () => {
    const f = byFile.get("packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md")!;
    expect(f.group).toBe("skill");
    expect(f.neither).toBe(f.proseLines - f.evidenceOnly - f.visualOnly - f.both);
    expect(report.groups["skill"].files).toBeGreaterThanOrEqual(14);
    expect(report.patterns.evidence).toBe(EVIDENCE_PATTERN.source);
    expect(report.patterns.visual).toBe(VISUAL_PATTERN.source);
  });
});
