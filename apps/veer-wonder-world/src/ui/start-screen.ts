// Start screen (PRD 04 A04, PRD 01 section 6, PRD 03 section 4, PRD 06
// QA-A01). Nothing is audible before the grown-up taps "Tap to start": that
// click is the genuine user gesture the app shell uses to unlock audio, so
// onStart runs synchronously inside the click handler. The screen carries the
// parent note and the mode choice; there is no autoplay and no timer.
//
// The welcome (07 O8): a decorative sky (sun glow, a rainbow in the six
// character colours, slow clouds), the six characters' portraits in a row, and
// "Welcome to" over "<name>'s Wonder World" (src/personal.ts; "Wonder World"
// when no name is set). The decorations are hidden from screen readers. Motion
// is slow and stops in reduced motion; high contrast drops the decorations.

import { WELCOME_NAME } from "../personal.js";
import type { CharacterId, PlayMode } from "../types.js";
import {
  CHARACTER_COLOURS,
  CHARACTER_IDS,
  buildModeChoice,
  castDots,
  docOf,
  el,
  fillTemplate,
  icon,
  inertOthers,
  uiText,
  uniqueId,
  type UiLocale
} from "./accessibility.js";
import { PORTRAITS } from "./portraits.js";

/** The welcome title's big line: "<name>'s Wonder World", or "Wonder World" when no name is set. */
export function welcomeNameLine(locale: UiLocale, name: string | null = WELCOME_NAME): string {
  return name ? fillTemplate(uiText(locale, "ui.start.welcomeNamed"), { name }) : uiText(locale, "ui.start.title");
}

/**
 * The big line, with the product name held on one line: "<name>'s" over "Wonder World", never "<name>'s Wonder" over
 * "World" (a balanced two-line break could pick either).
 */
function nameLineElement(doc: Document, locale: UiLocale): HTMLElement {
  const line = welcomeNameLine(locale);
  const product = uiText(locale, "ui.start.title");
  const span = el(doc, "span", { className: "ww-start-name" });
  const at = line.lastIndexOf(product);
  if (at < 0) span.textContent = line;
  else span.append(line.slice(0, at), el(doc, "span", { className: "ww-start-product", text: product }), line.slice(at + product.length));
  return span;
}

/** How far below the middle of its picture a character sits: GoGo the train shows its face low in the frame. */
const PORTRAIT_SHIFT: Partial<Record<CharacterId, string>> = { gogo: "13%" };

/** The decorative sky behind the welcome: a sun glow, a rainbow arc and three slow clouds. */
function welcomeSky(doc: Document): HTMLElement {
  return el(doc, "div", { className: "ww-start-sky", attrs: { "aria-hidden": "true" } }, [
    el(doc, "span", { className: "ww-start-sun" }),
    el(doc, "span", { className: "ww-start-rainbow" }),
    el(doc, "span", { className: "ww-start-cloud ww-start-cloud-1" }),
    el(doc, "span", { className: "ww-start-cloud ww-start-cloud-2" }),
    el(doc, "span", { className: "ww-start-cloud ww-start-cloud-3" })
  ]);
}

/** The six characters' portraits in a row, each on a ring of its own colour; a dot where a portrait is missing. */
function welcomeParade(doc: Document): HTMLElement {
  const row = el(doc, "div", { className: "ww-start-parade", attrs: { "aria-hidden": "true" } });
  CHARACTER_IDS.forEach((id, index) => {
    const face = el(doc, "span", { className: "ww-start-face" });
    face.style.setProperty("--ww-dot", CHARACTER_COLOURS[id]);
    face.style.setProperty("--ww-i", String(index));
    const shift = PORTRAIT_SHIFT[id];
    if (shift) face.style.setProperty("--ww-face-shift", shift);
    const url = PORTRAITS[id];
    if (url) face.appendChild(el(doc, "img", { className: "ww-start-face-img", attrs: { src: url, alt: "", draggable: "false", decoding: "async" } }));
    row.appendChild(face);
  });
  return row;
}

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
  const nameLine = nameLineElement(doc, locale);
  const title = el(doc, "h1", { className: "ww-start-title", attrs: { id: titleId } }, [
    el(doc, "span", { className: "ww-start-welcome", text: uiText(locale, "ui.start.welcome") }),
    nameLine
  ]);
  // A space between the two lines, so the heading's text reads "Welcome to <line>" (the flex layout ignores it).
  title.insertBefore(doc.createTextNode(" "), nameLine);
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
  // Two groups: the welcome (portraits and title) and the controls. They stack, and stand side by side on short
  // landscape screens (styles.css), so the start screen fits without scrolling there too.
  screen.appendChild(welcomeSky(doc));
  screen.appendChild(
    el(doc, "div", { className: "ww-start-inner" }, [
      el(doc, "div", { className: "ww-start-hero" }, [welcomeParade(doc), el(doc, "div", { className: "ww-start-head" }, [title, prototype])]),
      el(doc, "div", { className: "ww-start-panel" }, [modeChoice.element, el(doc, "div", { className: "ww-start-action" }, [start, hint]), note])
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
