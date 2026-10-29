/**
 * Wonder World J12, episodes (PRD 04; PRD 06 QA-E02, QA-E03, QA-P01, QA-P02; PRD 01 safety rules): every one of the
 * 20 episodes completes in play-together mode with zero input while the microphone and speech recognition are stubbed
 * out before the app loads. The stubs only count calls (getUserMedia rejects with NotAllowedError), so the spec proves
 * the app never calls getUserMedia (modern or legacy), never constructs or starts SpeechRecognition or
 * webkitSpeechRecognition, never queries the microphone permission, and reports micRequested false throughout
 * (MediaRecorder, createMediaStreamSource and enumerateDevices calls are recorded too, for the evidence; with
 * getUserMedia stubbed they cannot reach a microphone). Each story is one startStory + one runToEnd call, and the
 * story suite's playback recorder, stage-warning, request, console and storage checks apply (see
 * wonder-world-lib.ts defineStorySuite). The 12 activities are in wonder-world-no-speech-required-2.spec.ts (one file
 * took 36 min for all 32 stories on the runner).
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh no-speech-required   (about 22 min)
 *
 * Records: WWJSON nospeech-<code> per story and nospeech-<range>-summary per shard (with the probe counters).
 */
import { EPISODES, defineStorySuite } from "./wonder-world-lib";

defineStorySuite({
  title: "Wonder World J12 no speech required, episodes",
  stories: EPISODES,
  storiesPerTest: 10,
  mode: "play-together",
  style: "single",
  micProbe: true,
  reportPrefix: "nospeech",
  viewport: { width: 640, height: 480 }
});
