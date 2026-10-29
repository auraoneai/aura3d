/**
 * Wonder World J12, activities (PRD 04; PRD 06 QA-E02, QA-E03, QA-P01, QA-P02; PRD 01 safety rules): the 12
 * activities complete in play-together mode with zero input while the microphone and speech recognition are stubbed
 * out before the app loads; the episodes are in wonder-world-no-speech-required.spec.ts, which describes the probe and
 * the checks.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh no-speech-required-2   (about 12 min)
 *
 * Records: WWJSON nospeech-<code> per story and nospeech-<range>-summary per shard (with the probe counters).
 */
import { ACTIVITIES, defineStorySuite } from "./wonder-world-lib";

defineStorySuite({
  title: "Wonder World J12 no speech required, activities",
  stories: ACTIVITIES,
  storiesPerTest: 6,
  mode: "play-together",
  style: "single",
  micProbe: true,
  reportPrefix: "nospeech",
  viewport: { width: 640, height: 480 }
});
