import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const publish = readFileSync('.github/workflows/muse301-publish.yml','utf8');
const review = readFileSync('.github/workflows/muse301-final-review.yml','utf8');
const browser = readFileSync('.github/workflows/browser-matrix.yml','utf8');
test('publication requires exact successful named workflows and retained L01 plan',()=>{
  for(const path of ['browser-matrix.yml','muse301-l01.yml','muse301-gallery.yml','muse301-final-review.yml','muse301-evidence-closure.yml']) assert.match(publish,new RegExp(path.replaceAll('.','\\.')));
  assert.match(publish,/\.head_sha/); assert.match(publish,/\.conclusion/); assert.match(publish,/\.path/);
  assert.match(publish,/publish-all\.mjs --from-plan tests\/reports\/release-tarballs\/release-plan\.json/);
  assert.doesNotMatch(publish,/publish-all\.mjs --pack-only|pnpm pack|pnpm build/);
});
test('publication binds an authenticated User dispatcher to exact approved gallery',()=>{
  assert.match(publish,/\.actor\.type/); assert.match(publish,/EXPECTED_REVIEWER_ID/); assert.match(publish,/final-review-approval\.mjs verify/);
  assert.match(review,/\.github\/workflows\/muse301-gallery\.yml/); assert.match(review,/final-review-approval\.mjs validate-gallery/); assert.match(review,/final-review-approval\.mjs record/); assert.match(review,/final-review-approval\.mjs verify/);
});
test('legacy release remains unable to trigger from a tag',()=>{const legacy=readFileSync('.github/workflows/release.yml','utf8');assert.match(legacy,/Legacy repack workflow/);assert.match(legacy,/REQUESTED_VERSION.*3\.0\.1/);assert.match(legacy,/exact-plan publish coordinator/);assert.doesNotMatch(legacy,/\n\s+push:/);});

test('browser evidence precedes and does not self-require the later human decision',()=>{
  assert.match(browser,/shard: gallery[\s\S]*--grep-invert ["']blocks release acceptance until human visual review accepts every screenshot["']/);
  assert.match(browser,/specs: tests\/browser\/advanced-examples-gallery\.spec\.ts/);
  assert.match(review,/decision:[\s\S]*options: \[approved, rejected\]/);
  assert.match(review,/A3D_REVIEWER_ID/);
  assert.match(review,/final-review-approval\.mjs verify/);
});
