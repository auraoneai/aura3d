// End-of-story card (PRD 04 E05, PRD 01 sections 3.1, 4.3, 5 and 6, PRD 06
// QA-E09; WP-7). A calm, still card on an opaque background (the scene is
// blanked) with a decorative cast avatar row, optional target-word recap
// chips, one real-world activity ("All done! Now try..." plus the story's
// offline text), and the story's caregiver bridge note when present. The app
// has already stopped playback; nothing starts next until the grown-up presses
// the single "Back to stories" button. There is no timer and no auto-next.

import type { CharacterId } from "../types.js";
import { CHARACTER_COLOURS, CHARACTER_IDS, docOf, el, presentModal, uiText, uniqueId, type UiLocale } from "./accessibility.js";
import type { PortraitMap } from "./episode-menu.js";
import { PORTRAITS } from "./portraits.js";

export interface OfflineCardWord {
  readonly id: string;
  readonly label: string;
}

export interface OfflineCardOptions {
  /** The story's caregiver bridge text (for example the `e17.bridge` string). Empty or missing shows nothing. */
  readonly note?: string;
  /** Optional target vocabulary recap chips shown calmly above the hands-on play prompt. */
  readonly words?: readonly OfflineCardWord[];
  /** Optional cast subset shown in the avatar row (defaults to all six Wonder World friends). */
  readonly cast?: readonly CharacterId[];
  /** Optional portrait map override (defaults to PORTRAITS). */
  readonly portraits?: PortraitMap;
}

export type OfflineCardContent = OfflineCardOptions;

function offlineCastRow(doc: Document, cast: readonly CharacterId[], portraits: PortraitMap): HTMLElement {
  const row = el(doc, "div", { className: "ww-cast ww-offline-cast", attrs: { "aria-hidden": "true" } });
  cast.forEach((id, index) => {
    const ring = el(doc, "span", { className: "ww-cast-dot ww-offline-avatar" });
    ring.style.setProperty("--ww-dot", CHARACTER_COLOURS[id]);
    ring.style.setProperty("--ww-i", String(index));
    const url = portraits[id];
    if (url) {
      ring.classList.add("has-portrait");
      const img = el(doc, "img", {
        className: "ww-offline-avatar-img",
        attrs: { src: url, alt: "", decoding: "async", draggable: "false" }
      });
      img.addEventListener(
        "error",
        () => {
          img.remove();
          ring.classList.remove("has-portrait");
        },
        { once: true }
      );
      ring.appendChild(img);
    }
    row.appendChild(ring);
  });
  return row;
}

function offlineWordRow(doc: Document, words: readonly OfflineCardWord[]): HTMLElement | null {
  const valid = words.filter((word) => word.label.trim() !== "");
  if (valid.length === 0) return null;
  const list = el(doc, "ul", { className: "ww-offline-words", attrs: { "data-ui": "offline-words" } });
  for (const word of valid) {
    list.appendChild(
      el(doc, "li", {
        className: "ww-offline-word-chip",
        text: word.label.trim(),
        attrs: { "data-word": word.id }
      })
    );
  }
  return list;
}

/**
 * Shows the card. `text` is the story's resolved offline-play line (for
 * example the `e17.offline` string). `onDone` runs once, on the button (or
 * Escape). Returns an idempotent remover that does not call onDone.
 */
export function showOfflineCard(root: HTMLElement, locale: UiLocale, text: string, onDone: () => void, options: OfflineCardOptions = {}): () => void {
  const doc = docOf(root);
  const titleId = uniqueId("ww-offline-title");
  const textId = uniqueId("ww-offline-text");
  const note = (options.note ?? "").trim();
  const noteId = note === "" ? null : uniqueId("ww-offline-note");
  const cast = options.cast && options.cast.length > 0 ? options.cast : CHARACTER_IDS;
  const portraits = options.portraits ?? PORTRAITS;
  const wordsNode = options.words ? offlineWordRow(doc, options.words) : null;

  const overlay = el(doc, "div", { className: "ww-overlay ww-offline-overlay", attrs: { "data-ui": "offline" } });
  const done = el(doc, "button", {
    className: "ww-button ww-button-primary ww-offline-done",
    text: uiText(locale, "ui.offline.done"),
    attrs: { type: "button", "data-action": "offline-done" }
  });
  const card = el(
    doc,
    "section",
    {
      className: "ww-dialog ww-offline",
      attrs: {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
        "aria-describedby": noteId ? `${textId} ${noteId}` : textId
      }
    },
    [
      offlineCastRow(doc, cast, portraits),
      el(doc, "h2", { className: "ww-offline-title", text: uiText(locale, "ui.offline.title"), attrs: { id: titleId } }),
      ...(wordsNode ? [wordsNode] : []),
      el(doc, "p", { className: "ww-offline-text", text, attrs: { id: textId } }),
      ...(noteId ? [el(doc, "p", { className: "ww-offline-note ww-note-small", text: note, attrs: { id: noteId, "data-ui": "offline-note" } })] : []),
      done
    ]
  );
  overlay.appendChild(card);

  let closed = false;
  let release: () => void = () => {};
  const close = (): boolean => {
    if (closed) return false;
    closed = true;
    release();
    return true;
  };
  const finish = (): void => {
    if (close()) onDone();
  };
  done.addEventListener("click", finish);

  release = presentModal(root, overlay, card, finish);
  done.focus({ preventScroll: true });

  return () => {
    close();
  };
}
