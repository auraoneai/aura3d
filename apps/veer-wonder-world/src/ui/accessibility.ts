// Shared helpers for the Wonder World overlay (PRD 04 E08; PRD 01 sections 6
// and 9): the UI string table and lookup, a small element builder, focus
// management, modal presentation with an inert background, keyboard
// navigation, a polite live region, display preferences (reduced motion, high
// contrast) and decorative icons.
//
// Nothing here touches `document` or `window` at import time, so every UI
// module can be imported by node unit tests that have no DOM.

import type { CharacterId, ParentSettings, PlayMode } from "../types.js";

/** The string lookup every UI module receives from the app shell. */
export interface UiLocale {
  str(key: string, fallback?: string): string;
}

/**
 * Every `ui.*` key the overlay uses, with its English fallback; a fallback
 * shows only when the locale pack lacks the key. The first block is the
 * shared UI key list; the second block holds further keys the English pack
 * defines (src/localization/en/ui.ts; most are also in src/content/schema.ts
 * REQUIRED_UI_KEYS) and that carry PRD requirements: the gate is not a lock,
 * sound starts after the tap, the prototype label, the word list tracks
 * nothing, the caption speaker names and the sound-effect level.
 * tests/unit/ui/strings.test.ts checks this table against the UI sources and
 * the pack. None of these strings asks a child to speak, and none names a child.
 */
export const UI_STRINGS = {
  "ui.start.title": "Wonder World",
  "ui.start.welcome": "Welcome to",
  "ui.start.welcomeNamed": "{name}’s Wonder World",
  "ui.start.tap": "Tap to start",
  "ui.mode.label": "How do you want to play?",
  "ui.mode.play": "Play together",
  "ui.mode.watch": "Watch and sing",
  "ui.menu.title": "Choose a story or a game",
  "ui.menu.episodes": "Stories",
  "ui.menu.activities": "Games",
  "ui.parent.title": "Grown-up settings",
  "ui.parent.music": "Music",
  "ui.parent.sound": "Sound and voices",
  "ui.parent.captions": "Captions",
  "ui.parent.reducedMotion": "Calm motion",
  "ui.parent.highContrast": "High contrast and larger text",
  "ui.parent.wait": "Waiting time for a turn",
  "ui.parent.words": "Words for today",
  "ui.parent.locale": "Language",
  "ui.parent.exit": "Exit to menu",
  "ui.parent.close": "Close settings",
  "ui.parent.clear": "Clear settings on this device",
  "ui.pause": "Pause",
  "ui.resume": "Resume",
  "ui.replay": "Replay word",
  "ui.allDone": "All done",
  "ui.parentButton": "Grown-up settings",
  "ui.offline.title": "All done! Now try...",
  "ui.offline.done": "Back to stories",
  "ui.gate.hold": "Press and hold the button for 2 seconds to open settings.",
  "ui.gate.cancel": "Not now",
  "ui.note.start": "Play alongside your child when you can. All activities work by touch; speaking isn't required.",
  "ui.note.safety":
    "This is play and language exposure, not therapy. Wonder World does not test, score or diagnose, and it makes no promise about speech. If you have questions about your child's speech, language or hearing, talk with your pediatrician or a speech-language pathologist.",
  "ui.note.privacy": "No account, no microphone, nothing leaves this device. No ads and no tracking. Settings stay here, and you can clear them at any time.",
  "ui.note.links": "Reading for grown-ups:",
  "ui.guide.1": "Label what your child notices.",
  "ui.guide.2": "Wait for a turn.",
  "ui.guide.3": "Expand a sound or gesture.",
  "ui.guide.4": "Try with a real toy.",
  "ui.captions.label": "Captions",
  "ui.loading": "Getting ready...",
  "ui.audio.unavailable": "Sound is not available right now. The story carries on with pictures, and captions show the words.",

  "ui.start.sound": "Sound starts after you tap.",
  "ui.prototype": "Prototype",
  "ui.controls.label": "Grown-up controls",
  "ui.confirm": "Your child had a turn",
  "ui.stage.unavailable": "The 3D pictures could not start on this device. Reload the page or try another browser.",
  "ui.gate.title": "For grown-ups",
  "ui.gate.button": "Hold to open",
  "ui.gate.holding": "Keep holding...",
  "ui.gate.again": "Keep holding a little longer.",
  "ui.gate.note": "This step keeps settings out of the way during play. It is not a lock.",
  "ui.parent.back": "Back to the story",
  "ui.parent.display": "Sound and display",
  "ui.parent.sfx": "Sound effects",
  "ui.parent.sfxHelp": "Animal sounds, pops and bells. Voices and songs keep their level.",
  "ui.parent.sfx.off": "Off",
  "ui.parent.sfx.soft": "Soft",
  "ui.parent.sfx.normal": "Normal",
  "ui.parent.waitHelp": "How long a character pauses for your child. The story always carries on by itself.",
  "ui.parent.wordsHelp": "Pick up to 5 words to use often while you play. This list stays on this device and does not track progress.",
  "ui.parent.wordsEmpty": "No words are available yet.",
  "ui.parent.wordsCount": "{n} of {max} chosen",
  "ui.guide.title": "Ways to play together",
  "ui.note.title": "About Wonder World",
  "ui.note.aap": "AAP: Media and Young Minds",
  "ui.note.asha": "ASHA: Speech and language development",
  "ui.speaker.momo": "Momo",
  "ui.speaker.lulu": "Lulu",
  "ui.speaker.sheru": "Sheru",
  "ui.speaker.gogo": "GoGo",
  "ui.speaker.lumi": "Lumi",
  "ui.speaker.peeko": "Peeko",
  "ui.speaker.robot": "Little Robot"
} as const satisfies Readonly<Record<string, string>>;

export type UiStringKey = keyof typeof UI_STRINGS;

/** Looks up a UI string, always passing the English fallback. Empty or echoed-key answers fall back too. */
export function uiText(locale: UiLocale, key: UiStringKey): string {
  const fallback: string = UI_STRINGS[key];
  return lookup(locale, key, fallback);
}

/** Looks up a story string (for example `e17.title`) with a caller-provided fallback. */
export function storyText(locale: UiLocale, key: string, fallback: string): string {
  return lookup(locale, key, fallback);
}

function lookup(locale: UiLocale, key: string, fallback: string): string {
  let value: unknown;
  try {
    value = locale.str(key, fallback);
  } catch {
    return fallback;
  }
  return typeof value === "string" && value.trim() !== "" && value !== key ? value : fallback;
}

/** Fills `{name}` placeholders, for example "{n} of {max} chosen". Unknown placeholders stay as written. */
export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-z]+)\}/gi, (whole: string, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole
  );
}

/** "sheru-big-adventure" -> "Sheru big adventure": a readable fallback for a missing title. */
export function humanizeId(id: string): string {
  const words = id.replace(/[-_.]+/g, " ").trim();
  return words.length === 0 ? id : words.charAt(0).toUpperCase() + words.slice(1);
}

// Characters ------------------------------------------------------------------

/** Soft character colours (PRD 02 section 4 palette), light enough for dark text on top. */
export const CHARACTER_COLOURS: Readonly<Record<CharacterId, string>> = {
  momo: "#cdbcf2",
  lulu: "#a9e5d1",
  sheru: "#e8c9a2",
  gogo: "#f3aba4",
  lumi: "#f7dc82",
  peeko: "#f9cd92"
};

/** Neutral dot for speakers without a character colour (the baby robot). */
export const NEUTRAL_COLOUR = "#d5d9e2";

/** The six characters, in the order the UI shows them (the cast dots, the welcome parade). */
export const CHARACTER_IDS: readonly CharacterId[] = ["momo", "lulu", "sheru", "gogo", "lumi", "peeko"];

export function isCharacterId(value: string): value is CharacterId {
  return CHARACTER_IDS.some((id) => id === value);
}

/** A locale with no pack: every lookup gives the English fallback. */
export const ENGLISH_ONLY: UiLocale = {
  str(_key: string, fallback?: string): string {
    return fallback ?? "";
  }
};

const SPEAKER_KEYS: Readonly<Record<string, UiStringKey>> = {
  momo: "ui.speaker.momo",
  lulu: "ui.speaker.lulu",
  sheru: "ui.speaker.sheru",
  gogo: "ui.speaker.gogo",
  lumi: "ui.speaker.lumi",
  peeko: "ui.speaker.peeko",
  robot: "ui.speaker.robot"
};

/** The display name for a speaker id (the six characters and the baby robot); the narrator has none. */
export function speakerName(speaker: string, locale: UiLocale = ENGLISH_ONLY): string {
  if (!Object.prototype.hasOwnProperty.call(SPEAKER_KEYS, speaker)) return "";
  return uiText(locale, SPEAKER_KEYS[speaker]);
}

// Elements --------------------------------------------------------------------

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  options: ElementOptions = {},
  children: readonly Node[] = []
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) node.setAttribute(name, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

export function docOf(root: HTMLElement): Document {
  return root.ownerDocument;
}

let idCounter = 0;

/** A document-unique id for label/description wiring. */
export function uniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** A labelled icon-only button (the icon is decorative; the label is the accessible name). */
export function iconButton(doc: Document, name: IconName, label: string, attrs: Readonly<Record<string, string>> = {}): HTMLButtonElement {
  const button = el(doc, "button", { className: "ww-icon-button", attrs: { type: "button", "aria-label": label, title: label, ...attrs } });
  button.appendChild(icon(doc, name));
  return button;
}

/**
 * Wraps a click handler so a second activation within `windowMs` is ignored
 * (an accidental double tap must not pause and resume, or end twice). Uses
 * the event's own timestamp; no clock is read.
 */
export function ignoreRepeats(handler: () => void, windowMs = 350): (event: Event) => void {
  let last = Number.NEGATIVE_INFINITY;
  return (event: Event): void => {
    if (event.timeStamp - last < windowMs) return;
    last = event.timeStamp;
    handler();
  };
}

/** A decorative row of the six character colours (aria-hidden). */
export function castDots(doc: Document): HTMLElement {
  const row = el(doc, "div", { className: "ww-cast", attrs: { "aria-hidden": "true" } });
  CHARACTER_IDS.forEach((id, index) => {
    const dot = el(doc, "span", { className: "ww-cast-dot" });
    dot.style.setProperty("--ww-dot", CHARACTER_COLOURS[id]);
    dot.style.setProperty("--ww-i", String(index));
    row.appendChild(dot);
  });
  return row;
}

/** The two play modes, in the order the UI lists them. */
export const MODE_CHOICES: readonly { readonly mode: PlayMode; readonly key: UiStringKey }[] = [
  { mode: "play-together", key: "ui.mode.play" },
  { mode: "watch-sing", key: "ui.mode.watch" }
];

export interface ModeChoice {
  readonly element: HTMLFieldSetElement;
  set(mode: PlayMode): void;
}

/**
 * The "Play together / Watch and sing" choice as a native radio group (arrow
 * keys work as usual), drawn as two large segments.
 */
export function buildModeChoice(doc: Document, locale: UiLocale, selected: PlayMode, onSelect: (mode: PlayMode) => void): ModeChoice {
  const name = uniqueId("ww-mode");
  const fieldset = el(doc, "fieldset", { className: "ww-field ww-segmented", attrs: { "data-setting": "mode" } });
  const options = el(doc, "div", { className: "ww-segmented-options" });
  fieldset.append(el(doc, "legend", { className: "ww-legend", text: uiText(locale, "ui.mode.label") }), options);
  const inputs = new Map<PlayMode, HTMLInputElement>();
  for (const choice of MODE_CHOICES) {
    const input = el(doc, "input", {
      className: "ww-choice-input",
      attrs: { type: "radio", name, value: choice.mode, "data-mode": choice.mode }
    });
    input.checked = choice.mode === selected;
    input.addEventListener("change", () => {
      if (input.checked) onSelect(choice.mode);
    });
    inputs.set(choice.mode, input);
    options.appendChild(
      el(doc, "label", { className: "ww-segment" }, [input, el(doc, "span", { className: "ww-segment-face", text: uiText(locale, choice.key) })])
    );
  }
  return {
    element: fieldset,
    set(mode: PlayMode): void {
      for (const [value, input] of inputs) input.checked = value === mode;
    }
  };
}

// Focus -----------------------------------------------------------------------

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.closest("[hidden], [inert]") === null && node.getAttribute("aria-hidden") !== "true"
  );
}

export function focusFirst(container: HTMLElement, preferred?: HTMLElement | null): void {
  const target = preferred ?? focusableIn(container)[0] ?? container;
  target.focus({ preventScroll: true });
}

function activeHtmlElement(doc: Document): HTMLElement | null {
  const active = doc.activeElement;
  const view = doc.defaultView;
  if (!view || active === null || active === doc.body) return null;
  return active instanceof view.HTMLElement ? active : null;
}

/**
 * Keeps keyboard focus inside a modal surface: Tab and Shift+Tab wrap, and
 * focus that lands outside (for example on the canvas) is pulled back. The
 * returned release function restores focus to `restoreTo` (by default the
 * element that had focus when the trap started).
 */
export function trapFocus(container: HTMLElement, restoreTo?: HTMLElement | null): () => void {
  const doc = container.ownerDocument;
  const previous = restoreTo === undefined ? activeHtmlElement(doc) : restoreTo;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const items = focusableIn(container);
    if (items.length === 0) {
      event.preventDefault();
      container.focus({ preventScroll: true });
      return;
    }
    const index = items.findIndex((item) => item === doc.activeElement);
    if (event.shiftKey) {
      if (index <= 0) {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    } else if (index === -1 || index === items.length - 1) {
      event.preventDefault();
      items[0].focus();
    }
  };
  const onFocusIn = (event: FocusEvent): void => {
    const view = doc.defaultView;
    const target = event.target;
    if (view && target instanceof view.Node && !container.contains(target)) container.focus({ preventScroll: true });
  };
  container.addEventListener("keydown", onKeyDown);
  doc.addEventListener("focusin", onFocusIn);
  return () => {
    container.removeEventListener("keydown", onKeyDown);
    doc.removeEventListener("focusin", onFocusIn);
    if (previous && previous.isConnected && previous.closest("[inert]") === null) previous.focus({ preventScroll: true });
  };
}

/** How many open screens or dialogs currently hold each element inert. */
const inertHolds = new WeakMap<Element, number>();

/**
 * Marks every other child of `root` inert (no focus, no pointer, hidden from
 * assistive tech) while a full-screen screen or dialog is up. Holds are
 * counted per element, so screens that overlap in time (a menu opened from
 * the start screen's tap, a gate over the menu) never release each other's
 * inert. Elements made inert by someone else are left alone. Returns an
 * idempotent release.
 */
export function inertOthers(root: HTMLElement, keep: Element): () => void {
  const held: Element[] = [];
  for (const child of Array.from(root.children)) {
    if (child === keep) continue;
    const count = inertHolds.get(child) ?? 0;
    if (count === 0 && child.hasAttribute("inert")) continue;
    inertHolds.set(child, count + 1);
    child.setAttribute("inert", "");
    held.push(child);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const child of held) {
      const count = (inertHolds.get(child) ?? 1) - 1;
      if (count > 0) {
        inertHolds.set(child, count);
      } else {
        inertHolds.delete(child);
        child.removeAttribute("inert");
      }
    }
  };
}

/** Calls `handler` on Escape pressed inside `container`. Returns a remover. */
export function onEscape(container: HTMLElement, handler: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      handler();
    }
  };
  container.addEventListener("keydown", onKeyDown);
  return () => container.removeEventListener("keydown", onKeyDown);
}

/**
 * Shows `overlay` (which contains `dialog`) on top of `root`: the rest of the
 * overlay root goes inert, focus is trapped in the dialog, and Escape calls
 * `onEscapeKey` when given. Returns an idempotent release that removes the
 * overlay and restores the background and the previous focus.
 */
export function presentModal(root: HTMLElement, overlay: HTMLElement, dialog: HTMLElement, onEscapeKey: (() => void) | null): () => void {
  const previous = activeHtmlElement(docOf(root));
  if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
  root.appendChild(overlay);
  const restoreInert = inertOthers(root, overlay);
  const releaseFocus = trapFocus(dialog, previous);
  const removeEscape = onEscapeKey ? onEscape(overlay, onEscapeKey) : null;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    removeEscape?.();
    overlay.remove();
    restoreInert();
    releaseFocus();
  };
}

// Keyboard navigation ---------------------------------------------------------

/**
 * Arrow-key movement between the items matched by `selector` inside a grid of
 * cards: Left/Right step through the list, Up/Down move to the nearest item
 * in the row above or below, Home/End jump to the ends. Returns a remover.
 */
export function enableGridNavigation(container: HTMLElement, selector: string): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
      (node) => !node.hasAttribute("disabled") && node.closest("[hidden], [inert]") === null
    );
    const index = items.findIndex((item) => item === event.target);
    if (index < 0) return;
    let next: HTMLElement | undefined;
    if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items[items.length - 1];
    else if (event.key === "ArrowRight") next = items[index + 1];
    else if (event.key === "ArrowLeft") next = items[index - 1];
    else next = nearestInNextRow(items, items[index], event.key === "ArrowDown" ? 1 : -1);
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  container.addEventListener("keydown", onKeyDown);
  return () => container.removeEventListener("keydown", onKeyDown);
}

function nearestInNextRow(items: readonly HTMLElement[], current: HTMLElement, direction: 1 | -1): HTMLElement | undefined {
  const from = current.getBoundingClientRect();
  const centre = from.left + from.width / 2;
  let bestRowTop: number | null = null;
  let best: HTMLElement | undefined;
  let bestDx = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (item === current) continue;
    const rect = item.getBoundingClientRect();
    const below = rect.top > from.top + from.height / 2;
    const above = rect.bottom < from.top + from.height / 2;
    if ((direction === 1 && !below) || (direction === -1 && !above)) continue;
    const closerRow =
      bestRowTop === null || (direction === 1 ? rect.top < bestRowTop - 1 : rect.top > bestRowTop + 1);
    const sameRow = bestRowTop !== null && Math.abs(rect.top - bestRowTop) <= 1;
    const dx = Math.abs(rect.left + rect.width / 2 - centre);
    if (closerRow || (sameRow && dx < bestDx)) {
      bestRowTop = rect.top;
      best = item;
      bestDx = dx;
    }
  }
  return best;
}

// Live region -------------------------------------------------------------------

/** A visually hidden polite live region for short status messages. */
export function createAnnouncer(root: HTMLElement): { say(text: string): void; dispose(): void } {
  const doc = docOf(root);
  const region = el(doc, "div", { className: "ww-visually-hidden", attrs: { role: "status", "aria-live": "polite" } });
  root.appendChild(region);
  return {
    say(text: string): void {
      region.textContent = "";
      // A fresh text node makes screen readers repeat an identical message.
      region.appendChild(doc.createTextNode(text));
    },
    dispose(): void {
      region.remove();
    }
  };
}

// Display preferences -----------------------------------------------------------

type MediaWindow = Pick<Window, "matchMedia">;

function mediaMatches(win: MediaWindow | null | undefined, query: string): boolean {
  if (!win || typeof win.matchMedia !== "function") return false;
  try {
    return win.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** The OS-level `(prefers-reduced-motion: reduce)` preference; seeds the calm-motion default. */
export function prefersReducedMotion(win: MediaWindow | null | undefined): boolean {
  return mediaMatches(win, "(prefers-reduced-motion: reduce)");
}

/**
 * The OS-level `(prefers-contrast: more)` preference; seeds the high-contrast
 * default. Forced-colour modes need no seed: styles.css handles them with its
 * `(forced-colors: active)` block.
 */
export function prefersMoreContrast(win: MediaWindow | null | undefined): boolean {
  return mediaMatches(win, "(prefers-contrast: more)");
}

/** Calls `onChange` when a media query flips. Returns a remover. */
export function watchMedia(win: MediaWindow | null | undefined, query: string, onChange: (matches: boolean) => void): () => void {
  if (!win || typeof win.matchMedia !== "function") return () => {};
  let list: MediaQueryList;
  try {
    list = win.matchMedia(query);
  } catch {
    return () => {};
  }
  const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
  list.addEventListener("change", listener);
  return () => list.removeEventListener("change", listener);
}

/** Classes on <html> that styles.css keys off. */
export const HIGH_CONTRAST_CLASS = "high-contrast";
export const REDUCED_MOTION_CLASS = "reduced-motion";

/** Mirrors the display-related parent settings onto the document root. */
export function applyDisplaySettings(doc: Document, settings: Pick<ParentSettings, "highContrast" | "reducedMotion" | "locale">): void {
  const html = doc.documentElement;
  html.classList.toggle(HIGH_CONTRAST_CLASS, settings.highContrast);
  html.classList.toggle(REDUCED_MOTION_CLASS, settings.reducedMotion);
  html.lang = settings.locale;
}

// Icons ---------------------------------------------------------------------------

interface IconPart {
  readonly d: string;
  readonly fill?: boolean;
}

/** Simple stroke icons drawn for this app (24 x 24 grid). */
export const ICONS = {
  pause: [{ d: "M9 6.5v11M15 6.5v11" }],
  play: [{ d: "M8.5 6.2 18 12l-9.5 5.8z", fill: true }],
  replay: [{ d: "M12 5a7 7 0 1 1-6.06 3.5" }, { d: "M15 2 12 5l3 3" }],
  settings: [{ d: "M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9" }, { d: "M15 5.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4zM9 14.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4z" }],
  done: [{ d: "M5 12.5 9.5 17 19 7.5" }],
  turn: [
    { d: "M8.5 12.5V6.8a1.3 1.3 0 0 1 2.6 0v4.7M11.1 11V5.3a1.3 1.3 0 0 1 2.6 0V11M13.7 11.3V6.6a1.3 1.3 0 0 1 2.6 0v5.2" },
    { d: "M16.3 12V9.6a1.3 1.3 0 0 1 2.6 0v4.2a6.2 6.2 0 0 1-6.2 6.2h-.6a5.6 5.6 0 0 1-4.5-2.3l-2.6-3.6a1.3 1.3 0 0 1 2-1.6l1.5 1.7" }
  ],
  close: [{ d: "M6.5 6.5l11 11M17.5 6.5l-11 11" }],
  sound: [{ d: "M4 9.5h3.5L12 6v12l-4.5-3.5H4z", fill: true }, { d: "M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" }],
  hold: [{ d: "M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", fill: true }, { d: "M12 4.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z" }],
  tip: [{ d: "M12 3.5a5.5 5.5 0 0 0-3 10.1V16h6v-2.4a5.5 5.5 0 0 0-3-10.1zM9.5 19h5" }]
} as const satisfies Readonly<Record<string, readonly IconPart[]>>;

export type IconName = keyof typeof ICONS;

/** A decorative inline SVG icon; the surrounding control carries the accessible name. */
export function icon(doc: Document, name: IconName): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "ww-icon");
  const parts: readonly IconPart[] = ICONS[name];
  for (const part of parts) {
    const path = doc.createElementNS(ns, "path");
    path.setAttribute("d", part.d);
    path.setAttribute("class", part.fill ? "ww-icon-fill" : "ww-icon-stroke");
    svg.appendChild(path);
  }
  return svg;
}
