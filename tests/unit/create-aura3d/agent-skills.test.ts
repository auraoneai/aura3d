import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  CREATE_AURA3D_TEMPLATES,
  createA3DProject,
  readSkillsManifest,
  selectSkills,
  writeAgentSkills
} from "../../../packages/create-aura3d/src";
import { initAgentFiles, initAgentSetup } from "../../../packages/aura3d-cli/src";

const skillsDir = resolve("packages/aura3d-cli/skills");
const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "aura3d-agent-skills-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("agent skills bundle", () => {
  test("manifest covers every template and core set", () => {
    const manifest = readSkillsManifest(skillsDir);
    expect(Object.keys(manifest.templates).sort()).toEqual([...CREATE_AURA3D_TEMPLATES].sort());
    expect(manifest.coreSet).toContain("aura3d-core");
    for (const name of Object.keys(manifest.skills)) expect(existsSync(join(skillsDir, name, "SKILL.md"))).toBe(true);
  });

  test("selectSkills merges core with template-specific skills", () => {
    const manifest = readSkillsManifest(skillsDir);
    expect(selectSkills(manifest, "none", "fighting-game")).toEqual([]);
    const fighting = selectSkills(manifest, "core", "fighting-game");
    expect(fighting).toEqual(expect.arrayContaining(["aura3d-core", "aura3d-assets", "aura3d-browser-game", "aura3d-character-animation"]));
    expect(fighting).not.toContain("aura3d-threejs-migration");
    expect(selectSkills(manifest, "all")).toHaveLength(Object.keys(manifest.skills).length);
  });

  test("writes per-client skills plus llms.txt and never overwrites user edits", () => {
    const projectDir = temp();
    const first = writeAgentSkills({ projectDir, agent: "claude", skills: "core", skillsDir });
    expect(existsSync(join(projectDir, ".claude/skills/aura3d-core/SKILL.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".claude/skills/aura3d-core/references/boundaries.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".cursor/skills"))).toBe(false);
    expect(readFileSync(join(projectDir, "llms.txt"), "utf8")).toBe(readFileSync("llms.txt", "utf8"));
    expect(existsSync(join(projectDir, ".aura3d-skills.json"))).toBe(true);
    expect(first.skippedUserModified).toEqual([]);

    const edited = join(projectDir, ".claude/skills/aura3d-assets/SKILL.md");
    writeFileSync(edited, "my notes\n");
    const second = writeAgentSkills({ projectDir, agent: "claude", skills: "core", skillsDir });
    expect(second.skippedUserModified).toEqual([edited]);
    expect(readFileSync(edited, "utf8")).toBe("my notes\n");

    const preexisting = temp();
    writeFileSync(join(preexisting, "llms.txt"), "project-owned\n");
    const third = writeAgentSkills({ projectDir: preexisting, agent: "generic", skills: "core", skillsDir });
    expect(third.skippedUserModified).toEqual([join(preexisting, "llms.txt")]);
    expect(readFileSync(join(preexisting, "llms.txt"), "utf8")).toBe("project-owned\n");
  });

  test("aura3d init writes instruction files that reference installed skills", () => {
    const projectDir = temp();
    const setup = initAgentSetup({ projectDir, agent: "all", skills: "core", template: "animation-studio", skillsDir });
    expect(setup.skills).toEqual(expect.arrayContaining(["aura3d-animation-studio", "aura3d-core"]));
    for (const client of [".agents/skills", ".claude/skills", ".cursor/skills", ".github/skills"]) {
      expect(existsSync(join(projectDir, client, "aura3d-animation-studio/SKILL.md"))).toBe(true);
    }
    const agents = readFileSync(join(projectDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("./.agents/skills/");
    expect(agents).not.toContain("./docs/agents/README.md");
    expect(initAgentFiles({ projectDir: temp(), agent: "cursor", skills: "none" })).toHaveLength(1);
  });

  test("create-aura3d scaffolds agent skills when an agent target is given", () => {
    const targetDir = join(temp(), "app");
    const result = createA3DProject({ targetDir, template: "fighting-game", agent: "generic", skills: "core" });
    expect(result.agentSkills?.skills).toEqual(expect.arrayContaining(["aura3d-browser-game"]));
    expect(existsSync(join(targetDir, ".agents/skills/aura3d-browser-game/SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, "llms.txt"))).toBe(true);
    const plain = createA3DProject({ targetDir: join(temp(), "plain"), template: "product-viewer" });
    expect(plain.agentSkills).toBeUndefined();
  });
});
