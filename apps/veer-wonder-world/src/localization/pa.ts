// Punjabi locale pack & P4 broadcast show dubbing pack (PRD 04 C08; PRD 09 P4).
//
// For the 42 interactive app stories, `PA_STATUS.enabled` stays `false` and `pa`
// stays empty until all 42 stories are native-voiced and reviewed (07 B16,
// tested in content-schema.test.ts).
//
// For broadcast `ShowSpec` episodes and 9:16 Shorts (PRD 09 P4), `PA_SHOW_PACK`
// and `paShowLocale(...)` provide reviewed Gurmukhi Punjabi UI strings, show
// strings, and spoken dubbing lines (`s01e01-short-sheru` pilot + extensible
// `mergeShowLocale` helper), with zero type assertions and zero child data.

import type { LocalePack } from "../types.js";

export interface LocalePart {
  readonly lines?: Readonly<Record<string, string>>;
  readonly strings?: Readonly<Record<string, string>>;
}

export const PA_STATUS = {
  enabled: false,
  reason: "Native-speaker writing, voicing and review are required before a Punjabi pack is enabled (PRD 04 C08).",
  review: null
} as const;

/** Empty on purpose for the 42-story interactive catalog until full story dubbing lands. */
export const pa: LocalePack = { locale: "pa", lines: {}, strings: {} };

export const PA_SHOW_STATUS = {
  enabled: true,
  locale: "pa",
  label: "ਪੰਜਾਬੀ",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "wonder-world-p4-pa-dubbing",
    date: "2026-11-13"
  }
} as const;

export const PA_UI_STRINGS: Readonly<Record<string, string>> = {
  // Start screen.
  "ui.start.title": "ਵੰਡਰ ਵਰਲਡ",
  "ui.start.welcome": "ਜੀ ਆਇਆਂ ਨੂੰ",
  "ui.start.welcomeNamed": "{name} ਦਾ ਵੰਡਰ ਵਰਲਡ",
  "ui.start.tap": "ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਛੂਹੋ",
  "ui.start.sound": "ਛੂਹਣ ਤੋਂ ਬਾਅਦ ਆਵਾਜ਼ ਚੱਲੇਗੀ।",
  "ui.prototype": "ਨਮੂਨਾ",
  "ui.loading": "ਤਿਆਰ ਹੋ ਰਿਹਾ ਹੈ...",
  "ui.stage.unavailable": "ਇਸ ਡਿਵਾਈਸ ਉੱਤੇ 3D ਤਸਵੀਰਾਂ ਸ਼ੁਰੂ ਨਹੀਂ ਹੋ ਸਕੀਆਂ। ਪੰਨਾ ਮੁੜ ਲੋਡ ਕਰੋ ਜਾਂ ਹੋਰ ਬ੍ਰਾਊਜ਼ਰ ਵਰਤੋ।",
  "ui.audio.unavailable": "ਇਸ ਵੇਲੇ ਆਵਾਜ਼ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। ਕਹਾਣੀ ਤਸਵੀਰਾਂ ਅਤੇ ਲਿਖਤ ਨਾਲ ਚੱਲਦੀ ਰਹੇਗੀ।",

  // Modes.
  "ui.mode.label": "ਤੁਸੀਂ ਕਿਵੇਂ ਖੇਡਣਾ ਚਾਹੁੰਦੇ ਹੋ?",
  "ui.mode.play": "ਮਿਲ ਕੇ ਖੇਡੋ",
  "ui.mode.watch": "ਵੇਖੋ ਅਤੇ ਗਾਓ",
  "ui.mode.auto": "ਆਪੇ ਚੱਲਣ ਦਿਓ",
  "ui.mode.windDown": "ਸ਼ਾਂਤ ਸ਼ਾਮ",
  "ui.mode.broadcast": "ਪ੍ਰਸਾਰਣ",

  // Menu.
  "ui.menu.title": "ਕਹਾਣੀ ਜਾਂ ਖੇਡ ਚੁਣੋ",
  "ui.menu.label": "ਕਹਾਣੀਆਂ ਅਤੇ ਖੇਡਾਂ",
  "ui.menu.all": "ਸਭ",
  "ui.menu.sleep": "ਨੀਂਦ ਅਤੇ ਲੋਰੀਆਂ",
  "ui.menu.songs": "ਗੀਤ",
  "ui.menu.playLullabies": "ਸਾਰੀਆਂ ਲੋਰੀਆਂ ਚਲਾਓ",
  "ui.menu.episodes": "ਕਹਾਣੀਆਂ",
  "ui.menu.activities": "ਖੇਡਾਂ",

  // Grown-up controls during play.
  "ui.controls.label": "ਵੱਡਿਆਂ ਲਈ ਕੰਟਰੋਲ",
  "ui.fullscreen.enter": "ਪੂਰੀ ਸਕ੍ਰੀਨ",
  "ui.fullscreen.exit": "ਪੂਰੀ ਸਕ੍ਰੀਨ ਬੰਦ ਕਰੋ",
  "ui.fullscreen.iosSwipe": "ਪੂਰੀ ਸਕ੍ਰੀਨ ਲਈ ਉੱਪਰ ਵੱਲ ਸਵਾਈਪ ਕਰੋ ਜਾਂ ਪਤਾ-ਪੱਟੀ ਮੀਨੂ ਤੋਂ ਟੂਲਬਾਰ ਲੁਕਾਓ ਚੁਣੋ।",
  "ui.fullscreen.iosHome": "ਬਿਨਾਂ ਬ੍ਰਾਊਜ਼ਰ ਪੱਟੀ ਤੋਂ ਪੂਰੀ ਸਕ੍ਰੀਨ ਲਈ ਸਫਾਰੀ ਵਿੱਚ ਹੋਮ ਸਕ੍ਰੀਨ ਤੇ ਜੋੜੋ ਚੁਣੋ।",
  "ui.fullscreen.iosClose": "ਠੀਕ ਹੈ",
  "ui.pause": "ਰੋਕੋ",
  "ui.resume": "ਚਲਾਓ",
  "ui.replay": "ਸ਼ਬਦ ਦੁਬਾਰਾ ਸੁਣੋ",
  "ui.allDone": "ਸਭ ਪੂਰਾ ਹੋਇਆ",
  "ui.parentButton": "ਵੱਡਿਆਂ ਦੀਆਂ ਸੈਟਿੰਗਾਂ",
  "ui.confirm": "ਬੱਚੇ ਦੀ ਵਾਰੀ ਹੋ ਗਈ",
  "ui.captions.label": "ਲਿਖਤ",

  // End-of-story card.
  "ui.offline.title": "ਸਭ ਪੂਰਾ! ਹੁਣ ਇਹ ਕਰ ਕੇ ਵੇਖੋ...",
  "ui.offline.done": "ਕਹਾਣੀਆਂ ਵੱਲ ਵਾਪਸ",
  "ui.sleep.title": "ਸ਼ਸ਼... ਮਿੱਠੇ ਸੁਪਨੇ",
  "ui.sleep.body": "ਹੁਣ ਸਭ ਸ਼ਾਂਤ ਹੈ। ਸਕ੍ਰੀਨ ਨੂੰ ਆਰਾਮ ਦਿਓ ਅਤੇ ਪਿਆਰ ਨਾਲ ਕੋਲ ਬੈਠੋ।",

  // Parent gate.
  "ui.gate.title": "ਵੱਡਿਆਂ ਲਈ",
  "ui.gate.hold": "ਸੈਟਿੰਗਾਂ ਖੋਲ੍ਹਣ ਲਈ ਬਟਨ ਨੂੰ 2 ਸਕਿੰਟ ਦਬਾ ਕੇ ਰੱਖੋ।",
  "ui.gate.button": "ਖੋਲ੍ਹਣ ਲਈ ਦਬਾ ਕੇ ਰੱਖੋ",
  "ui.gate.holding": "ਦਬਾ ਕੇ ਰੱਖੋ...",
  "ui.gate.again": "ਥੋੜ੍ਹਾ ਹੋਰ ਚਿਰ ਦਬਾ ਕੇ ਰੱਖੋ।",
  "ui.gate.cancel": "ਹੁਣੇ ਨਹੀਂ",
  "ui.gate.note": "ਇਹ ਕਦਮ ਖੇਡ ਦੌਰਾਨ ਸੈਟਿੰਗਾਂ ਨੂੰ ਪਾਸੇ ਰੱਖਦਾ ਹੈ। ਇਹ ਤਾਲਾ ਨਹੀਂ ਹੈ।",

  // Parent panel.
  "ui.parent.title": "ਵੱਡਿਆਂ ਦੀਆਂ ਸੈਟਿੰਗਾਂ",
  "ui.parent.open": "ਵੱਡਿਆਂ ਦੀਆਂ ਸੈਟਿੰਗਾਂ",
  "ui.parent.close": "ਸੈਟਿੰਗਾਂ ਬੰਦ ਕਰੋ",
  "ui.parent.back": "ਕਹਾਣੀ ਵੱਲ ਵਾਪਸ",
  "ui.parent.exit": "ਮੀਨੂ ਉੱਤੇ ਜਾਓ",
  "ui.parent.clear": "ਇਸ ਡਿਵਾਈਸ ਦੀਆਂ ਸੈਟਿੰਗਾਂ ਸਾਫ਼ ਕਰੋ",
  "ui.parent.reset": "ਇਸ ਡਿਵਾਈਸ ਦੀਆਂ ਸੈਟਿੰਗਾਂ ਸਾਫ਼ ਕਰੋ",
  "ui.parent.mode": "ਢੰਗ",
  "ui.parent.display": "ਆਵਾਜ਼ ਅਤੇ ਦਿਖਾਵਾ",
  "ui.parent.music": "ਸੰਗੀਤ",
  "ui.parent.sound": "ਆਵਾਜ਼ ਅਤੇ ਬੋਲ",
  "ui.parent.sfx": "ਆਵਾਜ਼ ਪ੍ਰਭਾਵ",
  "ui.parent.sfxHelp": "ਜਾਨਵਰਾਂ ਦੀਆਂ ਆਵਾਜ਼ਾਂ, ਬੁਲਬੁਲੇ ਅਤੇ ਘੰਟੀਆਂ। ਬੋਲ ਅਤੇ ਗੀਤ ਇੱਕੋ ਪੱਧਰ ਤੇ ਰਹਿੰਦੇ ਹਨ।",
  "ui.parent.sfx.off": "ਬੰਦ",
  "ui.parent.sfx.soft": "ਧੀਮਾ",
  "ui.parent.sfx.normal": "ਸਧਾਰਨ",
  "ui.parent.captions": "ਲਿਖਤ",
  "ui.parent.reducedMotion": "ਸ਼ਾਂਤ ਹਿੱਲਜੁਲ",
  "ui.parent.highContrast": "ਵੱਧ ਸਪਸ਼ਟਤਾ ਅਤੇ ਵੱਡੇ ਅੱਖਰ",
  "ui.parent.windDown": "ਸ਼ਾਮ ਦਾ ਆਰਾਮ",
  "ui.parent.windDownHelp": "ਸੌਣ ਦੇ ਸਮੇਂ ਲਈ ਨਿੱਘੇ ਰੰਗ, ਧੀਮੀ ਚਾਲ ਅਤੇ ਨਰਮ ਰੌਸ਼ਨੀ।",
  "ui.parent.sleepTimer": "ਨੀਂਦ ਟਾਈਮਰ",
  "ui.parent.sleepTimerHelp": "ਆਵਾਜ਼ ਨੂੰ ਹੌਲੀ-ਹੌਲੀ ਸ਼ਾਂਤ ਕਰ ਕੇ ਹਨੇਰੀ ਸ਼ੁਭ-ਰਾਤ ਸਕ੍ਰੀਨ ਤੇ ਰੁਕਦਾ ਹੈ।",
  "ui.parent.sleepTimerOff": "ਬੰਦ",
  "ui.parent.wait": "ਵਾਰੀ ਲਈ ਉਡੀਕ ਸਮਾਂ",
  "ui.parent.waitHelp": "ਪਾਤਰ ਤੁਹਾਡੇ ਬੱਚੇ ਲਈ ਕਿੰਨਾ ਚਿਰ ਰੁਕਦਾ ਹੈ। ਕਹਾਣੀ ਹਮੇਸ਼ਾ ਆਪੇ ਅੱਗੇ ਵੱਧਦੀ ਹੈ।",
  "ui.parent.seconds": "{s} ਸਕਿੰਟ",
  "ui.parent.words": "ਅੱਜ ਦੇ ਸ਼ਬਦ",
  "ui.parent.wordsHelp": "ਖੇਡਦੇ ਸਮੇਂ ਅਕਸਰ ਵਰਤਣ ਲਈ 5 ਤੱਕ ਸ਼ਬਦ ਚੁਣੋ। ਇਹ ਸੂਚੀ ਇਸੇ ਡਿਵਾਈਸ ਤੇ ਰਹਿੰਦੀ ਹੈ।",
  "ui.parent.wordsEmpty": "ਹਾਲੇ ਕੋਈ ਸ਼ਬਦ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।",
  "ui.parent.wordsCount": "{max} ਵਿੱਚੋਂ {n} ਚੁਣੇ",
  "ui.parent.locale": "ਭਾਸ਼ਾ",
  "ui.parent.language": "ਭਾਸ਼ਾ",
  "ui.parent.locale.en": "English",
  "ui.parent.locale.pa": "ਪੰਜਾਬੀ",
  "ui.parent.locale.es": "Español",
  "ui.parent.locale.hi": "हिन्दी",

  // Guidance.
  "ui.guide.title": "ਮਿਲ ਕੇ ਖੇਡਣ ਦੇ ਤਰੀਕੇ",
  "ui.guide.1": "ਜਿਸ ਚੀਜ਼ ਵੱਲ ਬੱਚਾ ਵੇਖੇ, ਉਸ ਦਾ ਨਾਂ ਦੱਸੋ।",
  "ui.guide.2": "ਬੱਚੇ ਦੀ ਵਾਰੀ ਲਈ ਰੁਕੋ।",
  "ui.guide.3": "ਆਵਾਜ਼ ਜਾਂ ਇਸ਼ਾਰੇ ਨੂੰ ਅੱਗੇ ਵਧਾਓ।",
  "ui.guide.4": "ਅਸਲੀ ਖਿਡੌਣੇ ਨਾਲ ਕਰ ਕੇ ਵੇਖੋ।",

  // Notes.
  "ui.note.title": "ਵੰਡਰ ਵਰਲਡ ਬਾਰੇ",
  "ui.note.start": "ਜਦੋਂ ਹੋ ਸਕੇ ਆਪਣੇ ਬੱਚੇ ਦੇ ਨਾਲ ਬੈਠ ਕੇ ਖੇਡੋ। ਸਾਰੀਆਂ ਖੇਡਾਂ ਛੂਹਣ ਨਾਲ ਚੱਲਦੀਆਂ ਹਨ; ਬੋਲਣਾ ਲਾਜ਼ਮੀ ਨਹੀਂ।",
  "ui.note.safety":
    "ਇਹ ਖੇਡ ਅਤੇ ਭਾਸ਼ਾ ਨਾਲ ਜਾਣ-ਪਛਾਣ ਹੈ, ਇਲਾਜ ਨਹੀਂ। ਵੰਡਰ ਵਰਲਡ ਕੋਈ ਪਰਖ ਜਾਂ ਅੰਕ ਨਹੀਂ ਦਿੰਦਾ। ਜੇ ਬੋਲਣ ਜਾਂ ਸੁਣਨ ਬਾਰੇ ਕੋਈ ਸਵਾਲ ਹੋਵੇ ਤਾਂ ਬੱਚਿਆਂ ਦੇ ਡਾਕਟਰ ਨਾਲ ਗੱਲ ਕਰੋ।",
  "ui.note.privacy":
    "ਕੋਈ ਖਾਤਾ ਨਹੀਂ, ਕੋਈ ਮਾਈਕ੍ਰੋਫ਼ੋਨ ਨਹੀਂ, ਇਸ ਡਿਵਾਈਸ ਤੋਂ ਬਾਹਰ ਕੁਝ ਨਹੀਂ ਜਾਂਦਾ। ਕੋਈ ਇਸ਼ਤਿਹਾਰ ਨਹੀਂ ਅਤੇ ਕੋਈ ਟ੍ਰੈਕਿੰਗ ਨਹੀਂ।",
  "ui.note.links": "ਵੱਡਿਆਂ ਲਈ ਪੜ੍ਹਨਯੋਗ:",
  "ui.note.aap": "AAP: ਛੋਟੇ ਬੱਚੇ ਅਤੇ ਮੀਡੀਆ",
  "ui.note.asha": "ASHA: ਬੋਲੀ ਅਤੇ ਭਾਸ਼ਾ ਦਾ ਵਿਕਾਸ",

  // Song titles.
  "ui.song.hello": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਗੀਤ",
  "ui.song.allDone": "ਸਭ ਪੂਰਾ ਗੀਤ",
  "ui.song.ballRolls": "ਗੇਂਦ ਰੁੜ੍ਹਦੀ ਹੈ",
  "ui.song.goStop": "ਲੂਲੂ ਨਾਲ ਚੱਲੋ ਅਤੇ ਰੁਕੋ",
  "ui.song.faceSong": "ਹੱਸਮੁੱਖ ਚਿਹਰੇ",
  "ui.song.peekaboo": "ਲੁਕਣ-ਮੀਟੀ ਗੀਤ",
  "ui.song.animalBand": "ਨਿੱਕਾ ਜਾਨਵਰ ਬੈਂਡ",
  "ui.song.countToThree": "ਤਿੰਨ ਤੱਕ ਗਿਣਤੀ",
  "ui.song.bubbleSong": "ਬੁਲਬੁਲੇ ਗੀਤ",
  "ui.song.birthday": "ਨਿੱਕਾ ਕੇਕ ਗੀਤ",
  "ui.song.colours": "ਲਾਲ ਅਤੇ ਨੀਲਾ",
  "ui.song.shapes": "ਬੇਕਰੀ ਵਿੱਚ ਆਕਾਰ",
  "ui.song.trainSong": "ਗੋਗੋ ਦੀ ਰੇਲ ਗੀਤ",
  "ui.song.routine": "ਮੋਮੋ ਦਾ ਦਿਨ ਗੀਤ",
  "ui.song.abc": "B ਤੋਂ ਗੇਂਦ",
  "ui.song.lullaby": "ਚੰਨ ਦੀ ਲੋਰੀ",
  "ui.song.twinkleRest": "ਨਿੱਕਾ ਤਾਰਾ ਆਰਾਮ",
  "ui.song.rockingCradle": "ਝੂਲਦਾ ਪੰਘੂੜਾ ਗੀਤ",
  "ui.song.sleepyClouds": "ਨੀਂਦਰੇ ਬੱਦਲ",
  "ui.song.teddyGoodnight": "ਸ਼ੁਭ ਰਾਤ, ਨਿੱਕੇ ਭਾਲੂ",
  "ui.song.countingSheepSong": "ਤਿੰਨ ਨਰਮ ਭੇਡਾਂ",
  "ui.song.warmBlanketSong": "ਨਿੱਘਾ ਕੰਬਲ ਗੀਤ",
  "ui.song.cricketHush": "ਸ਼ਾਂਤ ਬਾਗ਼ ਦੀ ਲੋਰੀ",
  "ui.song.dreamBoatSong": "ਸ਼ਾਂਤ ਰਾਤ ਦੀ ਰੇਲ",
  "ui.song.moonMusicBox": "ਚਾਨਣੀ ਸੰਗੀਤ ਡੱਬੀ",
  "ui.song.starlightHum": "ਤਾਰਿਆਂ ਦੀ ਮਿੱਠੀ ਗੁਣਗੁਣਾਹਟ",
  "ui.song.wonderTheme": "ਜੀ ਆਇਆਂ ਨੂੰ ਵੰਡਰ ਵਰਲਡ",
  "ui.song.wonderThemeShort": "ਵੰਡਰ ਵਰਲਡ ਸੰਗੀਤ ਧੁਨ",

  // Caption speaker names.
  "ui.speaker.momo": "ਮੋਮੋ",
  "ui.speaker.lulu": "ਲੂਲੂ",
  "ui.speaker.sheru": "ਸ਼ੇਰੂ",
  "ui.speaker.gogo": "ਗੋਗੋ",
  "ui.speaker.lumi": "ਲੂਮੀ",
  "ui.speaker.peeko": "ਪੀਕੋ",
  "ui.speaker.tiko": "ਟੀਕੋ",
  "ui.speaker.robot": "ਨਿੱਕਾ ਰੋਬੋਟ"
};

/** Punjabi dubbing pack for the `s01e01-short-sheru` pilot Short (and Segment 2 of S01E01). */
export const PA_S01E01_SHORT_SHERU: LocalePart = {
  lines: {
    // Standalone Short keys (`s01e01s1.*`).
    "s01e01s1.hook.1": "ਸ਼ੇਰੂ! ਕੀ ਤੂੰ ਗੇਂਦ ਲੱਭ ਸਕਦਾ ਹੈਂ?",
    "s01e01s1.s2-sheru-in.1": "ਸ਼ੇਰੂ! ਕੀ ਤੂੰ ਗੇਂਦ ਲੱਭ ਸਕਦਾ ਹੈਂ?",
    "s01e01s1.wrong-1.1": "ਕੀ ਇਹ... ਗੇਂਦ ਹੈ?",
    "s01e01s1.s2-wrong-1.1": "ਕੀ ਇਹ... ਗੇਂਦ ਹੈ?",
    "s01e01s1.pause-1.1": "ਹੰਮ? ਦੱਸੋ ਭਲਾ?",
    "s01e01s1.pause-1.r1": "ਨਹੀਂ! ਇਹ ਤਾਂ ਸਪੰਜ ਹੈ, ਸ਼ੇਰੂ!",
    "s01e01s1.s2-pause-1.1": "ਹੰਮ? ਦੱਸੋ ਭਲਾ?",
    "s01e01s1.s2-pause-1.r1": "ਨਹੀਂ! ਇਹ ਤਾਂ ਸਪੰਜ ਹੈ, ਸ਼ੇਰੂ!",
    "s01e01s1.wrong-2.1": "ਬੁਲਬੁਲੇ ਵਾਲੀ ਛੜੀ? ਭੋਲਾ ਸ਼ੇਰੂ!",
    "s01e01s1.s2-wrong-2.1": "ਬੁਲਬੁਲੇ ਵਾਲੀ ਛੜੀ? ਭੋਲਾ ਸ਼ੇਰੂ!",
    "s01e01s1.right.1": "ਗੇਂਦ! ਹਾਂ! ਸ਼ੁਕਰੀਆ, ਸ਼ੇਰੂ!",
    "s01e01s1.s2-right.1": "ਗੇਂਦ! ਹਾਂ! ਸ਼ੁਕਰੀਆ, ਸ਼ੇਰੂ!",
    "s01e01s1.count-1.1": "ਇੱਕ! ਪਾਰਟੀ ਦੀ ਇੱਕ ਚੀਜ਼।",
    "s01e01s1.count-1.2": "ਇੱਕ ਗੇਂਦ।",
    "s01e01s1.s2-count-1.1": "ਇੱਕ! ਪਾਰਟੀ ਦੀ ਇੱਕ ਚੀਜ਼।",
    "s01e01s1.s2-count-1.2": "ਇੱਕ ਗੇਂਦ।",
    "s01e01s1.outro.1": "ਅਲਵਿਦਾ, ਦੋਸਤੋ!",

    // Parent episode Segment 2 keys (`s01e01.s2-*`) when Short references parent keys.
    "s01e01.s2-hi.1": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਮੋਮੋ ਹਾਂ।",
    "s01e01.s2-hi.2": "ਪਤਾ ਕੀ? ਇੱਕ ਨਵਾਂ ਦੋਸਤ ਆ ਰਿਹਾ!",
    "s01e01.s2-who.1": "ਕੌਣ? ਤੁਸੀਂ! ਤੁਸੀਂ ਸਾਡੇ ਨਵੇਂ ਦੋਸਤ ਹੋ!",
    "s01e01.s2-who.2": "ਚਲੋ ਸਵਾਗਤ ਪਾਰਟੀ ਕਰੀਏ!",
    "s01e01.s2-five.1": "ਪਾਰਟੀ ਲਈ ਪੰਜ ਚੀਜ਼ਾਂ ਚਾਹੀਦੀਆਂ ਹਨ।",
    "s01e01.s2-five.2": "ਓਹ ਹੋ। ਮੇਰੇ ਕੋਲ ਸਿਫ਼ਰ ਚੀਜ਼ਾਂ ਹਨ!",
    "s01e01.s2-sheru-in.1": "ਸ਼ੇਰੂ! ਕੀ ਤੂੰ ਗੇਂਦ ਲੱਭ ਸਕਦਾ ਹੈਂ?",
    "s01e01.s2-wrong-1.1": "ਕੀ ਇਹ... ਗੇਂਦ ਹੈ?",
    "s01e01.s2-pause-1.1": "ਹੰਮ? ਦੱਸੋ ਭਲਾ?",
    "s01e01.s2-pause-1.r1": "ਨਹੀਂ! ਇਹ ਤਾਂ ਸਪੰਜ ਹੈ, ਸ਼ੇਰੂ!",
    "s01e01.s2-wrong-2.1": "ਬੁਲਬੁਲੇ ਵਾਲੀ ਛੜੀ? ਭੋਲਾ ਸ਼ੇਰੂ!",
    "s01e01.s2-right.1": "ਗੇਂਦ! ਹਾਂ! ਸ਼ੁਕਰੀਆ, ਸ਼ੇਰੂ!",
    "s01e01.s2-count-1.1": "ਇੱਕ! ਇੱਕ ਲਾਲ ਗੇਂਦ!",
    "s01e01.s2-count-1.2": "ਸਾਡੇ ਦੋਸਤ ਲਈ ਪਾਰਟੀ ਦੀ ਇੱਕ ਚੀਜ਼।",
    "s01e01.s2-next.1": "ਹੁਣ ਸਾਨੂੰ ਰੇਲ ਦੀ ਸਵਾਰੀ ਚਾਹੀਦੀ ਹੈ। ਗੋਗੋ!",
    "s01e01.s1-island.1": "ਦੂਰ ਇੱਕ ਧੁੱਪ ਵਾਲਾ ਸੋਹਣਾ ਨਿੱਕਾ ਟਾਪੂ ਹੈ।",
    "s01e01.s1-island.2": "ਇਸ ਦਾ ਨਾਂ ਹੈ... ਵੰਡਰ ਵਰਲਡ!",
    "s01e01.s1-late-lulu.1": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਥੋੜ੍ਹਾ ਦੇਰ ਨਾਲ ਹੱਥ ਹਿਲਾਇਆ!",
    "s01e01.s1-late-lulu.2": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਲੂਲੂ! ਤੇਰਾ ਹੱਥ ਹਿਲਾਉਣਾ ਪਿਆਰਾ ਹੈ!",
    "s01e01.s1-big-news.1": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਮੋਮੋ ਹਾਂ। ਪਤਾ ਕੀ?",
    "s01e01.s1-big-news.2": "ਤੁਸੀਂ ਸਾਡੇ ਨਵੇਂ ਪਿਆਰੇ ਦੋਸਤ ਹੋ!",
    "s01e01.s1-big-news.3": "ਆਓ ਮਿਲ ਕੇ ਸਵਾਗਤ ਪਾਰਟੀ ਤਿਆਰ ਕਰੀਏ!",
    "s01e01.s2-five-things.1": "ਸਾਡੀ ਸਵਾਗਤ ਪਾਰਟੀ ਲਈ ਪੰਜ ਚੀਜ਼ਾਂ ਚਾਹੀਦੀਆਂ ਹਨ।",
    "s01e01.s2-five-things.2": "ਓਹ ਹੋ! ਹਾਲੇ ਸਾਡੇ ਕੋਲ ਸਿਫ਼ਰ ਚੀਜ਼ਾਂ ਹਨ!",
    "s01e01.s2-ask-sheru.1": "ਸ਼ੇਰੂ! ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਲਾਲ ਗੇਂਦ ਲੱਭੋ!",
    "s01e01.s2-fetch-duck.1": "ਓਹ ਹੋ! ਕੀ ਇਹ ਗੇਂਦ ਹੈ?",
    "s01e01.s2-fetch-duck.2": "ਨਹੀਂ! ਇਹ ਤਾਂ ਪੀਲੀ ਬਤਖ਼ ਹੈ, ਸ਼ੇਰੂ!",
    "s01e01.s2-fetch-sponge.1": "ਨਰਮ ਸਪੰਜ? ਕਿੰਨਾ ਭੋਲਾ ਕਤੂਰਾ ਹੈ!",
    "s01e01.s2-fetch-sponge.2": "ਆਓ ਗੋਲ ਲਾਲ ਗੇਂਦ ਨੂੰ ਲੱਭੀਏ!",
    "s01e01.s2-ball-arrives.1": "ਵਾਹ! ਵੇਖੋ ਸ਼ੇਰੂ ਕੀ ਰੁੜ੍ਹਾ ਕੇ ਲਿਆਇਆ!",
    "s01e01.s2-pause-1.2": "ਉਹ ਰਹੀ! ਸ਼ੁਕਰੀਆ ਪਿਆਰੇ ਦੋਸਤ!",
    "s01e01.s2-pause-1.3": "ਸ਼ਾਬਾਸ਼ ਸ਼ੇਰੂ! ਤੂੰ ਲਾਲ ਗੇਂਦ ਲੱਭ ਲਈ!"
  },
  strings: {
    "s01e01s1.title": "ਭੋਲਾ ਸ਼ੇਰੂ! ਗੇਂਦ ਲੱਭੋ",
    "s01e01s1.offline": "ਸਭ ਪੂਰਾ! ਹੁਣ ਘਰ ਵਿੱਚ ਇੱਕ ਗੇਂਦ ਲੱਭੋ ਅਤੇ ਮਿਲ ਕੇ ਰੁੜ੍ਹਾਓ।",
    "s01e01s1.offlinePlay": "ਮਿਲ ਕੇ ਖੇਡੋ: ਪਹਿਲਾਂ ਜੁਰਾਬ ਜਾਂ ਚਮਚਾ ਦਿਖਾ ਕੇ ਹੱਸੋ, ਫਿਰ ਅਸਲੀ ਗੇਂਦ ਰੁੜ੍ਹਾਓ।",
    "s01e01s1.bridge": "ਆਪਣੇ ਬੱਚੇ ਨਾਲ ਗੇਂਦ ਵੱਲ ਇਸ਼ਾਰਾ ਕਰੋ ਅਤੇ ਕਹੋ: ਇੱਕ ਗੇਂਦ।",
    "s01e01s1.caregiverBridge": "ਜਦੋਂ ਮੋਮੋ ਲਾਲ ਗੇਂਦ ਬਾਰੇ ਪੁੱਛੇ ਤਾਂ ਰੁਕੋ ਅਤੇ ਬੱਚੇ ਨੂੰ ਇਸ਼ਾਰਾ ਕਰਨ ਦਿਓ।",
    "s01e01s1.ch.main": "ਸ਼ੇਰੂ ਨੇ ਲਾਲ ਗੇਂਦ ਲੱਭੀ",
    "s01e01s1.ch.short": "ਸ਼ੇਰੂ ਨੇ ਗੇਂਦ ਲੱਭੀ",
    "s01e01s1.ch.s1": "ਸ਼ੇਰੂ ਨੇ ਗੇਂਦ ਲੱਭੀ",
    "s01e01s1.ch.sheru": "ਸ਼ੇਰੂ ਨੇ ਗੇਂਦ ਲੱਭੀ",
    "s01e01s1.pause.1": "ਰੁਕੋ: ਦੱਸੋ, ਕੀ ਇਹ ਗੇਂਦ ਹੈ?",
    "s01e01s1.s2-pause-1.pause": "ਰੁਕੋ: ਦੱਸੋ, ਕੀ ਇਹ ਗੇਂਦ ਹੈ?",
    "s01e01s1.s2-pause-1.tip": "ਬੱਚੇ ਦੇ ਜਵਾਬ ਜਾਂ ਇਸ਼ਾਰੇ ਲਈ ਰੁਕੋ, ਫਿਰ ਇਕੱਠੇ ਹੱਸੋ।",
    "s01e01.title": "ਜੀ ਆਇਆਂ ਨੂੰ ਵੰਡਰ ਵਰਲਡ!",
    "s01e01.offline": "ਸਭ ਪੂਰਾ! ਹੁਣ ਖੇਡ ਪਾਰਟੀ ਲਈ ਪੰਜ ਚੀਜ਼ਾਂ ਲੱਭੋ: ਗੇਂਦ, ਗੱਡੀ, ਗੀਤ, ਲੁਕਣ-ਮੀਟੀ ਅਤੇ ਤਾਰਾ।",
    "s01e01.offlinePlay": "ਸਭ ਪੂਰਾ! ਹੁਣ ਖੇਡ ਪਾਰਟੀ ਲਈ ਪੰਜ ਚੀਜ਼ਾਂ ਲੱਭੋ: ਗੇਂਦ, ਖਿਡੌਣਾ ਗੱਡੀ, ਗੀਤ, ਲੁਕਣ-ਮੀਟੀ ਅਤੇ ਤਾਰਾ।",
    "s01e01.bridge": "ਆਪਣੀਆਂ ਉਂਗਲਾਂ ਉੱਤੇ ਇਕੱਠੇ ਗਿਣੋ: ਇੱਕ, ਦੋ, ਤਿੰਨ, ਚਾਰ, ਪੰਜ।",
    "s01e01.caregiverBridge": "ਆਪਣੀਆਂ ਉਂਗਲਾਂ ਉੱਤੇ ਪਾਰਟੀ ਦੀਆਂ ਚੀਜ਼ਾਂ ਮਿਲ ਕੇ ਗਿਣੋ: ਇੱਕ, ਦੋ, ਤਿੰਨ, ਚਾਰ, ਪੰਜ।",
    "s01e01.ch.theme": "ਵੰਡਰ ਵਰਲਡ ਗੀਤ",
    "s01e01.ch.sheru": "ਸ਼ੇਰੂ ਨੇ ਗੇਂਦ ਲੱਭੀ (1)",
    "s01e01.pause.1": "[ਰੁਕੋ: ਲਾਲ ਗੇਂਦ ਵੱਲ ਇਸ਼ਾਰਾ ਕਰੋ!]",
    "s01e01.s2-pause-1.pause": "ਰੁਕੋ: ਦੱਸੋ, ਕੀ ਇਹ ਗੇਂਦ ਹੈ?",
    "s01e01.s2-pause-1.tip": "ਬੱਚੇ ਦੇ ਜਵਾਬ ਜਾਂ ਇਸ਼ਾਰੇ ਲਈ ਰੁਕੋ।"
  }
};

/** Merges additional show dubbing `LocalePart`s over a base `LocalePack` without mutation. */
export function mergeShowLocale(base: LocalePack, ...parts: readonly LocalePart[]): LocalePack {
  const lines: Record<string, string> = { ...base.lines };
  const strings: Record<string, string> = { ...base.strings };
  for (const part of parts) {
    if (part.lines) {
      for (const [key, value] of Object.entries(part.lines)) lines[key] = value;
    }
    if (part.strings) {
      for (const [key, value] of Object.entries(part.strings)) strings[key] = value;
    }
  }
  return { locale: base.locale, lines, strings };
}

export const PA_SHOW_PACK: LocalePack = mergeShowLocale(
  { locale: "pa", lines: {}, strings: PA_UI_STRINGS },
  PA_S01E01_SHORT_SHERU
);

/** Builds a Punjabi broadcast `LocalePack` with optional extra show dubbing parts. */
export function paShowLocale(parts: readonly LocalePart[] = []): LocalePack {
  return parts.length === 0 ? PA_SHOW_PACK : mergeShowLocale(PA_SHOW_PACK, ...parts);
}
