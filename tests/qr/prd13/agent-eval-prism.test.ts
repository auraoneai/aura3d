// PRD-13 13-S7 — the agent-eval LLM leg routes through Kiro Prism the way
// kiro-prism SETUP.md documents for Claude Code: ANTHROPIC_BASE_URL = Prism
// root, ANTHROPIC_AUTH_TOKEN = key, canonical catalog model id, X-Prism-*
// attribution headers. A fake `claude` CLI records the env it was given.

import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeAgent, prismAttributionHeaders, prismModelId } from "../../../tools/agent-eval/agents";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeCli(dir: string): string {
  const cli = join(dir, "fake-claude.mjs");
  writeFileSync(
    cli,
    [
      "#!/usr/bin/env node",
      'import { writeFileSync } from "node:fs";',
      "const keys = ['ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_MODEL','ANTHROPIC_CUSTOM_HEADERS','ANTHROPIC_API_KEY'];",
      "const env = Object.fromEntries(keys.map((k) => [k, process.env[k] ?? null]));",
      "writeFileSync(process.env.FAKE_CLAUDE_OUT, JSON.stringify({ env, argv: process.argv.slice(2) }));"
    ].join("\n")
  );
  chmodSync(cli, 0o755);
  return cli;
}

describe("agent-eval Kiro Prism routing (13-S7)", () => {
  it("strips the kiro-prism/ route prefix to the Prism catalog id", () => {
    expect(prismModelId("kiro-prism/claude-opus-5.5")).toBe("claude-opus-5.5");
    expect(prismModelId("claude-sonnet-5.5")).toBe("claude-sonnet-5.5");
  });

  it("sends the required attribution headers per cell", () => {
    const headers = prismAttributionHeaders({ runId: "123", cellId: "P01-s0" });
    expect(headers).toContain("X-Prism-Client: aura3d-agent-eval");
    expect(headers).toContain("X-Prism-Session: 123/P01-s0");
    expect(headers).toContain("X-Prism-Agent-Id: P01-s0");
  });

  it("spawns Claude Code against the Prism root with the key in-process only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prd13-prism-"));
    dirs.push(dir);
    const out = join(dir, "seen.json");
    const saved = { ...process.env };
    process.env.KIRO_PRISM_API_KEY = "test-key-not-a-secret";
    process.env.ANTHROPIC_API_KEY = "native-key-must-not-leak";
    process.env.FAKE_CLAUDE_OUT = out;
    delete process.env.KIRO_PRISM_URL;
    delete process.env.A3D_EVAL_AGENT_BASE_URL;
    try {
      const result = await claudeCodeAgent({ cli: fakeCli(dir) }).run({
        cellId: "P01-s0", runId: "123", promptId: "P01", seed: 0, promptText: "build a scene",
        workdir: dir, transcriptPath: join(dir, "t", "transcript.jsonl"),
        model: "kiro-prism/claude-opus-5.5", limitMs: 30_000
      });
      expect(result.ok).toBe(true);
      const seen = JSON.parse(readFileSync(out, "utf8")) as { env: Record<string, string | null>; argv: string[] };
      expect(seen.env.ANTHROPIC_BASE_URL).toBe("https://prism.auraone.ai");
      expect(seen.env.ANTHROPIC_AUTH_TOKEN).toBe("test-key-not-a-secret");
      expect(seen.env.ANTHROPIC_MODEL).toBe("claude-opus-5.5");
      expect(seen.env.ANTHROPIC_API_KEY).toBeNull();
      expect(seen.env.ANTHROPIC_CUSTOM_HEADERS).toContain("X-Prism-Client: aura3d-agent-eval");
      expect(seen.argv).toEqual(expect.arrayContaining(["--model", "claude-opus-5.5"]));
    } finally {
      process.env = saved;
    }
  });

  it("fails the cell (not silently passes) when the key is absent", async () => {
    const saved = { ...process.env };
    delete process.env.KIRO_PRISM_API_KEY;
    try {
      const result = await claudeCodeAgent({ cli: "/nonexistent" }).run({
        cellId: "P01-s0", runId: "1", promptId: "P01", seed: 0, promptText: "x",
        workdir: tmpdir(), transcriptPath: join(tmpdir(), "unused.jsonl"),
        model: "claude-opus-5.5", limitMs: 1_000
      });
      expect(result.ok).toBe(false);
      expect(result.note).toContain("KIRO_PRISM_API_KEY");
    } finally {
      process.env = saved;
    }
  });
});
