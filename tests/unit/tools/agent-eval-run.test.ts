import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// T0.4 — tools/agent-eval/run.ts dry-run acceptance: a stub agent producing a
// fixed project must complete scaffold → agent → build → collect for every
// (prompt, seed) cell and emit run.json documents with schema
// aura3d.agent-eval/1 plus the round summary (aura3d.agent-eval.round/1).
// Fully offline — no npm calls, no model traffic.
const REPO = resolve(__dirname, "../../..");

describe("agent-eval run.ts --dry-run (T0.4)", () => {
  it("completes every cell and emits aura3d.agent-eval/1 run.json", () => {
    const out = mkdtempSync(join(tmpdir(), "agent-eval-"));
    try {
      const stdout = execFileSync(
        resolve(REPO, "node_modules/.bin/tsx"),
        [
          "--tsconfig", "tsconfig.base.json", "tools/agent-eval/run.ts",
          "--dry-run", "--only", "P01,P12", "--seeds", "0,7", "--out", out
        ],
        { cwd: REPO, encoding: "utf8", timeout: 120_000 }
      );
      expect(stdout).toContain("4/4 cells complete");

      for (const cellId of ["P01-s0", "P01-s7", "P12-s0", "P12-s7"]) {
        const cellDir = join(out, cellId);
        const runJson = JSON.parse(readFileSync(join(cellDir, "run.json"), "utf8"));
        expect(runJson.schema).toBe("aura3d.agent-eval/1");
        expect(runJson.cellId).toBe(cellId);
        expect(runJson.agent.backend).toBe("offline");
        expect(runJson.outcome.status).toBe("complete");
        expect(runJson.outcome.phase).toBe("build");
        // artifacts: transcript, build log, src/**, dist/** all recorded on disk
        for (const key of ["transcript", "buildLog"]) {
          expect(existsSync(join(out, runJson.artifacts[key]))).toBe(true);
        }
        expect(existsSync(join(cellDir, "src", "main.ts"))).toBe(true);
        expect(existsSync(join(cellDir, "dist", "index.html"))).toBe(true);
        expect(readFileSync(join(cellDir, "artifacts", "agent-transcript.txt"), "utf8"))
          .toContain("stub-agent");
      }

      const round = JSON.parse(readFileSync(join(out, "round.json"), "utf8"));
      expect(round.schema).toBe("aura3d.agent-eval.round/1");
      expect(round.cells).toHaveLength(4);
      expect(round.cells.every((c: { status: string }) => c.status === "complete")).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 130_000);

  it("refuses a real agent run when KIRO_PRISM_API_KEY is unset (key never on disk)", async () => {
    const { claudeCodeAgent } = await import("../../../tools/agent-eval/agents");
    const out = mkdtempSync(join(tmpdir(), "agent-eval-nokey-"));
    try {
      delete process.env.KIRO_PRISM_API_KEY;
      const res = await claudeCodeAgent({ cli: "true" }).run({
        cellId: "X-s0", runId: "unit", promptId: "X", seed: 0,
        promptText: "p", workdir: out, transcriptPath: join(out, "t.txt"),
        model: "m", limitMs: 1000
      });
      expect(res.ok).toBe(false);
      expect(res.note).toContain("KIRO_PRISM_API_KEY");
      expect(existsSync(join(out, "t.txt"))).toBe(false); // nothing written
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
