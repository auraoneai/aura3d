import { expect, test } from "@playwright/test";
import { createCartoonEpisodeReviewPackage } from "../src/review";

test("review package includes human approval checklist and publish boundary", () => {
  const review = createCartoonEpisodeReviewPackage({
    hasWebm: true,
    hasPngSequenceFallback: false,
    generatedAt: "2026-06-06T00:00:00.000Z"
  });

  expect(review).toContain("# Moon Garden 001 Review Package");
  expect(review).toContain("Output mode: `encoded-webm`");
  expect(review).toContain("Review status: `ready-for-human-review`");
  expect(review).toContain("- [ ] Both characters are readable in representative frames.");
  expect(review).toContain("- [ ] Captions do not cover important action.");
  expect(review).toContain("- [ ] Mouth movement is visible during dialogue in the browser route.");
  expect(review).toContain("- [ ] Character body motion is more than still-image wobble.");
  expect(review).toContain("- [ ] No route chrome, proof panels, or debug overlays appear in encoded output.");
  expect(review).toContain("- [ ] Reviewer name and approval date are recorded before publish-ready claims.");
  expect(review).toContain("Human review and asset readiness are still required before public publish-ready claims.");
});
