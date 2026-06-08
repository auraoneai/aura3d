import {
  createPromptAnimationIssue,
  promptAnimationContractVersion,
  type PromptAnimationId,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";
import type { AnimationMotionQualityReport } from "./AnimationMotionQuality.js";
import type { AnimationRouteProof } from "./AnimationRouteProof.js";

export const animationEpisodePackageSchemaVersion = "aura3d-animation-episode-package/v1" as const;

export type AnimationEpisodePackageStatus = "pass" | "fail";
export type AnimationEpisodePackageFileRole =
  | "video-webm"
  | "video-mp4"
  | "png-sequence-manifest"
  | "thumbnail"
  | "captions-vtt"
  | "captions-srt"
  | "metadata-json"
  | "prompt-animation-evidence-json"
  | "route-proof-json"
  | "asset-provenance-json"
  | "render-manifest-json"
  | "visual-acceptance-json"
  | "motion-quality-json"
  | "review-package-md";

export interface AnimationEpisodePackageFile {
  readonly role: AnimationEpisodePackageFileRole;
  readonly path: string;
  readonly present: boolean;
  readonly byteLength?: number | undefined;
  readonly sha256?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly required?: boolean | undefined;
}

export interface AnimationEpisodePackageManifest {
  readonly artifact: "animation-episode-package";
  readonly schemaVersion: typeof animationEpisodePackageSchemaVersion;
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly packageId: PromptAnimationId;
  readonly generatedAt?: string | undefined;
  readonly rootPath: string;
  readonly publishTarget: "review" | "publish";
  readonly files: readonly AnimationEpisodePackageFile[];
  readonly routeProof?: AnimationRouteProof | undefined;
  readonly motionQuality?: AnimationMotionQualityReport | undefined;
  readonly visualAcceptanceStatus?: "pass" | "fail" | "missing" | undefined;
  readonly assetProvenanceStatus?: "pass" | "fail" | "missing" | undefined;
  readonly sourceOnly?: boolean | undefined;
  readonly notTrue3D?: boolean | undefined;
}

export interface AnimationEpisodePackageValidationReport {
  readonly artifact: "animation-episode-package-validation";
  readonly schemaVersion: typeof animationEpisodePackageSchemaVersion;
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly packageId: PromptAnimationId;
  readonly status: AnimationEpisodePackageStatus;
  readonly requiredRoles: readonly AnimationEpisodePackageFileRole[];
  readonly presentRoles: readonly AnimationEpisodePackageFileRole[];
  readonly missingRoles: readonly AnimationEpisodePackageFileRole[];
  readonly emptyRoles: readonly AnimationEpisodePackageFileRole[];
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface CreateAnimationEpisodePackageManifestInput extends Omit<AnimationEpisodePackageManifest, "artifact" | "schemaVersion" | "contractId"> {}

export const requiredAnimationEpisodePackageRoles: readonly AnimationEpisodePackageFileRole[] = [
  "thumbnail",
  "captions-vtt",
  "captions-srt",
  "metadata-json",
  "prompt-animation-evidence-json",
  "route-proof-json",
  "asset-provenance-json",
  "render-manifest-json",
  "visual-acceptance-json",
  "motion-quality-json",
  "review-package-md"
];

export function createAnimationEpisodePackageManifest(
  input: CreateAnimationEpisodePackageManifestInput
): AnimationEpisodePackageManifest {
  return {
    artifact: "animation-episode-package",
    schemaVersion: animationEpisodePackageSchemaVersion,
    contractId: promptAnimationContractVersion,
    ...input
  };
}

export function validateAnimationEpisodePackage(
  manifest: AnimationEpisodePackageManifest
): AnimationEpisodePackageValidationReport {
  const requiredRoles = [...requiredAnimationEpisodePackageRoles, requiredVideoRole(manifest)] as const;
  const presentRoles = manifest.files.filter((file) => file.present).map((file) => file.role);
  const missingRoles = requiredRoles.filter((role) => !presentRoles.includes(role));
  const emptyRoles = manifest.files
    .filter((file) => requiredRoles.includes(file.role) && file.present && (file.byteLength ?? 0) <= 0)
    .map((file) => file.role);
  const issues: PromptAnimationValidationIssue[] = [];

  if (manifest.schemaVersion !== animationEpisodePackageSchemaVersion) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-episode-package-schema-version-unknown",
        `Unknown animation episode package schema "${manifest.schemaVersion}".`
      )
    );
  }
  for (const role of missingRoles) {
    issues.push(
      createPromptAnimationIssue("error", `animation-episode-package-${role}-missing`, `Episode package is missing ${role}.`)
    );
  }
  for (const role of emptyRoles) {
    issues.push(
      createPromptAnimationIssue("error", `animation-episode-package-${role}-empty`, `Episode package file ${role} is empty.`)
    );
  }
  if (manifest.sourceOnly || manifest.notTrue3D) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "animation-episode-package-source-only",
        "Source-only or not-true-3D output cannot satisfy animation episode package readiness."
      )
    );
  }
  if (manifest.routeProof && manifest.routeProof.status !== "pass") {
    issues.push(createPromptAnimationIssue("error", "animation-episode-package-route-proof-fail", "Route proof did not pass."));
  }
  if (manifest.motionQuality && manifest.motionQuality.status !== "pass") {
    issues.push(createPromptAnimationIssue("error", "animation-episode-package-motion-quality-fail", "Motion quality did not pass."));
  }
  if (manifest.visualAcceptanceStatus !== "pass") {
    issues.push(
      createPromptAnimationIssue("error", "animation-episode-package-visual-acceptance-missing", "Visual acceptance must pass.")
    );
  }
  if (manifest.assetProvenanceStatus !== "pass") {
    issues.push(
      createPromptAnimationIssue("error", "animation-episode-package-asset-provenance-missing", "Asset provenance must pass.")
    );
  }

  return {
    artifact: "animation-episode-package-validation",
    schemaVersion: animationEpisodePackageSchemaVersion,
    contractId: promptAnimationContractVersion,
    episodeId: manifest.episodeId,
    packageId: manifest.packageId,
    status: issues.some((issue) => issue.severity === "error") ? "fail" : "pass",
    requiredRoles,
    presentRoles,
    missingRoles,
    emptyRoles,
    issues
  };
}

function requiredVideoRole(manifest: AnimationEpisodePackageManifest): AnimationEpisodePackageFileRole {
  const hasWebm = manifest.files.some((file) => file.role === "video-webm" && file.present);
  const hasMp4 = manifest.files.some((file) => file.role === "video-mp4" && file.present);
  if (hasWebm) return "video-webm";
  if (hasMp4) return "video-mp4";
  return "video-webm";
}
