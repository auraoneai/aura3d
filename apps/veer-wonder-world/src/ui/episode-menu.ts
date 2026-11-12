// Story & lullaby menu (PRD 04 E02, PRD 01 section 6, PRD 06 QA-P04; WP-6/WP-7).
// A finite, calm storybook shelf: category filter tabs ("All", "Sleep & lullabies",
// "Songs", "Stories", "Games"), world filter pills ("All" + the eight worlds),
// the 26 episodes, the 16 activities, and the 26 original songs (including 11
// hushed bedtime lullabies and a one-tap "Play all lullabies" jukebox). Inside
// each story section the P1 pilot stories come first, then P2, each group in
// canonical order. Every story is listed once as `.ww-card`; song cards use
// `.ww-song-card` so `.ww-card` queries stay strictly 1:1 with catalog stories.

import { storyById } from "../content/catalog.js";
import { SLEEP_SONG_IDS, SONGS, SONG_IDS, songLengthSec } from "../content/songs.js";
import { HOST_HOME_WORLD, WORLD_ORDER, WORLD_THEMES, createWorldSceneSvg } from "./world-art.js";
import type { CharacterId, Phase, SleepCategory, SongId, WorldId } from "../types.js";
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
import {
  canFullscreenControl,
  isEffectiveFullscreen,
  toggleFullscreenControl,
  watchFullscreen,
  type IosFullscreenStrings
} from "./fullscreen.js";
import { loadSettings, safeLocalStorage } from "./settings-store.js";

export interface MenuItem {
  /** Story id (the content slug). */
  readonly id: string;
  /** Line-key prefix: e01-e26 or g01-g16. */
  readonly code: string;
  /** Locale key of the title, for example "e17.title". */
  readonly titleKey: string;
  readonly kind: "episode" | "activity";
  readonly host: CharacterId;
  /** Number in the canonical list: 1-26 for episodes, 1-16 for activities. */
  readonly number: number;
  /**
   * The story's build phase (`StorySpec.phase`). P1 pilot stories are listed
   * first in their section (PRD 04 E02); an item without a phase is listed
   * with P2.
   */
  readonly phase?: Phase;
  /** Optional world override (resolved from catalog `StorySpec.world` when omitted). */
  readonly world?: WorldId;
  /** Optional bedtime shelf tag (resolved from catalog `StorySpec.sleepCategory` when omitted). */
  readonly sleepCategory?: SleepCategory;
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
export type MenuCategoryValue = "all" | "sleep" | "songs" | "episodes" | "activities";

export interface EpisodeMenuOptions {
  /** When given, a "Grown-ups" button in the header calls it (the app runs the parent gate). */
  readonly onParent?: () => void;
  /** Whether continuous Auto-play mode is currently active (`mode === "auto"`). */
  readonly autoPlay?: boolean;
  /** One-tap continuous Auto-play toggle in the menu header. */
  readonly onToggleAuto?: (next: boolean) => void;
  /** Whether evening Wind-down mode is currently active (`mode === "wind-down"` or `windDown === true`). */
  readonly windDown?: boolean;
  /** One-tap Wind-down toggle in the menu header. */
  readonly onToggleWindDown?: (next: boolean) => void;
  /** Starts a standalone lullaby or sing-along song stage scene. */
  readonly onSelectSong?: (songId: SongId) => void;
  /** Starts the continuous 11-song hushed Lullaby Jukebox. */
  readonly onPlayAllLullabies?: () => void;
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
  /** Initial category tab ("all" by default). */
  readonly initialCategory?: MenuCategoryValue;
}

const SECTIONS: readonly { readonly kind: MenuItem["kind"]; readonly key: UiStringKey }[] = [
  { kind: "episode", key: "ui.menu.episodes" },
  { kind: "activity", key: "ui.menu.activities" }
];

export const SONG_WORLDS: Readonly<Record<SongId, { readonly world: WorldId; readonly host: CharacterId }>> = {
  hello: { world: "meadow", host: "momo" },
  allDone: { world: "home-nook", host: "momo" },
  ballRolls: { world: "meadow", host: "momo" },
  goStop: { world: "music-garden", host: "lulu" },
  faceSong: { world: "home-nook", host: "peeko" },
  peekaboo: { world: "peekaboo-barn", host: "peeko" },
  animalBand: { world: "peekaboo-barn", host: "sheru" },
  countToThree: { world: "learning-cloud", host: "lumi" },
  bubbleSong: { world: "meadow", host: "lulu" },
  birthday: { world: "home-nook", host: "momo" },
  colours: { world: "learning-cloud", host: "lumi" },
  shapes: { world: "home-nook", host: "momo" },
  trainSong: { world: "station", host: "gogo" },
  routine: { world: "home-nook", host: "momo" },
  abc: { world: "learning-cloud", host: "lumi" },
  lullaby: { world: "moonlit-nursery", host: "momo" },
  twinkleRest: { world: "starlight-cloud", host: "lumi" },
  rockingCradle: { world: "moonlit-nursery", host: "momo" },
  sleepyClouds: { world: "starlight-cloud", host: "lulu" },
  teddyGoodnight: { world: "moonlit-nursery", host: "sheru" },
  countingSheepSong: { world: "starlight-cloud", host: "peeko" },
  warmBlanketSong: { world: "moonlit-nursery", host: "momo" },
  cricketHush: { world: "music-garden", host: "lulu" },
  dreamBoatSong: { world: "starlight-cloud", host: "gogo" },
  moonMusicBox: { world: "moonlit-nursery", host: "momo" },
  starlightHum: { world: "starlight-cloud", host: "lumi" }
};

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

interface CategoryPillEntry {
  readonly value: MenuCategoryValue;
  readonly button: HTMLButtonElement;
}

interface CardCellEntry {
  readonly world: WorldId;
  readonly isSleep: boolean;
  readonly kind: MenuItem["kind"];
  readonly cell: HTMLLIElement;
}

interface SongCellEntry {
  readonly world: WorldId;
  readonly isSleep: boolean;
  readonly cell: HTMLLIElement;
}

interface SectionEntry {
  readonly kind: MenuItem["kind"];
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
  const enterFsLabel = uiText(locale, "ui.fullscreen.enter");
  const exitFsLabel = uiText(locale, "ui.fullscreen.exit");
  const iosFsStrings: IosFullscreenStrings = {
    swipe: uiText(locale, "ui.fullscreen.iosSwipe"),
    home: uiText(locale, "ui.fullscreen.iosHome"),
    close: uiText(locale, "ui.fullscreen.iosClose")
  };
  const fullscreenBtn = canFullscreenControl(doc)
    ? iconButton(doc, "fullscreen", enterFsLabel, {
        "data-control": "fullscreen",
        "aria-pressed": "false"
      })
    : null;
  const syncMenuFullscreen = (): void => {
    if (!fullscreenBtn) return;
    const active = isEffectiveFullscreen(doc);
    const label = active ? exitFsLabel : enterFsLabel;
    fullscreenBtn.textContent = "";
    fullscreenBtn.appendChild(icon(doc, active ? "exitFullscreen" : "fullscreen"));
    fullscreenBtn.setAttribute("aria-label", label);
    fullscreenBtn.setAttribute("aria-pressed", String(active));
    fullscreenBtn.classList.toggle("is-active", active);
    fullscreenBtn.title = label;
    fullscreenBtn.dataset["fullscreen"] = String(active);
  };
  syncMenuFullscreen();
  const unwatchFullscreen = fullscreenBtn ? watchFullscreen(doc, () => syncMenuFullscreen()) : () => {};
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      void toggleFullscreenControl(doc, screen, iosFsStrings).then(() => syncMenuFullscreen());
    });
  }
  if (options.onToggleWindDown || options.onToggleAuto || fullscreenBtn || options.onParent) {
    const hasActionGroup = Boolean(options.onToggleWindDown || options.onToggleAuto || fullscreenBtn);
    const actions = hasActionGroup ? el(doc, "div", { className: "ww-menu-actions" }) : header;
    if (options.onToggleWindDown) {
      const onToggleWindDown = options.onToggleWindDown;
      let windDownOn = options.windDown === true;
      const windBtn = el(
        doc,
        "button",
        {
          className: "ww-pill-button ww-wind-down-toggle",
          attrs: { type: "button", "data-control": "wind-down", "aria-pressed": String(windDownOn) }
        },
        [icon(doc, "moon"), el(doc, "span", { text: uiText(locale, "ui.mode.windDown") })]
      );
      const syncWind = (): void => {
        windBtn.classList.toggle("is-active", windDownOn);
        windBtn.setAttribute("aria-pressed", String(windDownOn));
        windBtn.dataset["windDown"] = String(windDownOn);
      };
      syncWind();
      windBtn.addEventListener("click", () => {
        windDownOn = !windDownOn;
        syncWind();
        onToggleWindDown(windDownOn);
      });
      actions.appendChild(windBtn);
    }
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
    if (fullscreenBtn) {
      actions.appendChild(fullscreenBtn);
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

  let activeCategory: MenuCategoryValue = options.initialCategory ?? "all";
  let activeWorld: WorldFilterValue = options.initialWorld ?? "all";

  // Category filter strip ("All", "Sleep & lullabies", "Songs", "Stories", "Games").
  const categoryBar = el(doc, "div", {
    className: "ww-category-tabs",
    attrs: { role: "toolbar", "aria-label": "Filter by category", "data-ui": "category-filter" }
  });
  const categoryPills: CategoryPillEntry[] = [];
  const categoryDefs: readonly { readonly value: MenuCategoryValue; readonly label: string; readonly iconName?: "moon" | "music" }[] = [
    { value: "all", label: uiText(locale, "ui.menu.all") },
    { value: "sleep", label: uiText(locale, "ui.menu.sleep"), iconName: "moon" },
    { value: "songs", label: uiText(locale, "ui.menu.songs"), iconName: "music" },
    { value: "episodes", label: uiText(locale, "ui.menu.episodes") },
    { value: "activities", label: uiText(locale, "ui.menu.activities") }
  ];

  // World filter strip ("All" + 8 worlds) with roving tabindex.
  const filterBar = el(doc, "div", {
    className: "ww-world-filter",
    attrs: { role: "toolbar", "aria-label": "Filter by world", "data-ui": "world-filter" }
  });
  const filterPills: FilterPillEntry[] = [];
  const filterDefs: readonly { readonly value: WorldFilterValue; readonly label: string; readonly dot?: string; readonly bg?: string }[] = [
    { value: "all", label: uiText(locale, "ui.menu.all") },
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
  const songCellEntries: SongCellEntry[] = [];
  let songsHeaderRow: HTMLElement | null = null;
  let songsGrid: HTMLUListElement | null = null;

  const syncFilters = (): void => {
    for (const entry of categoryPills) {
      const active = entry.value === activeCategory;
      entry.button.classList.toggle("is-active", active);
      entry.button.setAttribute("aria-pressed", String(active));
      entry.button.setAttribute("tabindex", active ? "0" : "-1");
    }
    for (const entry of filterPills) {
      const active = entry.value === activeWorld;
      entry.button.classList.toggle("is-active", active);
      entry.button.setAttribute("aria-pressed", String(active));
      entry.button.setAttribute("tabindex", active ? "0" : "-1");
    }
    for (const sectionEntry of sectionEntries) {
      const kindAllowed =
        activeCategory === "all" ||
        activeCategory === "sleep" ||
        (activeCategory === "episodes" && sectionEntry.kind === "episode") ||
        (activeCategory === "activities" && sectionEntry.kind === "activity");
      let visibleCount = 0;
      for (const cellEntry of sectionEntry.cells) {
        const worldMatch = activeWorld === "all" || cellEntry.world === activeWorld;
        const categoryMatch = kindAllowed && (activeCategory !== "sleep" || cellEntry.isSleep);
        const match = worldMatch && categoryMatch;
        cellEntry.cell.hidden = !match;
        if (match) visibleCount += 1;
      }
      const hideSection = visibleCount === 0;
      sectionEntry.heading.hidden = hideSection;
      sectionEntry.grid.hidden = hideSection;
    }
    if (songsHeaderRow && songsGrid) {
      const songsAllowed = activeCategory === "all" || activeCategory === "sleep" || activeCategory === "songs";
      let visibleSongs = 0;
      for (const songEntry of songCellEntries) {
        const worldMatch = activeWorld === "all" || songEntry.world === activeWorld;
        const sleepMatch = activeCategory !== "sleep" || songEntry.isSleep;
        const match = songsAllowed && worldMatch && sleepMatch;
        songEntry.cell.hidden = !match;
        if (match) visibleSongs += 1;
      }
      const hideSongs = visibleSongs === 0;
      songsHeaderRow.hidden = hideSongs;
      songsGrid.hidden = hideSongs;
    }
  };

  for (const def of categoryDefs) {
    const children: Node[] = [];
    if (def.iconName) children.push(icon(doc, def.iconName));
    children.push(el(doc, "span", { text: def.label }));
    const btn = el(
      doc,
      "button",
      {
        className: "ww-category-pill",
        attrs: {
          type: "button",
          "data-category": def.value,
          "aria-pressed": String(def.value === activeCategory),
          tabindex: def.value === activeCategory ? "0" : "-1"
        }
      },
      children
    );
    btn.addEventListener("click", () => {
      activeCategory = def.value;
      syncFilters();
    });
    categoryPills.push({ value: def.value, button: btn });
    categoryBar.appendChild(btn);
  }

  categoryBar.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const currentIndex = categoryPills.findIndex((entry) => entry.button === event.target);
    if (currentIndex < 0 || categoryPills.length === 0) return;
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = categoryPills.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % categoryPills.length;
    else nextIndex = (currentIndex - 1 + categoryPills.length) % categoryPills.length;
    const target = categoryPills[nextIndex];
    if (!target) return;
    event.preventDefault();
    activeCategory = target.value;
    syncFilters();
    target.button.focus();
  });

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
      activeWorld = def.value;
      syncFilters();
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
    activeWorld = target.value;
    syncFilters();
    target.button.focus();
  });

  if (items.length > 0) {
    inner.append(categoryBar, filterBar);
  }

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
      const isSleep = Boolean((item.sleepCategory ?? spec?.sleepCategory) === "bedtime" || item.id === "momos-day");
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
      if (isSleep) cardAttrs["data-sleep"] = "true";
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
      cellEntries.push({ world, isSleep, kind: item.kind, cell });
      grid.appendChild(cell);
    }

    sectionEntries.push({ kind: section.kind, heading, grid, cells: cellEntries });
    inner.append(heading, grid);
  }

  // Lullabies & Songs Jukebox Shelf (uses `.ww-song-card` so `.ww-card` remains strictly story cards).
  if (items.length > 0) {
    const songsHeadingId = uniqueId("ww-menu-songs");
    const songsHeading = el(doc, "h2", {
      className: "ww-menu-heading",
      text: uiText(locale, "ui.menu.songs"),
      attrs: { id: songsHeadingId }
    });
    const playLullabiesBtn = el(
      doc,
      "button",
      {
        className: "ww-pill-button ww-lullaby-jukebox-btn",
        attrs: { type: "button", "data-action": "play-lullabies" }
      },
      [icon(doc, "moon"), el(doc, "span", { text: uiText(locale, "ui.menu.playLullabies") })]
    );
    playLullabiesBtn.addEventListener("click", () => {
      if (picked || !options.onPlayAllLullabies) return;
      picked = true;
      try {
        options.onPlayAllLullabies();
      } catch (error) {
        picked = false;
        throw error;
      }
    });
    songsHeaderRow = el(doc, "div", { className: "ww-songs-header" }, [songsHeading, playLullabiesBtn]);
    songsGrid = el(doc, "ul", { className: "ww-menu-grid ww-songs-grid", attrs: { "aria-labelledby": songsHeadingId } });

    // List the 11 sleep lullabies first, then the 15 daytime songs.
    const orderedSongs: readonly SongId[] = [
      ...SLEEP_SONG_IDS,
      ...SONG_IDS.filter((id) => !SLEEP_SONG_IDS.includes(id))
    ];
    for (const songId of orderedSongs) {
      const song = SONGS[songId];
      const mapping = SONG_WORLDS[songId];
      const isSleep = song.sleep === true;
      const sec = songLengthSec(song);
      const badgeIcon = isSleep ? "moon" : "music";
      const kindLabel = song.vocal === "instrumental" ? "Instrumental" : isSleep ? "Lullaby" : speakerName(mapping.host, locale);
      const songCard = el(
        doc,
        "button",
        {
          className: "ww-song-card",
          attrs: {
            type: "button",
            "data-song-id": songId,
            "data-world": mapping.world,
            "data-sleep": String(isSleep)
          }
        },
        [
          el(doc, "span", { className: "ww-card-scene", attrs: { "aria-hidden": "true" } }, [
            createWorldSceneSvg(doc, mapping.world),
            el(doc, "span", { className: "ww-card-world-tag", text: WORLD_THEMES[mapping.world].shortLabel })
          ]),
          el(doc, "span", { className: "ww-card-body" }, [
            el(doc, "span", { className: "ww-song-badge", attrs: { "aria-hidden": "true" } }, [icon(doc, badgeIcon)]),
            el(doc, "span", { className: "ww-card-text" }, [
              el(doc, "span", { className: "ww-card-title", text: storyText(locale, song.titleKey, humanizeId(songId)) }),
              el(doc, "span", { className: "ww-card-meta" }, [
                el(doc, "span", { className: "ww-card-host", text: kindLabel }),
                el(doc, "span", { className: "ww-card-duration ww-chip-tnum", text: `${sec} s`, attrs: { "aria-hidden": "true" } })
              ])
            ])
          ])
        ]
      );
      songCard.style.setProperty("--ww-dot", CHARACTER_COLOURS[mapping.host]);
      songCard.addEventListener("click", () => {
        if (picked || !options.onSelectSong) return;
        picked = true;
        try {
          options.onSelectSong(songId);
        } catch (error) {
          picked = false;
          throw error;
        }
      });
      const cell = el(doc, "li", { className: "ww-song-cell" }, [songCard]);
      songCellEntries.push({ world: mapping.world, isSleep, cell });
      songsGrid.appendChild(cell);
    }
    inner.append(songsHeaderRow, songsGrid);
  }

  syncFilters();

  screen.appendChild(inner);
  root.appendChild(screen);
  // The menu covers the whole overlay: whatever sits behind it (corner
  // controls, captions) leaves the tab order until the menu goes away.
  const restoreInert = inertOthers(root, screen);
  const removeArrows = enableGridNavigation(screen, ".ww-card, .ww-song-card");
  // Like a page change: focus the heading so a screen reader announces where we are.
  title.focus({ preventScroll: true });

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    unwatchFullscreen();
    removeArrows();
    screen.remove();
    restoreInert();
  };
}
