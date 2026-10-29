/// <reference types="node" />
// UI strings and UI source guards (PRD 04 E01-E08 and A04, PRD 01 sections
// 6-9, MASTER-PROMPT section 6). Lists every `ui.*` key the overlay uses,
// checks the sources use no other key, checks every English fallback against
// the child-safety copy rules, and guards the stylesheet and index.html.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { strings as enUiStrings } from "../../../src/localization/en/ui.js";
import { UI_STRINGS, fillTemplate, humanizeId, speakerName, storyText, uiText, type UiLocale } from "../../../src/ui/accessibility.js";
import { speakerColour } from "../../../src/ui/captions.js";
import { menuSection, type MenuItem } from "../../../src/ui/episode-menu.js";
import { GROWN_UP_LINKS, formatSeconds, waitChoicesMs } from "../../../src/ui/parent-panel.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const uiDir = join(appRoot, "src/ui");

// The child's name is never written in this file: it is the prefix of the app's working folder name
// (`<name>-wonder-world`), as in tests/unit/privacy/no-child-data.test.ts.
const WORKING_SUFFIX = "-wonder-world";
const appFolder = basename(appRoot);
const CHILD_NAME = appFolder.endsWith(WORKING_SUFFIX) ? appFolder.slice(0, -WORKING_SUFFIX.length) : "";
/** The bare name as a word (never matches when the folder name carries no name). */
const CHILD_NAME_PATTERN = CHILD_NAME ? new RegExp(`\\b${CHILD_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : /(?!)/;

/** The shared `ui.*` key list (content-core brief). */
const SHARED_UI_KEYS = [
  "ui.start.tap",
  "ui.start.title",
  "ui.mode.play",
  "ui.mode.watch",
  "ui.mode.label",
  "ui.menu.episodes",
  "ui.menu.activities",
  "ui.menu.title",
  "ui.parent.title",
  "ui.parent.music",
  "ui.parent.sound",
  "ui.parent.captions",
  "ui.parent.reducedMotion",
  "ui.parent.highContrast",
  "ui.parent.wait",
  "ui.parent.words",
  "ui.parent.locale",
  "ui.parent.exit",
  "ui.parent.close",
  "ui.parent.clear",
  "ui.pause",
  "ui.resume",
  "ui.replay",
  "ui.allDone",
  "ui.parentButton",
  "ui.offline.title",
  "ui.offline.done",
  "ui.gate.hold",
  "ui.gate.cancel",
  "ui.note.start",
  "ui.note.safety",
  "ui.note.privacy",
  "ui.note.links",
  "ui.guide.1",
  "ui.guide.2",
  "ui.guide.3",
  "ui.guide.4",
  "ui.captions.label",
  "ui.loading",
  "ui.audio.unavailable"
] as const;

/**
 * Further keys the English pack defines (src/localization/en/ui.ts; most are
 * also in src/content/schema.ts REQUIRED_UI_KEYS) that the UI uses for PRD
 * requirements: the gate is not a lock, sound starts after the tap, the
 * prototype label, the word list tracks nothing, the sound-effect level (PRD 01
 * section 9; 07 B20), the caption speaker names, headings and labels.
 */
const PACK_UI_KEYS = [
  "ui.start.sound",
  "ui.prototype",
  "ui.controls.label",
  "ui.confirm",
  "ui.stage.unavailable",
  "ui.gate.title",
  "ui.gate.button",
  "ui.gate.holding",
  "ui.gate.again",
  "ui.gate.note",
  "ui.parent.back",
  "ui.parent.display",
  "ui.parent.sfx",
  "ui.parent.sfxHelp",
  "ui.parent.sfx.off",
  "ui.parent.sfx.soft",
  "ui.parent.sfx.normal",
  "ui.parent.waitHelp",
  "ui.parent.wordsHelp",
  "ui.parent.wordsEmpty",
  "ui.parent.wordsCount",
  "ui.guide.title",
  "ui.note.title",
  "ui.note.aap",
  "ui.note.asha",
  "ui.speaker.momo",
  "ui.speaker.lulu",
  "ui.speaker.sheru",
  "ui.speaker.gogo",
  "ui.speaker.lumi",
  "ui.speaker.peeko",
  "ui.speaker.robot"
] as const;

/** Every `ui.*` key the UI uses. */
const UI_KEYS = [...SHARED_UI_KEYS, ...PACK_UI_KEYS];

/** Copy that must never appear in child-facing or parent-facing UI text. */
const FORBIDDEN_COPY: readonly RegExp[] = [
  /\bwrong\b/i,
  /\btry again\b/i,
  /\bsay it\b/i,
  /\brepeat after me\b/i,
  /\b(in)?correct\b/i,
  /\bgood job\b/i,
  /\bstreak/i,
  /\bpoints?\b/i,
  /\bbuy\b/i,
  /\bshare\b/i,
  CHILD_NAME_PATTERN,
  /\bpip\b/i
];

function readUiSources(): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of readdirSync(uiDir).sort()) {
    if (name.endsWith(".ts")) files.set(name, readFileSync(join(uiDir, name), "utf8"));
  }
  return files;
}

/** The UI_STRINGS table is where keys are defined; everything else is where they are used. */
function splitTable(source: string): { table: string; rest: string } {
  const start = source.indexOf("export const UI_STRINGS = {");
  const end = source.indexOf("} as const", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return { table: source.slice(start, end), rest: source.slice(0, start) + source.slice(end) };
}

function uiKeyLiterals(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(/["'`](ui\.[A-Za-z0-9.]+)["'`]/g)) keys.push(match[1] ?? "");
  return keys;
}

function usageSources(): string {
  const parts: string[] = [];
  for (const [name, text] of readUiSources()) parts.push(name === "accessibility.ts" ? splitTable(text).rest : text);
  return parts.join("\n");
}

const englishOnly: UiLocale = {
  str(key: string, fallback?: string): string {
    return fallback ?? key;
  }
};

describe("ui string keys", () => {
  it("UI_STRINGS defines exactly the listed ui.* keys, the whole shared list included", () => {
    expect(Object.keys(UI_STRINGS).sort()).toEqual([...UI_KEYS].sort());
    expect(new Set(UI_KEYS).size).toBe(UI_KEYS.length);
    expect(SHARED_UI_KEYS.length).toBe(40);
  });

  it("keep no string for the unavailable Punjabi pack (07 B16; 06 QA-E11)", () => {
    for (const key of ["ui.parent.localeUnavailable", "ui.parent.locale.pa"]) {
      expect(Object.keys(UI_STRINGS), key).not.toContain(key);
      expect(Object.keys(enUiStrings), key).not.toContain(key);
    }
    for (const [key, text] of [...Object.entries(UI_STRINGS), ...Object.entries(enUiStrings)]) {
      expect(text, key).not.toMatch(/Punjabi|ਪੰਜਾਬੀ/);
    }
  });

  it("the UI sources use no ui.* key outside the list", () => {
    const allowed = new Set<string>(UI_KEYS);
    const used = uiKeyLiterals(usageSources());
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((key) => !allowed.has(key))).toEqual([]);
  });

  it("every listed key is used by some UI module", () => {
    const used = new Set(uiKeyLiterals(usageSources()));
    expect(UI_KEYS.filter((key) => !used.has(key))).toEqual([]);
  });

  it("the English pack provides every key the UI uses", () => {
    const pack = join(appRoot, "src/localization/en/ui.ts");
    if (!existsSync(pack)) return; // Written by the content-core unit; checked again at integration.
    const text = readFileSync(pack, "utf8");
    expect(UI_KEYS.filter((key) => !text.includes(`"${key}"`))).toEqual([]);
  });

  it("keeps each English fallback word for word the same as the English pack", () => {
    const differ = Object.entries(UI_STRINGS).filter(([key, text]) => {
      const packed: unknown = Object.entries(enUiStrings).find(([packKey]) => packKey === key)?.[1];
      return typeof packed === "string" && packed !== text;
    });
    expect(differ.map(([key]) => key)).toEqual([]);
  });

  it("UI modules never call locale.str for a ui.* key directly (uiText always passes the fallback)", () => {
    expect(usageSources()).not.toMatch(/\.str\(\s*["'`]ui\./);
  });

});

describe("English fallbacks", () => {
  it("are non-empty, trimmed and calm", () => {
    for (const [key, text] of Object.entries(UI_STRINGS)) {
      expect(text.trim(), key).toBe(text);
      expect(text.length, key).toBeGreaterThan(0);
      expect(text, key).not.toMatch(/!!|\?\?/);
    }
  });

  it("follow the child-safety copy rules (no pressure, scoring, selling or child names)", () => {
    for (const [key, text] of Object.entries(UI_STRINGS)) {
      for (const rule of FORBIDDEN_COPY) expect(text, `${key}: ${rule}`).not.toMatch(rule);
    }
  });

  it("carry the PRD notes: touch works without speaking, not therapy, settings stay on the device", () => {
    expect(UI_STRINGS["ui.start.title"]).toBe("Wonder World");
    expect(UI_STRINGS["ui.note.start"]).toBe(
      "Play alongside your child when you can. All activities work by touch; speaking isn't required."
    );
    expect(UI_STRINGS["ui.note.safety"]).toMatch(/not therapy/);
    expect(UI_STRINGS["ui.note.privacy"]).toMatch(/this device/);
    expect(UI_STRINGS["ui.gate.hold"]).toMatch(/2 seconds/);
    expect(UI_STRINGS["ui.gate.note"]).toMatch(/not a lock/);
    expect(UI_STRINGS["ui.start.sound"]).toMatch(/after you tap/);
    expect(UI_STRINGS["ui.parent.wordsHelp"]).toMatch(/does not track/);
    expect(UI_STRINGS["ui.parent.waitHelp"]).toMatch(/carries on by itself/);
    expect(UI_STRINGS["ui.offline.title"]).toBe("All done! Now try...");
    expect(fillTemplate(UI_STRINGS["ui.parent.wordsCount"], { n: 2, max: 5 })).toBe("2 of 5 chosen");
    expect(fillTemplate("{n} of {max} {other}", { n: 1, max: 5 })).toBe("1 of 5 {other}");
    const guideKeys = ["ui.guide.1", "ui.guide.2", "ui.guide.3", "ui.guide.4"] as const;
    expect(guideKeys.map((key) => uiText(englishOnly, key))).toEqual([
      "Label what your child notices.",
      "Wait for a turn.",
      "Expand a sound or gesture.",
      "Try with a real toy."
    ]);
  });
});

describe("string lookup", () => {
  it("uses the locale pack when it has the key", () => {
    const pack: UiLocale = { str: (key, fallback) => (key === "ui.pause" ? "Pausa" : fallback ?? key) };
    expect(uiText(pack, "ui.pause")).toBe("Pausa");
    expect(uiText(pack, "ui.resume")).toBe(UI_STRINGS["ui.resume"]);
  });

  it("always passes the English fallback and falls back on empty, echoed or failing answers", () => {
    const seen: (string | undefined)[] = [];
    const recording: UiLocale = {
      str(_key, fallback) {
        seen.push(fallback);
        return fallback ?? "";
      }
    };
    uiText(recording, "ui.allDone");
    expect(seen).toEqual([UI_STRINGS["ui.allDone"]]);
    expect(uiText({ str: () => "" }, "ui.allDone")).toBe("All done");
    expect(uiText({ str: (key) => key }, "ui.allDone")).toBe("All done");
    expect(
      uiText(
        {
          str(): string {
            throw new Error("pack not loaded");
          }
        },
        "ui.allDone"
      )
    ).toBe("All done");
  });

  it("story titles fall back to a readable form of the story id", () => {
    expect(storyText(englishOnly, "e17.title", humanizeId("sheru-big-adventure"))).toBe("Sheru big adventure");
    expect(storyText({ str: (key, fallback) => (key === "e17.title" ? "Sheru's Big Adventure" : fallback ?? key) }, "e17.title", "x")).toBe(
      "Sheru's Big Adventure"
    );
  });

  it("captions name the characters and the baby robot; the narrator has no label", () => {
    expect(speakerName("momo")).toBe("Momo");
    expect(speakerName("peeko")).toBe("Peeko");
    expect(speakerName("gogo")).toBe("GoGo");
    expect(speakerName("robot")).toBe("Little Robot");
    expect(speakerName("narrator")).toBe("");
    expect(speakerName("constructor")).toBe("");
    expect(speakerName("lulu", { str: (key, fallback) => (key === "ui.speaker.lulu" ? "Lulu!" : fallback ?? key) })).toBe("Lulu!");
    expect(speakerColour("narrator")).toBeNull();
    expect(speakerColour("lulu")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("links grown-ups to AAP and ASHA guidance over https with no tracking parameters", () => {
    expect(GROWN_UP_LINKS.map((link) => link.key)).toEqual(["ui.note.aap", "ui.note.asha"]);
    for (const link of GROWN_UP_LINKS) {
      expect(link.href).toMatch(/^https:\/\/(publications\.aap\.org|www\.asha\.org)\//);
      expect(link.href).not.toMatch(/[?#]/);
    }
  });

  it("formats the turn wait as 3-8 seconds in the parent's language", () => {
    expect(waitChoicesMs()).toEqual([3000, 4000, 5000, 6000, 7000, 8000]);
    expect(formatSeconds("en", 5, "long")).toBe("5 seconds");
    expect(formatSeconds("not a locale tag!", 5, "long")).toBe("5 s");
  });

  it("lists every story once, in canonical order, with no extra entries", () => {
    const items: MenuItem[] = [
      { id: "g-two", code: "g02", titleKey: "g02.title", kind: "activity", host: "gogo", number: 2 },
      { id: "e-two", code: "e02", titleKey: "e02.title", kind: "episode", host: "peeko", number: 2 },
      { id: "e-one", code: "e01", titleKey: "e01.title", kind: "episode", host: "momo", number: 1 },
      { id: "e-one", code: "e01", titleKey: "e01.title", kind: "episode", host: "momo", number: 1 }
    ];
    expect(menuSection(items, "episode").map((item) => item.id)).toEqual(["e-one", "e-two"]);
    expect(menuSection(items, "activity").map((item) => item.id)).toEqual(["g-two"]);
  });

  it("lists the P1 pilot stories first, then P2, each group in canonical order (PRD 04 E02)", () => {
    const items: MenuItem[] = [
      { id: "e-three", code: "e03", titleKey: "e03.title", kind: "episode", host: "lumi", number: 3, phase: "P2" },
      { id: "e-seventeen", code: "e17", titleKey: "e17.title", kind: "episode", host: "sheru", number: 17, phase: "P1" },
      { id: "e-two", code: "e02", titleKey: "e02.title", kind: "episode", host: "peeko", number: 2, phase: "P1" },
      { id: "e-four", code: "e04", titleKey: "e04.title", kind: "episode", host: "gogo", number: 4 },
      { id: "e-one", code: "e01", titleKey: "e01.title", kind: "episode", host: "momo", number: 1, phase: "P1" },
      { id: "g-four", code: "g04", titleKey: "g04.title", kind: "activity", host: "peeko", number: 4, phase: "P2" },
      { id: "g-three", code: "g03", titleKey: "g03.title", kind: "activity", host: "sheru", number: 3, phase: "P1" }
    ];
    // A story without a phase is never promoted into the pilot group.
    expect(menuSection(items, "episode").map((item) => item.number)).toEqual([1, 2, 17, 3, 4]);
    expect(menuSection(items, "activity").map((item) => item.code)).toEqual(["g03", "g04"]);
    // Without phases the order stays canonical.
    const unphased: MenuItem[] = items.map((item) => ({
      id: item.id,
      code: item.code,
      titleKey: item.titleKey,
      kind: item.kind,
      host: item.host,
      number: item.number
    }));
    expect(menuSection(unphased, "episode").map((item) => item.number)).toEqual([1, 2, 3, 4, 17]);
  });
});

describe("UI sources", () => {
  const sources = readUiSources();

  it("has no clock, randomness, network, microphone, camera or analytics", () => {
    for (const [name, text] of sources) {
      for (const banned of [
        /Math\.random/,
        /Date\.now/,
        /performance\.now/,
        /new Date\(/,
        /\bfetch\(/,
        /XMLHttpRequest/,
        /sendBeacon/,
        /getUserMedia/,
        /SpeechRecognition/,
        /mediaDevices/,
        /\.innerHTML\b/,
        /\bas any\b/,
        /\bas never\b/,
        /from "three"/
      ]) {
        expect(text, `${name}: ${banned}`).not.toMatch(banned);
      }
    }
  });

  it("touches storage only through the settings store", () => {
    for (const [name, text] of sources) {
      if (name === "settings-store.ts") continue;
      expect(text, name).not.toMatch(
        /\blocalStorage\s*(\.\s*(getItem|setItem|removeItem|clear|key)\b|\[)|sessionStorage|indexedDB|document\.cookie/
      );
    }
  });

  it("uses no autoplay timer in the menu, start screen or end card", () => {
    for (const name of ["episode-menu.ts", "start-screen.ts", "offline-card.ts"]) {
      expect(sources.get(name), name).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
    }
  });
});

describe("styles.css", () => {
  const css = readFileSync(join(uiDir, "styles.css"), "utf8");

  it("uses Graphik Web with weights 400, 500 and 600 only", () => {
    expect(css).toMatch(/"Graphik Web"/);
    const weights = Array.from(css.matchAll(/font-weight:\s*([^;]+);/g), (match) => (match[1] ?? "").trim());
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.filter((weight) => !["400", "500", "600"].includes(weight))).toEqual([]);
    expect(css).toMatch(/font-synthesis:\s*none/);
    expect(css).not.toMatch(/\b(Inter|Roboto|Open Sans|fonts\.googleapis)\b/);
  });

  it("has high contrast, calm motion, safe areas, large targets and both orientations", () => {
    expect(css).toMatch(/\.high-contrast\s*\{/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/\.reduced-motion #ui \*/);
    expect(css).toMatch(/env\(safe-area-inset-top/);
    expect(css).toMatch(/env\(safe-area-inset-bottom/);
    expect(css).toMatch(/--ww-tap:\s*48px/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/orientation: landscape/);
  });

  it("has no flashing: looping animations are slow and nothing blinks or shakes", () => {
    expect(css).not.toMatch(/@keyframes\s+[\w-]*(flash|blink|strobe|shake|wiggle|pulse-fast)/i);
    for (const match of css.matchAll(/animation:\s*([\w-]+)\s+([\d.]+)(ms|s)[^;]*infinite/g)) {
      const seconds = Number(match[2]) / (match[3] === "ms" ? 1000 : 1);
      expect(seconds, match[1]).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("index.html", () => {
  // Markup only: the explanatory comment in the file may mention what is absent.
  const html = readFileSync(join(appRoot, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");

  it("is a noindex prototype page with the stage and overlay roots", () => {
    expect(html).toMatch(/<meta name="robots" content="noindex"/);
    expect(html).toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/<title>Wonder World \(prototype\)<\/title>/);
    expect(html).toMatch(/href="\/fonts\/local\.css"/);
    expect(html).toMatch(/<div id="stage"><\/div>/);
    expect(html).toMatch(/<div id="ui"><\/div>/);
    expect(html).toMatch(/<script type="module" src="\.\/src\/main\.ts"><\/script>/);
  });

  it("has no SEO or social tags, no autoplay media, no third-party script and no child name", () => {
    expect(html).not.toMatch(/og:|twitter:|rel="canonical"/);
    expect(html).not.toMatch(/<audio|<video|autoplay/i);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(CHILD_NAME, "the working folder carries the guard name").not.toBe("");
    expect(html).not.toMatch(CHILD_NAME_PATTERN);
  });
});
