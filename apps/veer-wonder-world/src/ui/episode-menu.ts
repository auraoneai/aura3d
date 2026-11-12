// Story menu (PRD 04 E02, PRD 01 section 6, PRD 06 QA-P04; WP-7). A finite
// grid: the 20 episodes, then the 12 activities, with an optional world filter
// strip ("All" + the six toy-island worlds, defaulting to "All"). Inside each
// section the P1 pilot stories come first, then P2, each group in canonical
// order. Every story is listed once with its world diorama header, canonical
// number, host portrait (or host colour), title, host name, calm duration chip,
// and an optional "Focus word" badge when a story's target words overlap the
// parent's local word list. No recommendations, no "up next", no autoplay.

import { storyById } from "../content/catalog.js";
import { HOST_HOME_WORLD, WORLD_ORDER, WORLD_THEMES, createWorldSceneSvg } from "./world-art.js";
import type { CharacterId, Phase, WorldId } from "../types.js";
import {
  CHARACTER_COLOURS,
  docOf,
  el,
  enableGridNavigation,
  humanizeId,
  icon,
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
import { loadSettings, safeLocalStorage } from "./settings-store.js";

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
  /** Optional world override (resolved from catalog `StorySpec.world` when omitted). */
  readonly world?: WorldId;
  /** Optional target vocabulary ids (resolved from catalog `StorySpec.targetWords` when omitted). */
  readonly targetWords?: readonly string[];
  /** Optional episode duration in seconds (resolved from catalog `EpisodeSpec.durationSec` when omitted). */
  readonly durationSec?: number;
  /** Optional activity round count (resolved from catalog `ActivitySpec.rounds` when omitted). */
  readonly rounds?: number;
}

/** Host portrait URLs by character (src/ui/portraits.ts). */
export type PortraitMap = Readonly<Partial<Record<CharacterId, string>>>;

export type WorldFilterValue = WorldId | "all";

export interface EpisodeMenuOptions {
  /** When given, a "Grown-ups" button in the header calls it (the app runs the parent gate). */
  readonly onParent?: () => void;
  /** Whether continuous Auto-play mode is currently active (`mode === "auto"`). */
  readonly autoPlay?: boolean;
  /** One-tap continuous Auto-play toggle in the menu header. */
  readonly onToggleAuto?: (next: boolean) => void;
  /**
   * The 3D stage could not start on this device (no WebGL2, a blocked GPU): a
   * calm status line under the title says so, instead of a picked story
   * silently returning to the menu.
   */
  readonly stageUnavailable?: boolean;
  /** Portraits for the cards; defaults to PORTRAITS. A host without one keeps the colour badge. */
  readonly portraits?: PortraitMap;
  /** Parent's chosen focus words (`ParentSettings.wordList`); falls back to local settings when omitted. */
  readonly selectedWords?: readonly string[];
  /** Initial world filter ("all" by default so every episode and activity is visible initially). */
  readonly initialWorld?: WorldFilterValue;
}

const SECTIONS: readonly { readonly kind: MenuItem["kind"]; readonly key: UiStringKey }[] = [
  { kind: "episode", key: "ui.menu.episodes" },
  { kind: "activity", key: "ui.menu.activities" }
];

/** Listing order of the phases: the P1 pilot first (PRD 04 E02). */
const PHASE_ORDER: Readonly<Record<Phase, number>> = { P1: 0, P2: 1 };

const SVG_NS = "http://www.w3.org/2000/svg";

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

function focusStarSvg(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "ww-card-focus-icon");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M8 1.4 9.9 5.3l4.3.6-3.1 3 .7 4.3L8 11.2 4.2 13.2l.7-4.3-3.1-3 4.3-.6z"
  );
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function resolveDurationChip(item: MenuItem, spec: ReturnType<typeof storyById>): string | null {
  if (item.kind === "episode") {
    const sec = item.durationSec ?? (spec?.kind === "episode" ? spec.estimatedDurationSec : undefined);
    if (sec !== undefined && sec > 0) return `${Math.max(1, Math.round(sec / 60))} min`;
    return null;
  }
  const rounds = item.rounds ?? (spec?.kind === "activity" ? spec.roundLimit : undefined);
  if (rounds !== undefined && rounds > 0) return `${rounds} ${rounds === 1 ? "round" : "rounds"}`;
  return null;
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

interface FilterPillEntry {
  readonly value: WorldFilterValue;
  readonly button: HTMLButtonElement;
}

interface CardCellEntry {
  readonly world: WorldId;
  readonly cell: HTMLLIElement;
}

interface SectionEntry {
  readonly heading: HTMLHeadingElement;
  readonly grid: HTMLUListElement;
  readonly cells: readonly CardCellEntry[];
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
  const resolvedWords = options.selectedWords ?? loadSettings(safeLocalStorage(doc.defaultView)).wordList;
  const selectedWordSet = new Set<string>(resolvedWords);

  const titleId = uniqueId("ww-menu-title");
  const screen = el(doc, "section", { className: "ww-screen ww-menu", attrs: { "aria-labelledby": titleId, "data-ui": "menu" } });
  const inner = el(doc, "div", { className: "ww-menu-inner" });
  const title = el(doc, "h1", { className: "ww-menu-title", text: uiText(locale, "ui.menu.title"), attrs: { id: titleId, tabindex: "-1" } });
  const header = el(doc, "div", { className: "ww-menu-header" }, [title]);
  if (options.onToggleAuto || options.onParent) {
    const actions = options.onToggleAuto ? el(doc, "div", { className: "ww-menu-actions" }) : header;
    if (options.onToggleAuto) {
      const onToggleAuto = options.onToggleAuto;
      let autoOn = options.autoPlay === true;
      const autoBtn = el(
        doc,
        "button",
        {
          className: "ww-pill-button ww-auto-toggle",
          attrs: { type: "button", "data-control": "auto", "aria-pressed": String(autoOn) }
        },
        [icon(doc, "auto"), el(doc, "span", { text: uiText(locale, "ui.mode.auto") })]
      );
      const syncAuto = (): void => {
        autoBtn.classList.toggle("is-active", autoOn);
        autoBtn.setAttribute("aria-pressed", String(autoOn));
        autoBtn.dataset["auto"] = String(autoOn);
      };
      syncAuto();
      autoBtn.addEventListener("click", () => {
        autoOn = !autoOn;
        syncAuto();
        onToggleAuto(autoOn);
      });
      actions.appendChild(autoBtn);
    }
    if (options.onParent) {
      const onParent = options.onParent;
      const parent = iconButton(doc, "settings", uiText(locale, "ui.parentButton"), { "data-control": "parent" });
      parent.addEventListener("click", () => onParent());
      actions.appendChild(parent);
    }
    if (actions !== header) header.appendChild(actions);
  }
  inner.appendChild(header);
  if (options.stageUnavailable === true) {
    inner.appendChild(
      el(doc, "p", { className: "ww-menu-notice", text: uiText(locale, "ui.stage.unavailable"), attrs: { role: "status", "data-ui": "menu-notice" } })
    );
  }

  // World filter strip ("All" + 6 toy-island worlds) with roving tabindex.
  let activeWorld: WorldFilterValue = options.initialWorld ?? "all";
  const filterBar = el(doc, "div", {
    className: "ww-world-filter",
    attrs: { role: "toolbar", "aria-label": "Filter by world", "data-ui": "world-filter" }
  });
  const filterPills: FilterPillEntry[] = [];
  const filterDefs: readonly { readonly value: WorldFilterValue; readonly label: string; readonly dot?: string; readonly bg?: string }[] = [
    { value: "all", label: "All" },
    ...WORLD_ORDER.map((worldId) => {
      const theme = WORLD_THEMES[worldId];
      return {
        value: worldId,
        label: theme.shortLabel,
        dot: CHARACTER_COLOURS[theme.host],
        bg: theme.pillBg
      };
    })
  ];

  const sectionEntries: SectionEntry[] = [];

  const applyWorldFilter = (nextWorld: WorldFilterValue): void => {
    activeWorld = nextWorld;
    for (const entry of filterPills) {
      const active = entry.value === activeWorld;
      entry.button.classList.toggle("is-active", active);
      entry.button.setAttribute("aria-pressed", String(active));
      entry.button.setAttribute("tabindex", active ? "0" : "-1");
    }
    for (const sectionEntry of sectionEntries) {
      let visibleCount = 0;
      for (const cellEntry of sectionEntry.cells) {
        const match = activeWorld === "all" || cellEntry.world === activeWorld;
        cellEntry.cell.hidden = !match;
        if (match) visibleCount += 1;
      }
      const hideSection = visibleCount === 0;
      sectionEntry.heading.hidden = hideSection;
      sectionEntry.grid.hidden = hideSection;
    }
  };

  for (const def of filterDefs) {
    const pillChildren: Node[] = [];
    if (def.dot) {
      const swatch = el(doc, "span", { className: "ww-world-pill-dot", attrs: { "aria-hidden": "true" } });
      swatch.style.setProperty("--ww-dot", def.dot);
      pillChildren.push(swatch);
    }
    pillChildren.push(el(doc, "span", { className: "ww-world-pill-label", text: def.label }));
    const pill = el(
      doc,
      "button",
      {
        className: "ww-world-pill",
        attrs: {
          type: "button",
          "data-world": def.value,
          "aria-pressed": String(def.value === activeWorld),
          tabindex: def.value === activeWorld ? "0" : "-1"
        }
      },
      pillChildren
    );
    if (def.bg) pill.style.setProperty("--ww-world-bg", def.bg);
    pill.addEventListener("click", () => {
      applyWorldFilter(def.value);
    });
    filterPills.push({ value: def.value, button: pill });
    filterBar.appendChild(pill);
  }

  filterBar.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const currentIndex = filterPills.findIndex((entry) => entry.button === event.target);
    if (currentIndex < 0 || filterPills.length === 0) return;
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = filterPills.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % filterPills.length;
    else nextIndex = (currentIndex - 1 + filterPills.length) % filterPills.length;
    const target = filterPills[nextIndex];
    if (!target) return;
    event.preventDefault();
    applyWorldFilter(target.value);
    target.button.focus();
  });

  if (items.length > 0) inner.appendChild(filterBar);

  let picked = false;
  for (const section of SECTIONS) {
    const list = menuSection(items, section.kind);
    if (list.length === 0) continue;
    const headingId = uniqueId(`ww-menu-${section.kind}`);
    const heading = el(doc, "h2", { className: "ww-menu-heading", text: uiText(locale, section.key), attrs: { id: headingId } });
    const grid = el(doc, "ul", { className: "ww-menu-grid", attrs: { "aria-labelledby": headingId } });
    const cellEntries: CardCellEntry[] = [];

    for (const item of list) {
      const spec = storyById(item.id);
      const world: WorldId = item.world ?? spec?.world ?? HOST_HOME_WORLD[item.host] ?? "meadow";
      const targetWords: readonly string[] = item.targetWords ?? spec?.targetWords ?? [];
      const hasFocusWord = selectedWordSet.size > 0 && targetWords.some((word) => selectedWordSet.has(word));
      const durationChip = resolveDurationChip(item, spec);
      const colour = CHARACTER_COLOURS[item.host] ?? CHARACTER_COLOURS.momo;

      const cardAttrs: Record<string, string> = {
        type: "button",
        "data-story-id": item.id,
        "data-kind": item.kind,
        "data-code": item.code,
        "data-world": world
      };
      if (hasFocusWord) cardAttrs["data-focus-word"] = "true";

      const card = el(doc, "button", { className: "ww-card", attrs: cardAttrs });
      card.style.setProperty("--ww-dot", colour);

      const sceneChildren: Node[] = [
        createWorldSceneSvg(doc, world),
        el(doc, "span", { className: "ww-card-world-tag", text: WORLD_THEMES[world].shortLabel })
      ];
      if (hasFocusWord) {
        sceneChildren.push(
          el(doc, "span", { className: "ww-card-focus", attrs: { "data-ui": "focus-word" } }, [
            focusStarSvg(doc),
            el(doc, "span", { text: "Focus word" })
          ])
        );
      }
      const sceneBand = el(doc, "span", { className: "ww-card-scene", attrs: { "aria-hidden": "true" } }, sceneChildren);

      const metaChildren: Node[] = [el(doc, "span", { className: "ww-card-host", text: speakerName(item.host, locale) })];
      if (durationChip !== null) {
        metaChildren.push(el(doc, "span", { className: "ww-card-duration", text: durationChip, attrs: { "aria-hidden": "true" } }));
      }

      const bodyRow = el(doc, "span", { className: "ww-card-body" }, [
        cardBadge(doc, item, portraits[item.host]),
        el(doc, "span", { className: "ww-card-text" }, [
          el(doc, "span", { className: "ww-card-title", text: storyText(locale, item.titleKey, humanizeId(item.id)) }),
          el(doc, "span", { className: "ww-card-meta" }, metaChildren)
        ])
      ]);

      card.append(sceneBand, bodyRow);
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
      const cell = el(doc, "li", { className: "ww-menu-cell" }, [card]);
      cellEntries.push({ world, cell });
      grid.appendChild(cell);
    }

    sectionEntries.push({ heading, grid, cells: cellEntries });
    inner.append(heading, grid);
  }

  applyWorldFilter(activeWorld);

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
