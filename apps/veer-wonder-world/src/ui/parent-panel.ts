// Parent panel (PRD 04 E03 and E07; PRD 01 sections 6-9 and 11; PRD 06
// QA-E12, QA-P06 and QA-P08). Grown-up settings, guidance and the safety and
// privacy notes, kept apart from the play canvas behind the parent gate.
//
// Every change is reported at once through onChange; the app shell persists
// it with saveSettings and applies it (mode, music, sound, captions, calm
// motion, contrast, wait time, locale, word list). Display settings are also
// mirrored onto <html> here so the panel itself reflects them immediately.
// All controls are native, labelled form controls: Tab moves between them
// (and wraps inside the panel), arrow keys move inside a radio group, Space
// toggles a switch or a word, and Escape closes the panel.

import type { ParentSettings } from "../types.js";
import {
  applyDisplaySettings,
  buildModeChoice,
  docOf,
  el,
  iconButton,
  prefersReducedMotion,
  presentModal,
  uiText,
  uniqueId,
  type UiLocale,
  type UiStringKey
} from "./accessibility.js";
import { mountWordList, wordChoices, type WordChoice } from "./parent-wordlist.js";
import {
  AVAILABLE_LOCALES,
  WAIT_MS_MAX,
  WAIT_MS_MIN,
  WAIT_MS_STEP,
  clampWaitMs,
  clearSettings,
  defaultSettings,
  safeLocalStorage,
  type SettingsStorage
} from "./settings-store.js";

export interface ParentPanelOptions {
  /** Words offered for the shortlist. Defaults to the PRD 01 functional word set. */
  readonly words?: readonly WordChoice[];
  /** Called after the panel closes through Close, Back, Escape or a tap outside (not through Exit). */
  readonly onClose?: () => void;
  /** Storage that "Clear settings" empties. Defaults to window.localStorage. */
  readonly storage?: SettingsStorage | null;
}

/** Languages listed in the panel, by their own names. Only AVAILABLE_LOCALES can be picked. */
export const LOCALE_CHOICES: readonly { readonly code: string; readonly name: string }[] = [
  { code: "en", name: "English" },
  { code: "pa", name: "ਪੰਜਾਬੀ" }
];

/**
 * Reading for grown-ups (PRD 01 section 11): AAP screen-media guidance and
 * ASHA's public page on typical speech and language development. Plain links
 * with no tracking parameters; they open outside the app.
 */
export const GROWN_UP_LINKS: readonly { readonly href: string; readonly key: UiStringKey }[] = [
  { href: "https://publications.aap.org/pediatrics/article/138/5/e20162591/60333/Media-and-Young-Minds", key: "ui.note.aap" },
  { href: "https://www.asha.org/public/speech/development/", key: "ui.note.asha" }
];

const GUIDE_KEYS: readonly UiStringKey[] = ["ui.guide.1", "ui.guide.2", "ui.guide.3", "ui.guide.4"];

type ToggleField = "music" | "sound" | "captions" | "reducedMotion" | "highContrast";

const TOGGLES: readonly { readonly field: ToggleField; readonly key: UiStringKey }[] = [
  { field: "music", key: "ui.parent.music" },
  { field: "sound", key: "ui.parent.sound" },
  { field: "captions", key: "ui.parent.captions" },
  { field: "reducedMotion", key: "ui.parent.reducedMotion" },
  { field: "highContrast", key: "ui.parent.highContrast" }
];

function withToggle(settings: ParentSettings, field: ToggleField, value: boolean): ParentSettings {
  switch (field) {
    case "music":
      return { ...settings, music: value };
    case "sound":
      return { ...settings, sound: value };
    case "captions":
      return { ...settings, captions: value };
    case "reducedMotion":
      return { ...settings, reducedMotion: value };
    case "highContrast":
      return { ...settings, highContrast: value };
  }
}

/** "5 seconds" / "5 sec" in the parent's language, with a plain fallback. */
export function formatSeconds(localeCode: string, seconds: number, display: "long" | "short"): string {
  try {
    return new Intl.NumberFormat(localeCode, { style: "unit", unit: "second", unitDisplay: display }).format(seconds);
  } catch {
    return `${seconds} s`;
  }
}

/** The whole-second wait choices, 3-8 s. */
export function waitChoicesMs(): number[] {
  const out: number[] = [];
  for (let ms = WAIT_MS_MIN; ms <= WAIT_MS_MAX; ms += WAIT_MS_STEP) out.push(ms);
  return out;
}

/**
 * Opens the panel over the overlay root. Returns a function that closes it
 * without calling onExit or onClose (for route changes).
 */
export function openParentPanel(
  root: HTMLElement,
  locale: UiLocale,
  settings: ParentSettings,
  onChange: (settings: ParentSettings) => void,
  onExit: () => void,
  options: ParentPanelOptions = {}
): () => void {
  const doc = docOf(root);
  const win = doc.defaultView;
  let current: ParentSettings = { ...settings, waitMs: clampWaitMs(settings.waitMs), wordList: [...settings.wordList] };

  const titleId = uniqueId("ww-parent-title");
  const overlay = el(doc, "div", { className: "ww-overlay ww-parent-overlay", attrs: { "data-ui": "parent-panel" } });
  const dialog = el(doc, "div", {
    className: "ww-dialog ww-parent",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId }
  });
  overlay.appendChild(dialog);

  const emit = (next: ParentSettings): void => {
    current = next;
    applyDisplaySettings(doc, current);
    onChange(current);
  };

  // Header: title and close.
  const closeButton = iconButton(doc, "close", uiText(locale, "ui.parent.close"), { "data-action": "close" });
  const header = el(doc, "div", { className: "ww-parent-header" }, [
    el(doc, "h2", { className: "ww-dialog-title", text: uiText(locale, "ui.parent.title"), attrs: { id: titleId } }),
    closeButton
  ]);

  const body = el(doc, "div", { className: "ww-parent-body" });
  const form = el(doc, "form", { className: "ww-parent-form", attrs: { novalidate: "" } });
  form.addEventListener("submit", (event) => event.preventDefault());

  // Mode.
  const modeChoice = buildModeChoice(doc, locale, current.mode, (mode) => emit({ ...current, mode }));

  // Switches: music, sound, captions, calm motion, contrast.
  const switchList = el(doc, "div", { className: "ww-switch-list" });
  const switchField = el(doc, "fieldset", { className: "ww-field" }, [
    el(doc, "legend", { className: "ww-legend", text: uiText(locale, "ui.parent.display") }),
    switchList
  ]);
  const switchInputs = new Map<ToggleField, HTMLInputElement>();
  for (const entry of TOGGLES) {
    const input = el(doc, "input", {
      className: "ww-choice-input",
      attrs: { type: "checkbox", role: "switch", "data-setting": entry.field }
    });
    input.addEventListener("change", () => emit(withToggle(current, entry.field, input.checked)));
    switchInputs.set(entry.field, input);
    switchList.appendChild(
      el(doc, "label", { className: "ww-switch-row" }, [
        el(doc, "span", { className: "ww-switch-label", text: uiText(locale, entry.key) }),
        input,
        el(doc, "span", { className: "ww-switch-track", attrs: { "aria-hidden": "true" } })
      ])
    );
  }

  // Wait time for a turn: 3-8 whole seconds. Silence always carries on.
  const waitName = uniqueId("ww-wait");
  const waitHelpId = uniqueId("ww-wait-help");
  const waitGrid = el(doc, "div", { className: "ww-chip-grid" });
  const waitField = el(doc, "fieldset", { className: "ww-field", attrs: { "data-setting": "waitMs", "aria-describedby": waitHelpId } }, [
    el(doc, "legend", { className: "ww-legend", text: uiText(locale, "ui.parent.wait") }),
    el(doc, "p", { className: "ww-field-note", text: uiText(locale, "ui.parent.waitHelp"), attrs: { id: waitHelpId } }),
    waitGrid
  ]);
  const waitInputs = new Map<number, HTMLInputElement>();
  for (const ms of waitChoicesMs()) {
    const seconds = ms / 1000;
    const input = el(doc, "input", {
      className: "ww-choice-input",
      attrs: {
        type: "radio",
        name: waitName,
        value: String(ms),
        "data-wait-ms": String(ms),
        "aria-label": formatSeconds(current.locale, seconds, "long")
      }
    });
    input.addEventListener("change", () => {
      if (input.checked) emit({ ...current, waitMs: clampWaitMs(ms) });
    });
    waitInputs.set(ms, input);
    waitGrid.appendChild(
      el(doc, "label", { className: "ww-chip" }, [
        input,
        el(doc, "span", { className: "ww-chip-face", text: formatSeconds(current.locale, seconds, "short") })
      ])
    );
  }

  // Language: English now; Punjabi is listed but cannot be picked until native review.
  const localeName = uniqueId("ww-locale");
  const localeNoteId = uniqueId("ww-locale-note");
  const localeOptions = el(doc, "div", { className: "ww-segmented-options" });
  const localeField = el(doc, "fieldset", { className: "ww-field ww-segmented", attrs: { "data-setting": "locale" } }, [
    el(doc, "legend", { className: "ww-legend", text: uiText(locale, "ui.parent.locale") }),
    localeOptions,
    el(doc, "p", { className: "ww-field-note", text: uiText(locale, "ui.parent.localeUnavailable"), attrs: { id: localeNoteId } })
  ]);
  const localeInputs = new Map<string, HTMLInputElement>();
  for (const choice of LOCALE_CHOICES) {
    const available = AVAILABLE_LOCALES.includes(choice.code);
    const input = el(doc, "input", {
      className: "ww-choice-input",
      attrs: { type: "radio", name: localeName, value: choice.code, "data-locale": choice.code }
    });
    input.disabled = !available;
    if (!available) input.setAttribute("aria-describedby", localeNoteId);
    input.addEventListener("change", () => {
      if (input.checked && AVAILABLE_LOCALES.includes(choice.code)) emit({ ...current, locale: choice.code });
    });
    localeInputs.set(choice.code, input);
    localeOptions.appendChild(
      el(doc, "label", { className: "ww-segment" }, [
        input,
        el(doc, "span", { className: "ww-segment-face" }, [el(doc, "span", { text: choice.name, attrs: { lang: choice.code } })])
      ])
    );
  }

  // Word list.
  const wordsHost = el(doc, "div", { className: "ww-wordlist-host" });
  const wordList = mountWordList(wordsHost, locale, {
    choices: options.words ?? wordChoices(),
    selected: current.wordList,
    onChange: (list) => emit({ ...current, wordList: [...list] })
  });

  // Clear settings on this device (PRD 01 section 8): back to defaults, stored record removed.
  const clear = el(doc, "button", {
    className: "ww-button ww-button-quiet ww-clear",
    text: uiText(locale, "ui.parent.clear"),
    attrs: { type: "button", "data-action": "clear" }
  });
  clear.addEventListener("click", () => {
    emit(defaultSettings(prefersReducedMotion(win)));
    sync();
    clearSettings(options.storage === undefined ? safeLocalStorage(win) : options.storage);
  });

  form.append(modeChoice.element, switchField, waitField, localeField, wordsHost, clear);

  // Guidance and notes (PRD 01 sections 6, 7, 8 and 11).
  const guideTitleId = uniqueId("ww-guide-title");
  const guideList = el(doc, "ul", { className: "ww-guide-list" });
  for (const key of GUIDE_KEYS) guideList.appendChild(el(doc, "li", { text: uiText(locale, key) }));
  const guide = el(doc, "section", { className: "ww-parent-section", attrs: { "aria-labelledby": guideTitleId } }, [
    el(doc, "h3", { className: "ww-section-title", text: uiText(locale, "ui.guide.title"), attrs: { id: guideTitleId } }),
    el(doc, "p", { text: uiText(locale, "ui.note.start") }),
    guideList
  ]);
  const links = el(doc, "ul", { className: "ww-links" });
  for (const link of GROWN_UP_LINKS) {
    links.appendChild(
      el(doc, "li", {}, [
        el(doc, "a", {
          text: uiText(locale, link.key),
          attrs: { href: link.href, target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer" }
        })
      ])
    );
  }
  const notesTitleId = uniqueId("ww-notes-title");
  const notes = el(doc, "section", { className: "ww-parent-section", attrs: { "aria-labelledby": notesTitleId } }, [
    el(doc, "h3", { className: "ww-section-title", text: uiText(locale, "ui.note.title"), attrs: { id: notesTitleId } }),
    el(doc, "p", { text: uiText(locale, "ui.note.safety") }),
    el(doc, "p", { text: uiText(locale, "ui.note.privacy") }),
    el(doc, "p", { text: uiText(locale, "ui.note.links") }),
    links
  ]);
  body.append(form, guide, notes);

  // Footer: back to the story, or leave it for the menu.
  const back = el(doc, "button", {
    className: "ww-button ww-button-primary",
    text: uiText(locale, "ui.parent.back"),
    attrs: { type: "button", "data-action": "back" }
  });
  const exit = el(doc, "button", {
    className: "ww-button",
    text: uiText(locale, "ui.parent.exit"),
    attrs: { type: "button", "data-action": "exit" }
  });
  const footer = el(doc, "div", { className: "ww-parent-actions" }, [exit, back]);

  dialog.append(header, body, footer);

  function sync(): void {
    modeChoice.set(current.mode);
    for (const [field, input] of switchInputs) input.checked = current[field];
    const wait = clampWaitMs(current.waitMs);
    for (const [ms, input] of waitInputs) input.checked = ms === wait;
    for (const [code, input] of localeInputs) input.checked = code === current.locale;
    wordList.update(current.wordList);
  }
  sync();

  let closed = false;
  let release: () => void = () => {};
  const teardown = (): boolean => {
    if (closed) return false;
    closed = true;
    wordList.dispose();
    release();
    return true;
  };
  const closeToStory = (): void => {
    if (teardown()) options.onClose?.();
  };
  closeButton.addEventListener("click", closeToStory);
  back.addEventListener("click", closeToStory);
  exit.addEventListener("click", () => {
    if (teardown()) onExit();
  });
  // A tap on the backdrop closes the panel, but a press that starts inside the
  // panel (selecting note text, a drag off a chip) and ends outside does not.
  let pressedBackdrop = false;
  overlay.addEventListener("pointerdown", (event) => {
    pressedBackdrop = event.target === overlay;
  });
  overlay.addEventListener("click", (event) => {
    const fromBackdrop = pressedBackdrop;
    pressedBackdrop = false;
    if (event.target === overlay && fromBackdrop) closeToStory();
  });

  release = presentModal(root, overlay, dialog, closeToStory);
  applyDisplaySettings(doc, current);
  // Focus the dialog itself so screen readers announce its title first.
  dialog.focus({ preventScroll: true });

  return () => {
    teardown();
  };
}
