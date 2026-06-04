#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const roundId = parseRoundId(process.argv.slice(2));
const release = process.argv.includes("--release");
const validationStartedAtMs = Date.now();
const validationStartedAt = new Date(validationStartedAtMs).toISOString();
const roundRoot = join(repoRoot, "benchmark/runs", roundId);
const engineRoot = join(roundRoot, "engine");
const summaryPath = join(roundRoot, "validation-summary.json");
const statePath = join(roundRoot, "validation-state.json");
const defaultFailureResponsePath = join(roundRoot, "validation-failure-response.json");
const failureResponsePath = process.env.AURA3D_VALIDATION_FAILURE_RESPONSE
  ? resolve(repoRoot, process.env.AURA3D_VALIDATION_FAILURE_RESPONSE)
  : defaultFailureResponsePath;

mkdirSync(roundRoot, { recursive: true });

let previousState = null;
if (existsSync(statePath) && process.env.AURA3D_ALLOW_VALIDATION_RERUN !== "1") {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  console.error(
    `Validation already ran for ${roundId} with status=${state.status}. ` +
      "Return to implementation or set AURA3D_ALLOW_VALIDATION_RERUN=1 for an explicit override."
  );
  process.exit(1);
}
if (existsSync(statePath)) {
  previousState = JSON.parse(readFileSync(statePath, "utf8"));
  if (process.env.AURA3D_ALLOW_VALIDATION_RERUN === "1" && previousState.status === "fail") {
    const failureResponse = validateFailureResponseBeforeRerun(previousState);
    if (!failureResponse.pass) {
      console.error("Failed validation reruns require a recorded failure response before retry.");
      console.error(failureResponse.failures.join("\n"));
      process.exit(1);
    }
  }
}

const passNumber = Math.max(1, Number(previousState?.passNumber ?? 0) + 1);

writeFileSync(
  statePath,
  `${JSON.stringify({
    schema: "a3d-validation-state/1.0",
    roundId,
    passNumber,
    startedAt: validationStartedAt,
    finishedAt: null,
    status: "running",
    rerunAllowed: false,
    overrideRequired: "AURA3D_ALLOW_VALIDATION_RERUN=1"
  }, null, 2)}\n`
);

const commands = [];
const failures = [];

if (release) {
  const guard = run("node", ["benchmark/runner/full-benchmark-guard.mjs"]);
  if (guard.status !== 0) failures.push("release full-benchmark guard failed");
}

const context = run("node", ["benchmark/runner/verify-context-manifests.mjs"]);
if (context.status !== 0) failures.push("context manifest verification failed");

if (failures.length === 0) {
  const setup = run("node", ["benchmark/runner/setup-engine.mjs", `--round=${roundId}`], {
    env: release ? {} : { AURA3D_NON_RELEASE_VALIDATION: "1" }
  });
  if (setup.status !== 0) failures.push("setup/build/pack/tarball audit failed");
}

if (failures.length === 0) {
  const capture = run("node", ["benchmark/runner/capture-engine-batch.mjs", `--round=${roundId}`]);
  if (capture.status !== 0) failures.push("capture batch failed");
}

const freshness = auditScreenshotFreshness(validationStartedAtMs);
failures.push(...freshness.failures);
const contactSheets = writeContactSheets();
const visualQa = run("node", [
  "benchmark/runner/visual-qa-gates.mjs",
  `--roundRoot=${roundRoot}`,
  `--outputDir=${roundRoot}`,
  `--minScreenshotMtimeMs=${validationStartedAtMs}`,
  "--mode=acceptance"
]);
if (visualQa.status !== 0) failures.push("visual QA/human review acceptance gate failed");
const failureLosses = failures.length === 0 ? [] : collectValidationLosses(failures);
const failureLossesPath = failures.length === 0 ? null : writeValidationFailureLosses(failureLosses);
const failureResponseTemplatePath = failures.length === 0 ? null : writeValidationFailureResponseTemplate(failureLosses);
const summary = {
  schema: "a3d-engine-validation-summary/1.0",
  roundId,
  generatedAt: new Date().toISOString(),
  validationStartedAt,
  releaseValidation: release,
  status: failures.length === 0 ? "pass" : "fail",
  commands,
  freshness,
  contactSheets,
  visualQa: existsSync(join(roundRoot, "visual-qa-gates.json"))
    ? relative(roundRoot, join(roundRoot, "visual-qa-gates.json"))
    : null,
  packageAudit: existsSync(join(roundRoot, "package-tarball-audit.json"))
    ? relative(roundRoot, join(roundRoot, "package-tarball-audit.json"))
    : null,
  metadata: existsSync(join(roundRoot, "round-metadata.json"))
    ? JSON.parse(readFileSync(join(roundRoot, "round-metadata.json"), "utf8"))
    : null,
  failureLosses: failureLossesPath ? relative(roundRoot, failureLossesPath) : null,
  failureResponseTemplate: failureResponseTemplatePath ? relative(roundRoot, failureResponseTemplatePath) : null,
  failures
};

writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  statePath,
  `${JSON.stringify({
    schema: "a3d-validation-state/1.0",
    roundId,
    passNumber,
    startedAt: validationStartedAt,
    finishedAt: summary.generatedAt,
    status: summary.status,
    rerunAllowed: false,
    overrideRequired: "AURA3D_ALLOW_VALIDATION_RERUN=1",
    summary: "validation-summary.json",
    failureLosses: failureLossesPath ? relative(roundRoot, failureLossesPath) : null,
    failureResponseTemplate: failureResponseTemplatePath ? relative(roundRoot, failureResponseTemplatePath) : null,
    failureResponseRequiredForRerun: summary.status === "fail" ? relative(roundRoot, defaultFailureResponsePath) : null,
    failures
  }, null, 2)}\n`
);

console.log(`Validation summary: ${relative(repoRoot, summaryPath)}`);
for (const sheet of contactSheets) {
  console.log(`Contact sheet: ${relative(repoRoot, sheet)}`);
}
console.log(`Validation status: ${summary.status}`);

if (summary.status !== "pass") process.exit(1);

function parseRoundId(args) {
  const roundArg = args.find((arg) => arg.startsWith("--round="))?.slice("--round=".length) ?? args[0];
  if (!roundArg || !/^round-[a-zA-Z0-9._-]+$/.test(roundArg)) {
    console.error("Usage: node benchmark/runner/validate-engine-round.mjs --round=round-N [--release]");
    process.exit(2);
  }
  return roundArg;
}

function run(command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    env: { ...process.env, ...(options.env ?? {}) }
  });
  const record = {
    command: `${command} ${args.join(" ")}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr
  };
  commands.push(record);
  writeFileSync(
    join(roundRoot, `validation-command-${String(commands.length).padStart(2, "0")}.log`),
    [`$ ${record.command}`, "", record.stdout ?? "", record.stderr ?? ""].join("\n")
  );
  return result;
}

function auditScreenshotFreshness(startMs) {
  const records = [];
  const failures = [];
  for (const screenshot of collectScreenshots()) {
    const stat = statSync(screenshot);
    const fresh = stat.mtimeMs >= startMs;
    records.push({
      path: relative(roundRoot, screenshot),
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      fresh
    });
    if (!fresh) failures.push(`stale screenshot: ${relative(roundRoot, screenshot)}`);
  }
  if (records.length === 0 && existsSync(engineRoot)) failures.push("no screenshots captured");
  writeFileSync(
    join(roundRoot, "screenshot-freshness.json"),
    `${JSON.stringify({ validationStartedAt, records, failures }, null, 2)}\n`
  );
  return { report: "screenshot-freshness.json", records, failures };
}

function collectScreenshots() {
  const screenshots = [];
  if (!existsSync(engineRoot)) return screenshots;
  for (const scene of readdirSync(engineRoot)) {
    for (const library of ["aura3d", "threejs"]) {
      const file = join(engineRoot, scene, library, "screenshot.png");
      if (existsSync(file)) screenshots.push(file);
    }
  }
  return screenshots.sort();
}

function writeContactSheets() {
  const screenshots = collectScreenshots();
  const htmlPath = join(roundRoot, "contact-sheet.html");
  const mdPath = join(roundRoot, "contact-sheet.md");
  const cards = screenshots.map((file) => {
    const rel = relative(roundRoot, file).replaceAll("\\", "/");
    const label = rel.replaceAll("/", " / ");
    return `<figure><img src="${rel}" alt="${label}"><figcaption>${label}</figcaption></figure>`;
  });
  writeFileSync(
    htmlPath,
    [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<meta charset=\"utf-8\">",
      `<title>${roundId} contact sheet</title>`,
      "<style>",
      "body{margin:24px;background:#0b1018;color:#f8fafc;font:14px/1.4 system-ui,sans-serif}",
      "main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}",
      "figure{margin:0;border:1px solid #263244;border-radius:10px;background:#111827;overflow:hidden}",
      "img{display:block;width:100%;height:auto;background:#030712}",
      "figcaption{padding:8px 10px;color:#cbd5e1;font-weight:700}",
      "</style>",
      `<h1>${roundId} contact sheet</h1>`,
      `<p>Generated ${new Date().toISOString()}</p>`,
      "<main>",
      cards.join("\n"),
      "</main>",
      "</html>",
      ""
    ].join("\n")
  );
  writeFileSync(
    mdPath,
    [
      `# ${roundId} contact sheet`,
      "",
      `Generated ${new Date().toISOString()}`,
      "",
      ...screenshots.flatMap((file) => {
        const rel = relative(roundRoot, file).replaceAll("\\", "/");
        return [`## ${basename(file)} - ${rel}`, "", `![${rel}](${rel})`, ""];
      })
    ].join("\n")
  );
  return [htmlPath, mdPath];
}

function validateFailureResponseBeforeRerun(previous) {
  const failures = [];
  if (!existsSync(failureResponsePath)) {
    return {
      pass: false,
      failures: [
        `missing failure response: ${failureResponsePath}`,
        "create validation-failure-response.json from validation-failure-response-template.json",
        "record exactLosingPrompts with promptKey/fileName and prdWorkstream for every loss",
        "record codeChanges with changed files and workstream mappings before rerunning"
      ]
    };
  }
  let response;
  try {
    response = JSON.parse(readFileSync(failureResponsePath, "utf8"));
  } catch (error) {
    return { pass: false, failures: [`failure response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (response.schema !== "a3d-validation-failure-response/1.0") failures.push("failure response schema must be a3d-validation-failure-response/1.0");
  if (response.roundId !== roundId) failures.push(`failure response roundId must be ${roundId}`);
  if (response.previousStatus !== "fail" && previous.status === "fail") failures.push("failure response previousStatus must be fail");
  if (!Date.parse(response.reviewedAt ?? "")) failures.push("failure response reviewedAt must be a parseable timestamp");
  const losingPrompts = response.exactLosingPrompts ?? response.losingPrompts ?? [];
  if (!Array.isArray(losingPrompts) || losingPrompts.length === 0) failures.push("failure response must record exactLosingPrompts");
  const promptWorkstreams = new Set();
  for (const [index, prompt] of (Array.isArray(losingPrompts) ? losingPrompts : []).entries()) {
    const promptKey = prompt.promptKey ?? prompt.fileName ?? prompt.promptId ?? prompt.id;
    const workstream = prompt.prdWorkstream ?? prompt.workstream;
    if (!String(promptKey ?? "").trim()) failures.push(`exactLosingPrompts[${index}] is missing promptKey/fileName/promptId`);
    if (!String(workstream ?? "").trim()) failures.push(`exactLosingPrompts[${index}] is missing prdWorkstream`);
    if (!String(prompt.failure ?? prompt.reason ?? prompt.detail ?? "").trim()) failures.push(`exactLosingPrompts[${index}] is missing failure detail`);
    if (workstream) promptWorkstreams.add(String(workstream));
  }
  const codeChanges = response.codeChanges ?? [];
  if (!Array.isArray(codeChanges) || codeChanges.length === 0) failures.push("failure response must record codeChanges made before retry");
  const changedWorkstreams = new Set();
  for (const [index, change] of (Array.isArray(codeChanges) ? codeChanges : []).entries()) {
    const workstream = change.prdWorkstream ?? change.workstream;
    const files = change.files ?? [];
    if (!String(workstream ?? "").trim()) failures.push(`codeChanges[${index}] is missing prdWorkstream`);
    if (!Array.isArray(files) || files.length === 0) failures.push(`codeChanges[${index}] must list changed files`);
    if (!String(change.summary ?? "").trim()) failures.push(`codeChanges[${index}] is missing summary`);
    if (workstream) changedWorkstreams.add(String(workstream));
  }
  for (const workstream of promptWorkstreams) {
    if (!changedWorkstreams.has(workstream)) failures.push(`no codeChanges entry maps to losing workstream: ${workstream}`);
  }
  return { pass: failures.length === 0, failures };
}

function collectValidationLosses(topLevelFailures) {
  const losses = [];
  const seen = new Set();
  const addLoss = (loss) => {
    const promptKey = loss.promptKey ?? loss.fileName ?? loss.id;
    const prdWorkstream = loss.prdWorkstream ?? mapLossToWorkstream(promptKey, loss.detail);
    const key = `${promptKey}|${prdWorkstream}|${loss.source}|${loss.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    losses.push({
      promptKey,
      fileName: loss.fileName ?? null,
      source: loss.source,
      prdWorkstream,
      failure: loss.detail
    });
  };

  const visualReportPath = join(roundRoot, "visual-qa-gates.json");
  if (existsSync(visualReportPath)) {
    const report = JSON.parse(readFileSync(visualReportPath, "utf8"));
    for (const check of report.coverageChecks ?? []) {
      if (!check.pass) addLoss({ promptKey: check.fileName, fileName: check.fileName, source: "screenshot-coverage", detail: check.detail ?? check.id });
    }
    for (const check of report.screenshotChecks ?? []) {
      if (!check.pass) addLoss({ promptKey: basename(check.file), fileName: basename(check.file), source: "pixel-gate", detail: (check.failures ?? []).join("; ") || "screenshot pixel gate failed" });
    }
    for (const check of report.comparisonChecks ?? []) {
      if (!check.pass) addLoss({ promptKey: comparisonPromptKey(check.id), source: "state-delta", detail: check.detail ?? check.id });
    }
    for (const check of report.humanoidFrameContinuityChecks ?? []) {
      if (!check.pass) addLoss({ promptKey: "humanoid-frame-continuity", source: "humanoid-continuity", detail: check.detail ?? check.id });
    }
    for (const failure of report.humanReview?.failures ?? []) {
      addLoss({ promptKey: reviewFailurePromptKey(failure), source: "human-review", detail: failure });
    }
  }
  for (const failure of topLevelFailures) {
    addLoss({ promptKey: "validation-runner", source: "validation-runner", detail: failure });
  }
  return losses;
}

function writeValidationFailureLosses(losses) {
  const path = join(roundRoot, "validation-failure-losses.json");
  writeFileSync(path, `${JSON.stringify({
    schema: "a3d-validation-failure-losses/1.0",
    roundId,
    generatedAt: new Date().toISOString(),
    losses
  }, null, 2)}\n`);
  return path;
}

function writeValidationFailureResponseTemplate(losses) {
  const path = join(roundRoot, "validation-failure-response-template.json");
  writeFileSync(path, `${JSON.stringify({
    schema: "a3d-validation-failure-response/1.0",
    roundId,
    previousStatus: "fail",
    previousSummary: "validation-summary.json",
    reviewedAt: "",
    owner: "",
    exactLosingPrompts: losses.map((loss) => ({
      promptKey: loss.promptKey,
      fileName: loss.fileName,
      prdWorkstream: loss.prdWorkstream,
      failure: loss.failure
    })),
    codeChanges: [
      {
        prdWorkstream: "",
        files: [],
        summary: ""
      }
    ],
    notes: "Copy this file to validation-failure-response.json, fill reviewedAt/owner/codeChanges, and map every losing prompt to the PRD-2 workstream before rerunning."
  }, null, 2)}\n`);
  return path;
}

function comparisonPromptKey(id) {
  if (/neon/i.test(id)) return "neon-frame-1.png/neon-frame-2.png";
  if (/data/i.test(id)) return "data-default.png/data-hover.png";
  if (/city/i.test(id)) return "city-day.png/city-night.png";
  if (/humanoid/i.test(id)) return "humanoid-frame-1.png/humanoid-frame-2.png";
  return id;
}

function reviewFailurePromptKey(failure) {
  const match = String(failure).match(/([a-z0-9-]+\.png)/i);
  return match?.[1] ?? "human-review.json";
}

function mapLossToWorkstream(promptKey, detail = "") {
  const text = `${promptKey ?? ""} ${detail ?? ""}`.toLowerCase();
  if (text.includes("humanoid")) return "A3D2-D Character And Humanoid System";
  if (text.includes("mini-golf") || text.includes("physics")) return "A3D2-E Physics And Game Feel";
  if (text.includes("particle")) return "A3D2-F Particles And VFX";
  if (text.includes("data")) return "A3D2-G Data Visualization";
  if (text.includes("neon")) return "A3D2-H Neon Tunnel";
  if (text.includes("city")) return "A3D2-I City Block";
  if (text.includes("product")) return "A3D2-J Product Viewer";
  if (text.includes("solar")) return "A3D2-K Solar System";
  if (text.includes("material")) return "A3D2-C Material System Upgrade";
  if (text.includes("context")) return "A3D2-N Agent Documentation And Context";
  if (text.includes("setup") || text.includes("build") || text.includes("pack") || text.includes("tarball")) return "A3D2-A Benchmark And Packaging Truth";
  return "A3D2-M Visual QA And Release Gates";
}
