/**
 * Wonder World J09, activities (PRD 04; PRD 06 QA-E02, QA-E09, gate G3; PRD 05 gap 05:320): every one of the 12
 * activities, started with startStory(id, "watch-sing") and given zero input, plays its intro and one round, lets the
 * "more or done" wait time out and runs its outro to a finite end: runToEnd reports finished with reason "complete",
 * the offline card follows, nothing plays next by itself, no more than two tap targets are ever active, and
 * `speaking` never names more than one line. The playback recorder checks `state().spoken` against the authored
 * intro, round and outro (src/content via the catalog): authored order, a round's lines once per round and exactly
 * one round with zero input, every line of each visited beat spoken; the stage's diagnostics().warnings stays empty.
 * Per shard (gap 06:65) every request stays on the app's origin, the page logs nothing, and localStorage holds only
 * the parent-settings record.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh playback-activities   (about 19 min)
 *
 * Shards of four activities per test (one app boot each); a failing activity is a soft failure. Records: WWJSON
 * playback-g01 ... playback-g12 and playback-<range>-summary.
 */
import { expect, test } from "@playwright/test";
import { ACTIVITIES, defineStorySuite, storySlugsOnDisk } from "./wonder-world-lib";

test("Wonder World J09: the canonical 12-activity list matches src/content/activities", () => {
  expect(storySlugsOnDisk("activities")).toEqual(ACTIVITIES.map((story) => story.id).sort());
});

defineStorySuite({
  title: "Wonder World J09 activity playback",
  stories: ACTIVITIES,
  storiesPerTest: 4,
  mode: "watch-sing",
  style: "sampled",
  micProbe: false,
  reportPrefix: "playback",
  viewport: { width: 640, height: 480 }
});
