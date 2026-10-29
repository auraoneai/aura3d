/**
 * Wonder World J09, episodes E11-E20 (PRD 04; PRD 06 QA-E02, QA-E09, gate G3; PRD 05 gap 05:320): the second half of
 * the episode playback suite; E01-E10 and the canonical-list check are in wonder-world-playback-episodes.spec.ts,
 * which describes the checks (zero-input runs to a "complete" end, the playback recorder on `state().spoken`, stage
 * warnings, same-origin requests, nothing logged, only the parent-settings record in localStorage).
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh playback-episodes-2   (about 23 min)
 *
 * Shards of five episodes per test (one app boot each); a failing episode is a soft failure. Records: WWJSON
 * playback-e11 ... playback-e20 and playback-<range>-summary.
 */
import { EPISODES, defineStorySuite } from "./wonder-world-lib";

defineStorySuite({
  title: "Wonder World J09 episode playback E11-E20",
  stories: EPISODES.slice(10),
  storiesPerTest: 5,
  mode: "watch-sing",
  style: "sampled",
  micProbe: false,
  reportPrefix: "playback",
  viewport: { width: 640, height: 480 }
});
