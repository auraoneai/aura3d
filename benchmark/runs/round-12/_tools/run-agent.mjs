import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [, , promptDirArg] = process.argv;

if (!promptDirArg) {
  console.error("Usage: node run-agent.mjs <prompt-dir>");
  process.exit(2);
}

const promptDir = resolve(promptDirArg);
const metadataFile = join(promptDir, "run-metadata.json");
const instructionFile = join(promptDir, "agent-instruction.txt");

if (!existsSync(metadataFile) || !existsSync(instructionFile)) {
  console.error(`Missing run metadata or agent instruction in ${promptDir}`);
  process.exit(2);
}

const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
const instruction = readFileSync(instructionFile, "utf8");
const startedAt = new Date();
const agentTimeoutMs = Number(process.env.AURA3D_AGENT_TIMEOUT_MS ?? 20 * 60 * 1000);

const command =
  metadata.agent === "Codex"
    ? {
        bin: "codex",
        args: [
          "exec",
          "--skip-git-repo-check",
          "--ignore-rules",
          "--ignore-user-config",
          "--ephemeral",
          "-s",
          "danger-full-access",
          "-C",
          promptDir,
          "--output-last-message",
          "agent-response.txt",
          instruction
        ]
      }
    : {
        bin: "claude",
        args: [
          "--no-session-persistence",
          "--permission-mode",
          "bypassPermissions",
          "--tools",
          "default",
          "--output-format",
          "text",
          "--print",
          instruction
        ]
      };

writeFileSync(
  join(promptDir, "agent-command.txt"),
  `${command.bin} ${command.args.map((arg) => JSON.stringify(arg)).join(" ")}\n`
);

function appendNotes(lines) {
  const notesFile = join(promptDir, "notes.md");
  const existing = existsSync(notesFile) ? readFileSync(notesFile, "utf8") : "";
  writeFileSync(notesFile, `${existing.replace(/\s*$/, "")}\n${lines.join("\n")}\n`);
}

function agentVersion() {
  const result = spawnSync(command.bin, ["--version"], {
    cwd: promptDir,
    encoding: "utf8",
    timeout: 10000
  });
  const value = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return value || null;
}

function detectExecutionHygieneViolations(text) {
  const violations = [];
  const checks = [
    { pattern: /\bnpm\s+run\s+dev\b/i, label: "agent ran npm run dev" },
    { pattern: /\bnpm\s+run\s+preview\b/i, label: "agent ran npm run preview" },
    { pattern: /\bplaywright\b/i, label: "agent ran or invoked Playwright" },
    { pattern: /\bscreenshot\b/i, label: "agent attempted screenshot/manual visual capture" },
    { pattern: /\bmanual visual\b/i, label: "agent attempted manual visual verification" }
  ];
  for (const check of checks) {
    if (check.pattern.test(text)) violations.push(check.label);
  }
  return Array.from(new Set(violations)).sort();
}

const version = agentVersion();
const result = await runAgentWithTimeout(command.bin, command.args, {
  cwd: promptDir,
  timeoutMs: agentTimeoutMs
});

const finishedAt = new Date();

writeFileSync(join(promptDir, "agent.stdout.log"), result.stdout ?? "");
writeFileSync(join(promptDir, "agent.stderr.log"), result.stderr ?? "");

if (metadata.agent !== "Codex") {
  writeFileSync(join(promptDir, "agent-response.txt"), result.stdout ?? "");
}

const responseText = existsSync(join(promptDir, "agent-response.txt"))
  ? readFileSync(join(promptDir, "agent-response.txt"), "utf8")
  : "";
const executionHygieneViolations = detectExecutionHygieneViolations(
  `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${responseText}`
);
const assumptionLines = responseText
  .split(/\r?\n/)
  .filter((line) => /\b(assumption|question|build command|run command)\b/i.test(line))
  .slice(0, 20);

appendNotes([
  "",
  `agent version: ${version ?? "unavailable"}`,
  `agent started at: ${startedAt.toISOString()}`,
  `agent finished at: ${finishedAt.toISOString()}`,
  `agent exit code: ${result.status}`,
  `agent timed out: ${result.timedOut}`,
  `execution hygiene violations: ${executionHygieneViolations.length ? executionHygieneViolations.join("; ") : "none"}`,
  "agent assumptions/questions:",
  ...(assumptionLines.length ? assumptionLines.map((line) => `- ${line}`) : ["- none found; see agent-response.txt"])
]);

const nextMetadata = {
  ...metadata,
  agentCommand: command.bin,
  agentCommandArgs: command.args,
  agentVersion: version,
  agentStartedAt: startedAt.toISOString(),
  agentFinishedAt: finishedAt.toISOString(),
  agentDurationMs: finishedAt.getTime() - startedAt.getTime(),
  initialPromptDeliveredAt: startedAt.toISOString(),
  agentTimeoutMs,
  agentTimedOut: result.timedOut,
  agentExitCode: result.status,
  agentSignal: result.signal,
  executionHygieneViolations
};

writeFileSync(metadataFile, `${JSON.stringify(nextMetadata, null, 2)}\n`);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

function runAgentWithTimeout(bin, args, options) {
  const child = spawn(bin, args, {
    cwd: options.cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const timer = setTimeout(() => {
    timedOut = true;
    stderr += `\nAgent exceeded benchmark timeout of ${options.timeoutMs}ms; terminating process group.\n`;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, 5000).unref();
  }, options.timeoutMs);

  return new Promise((resolvePromise) => {
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr,
        status: timedOut ? 124 : status,
        signal,
        timedOut
      });
    });
  });
}
