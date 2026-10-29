// Overlay DOM paths (PRD 04 E02, E03 and E08; PRD 01 section 9; PRD 06
// QA-A01, QA-E11, QA-E12 and QA-P08), run on a small in-memory DOM because the
// unit tests run in node with no browser: the parent panel's sound-effect
// level, language row and reset, the captions when sound is unavailable, and
// the story menu's order and host portraits. The fake implements only what
// the UI modules touch on these paths; an unsupported selector throws.

import { describe, expect, it } from "vitest";
import { STORIES, storyCode } from "../../../src/content/catalog.js";
import type { CharacterId, ParentSettings } from "../../../src/types.js";
import { ENGLISH_ONLY, HIGH_CONTRAST_CLASS, UI_STRINGS, isCharacterId, type UiLocale } from "../../../src/ui/accessibility.js";
import { mountCaptions } from "../../../src/ui/captions.js";
import { showEpisodeMenu, type MenuItem, type PortraitMap } from "../../../src/ui/episode-menu.js";
import { PARENT_GATE_HOLD_MS, requireParent } from "../../../src/ui/parent-gate.js";
import { LOCALE_CHOICES, SFX_CHOICES, openParentPanel } from "../../../src/ui/parent-panel.js";
import { PORTRAITS } from "../../../src/ui/portraits.js";
import {
  AVAILABLE_LOCALES,
  SETTINGS_STORAGE_KEY,
  SFX_VOLUMES,
  defaultSettings,
  loadSettings,
  saveSettings,
  type SettingsStorage
} from "../../../src/ui/settings-store.js";

// ---------------------------------------------------------------- a small in-memory DOM

type Listener = (event: FakeEvent) => void;

class FakeEvent {
  defaultPrevented = false;
  target: FakeElement | null = null;
  constructor(readonly type: string, readonly timeStamp = 0) {}
  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

/** A key press or release, stamped (ms) when the key moved, as a browser stamps it however late the page handles it. */
class FakeKeyboardEvent extends FakeEvent {
  readonly repeat = false;
  constructor(type: "keydown" | "keyup", readonly key: string, timeStamp: number) {
    super(type, timeStamp);
  }
}

class FakeEventTarget {
  private readonly listeners = new Map<string, { readonly listener: Listener; readonly once: boolean }[]>();

  addEventListener(type: string, listener: Listener, options?: boolean | { readonly once?: boolean }): void {
    const list = this.listeners.get(type) ?? [];
    if (list.some((entry) => entry.listener === listener)) return;
    list.push({ listener, once: typeof options === "object" && options.once === true });
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type);
    if (list) this.listeners.set(type, list.filter((entry) => entry.listener !== listener));
  }

  protected fire(event: FakeEvent): void {
    for (const entry of [...(this.listeners.get(event.type) ?? [])]) {
      if (entry.once) this.removeEventListener(event.type, entry.listener);
      entry.listener(event);
    }
  }
}

class FakeStyle {
  private readonly props = new Map<string, string>();
  setProperty(name: string, value: string): void {
    this.props.set(name, value);
  }
  getPropertyValue(name: string): string {
    return this.props.get(name) ?? "";
  }
  removeProperty(name: string): string {
    const old = this.getPropertyValue(name);
    this.props.delete(name);
    return old;
  }
}

class FakeClassList {
  constructor(private readonly owner: FakeElement) {}
  private tokens(): string[] {
    return (this.owner.getAttribute("class") ?? "").split(/\s+/).filter((token) => token !== "");
  }
  contains(name: string): boolean {
    return this.tokens().includes(name);
  }
  add(...names: string[]): void {
    this.owner.setAttribute("class", [...new Set([...this.tokens(), ...names])].join(" "));
  }
  remove(...names: string[]): void {
    this.owner.setAttribute("class", this.tokens().filter((token) => !names.includes(token)).join(" "));
  }
  toggle(name: string, force?: boolean): boolean {
    const on = force ?? !this.contains(name);
    if (on) this.add(name);
    else this.remove(name);
    return on;
  }
}

/** Compound selectors in comma lists (`tag`, `.class`, `[attr]`, `[attr="value"]`): what the tested paths use. */
function matchesSelector(node: FakeElement, selector: string): boolean {
  return selector.split(",").some((part) => {
    const compound = part.trim();
    const pattern = /([a-z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/y;
    let index = 0;
    let ok = compound !== "";
    while (index < compound.length) {
      pattern.lastIndex = index;
      const match = pattern.exec(compound);
      if (!match) throw new Error(`fake DOM: unsupported selector "${selector}"`);
      index = pattern.lastIndex;
      const [, tag, cls, attr, value] = match;
      if (tag !== undefined) ok = ok && node.localName === tag;
      else if (cls !== undefined) ok = ok && node.classList.contains(cls);
      else if (attr !== undefined) ok = ok && (value === undefined ? node.hasAttribute(attr) : node.getAttribute(attr) === value);
    }
    return ok;
  });
}

class FakeElement extends FakeEventTarget {
  parentNode: FakeElement | null = null;
  readonly style = new FakeStyle();
  readonly classList: FakeClassList = new FakeClassList(this);
  readonly dataset: Record<string, string | undefined> = {};
  private readonly kids: FakeElement[] = [];
  private readonly attributes = new Map<string, string>();
  private ownText = "";
  private checkedState = false;

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly localName: string,
    readonly namespaceURI: string | null = null
  ) {
    super();
  }

  get children(): FakeElement[] {
    return [...this.kids];
  }

  get isConnected(): boolean {
    for (let node: FakeElement | null = this; node; node = node.parentNode) {
      if (node === this.ownerDocument.documentElement) return true;
    }
    return false;
  }

  get id(): string {
    return this.getAttribute("id") ?? "";
  }

  get className(): string {
    return this.getAttribute("class") ?? "";
  }
  set className(value: string) {
    this.setAttribute("class", value);
  }

  get hidden(): boolean {
    return this.hasAttribute("hidden");
  }
  set hidden(value: boolean) {
    this.toggleAttribute("hidden", value);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value);
  }

  get lang(): string {
    return this.getAttribute("lang") ?? "";
  }
  set lang(value: string) {
    this.setAttribute("lang", value);
  }

  /** Checking a radio unchecks the others of its group, as in a browser. */
  get checked(): boolean {
    return this.checkedState;
  }
  set checked(value: boolean) {
    this.checkedState = value;
    const name = this.getAttribute("name");
    if (!value || this.getAttribute("type") !== "radio" || name === null) return;
    let top: FakeElement = this;
    while (top.parentNode) top = top.parentNode;
    for (const other of descendants(top)) {
      if (other !== this && other.getAttribute("type") === "radio" && other.getAttribute("name") === name) other.checkedState = false;
    }
  }

  get textContent(): string {
    return this.ownText + this.kids.map((kid) => kid.textContent).join("");
  }
  set textContent(value: string) {
    for (const kid of this.kids) kid.parentNode = null;
    this.kids.length = 0;
    this.ownText = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  toggleAttribute(name: string, force: boolean): void {
    if (force) this.setAttribute(name, "");
    else this.removeAttribute(name);
  }

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parentNode = this;
    this.kids.push(child);
    return child;
  }
  append(...children: FakeElement[]): void {
    for (const child of children) this.appendChild(child);
  }
  remove(): void {
    const parent = this.parentNode;
    if (!parent) return;
    parent.kids.splice(parent.kids.indexOf(this), 1);
    this.parentNode = null;
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  /** Fires on this element, then bubbles to its ancestors. */
  dispatchEvent(event: FakeEvent): boolean {
    event.target = this;
    for (let node: FakeElement | null = this; node; node = node.parentNode) node.fire(event);
    return !event.defaultPrevented;
  }

  matches(selector: string): boolean {
    return matchesSelector(this, selector);
  }
  closest(selector: string): FakeElement | null {
    for (let node: FakeElement | null = this; node; node = node.parentNode) if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return descendants(this).filter((node) => node.matches(selector));
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return root.children.flatMap((child) => [child, ...descendants(child)]);
}

interface FakeWindow {
  readonly HTMLElement: typeof FakeElement;
  readonly Node: typeof FakeElement;
  matchMedia(query: string): { readonly matches: boolean; readonly media: string };
}

class FakeDocument extends FakeEventTarget {
  activeElement: FakeElement | null = null;
  readonly documentElement: FakeElement;
  readonly body: FakeElement;

  constructor(readonly defaultView: FakeWindow | null) {
    super();
    this.documentElement = new FakeElement(this, "html");
    this.body = new FakeElement(this, "body");
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(this, tag.toLowerCase());
  }
  createElementNS(namespace: string, tag: string): FakeElement {
    return new FakeElement(this, tag, namespace);
  }
  /** A text node: an element with only its own text, which no selector here matches. */
  createTextNode(text: string): FakeElement {
    const node = new FakeElement(this, "#text");
    node.textContent = text;
    return node;
  }
}

/** A document whose window matches exactly the given media queries, with the `#ui` overlay root in its body. */
function setup(media: readonly string[] = []): { readonly doc: FakeDocument; readonly root: FakeElement } {
  const doc = new FakeDocument({
    HTMLElement: FakeElement,
    Node: FakeElement,
    matchMedia: (query: string) => ({ matches: media.includes(query), media: query })
  });
  const root = doc.createElement("div");
  root.setAttribute("id", "ui");
  doc.body.appendChild(root);
  return { doc, root };
}

/** The UI modules take an HTMLElement; they reach only the members the fake implements. */
function asHtml(node: FakeElement): HTMLElement {
  return node as unknown as HTMLElement;
}

function find(root: FakeElement, test: (node: FakeElement) => boolean): FakeElement[] {
  return descendants(root).filter(test);
}

function only(list: readonly FakeElement[]): FakeElement {
  expect(list).toHaveLength(1);
  return list[0];
}

function byAttr(root: FakeElement, name: string, value?: string): FakeElement[] {
  return find(root, (node) => (value === undefined ? node.hasAttribute(name) : node.getAttribute(name) === value));
}

function byClass(root: FakeElement, name: string): FakeElement[] {
  return find(root, (node) => node.classList.contains(name));
}

/** What a tap on a radio or checkbox does: it becomes checked and reports a change. */
function choose(input: FakeElement): void {
  input.checked = true;
  input.dispatchEvent(new FakeEvent("change"));
}

function tap(node: FakeElement): void {
  node.dispatchEvent(new FakeEvent("click"));
}

class MemoryStorage implements SettingsStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

// ---------------------------------------------------------------- parent panel

interface OpenPanel {
  readonly doc: FakeDocument;
  readonly root: FakeElement;
  readonly storage: MemoryStorage;
  readonly changes: ParentSettings[];
  readonly close: () => void;
}

/** Opens the panel wired like the app shell: every change is saved through the settings store. */
function openPanel(settings: ParentSettings = defaultSettings(), media: readonly string[] = []): OpenPanel {
  const { doc, root } = setup(media);
  const storage = new MemoryStorage();
  const changes: ParentSettings[] = [];
  const close = openParentPanel(
    asHtml(root),
    ENGLISH_ONLY,
    settings,
    (next) => {
      changes.push(next);
      saveSettings(storage, next);
    },
    () => {},
    { storage }
  );
  return { doc, root, storage, changes, close };
}

function sfxInputs(root: FakeElement): FakeElement[] {
  return byAttr(root, "data-sfx-volume");
}

describe("parent gate (PRD 04 E04; 06 QA-A08)", () => {
  const holdButton = (root: FakeElement): FakeElement => only(byAttr(root, "data-action", "hold"));

  it("opens after a 2 s key hold measured by the key events' own times, even when the page never ran its timer", async () => {
    const { root } = setup();
    const answer = requireParent(asHtml(root), ENGLISH_ONLY);
    const hold = holdButton(root);
    hold.dispatchEvent(new FakeKeyboardEvent("keydown", "Enter", 1_000));
    // A busy page handles the release straight after the press: no timer has had a turn in between.
    hold.dispatchEvent(new FakeKeyboardEvent("keyup", "Enter", 1_000 + PARENT_GATE_HOLD_MS + 100));
    await expect(answer).resolves.toBe(true);
    expect(byAttr(root, "data-ui", "parent-gate")).toHaveLength(0);
  });

  it("resets on an early release and stays up until the grown-up holds again or backs out", async () => {
    const { root } = setup();
    const answer = requireParent(asHtml(root), ENGLISH_ONLY);
    const hold = holdButton(root);
    hold.dispatchEvent(new FakeKeyboardEvent("keydown", "Enter", 1_000));
    hold.dispatchEvent(new FakeKeyboardEvent("keyup", "Enter", 1_000 + PARENT_GATE_HOLD_MS - 500));
    expect(byAttr(root, "data-ui", "parent-gate")).toHaveLength(1);
    tap(only(byAttr(root, "data-action", "cancel")));
    await expect(answer).resolves.toBe(false);
  });
});

describe("parent panel: sound-effect level (PRD 01 section 9; 07 B20)", () => {
  it("lists off, soft and normal, the levels the settings store keeps", () => {
    expect(SFX_CHOICES.map((choice) => choice.level)).toEqual([...SFX_VOLUMES]);
    expect(SFX_CHOICES.map((choice) => UI_STRINGS[choice.key])).toEqual(["Off", "Soft", "Normal"]);
  });

  it("is one labelled radio group with a described purpose, normal by default, right after the sound switches", () => {
    const { root, close } = openPanel();
    const field = only(byAttr(root, "data-setting", "sfxVolume"));
    expect(field.localName).toBe("fieldset");
    expect(only(find(field, (node) => node.localName === "legend")).textContent).toBe("Sound effects");
    const helpId = field.getAttribute("aria-describedby") ?? "";
    expect(helpId).not.toBe("");
    expect(only(find(root, (node) => node.id === helpId)).textContent).toBe(UI_STRINGS["ui.parent.sfxHelp"]);

    const inputs = sfxInputs(root);
    expect(inputs.map((input) => input.getAttribute("data-sfx-volume"))).toEqual(["off", "soft", "normal"]);
    expect(inputs.every((input) => input.getAttribute("type") === "radio")).toBe(true);
    expect(new Set(inputs.map((input) => input.getAttribute("name"))).size).toBe(1);
    // Each radio sits in a label that names it, so a screen reader reads "Soft, radio button, 2 of 3".
    expect(inputs.map((input) => (input.parentNode?.localName === "label" ? input.parentNode.textContent : null))).toEqual([
      "Off",
      "Soft",
      "Normal"
    ]);
    expect(inputs.map((input) => input.checked)).toEqual([false, false, true]);
    expect(inputs.some((input) => input.disabled)).toBe(false);

    const form = only(find(root, (node) => node.localName === "form"));
    const sections = form.children;
    const switches = only(sections.filter((node) => node.textContent.startsWith(UI_STRINGS["ui.parent.display"])));
    expect(sections.indexOf(field)).toBe(sections.indexOf(switches) + 1);
    close();
  });

  it("reports a pick at once, changes nothing else, and the settings store keeps it", () => {
    const { root, storage, changes, close } = openPanel();
    const [off, soft] = sfxInputs(root);
    choose(soft);
    expect(changes).toEqual([{ ...defaultSettings(), sfxVolume: "soft" }]);
    expect(loadSettings(storage).sfxVolume).toBe("soft");
    choose(off);
    expect(changes.at(-1)).toEqual({ ...defaultSettings(), sfxVolume: "off" });
    expect(loadSettings(storage).sfxVolume).toBe("off");
    expect(sfxInputs(root).map((input) => input.checked)).toEqual([true, false, false]);
    close();
  });

  it("opens on the saved level", () => {
    const { root, changes, close } = openPanel({ ...defaultSettings(), sfxVolume: "soft" });
    expect(sfxInputs(root).map((input) => input.checked)).toEqual([false, true, false]);
    expect(changes).toEqual([]);
    close();
    expect(byAttr(root, "data-ui", "parent-panel")).toEqual([]);
  });
});

describe("parent panel: language (07 B16; 06 QA-E11)", () => {
  it("names only enabled packs: the Punjabi pack is not listed", () => {
    // English alone, so the panel shows it as text; a second enabled pack also needs a language choice in the panel.
    expect(LOCALE_CHOICES.map((choice) => choice.code)).toEqual(["en"]);
    expect(LOCALE_CHOICES.filter((choice) => !AVAILABLE_LOCALES.includes(choice.code))).toEqual([]);
  });

  it("states the one language as plain text instead of a choice of one", () => {
    const { root, close } = openPanel();
    const row = only(byAttr(root, "data-setting", "locale"));
    expect(row.localName).toBe("dl");
    expect(find(row, (node) => node.localName === "input")).toEqual([]);
    expect(only(find(row, (node) => node.localName === "dt")).textContent).toBe("Language");
    const value = only(find(row, (node) => node.localName === "dd"));
    expect(value.textContent).toBe("English");
    expect(value.getAttribute("lang")).toBe("en");
    expect(byAttr(root, "data-locale")).toEqual([]);
    expect(root.textContent).not.toMatch(/Punjabi|ਪੰਜਾਬੀ|not available yet/);
    close();
  });
});

describe("parent panel: Clear settings", () => {
  it("returns to the defaults, sound effects normal, seeded from the device's contrast and motion preferences", () => {
    const chosen: ParentSettings = { ...defaultSettings(), sfxVolume: "off", highContrast: false, reducedMotion: false, music: false };
    const { doc, root, storage, changes, close } = openPanel(chosen, ["(prefers-contrast: more)"]);
    expect(doc.documentElement.classList.contains(HIGH_CONTRAST_CLASS)).toBe(false);

    tap(only(byAttr(root, "data-action", "clear")));
    expect(changes.at(-1)).toEqual(defaultSettings(false, true));
    expect(doc.documentElement.classList.contains(HIGH_CONTRAST_CLASS)).toBe(true);
    expect(only(byAttr(root, "data-setting", "highContrast")).checked).toBe(true);
    expect(only(byAttr(root, "data-setting", "music")).checked).toBe(true);
    expect(sfxInputs(root).map((input) => input.checked)).toEqual([false, false, true]);
    // The stored record is removed; the next start seeds the defaults again.
    expect(storage.data.has(SETTINGS_STORAGE_KEY)).toBe(false);
    close();
  });

  it("without a contrast preference, leaves high contrast off", () => {
    const { root, changes, close } = openPanel({ ...defaultSettings(), highContrast: true }, ["(prefers-reduced-motion: reduce)"]);
    tap(only(byAttr(root, "data-action", "clear")));
    expect(changes.at(-1)).toEqual(defaultSettings(true, false));
    close();
  });
});

// ---------------------------------------------------------------- captions

describe("captions when sound is unavailable (PRD 01 section 9; 06 QA-A01)", () => {
  function parts(root: FakeElement): { box: FakeElement; notice: FakeElement; line: FakeElement; text: FakeElement; tip: FakeElement } {
    const box = only(byAttr(root, "data-ui", "captions"));
    return {
      box,
      notice: only(byClass(box, "ww-caption-notice")),
      line: only(byClass(box, "ww-caption-line")),
      text: only(byClass(box, "ww-caption-text")),
      tip: only(byClass(box, "ww-caption-tip"))
    };
  }

  it("are forced on with the grown-up notice, even when the captions setting is off", () => {
    const { root } = setup();
    const captions = mountCaptions(asHtml(root), ENGLISH_ONLY);
    const { notice, line, text, tip } = parts(root);

    // Sound works and the grown-up turned captions off: the line is hidden and silent, and there is no notice.
    captions.setEnabled(false);
    captions.show("momo", "Ball! A ball.");
    captions.setTip("Point to the ball.");
    expect(line.classList.contains("is-hidden")).toBe(true);
    expect(line.getAttribute("aria-live")).toBe("off");
    expect(tip.hidden).toBe(true);
    expect(notice.hidden).toBe(true);

    // Sound becomes unavailable: the story reads on in captions, and the notice says why.
    captions.setAudioUnavailable(true);
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe(UI_STRINGS["ui.audio.unavailable"]);
    expect(line.classList.contains("is-hidden")).toBe(false);
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(text.textContent).toBe("Ball! A ball.");
    expect(line.dataset["speaker"]).toBe("momo");
    expect(tip.hidden).toBe(false);

    // Later lines keep showing while sound stays unavailable.
    captions.show("narrator", "The ball rolls.");
    expect(text.textContent).toBe("The ball rolls.");
    expect(line.classList.contains("is-hidden")).toBe(false);

    // Sound is back: the grown-up's setting applies again.
    captions.setAudioUnavailable(false);
    expect(notice.hidden).toBe(true);
    expect(line.classList.contains("is-hidden")).toBe(true);
    expect(line.getAttribute("aria-live")).toBe("off");
    expect(tip.hidden).toBe(true);

    captions.dispose();
    expect(byAttr(root, "data-ui", "captions")).toEqual([]);
  });

  it("keep the notice between lines and use the locale pack's notice text", () => {
    const { root } = setup();
    const pack: UiLocale = {
      str: (key, fallback) => (key === "ui.audio.unavailable" ? "No sound right now. The words are shown here." : fallback ?? key)
    };
    const captions = mountCaptions(asHtml(root), pack);
    const { notice, line } = parts(root);
    expect(notice.hidden).toBe(true);
    captions.setAudioUnavailable(true);
    captions.clear();
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe("No sound right now. The words are shown here.");
    // An empty line is only visually hidden; it stays a polite live region for the next line.
    expect(line.classList.contains("is-hidden")).toBe(true);
    expect(line.getAttribute("aria-live")).toBe("polite");
    captions.dispose();
  });
});

// ---------------------------------------------------------------- story menu

/** The menu items the app shell builds from the catalog (src/app.ts MENU_ITEMS), with each story's phase. */
function catalogItems(): MenuItem[] {
  return STORIES.map((story) => ({
    id: story.id,
    code: storyCode(story),
    titleKey: story.titleKey,
    kind: story.kind,
    host: story.host,
    number: story.number,
    phase: story.phase
  }));
}

const HOSTS: ReadonlyMap<string, CharacterId> = new Map(catalogItems().map((item) => [item.id, item.host]));

function hostOf(card: FakeElement): CharacterId | undefined {
  return HOSTS.get(card.getAttribute("data-story-id") ?? "");
}

function showMenu(portraits?: PortraitMap): { readonly root: FakeElement; readonly cards: FakeElement[]; readonly remove: () => void } {
  const { root } = setup();
  const remove = showEpisodeMenu(asHtml(root), ENGLISH_ONLY, catalogItems(), () => {}, portraits === undefined ? {} : { portraits });
  return { root, cards: byClass(root, "ww-card"), remove };
}

describe("story menu (PRD 04 E02)", () => {
  it("lists the P1 pilot stories first in each section, then P2, with the canonical numbers on the cards", () => {
    const { cards, remove } = showMenu({});
    expect(cards).toHaveLength(STORIES.length);
    expect(new Set(cards.map((card) => card.getAttribute("data-story-id"))).size).toBe(STORIES.length);
    const codes = (kind: string): (string | null)[] =>
      cards.filter((card) => card.getAttribute("data-kind") === kind).map((card) => card.getAttribute("data-code"));
    expect(codes("episode")).toEqual([
      "e01", "e02", "e05", "e06", "e09", "e17",
      "e03", "e04", "e07", "e08", "e10", "e11", "e12", "e13", "e14", "e15", "e16", "e18", "e19", "e20"
    ]);
    expect(codes("activity")).toEqual(["g01", "g02", "g03", "g04", "g05", "g06", "g07", "g08", "g09", "g10", "g11", "g12"]);
    for (const card of cards) {
      const badge = only(byClass(card, "ww-card-badge"));
      expect(badge.textContent).toBe(String(Number((card.getAttribute("data-code") ?? "").slice(1))));
      expect(badge.getAttribute("aria-hidden")).toBe("true");
    }
    remove();
  });

  it("shows a host's portrait when there is one: decorative, the number kept, the host still named in text", () => {
    const portraits: PortraitMap = { sheru: "/assets/portraits/sheru.webp", lulu: "/assets/portraits/lulu.webp" };
    const { cards, remove } = showMenu(portraits);
    const withPortrait = cards.filter((card) => {
      const host = hostOf(card);
      return host === "sheru" || host === "lulu";
    });
    expect(withPortrait.length).toBeGreaterThan(0);
    for (const card of withPortrait) {
      const host = hostOf(card) ?? "momo";
      const badge = only(byClass(card, "ww-card-badge"));
      expect(badge.classList.contains("has-portrait")).toBe(true);
      expect(badge.getAttribute("aria-hidden")).toBe("true");
      const image = only(find(badge, (node) => node.localName === "img"));
      expect(image.getAttribute("src")).toBe(portraits[host]);
      expect(image.getAttribute("alt")).toBe("");
      expect(image.classList.contains("ww-card-portrait")).toBe(true);
      expect(only(byClass(badge, "ww-card-number")).textContent).toBe(String(Number((card.getAttribute("data-code") ?? "").slice(1))));
      expect(only(byClass(card, "ww-card-host")).textContent).toBe(host === "sheru" ? "Sheru" : "Lulu");
    }
    // Every other host keeps the plain colour badge with its number.
    for (const card of cards.filter((entry) => !withPortrait.includes(entry))) {
      const badge = only(byClass(card, "ww-card-badge"));
      expect(badge.classList.contains("has-portrait")).toBe(false);
      expect(find(card, (node) => node.localName === "img")).toEqual([]);
      expect(badge.textContent).toBe(String(Number((card.getAttribute("data-code") ?? "").slice(1))));
    }
    remove();
  });

  it("gives the number badge back when a portrait cannot load", () => {
    const { cards, remove } = showMenu({ momo: "/assets/portraits/momo.webp" });
    const card = cards.find((entry) => hostOf(entry) === "momo");
    expect(card).toBeDefined();
    if (!card) return;
    const badge = only(byClass(card, "ww-card-badge"));
    only(find(badge, (node) => node.localName === "img")).dispatchEvent(new FakeEvent("error"));
    expect(badge.classList.contains("has-portrait")).toBe(false);
    expect(find(badge, (node) => node.localName === "img")).toEqual([]);
    expect(badge.textContent).toBe(String(Number((card.getAttribute("data-code") ?? "").slice(1))));
    remove();
  });

  it("reads PORTRAITS by default: same-origin paths keyed by the six characters", () => {
    for (const [id, url] of Object.entries(PORTRAITS)) {
      expect(isCharacterId(id), id).toBe(true);
      expect(url, id).toMatch(/^\/[^/]/);
    }
    const { cards, remove } = showMenu();
    for (const card of cards) {
      const host = hostOf(card) ?? "momo";
      const images = find(card, (node) => node.localName === "img");
      expect(images.map((image) => image.getAttribute("src")), card.getAttribute("data-code") ?? "").toEqual(
        PORTRAITS[host] === undefined ? [] : [PORTRAITS[host]]
      );
    }
    remove();
  });

  it("still picks the story with one tap on a card", () => {
    const { root } = setup();
    const picked: string[] = [];
    const remove = showEpisodeMenu(asHtml(root), ENGLISH_ONLY, catalogItems(), (id) => picked.push(id), {
      portraits: { sheru: "/assets/portraits/sheru.webp" }
    });
    const card = only(byAttr(root, "data-code", "e17"));
    tap(card);
    tap(card);
    expect(picked).toEqual([card.getAttribute("data-story-id")]);
    remove();
    expect(byAttr(root, "data-ui", "menu")).toEqual([]);
  });
});
