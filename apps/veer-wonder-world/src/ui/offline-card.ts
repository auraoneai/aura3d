// End-of-story card (PRD 04 E05, PRD 01 sections 3.1, 4.3, 5 and 6, PRD 06
// QA-E09). A calm, still card on an opaque background (the scene is blanked)
// with one real-world activity: "All done! Now try..." plus the story's
// offline text. Under it, in small type, the story's caregiver bridge (PRD 01
// section 4.3: how a grown-up carries the play into real life, `<code>.bridge`)
// when the story has one. The app has already stopped playback; nothing starts
// next until the grown-up presses the button. There is no timer and no
// auto-next.

import { castDots, docOf, el, presentModal, uiText, uniqueId, type UiLocale } from "./accessibility.js";

export interface OfflineCardOptions {
  /** The story's caregiver bridge text (for example the `e17.bridge` string). Empty or missing shows nothing. */
  readonly note?: string;
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

  const overlay = el(doc, "div", { className: "ww-overlay ww-offline-overlay", attrs: { "data-ui": "offline" } });
  const done = el(doc, "button", {
    className: "ww-button ww-button-primary ww-offline-done",
    text: uiText(locale, "ui.offline.done"),
    attrs: { type: "button", "data-action": "offline-done" }
  });
  const card = el(doc, "section", {
    className: "ww-dialog ww-offline",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": noteId ? `${textId} ${noteId}` : textId }
  }, [
    castDots(doc),
    el(doc, "h2", { className: "ww-offline-title", text: uiText(locale, "ui.offline.title"), attrs: { id: titleId } }),
    el(doc, "p", { className: "ww-offline-text", text, attrs: { id: textId } }),
    ...(noteId ? [el(doc, "p", { className: "ww-offline-note ww-note-small", text: note, attrs: { id: noteId, "data-ui": "offline-note" } })] : []),
    done
  ]);
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
