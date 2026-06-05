#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const options = parseArgs(process.argv.slice(2));
const planPath = resolve(
  process.cwd(),
  options.plan ?? "apps/aura-clash-showcase/launch-evidence.command-plan.json"
);
const outPath = resolve(
  process.cwd(),
  options.out ?? "apps/aura-clash-showcase/launch-evidence/command-plan-run.json"
);

if (!existsSync(planPath)) {
  fail(`Command plan not found: ${planPath}`);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const allEntries = flattenPlan(plan);
const selectedEntries = selectEntries(allEntries, options);

if (selectedEntries.length === 0) {
  fail("No command-plan entries matched the requested filters.");
}

const startedAt = new Date().toISOString();
const execute = options.execute === true;
const continueOnFailure = options.continueOnFailure === true;
const results = [];

for (const entry of selectedEntries) {
  if (!execute) {
    results.push({
      group: entry.group,
      id: entry.id,
      cwd: entry.cwd,
      command: entry.command,
      outputs: entry.outputs,
      requires: entry.requires,
      executed: false,
      ok: true,
      dryRun: true
    });
    continue;
  }

  if (entry.requires?.length && options.force !== true) {
    results.push({
      group: entry.group,
      id: entry.id,
      cwd: entry.cwd,
      command: entry.command,
      outputs: entry.outputs,
      requires: entry.requires,
      executed: false,
      ok: false,
      skipped: true,
      reason: "Entry declares manual requirements. Re-run with --force after satisfying them."
    });

    if (!continueOnFailure) {
      break;
    }

    continue;
  }

  const result = await runEntry(entry);
  results.push(result);

  if (!result.ok && !continueOnFailure) {
    break;
  }
}

const failed = results.filter((result) => !result.ok);
const report = {
  ok: failed.length === 0,
  generatedAt: new Date().toISOString(),
  startedAt,
  planPath,
  execute,
  dryRun: !execute,
  continueOnFailure,
  filters: {
    groups: options.groups,
    ids: options.ids
  },
  selectedCount: selectedEntries.length,
  completedCount: results.length,
  failedCount: failed.length,
  results
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error(`Command plan failed or skipped a required entry.`);
  console.error(`Report written to ${outPath}`);
  process.exit(1);
}

console.log(`Command plan ${execute ? "executed" : "listed"} successfully.`);
console.log(`Report written to ${outPath}`);

function flattenPlan(plan) {
  const entries = [];

  for (const [group, value] of Object.entries(plan)) {
    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      entries.push({
        group,
        id: item.id,
        cwd: resolve(process.cwd(), item.cwd ?? "."),
        command: item.command,
        outputs: item.outputs ?? (item.output ? [item.output] : []),
        requires: item.requires ?? []
      });
    }
  }

  return entries;
}

function selectEntries(entries, options) {
  return entries.filter((entry) => {
    if (options.groups.length > 0 && !options.groups.includes(entry.group)) {
      return false;
    }

    if (options.ids.length > 0 && !options.ids.includes(entry.id)) {
      return false;
    }

    return true;
  });
}

function runEntry(entry) {
  const started = Date.now();
  console.log(`\n[${entry.group}:${entry.id}] ${entry.command}`);

  return new Promise((resolveResult) => {
    const child = spawn(entry.command, {
      cwd: entry.cwd,
      shell: true,
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
        ...entry,
        executed: true,
        ok: false,
        error: error.message,
        durationMs: Date.now() - started,
        stdoutTail: tail(stdout),
        stderrTail: tail(stderr)
      });
    });

    child.on("close", (code, signal) => {
      resolveResult({
        ...entry,
        executed: true,
        ok: code === 0,
        code,
        signal,
        durationMs: Date.now() - started,
        stdoutTail: tail(stdout),
        stderrTail: tail(stderr)
      });
    });
  });
}

function parseArgs(args) {
  const parsed = {
    groups: [],
    ids: [],
    execute: false,
    force: false,
    continueOnFailure: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--execute") {
      parsed.execute = true;
      continue;
    }

    if (arg === "--force") {
      parsed.force = true;
      continue;
    }

    if (arg === "--continue-on-failure") {
      parsed.continueOnFailure = true;
      continue;
    }

    if (arg === "--group") {
      parsed.groups.push(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--id") {
      parsed.ids.push(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--plan" || arg === "--out") {
      parsed[arg.slice(2)] = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${flag}`);
  }

  return value;
}

function tail(text, maxLength = 8000) {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(text.length - maxLength);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
