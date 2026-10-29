/**
 * Wonder World J09, episodes (PRD 04; PRD 06 QA-E02, QA-E09, gate G3): every one of the 20 episodes, started with
 * startStory(id, "watch-sing") and given zero input, runs to its finite end: runToEnd reports finished with reason
 * "complete", the offline card follows, nothing plays next by itself, no more than two tap targets are ever active,
 * `speaking` never names more than one line, and the page logs no console error.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh playback-episodes
 *
 * Shards of five episodes per test (one app boot each); a failing episode is a soft failure, so a shard reports every
 * failing episode. Records: WWJSON playback-e01 ... playback-e20 and playback-<range>-summary.
 */
import { expect, test } from "@playwright/test";
import { EPISODES, defineStorySuite, storySlugsOnDisk } from "./wonder-world-lib";

test("Wonder World J09: the canonical 20-episode list matches src/content/episodes", () => {
  expect(storySlugsOnDisk("episodes")).toEqual(EPISODES.map((story) => story.id).sort());
});

defineStorySuite({
  title: "Wonder World J09 episode playback",
  stories: EPISODES,
  storiesPerTest: 5,
  mode: "watch-sing",
  style: "sampled",
  micProbe: false,
  reportPrefix: "playback",
  viewport: { width: 640, height: 480 }
});
