import type { ShowcaseSpec } from "./showcase-spec-types.js";

export function validateGameGameplayProof(spec: ShowcaseSpec, proof: Readonly<Record<string, unknown>>): readonly string[] {
  const blockers: string[] = [];
  blockers.push(...validateScreenshotProof(proof));
  if (spec.category === "game-racing") blockers.push(...validateRacingGameplayProof(spec, proof));
  if (spec.category === "game-platformer") blockers.push(...validatePlatformerGameplayProof(spec, proof));
  return blockers;
}

function validateScreenshotProof(proof: Readonly<Record<string, unknown>>): readonly string[] {
  const screenshots = recordValue(proof.screenshots);
  const beforeInput = recordValue(screenshots?.beforeInput);
  const afterInput = recordValue(screenshots?.afterInput);
  const blockers: string[] = [];
  if (!isPositiveNumber(beforeInput?.bytes)) blockers.push("evidence:gameplay-proof:missing-before-screenshot");
  if (!isPositiveNumber(afterInput?.bytes)) blockers.push("evidence:gameplay-proof:missing-after-screenshot");
  if (!isSha256String(beforeInput?.sha256)) blockers.push("evidence:gameplay-proof:missing-before-screenshot-sha256");
  if (!isSha256String(afterInput?.sha256)) blockers.push("evidence:gameplay-proof:missing-after-screenshot-sha256");
  return blockers;
}

function validateRacingGameplayProof(spec: ShowcaseSpec, proof: Readonly<Record<string, unknown>>): readonly string[] {
  const categoryProof = recordValue(proof.categoryProof);
  const racingProof = recordValue(categoryProof?.racing);
  const blockers: string[] = [];
  if (racingProof?.inputChangesSpeed !== true) blockers.push("evidence:gameplay-proof:racing:input-speed-missing");
  if (racingProof?.inputChangesHeading !== true) blockers.push("evidence:gameplay-proof:racing:input-heading-missing");
  if (racingProof?.checkpointOrLapProgression !== true) blockers.push("evidence:gameplay-proof:racing:checkpoint-lap-missing");
  if (racingProof?.resetWorks !== true) blockers.push("evidence:gameplay-proof:racing:reset-missing");
  blockers.push(...validateVisualReviewEvidence("evidence:gameplay-proof:racing", spec, racingProof));
  if (racingProof?.routeAlignedToVisibleTrack !== true) blockers.push("evidence:gameplay-proof:racing:route-alignment-missing");
  if (racingProof?.noDebugLocatorDisk !== true) blockers.push("evidence:gameplay-proof:racing:debug-locator-disk-present");
  if (numberValue(racingProof?.authoredLapSeconds) < (spec.racing?.raceDesign.minLapSeconds ?? 30)) {
    blockers.push(`evidence:gameplay-proof:racing:authored-lap-seconds-too-low:${numberValue(racingProof?.authoredLapSeconds)}`);
  }
  return blockers;
}

function validatePlatformerGameplayProof(spec: ShowcaseSpec, proof: Readonly<Record<string, unknown>>): readonly string[] {
  const categoryProof = recordValue(proof.categoryProof);
  const platformerProof = recordValue(categoryProof?.platformer);
  const blockers: string[] = [];
  if (platformerProof?.movementChangesPosition !== true) blockers.push("evidence:gameplay-proof:platformer:movement-missing");
  if (platformerProof?.jumpChangesState !== true) blockers.push("evidence:gameplay-proof:platformer:jump-missing");
  if (platformerProof?.checkpointProgression !== true) blockers.push("evidence:gameplay-proof:platformer:checkpoint-missing");
  if (platformerProof?.hazardRespawn !== true) blockers.push("evidence:gameplay-proof:platformer:hazard-respawn-missing");
  if (platformerProof?.finishProgression !== true) blockers.push("evidence:gameplay-proof:platformer:finish-missing");
  blockers.push(...validateVisualReviewEvidence("evidence:gameplay-proof:platformer", spec, platformerProof));
  if (platformerProof?.styleCompatible !== true) blockers.push("evidence:gameplay-proof:platformer:style-fit-missing");
  if (platformerProof?.scaleCompatible !== true) blockers.push("evidence:gameplay-proof:platformer:scale-fit-missing");
  if (numberValue(platformerProof?.authoredPlayableSeconds) < (spec.platformer?.levelDesign.minPlayableSeconds ?? 30)) {
    blockers.push(`evidence:gameplay-proof:platformer:authored-playable-seconds-too-low:${numberValue(platformerProof?.authoredPlayableSeconds)}`);
  }
  return blockers;
}

function validateVisualReviewEvidence(label: string, spec: ShowcaseSpec, proof: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  const blockers: string[] = [];
  if (proof?.visualReviewPass !== true) blockers.push(`${label}:visual-review-missing`);
  const visualReviewEvidence = recordValue(proof?.visualReviewEvidence);
  if (!visualReviewEvidence) return [...blockers, `${label}:visual-review-evidence-missing`];
  if (visualReviewEvidence.source !== "docs/project/showcase-visual-review.json") {
    blockers.push(`${label}:visual-review-source-mismatch`);
  }
  if (visualReviewEvidence.verdict !== "pass") {
    blockers.push(`${label}:visual-review-verdict-not-pass:${stringValue(visualReviewEvidence.verdict)}`);
  }
  if (!screenshotEvidenceIncludes(visualReviewEvidence, spec.evidence.routePrimaryScreenshot)) {
    blockers.push(`${label}:visual-review-screenshot-mismatch`);
  }
  return blockers;
}

function screenshotEvidenceIncludes(visualReviewEvidence: Readonly<Record<string, unknown>>, screenshotPath: string): boolean {
  const screenshotEvidence = visualReviewEvidence.screenshotEvidence;
  return Array.isArray(screenshotEvidence) && screenshotEvidence.some((path) => path === screenshotPath);
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "missing";
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSha256String(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
