/**
 * Wonder World J11 (PRD 04; PRD 06 QA-A01, QA-A03, QA-A08, QA-A09, QA-E10, gate G4; PRD 03 section 4): nothing is
 * audible before a grown-up's tap, the "Tap to start" gesture unlocks audio (or the app says audio is unavailable and
 * runs on captions), and every way of stopping play stops speech: the pause control, the QA pause hook, the page being
 * hidden (with no automatic resume when it is shown again) and "All done", which ends on the offline card. A rapid
 * double skip (the app's skipBeat() extra, the grown-up's manual next) moves the story on. Mute goes through the real
 * grown-up path (corner button, 2 s hold on the gate, the panel's Sound switch): play pauses while the panel is open,
 * the story carries on after it closes, and no recorded voice line starts while sound is off. Throughout, a real-time
 * monitor checks that `speaking` never names more than one line, and a Web Audio probe (installed before the app
 * loads; it changes no behaviour) checks that two recorded voice lines never sound at once.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh audio-and-pausing
 *
 * This spec uses the real-time loop (no ?manual=1): ?story=sheru-big-adventure&mode=play-together, start screen first.
 * Records: WWJSON audio-and-pausing (or audio-and-pausing-partial when a step fails), WWSHOT audio-offline-card.
 */
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  E17,
  READY_TIMEOUT_MS,
  SELECTORS,
  TEST_TIMEOUT_MS,
  attachPageLog,
  captureView,
  emitJson,
  emitShot,
  gotoWonderWorld,
  maxVoiceOverlapSec,
  qaPause,
  qaResume,
  qaSkipBeat,
  qaState,
  readBootError,
  readVoiceProbe,
  runContext,
  setPageHidden,
  sleep,
  startSpeakingMonitor,
  stopSpeakingMonitor,
  voiceProbeInitScript,
  waitFor,
  waitForHooks,
  waitForReady,
  waitForStoryOnStage,
  type PageLog,
  type WonderQaState
} from "./wonder-world-lib";

/** Story clock phases in which the story is running (not paused, not over). */
const RUNNING = ["speaking", "holding", "waiting", "responding"];
/** Voice fades are 30 ms; anything longer than this is two lines talking over each other. */
const MAX_VOICE_OVERLAP_SEC = 0.1;
/** ignoreRepeats() on the corner controls drops a second press within 350 ms. */
const CONTROL_GAP_MS = 600;
const SETTLE_MS = 15_000;
/** The gate opens after a 2000 ms hold (src/ui/parent-gate.ts PARENT_GATE_HOLD_MS); the grown-up holds a little longer. */
const PARENT_HOLD_MS = 2_600;
/** A grown-up UI step that has not happened by then has failed (instead of waiting out the test timeout). */
const UI_TIMEOUT_MS = 30_000;

async function waitForPhase(page: Page, log: PageLog, label: string, accept: (state: WonderQaState) => boolean, timeoutMs = SETTLE_MS): Promise<WonderQaState> {
  return waitFor(page, log, label, timeoutMs, async () => {
    const state = await qaState(page);
    return accept(state) ? state : null;
  });
}

const isPaused = (state: WonderQaState): boolean => state.director?.phase === "paused";
const isRunning = (state: WonderQaState): boolean => RUNNING.includes(state.director?.phase ?? "");
const runningOrOver = (state: WonderQaState): boolean => isRunning(state) || state.screen === "offline";

/** The story clock is frozen: elapsedMs does not move over `ms` of real time. */
async function clockFrozen(page: Page, ms: number): Promise<{ readonly from: number; readonly to: number }> {
  const from = (await qaState(page)).director?.elapsedMs ?? -1;
  await sleep(ms);
  const to = (await qaState(page)).director?.elapsedMs ?? -2;
  return { from, to };
}

/** The story clock moves again after a resume. */
async function clockRuns(page: Page, log: PageLog, label: string): Promise<{ readonly from: number; readonly to: number }> {
  const from = (await qaState(page)).director?.elapsedMs ?? 0;
  const later = await waitForPhase(page, log, label, (state) => (state.director?.elapsedMs ?? 0) > from || state.screen === "offline", 30_000);
  return { from, to: later.director?.elapsedMs ?? from };
}

/**
 * Mute through the grown-up path: the corner grown-up button opens the gate (play pauses), a 2 s hold opens the
 * panel, its Sound switch turns sound off, and closing the panel resumes the story. The hold uses the gate's keyboard
 * path (Enter held 2 s): a held pointer's release could land on the panel that replaces the gate. Then the story must
 * carry on to a new line on caption timing while no recorded voice line starts.
 */
async function muteThroughParentPanel(page: Page, log: PageLog): Promise<Record<string, unknown>> {
  const before = await qaState(page);
  expect(before.settings.sound, "sound is on before the grown-up turns it off").toBe(true);
  await page.locator(SELECTORS.parent).click({ timeout: UI_TIMEOUT_MS });
  const hold = page.locator(SELECTORS.gateHold);
  await hold.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  const gate = await waitForPhase(page, log, "the grown-up gate pauses play", isPaused);
  expect(gate.speaking, "gate open: speaking is null").toBeNull();
  await hold.focus({ timeout: UI_TIMEOUT_MS });
  await page.keyboard.down("Enter");
  await sleep(PARENT_HOLD_MS);
  await page.keyboard.up("Enter");
  const panel = page.locator(SELECTORS.parentPanel);
  await panel.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  await panel.locator("label", { has: page.locator(SELECTORS.soundSwitch) }).click({ timeout: UI_TIMEOUT_MS });
  const off = await waitForPhase(page, log, "the Sound switch turns sound off", (state) => state.settings.sound === false);
  expect(off.director?.phase, "play stays paused while the parent panel is open").toBe("paused");
  await page.locator(SELECTORS.panelClose).click({ timeout: UI_TIMEOUT_MS });
  await panel.waitFor({ state: "detached", timeout: UI_TIMEOUT_MS });
  const resumed = await waitForPhase(page, log, "closing the parent panel resumes play", runningOrOver);
  const startsAtMute = (await readVoiceProbe(page)).starts;
  const lineAtMute = resumed.speaking;
  const next = await waitForPhase(
    page,
    log,
    "the story carries on to a new line while muted",
    (state) => (state.speaking !== null && state.speaking !== lineAtMute) || state.screen === "offline",
    60_000
  );
  // Long enough for a clip that must not play to have been fetched, decoded and started.
  await sleep(1_500);
  const probe = await readVoiceProbe(page);
  const after = await qaState(page);
  expect(after.settings.sound, "sound stays off").toBe(false);
  expect(probe.starts, `no recorded voice line starts while muted (${lineAtMute ?? "none"} -> ${next.speaking ?? "none"})`).toBe(startsAtMute);
  expect(probe.activeNow, "no recorded voice line sounds while muted").toBe(0);
  return { gate: gate.director, soundOff: off.settings, resumed: resumed.director, lineAtMute, nextLine: next.speaking, startsAtMute, startsAfter: probe.starts };
}

/** The whole J11 scenario; `steps` collects what each step saw, for the evidence record. */
async function scenario(page: Page, server: ExampleDevServer, log: PageLog, steps: Record<string, unknown>): Promise<void> {
  // 1. Start screen: nothing audible before the grown-up's tap.
  await gotoWonderWorld(page, server, { story: E17.id, mode: "play-together" });
  const start = page.locator(SELECTORS.start);
  await waitFor(page, log, "the start screen offers Tap to start", READY_TIMEOUT_MS, async () => (await start.isVisible()) || null);
  await waitForHooks(page, log, 60_000);
  const beforeStart = await qaState(page);
  steps["beforeStart"] = { screen: beforeStart.screen, audio: beforeStart.audio, speaking: beforeStart.speaking };
  expect(beforeStart.screen, "the start screen shows first without ?autostart").toBe("start");
  expect(beforeStart.audio.unlocked, "audio stays locked before the start tap").toBe(false);
  expect(beforeStart.speaking, "nothing is spoken before the start tap").toBeNull();
  const probeAtStart = await readVoiceProbe(page);
  expect(probeAtStart.installed, "the voice probe was installed before the app loaded").toBe(true);
  expect(probeAtStart.starts, "no voice line starts before the start tap").toBe(0);

  // 2. The real gesture: audio unlocks, or the app reports it unavailable and runs on captions.
  await start.click({ timeout: UI_TIMEOUT_MS });
  await waitForReady(page, log);
  await waitForStoryOnStage(page, log, E17.id);
  const audio = await waitForPhase(page, log, "audio unlocked or reported unavailable", (state) => state.audio.unlocked || !state.audio.available, 10_000);
  steps["audio"] = audio.audio;
  expect(audio.audio.unlocked || !audio.audio.available, "after the start tap audio is unlocked or explicitly unavailable").toBe(true);
  await startSpeakingMonitor(page);

  // 3. A line plays; the pause control stops speech and freezes the story clock.
  const speaking = await waitForPhase(page, log, "a line is spoken", (state) => state.speaking !== null, 90_000);
  steps["firstLine"] = speaking.speaking;
  await page.locator(SELECTORS.pause).click({ timeout: UI_TIMEOUT_MS });
  const paused = await waitForPhase(page, log, "the pause control pauses the director", isPaused);
  expect(paused.speaking, "pause: speaking is null").toBeNull();
  const frozen = await clockFrozen(page, 1_200);
  await sleep(250);
  const voicesWhilePaused = (await readVoiceProbe(page)).activeNow;
  steps["pauseControl"] = { director: paused.director, frozen, voicesWhilePaused };
  expect(frozen.to, `pause: the story clock is frozen (${JSON.stringify(frozen)})`).toBe(frozen.from);
  expect(voicesWhilePaused, "pause: no voice line is sounding").toBe(0);

  // 4. The same control resumes.
  await sleep(CONTROL_GAP_MS);
  await page.locator(SELECTORS.pause).click({ timeout: UI_TIMEOUT_MS });
  const resumed = await waitForPhase(page, log, "the pause control resumes the director", runningOrOver);
  const running = await clockRuns(page, log, "the story clock runs after resume");
  steps["resumeControl"] = { director: resumed.director, running };
  expect(running.to, "resume: the story clock moves again").toBeGreaterThan(running.from);

  // 5. The page is hidden (tab switch): play pauses; shown again it stays paused until a grown-up resumes.
  await setPageHidden(page, true);
  const hidden = await waitForPhase(page, log, "hiding the page pauses the director", isPaused);
  expect(hidden.speaking, "hidden: speaking is null").toBeNull();
  await setPageHidden(page, false);
  await sleep(1_200);
  const shown = await qaState(page);
  await sleep(250);
  const voicesWhileHidden = (await readVoiceProbe(page)).activeNow;
  steps["visibility"] = { hidden: hidden.director, shown: shown.director, voicesWhileHidden };
  expect(shown.director?.phase, "shown again: no automatic resume of speech").toBe("paused");
  expect(voicesWhileHidden, "hidden: no voice line is sounding").toBe(0);
  await qaResume(page);
  const resumedAfterShow = await waitForPhase(page, log, "resume() after the page is shown", runningOrOver);
  steps["visibilityResumed"] = resumedAfterShow.director;

  // 6. The QA pause and resume hooks.
  await qaPause(page);
  const hookPaused = await waitForPhase(page, log, "pause() pauses the director", isPaused);
  expect(hookPaused.speaking, "pause(): speaking is null").toBeNull();
  await qaResume(page);
  const hookResumed = await waitForPhase(page, log, "resume() resumes the director", runningOrOver);
  steps["hooks"] = { paused: hookPaused.director, resumed: hookResumed.director };

  // 7. Skip (the grown-up's manual next) twice in quick succession: the story moves on two beats and, as the voice
  //    probe checks below, the cut-off line and the next one never sound together.
  const beforeSkip = await qaState(page);
  const fromBeat = beforeSkip.director?.beatIndex ?? 0;
  await qaSkipBeat(page);
  await sleep(300);
  await qaSkipBeat(page);
  const skipped = await waitForPhase(page, log, "skipBeat() moves the story on", (state) => (state.director?.beatIndex ?? -1) >= fromBeat + 2 || state.screen === "offline");
  steps["skip"] = { from: beforeSkip.director, to: skipped.director };
  if (skipped.screen !== "offline") expect(isRunning(skipped), `the story keeps running after a skip (${JSON.stringify(skipped.director)})`).toBe(true);
  await sleep(1_500);

  // 8. Mute from the parent panel: the story carries on, silently.
  if (skipped.screen !== "offline") steps["mute"] = await muteThroughParentPanel(page, log);

  // 9. "All done" ends at once on the offline card, silently.
  await sleep(CONTROL_GAP_MS);
  await page.locator(SELECTORS.allDone).click({ timeout: UI_TIMEOUT_MS });
  const done = await waitForPhase(page, log, "All done shows the offline card", (state) => state.screen === "offline");
  steps["done"] = { screen: done.screen, director: done.director, speaking: done.speaking };
  await expect(page.locator(SELECTORS.offline), "the offline card is visible").toBeVisible();
  expect(done.speaking, "All done: speaking is null").toBeNull();
  if (done.director) expect(done.director.finishedReason, "All done finishes the story as all-done").toBe("all-done");
  emitShot("audio-offline-card", await captureView(page), "jpg");
  await sleep(400);
  const afterDone = await qaState(page);
  expect(afterDone.screen, "the offline card stays (no autoplay of anything next)").toBe("offline");
  expect(afterDone.speaking, "nothing is spoken after All done").toBeNull();

  // 10. Speech never overlapped.
  const monitor = await stopSpeakingMonitor(page);
  const voices = await readVoiceProbe(page);
  const overlap = maxVoiceOverlapSec(voices);
  const spokenKeys = monitor.transitions.map((entry) => entry.speaking).filter((key): key is string => typeof key === "string");
  steps["monitor"] = { samples: monitor.samples, transitions: monitor.transitions.length, malformed: monitor.malformed, maxTargets: monitor.maxTargets, errors: monitor.errors, keys: spokenKeys.slice(0, 60) };
  steps["voices"] = { fetched: voices.fetched, decoded: voices.decoded, starts: voices.starts, activeNow: voices.activeNow, overlap, records: voices.voices.slice(0, 80) };
  steps["appErrors"] = afterDone.errors;
  expect(monitor.samples, "the speaking monitor ran").toBeGreaterThan(10);
  expect(monitor.errors, "state() never threw while sampled").toEqual([]);
  expect(monitor.malformed, "speaking never names two lines at once").toEqual([]);
  expect(spokenKeys.every((key) => key.startsWith(`${E17.code}.`)), `every spoken line belongs to E17 (${spokenKeys.join(", ")})`).toBe(true);
  expect(monitor.maxTargets, "never more than two tap targets").toBeLessThanOrEqual(2);
  if (audio.audio.unlocked && voices.starts === 0) {
    test.info().annotations.push({ type: "note", description: "Audio unlocked but the voice probe saw no recorded line start (clips missing, still loading, or fetched differently); overlap unmeasured." });
  }
  expect(overlap.seconds, `two recorded voice lines overlapped (${overlap.pair.join(" + ")})`).toBeLessThanOrEqual(MAX_VOICE_OVERLAP_SEC);
  expect(voices.activeNow, "no voice line sounds after All done").toBe(0);

  expect(afterDone.micRequested, "no microphone").toBe(false);
  expect(afterDone.errors, "state().errors").toEqual([]);
  expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
  expect(log.pageErrors, "page errors").toEqual([]);
  expect(log.consoleErrors, "console errors").toEqual([]);
}

test.describe("Wonder World J11 audio and pausing", () => {
  test.setTimeout(TEST_TIMEOUT_MS);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("start gesture unlocks audio; pause, hide, skip and All done stop speech; one voice at a time", async ({ page }) => {
    await page.addInitScript(voiceProbeInitScript);
    await page.setViewportSize({ width: 1024, height: 768 });
    const log = attachPageLog(page);
    const steps: Record<string, unknown> = {};
    let passed = false;
    try {
      await scenario(page, server, log, steps);
      passed = true;
    } finally {
      // Printed either way, so a failed step still leaves what the earlier steps saw.
      const last = passed ? null : await qaState(page).catch(() => null);
      emitJson(passed ? "audio-and-pausing" : "audio-and-pausing-partial", {
        ...(await runContext(page, "audio-and-pausing").catch(() => ({}))),
        passed,
        steps,
        last,
        consoleErrors: log.consoleErrors,
        pageErrors: log.pageErrors,
        badResponses: log.badResponses
      });
    }
  });
});
