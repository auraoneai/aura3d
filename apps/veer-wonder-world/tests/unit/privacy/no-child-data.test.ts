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
//   keys or QA globals, nor anywhere in the shipped sources;
// - nothing is logged.
//
// The child's name is not written in this file: it is the prefix of the app's
// working folder name (`<name>-wonder-world`), which the PRD keeps as the
// directory name only. That folder-path form is allowed; the bare name is not.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STORIES, storyCode } from "../../../src/content/catalog.js";
import { en } from "../../../src/localization/en/index.js";
import { QA_GLOBAL_NAME } from "../../../src/qa/install-hooks.js";
import { FEATURE_FLAGS, readFlags } from "../../../src/runtime/feature-flags.js";
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
  it("makes no request of its own besides fetching its same-origin model files", () => {
    expect(describeHits(codeHits(/\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b|\bRTCPeerConnection\b|\bnew\s+Image\s*\(/))).toBe("");
    expect(describeHits(codeHits(/\bimport\s*\(\s*["'`]https?:/))).toBe("");
    // The one fetch is the model preloader's, on the URLs of the generated asset module.
    const fetchFiles = [...new Set(codeHits(/\bfetch\s*\(/).map((hit) => hit.file))];
    expect(fetchFiles).toEqual(["src/runtime/asset-preloader.ts"]);
  });

  it("names every model and sound by a module-relative, same-origin URL", () => {
    for (const rel of ["src/aura-assets.ts", "src/audio-manifest.generated.ts"]) {
      const file = SOURCES.find((source) => source.rel === rel);
      expect(file, rel).toBeDefined();
      const code = file?.code ?? "";
      const urls = (code.match(/\burl\s*:/g) ?? []).length;
      const local = (code.match(/\burl\s*:\s*new URL\("\.\/assets\/[^"]+", import\.meta\.url\)\.pathname/g) ?? []).length;
      expect(urls, rel).toBeGreaterThan(0);
      expect(local, rel).toBe(urls);
      expect(code, rel).not.toMatch(/https?:\/\//);
    }
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
    expect(STORIES).toHaveLength(32);
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

  it("keeps the child's name out of every shipped source file: code, string literals and comments", () => {
    const hits = SOURCES.flatMap((file) => CHILD_NAME_PATTERNS.flatMap((pattern) => hitsIn(file.rel, file.raw, pattern)));
    expect(
      describeHits(hits),
      "MASTER-PROMPT section 6: no child name in source or builds. A name guard list belongs in tools/validate-wonder-world-content.mjs or in a unit test, which are never bundled (07 section 2.4 finding)"
    ).toBe("");
  });
});
