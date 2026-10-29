// Parent settings store (PRD 04 E03/E07, PRD 01 section 8, PRD 06 QA-E12 and
// QA-P06): defaults, round trip, corrupt or blocked storage, and the rule that
// no identity field is ever read back or written.

import { describe, expect, it } from "vitest";
import type { ParentSettings } from "../../../src/types.js";
import { prefersMoreContrast, prefersReducedMotion } from "../../../src/ui/accessibility.js";
import { CORE_WORD_IDS, toggleWord, wordChoices, wordLabel } from "../../../src/ui/parent-wordlist.js";
import {
  AVAILABLE_LOCALES,
  PARENT_SETTINGS_FIELDS,
  SETTINGS_STORAGE_KEY,
  SFX_VOLUMES,
  WAIT_MS_DEFAULT,
  WAIT_MS_MAX,
  WAIT_MS_MIN,
  WORD_LIST_MAX,
  clampWaitMs,
  clearSettings,
  defaultSettings,
  isStorableWordId,
  loadSettings,
  safeLocalStorage,
  sanitizeSettings,
  sanitizeWordList,
  saveSettings,
  type SettingsStorage
} from "../../../src/ui/settings-store.js";

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

const blockedStorage: SettingsStorage = {
  getItem(): string | null {
    throw new Error("SecurityError: storage is blocked");
  },
  setItem(): void {
    throw new Error("QuotaExceededError: storage is full");
  },
  removeItem(): void {
    throw new Error("SecurityError: storage is blocked");
  }
};

const SETTINGS_FIELDS = ["captions", "highContrast", "locale", "mode", "music", "reducedMotion", "sfxVolume", "sound", "waitMs", "wordList"];

/** Field names that would identify a child or family; none may ever be stored. */
const IDENTITY_FIELDS = [
  "childName", "name", "nickname", "firstName", "lastName", "age", "birthday", "dob", "photo", "avatar", "voice",
  "voicePack", "email", "phone", "address", "id", "userId", "deviceId", "profile", "notes", "greeting"
];

/** A synthetic marker, not a real person's name. */
const MARKER = "SYNTHETIC-IDENTITY-MARKER-0000";

function storedRecord(storage: MemoryStorage): Record<string, unknown> {
  const text = storage.data.get(SETTINGS_STORAGE_KEY);
  expect(text).toBeTypeOf("string");
  const parsed: unknown = JSON.parse(text ?? "null");
  expect(parsed).toBeTypeOf("object");
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
}

describe("settings defaults", () => {
  it("are play together, music, sound and captions on, normal effects, 5 s wait, English, no words", () => {
    expect(defaultSettings()).toEqual({
      mode: "play-together",
      music: true,
      sound: true,
      sfxVolume: "normal",
      captions: true,
      reducedMotion: false,
      highContrast: false,
      locale: "en",
      waitMs: 5000,
      wordList: []
    });
    expect(WAIT_MS_DEFAULT).toBe(5000);
  });

  it("seed calm motion from the reduced-motion preference", () => {
    expect(defaultSettings(true).reducedMotion).toBe(true);
    expect(loadSettings(null, true).reducedMotion).toBe(true);
    expect(loadSettings(new MemoryStorage(), true).reducedMotion).toBe(true);
    expect(loadSettings(new MemoryStorage()).reducedMotion).toBe(false);
  });

  it("seed high contrast from the more-contrast preference, and only high contrast", () => {
    expect(defaultSettings(false, true)).toEqual({ ...defaultSettings(), highContrast: true });
    expect(defaultSettings(true, true)).toEqual({ ...defaultSettings(), reducedMotion: true, highContrast: true });
    expect(loadSettings(null, false, true).highContrast).toBe(true);
    expect(loadSettings(new MemoryStorage(), false, true).highContrast).toBe(true);
    expect(loadSettings(new MemoryStorage(), true).highContrast).toBe(false);
  });

  it("are returned for null or empty storage", () => {
    expect(loadSettings(null)).toEqual(defaultSettings());
    expect(loadSettings(new MemoryStorage())).toEqual(defaultSettings());
  });

  it("hold exactly the allow-listed fields", () => {
    expect(Object.keys(defaultSettings()).sort()).toEqual(SETTINGS_FIELDS);
    expect([...PARENT_SETTINGS_FIELDS].sort()).toEqual(SETTINGS_FIELDS);
  });

  it("offer English only; Punjabi is not selectable yet", () => {
    expect(AVAILABLE_LOCALES).toEqual(["en"]);
  });

  it("return a fresh object each time", () => {
    const a = loadSettings(null);
    const b = loadSettings(null);
    expect(a).not.toBe(b);
    expect(a.wordList).not.toBe(b.wordList);
  });
});

describe("device preferences that seed the defaults", () => {
  /** A window whose matchMedia matches exactly the given queries. */
  function mediaWindow(matching: readonly string[]): Pick<Window, "matchMedia"> {
    return { matchMedia: (query: string) => ({ matches: matching.includes(query), media: query }) as MediaQueryList };
  }

  it("read (prefers-contrast: more) and (prefers-reduced-motion: reduce) only", () => {
    expect(prefersMoreContrast(mediaWindow(["(prefers-contrast: more)"]))).toBe(true);
    expect(prefersMoreContrast(mediaWindow(["(prefers-contrast: less)", "(forced-colors: active)", "(prefers-reduced-motion: reduce)"]))).toBe(false);
    expect(prefersReducedMotion(mediaWindow(["(prefers-reduced-motion: reduce)"]))).toBe(true);
    expect(prefersReducedMotion(mediaWindow(["(prefers-contrast: more)"]))).toBe(false);
  });

  it("mean no preference without matchMedia or when it throws", () => {
    const throwing: Pick<Window, "matchMedia"> = {
      matchMedia(): MediaQueryList {
        throw new Error("matchMedia is not supported");
      }
    };
    for (const win of [null, undefined, throwing]) {
      expect(prefersMoreContrast(win)).toBe(false);
      expect(prefersReducedMotion(win)).toBe(false);
    }
  });

  it("seed the boot settings the way src/main.ts reads them; a stored choice still wins", () => {
    const win = mediaWindow(["(prefers-contrast: more)", "(prefers-reduced-motion: reduce)"]);
    const storage = new MemoryStorage();
    expect(loadSettings(storage, prefersReducedMotion(win), prefersMoreContrast(win))).toEqual(defaultSettings(true, true));
    saveSettings(storage, { ...defaultSettings(), highContrast: false, reducedMotion: false });
    expect(loadSettings(storage, prefersReducedMotion(win), prefersMoreContrast(win))).toEqual(defaultSettings());
  });
});

describe("settings round trip", () => {
  it("saves and loads every field", () => {
    const storage = new MemoryStorage();
    const chosen: ParentSettings = {
      mode: "watch-sing",
      music: false,
      sound: true,
      sfxVolume: "soft",
      captions: false,
      reducedMotion: true,
      highContrast: true,
      locale: "en",
      waitMs: 7000,
      wordList: ["ball", "more", "all-done"]
    };
    expect(saveSettings(storage, chosen)).toBe(true);
    expect(loadSettings(storage)).toEqual(chosen);
    expect(Object.keys(storedRecord(storage)).sort()).toEqual(SETTINGS_FIELDS);
  });

  it("keeps a stored calm-motion choice over the OS preference", () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...defaultSettings(), reducedMotion: false });
    expect(loadSettings(storage, true).reducedMotion).toBe(false);
  });

  it("keeps a stored contrast choice over the OS preference", () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...defaultSettings(), highContrast: false });
    expect(loadSettings(storage, false, true).highContrast).toBe(false);
    saveSettings(storage, { ...defaultSettings(), highContrast: true });
    expect(loadSettings(storage, false, false).highContrast).toBe(true);
    // A record without the field (written before it existed) takes the seeded default.
    storage.data.set(SETTINGS_STORAGE_KEY, JSON.stringify({ music: false }));
    expect(loadSettings(storage, false, true)).toEqual({ ...defaultSettings(false, true), music: false });
  });

  it("keeps the sound-effect level, default normal, and drops unknown levels", () => {
    expect(SFX_VOLUMES).toEqual(["off", "soft", "normal"]);
    const storage = new MemoryStorage();
    for (const level of SFX_VOLUMES) {
      saveSettings(storage, { ...defaultSettings(), sfxVolume: level });
      expect(loadSettings(storage).sfxVolume).toBe(level);
    }
    for (const bad of ["loud", "", 1, null, true]) {
      storage.data.set(SETTINGS_STORAGE_KEY, JSON.stringify({ sfxVolume: bad }));
      expect(loadSettings(storage).sfxVolume).toBe("normal");
    }
  });

  it("writes only under the app's own storage key", () => {
    const storage = new MemoryStorage();
    saveSettings(storage, defaultSettings());
    expect([...storage.data.keys()]).toEqual([SETTINGS_STORAGE_KEY]);
    expect(SETTINGS_STORAGE_KEY).toMatch(/^wonder-world\./);
  });

  it("normalises values on save", () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...defaultSettings(), waitMs: 9999, wordList: ["Ball", "ball", "go"] });
    const loaded = loadSettings(storage);
    expect(loaded.waitMs).toBe(WAIT_MS_MAX);
    expect(loaded.wordList).toEqual(["ball", "go"]);
  });

  it("clears the stored record; loading then gives defaults", () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...defaultSettings(), music: false, wordList: ["ball"] });
    expect(clearSettings(storage)).toBe(true);
    expect(storage.data.has(SETTINGS_STORAGE_KEY)).toBe(false);
    expect(loadSettings(storage)).toEqual(defaultSettings());
    expect(clearSettings(null)).toBe(true);
  });
});

describe("corrupt or blocked storage", () => {
  const corruptTexts = ["{not json", "", "null", "[]", "42", '"text"', "true", "{}", "x".repeat(5000), '{"mode":'];

  for (const text of corruptTexts) {
    it(`falls back to defaults for ${JSON.stringify(text.slice(0, 16))}`, () => {
      const storage = new MemoryStorage();
      storage.data.set(SETTINGS_STORAGE_KEY, text);
      expect(loadSettings(storage)).toEqual(defaultSettings());
      expect(loadSettings(storage, true)).toEqual(defaultSettings(true));
      expect(loadSettings(storage, true, true)).toEqual(defaultSettings(true, true));
    });
  }

  it("keeps valid fields and defaults the rest, field by field", () => {
    const storage = new MemoryStorage();
    storage.data.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        mode: "fast-forward",
        music: false,
        sound: "yes",
        captions: 0,
        reducedMotion: null,
        highContrast: true,
        locale: "pa",
        waitMs: "slow",
        wordList: "ball"
      })
    );
    expect(loadSettings(storage)).toEqual({ ...defaultSettings(), music: false, highContrast: true });
  });

  it("clamps the wait to 3-8 whole seconds", () => {
    expect(clampWaitMs(100)).toBe(WAIT_MS_MIN);
    expect(clampWaitMs(99999)).toBe(WAIT_MS_MAX);
    expect(clampWaitMs(4400)).toBe(4000);
    expect(clampWaitMs(6600)).toBe(7000);
    expect(clampWaitMs(Number.NaN)).toBe(WAIT_MS_DEFAULT);
    expect(clampWaitMs(Number.POSITIVE_INFINITY)).toBe(WAIT_MS_DEFAULT);
    expect(sanitizeSettings({ waitMs: -5 }).waitMs).toBe(WAIT_MS_MIN);
  });

  it("keeps at most five distinct, well-formed word ids", () => {
    expect(
      sanitizeWordList(["Ball", "ball", " more ", "all-done", "x".repeat(40), 7, null, "two words", "go", "stop", "up"])
    ).toEqual(["ball", "more", "all-done", "go", "stop"]);
    expect(sanitizeWordList("ball")).toEqual([]);
    expect(sanitizeWordList(undefined)).toEqual([]);
    expect(WORD_LIST_MAX).toBe(5);
  });

  it("survives storage that throws on every call", () => {
    expect(loadSettings(blockedStorage)).toEqual(defaultSettings());
    expect(loadSettings(blockedStorage, true)).toEqual(defaultSettings(true));
    expect(loadSettings(blockedStorage, false, true)).toEqual(defaultSettings(false, true));
    expect(saveSettings(blockedStorage, defaultSettings())).toBe(false);
    expect(clearSettings(blockedStorage)).toBe(false);
    expect(saveSettings(null, defaultSettings())).toBe(false);
  });

  it("finds no storage when localStorage is missing or blocked", () => {
    expect(safeLocalStorage(null)).toBeNull();
    expect(safeLocalStorage(undefined)).toBeNull();
    const blocked = {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      }
    };
    expect(safeLocalStorage(blocked)).toBeNull();
  });
});

describe("no identity fields", () => {
  it("drops identity fields found in storage", () => {
    const storage = new MemoryStorage();
    const record: Record<string, unknown> = { ...defaultSettings(), music: false };
    for (const field of IDENTITY_FIELDS) record[field] = MARKER;
    storage.data.set(SETTINGS_STORAGE_KEY, JSON.stringify(record));

    const loaded = loadSettings(storage);
    expect(Object.keys(loaded).sort()).toEqual(SETTINGS_FIELDS);
    expect(loaded.music).toBe(false);
    for (const field of IDENTITY_FIELDS) expect(field in loaded).toBe(false);

    saveSettings(storage, loaded);
    const text = storage.data.get(SETTINGS_STORAGE_KEY) ?? "";
    expect(text).not.toContain(MARKER);
    expect(Object.keys(storedRecord(storage)).sort()).toEqual(SETTINGS_FIELDS);
  });

  it("never writes extra properties smuggled into a settings object", () => {
    const storage = new MemoryStorage();
    const smuggled = { ...defaultSettings(), childName: MARKER, photo: MARKER, voice: MARKER };
    saveSettings(storage, smuggled);
    const text = storage.data.get(SETTINGS_STORAGE_KEY) ?? "";
    expect(text).not.toContain(MARKER);
    for (const field of IDENTITY_FIELDS) expect(text).not.toContain(`"${field}"`);
  });

  it("keeps only content catalog word ids in the word list, so it cannot carry free text", () => {
    expect(sanitizeWordList([MARKER, "Hello there", "notaword", "ball"])).toEqual(["ball"]);
    expect(isStorableWordId(MARKER.toLowerCase())).toBe(false);
    expect(isStorableWordId("ball")).toBe(true);
    expect(isStorableWordId("all-done")).toBe(true);
    const storage = new MemoryStorage();
    storage.data.set(SETTINGS_STORAGE_KEY, JSON.stringify({ ...defaultSettings(), wordList: ["notaword", "more"] }));
    expect(loadSettings(storage).wordList).toEqual(["more"]);
  });
});

describe("parent word list helpers", () => {
  it("toggles words and stops at the limit", () => {
    expect(toggleWord([], "ball")).toEqual(["ball"]);
    expect(toggleWord(["ball", "go"], "ball")).toEqual(["go"]);
    const full = ["a", "b", "c", "d", "e"];
    expect(toggleWord(full, "f")).toEqual(full);
    expect(toggleWord(full, "c")).toEqual(["a", "b", "d", "e"]);
  });

  it("offers the PRD 01 functional words, all catalog ids, unique, with readable labels", () => {
    const choices = wordChoices();
    expect(choices.map((choice) => choice.id)).toEqual([...CORE_WORD_IDS]);
    expect(CORE_WORD_IDS.filter((id) => !isStorableWordId(id))).toEqual([]);
    expect(new Set(CORE_WORD_IDS).size).toBe(CORE_WORD_IDS.length);
    expect(wordChoices(["ball", "notaword"]).map((choice) => choice.id)).toEqual(["ball"]);
    expect(sanitizeWordList(CORE_WORD_IDS.slice(0, 5))).toEqual(CORE_WORD_IDS.slice(0, 5));
    for (const id of ["more", "go", "stop", "open", "hi", "bye", "ball"]) expect(CORE_WORD_IDS).toContain(id);
    expect(wordLabel("all-done")).toBe("all done");
    expect(wordChoices(["ball", "ball", "Bad Id", "my-turn"])).toEqual([
      { id: "ball", label: "ball" },
      { id: "my-turn", label: "my turn" }
    ]);
  });
});
