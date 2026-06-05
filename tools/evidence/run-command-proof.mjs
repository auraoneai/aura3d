#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const commandIndex = args.indexOf("--");

if (commandIndex === -1) {
  usage("Missing `--` command separator.");
}

const options = parseOptions(args.slice(0, commandIndex));
const command = args[commandIndex + 1];
const commandArgs = args.slice(commandIndex + 2);

if (!command) {
  usage("Missing command after `--`.");
}

if (!options.out) {
  usage("Missing required `--out <path>`.");
}

const cwd = resolve(options.cwd ?? process.cwd());
const outPath = resolve(process.cwd(), options.out);
const startedAt = new Date().toISOString();
const startedMs = Date.now();
const previousOutStat = statIfExists(outPath);

const result = await run(command, commandArgs, cwd);
const evidence = {
  ok: result.code === 0,
  id: options.id ?? null,
  label: options.label ?? null,
  generatedAt: new Date().toISOString(),
  startedAt,
  durationMs: Date.now() - startedMs,
  cwd,
  command,
  args: commandArgs,
  exitCode: result.code,
  signal: result.signal,
  stdout: result.stdout,
  stderr: result.stderr,
  stdoutTail: tail(result.stdout),
  stderrTail: tail(result.stderr),
  logPath: options.log ?? null,
  artifacts: parseArtifacts(options.artifact)
};
const report = mergeFreshChildReport(outPath, previousOutStat, evidence);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (options.log) {
  const logPath = resolve(process.cwd(), options.log);
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, formatLog(evidence), "utf8");
}

if (!report.ok) {
  console.error(`Command proof failed: ${command} ${commandArgs.join(" ")}`);
  console.error(`Evidence written to ${outPath}`);
  process.exit(result.code || 1);
}

console.log(`Command proof passed: ${command} ${commandArgs.join(" ")}`);
console.log(`Evidence written to ${outPath}`);

function parseOptions(optionArgs) {
  const parsed = {
    artifact: []
  };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const key = optionArgs[index];
    const value = optionArgs[index + 1];

    if (!key.startsWith("--")) {
      usage(`Unexpected argument: ${key}`);
    }

    if (value === undefined || value.startsWith("--")) {
      usage(`Missing value for ${key}.`);
    }

    if (key === "--artifact") {
      parsed.artifact.push(value);
      index += 1;
      continue;
    }

    parsed[key.slice(2)] = value;
    index += 1;
  }

  return parsed;
}

function run(command, commandArgs, cwd) {
  return new Promise((resolveResult) => {
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      resolveResult({
        code: 1,
        signal: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${error.message}`
      });
    });

    child.on("close", (code, signal) => {
      resolveResult({
        code,
        signal,
        stdout,
        stderr
      });
    });
  });
}

function tail(text, maxLength = 8000) {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(text.length - maxLength);
}

function parseArtifacts(values) {
  return values.map((value) => {
    const [id, path] = value.includes("=") ? value.split(/=(.*)/s).filter(Boolean) : [null, value];

    return {
      id,
      path
    };
  });
}

function usage(message) {
  console.error(message);
  console.error("");
  console.error("Usage:");
  console.error(
    "  node tools/evidence/run-command-proof.mjs --id gate-id --out tests/reports/path.json --log tests/reports/path.log --cwd . -- command arg"
  );
  process.exit(2);
}

function statIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }

  const stat = statSync(path);
  return {
    mtimeMs: stat.mtimeMs,
    size: stat.size
  };
}

function mergeFreshChildReport(path, previousStat, commandProof) {
  const currentStat = statIfExists(path);

  if (!currentStat) {
    return commandProof;
  }

  const changedSinceStart =
    !previousStat ||
    currentStat.mtimeMs !== previousStat.mtimeMs ||
    currentStat.size !== previousStat.size;

  if (!changedSinceStart) {
    return commandProof;
  }

  try {
    const childReport = JSON.parse(readFileSync(path, "utf8"));

    if (!childReport || typeof childReport !== "object" || Array.isArray(childReport)) {
      return commandProof;
    }

    const merged = {
      ...childReport,
      commandProof
    };

    if (Object.prototype.hasOwnProperty.call(childReport, "ok")) {
      merged.ok = childReport.ok === true && commandProof.ok === true;
    }

    return merged;
  } catch {
    return commandProof;
  }
}

function formatLog(evidence) {
  return [
    "# Aura3D command proof log",
    `id: ${evidence.id ?? ""}`,
    `label: ${evidence.label ?? ""}`,
    `generatedAt: ${evidence.generatedAt}`,
    `startedAt: ${evidence.startedAt}`,
    `durationMs: ${evidence.durationMs}`,
    `cwd: ${evidence.cwd}`,
    `command: ${[evidence.command, ...evidence.args].join(" ")}`,
    `exitCode: ${evidence.exitCode}`,
    `signal: ${evidence.signal ?? ""}`,
    "",
    "## stdout",
    evidence.stdout,
    "",
    "## stderr",
    evidence.stderr,
    ""
  ].join("\n");
}
