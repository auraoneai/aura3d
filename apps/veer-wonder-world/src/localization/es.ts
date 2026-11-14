// Spanish (Español) locale pack for P4 multi-language broadcast shows & Shorts
// (PRD 09 P4, D.5).
//
// Natural, unhurried Latin-American / neutral Spanish written for co-viewing
// with ages 1-5: short lines, warm encouragement, zero family-name tokens
// (uses "canción de cuna" / "arrullo", never family nicknames), zero casts, and
// zero child data.

import type { LocalePack } from "../types.js";
import { ES_S01E01_DUB } from "./multilang-shows.js";
import { mergeShowLocale, type LocalePart } from "./pa.js";

export { mergeShowLocale, type LocalePart };

export const ES_STATUS = {
  enabled: true,
  locale: "es",
  label: "Español",
  review: {
    language: "approved",
    rights: "approved",
    reviewer: "wonder-world-p4-es-dubbing",
    date: "2026-11-13"
  }
} as const;

export const ES_UI_STRINGS: Readonly<Record<string, string>> = {
  // Start screen.
  "ui.start.title": "Wonder World",
  "ui.start.welcome": "Bienvenidos a",
  "ui.start.welcomeNamed": "Wonder World de {name}",
  "ui.start.tap": "Toca para empezar",
  "ui.start.sound": "El sonido empieza al tocar.",
  "ui.prototype": "Prototipo",
  "ui.loading": "Preparando todo...",
  "ui.stage.unavailable": "Las imágenes 3D no pudieron abrirse en este dispositivo. Recarga la página o prueba otro navegador.",
  "ui.audio.unavailable": "El sonido no está disponible ahora. El cuento sigue con imágenes y subtítulos.",

  // Modes.
  "ui.mode.label": "¿Cómo quieren jugar?",
  "ui.mode.play": "Jugar juntos",
  "ui.mode.watch": "Mirar y cantar",
  "ui.mode.auto": "Juego continuo",
  "ui.mode.windDown": "Calma nocturna",
  "ui.mode.broadcast": "Emisión",

  // Menu.
  "ui.menu.title": "Elige un cuento o un juego",
  "ui.menu.label": "Cuentos y juegos",
  "ui.menu.all": "Todo",
  "ui.menu.sleep": "Sueño y canciones de cuna",
  "ui.menu.songs": "Canciones",
  "ui.menu.playLullabies": "Reproducir canciones de cuna",
  "ui.menu.episodes": "Cuentos",
  "ui.menu.activities": "Juegos",

  // Grown-up controls during play.
  "ui.controls.label": "Controles para adultos",
  "ui.fullscreen.enter": "Pantalla completa",
  "ui.fullscreen.exit": "Salir de pantalla completa",
  "ui.fullscreen.iosSwipe":
    "Desliza hacia arriba o abre el menú de la barra y elige Ocultar barra de herramientas para pantalla completa.",
  "ui.fullscreen.iosHome": "Para pantalla completa permanente en Safari, elige Agregar a inicio.",
  "ui.fullscreen.iosClose": "Entendido",
  "ui.pause": "Pausa",
  "ui.resume": "Continuar",
  "ui.replay": "Repetir palabra",
  "ui.allDone": "Todo listo",
  "ui.parentButton": "Ajustes para adultos",
  "ui.confirm": "Tu peque tomó su turno",
  "ui.captions.label": "Subtítulos",

  // End-of-story card.
  "ui.offline.title": "¡Todo listo! Ahora prueben...",
  "ui.offline.done": "Volver a los cuentos",
  "ui.sleep.title": "Shh... dulces sueños",
  "ui.sleep.body": "Todo está en calma. Deja descansar la pantalla y abrácense cerquita.",

  // Parent gate.
  "ui.gate.title": "Para adultos",
  "ui.gate.hold": "Mantén pulsado el botón durante 2 segundos para abrir los ajustes.",
  "ui.gate.button": "Mantén para abrir",
  "ui.gate.holding": "Sigue pulsando...",
  "ui.gate.again": "Mantén pulsado un poquito más.",
  "ui.gate.cancel": "Ahora no",
  "ui.gate.note": "Este paso evita toques accidentales durante el juego. No es un candado.",

  // Parent panel.
  "ui.parent.title": "Ajustes para adultos",
  "ui.parent.open": "Ajustes para adultos",
  "ui.parent.close": "Cerrar ajustes",
  "ui.parent.back": "Volver al cuento",
  "ui.parent.exit": "Salir al menú",
  "ui.parent.clear": "Borrar ajustes en este dispositivo",
  "ui.parent.reset": "Borrar ajustes en este dispositivo",
  "ui.parent.mode": "Modo",
  "ui.parent.display": "Sonido y pantalla",
  "ui.parent.music": "Música",
  "ui.parent.sound": "Sonido y voces",
  "ui.parent.sfx": "Efectos de sonido",
  "ui.parent.sfxHelp": "Sonidos de animales, burbujas y campanas. Las voces y canciones mantienen su nivel.",
  "ui.parent.sfx.off": "Apagado",
  "ui.parent.sfx.soft": "Suave",
  "ui.parent.sfx.normal": "Normal",
  "ui.parent.captions": "Subtítulos",
  "ui.parent.reducedMotion": "Movimiento suave",
  "ui.parent.highContrast": "Alto contraste y letra grande",
  "ui.parent.windDown": "Calma al atardecer",
  "ui.parent.windDownHelp": "Colores cálidos, ritmo pausado y luz suave para la hora de dormir.",
  "ui.parent.sleepTimer": "Temporizador de sueño",
  "ui.parent.sleepTimerHelp": "Baja el sonido poco a poco hasta quedar en una pantalla tranquila de buenas noches.",
  "ui.parent.sleepTimerOff": "Apagado",
  "ui.parent.wait": "Tiempo de espera por turno",
  "ui.parent.waitHelp": "Cuánto espera el personaje a tu peque. El cuento siempre continúa solo.",
  "ui.parent.seconds": "{s} segundos",
  "ui.parent.words": "Palabras de hoy",
  "ui.parent.wordsHelp": "Elige hasta 5 palabras para repetir mientras juegan. La lista queda solo en este dispositivo.",
  "ui.parent.wordsEmpty": "Aún no hay palabras disponibles.",
  "ui.parent.wordsCount": "{n} de {max} elegidas",
  "ui.parent.locale": "Idioma",
  "ui.parent.language": "Idioma",
  "ui.parent.locale.en": "English",
  "ui.parent.locale.pa": "ਪੰਜਾਬੀ",
  "ui.parent.locale.es": "Español",
  "ui.parent.locale.hi": "हिन्दी",

  // Guidance.
  "ui.guide.title": "Formas de jugar juntos",
  "ui.guide.1": "Nombra lo que tu peque mira.",
  "ui.guide.2": "Espera su turno con calma.",
  "ui.guide.3": "Amplía su gesto o sonido.",
  "ui.guide.4": "Pruébenlo con un juguete real.",

  // Notes.
  "ui.note.title": "Acerca de Wonder World",
  "ui.note.start": "Juega junto a tu peque cuando puedas. Todo funciona al tocar; no hace falta hablar.",
  "ui.note.safety":
    "Esto es juego y exposición al lenguaje, no terapia. Wonder World no evalúa ni califica. Si tienes dudas sobre el habla o la audición, consulta con pediatría o fonoaudiología.",
  "ui.note.privacy":
    "Sin cuenta, sin micrófono, nada sale de este dispositivo. Sin anuncios ni rastreo. Puedes borrar los ajustes cuando quieras.",
  "ui.note.links": "Lecturas para adultos:",
  "ui.note.aap": "AAP: Los medios y las mentes jóvenes",
  "ui.note.asha": "ASHA: Desarrollo del habla y del lenguaje",

  // Song titles.
  "ui.song.hello": "Canción de Hola",
  "ui.song.allDone": "Canción de Todo Listo",
  "ui.song.ballRolls": "Rueda la Pelota",
  "ui.song.goStop": "Vamos y Alto con Lulu",
  "ui.song.faceSong": "Caritas Divertidas",
  "ui.song.peekaboo": "Canción de Cucú",
  "ui.song.animalBand": "La Pequeña Banda Animal",
  "ui.song.countToThree": "Contar hasta Tres",
  "ui.song.bubbleSong": "Canción de Burbujas",
  "ui.song.birthday": "Canción del Pastelito",
  "ui.song.colours": "Rojo y Azul",
  "ui.song.shapes": "Formas en la Panadería",
  "ui.song.trainSong": "Canción del Tren de GoGo",
  "ui.song.routine": "El Día de Momo",
  "ui.song.abc": "La B de Bola",
  "ui.song.lullaby": "Canción de Cuna de la Luna",
  "ui.song.twinkleRest": "Descansa, Estrellita",
  "ui.song.rockingCradle": "Canción de la Cuna Suave",
  "ui.song.sleepyClouds": "Nubes Dormilonas",
  "ui.song.teddyGoodnight": "Buenas Noches, Osito",
  "ui.song.countingSheepSong": "Tres Ovejitas Suaves",
  "ui.song.warmBlanketSong": "Canción de la Manta Tibia",
  "ui.song.cricketHush": "Arrullo del Jardín Tranquilo",
  "ui.song.dreamBoatSong": "Tren Nocturno Silencioso",
  "ui.song.moonMusicBox": "Cajita Musical de Luna",
  "ui.song.starlightHum": "Arrullo de Luz Estelar",
  "ui.song.wonderTheme": "Bienvenidos a Wonder World",
  "ui.song.wonderThemeShort": "Melodía Corta de Wonder World",

  // Caption speaker names.
  "ui.speaker.momo": "Momo",
  "ui.speaker.lulu": "Lulu",
  "ui.speaker.sheru": "Sheru",
  "ui.speaker.gogo": "GoGo",
  "ui.speaker.lumi": "Lumi",
  "ui.speaker.peeko": "Peeko",
  "ui.speaker.tiko": "Tiko",
  "ui.speaker.robot": "Pequeño Robot"
};

/** Spanish dubbing pack for the `s01e01-short-sheru` pilot Short (and Segment 2 of S01E01). */
export const ES_S01E01_SHORT_SHERU: LocalePart = {
  lines: {
    "s01e01s1.hook.1": "¡Sheru! ¿Puedes buscar una pelota?",
    "s01e01s1.s2-sheru-in.1": "¡Sheru! ¿Puedes buscar una pelota?",
    "s01e01s1.wrong-1.1": "¿Eso es una... pelota?",
    "s01e01s1.s2-wrong-1.1": "¿Eso es una... pelota?",
    "s01e01s1.pause-1.1": "¿Mmm? ¿Qué será?",
    "s01e01s1.pause-1.r1": "¡No! ¡Es una esponja, Sheru!",
    "s01e01s1.s2-pause-1.1": "¿Mmm? ¿Qué será?",
    "s01e01s1.s2-pause-1.r1": "¡No! ¡Es una esponja, Sheru!",
    "s01e01s1.wrong-2.1": "¿Una varita de burbujas? ¡Travieso Sheru!",
    "s01e01s1.s2-wrong-2.1": "¿Una varita de burbujas? ¡Travieso Sheru!",
    "s01e01s1.right.1": "¡Una pelota! ¡Sí! ¡Gracias, Sheru!",
    "s01e01s1.s2-right.1": "¡Una pelota! ¡Sí! ¡Gracias, Sheru!",
    "s01e01s1.count-1.1": "¡Uno! Una cosa de fiesta.",
    "s01e01s1.count-1.2": "Una pelota.",
    "s01e01s1.s2-count-1.1": "¡Uno! Una cosa de fiesta.",
    "s01e01s1.s2-count-1.2": "Una pelota.",
    "s01e01s1.outro.1": "¡Adiós, amigos!",

    "s01e01.s2-hi.1": "¡Hola! Soy Momo.",
    "s01e01.s2-hi.2": "¡Adivina! ¡Viene un nuevo amigo!",
    "s01e01.s2-who.1": "¿Quién? ¡Tú! ¡Eres nuestro amigo!",
    "s01e01.s2-who.2": "¡Hagamos una fiesta de bienvenida!",
    "s01e01.s2-five.1": "La fiesta necesita cinco cosas.",
    "s01e01.s2-five.2": "¡Oh, oh! ¡Tengo cero cosas!",
    "s01e01.s2-sheru-in.1": "¡Sheru! ¿Puedes buscar una pelota?",
    "s01e01.s2-wrong-1.1": "¿Eso es una... pelota?",
    "s01e01.s2-pause-1.1": "¿Mmm? ¿Qué será?",
    "s01e01.s2-pause-1.r1": "¡No! ¡Es una esponja, Sheru!",
    "s01e01.s2-wrong-2.1": "¿Una varita de burbujas? ¡Travieso Sheru!",
    "s01e01.s2-right.1": "¡Una pelota! ¡Sí! ¡Gracias, Sheru!",
    "s01e01.s2-count-1.1": "¡Uno! Una cosa de fiesta.",
    "s01e01.s2-count-1.2": "Una pelota.",
    "s01e01.s2-next.1": "Ahora necesitamos un paseo. ¡GoGo!"
  },
  strings: {
    "s01e01s1.title": "¡Sheru travieso! Busca la pelota",
    "s01e01s1.offline": "¡Todo listo! Busquen juntos una pelota en casa y háganla rodar.",
    "s01e01s1.bridge": "Señalen la pelota juntos y digan con calma: una pelota.",
    "s01e01s1.ch.short": "Sheru encuentra la pelota",
    "s01e01s1.ch.s1": "Sheru encuentra la pelota",
    "s01e01s1.ch.sheru": "Sheru encuentra la pelota",
    "s01e01s1.pause.1": "pausa: ¿es una pelota?",
    "s01e01s1.s2-pause-1.pause": "pausa: ¿es una pelota?",
    "s01e01s1.s2-pause-1.tip": "Espera el gesto o respuesta de tu peque y sonrían juntos.",
    "s01e01.title": "¡Bienvenidos a Wonder World!",
    "s01e01.offline": "¡Todo listo! Busquen cinco cosas para una fiesta imaginaria: pelota, carrito, canción, cucú y estrella.",
    "s01e01.bridge": "Cuenten juntos con los dedos: uno, dos, tres, cuatro, cinco.",
    "s01e01.ch.sheru": "Sheru encuentra una pelota (1)",
    "s01e01.s2-pause-1.pause": "pausa: ¿es una pelota?",
    "s01e01.s2-pause-1.tip": "Espera la respuesta de tu peque antes de continuar."
  }
};

export const es: LocalePack = mergeShowLocale(
  { locale: "es", lines: {}, strings: ES_UI_STRINGS },
  ES_S01E01_SHORT_SHERU,
  ES_S01E01_DUB
);

/** Builds a Spanish broadcast `LocalePack` with optional extra show dubbing parts. */
export function esShowLocale(parts: readonly LocalePart[] = []): LocalePack {
  return parts.length === 0 ? es : mergeShowLocale(es, ...parts);
}
