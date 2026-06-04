#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const bundles = ["aura3d", "threejs"];
const requiredRunnerPhrases = [
  "First read ./context/llms.txt before any other context file.",
  "Do not run `npm run dev`, `npm run preview`, Playwright, browser screenshot",
  "After `npm run build` completes or fails, stop work and return the build",
  "Runtime capture starts only after the agent process has stopped."
];

async function listFiles(dir, prefix = ".") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const joinedPath = path.posix.join(prefix, entry.name);
    const relativePath = joinedPath.startsWith("./") ? joinedPath : `./${joinedPath}`;
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function verifyBundle(bundle) {
  const bundleRoot = path.join(repoRoot, "benchmark", "context", bundle);
  const filesRoot = path.join(bundleRoot, "files");
  const manifestPath = path.join(bundleRoot, "manifest.sha256");
  const relativeFiles = await listFiles(filesRoot);

  if (!relativeFiles.includes("./llms.txt")) {
    throw new Error(`${bundle}: missing files/llms.txt`);
  }

  const actualLines = [];
  for (const relativeFile of relativeFiles) {
    const digest = await sha256(path.join(filesRoot, relativeFile.slice(2)));
    actualLines.push(`${digest}  ${relativeFile}`);
  }

  const expected = (await readFile(manifestPath, "utf8")).trimEnd().split("\n");
  if (actualLines.join("\n") !== expected.join("\n")) {
    throw new Error(
      `${bundle}: manifest mismatch. Refresh with: ` +
        `cd benchmark/context/${bundle}/files && find . -type f | sort | xargs shasum -a 256`
    );
  }

  const llmsText = await readFile(path.join(filesRoot, "llms.txt"), "utf8");
  for (const phrase of ["read", "npm run build", "npm run dev", "stop"]) {
    if (!llmsText.toLowerCase().includes(phrase)) {
      throw new Error(`${bundle}: files/llms.txt is missing required phrase "${phrase}"`);
    }
  }

  return `${bundle}: ${actualLines.length} files verified`;
}

async function verifyRunnerContract() {
  const runnerReadme = await readFile(
    path.join(repoRoot, "benchmark", "runner", "README.md"),
    "utf8"
  );

  for (const phrase of requiredRunnerPhrases) {
    if (!runnerReadme.includes(phrase)) {
      throw new Error(`runner contract missing required phrase: ${phrase}`);
    }
  }

  return "runner contract: finite execution guardrails verified";
}

async function main() {
  const results = [];

  for (const bundle of bundles) {
    results.push(await verifyBundle(bundle));
  }

  results.push(await verifyRunnerContract());

  for (const result of results) {
    console.log(result);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
