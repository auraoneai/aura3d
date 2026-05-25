import { normalize, relative } from "node:path";
import {
  ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR,
  ADVANCED_GALLERY_LEGACY_REPORT_DIR
} from "../../tools/advanced-gallery-evidence-paths";

export type VisualReviewStatus = "failed" | "candidate" | "accepted";

export type VisualReviewRecord = {
  readonly status: VisualReviewStatus;
  readonly screenshot?: string;
  readonly screenshotSha256?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly notes?: unknown;
};

export type DemoWithVisualReview = {
  readonly id: string;
  readonly visualReview: VisualReviewRecord;
};

export type RejectedVisualReview<TDemo extends DemoWithVisualReview = DemoWithVisualReview> = {
  readonly id: TDemo["id"];
  readonly status: VisualReviewStatus;
  readonly screenshot: TDemo["visualReview"]["screenshot"];
  readonly notes: TDemo["visualReview"]["notes"];
  readonly reason?: string;
};

type PlaywrightExpectCompatible = {
  <TActual>(actual: TActual, message?: string): {
    toEqual(expected: unknown): unknown;
  };
};

export function summarizeRejectedVisualReviews<TDemo extends DemoWithVisualReview>(
  demos: readonly TDemo[],
): Array<RejectedVisualReview<TDemo>> {
  const rejected: Array<RejectedVisualReview<TDemo>> = [];
  for (const demo of demos) {
    if (demo.visualReview.status !== "accepted") {
      rejected.push({
        id: demo.id,
        status: demo.visualReview.status,
        screenshot: demo.visualReview.screenshot,
        notes: demo.visualReview.notes,
      });
      continue;
    }
    const missingProof = acceptedProofGap(demo.visualReview);
    if (missingProof) {
      rejected.push({
        id: demo.id,
        status: demo.visualReview.status,
        reason: missingProof,
        screenshot: demo.visualReview.screenshot,
        notes: demo.visualReview.notes,
      });
    }
  }
  return rejected;
}

function acceptedProofGap(review: VisualReviewRecord): string | undefined {
  if (!review.screenshot) return "accepted review is missing screenshot path";
  if (!review.screenshotSha256) return "accepted review is missing screenshotSha256";
  if (!review.reviewedBy) return "accepted review is missing reviewedBy";
  if (!review.reviewedAt) return "accepted review is missing reviewedAt";
  if (!isAdvancedGalleryScreenshotPath(review.screenshot)) return "accepted review screenshot must live under the contextual advanced-gallery report directory or its legacy compatibility alias";
  if (!/^[a-f0-9]{64}$/.test(review.screenshotSha256)) return "accepted review screenshotSha256 is not a lowercase SHA-256 hex digest";
  if (review.reviewedBy.trim().length < 2) return "accepted review reviewedBy is too short to identify a reviewer";
  if (!isValidIsoTimestamp(review.reviewedAt)) return "accepted review reviewedAt must be a valid ISO timestamp";
  if (typeof review.notes !== "string" || review.notes.trim().length < 48) return "accepted review is missing detailed humanVerdictNotes";
  if (/\b(candidate|failed|scaffold|not accepted)\b/i.test(review.notes)) return "accepted review notes still contain rejection language";
  if (!/\b(three\.?js|reference|comparable|parity|accepted)\b/i.test(review.notes)) return "accepted review notes must mention the comparison basis";
  return undefined;
}

function isAdvancedGalleryScreenshotPath(path: string): boolean {
  const normalized = normalize(path);
  return [ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR, ADVANCED_GALLERY_LEGACY_REPORT_DIR].some((basePath) => {
    const base = normalize(basePath);
    return relative(base, normalized).startsWith("..") === false
      && relative(base, normalized) !== ""
      && normalized.endsWith(".png");
  });
}

function isValidIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && value.includes("T");
}

export function assertNoRejectedVisualReviews<TDemo extends DemoWithVisualReview>(
  demos: readonly TDemo[],
  expect: PlaywrightExpectCompatible,
): void {
  expect(summarizeRejectedVisualReviews(demos)).toEqual([]);
}
