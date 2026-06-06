#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const outPath = resolve(appRoot, process.env.AURA_CLASH_FLAGSHIP_GATES_OUT ?? "tests/reports/flagship-gates.json");

const commands = [
  {
    id: "flagship-readiness-tool",
    command: "npm",
    args: ["run", "flagship:readiness"]
  },
  {
    id: "flagship-playwright",
    command: "npm",
    args: ["run", "test:flagship"]
  }
];

const startedAt = new Date().toISOString();
const results = [];

for (const item of commands) {
  results.push(await runCommand(item));
}

const failed = results.filter((result) => !result.ok);
const report = {
  schema: "aura-clash-flagship-gates",
  ok: failed.length === 0,
  status: failed.length === 0 ? "flagship-ready" : "flagship-blocked",
  startedAt,
  generatedAt: new Date().toISOString(),
  appRoot,
  commandCount: commands.length,
  completedCount: results.length,
  failedCount: failed.length,
  results
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Aura Clash flagship gate report written to ${outPath}`);

if (!report.ok) {
  console.error("Aura Clash flagship gates failed.");
  process.exit(1);
}

function runCommand(item) {
  const started = Date.now();
  console.log(`\n[${item.id}] ${item.command} ${item.args.join(" ")}`);

  return new Promise((resolveResult) => {
    const child = spawn(item.command, item.args, {
      cwd: appRoot,
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
        ...item,
        ok: false,
        error: error.message,
        durationMs: Date.now() - started,
        stdout,
        stderr
      });
    });

    child.on("close", (code, signal) => {
      resolveResult({
        ...item,
        ok: code === 0,
        code,
        signal,
        durationMs: Date.now() - started,
        stdout,
        stderr
      });
    });
  });
}
