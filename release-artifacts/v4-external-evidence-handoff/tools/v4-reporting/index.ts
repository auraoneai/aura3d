import { baseReport as baseV3Report, validateV3ReportFreshness } from "../v3-reporting/index.js";

export {
  currentCommit,
  hashExistingFiles,
  isRecord,
  listFiles,
  readJson,
  writeJson,
} from "../v3-reporting/index.js";

export const blockedV4Claims = [
  "broad better-than-Three.js language",
  "broad better-than-Babylon.js language",
  "Unity/Unreal replacement language",
  "production-ready language",
  "complete PBR parity language",
] as const;

export const v4ReportPaths = [
  "tests/reports/v4-current-capability.json",
  "tests/reports/v4-claim-gates.json",
  "tests/reports/v4-engine-comparison.json",
  "tests/reports/v4-rendering.json",
  "tests/reports/v4-asset-corpus.json",
  "tests/reports/v4-asset-compression.json",
  "tests/reports/v4-editor-authoring.json",
  "tests/reports/v4-runtime.json",
  "tests/reports/v4-visual-quality.json",
  "tests/reports/v4-product-visual-parity.json",
  "tests/reports/v4-pbr-visual-parity.json",
  "tests/reports/v4-pbr-reference-readiness.json",
  "tests/reports/v4-gltf-loader-visual-parity.json",
  "tests/reports/v4-shadow-visual-parity.json",
  "tests/reports/v4-postprocess-suite.json",
  "tests/reports/v4-shadow-map-readiness.json",
  "tests/reports/v4-hdr-visual-parity.json",
  "tests/reports/v4-hdr-ibl-readiness.json",
  "tests/reports/v4-hdr-render-target-readiness.json",
  "tests/reports/v4-pbr-gltf-readiness.json",
  "tests/reports/v4-webgpu-parity.json",
  "tests/reports/v4-external-engine-baselines.json",
  "tests/reports/v4-external-host-runner.json",
  "tests/reports/v4-github-external-readiness.json",
  "tests/reports/v4-external-evidence-readiness.json",
  "tests/reports/v4-unity-unreal-parity.json",
  "tests/reports/v4-production-readiness.json",
  "tests/reports/v4-ecosystem-readiness.json",
  "tests/reports/v4-broad-parity-readiness.json",
  "tests/reports/v4-completion-audit.json",
] as const;

export function baseReport(root: string, options: Parameters<typeof baseV3Report>[1]) {
  return baseV3Report(root, {
    ...options,
    blockedClaims: options.blockedClaims ?? blockedV4Claims,
  });
}

export function validateV4ReportFreshness(root = process.cwd(), paths: readonly string[] = v4ReportPaths) {
  return validateV3ReportFreshness(root, paths);
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
