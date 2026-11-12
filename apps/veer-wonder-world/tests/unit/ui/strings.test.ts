/// <reference types="node" />
// UI strings and UI source guards (PRD 04 E01-E08 and A04, PRD 01 sections
// 6-9, MASTER-PROMPT section 6; WP-7). Lists every `ui.*` key the overlay uses,
// checks the sources use no other key, checks every English fallback against
// the child-safety copy rules, and guards fonts.css, styles.css and index.html.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { strings as enUiStrings } from "../../../src/localization/en/ui.js";
import { CHARACTER_COLOURS, ENGLISH_ONLY, UI_STRINGS, fillTemplate, humanizeId, speakerName, storyText, uiText, type UiLocale } from "../../../src/ui/accessibility.js";
import { mountCaptions, speakerColour } from "../../../src/ui/captions.js";
import { mountChildControls } from "../../../src/ui/child-controls.js";
import { menuSection, showEpisodeMenu, type MenuItem } from "../../../src/ui/episode-menu.js";
import { showOfflineCard } from "../../../src/ui/offline-card.js";
import { GROWN_UP_LINKS, formatSeconds, waitChoicesMs } from "../../../src/ui/parent-panel.js";
import { welcomeNameLine } from "../../../src/ui/start-screen.js";

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
  "ui.mode.auto",
  "ui.mode.windDown",
  "ui.menu.sleep",
  "ui.menu.songs",
  "ui.menu.all",
  "ui.menu.playLullabies",
  "ui.prototype",
  "ui.controls.label",
  "ui.fullscreen.enter",
  "ui.fullscreen.exit",
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
  "ui.parent.windDown",
  "ui.parent.windDownHelp",
  "ui.parent.sleepTimer",
  "ui.parent.sleepTimerHelp",
  "ui.parent.sleepTimerOff",
  "ui.parent.waitHelp",
  "ui.parent.wordsHelp",
  "ui.parent.wordsEmpty",
  "ui.parent.wordsCount",
  "ui.sleep.title",
  "ui.sleep.body",
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
  "ui.speaker.robot",
  "ui.start.welcome",
  "ui.start.welcomeNamed"
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

  it("greet by name only through src/personal.ts (07 O8): the string keeps a {name} placeholder", () => {
    expect(UI_STRINGS["ui.start.welcome"]).toBe("Welcome to");
    expect(UI_STRINGS["ui.start.welcomeNamed"]).toBe("{name}’s Wonder World");
    expect(welcomeNameLine(englishOnly, "Sam")).toBe("Sam’s Wonder World");
    expect(welcomeNameLine(englishOnly, null)).toBe("Wonder World");
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
        /insertAdjacentHTML/,
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

describe("fonts.css and styles.css", () => {
  const fontsCss = readFileSync(join(uiDir, "fonts.css"), "utf8");
  const css = readFileSync(join(uiDir, "styles.css"), "utf8");

  it("self-hosts Whitney, Graphik Web, DIN Pro and Monument Grotesk Mono with weights 400, 500 and 600 only", () => {
    expect(css).toMatch(/^@import "\.\/fonts\.css";/);
    for (const family of [
      '"Whitney"',
      '"Whitney Fallback"',
      '"Graphik Web"',
      '"Graphik Fallback"',
      '"DIN Pro"',
      '"DIN Pro Fallback"',
      '"Monument Grotesk Mono"',
      '"Monument Grotesk Mono Fallback"'
    ]) {
      expect(fontsCss, family).toContain(family);
    }
    for (const token of ["--font-ui:", "--font-display:", "--font-metric:", "--font-code:", "--font-smallcaps:"]) {
      expect(fontsCss, token).toContain(token);
    }
    expect(css).toContain("--ww-font: var(--font-ui)");

    for (const [label, sheet] of [
      ["fonts.css", fontsCss],
      ["styles.css", css]
    ] as const) {
      const weights = Array.from(sheet.matchAll(/font-weight:\s*([^;]+);/g), (match) => (match[1] ?? "").trim());
      expect(weights.length, label).toBeGreaterThan(0);
      expect(weights.filter((weight) => !["400", "500", "600"].includes(weight)), label).toEqual([]);
      expect(sheet, label).toMatch(/font-synthesis:\s*none/);
      expect(sheet, label).not.toMatch(/\b(Inter|Roboto|Geist|Open Sans|fonts\.googleapis)\b/);
      expect(sheet, label).not.toMatch(/font-weight:\s*(bold|bolder|700|800|900)\b/);
    }
  });

  it("has high contrast, calm motion, safe areas, large targets, dense caregiver sheet tokens and both orientations", () => {
    expect(css).toMatch(/\.high-contrast\s*\{/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/\.reduced-motion #ui \*/);
    expect(css).toMatch(/env\(safe-area-inset-top/);
    expect(css).toMatch(/env\(safe-area-inset-bottom/);
    expect(css).toMatch(/--ww-tap:\s*48px/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/--row-height:\s*34px/);
    expect(css).toMatch(/--control-height:\s*32px/);
    expect(css).toMatch(/font-variant-caps:\s*small-caps/);
    expect(css).toMatch(/orientation: landscape/);
  });

  it("has no flashing: looping animations are slow and nothing blinks or shakes", () => {
    expect(css).not.toMatch(/@keyframes\s+[\w-]*(flash|blink|strobe|shake|wiggle|pulse-fast)/i);
    for (const match of css.matchAll(/animation:\s*([\w-]+)\s+([\d.]+)(ms|s)[^;]*infinite/g)) {
      const seconds = Number(match[2]) / (match[3] === "ms" ? 1000 : 1);
      expect(seconds, match[1]).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the element resets at zero specificity, so each control's own colour, size and weight win", () => {
    // `#ui button { color: inherit }` once out-ranked every class: the purple buttons showed dark ink at about 2:1.
    const rules = Array.from(css.matchAll(/([^{}]+)\{([^}]*)\}/g), (match) => ({ selector: (match[1] ?? "").trim(), body: match[2] ?? "" }));
    const idScoped = rules.filter(
      (rule) =>
        rule.selector.split(",").some((part) => /(^|\s)#ui\s+(button|input|h[1-6]|p|ul|fieldset)\s*$/.test(part.trim())) &&
        /(^|;)\s*(color|font|font-size|font-weight|margin)\s*:/.test(rule.body)
    );
    expect(idScoped.map((rule) => rule.selector)).toEqual([]);
    expect(css).toMatch(/:where\(#ui\) button,\s*:where\(#ui\) input\s*\{\s*font: inherit;\s*color: inherit;/);
  });

  it("gives every filled control a readable label in both palettes (WCAG AA, at least 4.5:1)", () => {
    const tokens = (block: string): Map<string, string> =>
      new Map(Array.from(block.matchAll(/(--ww-[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g), (match) => [match[1] ?? "", match[2] ?? ""]));
    const luminance = (hex: string): number => {
      const channel = (offset: number): number => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    };
    const contrast = (a: string, b: string): number => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
    };
    const base = tokens(/:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "");
    const highContrast = new Map([...base, ...tokens(/\.high-contrast\s*\{([^}]*)\}/.exec(css)?.[1] ?? "")]);
    const pairs = [
      ["--ww-primary", "--ww-on-primary"],
      ["--ww-primary-hover", "--ww-on-primary"],
      ["--ww-selected-bg", "--ww-selected-ink"],
      ["--ww-focus-bg", "--ww-focus-ink"],
      ["--ww-keyword-bg", "--ww-keyword-ink"],
      ["--ww-surface", "--ww-ink"],
      ["--ww-surface", "--ww-ink-soft"]
    ] as const;
    for (const [palette, values] of [["default", base], ["high contrast", highContrast]] as const) {
      for (const [background, text] of pairs) {
        const bg = values.get(background);
        const ink = values.get(text);
        expect(bg, `${palette} ${background}`).toMatch(/^#/);
        expect(ink, `${palette} ${text}`).toMatch(/^#/);
        expect(contrast(bg ?? "", ink ?? ""), `${palette}: ${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("WP-7 co-play UI upgrades", () => {
  class MiniElement {
    parentNode: MiniElement | null = null;
    readonly children: MiniElement[] = [];
    readonly dataset: Record<string, string | undefined> = {};
    private readonly attrs = new Map<string, string>();
    private ownText = "";
    disabled = false;
    title = "";
    readonly style = {
      props: new Map<string, string>(),
      setProperty(k: string, v: string): void {
        this.props.set(k, v);
      },
      removeProperty(k: string): void {
        this.props.delete(k);
      }
    };
    readonly classList = {
      owner: null as MiniElement | null,
      tokens(): string[] {
        return (this.owner?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
      },
      contains(c: string): boolean {
        return this.tokens().includes(c);
      },
      add(...cs: string[]): void {
        this.owner?.setAttribute("class", [...new Set([...this.tokens(), ...cs])].join(" "));
      },
      remove(...cs: string[]): void {
        this.owner?.setAttribute("class", this.tokens().filter((t) => !cs.includes(t)).join(" "));
      },
      toggle(c: string, force?: boolean): boolean {
        const on = force ?? !this.contains(c);
        if (on) this.add(c);
        else this.remove(c);
        return on;
      }
    };
    private readonly listeners = new Map<string, ((ev: { type: string; timeStamp: number; target: MiniElement; preventDefault(): void }) => void)[]>();

    constructor(
      readonly ownerDocument: MiniDoc,
      readonly localName: string
    ) {
      this.classList.owner = this;
    }

    get hidden(): boolean {
      return this.attrs.has("hidden");
    }
    set hidden(v: boolean) {
      if (v) this.attrs.set("hidden", "");
      else this.attrs.delete("hidden");
    }

    get textContent(): string {
      return this.ownText + this.children.map((c) => c.textContent).join("");
    }
    set textContent(v: string) {
      for (const c of this.children) c.parentNode = null;
      this.children.length = 0;
      this.ownText = v;
    }

    set className(v: string) {
      this.setAttribute("class", v);
    }
    get className(): string {
      return this.getAttribute("class") ?? "";
    }

    setAttribute(k: string, v: string): void {
      this.attrs.set(k, String(v));
    }
    getAttribute(k: string): string | null {
      return this.attrs.get(k) ?? null;
    }
    hasAttribute(k: string): boolean {
      return this.attrs.has(k);
    }
    removeAttribute(k: string): void {
      this.attrs.delete(k);
    }
    appendChild(child: MiniElement): MiniElement {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...kids: MiniElement[]): void {
      for (const kid of kids) this.appendChild(kid);
    }
    remove(): void {
      if (!this.parentNode) return;
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
    focus(): void {
      this.ownerDocument.activeElement = this;
    }
    addEventListener(type: string, fn: (ev: { type: string; timeStamp: number; target: MiniElement; preventDefault(): void }) => void): void {
      const list = this.listeners.get(type) ?? [];
      list.push(fn);
      this.listeners.set(type, list);
    }
    removeEventListener(): void {}
    click(timeStamp = 1000): void {
      const ev = { type: "click", timeStamp, target: this, preventDefault(): void {} };
      for (const fn of this.listeners.get("click") ?? []) fn(ev);
    }
    querySelectorAll(selector: string): MiniElement[] {
      const all = (node: MiniElement): MiniElement[] => node.children.flatMap((c) => [c, ...all(c)]);
      return all(this).filter((n) => selector.split(",").some((part) => {
        const s = part.trim();
        if (s.startsWith(".")) return n.classList.contains(s.slice(1));
        if (s.startsWith("[") && s.endsWith("]")) {
          const body = s.slice(1, -1);
          const eq = body.indexOf("=");
          if (eq < 0) return n.hasAttribute(body);
          return n.getAttribute(body.slice(0, eq)) === body.slice(eq + 1).replace(/^"|"$/g, "");
        }
        return n.localName === s;
      }));
    }
    closest(): null {
      return null;
    }
  }

  class MiniDoc {
    activeElement: MiniElement | null = null;
    readonly defaultView = null;
    readonly documentElement: MiniElement;
    readonly body: MiniElement;
    constructor() {
      this.documentElement = new MiniElement(this, "html");
      this.body = new MiniElement(this, "body");
      this.documentElement.appendChild(this.body);
    }
    createElement(tag: string): MiniElement {
      return new MiniElement(this, tag.toLowerCase());
    }
    createElementNS(_ns: string, tag: string): MiniElement {
      return new MiniElement(this, tag);
    }
    createTextNode(text: string): MiniElement {
      const t = new MiniElement(this, "#text");
      t.textContent = text;
      return t;
    }
    addEventListener(): void {}
    removeEventListener(): void {}
  }

  function makeRoot(): HTMLElement {
    const doc = new MiniDoc();
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    return root as unknown as HTMLElement;
  }

  it("highlights target words with safe <mark> nodes and shows speaker avatar without touching narrator", () => {
    const root = makeRoot();
    const captions = mountCaptions(root, ENGLISH_ONLY, {
      portraits: { momo: "/assets/portraits/momo.webp" },
      highlightWords: ["ball", "all-done"]
    });
    captions.show("momo", "Roll the ball! All done.");
    const marks = (root as unknown as MiniElement).querySelectorAll("mark");
    expect(marks.map((m) => m.textContent)).toEqual(["ball", "All done"]);
    expect((root as unknown as MiniElement).querySelectorAll(".ww-caption-text")[0]?.textContent).toBe("Roll the ball! All done.");
    expect((root as unknown as MiniElement).querySelectorAll(".ww-caption-avatar")).toHaveLength(1);

    captions.show("narrator", "Quiet sky.");
    expect((root as unknown as MiniElement).querySelectorAll(".ww-caption-avatar")).toHaveLength(0);
    captions.dispose();
  });

  it("filters menu cards by world while defaulting to All and marks Focus word matches", () => {
    const root = makeRoot();
    const items: MenuItem[] = [
      {
        id: "sheru-big-adventure",
        code: "e17",
        titleKey: "e17.title",
        kind: "episode",
        host: "sheru",
        number: 17,
        phase: "P1",
        world: "meadow",
        targetWords: ["ball"]
      },
      { id: "gogo-abc-train", code: "e04", titleKey: "e04.title", kind: "episode", host: "gogo", number: 4, world: "station", targetWords: ["train"] }
    ];
    const remove = showEpisodeMenu(root, ENGLISH_ONLY, items, () => {}, {
      portraits: {},
      selectedWords: ["ball"]
    });
    const host = root as unknown as MiniElement;
    expect(host.querySelectorAll(".ww-world-pill")).toHaveLength(9);
    expect(host.querySelectorAll('[data-ui="focus-word"]')).toHaveLength(1);
    const cells = host.querySelectorAll(".ww-menu-cell");
    expect(cells.map((c) => c.hidden)).toEqual([false, false]);

    const stationPill = host.querySelectorAll('[data-world="station"]')[0];
    stationPill?.click();
    expect(cells.map((c) => c.hidden)).toEqual([true, false]);
    remove();
  });

  it("updates the radial wait ring on the confirm turn button and renders offline recap chips", () => {
    const root = makeRoot();
    const controls = mountChildControls(root, ENGLISH_ONLY, {
      onPause() {},
      onResume() {},
      onReplayWord() {},
      onAllDone() {},
      onParent() {}
    });
    controls.setTurnWaiting(true);
    controls.setWaitProgress?.(0.5);
    const host = root as unknown as MiniElement;
    const confirm = host.querySelectorAll('[data-action="confirm"]')[0];
    expect(confirm?.getAttribute("data-control")).toBe("confirm");
    expect(confirm?.dataset["waitProgress"]).toBe("0.50");
    controls.dispose();

    const closeOffline = showOfflineCard(root, ENGLISH_ONLY, "Roll a real ball together.", () => {}, {
      words: [
        { id: "ball", label: "ball" },
        { id: "more", label: "more" }
      ],
      portraits: {}
    });
    expect(host.querySelectorAll(".ww-offline-word-chip").map((c) => c.textContent)).toEqual(["ball", "more"]);
    closeOffline();
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
    expect(html).toMatch(/<div id="ui">\s*<div class="ww-screen ww-start ww-boot" data-ui="boot" aria-hidden="true">/);
    expect(html).toMatch(/<script type="module" src="\.\/src\/main\.ts"><\/script>/);
  });

  it("tells a browser without WebGL 2 or Safari 15.4's JavaScript that it is too old, instead of leaving the splash up", () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const flagsUnsupported = (win: object, arrayPrototype: object, object: object): boolean => {
      const added: string[] = [];
      const doc = { documentElement: { classList: { add: (name: string) => added.push(name) } } };
      new Function("window", "document", "Array", "Object", script)(win, doc, { prototype: arrayPrototype }, object);
      return added.includes("ww-unsupported");
    };
    const webgl2 = { WebGL2RenderingContext: class {} };
    const clone = { structuredClone: (value: unknown) => value };
    const at = { at: () => undefined };
    const hasOwn = { hasOwn: () => true };
    expect(flagsUnsupported({ ...webgl2, ...clone }, at, hasOwn)).toBe(false);
    expect(flagsUnsupported(clone, at, hasOwn)).toBe(true); // iPadOS 14 and older: no WebGL 2
    expect(flagsUnsupported({ ...webgl2, ...clone }, {}, hasOwn)).toBe(true); // iPadOS 15.0-15.3: no Array at
    expect(flagsUnsupported({ ...webgl2, ...clone }, at, {})).toBe(true);
    expect(flagsUnsupported(webgl2, at, hasOwn)).toBe(true);
    expect(html).toMatch(/<p class="ww-boot-unsupported">\s*This browser is too old for Wonder World\. On an iPad it needs iPadOS 15\.4 or later/);
    const css = readFileSync(join(uiDir, "styles.css"), "utf8");
    expect(css).toMatch(/\.ww-boot-unsupported \{\s*display: none;/);
    expect(css).toMatch(/\.ww-unsupported \.ww-boot-unsupported \{\s*display: block;/);
  });

  it("builds for Safari 15, so iPadOS 15 and 16.0-16.3 can parse the bundle (no class static blocks)", () => {
    const config = readFileSync(join(appRoot, "vite.config.ts"), "utf8");
    expect(config).toMatch(/target: \["safari15", "chrome100", "edge100", "firefox100"\]/);
    expect(readFileSync(join(appRoot, "tools/check-dist.mjs"), "utf8")).toMatch(/class static block/);
  });

  it("shows a static splash from the first paint: the start screen's dots and title, nothing to tap", () => {
    const splash = /<div class="ww-screen ww-start ww-boot"[^>]*>([\s\S]*?)<\/p>\s*<\/div>\s*<\/div>/.exec(html)?.[1] ?? "";
    expect(splash).not.toBe("");
    expect(splash).not.toMatch(/<(button|a|input|select|textarea)\b/);
    const dots = Array.from(splash.matchAll(/--ww-dot:\s*(#[0-9a-f]{6})/g), (match) => match[1]);
    expect(dots).toEqual(["momo", "lulu", "sheru", "gogo", "lumi", "peeko"].map((id) => CHARACTER_COLOURS[id as keyof typeof CHARACTER_COLOURS]));
    expect(splash).toContain(`<p class="ww-start-title">${enUiStrings["ui.start.title"]}`);
    expect(readFileSync(join(appRoot, "src/main.ts"), "utf8")).toMatch(/removeSplashUnderFirstScreen\(uiRoot\)/);
  });

  it("has no SEO or social tags, no autoplay media, no third-party script and no child name", () => {
    expect(html).not.toMatch(/og:|twitter:|rel="canonical"/);
    expect(html).not.toMatch(/<audio|<video|autoplay/i);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(CHILD_NAME, "the working folder carries the guard name").not.toBe("");
    expect(html).not.toMatch(CHILD_NAME_PATTERN);
  });
});
