// Start screen (PRD 04 A04, PRD 01 section 6, PRD 03 section 4, PRD 06
// QA-A01). Nothing is audible before the grown-up taps "Tap to start": that
// click is the genuine user gesture the app shell uses to unlock audio, so
// onStart runs synchronously inside the click handler. The screen carries the
// parent note and the mode choice; there is no autoplay and no timer.

import type { PlayMode } from "../types.js";
import { buildModeChoice, castDots, docOf, el, icon, inertOthers, uiText, uniqueId, type UiLocale } from "./accessibility.js";

export interface StartScreenOptions {
  /** Pre-selected mode (usually the saved parent setting). Default "play-together". */
  readonly initialMode?: PlayMode;
}

/**
 * Shows the start screen. `onStart(mode)` runs inside the tap; the screen
 * removes itself right after. Returns an idempotent remover.
 */
export function showStartScreen(
  root: HTMLElement,
  locale: UiLocale,
  onStart: (mode: PlayMode) => void,
  options: StartScreenOptions = {}
): () => void {
  const doc = docOf(root);
  let mode: PlayMode = options.initialMode ?? "play-together";

  const titleId = uniqueId("ww-start-title");
  const screen = el(doc, "section", { className: "ww-screen ww-start", attrs: { "aria-labelledby": titleId, "data-ui": "start" } });
  const title = el(doc, "h1", { className: "ww-start-title", text: uiText(locale, "ui.start.title"), attrs: { id: titleId } });
  const modeChoice = buildModeChoice(doc, locale, mode, (next) => {
    mode = next;
  });
  // The route stays labelled as a prototype until real-device evidence exists.
  const prototype = el(doc, "p", { className: "ww-prototype", text: uiText(locale, "ui.prototype") });
  const hintId = uniqueId("ww-start-hint");
  const start = el(
    doc,
    "button",
    { className: "ww-start-button", attrs: { type: "button", "data-action": "start", "aria-describedby": hintId } },
    [icon(doc, "sound"), el(doc, "span", { text: uiText(locale, "ui.start.tap") })]
  );
  const hint = el(doc, "p", { className: "ww-start-hint", text: uiText(locale, "ui.start.sound"), attrs: { id: hintId } });
  const note = el(doc, "div", { className: "ww-start-note" }, [
    el(doc, "p", { text: uiText(locale, "ui.note.start") }),
    el(doc, "p", { className: "ww-note-small", text: uiText(locale, "ui.note.privacy") })
  ]);
  screen.appendChild(
    el(doc, "div", { className: "ww-start-inner" }, [
      castDots(doc),
      el(doc, "div", { className: "ww-start-head" }, [title, prototype]),
      modeChoice.element,
      el(doc, "div", { className: "ww-start-action" }, [start, hint]),
      note
    ])
  );
  root.appendChild(screen);
  const restoreInert = inertOthers(root, screen);

  let done = false;
  let removed = false;
  const remove = (): void => {
    if (removed) return;
    removed = true;
    screen.remove();
    restoreInert();
  };
  const dispose = (): void => {
    done = true;
    remove();
  };

  start.addEventListener("click", () => {
    if (done) return;
    done = true;
    try {
      onStart(mode);
    } catch (error) {
      // Leave the screen up so the grown-up can tap again.
      done = false;
      throw error;
    }
    remove();
  });

  start.focus({ preventScroll: true });
  return dispose;
}

/**
 * A calm loading status (`ui.loading`) between start and the first frame: no
 * spinner and no flashing; the character dots breathe slowly and stay still
 * in calm-motion mode. It never blocks taps. Returns an idempotent remover.
 */
export function showLoading(root: HTMLElement, locale: UiLocale): () => void {
  const doc = docOf(root);
  const view = el(doc, "div", { className: "ww-loading", attrs: { role: "status", "aria-live": "polite", "data-ui": "loading" } }, [
    castDots(doc),
    el(doc, "p", { className: "ww-loading-text", text: uiText(locale, "ui.loading") })
  ]);
  root.appendChild(view);
  return () => {
    view.remove();
  };
}
