import { baseReport as baseFoundationReport, validateFoundationReportFreshness } from "../foundation-reporting/index.js";

export {
  currentCommit,
  hashExistingFiles,
  isRecord,
  listFiles,
  readJson,
  writeJson,
} from "../foundation-reporting/index.js";

export const blockedExternalParityClaims = [
  "broad better-than-Three.js language",
  "broad better-than-Babylon.js language",
  "Unity/Unreal replacement language",
  "production-ready language",
  "complete PBR parity language",
] as const;

export const externalParityReportPaths = [
  "tests/reports/external-parity-current-capability.json",
  "tests/reports/external-parity-claim-gates.json",
  "tests/reports/external-parity-engine-comparison.json",
  "tests/reports/external-parity-rendering.json",
  "tests/reports/external-parity-asset-corpus.json",
  "tests/reports/external-parity-asset-compression.json",
  "tests/reports/external-parity-editor-authoring.json",
  "tests/reports/external-parity-runtime.json",
  "tests/reports/external-parity-visual-quality.json",
  "tests/reports/external-parity-product-visual-parity.json",
  "tests/reports/external-parity-pbr-visual-parity.json",
  "tests/reports/external-parity-pbr-reference-readiness.json",
  "tests/reports/external-parity-gltf-loader-visual-parity.json",
  "tests/reports/external-parity-shadow-visual-parity.json",
  "tests/reports/external-parity-postprocess-suite.json",
  "tests/reports/external-parity-shadow-map-readiness.json",
  "tests/reports/external-parity-hdr-visual-parity.json",
  "tests/reports/external-parity-hdr-ibl-readiness.json",
  "tests/reports/external-parity-hdr-render-target-readiness.json",
  "tests/reports/external-parity-pbr-gltf-readiness.json",
  "tests/reports/external-parity-webgpu-parity.json",
  "tests/reports/external-parity-external-engine-baselines.json",
  "tests/reports/external-parity-external-host-runner.json",
  "tests/reports/external-parity-github-external-readiness.json",
  "tests/reports/external-parity-external-evidence-readiness.json",
  "tests/reports/external-parity-unity-unreal-parity.json",
  "tests/reports/external-parity-production-readiness.json",
  "tests/reports/external-parity-ecosystem-readiness.json",
  "tests/reports/external-parity-broad-parity-readiness.json",
  "tests/reports/external-parity-completion-audit.json",
  "tests/reports/external-parity-codebase-root-readiness.json",
] as const;

export function baseReport(root: string, options: Parameters<typeof baseFoundationReport>[1]) {
  return baseFoundationReport(root, {
    ...options,
    blockedClaims: options.blockedClaims ?? blockedExternalParityClaims,
  });
}

export function validateExternalParityReportFreshness(root = process.cwd(), paths: readonly string[] = externalParityReportPaths) {
  return validateFoundationReportFreshness(root, paths);
}

export function sourceFilesFromReport(report: Record<string, unknown> | null, fallback: readonly string[], selfPath: string): readonly string[] {
  const fromHashes = Array.isArray(report?.sourceFileHashes)
    ? report.sourceFileHashes.flatMap((entry) => {
      if (typeof entry === "object" && entry !== null && "path" in entry && typeof entry.path === "string") {
        return [entry.path];
      }
      return [];
    })
    : [];
  return Array.from(new Set([...fromHashes, ...fallback].filter((path) => path !== selfPath)));
}
