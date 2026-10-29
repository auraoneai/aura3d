// B08 session gate (pause on hide, never auto-resume, no auto-next), plus the
// two other session-setup modules: B11 feature flags (voice input can never
// be turned on) and B10 locale selection (English fallback, no hard-coded text).
import { describe, expect, it } from "vitest";
import type { DirectorEffect, EpisodeSpec, LocalePack } from "../../../src/types.js";
import { AUTO_NEXT, createSessionGate, type VisibilityDocument } from "../../../src/runtime/session-gate.js";
import { createEpisodeDirector } from "../../../src/runtime/episode-director.js";
import { FEATURE_FLAGS, readFlags } from "../../../src/runtime/feature-flags.js";
import { createLocale, FALLBACK_LOCALE, resolveLocale } from "../../../src/runtime/locale.js";

interface FakeDocument {
  readonly doc: VisibilityDocument;
  setVisibility(state: DocumentVisibilityState): void;
  listenerCount(): number;
}

function fakeDocument(initial: DocumentVisibilityState = "visible"): FakeDocument {
  let state: DocumentVisibilityState = initial;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const doc: VisibilityDocument = {
    get visibilityState() {
      return state;
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (type === "visibilitychange" && listener) listeners.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (type === "visibilitychange" && listener) listeners.delete(listener);
    }
  };
  return {
    doc,
    setVisibility(next) {
      state = next;
      const event = new Event("visibilitychange");
      for (const listener of [...listeners]) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    },
    listenerCount: () => listeners.size
  };
}

describe("session gate", () => {
  it("never plays the next story by itself", () => {
    expect(AUTO_NEXT).toBe(false);
  });

  it("calls onHide once when the page hides and onShow once when it shows again", () => {
    const page = fakeDocument();
    const calls: string[] = [];
    createSessionGate(page.doc, { onHide: () => calls.push("hide"), onShow: () => calls.push("show") });
    expect(page.listenerCount()).toBe(1);
    page.setVisibility("hidden");
    page.setVisibility("hidden");
    page.setVisibility("visible");
    page.setVisibility("visible");
    page.setVisibility("hidden");
    expect(calls).toEqual(["hide", "show", "hide"]);
  });

  it("starting hidden waits for the page to show before reporting anything", () => {
    const page = fakeDocument("hidden");
    const calls: string[] = [];
    createSessionGate(page.doc, { onHide: () => calls.push("hide"), onShow: () => calls.push("show") });
    page.setVisibility("hidden");
    expect(calls).toEqual([]);
    page.setVisibility("visible");
    expect(calls).toEqual(["show"]);
  });

  it("dispose stops listening, and a second dispose is harmless", () => {
    const page = fakeDocument();
    const calls: string[] = [];
    const gate = createSessionGate(page.doc, { onHide: () => calls.push("hide"), onShow: () => calls.push("show") });
    gate.dispose();
    gate.dispose();
    expect(page.listenerCount()).toBe(0);
    page.setVisibility("hidden");
    page.setVisibility("visible");
    expect(calls).toEqual([]);
  });

  it("wired to the director: hiding pauses, showing never resumes speech, a grown-up resumes", () => {
    const story: EpisodeSpec = {
      kind: "episode",
      id: "gate-fixture",
      number: 1,
      version: 1,
      phase: "P1",
      titleKey: "t04.title",
      world: "home-nook",
      host: "momo",
      cast: [{ id: "momo", at: "center" }],
      props: [],
      targetWords: ["hi"],
      supportWords: [],
      offlinePlayKey: "t04.offline",
      caregiverBridgeKey: "t04.bridge",
      review: { language: "approved", rights: "approved", reviewer: "agent:test fixture", date: "2026-10-29" },
      estimatedDurationSec: 120,
      beats: [{ id: "hello", kind: "greeting", stage: [], lines: [{ speaker: "momo", key: "t04.hello.1" }], holdMs: 1000 }]
    };
    const director = createEpisodeDirector(story, { lineMs: () => 1000 });
    const effects: DirectorEffect[] = [];
    const page = fakeDocument();
    createSessionGate(page.doc, {
      onHide: () => effects.push(...director.send({ type: "PAUSE" })),
      onShow: () => undefined
    });
    director.send({ type: "START", mode: "watch-sing" });
    page.setVisibility("hidden");
    expect(effects).toEqual([{ type: "pauseMedia" }]);
    page.setVisibility("visible");
    expect(director.snapshot().phase).toBe("paused");
    expect(director.send({ type: "TICK", dtMs: 5000 })).toEqual([]);
    expect(director.send({ type: "RESUME" })).toEqual([{ type: "resumeMedia" }]);
    expect(director.snapshot().phase).toBe("speaking");
  });
});

describe("feature flags", () => {
  it("every optional and future module is off, and the flags cannot be changed", () => {
    expect(FEATURE_FLAGS).toEqual({ voiceInput: false, soundPresence: false, punjabiPack: false, familyPacks: false, parentNotes: false });
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
    expect(Object.values(FEATURE_FLAGS).every((on) => on === false)).toBe(true);
  });

  it("no URL can turn voice input or sound presence on", () => {
    for (const search of [
      "",
      "?voiceInput=1",
      "?voiceInput=true&soundPresence=1",
      "voiceInput",
      "?voiceinput=1&VOICEINPUT=1&mic=1&microphone=on",
      "?punjabiPack=1&familyPacks=1&parentNotes=1"
    ]) {
      const flags = readFlags(search);
      expect(flags.voiceInput).toBe(false);
      expect(flags.soundPresence).toBe(false);
      expect(flags.punjabiPack).toBe(false);
      expect(flags.familyPacks).toBe(false);
      expect(flags.parentNotes).toBe(false);
      expect(Object.isFrozen(flags)).toBe(true);
    }
  });

  it("reads the page switches: models, diagnostics, audio and reduced motion", () => {
    expect(readFlags("")).toMatchObject({ models: true, diag: false, audio: true, reducedMotion: false });
    expect(readFlags("?models=0")).toMatchObject({ models: false });
    expect(readFlags("?models=false&audio=off")).toMatchObject({ models: false, audio: false });
    expect(readFlags("?models=1&audio=1")).toMatchObject({ models: true, audio: true });
    expect(readFlags("?diag=1&reducedMotion=1")).toMatchObject({ diag: true, reducedMotion: true });
    expect(readFlags("?diag=0")).toMatchObject({ diag: false });
  });
});

describe("locale", () => {
  const en: LocalePack = {
    locale: "en",
    lines: { "t05.hello.1": "Hi! I'm Momo.", "t05.ball.1": "Ball!" },
    strings: { "t05.title": "Hello Test", "ui.pause": "Pause", "t05.offline": "Roll a real ball together." }
  };
  const pa: LocalePack = {
    locale: "pa",
    lines: { "t05.hello.1": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਮੋਮੋ ਹਾਂ।" },
    strings: { "ui.pause": "ਰੋਕੋ" }
  };
  const packs = { en, pa };

  it("uses the requested pack and falls back to English key by key", () => {
    const locale = createLocale(packs, "pa");
    expect(locale.locale).toBe("pa");
    expect(locale.line("t05.hello.1")).toBe("ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਮੋਮੋ ਹਾਂ।");
    expect(locale.line("t05.ball.1")).toBe("Ball!");
    expect(locale.str("ui.pause")).toBe("ਰੋਕੋ");
    expect(locale.str("t05.title")).toBe("Hello Test");
  });

  it("finds a pack by base language and falls back to English for unknown locales", () => {
    expect(resolveLocale(packs, "en-GB")).toBe("en");
    expect(resolveLocale(packs, "pa_IN")).toBe("pa");
    expect(resolveLocale(packs, "PA")).toBe("pa");
    expect(resolveLocale(packs, "fr")).toBe(FALLBACK_LOCALE);
    expect(resolveLocale(packs, "")).toBe(FALLBACK_LOCALE);
    expect(resolveLocale({ pa }, "fr")).toBeNull();
    expect(createLocale(packs, "fr").locale).toBe("en");
    expect(createLocale(packs, "fr").line("t05.ball.1")).toBe("Ball!");
  });

  it("invents no text: a missing key gives the caller's fallback or the key itself", () => {
    const locale = createLocale(packs, "en");
    expect(locale.str("ui.missing", "Grown-up fallback")).toBe("Grown-up fallback");
    expect(locale.str("ui.missing")).toBe("ui.missing");
    expect(locale.line("t05.missing.1")).toBe("t05.missing.1");
    const empty = createLocale({}, "en");
    expect(empty.locale).toBe("en");
    expect(empty.line("t05.hello.1")).toBe("t05.hello.1");
    expect(empty.has("t05.hello.1")).toBe(false);
  });

  it("has() checks lines and strings in the pack in use and in English", () => {
    const locale = createLocale(packs, "pa");
    expect(locale.has("t05.hello.1")).toBe(true);
    expect(locale.has("t05.ball.1")).toBe(true);
    expect(locale.has("t05.offline")).toBe(true);
    expect(locale.has("t05.nope")).toBe(false);
  });

  it("only reads the packs' own keys (no prototype lookups)", () => {
    const locale = createLocale(packs, "en");
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(locale.line(key)).toBe(key);
      expect(locale.str(key)).toBe(key);
      expect(locale.has(key)).toBe(false);
    }
  });

  it("lines and strings stay separate", () => {
    const locale = createLocale(packs, "en");
    expect(locale.line("t05.title")).toBe("t05.title");
    expect(locale.str("t05.ball.1")).toBe("t05.ball.1");
  });
});
