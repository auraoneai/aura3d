#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const targetRoot = resolve(process.argv[2] || process.cwd());
const doctorReportPath = "tests/reports/v4-external-host-doctor.json";

if (!existsSync(resolve(targetRoot, "package.json"))) {
  throw new Error(`Target does not look like a Galileo3D checkout because package.json is missing: ${targetRoot}`);
}

const doctor = spawnSync("pnpm", ["doctor:v4-external-host:strict"], {
  cwd: targetRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32"
});

if (doctor.status !== 0) {
  console.log(JSON.stringify({
    ok: false,
    command: "RUN_EXTERNAL_HOST_PREFLIGHT",
    targetRoot,
    doctorStatus: doctor.status,
    doctorStdout: doctor.stdout || "",
    doctorStderr: doctor.stderr || "",
    doctorReportPath,
    doctorSummary: readDoctorSummary(),
    reason: "External host doctor failed. Fix the missing Unity/Unreal/public deployment capabilities and rerun this command.",
    nextCommand: "pnpm doctor:v4-external-host"
  }, null, 2));
  process.exit(doctor.status ?? 1);
}

console.log(JSON.stringify({
  ok: true,
  command: "RUN_EXTERNAL_HOST_PREFLIGHT",
  targetRoot,
  doctorStatus: doctor.status,
  doctorStdout: doctor.stdout || "",
  doctorStderr: doctor.stderr || "",
  doctorReportPath,
  doctorSummary: readDoctorSummary(),
  nextCommands: [
    "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
    "node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project",
    "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json",
    "node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject",
    "G3D_PUBLIC_DEMO_URL=https://your-public-demo.example/ pnpm verify:public-demo-deployment",
    "pnpm run:v4-external-host-evidence:execute",
    "pnpm refresh:v4-readiness-reports",
    "pnpm status:v4-parity",
    "pnpm preflight:v4-parity:after-external-evidence"
  ]
}, null, 2));

function readDoctorSummary() {
  const fullPath = resolve(targetRoot, doctorReportPath);
  if (!existsSync(fullPath)) return null;
  try {
    const report = JSON.parse(readFileSync(fullPath, "utf8"));
    return {
      externalHostReady: report.externalHostReady === true,
      handoffPackageReady: report.handoffPackageReady === true,
      externalEvidenceReady: report.externalEvidenceReady === true,
      firstMissingCapability: typeof report.firstMissingCapability === "string" ? report.firstMissingCapability : null,
      firstBlockedArtifact: typeof report.firstBlockedArtifact === "string" ? report.firstBlockedArtifact : null,
      missingArtifactRunbookPath: typeof report.missingArtifactRunbookPath === "string" ? report.missingArtifactRunbookPath : null
    };
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
