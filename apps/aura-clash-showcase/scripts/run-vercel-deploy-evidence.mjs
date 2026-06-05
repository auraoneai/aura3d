#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const marketingRoot = resolve(repoRoot, "marketing");
const deployCwd = resolve(
  process.env.AURA_CLASH_VERCEL_CWD ??
    (existsSync(resolve(marketingRoot, ".vercel/project.json")) ? marketingRoot : repoRoot)
);
const outPath = resolve(
  appRoot,
  process.env.AURA_CLASH_VERCEL_DEPLOY_OUT ?? "launch-evidence/vercel-deploy.json"
);

const prdGates = [
  {
    id: "deploy-to-vercel",
    prdLineHint: 464,
    prdLabel: "Deploy to Vercel.",
    artifact: "apps/aura-clash-showcase/launch-evidence/vercel-deploy.json",
    requiredFields: ["ok: true", "productionUrl", "deploymentUrls"]
  }
];

const command = process.env.AURA_CLASH_VERCEL_COMMAND ?? "vercel";
const args = process.env.AURA_CLASH_VERCEL_ARGS
  ? process.env.AURA_CLASH_VERCEL_ARGS.split(" ").filter(Boolean)
  : ["--prod"];

const startedAt = new Date().toISOString();
const started = Date.now();
const result = await runDeploy();
const deploymentUrls = extractDeploymentUrls(`${result.stdout}\n${result.stderr}`);
const claimedOrigin = process.env.AURA_CLASH_ORIGIN ?? "https://aura3d.auraone.ai";
const productionUrl = process.env.AURA_CLASH_PRODUCTION_URL ?? deploymentUrls[0] ?? null;

const evidence = {
  ok: result.code === 0 && deploymentUrls.length > 0,
  generatedAt: new Date().toISOString(),
  startedAt,
  repoRoot,
  deployCwd,
  claimedOrigin,
  productionUrl,
  command,
  args,
  durationMs: Date.now() - started,
  code: result.code,
  signal: result.signal,
  deploymentUrls,
  prdGateCoverage: [],
  stdout: result.stdout,
  stderr: result.stderr
};
evidence.prdGateCoverage = prdGates.map((gate) => ({
  ...gate,
  ok: evidence.ok && Boolean(evidence.productionUrl)
}));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);

if (!evidence.ok) {
  console.error("Vercel deployment evidence failed.");
  console.error(`Evidence written to ${outPath}`);
  process.exit(1);
}

console.log(`Vercel deployment evidence captured.`);
console.log(`Deployment URLs: ${deploymentUrls.join(", ")}`);
console.log(`Evidence written to ${outPath}`);

function runDeploy() {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd: deployCwd,
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
        stderr: `${stderr}\n${error.message}`.trim()
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

function extractDeploymentUrls(output) {
  const matches = output.match(/https:\/\/[^\s)]+/g) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;]+$/, ""))));
}
