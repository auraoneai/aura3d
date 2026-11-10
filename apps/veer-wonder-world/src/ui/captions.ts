// Parent-facing captions (PRD 01 section 9, PRD 03 section 4, PRD 04 B05 and
// E08, PRD 06 QA-A01; WP-7). Shows the exact approved line text the narration
// player is speaking, one speaker at a time, so a story still reads when
// sound is off or unavailable. The line sits in a polite live region; it never
// blocks taps on the scene below. Speakers on screen get a mini-portrait ring
// (falling back to their colour dot) and their name; the off-screen narrator
// gets no label. Target vocabulary words are softly highlighted with safe DOM
// <mark class="ww-caption-keyword"> spans via DOM nodes only.

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
import type { PortraitMap } from "./episode-menu.js";
import { CORE_WORD_IDS, wordLabel } from "./parent-wordlist.js";
import { PORTRAITS } from "./portraits.js";

export interface CaptionsOptions {
  /** Optional portrait map for speaker mini-avatars (defaults to PORTRAITS). */
  readonly portraits?: PortraitMap;
  /** Optional default vocabulary words to highlight (defaults to CORE_WORD_IDS; pass [] to disable). */
  readonly highlightWords?: readonly string[];
}

export interface Captions {
  /** Shows one line. `speaker` is a SpeakerId ("momo", "narrator", ...). */
  show(speaker: string, text: string, highlightWords?: readonly string[]): void;
  /** Updates the active vocabulary highlight list for subsequent lines (`null` restores defaults). */
  setHighlightWords?(words: readonly string[] | null): void;
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

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a Safari-15-safe word-boundary matcher (longest multi-word phrases first, no regex lookbehind). */
function buildHighlightPattern(words: readonly string[]): RegExp | null {
  const normalized = Array.from(
    new Set(
      words
        .map((entry) => wordLabel(entry).trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    )
  ).sort((a, b) => b.length - a.length);
  if (normalized.length === 0) return null;
  const branches = normalized.map((phrase) => phrase.split(/\s+/).map(escapeRegExp).join("[\\s-]+"));
  return new RegExp(`\\b(${branches.join("|")})\\b`, "gi");
}

function renderHighlightedText(doc: Document, container: HTMLElement, text: string, words: readonly string[]): void {
  container.textContent = "";
  if (text.length === 0) return;
  const pattern = buildHighlightPattern(words);
  if (!pattern) {
    container.textContent = text;
    return;
  }
  let cursor = 0;
  let matchedAny = false;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const hit = match[0] ?? "";
    if (hit.length === 0) continue;
    matchedAny = true;
    if (start > cursor) {
      container.appendChild(doc.createTextNode(text.slice(cursor, start)));
    }
    container.appendChild(el(doc, "mark", { className: "ww-caption-keyword", text: hit }));
    cursor = start + hit.length;
  }
  if (!matchedAny) {
    container.textContent = text;
    return;
  }
  if (cursor < text.length) {
    container.appendChild(doc.createTextNode(text.slice(cursor)));
  }
}

/** `locale` is optional so `mountCaptions(root)` works; it supplies the region label and notice text. */
export function mountCaptions(root: HTMLElement, locale: UiLocale = ENGLISH_ONLY, options: CaptionsOptions = {}): Captions {
  const doc = docOf(root);
  const portraits = options.portraits ?? PORTRAITS;
  let defaultWords: readonly string[] = options.highlightWords ?? CORE_WORD_IDS;

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
    show(speaker: string, text: string, highlightWords?: readonly string[]): void {
      const name = speakerName(speaker, locale);
      const colour = speakerColour(speaker);
      speakerNode.textContent = "";
      speakerNode.classList.remove("has-avatar");
      speakerNode.hidden = name === "" && colour === null;
      if (colour) speakerNode.style.setProperty("--ww-dot", colour);
      else speakerNode.style.removeProperty("--ww-dot");

      if (speaker !== "narrator" && isCharacterId(speaker)) {
        const avatarUrl = portraits[speaker];
        if (avatarUrl) {
          speakerNode.classList.add("has-avatar");
          const avatar = el(doc, "img", {
            className: "ww-caption-avatar",
            attrs: { src: avatarUrl, alt: "", "aria-hidden": "true", decoding: "async", draggable: "false" }
          });
          avatar.addEventListener(
            "error",
            () => {
              avatar.remove();
              speakerNode.classList.remove("has-avatar");
            },
            { once: true }
          );
          speakerNode.appendChild(avatar);
        }
      }
      if (name !== "") {
        speakerNode.appendChild(el(doc, "span", { className: "ww-caption-speaker-name", text: name }));
      }

      line.dataset["speaker"] = speaker;
      renderHighlightedText(doc, textNode, text, highlightWords ?? defaultWords);
      hasText = text.trim().length > 0;
      sync();
    },
    setHighlightWords(words: readonly string[] | null): void {
      defaultWords = words ?? options.highlightWords ?? CORE_WORD_IDS;
    },
    clear(): void {
      speakerNode.textContent = "";
      speakerNode.classList.remove("has-avatar");
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
