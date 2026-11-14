/// <reference types="node" />
// J07 no child data (PRD 04 J07; PRD 01 section 8; PRD 03 section 8; PRD 06
// G7 and QA-P01..P03, QA-P07; MASTER-PROMPT section 6 "Privacy" and "Child
// safety"). A static scan of everything the app ships (src/**, index.html and
// package.json) plus checks on the settings store and the feature flags:
//
// - no microphone, camera or speech-recognition API, and the voice flags stay
//   off whatever the URL says (P3 is out of scope and off);
// - no network call besides the app's own same-origin assets, and no external
//   URL besides two parent-facing reading links and the SVG namespace;
// - no analytics, advertising or tracking code;
// - storage holds only the parent-settings allow-list, under a key that names
//   the app, never a child;
// - no child name in titles, routes, UI text, story lines, strings, storage
//   keys or QA globals, nor anywhere in the shipped sources, but for the
//   owner's welcome (07 O8): one WELCOME_NAME constant in src/personal.ts;
// - nothing is logged.
//
// The child's name is not written in this file: it is the prefix of the app's
// working folder name (`<name>-wonder-world`), which the PRD keeps as the
// directory name only. That folder-path form is allowed; the bare name is not.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { STORIES, storyCode } from "../../../src/content/catalog.js";
import { en } from "../../../src/localization/en/index.js";
import { WELCOME_NAME } from "../../../src/personal.js";
import { QA_GLOBAL_NAME } from "../../../src/qa/install-hooks.js";
import { FEATURE_FLAGS, readFlags } from "../../../src/runtime/feature-flags.js";
import type { StageAdapter } from "../../../src/types.js";
import { UI_STRINGS } from "../../../src/ui/accessibility.js";
import { GROWN_UP_LINKS } from "../../../src/ui/parent-panel.js";
import {
  PARENT_SETTINGS_FIELDS,
  SETTINGS_STORAGE_KEY,
  defaultSettings,
  loadSettings,
  saveSettings,
  type SettingsStorage
} from "../../../src/ui/settings-store.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const srcDir = join(appRoot, "src");

interface SourceFile {
  /** App-relative path, e.g. "src/app.ts". */
  readonly rel: string;
  readonly raw: string;
  /** The text with comments blanked out (string contents kept). */
  readonly code: string;
}

/** Comments blanked the way tools/game-checks does it (a `//` after ":" or a quote is a URL, not a comment). */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m: string, p1: string) => p1 + " ".repeat(m.length - p1.length));
}

/** Every text file the app ships from src/ (binary media under src/assets/ excluded). */
function sourceFiles(dir: string = srcDir, out: SourceFile[] = []): SourceFile[] {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (path === join(srcDir, "assets")) continue;
      sourceFiles(path, out);
    } else if ([".ts", ".css", ".html", ".json", ".js", ".mjs"].includes(extname(name))) {
      const raw = readFileSync(path, "utf8");
      out.push({ rel: relative(appRoot, path).split("\\").join("/"), raw, code: stripComments(raw) });
    }
  }
  return out;
}

const SOURCES = sourceFiles();
const INDEX_HTML = readFileSync(join(appRoot, "index.html"), "utf8");
const PACKAGE_JSON: unknown = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Lines of `text` that match `pattern`. */
function hitsIn(file: string, text: string, pattern: RegExp): Hit[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const hits: Hit[] = [];
  text.split("\n").forEach((line, index) => {
    global.lastIndex = 0;
    if (global.test(line)) hits.push({ file, line: index + 1, text: line.trim().slice(0, 160) });
  });
  return hits;
}

function codeHits(pattern: RegExp, files: readonly SourceFile[] = SOURCES): Hit[] {
  return files.flatMap((file) => hitsIn(file.rel, file.code, pattern));
}

function describeHits(hits: readonly Hit[]): string {
  return hits.map((hit) => `${hit.file}:${hit.line} ${hit.text}`).join("\n");
}

// The child's name, from the working folder name `<name>-wonder-world` (see the header).
const WORKING_SUFFIX = "-wonder-world";
const appFolder = basename(appRoot);
const CHILD_NAMES: readonly string[] =
  appFolder.endsWith(WORKING_SUFFIX) && appFolder.length > WORKING_SUFFIX.length ? [appFolder.slice(0, -WORKING_SUFFIX.length)] : [];
/** The bare name as a word; the folder-path form `<name>-wonder-world` is the allowed working directory name. */
const CHILD_NAME_PATTERNS: readonly RegExp[] = CHILD_NAMES.map(
  (name) => new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9]|${WORKING_SUFFIX})`, "i")
);

function childNameIn(text: string): boolean {
  return CHILD_NAME_PATTERNS.some((pattern) => pattern.test(text));
}

describe("J07: no microphone, camera or speech input", () => {
  it("uses no microphone, camera, screen-capture or speech-recognition API anywhere in the app", () => {
    const pattern =
      /\bgetUserMedia\b|\bgetDisplayMedia\b|SpeechRecognition|webkitSpeech|\bMediaRecorder\b|\bmediaDevices\b|createMediaStreamSource|\benumerateDevices\b|\bImageCapture\b|permissions\s*\.\s*query/;
    expect(describeHits(codeHits(pattern))).toBe("");
    expect(describeHits(hitsIn("index.html", INDEX_HTML, /type=["']file["']|\bcapture=|getUserMedia/i))).toBe("");
  });

  it("keeps the voice and microphone modules off, whatever the URL says", () => {
    expect(FEATURE_FLAGS.voiceInput).toBe(false);
    expect(FEATURE_FLAGS.soundPresence).toBe(false);
    expect(FEATURE_FLAGS.familyPacks).toBe(false);
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
    for (const search of ["", "?voiceInput=1", "?voiceInput=true&soundPresence=1", "?mic=1&microphone=1&voice=1&asr=1", "?familyPacks=1&parentNotes=1"]) {
      const flags = readFlags(search);
      expect(flags.voiceInput, search).toBe(false);
      expect(flags.soundPresence, search).toBe(false);
      expect(flags.familyPacks, search).toBe(false);
      expect(Object.isFrozen(flags), search).toBe(true);
    }
  });
});

describe("J07: no network calls or tracking", () => {
  it("makes no network fetch requests at runtime", () => {
    expect(describeHits(codeHits(/\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b|\bRTCPeerConnection\b|\bnew\s+Image\s*\(/))).toBe("");
    expect(describeHits(codeHits(/\bimport\s*\(\s*["'`]https?:/))).toBe("");
    const fetchFiles = [...new Set(codeHits(/\bfetch\s*\(/).map((hit) => hit.file))];
    expect(fetchFiles).toEqual([]);
  });

  it("names every sound and portrait by a module-relative, same-origin URL", () => {
    for (const rel of ["src/audio-manifest.ts"]) {
      const file = SOURCES.find((source) => source.rel === rel);
      expect(file, rel).toBeDefined();
      const code = file?.code ?? "";
      const urls = (code.match(/\burl\s*:/g) ?? []).length;
      const local = (code.match(/\burl\s*:\s*new URL\("\.\/assets\/[^"]+", import\.meta\.url\)\.pathname/g) ?? []).length;
      expect(urls, rel).toBeGreaterThan(0);
      expect(local, rel).toBe(urls);
      expect(code, rel).not.toMatch(/https?:\/\//);
    }
    const portraits = SOURCES.find((source) => source.rel === "src/portrait-assets.ts")?.code ?? "";
    const portraitUrls = (portraits.match(/new URL\(/g) ?? []).length;
    expect(portraitUrls, "src/portrait-assets.ts").toBeGreaterThan(0);
    expect((portraits.match(/new URL\("\.\/assets\/portraits\/[a-z]+\.webp", import\.meta\.url\)\.pathname/g) ?? []).length, "src/portrait-assets.ts").toBe(portraitUrls);
    expect(portraits, "src/portrait-assets.ts").not.toMatch(/https?:\/\//);
  });

  it("resolves module-relative URLs only beside src/main.ts, where the dev server's one-module bundle resolves them too", () => {
    // The repo dev server bundles the app into one module served at src/main.ts, so `new URL("./...",
    // import.meta.url)` resolves from src/ wherever it is written; the Vite build resolves it from its own module. The
    // two agree only for modules in src/ itself.
    const files = [...new Set(codeHits(/new URL\(\s*["'`]\.{1,2}\//).map((hit) => hit.file))].sort();
    expect(files).toEqual(["src/audio-manifest.ts", "src/portrait-assets.ts"]);
  });

  it("links out only to two parent reading pages, and loads nothing from another origin", () => {
    const allowed = new Set<string>(["http://www.w3.org/2000/svg", ...GROWN_UP_LINKS.map((link) => link.href)]);
    expect(GROWN_UP_LINKS).toHaveLength(2);
    for (const link of GROWN_UP_LINKS) expect(link.href).toMatch(/^https:\/\/(publications\.aap\.org|www\.asha\.org)\//);
    const external = SOURCES.flatMap((file) => [...file.code.matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => ({ file: file.rel, url: m[0] })));
    expect(external.filter((entry) => !allowed.has(entry.url))).toEqual([]);
    // index.html loads only its own files: no external script, stylesheet, font, preconnect or prefetch.
    expect(INDEX_HTML).not.toMatch(/https?:\/\//);
    expect(INDEX_HTML).not.toMatch(/(src|href)=["']\/\//);
    expect(INDEX_HTML).toMatch(/<meta name="referrer" content="no-referrer"/);
  });

  it("contains no analytics, advertising, crash-reporting or tracking code", () => {
    const trackers =
      /google-analytics|googletagmanager|gtag\s*\(|doubleclick|googlesyndication|connect\.facebook\.net|\bfbq\s*\(|segment\.(io|com)|mixpanel|amplitude\.com|@amplitude|hotjar|sentry\.io|@sentry\/|datadoghq|\bdd-rum\b|newrelic|nr-data\.net|posthog|plausible\.io|clarity\.ms|heapanalytics|fullstory|logrocket|bugsnag|firebase|crashlytics|appsflyer|branch\.io|adjust\.com|matomo|piwik|mc\.yandex|analytics\.tiktok|intercom/i;
    expect(describeHits(codeHits(trackers))).toBe("");
    expect(describeHits(hitsIn("index.html", INDEX_HTML, trackers))).toBe("");
    const deps = (PACKAGE_JSON as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }).dependencies ?? {};
    for (const name of Object.keys(deps)) expect(name, "only Aura3D packages ship with the app").toMatch(/^@aura3d\//);
  });

  it("logs nothing, so no child data can reach a console or a log collector", () => {
    expect(describeHits(codeHits(/\bconsole\s*\.\s*\w+\s*\(|\bdebugger\b/))).toBe("");
  });

  it("asks for no payment, sharing, location or notification permission", () => {
    expect(describeHits(codeHits(/\bPaymentRequest\b|navigator\s*\.\s*share\b|\bgeolocation\b|Notification\s*\.\s*requestPermission|\bnavigator\s*\.\s*(credentials|contacts)\b/))).toBe("");
  });
});

describe("J07: storage holds parent settings only", () => {
  function memoryStorage(): SettingsStorage & { readonly items: Map<string, string> } {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
      },
      removeItem: (key) => {
        items.delete(key);
      }
    };
  }

  it("touches browser storage only in the settings store, and never cookies or databases", () => {
    const storageFiles = [...new Set(codeHits(/\blocalStorage\b|\bsessionStorage\b|\.setItem\s*\(|\.getItem\s*\(/).map((hit) => hit.file))];
    expect(storageFiles).toEqual(["src/ui/settings-store.ts"]);
    expect(describeHits(codeHits(/\bindexedDB\b|document\s*\.\s*cookie|\bcaches\s*\.|\bopenDatabase\b|\bstorage\s*\.\s*persist\b/))).toBe("");
  });

  it("uses one storage key that names the app, and an allow-list with no identity field", () => {
    expect(SETTINGS_STORAGE_KEY).toMatch(/^wonder-world\./);
    expect(childNameIn(SETTINGS_STORAGE_KEY)).toBe(false);
    expect([...PARENT_SETTINGS_FIELDS].sort()).toEqual(Object.keys(defaultSettings()).sort());
    for (const field of PARENT_SETTINGS_FIELDS) {
      expect(field, "identity-like settings field").not.toMatch(/name|child|kid|baby|age|birth|photo|image|picture|voice|record|email|phone|address|school|family|parent|user|account|profile|note/i);
    }
  });

  it("stores only the allow-listed fields, even when it is handed identity data", () => {
    const storage = memoryStorage();
    const identity = "Sam Example";
    const handed = {
      ...defaultSettings(),
      wordList: ["ball", "more", identity, "sam"],
      childName: identity,
      name: identity,
      photo: "data:image/png;base64,AAAA",
      age: 2,
      voiceSample: "data:audio/mp3;base64,AAAA"
    };
    expect(saveSettings(storage, handed)).toBe(true);
    expect([...storage.items.keys()]).toEqual([SETTINGS_STORAGE_KEY]);
    const stored = storage.items.get(SETTINGS_STORAGE_KEY) ?? "";
    const parsed: unknown = JSON.parse(stored);
    expect(Object.keys(parsed as Record<string, unknown>).sort()).toEqual([...PARENT_SETTINGS_FIELDS].sort());
    expect(stored).not.toMatch(/Sam|data:|childName|photo|voiceSample|"age"/);
    expect((parsed as { wordList: unknown }).wordList).toEqual(["ball", "more"]);
  });

  it("reads back only the allow-list from a stored record that was edited to hold identity data", () => {
    const storage = memoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ mode: "watch-sing", captions: false, childName: "Sam Example", name: "Sam", wordList: ["ball", "Sam"], age: 2 })
    );
    const settings = loadSettings(storage);
    expect(Object.keys(settings).sort()).toEqual([...PARENT_SETTINGS_FIELDS].sort());
    expect(settings.mode).toBe("watch-sing");
    expect(settings.captions).toBe(false);
    expect(settings.wordList).toEqual(["ball"]);
    expect(JSON.stringify(settings)).not.toMatch(/Sam/);
  });
});

describe("J07: no child name", () => {
  it("knows which name to look for", () => {
    // The working folder carries the name (see the header); if the folder is renamed this guard needs a new source.
    expect(CHILD_NAMES).toHaveLength(1);
    expect(CHILD_NAME_PATTERNS[0]?.test(`Hello ${CHILD_NAMES[0] ?? ""}!`)).toBe(true);
    expect(CHILD_NAME_PATTERNS[0]?.test(`apps/${appFolder}/src`)).toBe(false);
  });

  it("titles the app Wonder World, with no child name in its title, UI text or page", () => {
    expect(UI_STRINGS["ui.start.title"]).toBe("Wonder World");
    expect(en.strings["ui.start.title"]).toBe("Wonder World");
    expect(INDEX_HTML).toMatch(/<title>Wonder World \(prototype\)<\/title>/);
    expect(INDEX_HTML).toMatch(/<meta name="robots" content="noindex"/);
    expect(childNameIn(INDEX_HTML)).toBe(false);
    const ui = Object.entries(UI_STRINGS).filter(([, text]) => childNameIn(text));
    expect(ui).toEqual([]);
  });

  it("has no child name in any story line, caption, tip, bridge, offline card or UI string", () => {
    const lines = Object.entries(en.lines).filter(([key, text]) => childNameIn(text) || childNameIn(key));
    const strings = Object.entries(en.strings).filter(([key, text]) => childNameIn(text) || childNameIn(key));
    expect(lines).toEqual([]);
    expect(strings).toEqual([]);
  });

  it("has no child name in story ids, routes, codes, storage keys or QA globals", () => {
    expect(STORIES).toHaveLength(42);
    for (const story of STORIES) {
      for (const value of [story.id, storyCode(story), story.titleKey, story.offlinePlayKey, story.caregiverBridgeKey]) {
        expect(childNameIn(value), value).toBe(false);
      }
      // Review records name the reviewing agent, never a family member.
      expect(childNameIn(story.review.reviewer), story.id).toBe(false);
    }
    expect(QA_GLOBAL_NAME).toBe("__AURA_WONDER_WORLD__");
    expect(childNameIn(QA_GLOBAL_NAME)).toBe(false);
  });

  it("keeps the child's name out of every shipped source file but the owner's welcome: code, string literals and comments", () => {
    const hits = SOURCES.flatMap((file) => CHILD_NAME_PATTERNS.flatMap((pattern) => hitsIn(file.rel, file.raw, pattern)));
    // 07 O8: the start screen greets the child by name, from one constant in src/personal.ts and nowhere else.
    const welcome = hits.filter((hit) => hit.file === "src/personal.ts" && /^export const WELCOME_NAME: string \| null = "[^"]+";$/.test(hit.text));
    expect(welcome.length, "src/personal.ts names the child once, in WELCOME_NAME").toBeLessThanOrEqual(1);
    expect(
      describeHits(hits.filter((hit) => !welcome.includes(hit))),
      "MASTER-PROMPT section 6: no child name in source or builds. A name guard list belongs in tools/validate-wonder-world-content.mjs or in a unit test, which are never bundled (07 section 2.4 finding); the one exception is WELCOME_NAME in src/personal.ts (07 O8)"
    ).toBe("");
  });
});

describe("B3.1: broadcast mode ignores welcomeName, mounts zero UI chrome and disables input routing", () => {
  function createMinimalDom() {
    const windowListeners = new Map<string, number>();
    const docListeners = new Map<string, number>();
    const stageListeners = new Map<string, number>();

    const makeStyle = () => {
      const props = new Map<string, string>();
      return {
        width: "",
        height: "",
        setProperty: (k: string, v: string) => {
          props.set(k, v);
        },
        getPropertyValue: (k: string) => props.get(k) ?? "",
        removeProperty: (k: string) => {
          props.delete(k);
          return "";
        }
      };
    };

    interface MockElement {
      readonly tagName: string;
      readonly style: ReturnType<typeof makeStyle>;
      readonly dataset: Record<string, string>;
      readonly children: MockElement[];
      textContent: string;
      readonly classList: {
        add(): void;
        remove(): void;
        toggle(): boolean;
        contains(): boolean;
      };
      setAttribute(k: string, v: string): void;
      getAttribute(k: string): string | null;
      appendChild(child: MockElement): MockElement;
      remove(): void;
      querySelectorAll(selector: string): MockElement[];
      addEventListener(type: string): void;
      removeEventListener(): void;
      parent: { children: MockElement[] } | null;
      ownerDocument: Document;
    }

    const makeElement = (tag: string, listenerCounter?: Map<string, number>): MockElement => {
      const attrs = new Map<string, string>();
      const dataset: Record<string, string> = {};
      const children: MockElement[] = [];
      const style = makeStyle();
      let parent: { children: MockElement[] } | null = null;
      const el: MockElement = {
        tagName: tag.toUpperCase(),
        style,
        dataset,
        children,
        textContent: "",
        classList: {
          add: () => undefined,
          remove: () => undefined,
          toggle: () => false,
          contains: () => false
        },
        setAttribute: (k: string, v: string) => {
          attrs.set(k, v);
        },
        getAttribute: (k: string) => attrs.get(k) ?? null,
        appendChild: (child: MockElement) => {
          child.parent = el;
          children.push(child);
          return child;
        },
        remove: () => {
          if (!parent) return;
          const idx = parent.children.indexOf(el);
          if (idx >= 0) parent.children.splice(idx, 1);
          parent = null;
        },
        querySelectorAll: (selector: string) =>
          children.filter((c: MockElement) => {
            if (selector.includes('data-ui="boot"') && c.getAttribute("data-ui") === "boot") return true;
            return false;
          }),
        addEventListener: (type: string) => {
          if (listenerCounter) listenerCounter.set(type, (listenerCounter.get(type) ?? 0) + 1);
        },
        removeEventListener: () => undefined,
        get parent() {
          return parent;
        },
        set parent(p: { children: MockElement[] } | null) {
          parent = p;
        },
        ownerDocument: null as unknown as Document
      };
      return el;
    };

    const docEl = makeElement("html");
    const headEl = makeElement("head");
    const uiRoot = makeElement("div");
    const stageHost = makeElement("div", stageListeners);
    const bootSplash = makeElement("div");
    bootSplash.setAttribute("id", "ww-boot");
    bootSplash.setAttribute("data-ui", "boot");
    uiRoot.appendChild(bootSplash);

    const win = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: (type: string) => {
        windowListeners.set(type, (windowListeners.get(type) ?? 0) + 1);
      },
      removeEventListener: () => undefined,
      matchMedia: () => ({ matches: false })
    };

    const doc = {
      defaultView: win,
      documentElement: docEl,
      head: headEl,
      visibilityState: "visible",
      createElement: (tag: string) => {
        const created = makeElement(tag);
        created.ownerDocument = doc as unknown as Document;
        return created;
      },
      createTextNode: (t: string) => ({ textContent: t }),
      getElementById: (id: string) => (id === "ww-boot" && uiRoot.children.includes(bootSplash) ? bootSplash : null),
      querySelector: () => null,
      addEventListener: (type: string) => {
        docListeners.set(type, (docListeners.get(type) ?? 0) + 1);
      },
      removeEventListener: () => undefined
    };
    docEl.ownerDocument = doc as unknown as Document;
    uiRoot.ownerDocument = doc as unknown as Document;
    stageHost.ownerDocument = doc as unknown as Document;
    bootSplash.ownerDocument = doc as unknown as Document;

    return {
      uiRoot: uiRoot as unknown as HTMLElement,
      stageHost: stageHost as unknown as HTMLElement,
      uiChildren: uiRoot.children,
      windowListeners,
      docListeners,
      stageListeners
    };
  }

  function createStubStage(): StageAdapter {
    return {
      load: async () => undefined,
      swapSegment: async () => undefined,
      apply: () => undefined,
      setTalking: () => undefined,
      setSpeechEnergy: () => undefined,
      setSpeechViseme: () => undefined,
      setTargets: () => undefined,
      pick: () => "ball",
      update: () => undefined,
      setReducedMotion: () => undefined,
      dispose: () => undefined
    };
  }

  it("strips welcomeName, removes boot splash, mounts zero UI overlays and disables input in ?broadcast=1", async () => {
    const dom = createMinimalDom();
    const flags = readFlags("?broadcast=1&audio=0&voiceInput=1");
    expect(flags.broadcast).toBe(true);
    expect(flags.aspect).toBe("16:9");
    expect(flags.voiceInput).toBe(false);

    const app = createApp({
      uiRoot: dom.uiRoot,
      stageHost: dom.stageHost,
      flags,
      query: { autostart: false, manual: true },
      settings: { ...defaultSettings(), mode: "play-together" },
      storage: null,
      welcomeName: WELCOME_NAME ?? "Alex",
      stage: createStubStage()
    });

    await app.whenReady();
    // #ww-boot removed immediately; zero overlays mounted in idle broadcast state.
    expect(dom.uiChildren).toHaveLength(0);
    expect(app.state().screen).toBe("idle");
    expect(app.state().settings.mode).toBe("broadcast");
    expect(childNameIn(JSON.stringify(app.state()))).toBe(false);

    // Zero pointer/click/keyboard listeners attached to stageHost, document or window.
    expect([...dom.stageListeners.keys()]).toEqual([]);
    expect([...dom.docListeners.keys()]).toEqual([]);
    expect([...dom.windowListeners.keys()]).toEqual([]);

    // Playing an interactive story in broadcast mode still mounts zero UI chrome and ignores tap/confirm.
    await app.startStory("e01");
    expect(dom.uiChildren).toHaveLength(0);
    expect(app.state().screen).toBe("playing");
    expect(app.tap("ball")).toBe(false);
    expect(app.parentConfirm()).toBe(false);
    expect(childNameIn(JSON.stringify(app.state()))).toBe(false);

    const end = app.runToEnd();
    expect(end.finished).toBe(true);
    // Even after story completion, offline card and episode menu are never mounted.
    expect(dom.uiChildren).toHaveLength(0);
    app.dispose();
  });
});
