// tools/agent-eval/agents.ts — agent runners for T0.4 (PRD-13 §6.7).
//
// Real runs drive Claude Code headless through Kiro Prism (policy §4
// default-first LLM layer). Prism is OpenAI/Anthropic-compatible:
//   base   KIRO_PRISM_URL      (default https://prism.auraone.ai)
//   key    KIRO_PRISM_API_KEY  (CI secret store — never written to disk)
//   model  A3D_EVAL_AGENT_MODEL (pinned per round; Operator route id, e.g.
//          "kiro-prism/claude-opus-5.5" or the bare catalog id)
// Claude Code is configured the documented way: ANTHROPIC_BASE_URL points at
// the Prism Anthropic leg (`<KIRO_PRISM_URL>/anthropic`, override with
// A3D_EVAL_AGENT_BASE_URL), ANTHROPIC_AUTH_TOKEN carries the key in-process,
// and ANTHROPIC_CUSTOM_HEADERS carries the X-Prism-* attribution headers.
// (Authoritative doc: /Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md
// — mirrored conventions from auraoneai/Operator prism-client.mjs until those
// files are committed; adjust the env block below, nowhere else.)
import { spawn } from "node:child_process";
import { createWriteStream, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface AgentRunRequest {
  readonly cellId: string;
  readonly runId: string;
  readonly promptId: string;
  readonly seed: number;
  readonly promptText: string;
  readonly workdir: string;
  readonly transcriptPath: string;
  readonly model: string;
  readonly limitMs: number;
}

export interface AgentRunResult {
  readonly ok: boolean;
  readonly agent: string;
  readonly backend: string;
  readonly model: string | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly exitCode: number | null;
  readonly note?: string;
}

export interface AgentRunner {
  readonly name: string;
  readonly backend: string;
  run(req: AgentRunRequest): Promise<AgentRunResult>;
}

// ---------------------------------------------------------------------------
// Stub agent — emits a fixed minimal project; used by --dry-run and unit tests.
// ---------------------------------------------------------------------------
const STUB_SCENE = `// stub agent project (aura3d.agent-eval dry-run)\nexport const prompt = "fixed project";\n`;

export function stubAgent(): AgentRunner {
  return {
    name: "stub",
    backend: "offline",
    async run(req) {
      const started = Date.now();
      mkdirSync(join(req.workdir, "src"), { recursive: true });
      writeFileSync(join(req.workdir, "src", "main.ts"), STUB_SCENE);
      writeFileSync(
        req.transcriptPath,
        `[stub-agent] cell=${req.cellId} prompt=${req.promptId} seed=${req.seed}\n` +
          `[stub-agent] wrote src/main.ts (fixed project)\n`
      );
      return {
        ok: true, agent: "stub", backend: "offline", model: null,
        durationMs: Date.now() - started, timedOut: false, exitCode: 0,
        note: "stub agent: fixed project, no model call"
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Claude Code headless via Kiro Prism.
// ---------------------------------------------------------------------------
export function claudeCodeAgent(opts: { cli?: string } = {}): AgentRunner {
  const cli = opts.cli ?? process.env.A3D_EVAL_AGENT_CMD ?? "claude";
  return {
    name: "claude-code",
    backend: "kiro-prism",
    async run(req) {
      const apiKey = process.env.KIRO_PRISM_API_KEY;
      if (!apiKey) {
        return {
          ok: false, agent: "claude-code", backend: "kiro-prism", model: req.model,
          durationMs: 0, timedOut: false, exitCode: null,
          note: "KIRO_PRISM_API_KEY not in environment — real runs need the CI secret"
        };
      }
      const prismBase = (process.env.KIRO_PRISM_URL ?? "https://prism.auraone.ai").replace(/\/+$/, "");
      const anthropicBase =
        process.env.A3D_EVAL_AGENT_BASE_URL ?? `${prismBase}/anthropic`;
      const headers = [
        `X-Prism-Client: aura3d-agent-eval`,
        `X-Prism-Job-Type: agent`,
        `X-Prism-Repo: auraoneai/aura3d`,
        `X-Prism-Session: ${req.runId}/${req.cellId}`
      ].join("\n");
      const env = {
        ...process.env,
        ANTHROPIC_BASE_URL: anthropicBase,
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_MODEL: req.model,
        ANTHROPIC_CUSTOM_HEADERS: headers
      };
      mkdirSync(join(req.transcriptPath, ".."), { recursive: true });
      const started = Date.now();
      return await new Promise<AgentRunResult>((resolvePromise) => {
        const out = createWriteStream(req.transcriptPath);
        const child = spawn(
          cli,
          [
            "-p", req.promptText,
            "--output-format", "stream-json",
            "--dangerously-skip-permissions",
            "--model", req.model
          ],
          { cwd: req.workdir, env, stdio: ["ignore", "pipe", "pipe"] }
        );
        child.stdout.pipe(out);
        child.stderr.pipe(out);
        let timedOut = false;
        const killer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
        }, req.limitMs);
        killer.unref();
        child.on("error", (err) => {
          clearTimeout(killer);
          out.end();
          resolvePromise({
            ok: false, agent: "claude-code", backend: "kiro-prism",
            model: req.model, durationMs: Date.now() - started,
            timedOut, exitCode: null, note: `spawn failed: ${err.message}`
          });
        });
        child.on("close", (code) => {
          clearTimeout(killer);
          out.end(() => {
            resolvePromise({
              ok: code === 0 && !timedOut, agent: "claude-code",
              backend: "kiro-prism", model: req.model,
              durationMs: Date.now() - started, timedOut, exitCode: code,
              ...(timedOut ? { note: `agent hit ${Math.round(req.limitMs / 60000)}m limit` } : {})
            });
          });
        });
      });
    }
  };
}

export function resolveAgentRunner(name: string, opts: { cli?: string } = {}): AgentRunner {
  if (name === "stub") return stubAgent();
  if (name === "claude-code") return claudeCodeAgent(opts);
  throw new Error(`unknown agent runner "${name}" (stub | claude-code)`);
}
