// Parent word list (PRD 04 E07, PRD 01 sections 4.1 and 6). A short local
// shortlist of words the grown-up wants to use often today. It is stored with
// the other parent settings on this device, is never sent anywhere, and does
// not measure, score or claim learning.

import { docOf, el, fillTemplate, uiText, uniqueId, type UiLocale } from "./accessibility.js";
import { WORD_LIST_MAX, isStorableWordId } from "./settings-store.js";

export interface WordChoice {
  /** Content word id, for example "ball" or "all-done". */
  readonly id: string;
  /** What the chip shows. */
  readonly label: string;
}

/**
 * The initial functional language set (PRD 01 section 4.1, plus "all done"),
 * in cluster order: request, movement, cause and effect, social, favourite
 * objects, daily living, sound play. Every id is also a content word id
 * (src/content/words.ts). The parent panel offers these unless the app
 * passes its own list (for example the content catalog's `wordChoices()`).
 */
export const CORE_WORD_IDS: readonly string[] = [
  "more", "again", "help",
  "go", "stop", "up", "down",
  "open", "close", "pop", "roll",
  "hi", "bye", "all-done", "thank-you", "my-turn", "your-turn",
  "ball", "dog", "car", "train", "book", "teddy",
  "eat", "drink", "wash", "brush", "sleep",
  "woof", "moo", "quack", "baa", "beep", "boom"
];

/** "all-done" -> "all done". Word ids are the words themselves. */
export function wordLabel(id: string): string {
  return id.replace(/-/g, " ");
}

/** Turns word ids into chips, dropping ids outside the content word catalog and duplicates. */
export function wordChoices(ids: readonly string[] = CORE_WORD_IDS): WordChoice[] {
  const seen = new Set<string>();
  const out: WordChoice[] = [];
  for (const id of ids) {
    if (!isStorableWordId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: wordLabel(id) });
  }
  return out;
}

/** Adds or removes `id`. Adding past `max` returns the list unchanged. */
export function toggleWord(list: readonly string[], id: string, max = WORD_LIST_MAX): string[] {
  if (list.includes(id)) return list.filter((word) => word !== id);
  if (list.length >= max) return [...list];
  return [...list, id];
}

export interface WordListOptions {
  readonly choices: readonly WordChoice[];
  readonly selected: readonly string[];
  readonly onChange: (wordList: readonly string[]) => void;
  readonly max?: number;
}

export interface WordListHandle {
  /** Replaces the selection (for example after "Clear settings"). */
  update(selected: readonly string[]): void;
  dispose(): void;
}

/**
 * Renders the shortlist as a group of large checkbox chips. Once `max` words
 * are chosen the other chips are disabled until one is removed.
 */
export function mountWordList(container: HTMLElement, locale: UiLocale, options: WordListOptions): WordListHandle {
  const doc = docOf(container);
  const max = options.max ?? WORD_LIST_MAX;
  // Only words the settings store will keep are offered, so a ticked chip is always saved.
  const choices = options.choices.filter((choice) => isStorableWordId(choice.id));
  const known = new Set(choices.map((choice) => choice.id));
  let selected: string[] = options.selected.filter((id) => known.has(id)).slice(0, max);

  const helpId = uniqueId("ww-words-help");
  const fieldset = el(doc, "fieldset", {
    className: "ww-field ww-wordlist",
    attrs: { "data-setting": "wordList", "aria-describedby": helpId }
  });
  const count = el(doc, "p", { className: "ww-field-note ww-wordlist-count", attrs: { "aria-live": "polite" } });
  const grid = el(doc, "div", { className: "ww-chip-grid" });
  fieldset.append(
    el(doc, "legend", { className: "ww-legend", text: uiText(locale, "ui.parent.words") }),
    el(doc, "p", { className: "ww-field-note", text: uiText(locale, "ui.parent.wordsHelp"), attrs: { id: helpId } }),
    grid,
    count
  );
  if (choices.length === 0) {
    grid.appendChild(el(doc, "p", { className: "ww-field-note", text: uiText(locale, "ui.parent.wordsEmpty") }));
  }

  const boxes = new Map<string, HTMLInputElement>();
  for (const choice of choices) {
    const box = el(doc, "input", {
      className: "ww-choice-input",
      attrs: { type: "checkbox", value: choice.id, "data-word": choice.id }
    });
    box.addEventListener("change", () => {
      const next = toggleWord(selected, choice.id, max);
      if (box.checked && !next.includes(choice.id)) box.checked = false;
      selected = next;
      sync();
      options.onChange([...selected]);
    });
    boxes.set(choice.id, box);
    grid.appendChild(
      el(doc, "label", { className: "ww-chip" }, [box, el(doc, "span", { className: "ww-chip-face", text: choice.label })])
    );
  }

  const sync = (): void => {
    for (const [id, box] of boxes) {
      box.checked = selected.includes(id);
      box.disabled = !box.checked && selected.length >= max;
    }
    count.textContent = fillTemplate(uiText(locale, "ui.parent.wordsCount"), { n: selected.length, max });
  };
  sync();
  container.appendChild(fieldset);

  return {
    update(next: readonly string[]): void {
      selected = next.filter((id) => known.has(id)).slice(0, max);
      sync();
    },
    dispose(): void {
      fieldset.remove();
    }
  };
}
