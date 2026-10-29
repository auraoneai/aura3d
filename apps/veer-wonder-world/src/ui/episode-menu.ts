// Story menu (PRD 04 E02, PRD 01 section 6, PRD 06 QA-P04). A finite grid:
// the 20 episodes, then the 12 activities. Inside each section the P1 pilot
// stories come first, then P2, each group in canonical order. Every story is
// listed once with its canonical number, its host's portrait (or host colour),
// title and host name. No recommendations, no "up next", no streaks, no
// autoplay: nothing happens until the grown-up picks.

import type { CharacterId, Phase } from "../types.js";
import {
  CHARACTER_COLOURS,
  docOf,
  el,
  enableGridNavigation,
  humanizeId,
  iconButton,
  inertOthers,
  speakerName,
  storyText,
  uiText,
  uniqueId,
  type UiLocale,
  type UiStringKey
} from "./accessibility.js";
import { PORTRAITS } from "./portraits.js";

export interface MenuItem {
  /** Story id (the content slug). */
  readonly id: string;
  /** Line-key prefix: e01-e20 or g01-g12. */
  readonly code: string;
  /** Locale key of the title, for example "e17.title". */
  readonly titleKey: string;
  readonly kind: "episode" | "activity";
  readonly host: CharacterId;
  /** Number in the canonical list: 1-20 for episodes, 1-12 for activities. */
  readonly number: number;
  /**
   * The story's build phase (`StorySpec.phase`). P1 pilot stories are listed
   * first in their section (PRD 04 E02); an item without a phase is listed
   * with P2.
   */
  readonly phase?: Phase;
}

/** Host portrait URLs by character (src/ui/portraits.ts). */
export type PortraitMap = Readonly<Partial<Record<CharacterId, string>>>;

export interface EpisodeMenuOptions {
  /** When given, a "Grown-ups" button in the header calls it (the app runs the parent gate). */
  readonly onParent?: () => void;
  /**
   * The 3D stage could not start on this device (no WebGL2, a blocked GPU): a
   * calm status line under the title says so, instead of a picked story
   * silently returning to the menu.
   */
  readonly stageUnavailable?: boolean;
  /** Portraits for the cards; defaults to PORTRAITS. A host without one keeps the colour badge. */
  readonly portraits?: PortraitMap;
}

const SECTIONS: readonly { readonly kind: MenuItem["kind"]; readonly key: UiStringKey }[] = [
  { kind: "episode", key: "ui.menu.episodes" },
  { kind: "activity", key: "ui.menu.activities" }
];

/** Listing order of the phases: the P1 pilot first (PRD 04 E02). */
const PHASE_ORDER: Readonly<Record<Phase, number>> = { P1: 0, P2: 1 };

function phaseRank(item: MenuItem): number {
  return PHASE_ORDER[item.phase ?? "P2"];
}

/**
 * Items of one kind: P1 first, then P2 (PRD 04 E02), each group in canonical
 * order (by number, then id), each id once.
 */
export function menuSection(items: readonly MenuItem[], kind: MenuItem["kind"]): MenuItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => item.kind === kind)
    .slice()
    .sort((a, b) => phaseRank(a) - phaseRank(b) || a.number - b.number || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

/**
 * The card's badge: the canonical number on the host colour, or the host's
 * portrait with the number as a small tag. Decorative (aria-hidden): the card's
 * name is its title and host name.
 */
function cardBadge(doc: Document, item: MenuItem, portrait: string | undefined): HTMLElement {
  const number = String(item.number);
  const badge = el(doc, "span", { className: "ww-card-badge", attrs: { "aria-hidden": "true" } });
  if (portrait === undefined || portrait === "") {
    badge.textContent = number;
    return badge;
  }
  badge.classList.add("has-portrait");
  const image = el(doc, "img", {
    className: "ww-card-portrait",
    attrs: { src: portrait, alt: "", decoding: "async", draggable: "false" }
  });
  // A picture that cannot load gives the plain number badge back.
  image.addEventListener(
    "error",
    () => {
      badge.classList.remove("has-portrait");
      badge.textContent = number;
    },
    { once: true }
  );
  badge.append(image, el(doc, "span", { className: "ww-card-number", text: number }));
  return badge;
}

/**
 * Shows the menu. `onPick(id)` is called once, for the first card tapped;
 * the app then removes the menu with the returned function.
 */
export function showEpisodeMenu(
  root: HTMLElement,
  locale: UiLocale,
  items: readonly MenuItem[],
  onPick: (id: string) => void,
  options: EpisodeMenuOptions = {}
): () => void {
  const doc = docOf(root);
  const portraits = options.portraits ?? PORTRAITS;
  const titleId = uniqueId("ww-menu-title");
  const screen = el(doc, "section", { className: "ww-screen ww-menu", attrs: { "aria-labelledby": titleId, "data-ui": "menu" } });
  const inner = el(doc, "div", { className: "ww-menu-inner" });
  const title = el(doc, "h1", { className: "ww-menu-title", text: uiText(locale, "ui.menu.title"), attrs: { id: titleId, tabindex: "-1" } });
  const header = el(doc, "div", { className: "ww-menu-header" }, [title]);
  if (options.onParent) {
    const onParent = options.onParent;
    const parent = iconButton(doc, "settings", uiText(locale, "ui.parentButton"), { "data-control": "parent" });
    parent.addEventListener("click", () => onParent());
    header.appendChild(parent);
  }
  inner.appendChild(header);
  if (options.stageUnavailable === true) {
    inner.appendChild(
      el(doc, "p", { className: "ww-menu-notice", text: uiText(locale, "ui.stage.unavailable"), attrs: { role: "status", "data-ui": "menu-notice" } })
    );
  }

  let picked = false;
  for (const section of SECTIONS) {
    const list = menuSection(items, section.kind);
    if (list.length === 0) continue;
    const headingId = uniqueId(`ww-menu-${section.kind}`);
    const grid = el(doc, "ul", { className: "ww-menu-grid", attrs: { "aria-labelledby": headingId } });
    for (const item of list) {
      const colour = CHARACTER_COLOURS[item.host] ?? CHARACTER_COLOURS.momo;
      const card = el(doc, "button", {
        className: "ww-card",
        attrs: { type: "button", "data-story-id": item.id, "data-kind": item.kind, "data-code": item.code }
      });
      card.style.setProperty("--ww-dot", colour);
      card.append(
        cardBadge(doc, item, portraits[item.host]),
        el(doc, "span", { className: "ww-card-text" }, [
          el(doc, "span", { className: "ww-card-title", text: storyText(locale, item.titleKey, humanizeId(item.id)) }),
          el(doc, "span", { className: "ww-card-host", text: speakerName(item.host, locale) })
        ])
      );
      card.addEventListener("click", () => {
        if (picked) return;
        picked = true;
        try {
          onPick(item.id);
        } catch (error) {
          // Keep the menu usable so the grown-up can pick again (as the start screen does).
          picked = false;
          throw error;
        }
      });
      grid.appendChild(el(doc, "li", { className: "ww-menu-cell" }, [card]));
    }
    inner.append(el(doc, "h2", { className: "ww-menu-heading", text: uiText(locale, section.key), attrs: { id: headingId } }), grid);
  }

  screen.appendChild(inner);
  root.appendChild(screen);
  // The menu covers the whole overlay: whatever sits behind it (corner
  // controls, captions) leaves the tab order until the menu goes away.
  const restoreInert = inertOthers(root, screen);
  const removeArrows = enableGridNavigation(screen, ".ww-card");
  // Like a page change: focus the heading so a screen reader announces where we are.
  title.focus({ preventScroll: true });

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    removeArrows();
    screen.remove();
    restoreInert();
  };
}
