// Start screen (PRD 04 A04, PRD 01 section 6, PRD 03 section 4, PRD 06
// QA-A01; WP-7). Nothing is audible before the grown-up taps "Tap to start":
// that click is the genuine user gesture the app shell uses to unlock audio,
// so onStart runs synchronously inside the click handler. The screen carries
// the parent note and the mode choice; there is no autoplay and no timer.
//
// The welcome (07 O8; WP-7): a warm translucent sunlit veil over the live 3D
// Momo Meadow stage, the six characters' portraits in a gentle arc, and
// "Welcome to" over "<name>'s Wonder World" (src/personal.ts; "Wonder World"
// when no name is set). Decorations are hidden from screen readers; motion is
// slow and stops in reduced motion; high contrast uses solid opaque surfaces.

import { WELCOME_NAME } from "../personal.js";
import { HOST_HOME_WORLD, WORLD_THEMES, createWorldSceneSvg } from "./world-art.js";
import type { CharacterId, PlayMode, WorldId } from "../types.js";
import {
  CHARACTER_COLOURS,
  CHARACTER_IDS,
  ENGLISH_ONLY,
  buildModeChoice,
  castDots,
  docOf,
  el,
  fillTemplate,
  icon,
  iconButton,
  inertOthers,
  speakerName,
  uiText,
  uniqueId,
  type UiLocale
} from "./accessibility.js";
import type { PortraitMap } from "./episode-menu.js";
import { canFullscreen, isFullscreen, toggleAppFullscreen, watchFullscreen } from "./fullscreen.js";
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
  if (at < 0) {
    span.textContent = line;
  } else {
    if (at > 0) span.appendChild(doc.createTextNode(line.slice(0, at)));
    span.appendChild(el(doc, "span", { className: "ww-start-product", text: product }));
    const tail = line.slice(at + product.length);
    if (tail.length > 0) span.appendChild(doc.createTextNode(tail));
  }
  return span;
}

/** How far below the middle of its picture a character sits: GoGo the train shows its face low in the frame. */
const PORTRAIT_SHIFT: Partial<Record<CharacterId, string>> = { gogo: "13%" };

const MODE_HINTS: Readonly<Record<PlayMode, string>> = {
  "play-together": "Pauses for a turn",
  "watch-sing": "Plays right through",
  auto: "Continuous stories",
  "wind-down": "Bedtime & lullabies"
};

function isPlayMode(value: string | null): value is PlayMode {
  return value === "play-together" || value === "watch-sing" || value === "auto" || value === "wind-down";
}

/** Adds concise caregiver descriptions under the two start-screen mode segments without changing radio labels. */
function decorateStartModes(doc: Document, fieldset: HTMLElement): void {
  for (const segment of Array.from(fieldset.querySelectorAll(".ww-segment"))) {
    const input = segment.querySelectorAll(".ww-choice-input")[0];
    const face = segment.querySelectorAll(".ww-segment-face")[0];
    const modeAttr = input?.getAttribute("data-mode") ?? null;
    if (!input || !face || !isPlayMode(modeAttr)) continue;
    const subId = uniqueId("ww-mode-sub");
    input.setAttribute("aria-describedby", subId);
    face.appendChild(
      el(doc, "span", {
        className: "ww-mode-sub",
        text: MODE_HINTS[modeAttr],
        attrs: { id: subId, "aria-hidden": "true" }
      })
    );
  }
}

/** Warm sunlit corner glow behind the translucent welcome card while the live 3D Meadow stage renders underneath. */
function welcomeSky(doc: Document): HTMLElement {
  return el(doc, "div", { className: "ww-start-sky", attrs: { "aria-hidden": "true" } }, [
    el(doc, "span", { className: "ww-start-sun" })
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
  /** Optional preview callback when the grown-up switches mode on the start screen. */
  readonly onModeChange?: (mode: PlayMode) => void;
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
  const title = el(doc, "h1", { className: "ww-start-title", attrs: { id: titleId } });
  // A space between the two lines, so the heading's text reads "Welcome to <line>" (the flex layout ignores it).
  title.appendChild(el(doc, "span", { className: "ww-start-welcome", text: uiText(locale, "ui.start.welcome") }));
  title.appendChild(doc.createTextNode(" "));
  title.appendChild(nameLine);

  const modeChoice = buildModeChoice(doc, locale, mode, (next) => {
    mode = next;
    options.onModeChange?.(next);
  });
  decorateStartModes(doc, modeChoice.element);

  const enterFsLabel = uiText(locale, "ui.fullscreen.enter");
  const exitFsLabel = uiText(locale, "ui.fullscreen.exit");
  const fullscreenBtn = canFullscreen(doc)
    ? iconButton(doc, "fullscreen", enterFsLabel, {
        "data-control": "fullscreen",
        "aria-pressed": "false"
      })
    : null;
  if (fullscreenBtn) {
    fullscreenBtn.classList.add("ww-start-fullscreen");
  }
  const syncStartFullscreen = (): void => {
    if (!fullscreenBtn) return;
    const active = isFullscreen(doc);
    const label = active ? exitFsLabel : enterFsLabel;
    fullscreenBtn.textContent = "";
    fullscreenBtn.appendChild(icon(doc, active ? "exitFullscreen" : "fullscreen"));
    fullscreenBtn.setAttribute("aria-label", label);
    fullscreenBtn.setAttribute("aria-pressed", String(active));
    fullscreenBtn.classList.toggle("is-active", active);
    fullscreenBtn.title = label;
    fullscreenBtn.dataset["fullscreen"] = String(active);
  };
  syncStartFullscreen();
  const unwatchFullscreen = fullscreenBtn ? watchFullscreen(doc, () => syncStartFullscreen()) : () => {};
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      void toggleAppFullscreen(doc).then(() => syncStartFullscreen());
    });
  }

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
  if (fullscreenBtn) screen.appendChild(fullscreenBtn);
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
    unwatchFullscreen();
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

export interface LoadingScreenOptions {
  /** Optional story title shown on the warm storybook card while the world prepares. */
  readonly title?: string;
  /** Optional host character shown in a portrait ring above the calm breathing dots. */
  readonly host?: CharacterId;
  /** Optional world diorama header shown on the loading card. */
  readonly world?: WorldId;
  /** Optional portrait map override (defaults to PORTRAITS). */
  readonly portraits?: PortraitMap;
}

/**
 * A calm loading status (`ui.loading`) between start and the first frame: no
 * spinner and no flashing; the character dots breathe slowly and stay still
 * in calm-motion mode. It never blocks taps. Returns an idempotent remover.
 */
export function showLoading(root: HTMLElement, locale: UiLocale = ENGLISH_ONLY, options: LoadingScreenOptions = {}): () => void {
  const doc = docOf(root);
  const card = el(doc, "div", { className: "ww-loading-card" });

  const resolvedWorld = options.world ?? (options.host ? HOST_HOME_WORLD[options.host] : undefined);
  if (resolvedWorld) {
    const banner = el(doc, "div", { className: "ww-loading-banner", attrs: { "aria-hidden": "true" } }, [
      createWorldSceneSvg(doc, resolvedWorld),
      el(doc, "span", { className: "ww-card-world-tag", text: WORLD_THEMES[resolvedWorld].shortLabel })
    ]);
    card.appendChild(banner);
  }

  const body = el(doc, "div", { className: "ww-loading-body" });
  if (options.host) {
    const portraits = options.portraits ?? PORTRAITS;
    const portraitUrl = portraits[options.host];
    const avatar = el(doc, "span", { className: "ww-loading-host", attrs: { "aria-hidden": "true" } });
    avatar.style.setProperty("--ww-dot", CHARACTER_COLOURS[options.host]);
    if (portraitUrl) {
      const img = el(doc, "img", {
        className: "ww-loading-host-img",
        attrs: { src: portraitUrl, alt: "", decoding: "async", draggable: "false" }
      });
      img.addEventListener(
        "error",
        () => {
          img.remove();
        },
        { once: true }
      );
      avatar.appendChild(img);
    }
    body.appendChild(avatar);
  }

  if (options.title && options.title.trim() !== "") {
    body.appendChild(el(doc, "p", { className: "ww-loading-title", text: options.title.trim() }));
  }
  if (options.host) {
    body.appendChild(el(doc, "p", { className: "ww-loading-sub", text: speakerName(options.host, locale) }));
  }
  body.appendChild(castDots(doc));
  body.appendChild(el(doc, "p", { className: "ww-loading-text", text: uiText(locale, "ui.loading") }));
  card.appendChild(body);

  const view = el(doc, "div", { className: "ww-loading", attrs: { role: "status", "aria-live": "polite", "data-ui": "loading" } }, [card]);
  root.appendChild(view);
  return () => {
    view.remove();
  };
}
