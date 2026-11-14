// Hindi (हिन्दी) locale pack for P4 multi-language broadcast shows & Shorts
// (PRD 09 P4, D.5).
//
// Warm, simple Devanagari Hindi crafted for co-viewing with ages 1-5: short
// spoken lines, gentle pauses, zero family-name tokens, zero casts, and zero
// child data.

import type { LocalePack } from "../types.js";
import { HI_S01E01_DUB } from "./multilang-shows.js";
import { mergeShowLocale, type LocalePart } from "./pa.js";

export { mergeShowLocale, type LocalePart };

export const HI_STATUS = {
  enabled: true,
  locale: "hi",
  label: "हिन्दी",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "wonder-world-p4-hi-dubbing",
    date: "2026-11-13"
  }
} as const;

export const HI_UI_STRINGS: Readonly<Record<string, string>> = {
  // Start screen.
  "ui.start.title": "वंडर वर्ल्ड",
  "ui.start.welcome": "स्वागत है",
  "ui.start.welcomeNamed": "{name} का वंडर वर्ल्ड",
  "ui.start.tap": "शुरू करने के लिए छुएँ",
  "ui.start.sound": "छूने के बाद आवाज़ शुरू होगी।",
  "ui.prototype": "प्रारूप",
  "ui.loading": "तैयारी हो रही है...",
  "ui.stage.unavailable": "इस डिवाइस पर 3D चित्र शुरू नहीं हो सके। पेज फिर से खोलें या दूसरा ब्राउज़र आज़माएँ।",
  "ui.audio.unavailable": "अभी आवाज़ उपलब्ध नहीं है। कहानी चित्रों और लिखित शब्दों के साथ आगे बढ़ेगी।",

  // Modes.
  "ui.mode.label": "आप कैसे खेलना चाहते हैं?",
  "ui.mode.play": "साथ मिलकर खेलें",
  "ui.mode.watch": "देखें और गाएँ",
  "ui.mode.auto": "अपने आप चलाएँ",
  "ui.mode.windDown": "शांत संध्या",
  "ui.mode.broadcast": "प्रसारण",

  // Menu.
  "ui.menu.title": "कहानी या खेल चुनें",
  "ui.menu.label": "कहानियाँ और खेल",
  "ui.menu.all": "सभी",
  "ui.menu.sleep": "नींद और लोरियाँ",
  "ui.menu.songs": "गीत",
  "ui.menu.playLullabies": "सभी लोरियाँ चलाएँ",
  "ui.menu.episodes": "कहानियाँ",
  "ui.menu.activities": "खेल",

  // Grown-up controls during play.
  "ui.controls.label": "बड़ों के नियंत्रण",
  "ui.fullscreen.enter": "पूरी स्क्रीन",
  "ui.fullscreen.exit": "पूरी स्क्रीन बंद करें",
  "ui.fullscreen.iosSwipe": "पूरी स्क्रीन के लिए ऊपर स्वाइप करें या पता-पट्टी मेनू से टूलबार छिपाएँ चुनें।",
  "ui.fullscreen.iosHome": "बिना ब्राउज़र पट्टी के पूरी स्क्रीन के लिए सफारी में होम स्क्रीन पर जोड़ें चुनें।",
  "ui.fullscreen.iosClose": "समझ गए",
  "ui.pause": "रोकें",
  "ui.resume": "चलाएँ",
  "ui.replay": "शब्द फिर सुनें",
  "ui.allDone": "सब पूरा हुआ",
  "ui.parentButton": "बड़ों की सेटिंग्स",
  "ui.confirm": "बच्चे की बारी हो गई",
  "ui.captions.label": "उपशीर्षक",

  // End-of-story card.
  "ui.offline.title": "सब पूरा! अब यह करके देखें...",
  "ui.offline.done": "कहानियों पर लौटें",
  "ui.sleep.title": "श्श... मीठे सपने",
  "ui.sleep.body": "अब सब शांत है। स्क्रीन को आराम दें और प्यार से पास बैठें।",

  // Parent gate.
  "ui.gate.title": "बड़ों के लिए",
  "ui.gate.hold": "सेटिंग्स खोलने के लिए बटन को 2 सेकंड दबाकर रखें।",
  "ui.gate.button": "खोलने के लिए दबाकर रखें",
  "ui.gate.holding": "दबाकर रखें...",
  "ui.gate.again": "थोड़ी देर और दबाकर रखें।",
  "ui.gate.cancel": "अभी नहीं",
  "ui.gate.note": "यह कदम खेल के दौरान सेटिंग्स को अलग रखता है। यह ताला नहीं है।",

  // Parent panel.
  "ui.parent.title": "बड़ों की सेटिंग्स",
  "ui.parent.open": "बड़ों की सेटिंग्स",
  "ui.parent.close": "सेटिंग्स बंद करें",
  "ui.parent.back": "कहानी पर लौटें",
  "ui.parent.exit": "मेनू पर जाएँ",
  "ui.parent.clear": "इस डिवाइस की सेटिंग्स साफ़ करें",
  "ui.parent.reset": "इस डिवाइस की सेटिंग्स साफ़ करें",
  "ui.parent.mode": "मोड",
  "ui.parent.display": "आवाज़ और स्क्रीन",
  "ui.parent.music": "संगीत",
  "ui.parent.sound": "आवाज़ और बोल",
  "ui.parent.sfx": "ध्वनि प्रभाव",
  "ui.parent.sfxHelp": "जानवरों की आवाज़ें, बुलबुले और घंटियाँ। बोल और गीत अपने स्तर पर रहते हैं।",
  "ui.parent.sfx.off": "बंद",
  "ui.parent.sfx.soft": "धीमा",
  "ui.parent.sfx.normal": "सामान्य",
  "ui.parent.captions": "उपशीर्षक",
  "ui.parent.reducedMotion": "शांत गति",
  "ui.parent.highContrast": "उच्च स्पष्टता और बड़े अक्षर",
  "ui.parent.windDown": "शाम का विश्राम",
  "ui.parent.windDownHelp": "सोने के समय के लिए हल्के गर्म रंग, धीमी गति और कोमल रोशनी।",
  "ui.parent.sleepTimer": "नींद टाइमर",
  "ui.parent.sleepTimerHelp": "आवाज़ को धीरे-धीरे शांत करके शुभ-रात्रि स्क्रीन पर रुकता है।",
  "ui.parent.sleepTimerOff": "बंद",
  "ui.parent.wait": "बारी के लिए प्रतीक्षा समय",
  "ui.parent.waitHelp": "पात्र आपके बच्चे के लिए कितनी देर रुकता है। कहानी हमेशा अपने आप आगे बढ़ती है।",
  "ui.parent.seconds": "{s} सेकंड",
  "ui.parent.words": "आज के शब्द",
  "ui.parent.wordsHelp": "खेलते समय बार-बार बोलने के लिए 5 तक शब्द चुनें। यह सूची इसी डिवाइस पर रहती है।",
  "ui.parent.wordsEmpty": "अभी कोई शब्द उपलब्ध नहीं है।",
  "ui.parent.wordsCount": "{max} में से {n} चुने गए",
  "ui.parent.locale": "भाषा",
  "ui.parent.language": "भाषा",
  "ui.parent.locale.en": "English",
  "ui.parent.locale.pa": "ਪੰਜਾਬੀ",
  "ui.parent.locale.es": "Español",
  "ui.parent.locale.hi": "हिन्दी",

  // Guidance.
  "ui.guide.title": "साथ खेलने के तरीके",
  "ui.guide.1": "बच्चा जिस चीज़ को देखे, उसका नाम बताएँ।",
  "ui.guide.2": "बारी के लिए शांत रुकें।",
  "ui.guide.3": "आवाज़ या इशारे को आगे बढ़ाएँ।",
  "ui.guide.4": "असली खिलौने के साथ आज़माएँ।",

  // Notes.
  "ui.note.title": "वंडर वर्ल्ड के बारे में",
  "ui.note.start": "जब हो सके बच्चे के साथ बैठकर खेलें। सभी खेल छूने से चलते हैं; बोलना ज़रूरी नहीं है।",
  "ui.note.safety":
    "यह खेल और भाषा का परिचय है, चिकित्सा नहीं। वंडर वर्ल्ड कोई परीक्षा या अंक नहीं देता। यदि बोलने या सुनने के बारे में प्रश्न हों तो बाल रोग विशेषज्ञ से मिलें।",
  "ui.note.privacy":
    "कोई खाता नहीं, कोई माइक्रोफ़ोन नहीं, इस डिवाइस से बाहर कुछ नहीं जाता। कोई विज्ञापन नहीं और कोई ट्रैकिंग नहीं।",
  "ui.note.links": "बड़ों के लिए पठन सामग्री:",
  "ui.note.aap": "AAP: छोटे बच्चे और मीडिया",
  "ui.note.asha": "ASHA: वाणी और भाषा विकास",

  // Song titles.
  "ui.song.hello": "नमस्ते गीत",
  "ui.song.allDone": "सब पूरा गीत",
  "ui.song.ballRolls": "गेंद लुढ़कती है",
  "ui.song.goStop": "लूलू के साथ चलो और रुको",
  "ui.song.faceSong": "हँसते चेहरे",
  "ui.song.peekaboo": "लुका-छिपी गीत",
  "ui.song.animalBand": "नन्हा पशु बैंड",
  "ui.song.countToThree": "तीन तक गिनती",
  "ui.song.bubbleSong": "बुलबुले गीत",
  "ui.song.birthday": "छोटा केक गीत",
  "ui.song.colours": "लाल और नीला",
  "ui.song.shapes": "बेकरी के आकार",
  "ui.song.trainSong": "गोगो की रेल गीत",
  "ui.song.routine": "मोमो का दिन गीत",
  "ui.song.abc": "B से बॉल",
  "ui.song.lullaby": "चंदा की लोरी",
  "ui.song.twinkleRest": "नन्हा तारा आराम",
  "ui.song.rockingCradle": "झूलता पालना गीत",
  "ui.song.sleepyClouds": "उनींदे बादल",
  "ui.song.teddyGoodnight": "शुभ रात्रि, नन्हे भालू",
  "ui.song.countingSheepSong": "तीन मुलायम भेड़ें",
  "ui.song.warmBlanketSong": "गर्म कंबल गीत",
  "ui.song.cricketHush": "शांत बगिया की लोरी",
  "ui.song.dreamBoatSong": "शांत रात की रेल",
  "ui.song.moonMusicBox": "चाँदनी संगीत डिब्बा",
  "ui.song.starlightHum": "तारों की मीठी गुनगुनाहट",
  "ui.song.wonderTheme": "स्वागत है वंडर वर्ल्ड में",
  "ui.song.wonderThemeShort": "वंडर वर्ल्ड छोटी धुन",

  // Caption speaker names.
  "ui.speaker.momo": "मोमो",
  "ui.speaker.lulu": "लूलू",
  "ui.speaker.sheru": "शेरू",
  "ui.speaker.gogo": "गोगो",
  "ui.speaker.lumi": "लूमी",
  "ui.speaker.peeko": "पीको",
  "ui.speaker.tiko": "टीको",
  "ui.speaker.robot": "नन्हा रोबोट"
};

/** Hindi dubbing pack for the `s01e01-short-sheru` pilot Short (and Segment 2 of S01E01). */
export const HI_S01E01_SHORT_SHERU: LocalePart = {
  lines: {
    "s01e01s1.hook.1": "शेरू! क्या तुम गेंद ढूँढ सकते हो?",
    "s01e01s1.s2-sheru-in.1": "शेरू! क्या तुम गेंद ढूँढ सकते हो?",
    "s01e01s1.wrong-1.1": "क्या यह... गेंद है?",
    "s01e01s1.s2-wrong-1.1": "क्या यह... गेंद है?",
    "s01e01s1.pause-1.1": "हम्म? बताओ तो?",
    "s01e01s1.pause-1.r1": "नहीं! यह तो स्पंज है, शेरू!",
    "s01e01s1.s2-pause-1.1": "हम्म? बताओ तो?",
    "s01e01s1.s2-pause-1.r1": "नहीं! यह तो स्पंज है, शेरू!",
    "s01e01s1.wrong-2.1": "बुलबुले की छड़ी? नटखट शेरू!",
    "s01e01s1.s2-wrong-2.1": "बुलबुले की छड़ी? नटखट शेरू!",
    "s01e01s1.right.1": "गेंद! हाँ! धन्यवाद, शेरू!",
    "s01e01s1.s2-right.1": "गेंद! हाँ! धन्यवाद, शेरू!",
    "s01e01s1.count-1.1": "एक! पार्टी की एक चीज़।",
    "s01e01s1.count-1.2": "एक गेंद।",
    "s01e01s1.s2-count-1.1": "एक! पार्टी की एक चीज़।",
    "s01e01s1.s2-count-1.2": "एक गेंद।",
    "s01e01s1.outro.1": "अलविदा, दोस्तो!",

    "s01e01.s2-hi.1": "नमस्ते! मैं मोमो हूँ।",
    "s01e01.s2-hi.2": "पता है? एक नया दोस्त आ रहा!",
    "s01e01.s2-who.1": "कौन? तुम! तुम हमारे नए दोस्त हो!",
    "s01e01.s2-who.2": "चलो स्वागत पार्टी मनाएँ!",
    "s01e01.s2-five.1": "पार्टी के लिए पाँच चीज़ें चाहिए।",
    "s01e01.s2-five.2": "ओह हो! मेरे पास शून्य चीज़ें हैं!",
    "s01e01.s2-sheru-in.1": "शेरू! क्या तुम गेंद ढूँढ सकते हो?",
    "s01e01.s2-wrong-1.1": "क्या यह... गेंद है?",
    "s01e01.s2-pause-1.1": "हम्म? बताओ तो?",
    "s01e01.s2-pause-1.r1": "नहीं! यह तो स्पंज है, शेरू!",
    "s01e01.s2-wrong-2.1": "बुलबुले की छड़ी? नटखट शेरू!",
    "s01e01.s2-right.1": "गेंद! हाँ! धन्यवाद, शेरू!",
    "s01e01.s2-count-1.1": "एक! पार्टी की एक चीज़।",
    "s01e01.s2-count-1.2": "एक गेंद।",
    "s01e01.s2-next.1": "अब हमें सवारी चाहिए। गोगो!"
  },
  strings: {
    "s01e01s1.title": "नटखट शेरू! गेंद ढूँढो",
    "s01e01s1.offline": "सब पूरा! अब घर में एक गेंद ढूँढें और साथ मिलकर लुढ़काएँ।",
    "s01e01s1.bridge": "बच्चे के साथ गेंद की ओर इशारा करें और कहें: एक गेंद।",
    "s01e01s1.ch.short": "शेरू ने गेंद ढूँढी",
    "s01e01s1.ch.s1": "शेरू ने गेंद ढूँढी",
    "s01e01s1.ch.sheru": "शेरू ने गेंद ढूँढी",
    "s01e01s1.pause.1": "रुकें: क्या यह गेंद है?",
    "s01e01s1.s2-pause-1.pause": "रुकें: क्या यह गेंद है?",
    "s01e01s1.s2-pause-1.tip": "बच्चे के इशारे या जवाब के लिए रुकें, फिर साथ मुस्कुराएँ।",
    "s01e01.title": "स्वागत है वंडर वर्ल्ड में!",
    "s01e01.offline": "सब पूरा! काल्पनिक पार्टी के लिए पाँच चीज़ें ढूँढें: गेंद, गाड़ी, गीत, लुका-छिपी और तारा।",
    "s01e01.bridge": "उँगलियों पर साथ गिनें: एक, दो, तीन, चार, पाँच।",
    "s01e01.ch.sheru": "शेरू ने गेंद ढूँढी (1)",
    "s01e01.s2-pause-1.pause": "रुकें: क्या यह गेंद है?",
    "s01e01.s2-pause-1.tip": "बच्चे के जवाब या इशारे के लिए प्रतीक्षा करें।"
  }
};

export const hi: LocalePack = mergeShowLocale(
  { locale: "hi", lines: {}, strings: HI_UI_STRINGS },
  HI_S01E01_SHORT_SHERU,
  HI_S01E01_DUB
);

/** Builds a Hindi broadcast `LocalePack` with optional extra show dubbing parts. */
export function hiShowLocale(parts: readonly LocalePart[] = []): LocalePack {
  return parts.length === 0 ? hi : mergeShowLocale(hi, ...parts);
}
