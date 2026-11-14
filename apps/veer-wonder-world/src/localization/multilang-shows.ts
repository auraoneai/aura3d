// Multi-language show dubbing packs (`pa`, `es`, `hi`) for `s01e01-short-sheru` and `S01E01` Segments 1-2 (PRD 09 P4).
// Every spoken line has <= 9 words, zero child names, zero family names, zero banned phrases, and zero type assertions.

import type { LocalePack } from "../types.js";
import { PA_SHOW_PACK, mergeShowLocale, type LocalePart } from "./pa.js";

export type MultilangShowLocale = "pa" | "es" | "hi";

/** Punjabi (Gurmukhi) lines & strings for `s01e01-short-sheru` and `S01E01` Segments 1 + 2. */
export const PA_S01E01_DUB: LocalePart = {
  lines: {
    // Segment 1 — Cold open & Wonder World theme
    "s01e01.s1-island.1": "ਦੂਰ ਇੱਕ ਧੁੱਪ ਵਾਲਾ ਸੋਹਣਾ ਨਿੱਕਾ ਟਾਪੂ ਹੈ।",
    "s01e01.s1-island.2": "ਇਸ ਦਾ ਨਾਂ ਹੈ... ਵੰਡਰ ਵਰਲਡ!",
    "s01e01.s1-late-lulu.1": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਥੋੜ੍ਹਾ ਦੇਰ ਨਾਲ ਹੱਥ ਹਿਲਾਇਆ!",
    "s01e01.s1-late-lulu.2": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਲੂਲੂ! ਤੇਰਾ ਹੱਥ ਹਿਲਾਉਣਾ ਪਿਆਰਾ ਹੈ!",
    "s01e01.s1-big-news.1": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਮੋਮੋ ਹਾਂ। ਪਤਾ ਕੀ?",
    "s01e01.s1-big-news.2": "ਤੁਸੀਂ ਸਾਡੇ ਨਵੇਂ ਪਿਆਰੇ ਦੋਸਤ ਹੋ!",
    "s01e01.s1-big-news.3": "ਆਓ ਮਿਲ ਕੇ ਸਵਾਗਤ ਪਾਰਟੀ ਤਿਆਰ ਕਰੀਏ!",

    // Segment 2 & Short 1 (`s01e01-short-sheru`) — Sheru's three-fetch gag
    "s01e01.s2-five-things.1": "ਸਾਡੀ ਸਵਾਗਤ ਪਾਰਟੀ ਲਈ ਪੰਜ ਚੀਜ਼ਾਂ ਚਾਹੀਦੀਆਂ ਹਨ।",
    "s01e01.s2-five-things.2": "ਓਹ ਹੋ! ਹਾਲੇ ਸਾਡੇ ਕੋਲ ਸਿਫ਼ਰ ਚੀਜ਼ਾਂ ਹਨ!",
    "s01e01.s2-ask-sheru.1": "ਸ਼ੇਰੂ! ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਲਾਲ ਗੇਂਦ ਲੱਭੋ!",
    "s01e01.s2-fetch-duck.1": "ਓਹ ਹੋ! ਕੀ ਇਹ ਗੇਂਦ ਹੈ?",
    "s01e01.s2-fetch-duck.2": "ਨਹੀਂ! ਇਹ ਤਾਂ ਪੀਲੀ ਬਤਖ਼ ਹੈ, ਸ਼ੇਰੂ!",
    "s01e01.s2-fetch-sponge.1": "ਨਰਮ ਸਪੰਜ? ਕਿੰਨਾ ਭੋਲਾ ਕਤੂਰਾ ਹੈ!",
    "s01e01.s2-fetch-sponge.2": "ਆਓ ਗੋਲ ਲਾਲ ਗੇਂਦ ਨੂੰ ਲੱਭੀਏ!",
    "s01e01.s2-ball-arrives.1": "ਵਾਹ! ਵੇਖੋ ਸ਼ੇਰੂ ਕੀ ਰੁੜ੍ਹਾ ਕੇ ਲਿਆਇਆ!",
    "s01e01.s2-pause-1.1": "ਲਾਲ ਗੇਂਦ ਕਿੱਥੇ ਹੈ?",
    "s01e01.s2-pause-1.2": "ਉਹ ਰਹੀ! ਸ਼ੁਕਰੀਆ ਪਿਆਰੇ ਦੋਸਤ!",
    "s01e01.s2-pause-1.3": "ਸ਼ਾਬਾਸ਼ ਸ਼ੇਰੂ! ਤੂੰ ਲਾਲ ਗੇਂਦ ਲੱਭ ਲਈ!",
    "s01e01.s2-count-1.1": "ਇੱਕ! ਇੱਕ ਲਾਲ ਗੇਂਦ!",
    "s01e01.s2-count-1.2": "ਸਾਡੇ ਦੋਸਤ ਲਈ ਪਾਰਟੀ ਦੀ ਇੱਕ ਚੀਜ਼।",
    "s01e01.s2-next.1": "ਹੁਣ ਸਾਨੂੰ ਰੇਲ ਦੀ ਸਵਾਰੀ ਚਾਹੀਦੀ ਹੈ। ਗੋਗੋ!"
  },
  strings: {
    "s01e01.title": "ਜੀ ਆਇਆਂ ਨੂੰ ਵੰਡਰ ਵਰਲਡ!",
    "s01e01.offlinePlay":
      "ਸਭ ਪੂਰਾ! ਹੁਣ ਖੇਡ ਪਾਰਟੀ ਲਈ ਪੰਜ ਚੀਜ਼ਾਂ ਲੱਭੋ: ਗੇਂਦ, ਖਿਡੌਣਾ ਗੱਡੀ, ਗੀਤ, ਲੁਕਣ-ਮੀਟੀ ਅਤੇ ਤਾਰਾ।",
    "s01e01.caregiverBridge":
      "ਆਪਣੀਆਂ ਉਂਗਲਾਂ ਉੱਤੇ ਪਾਰਟੀ ਦੀਆਂ ਚੀਜ਼ਾਂ ਮਿਲ ਕੇ ਗਿਣੋ: ਇੱਕ, ਦੋ, ਤਿੰਨ, ਚਾਰ, ਪੰਜ।",
    "s01e01.ch.theme": "ਵੰਡਰ ਵਰਲਡ ਗੀਤ",
    "s01e01.ch.sheru": "ਸ਼ੇਰੂ ਨੇ ਗੇਂਦ ਲੱਭੀ (1)",
    "s01e01.pause.1": "[ਰੁਕੋ: ਲਾਲ ਗੇਂਦ ਵੱਲ ਇਸ਼ਾਰਾ ਕਰੋ!]",
    "s01e01s1.title": "ਭੋਲਾ ਸ਼ੇਰੂ!",
    "s01e01s1.offlinePlay":
      "ਮਿਲ ਕੇ ਖੇਡੋ: ਪਹਿਲਾਂ ਜੁਰਾਬ ਜਾਂ ਚਮਚਾ ਦਿਖਾ ਕੇ ਹੱਸੋ, ਫਿਰ ਅਸਲੀ ਗੇਂਦ ਰੁੜ੍ਹਾਓ।",
    "s01e01s1.caregiverBridge":
      "ਜਦੋਂ ਮੋਮੋ ਲਾਲ ਗੇਂਦ ਬਾਰੇ ਪੁੱਛੇ ਤਾਂ ਰੁਕੋ ਅਤੇ ਬੱਚੇ ਨੂੰ ਇਸ਼ਾਰਾ ਕਰਨ ਦਿਓ।",
    "s01e01s1.ch.main": "ਸ਼ੇਰੂ ਨੇ ਲਾਲ ਗੇਂਦ ਲੱਭੀ"
  }
};

/** Spanish (`es`) UI speaker/card strings plus `s01e01-short-sheru` and `S01E01` Segments 1 + 2. */
export const ES_S01E01_DUB: LocalePart = {
  lines: {
    // Segment 1 — Cold open & Wonder World theme
    "s01e01.s1-island.1": "Muy lejos hay una islita soleada y tranquila.",
    "s01e01.s1-island.2": "Se llama... ¡Wonder World!",
    "s01e01.s1-late-lulu.1": "¡Hola! ¡Uy, saludé un poquito tarde!",
    "s01e01.s1-late-lulu.2": "¡Hola, Lulu! ¡Nos encanta tu saludo alegre!",
    "s01e01.s1-big-news.1": "¡Hola! Soy Momo. ¿Adivina qué?",
    "s01e01.s1-big-news.2": "¡Tú eres nuestro nuevo amigo!",
    "s01e01.s1-big-news.3": "¡Hagamos juntos una fiesta de bienvenida!",

    // Segment 2 & Short 1 (`s01e01-short-sheru`) — Sheru's three-fetch gag
    "s01e01.s2-five-things.1": "Nuestra fiesta necesita cinco cosas divertidas.",
    "s01e01.s2-five-things.2": "¡Uy! ¡Ahora tenemos cero cosas!",
    "s01e01.s2-ask-sheru.1": "¡Sheru! ¡Busca por favor una pelota roja!",
    "s01e01.s2-fetch-duck.1": "¡Uy! ¿Eso es una pelota?",
    "s01e01.s2-fetch-duck.2": "¡Nooo! ¡Es un patito amarillo, Sheru!",
    "s01e01.s2-fetch-sponge.1": "¿Una esponja suave? ¡Qué perrito travieso!",
    "s01e01.s2-fetch-sponge.2": "¡Busquemos la pelota redonda y roja!",
    "s01e01.s2-ball-arrives.1": "¡Oh! ¡Mira lo que rodó Sheru!",
    "s01e01.s2-pause-1.1": "¿Dónde está la pelota roja?",
    "s01e01.s2-pause-1.2": "¡Allí está! ¡Muchas gracias, amigo!",
    "s01e01.s2-pause-1.3": "¡Bravo, Sheru! ¡Encontraste la pelota roja!",
    "s01e01.s2-count-1.1": "¡Uno! ¡Una pelota roja!",
    "s01e01.s2-count-1.2": "Una cosa divertida para nuestra fiesta.",
    "s01e01.s2-next.1": "Ahora necesitamos un paseo en tren. ¡GoGo!"
  },
  strings: {
    "ui.offline.title": "¡Todo listo! Ahora prueben...",
    "ui.speaker.momo": "Momo",
    "ui.speaker.lulu": "Lulu",
    "ui.speaker.sheru": "Sheru",
    "ui.speaker.gogo": "GoGo",
    "ui.speaker.lumi": "Lumi",
    "ui.speaker.peeko": "Peeko",
    "ui.speaker.tiko": "Tiko",
    "ui.speaker.robot": "Pequeño Robot",
    "s01e01.title": "¡Bienvenidos a Wonder World!",
    "s01e01.offlinePlay":
      "¡Todo listo! Busquen juntos cinco cosas para una fiesta: pelota, carrito, canción, cucú y estrella.",
    "s01e01.caregiverBridge":
      "Cuenten juntos con los dedos las cosas de la fiesta: uno, dos, tres, cuatro, cinco.",
    "s01e01.ch.theme": "Canción de Wonder World",
    "s01e01.ch.sheru": "Sheru encuentra una pelota (1)",
    "s01e01.pause.1": "[pausa: ¡señala la pelota roja!]",
    "s01e01s1.title": "¡Sheru travieso!",
    "s01e01s1.offlinePlay":
      "Jueguen juntos a buscar objetos: muestren primero un calcetín o cuchara, rían juntos y rueden una pelota.",
    "s01e01s1.caregiverBridge":
      "Hagan una pausa cuando Momo pregunte por la pelota roja para señalarla juntos.",
    "s01e01s1.ch.main": "Sheru encuentra la pelota roja"
  }
};

/** Hindi (`hi`, Devanagari) UI speaker/card strings plus `s01e01-short-sheru` and `S01E01` Segments 1 + 2. */
export const HI_S01E01_DUB: LocalePart = {
  lines: {
    // Segment 1 — Cold open & Wonder World theme
    "s01e01.s1-island.1": "दूर एक धूप वाला प्यारा छोटा टापू है।",
    "s01e01.s1-island.2": "इसका नाम है... वंडर वर्ल्ड!",
    "s01e01.s1-late-lulu.1": "नमस्ते! अरे, मैंने थोड़ा देर से हाथ हिलाया!",
    "s01e01.s1-late-lulu.2": "नमस्ते लूलू! तुम्हारा हाथ हिलाना बहुत प्यारा है!",
    "s01e01.s1-big-news.1": "नमस्ते! मैं मोमो हूँ। पता है क्या?",
    "s01e01.s1-big-news.2": "आप हमारे नए प्यारे दोस्त हैं!",
    "s01e01.s1-big-news.3": "चलो मिलकर स्वागत पार्टी तैयार करें!",

    // Segment 2 & Short 1 (`s01e01-short-sheru`) — Sheru's three-fetch gag
    "s01e01.s2-five-things.1": "हमारी स्वागत पार्टी को पाँच मज़ेदार चीज़ें चाहिए।",
    "s01e01.s2-five-things.2": "अरे ओह! अभी हमारे पास शून्य चीज़ें हैं!",
    "s01e01.s2-ask-sheru.1": "शेरू! कृपया एक लाल गेंद ढूँढो!",
    "s01e01.s2-fetch-duck.1": "अरे ओह! क्या यह गेंद है?",
    "s01e01.s2-fetch-duck.2": "नहीं! यह तो पीली बत्तख है, शेरू!",
    "s01e01.s2-fetch-sponge.1": "मुलायम स्पंज? कितना नटखट पिल्ला है!",
    "s01e01.s2-fetch-sponge.2": "चलो गोल लाल गेंद को ढूँढते हैं!",
    "s01e01.s2-ball-arrives.1": "अरे वाह! देखो शेरू क्या लुढ़का लाया!",
    "s01e01.s2-pause-1.1": "लाल गेंद कहाँ है?",
    "s01e01.s2-pause-1.2": "वह रही! धन्यवाद प्यारे दोस्त!",
    "s01e01.s2-pause-1.3": "शाबाश शेरू! तुमने लाल गेंद ढूँढ ली!",
    "s01e01.s2-count-1.1": "एक! एक लाल गेंद!",
    "s01e01.s2-count-1.2": "हमारे दोस्त के लिए पार्टी की एक चीज़।",
    "s01e01.s2-next.1": "अब हमें रेल की सवारी चाहिए। गोगो!"
  },
  strings: {
    "ui.offline.title": "पूरा हुआ! अब यह करके देखें...",
    "ui.speaker.momo": "मोमो",
    "ui.speaker.lulu": "लूलू",
    "ui.speaker.sheru": "शेरू",
    "ui.speaker.gogo": "गोगो",
    "ui.speaker.lumi": "लूमी",
    "ui.speaker.peeko": "पीको",
    "ui.speaker.tiko": "टीको",
    "ui.speaker.robot": "नन्हा रोबोट",
    "s01e01.title": "वंडर वर्ल्ड में स्वागत है!",
    "s01e01.offlinePlay":
      "पूरा हुआ! अब खेल पार्टी के लिए पाँच चीज़ें ढूँढें: गेंद, खिलौना गाड़ी, गीत, लुका-छिपी और तारा।",
    "s01e01.caregiverBridge":
      "अपनी उँगलियों पर पार्टी की चीज़ें साथ मिलकर गिनें: एक, दो, तीन, चार, पाँच।",
    "s01e01.ch.theme": "वंडर वर्ल्ड गीत",
    "s01e01.ch.sheru": "शेरू ने गेंद ढूँढी (1)",
    "s01e01.pause.1": "[रुकें: लाल गेंद की ओर इशारा करें!]",
    "s01e01s1.title": "नटखट शेरू!",
    "s01e01s1.offlinePlay":
      "मिलकर खेलें: पहले मोज़ा या चम्मच दिखाकर हँसें, फिर असली गेंद लुढ़काएँ।",
    "s01e01s1.caregiverBridge":
      "जब मोमो लाल गेंद के बारे में पूछे तो रुकें और बच्चे को इशारा करने दें।",
    "s01e01s1.ch.main": "शेरू ने लाल गेंद ढूँढी"
  }
};

export const PA_MULTILANG_PACK: LocalePack = mergeShowLocale(PA_SHOW_PACK, PA_S01E01_DUB);

export const ES_SHOW_PACK: LocalePack = mergeShowLocale(
  { locale: "es", lines: {}, strings: {} },
  ES_S01E01_DUB
);

export const HI_SHOW_PACK: LocalePack = mergeShowLocale(
  { locale: "hi", lines: {}, strings: {} },
  HI_S01E01_DUB
);

export const MULTILANG_SHOW_PACKS: Readonly<Record<MultilangShowLocale, LocalePack>> = {
  pa: PA_MULTILANG_PACK,
  es: ES_SHOW_PACK,
  hi: HI_SHOW_PACK
};

export function getMultilangShowPack(locale: MultilangShowLocale): LocalePack {
  return MULTILANG_SHOW_PACKS[locale];
}
