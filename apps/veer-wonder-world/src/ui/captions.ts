// Parent-facing captions (PRD 01 section 9, PRD 03 section 4, PRD 04 B05 and
// E08, PRD 06 QA-A01). Shows the exact approved line text the narration
// player is speaking, one speaker at a time, so a story still reads when
// sound is off or unavailable. The line sits in a polite live region; it never
// blocks taps on the scene below. Speakers on screen get a colour dot and
// their name; the off-screen narrator gets no label.

import {
  CHARACTER_COLOURS,
  ENGLISH_ONLY,
  NEUTRAL_COLOUR,
  docOf,
  el,
  icon,
  isCharacterId,
  speakerName,
  uiText,
  type UiLocale
} from "./accessibility.js";

export interface Captions {
  /** Shows one line. `speaker` is a SpeakerId ("momo", "narrator", ...). */
  show(speaker: string, text: string): void;
  clear(): void;
  /** The parent's captions setting. */
  setEnabled(on: boolean): void;
  /**
   * Sound could not start or is unavailable: shows a short notice and keeps
   * captions visible regardless of the setting, so the story still reads.
   */
  setAudioUnavailable(unavailable: boolean): void;
  /** An optional grown-up coaching tip for the current beat (null hides it). */
  setTip(text: string | null): void;
  dispose(): void;
}

/** The dot colour for a speaker id; the narrator has none. */
export function speakerColour(speaker: string): string | null {
  if (isCharacterId(speaker)) return CHARACTER_COLOURS[speaker];
  return speaker === "robot" ? NEUTRAL_COLOUR : null;
}

/** `locale` is optional so `mountCaptions(root)` works; it supplies the region label and notice text. */
export function mountCaptions(root: HTMLElement, locale: UiLocale = ENGLISH_ONLY): Captions {
  const doc = docOf(root);
  const box = el(doc, "div", {
    className: "ww-captions",
    attrs: { role: "region", "aria-label": uiText(locale, "ui.captions.label"), "data-ui": "captions" }
  });
  const notice = el(doc, "p", { className: "ww-caption-notice", text: uiText(locale, "ui.audio.unavailable") });
  const speakerNode = el(doc, "span", { className: "ww-caption-speaker" });
  const textNode = el(doc, "span", { className: "ww-caption-text" });
  const line = el(doc, "p", { className: "ww-caption-line", attrs: { "aria-live": "polite", "aria-atomic": "true" } }, [speakerNode, textNode]);
  const tipText = el(doc, "span");
  const tip = el(doc, "p", { className: "ww-caption-tip" }, [icon(doc, "tip"), tipText]);
  box.append(notice, line, tip);
  root.appendChild(box);

  let enabled = true;
  let audioUnavailable = false;
  let hasText = false;
  let hasTip = false;

  // The live line always stays in the accessibility tree (a region that
  // appears together with its first text is often not announced); it is only
  // visually hidden while empty, and silenced while captions are off.
  const sync = (): void => {
    const showText = enabled || audioUnavailable;
    line.classList.toggle("is-hidden", !(showText && hasText));
    line.setAttribute("aria-live", showText ? "polite" : "off");
    tip.hidden = !(showText && hasTip);
    notice.hidden = !audioUnavailable;
  };
  sync();

  return {
    show(speaker: string, text: string): void {
      const name = speakerName(speaker, locale);
      const colour = speakerColour(speaker);
      speakerNode.textContent = name;
      speakerNode.hidden = name === "" && colour === null;
      if (colour) speakerNode.style.setProperty("--ww-dot", colour);
      else speakerNode.style.removeProperty("--ww-dot");
      line.dataset["speaker"] = speaker;
      textNode.textContent = text;
      hasText = text.trim().length > 0;
      sync();
    },
    clear(): void {
      speakerNode.textContent = "";
      textNode.textContent = "";
      delete line.dataset["speaker"];
      hasText = false;
      sync();
    },
    setEnabled(on: boolean): void {
      enabled = on;
      sync();
    },
    setAudioUnavailable(unavailable: boolean): void {
      audioUnavailable = unavailable;
      sync();
    },
    setTip(text: string | null): void {
      tipText.textContent = text ?? "";
      hasTip = text !== null && text.trim().length > 0;
      sync();
    },
    dispose(): void {
      box.remove();
    }
  };
}
