import {
  createPromptAnimationIssue,
  promptAnimationContractVersion,
  type PromptAnimationId,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";
import type { CartoonMotionQualityReport } from "./CartoonMotionQuality.js";
import type { CartoonRouteProof } from "./CartoonRouteProof.js";

export const cartoonEpisodePackageSchemaVersion = "aura3d-cartoon-episode-package/v1" as const;

export type CartoonEpisodePackageStatus = "pass" | "fail";
export type CartoonEpisodePackageFileRole =
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

export interface CartoonEpisodePackageFile {
  readonly role: CartoonEpisodePackageFileRole;
  readonly path: string;
  readonly present: boolean;
  readonly byteLength?: number | undefined;
  readonly sha256?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly required?: boolean | undefined;
}

export interface CartoonEpisodePackageManifest {
  readonly artifact: "cartoon-episode-package";
  readonly schemaVersion: typeof cartoonEpisodePackageSchemaVersion;
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly packageId: PromptAnimationId;
  readonly generatedAt?: string | undefined;
  readonly rootPath: string;
  readonly publishTarget: "review" | "publish";
  readonly files: readonly CartoonEpisodePackageFile[];
  readonly routeProof?: CartoonRouteProof | undefined;
  readonly motionQuality?: CartoonMotionQualityReport | undefined;
  readonly visualAcceptanceStatus?: "pass" | "fail" | "missing" | undefined;
  readonly assetProvenanceStatus?: "pass" | "fail" | "missing" | undefined;
  readonly sourceOnly?: boolean | undefined;
  readonly notTrue3D?: boolean | undefined;
}

export interface CartoonEpisodePackageValidationReport {
  readonly artifact: "cartoon-episode-package-validation";
  readonly schemaVersion: typeof cartoonEpisodePackageSchemaVersion;
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly packageId: PromptAnimationId;
  readonly status: CartoonEpisodePackageStatus;
  readonly requiredRoles: readonly CartoonEpisodePackageFileRole[];
  readonly presentRoles: readonly CartoonEpisodePackageFileRole[];
  readonly missingRoles: readonly CartoonEpisodePackageFileRole[];
  readonly emptyRoles: readonly CartoonEpisodePackageFileRole[];
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface CreateCartoonEpisodePackageManifestInput extends Omit<CartoonEpisodePackageManifest, "artifact" | "schemaVersion" | "contractId"> {}

export const requiredCartoonEpisodePackageRoles: readonly CartoonEpisodePackageFileRole[] = [
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

export function createCartoonEpisodePackageManifest(
  input: CreateCartoonEpisodePackageManifestInput
): CartoonEpisodePackageManifest {
  return {
    artifact: "cartoon-episode-package",
    schemaVersion: cartoonEpisodePackageSchemaVersion,
    contractId: promptAnimationContractVersion,
    ...input
  };
}

export function validateCartoonEpisodePackage(
  manifest: CartoonEpisodePackageManifest
): CartoonEpisodePackageValidationReport {
  const requiredRoles = [...requiredCartoonEpisodePackageRoles, requiredVideoRole(manifest)] as const;
  const presentRoles = manifest.files.filter((file) => file.present).map((file) => file.role);
  const missingRoles = requiredRoles.filter((role) => !presentRoles.includes(role));
  const emptyRoles = manifest.files
    .filter((file) => requiredRoles.includes(file.role) && file.present && (file.byteLength ?? 0) <= 0)
    .map((file) => file.role);
  const issues: PromptAnimationValidationIssue[] = [];

  if (manifest.schemaVersion !== cartoonEpisodePackageSchemaVersion) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "cartoon-episode-package-schema-version-unknown",
        `Unknown cartoon episode package schema "${manifest.schemaVersion}".`
      )
    );
  }
  for (const role of missingRoles) {
    issues.push(
      createPromptAnimationIssue("error", `cartoon-episode-package-${role}-missing`, `Episode package is missing ${role}.`)
    );
  }
  for (const role of emptyRoles) {
    issues.push(
      createPromptAnimationIssue("error", `cartoon-episode-package-${role}-empty`, `Episode package file ${role} is empty.`)
    );
  }
  if (manifest.sourceOnly || manifest.notTrue3D) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "cartoon-episode-package-source-only",
        "Source-only or not-true-3D output cannot satisfy cartoon episode package readiness."
      )
    );
  }
  if (manifest.routeProof && manifest.routeProof.status !== "pass") {
    issues.push(createPromptAnimationIssue("error", "cartoon-episode-package-route-proof-fail", "Route proof did not pass."));
  }
  if (manifest.motionQuality && manifest.motionQuality.status !== "pass") {
    issues.push(createPromptAnimationIssue("error", "cartoon-episode-package-motion-quality-fail", "Motion quality did not pass."));
  }
  if (manifest.visualAcceptanceStatus !== "pass") {
    issues.push(
      createPromptAnimationIssue("error", "cartoon-episode-package-visual-acceptance-missing", "Visual acceptance must pass.")
    );
  }
  if (manifest.assetProvenanceStatus !== "pass") {
    issues.push(
      createPromptAnimationIssue("error", "cartoon-episode-package-asset-provenance-missing", "Asset provenance must pass.")
    );
  }

  return {
    artifact: "cartoon-episode-package-validation",
    schemaVersion: cartoonEpisodePackageSchemaVersion,
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

function requiredVideoRole(manifest: CartoonEpisodePackageManifest): CartoonEpisodePackageFileRole {
  const hasWebm = manifest.files.some((file) => file.role === "video-webm" && file.present);
  const hasMp4 = manifest.files.some((file) => file.role === "video-mp4" && file.present);
  if (hasWebm) return "video-webm";
  if (hasMp4) return "video-mp4";
  return "video-webm";
}
