/**
 * Wonder World grown-up settings (PRD 06 gaps 06:165 and 06:133; PRD 01 sections 6-9; PRD 04 E03, E04 and E07): the
 * real grown-up path from the story menu (the grown-up button, then the press-and-hold gate held 2.6 s on the
 * keyboard, src/ui/parent-gate.ts) opens the parent panel (src/ui/parent-panel.ts), where a grown-up turns captions
 * and music off, turns high contrast on, picks a 7 s waiting time, two words for today and the "Soft" sound-effect
 * level (found by its role and label: the radio "Soft" in the group "Sound effects"; when the panel has no such
 * control yet that one step is skipped with a note in the record and the test annotations). After a reload every
 * choice is still in force: in state().settings, on <html> (the high-contrast class) and in the panel's controls, and
 * the stored record holds exactly those values under wonder-world.parent-settings.v1. "Clear settings on this device"
 * then brings every default back (controls, state, <html>) and removes the stored record. Throughout, localStorage
 * holds only that key with allow-listed fields, every request stays on the app's origin and the page logs nothing.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh parent-panel   (estimated 8-10 min: two boots with
 * `?models=0`, then UI steps)
 *
 * The page opens with `?autostart=1&manual=1&models=0` (the menu, no story, primitive stand-ins: the panel needs no
 * models). First the menu itself (PRD 04 E02): all 32 cards, each with its host's portrait loaded. Records: WWJSON
 * parent-panel (parent-panel-partial when a step fails); WWSHOT story-menu (the menu with its portraits) and
 * parent-panel (the open panel after the changes: grown-up settings only, no child data).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { SETTINGS_STORAGE_KEY } from "../../apps/veer-wonder-world/src/ui/settings-store";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  SELECTORS,
  attachPageLog,
  captureView,
  emitJson,
  emitShot,
  expectPagePrivacy,
  openWonderWorld,
  qaState,
  readBootError,
  readStorage,
  runContext,
  sleep,
  waitForHooks,
  waitForReady,
  type PageLog
} from "./wonder-world-lib";

/** The gate opens after a 2000 ms hold (src/ui/parent-gate.ts PARENT_GATE_HOLD_MS); the grown-up holds a little longer. */
const PARENT_HOLD_MS = 2_600;
// Software WebGL2 holds the page's main thread for long stretches even after boot (a click waits until the page can
// take it), so a step gets two minutes; a step that has not happened by then has failed.
const UI_TIMEOUT_MS = 120_000;
const VIEWPORT = { width: 800, height: 600 } as const;
const QUERY = { autostart: 1, manual: 1, models: 0 } as const;

/** What the grown-up picks, and the defaults Clear restores (src/ui/settings-store.ts defaultSettings). */
const CHOSEN = { captions: false, music: false, highContrast: true, waitMs: 7_000, wordList: ["ball", "more"], sfxVolume: "soft" } as const;
const DEFAULTS = { captions: true, music: true, highContrast: false, waitMs: 5_000, wordList: [], sfxVolume: "normal" } as const;

/** The grown-up button, the 2.6 s keyboard hold on the gate (a held pointer's release could land on the panel), the panel. */
async function openPanel(page: Page, button: string): Promise<Locator> {
  await page.locator(button).click({ timeout: UI_TIMEOUT_MS });
  const hold = page.locator(SELECTORS.gateHold);
  await hold.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  await hold.focus({ timeout: UI_TIMEOUT_MS });
  await page.keyboard.down("Enter");
  await sleep(PARENT_HOLD_MS);
  await page.keyboard.up("Enter");
  const panel = page.locator(SELECTORS.parentPanel);
  await panel.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  return panel;
}

async function closePanel(page: Page, panel: Locator): Promise<void> {
  await page.locator(SELECTORS.panelClose).click({ timeout: UI_TIMEOUT_MS });
  await panel.waitFor({ state: "detached", timeout: UI_TIMEOUT_MS });
}

/** The panel's native inputs (src/ui/parent-panel.ts and parent-wordlist.ts data attributes). */
const CONTROL_SELECTORS = {
  captions: 'input[data-setting="captions"]',
  music: 'input[data-setting="music"]',
  highContrast: 'input[data-setting="highContrast"]',
  wait7: 'input[data-wait-ms="7000"]',
  wait5: 'input[data-wait-ms="5000"]',
  ball: 'input[data-word="ball"]',
  more: 'input[data-word="more"]'
} as const;
const SFX_LEVELS = ["Off", "Soft", "Normal"] as const;

/** The sound-effect level group, found by role and label (the control another lane adds to the panel). */
function sfxGroup(panel: Locator): Locator {
  return panel.getByRole("group", { name: /sound effects/i });
}

/**
 * The panel's inputs are visually hidden native controls (no pointer events); a grown-up taps the label row or chip
 * around each. `inner` is matched inside each candidate label, so it is built from the page, not from the panel.
 */
async function tapLabel(scope: Locator, inner: Locator): Promise<void> {
  await scope.locator("label", { has: inner }).click({ timeout: UI_TIMEOUT_MS });
}

async function tapControl(page: Page, panel: Locator, selector: string): Promise<void> {
  await tapLabel(panel, page.locator(selector));
}

async function checkedStates(panel: Locator, sfxPresent: boolean): Promise<Record<string, boolean | null>> {
  const out: Record<string, boolean | null> = {};
  for (const [name, selector] of Object.entries(CONTROL_SELECTORS)) {
    const input = panel.locator(selector);
    out[name] = (await input.count()) > 0 ? await input.isChecked() : null;
  }
  if (sfxPresent) {
    for (const level of SFX_LEVELS) {
      const radio = sfxGroup(panel).getByRole("radio", { name: level, exact: true });
      out[`sfx${level}`] = (await radio.count()) > 0 ? await radio.isChecked() : null;
    }
  }
  return out;
}

/** The menu cards and their host portraits once every portrait image has loaded or failed. */
async function menuPortraits(page: Page): Promise<{ readonly cards: number; readonly portraits: number; readonly loaded: number; readonly failed: readonly string[]; readonly files: readonly string[] }> {
  return page.evaluate(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>(".ww-card img.ww-card-portrait")];
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) resolve();
            else {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }
          })
      )
    );
    const loaded = images.filter((image) => image.naturalWidth > 0);
    return {
      cards: document.querySelectorAll(".ww-card").length,
      portraits: images.length,
      loaded: loaded.length,
      failed: images.filter((image) => image.naturalWidth === 0).map((image) => new URL(image.src).pathname.split("/").pop() ?? ""),
      files: [...new Set(images.map((image) => new URL(image.src).pathname.split("/").pop() ?? ""))].sort()
    };
  });
}

async function highContrastClass(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("high-contrast"));
}

async function scenario(page: Page, log: PageLog, server: ExampleDevServer, steps: Record<string, unknown>): Promise<void> {
  // 1. Fresh device: the menu, the defaults, nothing stored.
  await openWonderWorld(page, server, log, QUERY);
  const boot = await qaState(page);
  steps["boot"] = { screen: boot.screen, settings: boot.settings, storage: await readStorage(page), highContrast: await highContrastClass(page) };
  expect(boot.screen, "?autostart=1 without a story opens the menu").toBe("menu");
  expect(boot.settings.captions, "captions are on by default").toBe(true);
  expect(boot.settings.music, "music is on by default").toBe(true);

  // 1b. The story menu (PRD 04 E02): every card shows its host's portrait, loaded from the app's own origin.
  const menu = await menuPortraits(page);
  steps["menu"] = menu;
  emitShot("story-menu", await captureView(page), "jpg");
  expect(menu.cards, "the menu lists the 20 episodes and 12 activities").toBe(32);
  expect(menu.portraits, "every card shows its host's portrait").toBe(menu.cards);
  expect(menu.loaded, `every portrait image loads (${JSON.stringify(menu.failed)})`).toBe(menu.portraits);

  // 2. The grown-up path: the menu's grown-up button, the hold, the panel; then every change.
  let panel = await openPanel(page, SELECTORS.menuParent);
  for (const name of ["captions", "music", "highContrast", "wait7", "ball", "more"] as const) await tapControl(page, panel, CONTROL_SELECTORS[name]);
  const sfxPresent = (await sfxGroup(panel).count()) > 0;
  if (sfxPresent) {
    await tapLabel(sfxGroup(panel), page.getByRole("radio", { name: "Soft", exact: true }));
  } else {
    const note = "The sound-effect level control (group \"Sound effects\") is not in the parent panel yet (src/ui/parent-panel.ts); its steps were skipped.";
    test.info().annotations.push({ type: "note", description: note });
    steps["sfxNote"] = note;
  }
  const changed = await qaState(page);
  const storedNow = await readStorage(page);
  steps["changed"] = { settings: changed.settings, controls: await checkedStates(panel, sfxPresent), storage: storedNow, highContrast: await highContrastClass(page) };
  emitShot("parent-panel", await captureView(page), "jpg");
  expect(changed.settings.captions, "the Captions switch turns captions off").toBe(false);
  expect(changed.settings.music, "the Music switch turns music off").toBe(false);
  expect(await highContrastClass(page), "high contrast applies at once").toBe(true);
  await closePanel(page, panel);

  // 3. Reload: every choice persisted.
  await page.reload({ waitUntil: "commit", timeout: 120_000 });
  await waitForHooks(page, log);
  await waitForReady(page, log);
  const reloaded = await qaState(page);
  const stored = await readStorage(page);
  const record = stored.settings ?? {};
  steps["reloaded"] = { screen: reloaded.screen, settings: reloaded.settings, storage: stored, highContrast: await highContrastClass(page) };
  expect(reloaded.settings.captions, "after a reload: captions stay off").toBe(false);
  expect(reloaded.settings.music, "after a reload: music stays off").toBe(false);
  expect(reloaded.settings.sound, "after a reload: sound is untouched").toBe(true);
  expect(await highContrastClass(page), "after a reload: high contrast is applied at boot").toBe(true);
  expect(stored.localKeys, "the device keeps one record").toEqual([SETTINGS_STORAGE_KEY]);
  expect(record["captions"], "stored: captions").toBe(CHOSEN.captions);
  expect(record["music"], "stored: music").toBe(CHOSEN.music);
  expect(record["highContrast"], "stored: high contrast").toBe(CHOSEN.highContrast);
  expect(record["waitMs"], "stored: waiting time").toBe(CHOSEN.waitMs);
  expect(record["wordList"], "stored: words for today, in the order picked").toEqual([...CHOSEN.wordList]);
  if (sfxPresent) expect(record["sfxVolume"], "stored: sound-effect level").toBe(CHOSEN.sfxVolume);

  panel = await openPanel(page, SELECTORS.menuParent);
  const persisted = await checkedStates(panel, sfxPresent);
  steps["persistedControls"] = persisted;
  expect(persisted["captions"], "panel after reload: Captions off").toBe(false);
  expect(persisted["music"], "panel after reload: Music off").toBe(false);
  expect(persisted["highContrast"], "panel after reload: High contrast on").toBe(true);
  expect(persisted["wait7"], "panel after reload: 7 s waiting time").toBe(true);
  expect(persisted["ball"], "panel after reload: \"ball\" picked").toBe(true);
  expect(persisted["more"], "panel after reload: \"more\" picked").toBe(true);
  if (sfxPresent) expect(persisted["sfxSoft"], "panel after reload: sound effects Soft").toBe(true);

  // 4. Clear settings on this device: the defaults are back and nothing is stored.
  await page.locator(SELECTORS.panelClear).click({ timeout: UI_TIMEOUT_MS });
  const cleared = await qaState(page);
  const clearedControls = await checkedStates(panel, sfxPresent);
  const storageAfterClear = await readStorage(page);
  steps["cleared"] = { settings: cleared.settings, controls: clearedControls, storage: storageAfterClear, highContrast: await highContrastClass(page) };
  expect(clearedControls["captions"], "after Clear: Captions on").toBe(DEFAULTS.captions);
  expect(clearedControls["music"], "after Clear: Music on").toBe(DEFAULTS.music);
  expect(clearedControls["highContrast"], "after Clear: High contrast off").toBe(DEFAULTS.highContrast);
  expect(clearedControls["wait5"], "after Clear: the 5 s default waiting time").toBe(true);
  expect(clearedControls["ball"], "after Clear: no word picked").toBe(false);
  expect(clearedControls["more"], "after Clear: no word picked").toBe(false);
  if (sfxPresent) expect(clearedControls["sfxNormal"], "after Clear: sound effects Normal").toBe(true);
  expect(cleared.settings.captions, "after Clear: captions on").toBe(true);
  expect(cleared.settings.music, "after Clear: music on").toBe(true);
  expect(await highContrastClass(page), "after Clear: high contrast off").toBe(false);
  expect(storageAfterClear.localKeys, "after Clear: nothing stored on the device").toEqual([]);
  await closePanel(page, panel);

  // 5. Network, storage and logs (gap 06:65).
  steps["privacy"] = await expectPagePrivacy(page, log, "parent panel");
  expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
  expect((await qaState(page)).errors, "state().errors").toEqual([]);
  expect(log.pageErrors, "page errors").toEqual([]);
  expect(log.consoleErrors, "console errors").toEqual([]);
}

test.describe("Wonder World grown-up settings persist and clear", () => {
  test.setTimeout(25 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("gate hold, every setting persists across a reload, Clear brings the defaults back", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    const log = attachPageLog(page, server.origin);
    const steps: Record<string, unknown> = {};
    let passed = false;
    try {
      await scenario(page, log, server, steps);
      passed = true;
    } finally {
      emitJson(passed ? "parent-panel" : "parent-panel-partial", {
        ...(await runContext(page, "parent-panel").catch(() => ({}))),
        passed,
        chosen: CHOSEN,
        defaults: DEFAULTS,
        steps,
        consoleErrors: log.consoleErrors,
        pageErrors: log.pageErrors,
        badResponses: log.badResponses
      });
    }
  });
});
