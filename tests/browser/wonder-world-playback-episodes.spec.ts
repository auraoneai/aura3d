/**
 * Wonder World J09, episodes E01-E10 (PRD 04; PRD 06 QA-E02, QA-E09, gate G3; PRD 05 gap 05:320): each episode,
 * started with startStory(id, "watch-sing") and given zero input, runs to its finite end: runToEnd reports finished
 * with reason "complete", the offline card follows, nothing plays next by itself, no more than two tap targets are
 * ever active, and `speaking` never names more than one line. The playback recorder checks `state().spoken` against
 * the authored beats (src/content via the catalog): authored order, no line spoken twice, every line of each visited
 * beat spoken, every beat visited; the stage's diagnostics().warnings stays empty. Per shard (gap 06:65) every request
 * stays on the app's origin, the page logs nothing, and localStorage holds only the parent-settings record.
 * E11-E20 are in wonder-world-playback-episodes-2.spec.ts (one file took 45 min for all 20 on the runner).
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh playback-episodes   (about 23 min)
 *
 * This file also holds the check that the canonical 20-episode list is the one in src/content/episodes.
 * Shards of five episodes per test (one app boot each); a failing episode is a soft failure, so a shard reports every
 * failing episode. Records: WWJSON playback-e01 ... playback-e10 and playback-<range>-summary.
 */
import { expect, test } from "@playwright/test";
import { EPISODES, defineStorySuite, storySlugsOnDisk } from "./wonder-world-lib";

test("Wonder World J09: the canonical 20-episode list matches src/content/episodes", () => {
  expect(storySlugsOnDisk("episodes")).toEqual(EPISODES.map((story) => story.id).sort());
});

defineStorySuite({
  title: "Wonder World J09 episode playback E01-E10",
  stories: EPISODES.slice(0, 10),
  storiesPerTest: 5,
  mode: "watch-sing",
  style: "sampled",
  micProbe: false,
  reportPrefix: "playback",
  viewport: { width: 640, height: 480 }
});
