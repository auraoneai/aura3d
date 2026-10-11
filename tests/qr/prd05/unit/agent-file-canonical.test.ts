import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initAgentSetup } from "../../../../packages/aura3d-cli/src";

/**
 * #242 (Q-05-1): `aura3d init --agent` writes the canonical agent text from
 * `packages/aura3d-cli/skills/agent-files/AGENTS.md` (PRD-13 T2.15) under a
 * per-agent heading, instead of a hard-coded copy that drifted.
 */
const canonical = readFileSync(join(process.cwd(), "packages/aura3d-cli/skills/agent-files/AGENTS.md"), "utf8")
  .replace(/^#[^\n]*\n+/, "")
  .trimEnd();

describe("#242 init writes the canonical agent file", () => {
  it("generic and claude targets embed the canonical body under their own heading", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "aura3d-agent-file-"));
    try {
      initAgentSetup({ projectDir, agent: "all", skills: "none" });
      const generic = readFileSync(join(projectDir, "AGENTS.md"), "utf8");
      const claude = readFileSync(join(projectDir, ".claude/CLAUDE.md"), "utf8");
      expect(canonical.length).toBeGreaterThan(0);
      expect(generic.startsWith("# Aura3D Instructions For AI coding agent\n")).toBe(true);
      expect(claude.startsWith("# Aura3D Instructions For Claude\n")).toBe(true);
      for (const text of [generic, claude]) {
        expect(text).toContain(canonical);
        expect(text).not.toContain("# Aura3D agent instructions");
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
