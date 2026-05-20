import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createV5EnvironmentGalleryModel,
  loadV5EnvironmentManifest,
  summarizeV5EnvironmentLibrary
} from "../../packages/environments/src";

interface V5EnvironmentReadinessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "fixtures/v5/environments/manifest.json",
  "fixtures/v5/environments/licenses.md",
  "packages/environments/src/EnvironmentRegistry.ts",
  "packages/environments/src/HDRIEnvironment.ts",
  "packages/environments/src/PMREMPreset.ts",
  "packages/environments/src/EnvironmentPreview.ts",
  "tests/unit/environments/v5-environments.test.ts",
  "tests/browser/v5-environment-gallery.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): V5EnvironmentReadinessCheck {
  return { name, pass, detail };
}

const manifest = loadV5EnvironmentManifest();
const summary = summarizeV5EnvironmentLibrary(manifest);
const gallery = createV5EnvironmentGalleryModel(manifest);
const realHdriFailures = manifest.presets
  .filter((preset) => preset.kind === "real-hdri")
  .filter((preset) => {
    if (!preset.localPath || !preset.sha256 || !preset.bytes) return true;
    const path = resolve(preset.localPath);
    if (!existsSync(path)) return true;
    const data = readFileSync(path);
    return data.length !== preset.bytes || createHash("sha256").update(data).digest("hex") !== preset.sha256;
  })
  .map((preset) => preset.id);
const probeFailures = gallery.filter((entry) => entry.probes.length < manifest.requirements.requiredProbeTypes.length).map((entry) => entry.preset.id);

const checks: V5EnvironmentReadinessCheck[] = [
  check(
    "required-files-present",
    requiredFiles.every((file) => existsSync(resolve(file))),
    requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all V5 environment files exist"
  ),
  check("schema", manifest.schema === "g3d-v5-environment-library/v1", `schema=${manifest.schema}`),
  check(
    "preset-floor",
    summary.presetCount >= manifest.requirements.minimumPresets,
    `${summary.presetCount}/${manifest.requirements.minimumPresets} environment presets`
  ),
  check(
    "real-hdri-floor",
    summary.checkedRealHdriCount >= manifest.requirements.minimumRealHdriSources && realHdriFailures.length === 0,
    realHdriFailures.join(", ") || `${summary.checkedRealHdriCount}/${manifest.requirements.minimumRealHdriSources} checked real HDRIs`
  ),
  check(
    "probe-coverage",
    probeFailures.length === 0 && manifest.requirements.requiredProbeTypes.every((probe) => summary.probeTypes.includes(probe)),
    probeFailures.join(", ") || `probes=${summary.probeTypes.join(", ")}`
  ),
  check(
    "flagship-environment-bindings",
    summary.unresolvedFlagshipBindings.length === 0 && summary.flagshipBindingCount >= 8,
    summary.unresolvedFlagshipBindings.join(", ") || `${summary.flagshipBindingCount} flagship bindings resolved`
  ),
  check(
    "pmrem-diagnostics",
    gallery.every((entry) => entry.diagnostics.pmrem.faceSize >= 256 && entry.diagnostics.pmrem.mipCount >= 8),
    `${summary.totalEstimatedMemoryBytes} estimated bytes across HDRI and PMREM diagnostics`
  ),
  check(
    "diagnostic-warnings",
    summary.diagnosticsWarningCount === 0,
    `${summary.diagnosticsWarningCount} warnings`
  ),
  check(
    "claim-boundary",
    /not flagship visual proof until rendered/i.test(manifest.claimBoundary),
    manifest.claimBoundary
  )
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-v5-environment-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary,
  checks
};

const reportPath = resolve("tests/reports/v5-environment-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`V5 environment readiness passed: ${summary.presetCount} presets, ${summary.checkedRealHdriCount} checked real HDRIs.`);
