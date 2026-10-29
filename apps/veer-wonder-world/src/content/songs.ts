// Songs (PRD 04 C06; PRD 02 section 5).
//
// Short original songs with one motion per lyric line. "Go / Stop with Lulu"
// and "The Ball Rolls" are word for word as PRD 02 section 5 writes them; the
// other lyrics were written for Wonder World. Every song is finite (no
// automatic repeat; a grown-up can replay it), slow and clear, and never
// overlaps a spoken line (the content validator checks the timing).
//
// - `birthday` is an original tune and never "Happy Birthday".
// - `abc` names one letter, B (E03), with real objects (ball, bear); it is
//   never the traditional alphabet song, and it names the letter only (the
//   spoken lines model the sound, keeping name and sound apart). One letter
//   per episode: a song may name only its story's own letter.
// - `style` is the prompt for the music generator (ElevenLabs music through
//   Kiro Prism, tools/gen-audio.ts); it carries the same tempo as `bpm`.
// - `motions` holds one character gesture per lyric line (Gesture ids from
//   src/types.ts); the stage plays line i's motion at `songCueTimesMs()[i]`.

import type { SongId } from "../types.js";

export interface SongSpec {
  titleKey: string;
  lyrics: string[];
  bpm: number;
  motions: string[];
  vocal: "sung" | "instrumental";
  style: string;
}

/** Shared rights and review record for every song (lyrics, melody, recording). */
export const SONG_RIGHTS = {
  lyrics: "Original lyrics written for Wonder World; goStop and ballRolls follow PRD 02 section 5 word for word.",
  melody: "Original melodies generated with the ElevenLabs music endpoint through Kiro Prism; no existing tune is requested or imitated.",
  recording: "Free-tier output is prototype-only (non-commercial, attribution required) and must be re-rendered on a paid tier before any commercial release.",
  review: {
    status: "approved",
    reviewer: "agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)",
    date: "2026-10-29"
  }
} as const;

/** The PRD 02 section 5 songs, word for word. */
export const PRD_SONG_LYRICS = {
  goStop: ["Clap, clap, clap with me.", "One, two, three!", "Go, go, go!", "Now ... stop!"],
  ballRolls: ["Ball, ball, rolling ball", "Here it comes, and there it goes", "Stop, ball, stop", "Let's roll it once more!"]
} as const;

export const SONGS: Record<SongId, SongSpec> = {
  hello: {
    titleKey: "ui.song.hello",
    lyrics: ["Hello, hello,", "hi, hi, hi!", "Wave hello, friend!"],
    bpm: 92,
    motions: ["wave", "hop", "wave"],
    vocal: "sung",
    style: "gentle preschool greeting song, soft ukulele and warm xylophone, 92 bpm, warm female vocal, slow and clear, cheerful and calm, original melody"
  },
  allDone: {
    titleKey: "ui.song.allDone",
    lyrics: ["All done, all done,", "time to wave bye-bye,", "bye-bye for now."],
    bpm: 84,
    motions: ["sway", "wave", "wave"],
    vocal: "sung",
    style: "soft preschool goodbye song, gentle acoustic guitar and music box, 84 bpm, warm female vocal, slow and clear, calm and settling, original melody"
  },
  ballRolls: {
    titleKey: "ui.song.ballRolls",
    lyrics: [...PRD_SONG_LYRICS.ballRolls],
    bpm: 60,
    motions: ["sway", "point", "freeze", "cheer"],
    vocal: "sung",
    style: "gentle preschool song with a rolling feel, soft ukulele and warm marimba, 60 bpm, warm female vocal, slow and clear, a short rest after each phrase, original melody"
  },
  goStop: {
    titleKey: "ui.song.goStop",
    lyrics: [...PRD_SONG_LYRICS.goStop],
    bpm: 60,
    motions: ["clap", "stomp", "dance", "freeze"],
    vocal: "sung",
    style: "playful preschool movement song, soft hand drum and bright marimba, 60 bpm, warm female vocal, slow and clear, three gentle claps, then a quiet pause on stop, original melody"
  },
  faceSong: {
    titleKey: "ui.song.faceSong",
    lyrics: ["Ah, ah, a big wide ah!", "Oh, oh, a round little oh!", "Mmm, mmm, lips go mmm!", "Silly faces, you and me,", "silly faces, look and see,", "ah, oh, mmm!"],
    bpm: 88,
    motions: ["mirror", "mirror", "happy", "sway", "look", "wave"],
    vocal: "sung",
    style: "silly gentle preschool song, soft ukulele, kazoo-like woodwind and light xylophone, 88 bpm, warm male vocal, slow and clear, playful and calm, original melody"
  },
  peekaboo: {
    titleKey: "ui.song.peekaboo",
    lyrics: ["Who's behind the door?", "Peek, peek, peek.", "Open, open, open...", "Peekaboo! Hi, hi!", "Hide again, hide again,", "bye-bye, peekaboo!"],
    bpm: 88,
    motions: ["look", "peek", "point", "hop", "hide", "wave"],
    vocal: "sung",
    style: "soft playful preschool song, gentle pizzicato strings and glockenspiel, 88 bpm, warm female vocal, slow and clear, a soft hush before each peekaboo, never startling, original melody"
  },
  animalBand: {
    titleKey: "ui.song.animalBand",
    lyrics: ["Moo, moo, says the cow.", "Baa, baa, says the sheep.", "Quack, quack, says the duck.", "Woof, woof, says the dog.", "Boom, boom, goes the drum.", "Our little band is done!"],
    bpm: 90,
    motions: ["nod", "nod", "nod", "nod", "stomp", "cheer"],
    vocal: "sung",
    style: "gentle preschool farm band song, soft acoustic guitar, small hand drum and toy piano, 90 bpm, warm female vocal, slow and clear, one animal sound at a time, original melody"
  },
  countToThree: {
    titleKey: "ui.song.countToThree",
    lyrics: ["One, one, here is one.", "Two, two, now there are two.", "Three, three, look, there are three.", "One, two, three!", "We counted, you and me,", "one, two, three."],
    bpm: 88,
    motions: ["point", "point", "point", "clap", "sway", "nod"],
    vocal: "sung",
    style: "calm preschool counting song, soft marimba and warm ukulele, 88 bpm, warm female vocal, slow and clear, a small pause after each number, original melody"
  },
  bubbleSong: {
    titleKey: "ui.song.bubbleSong",
    lyrics: ["Bubble, bubble, floating by,", "round and shiny, way up high.", "Pop, pop, pop!", "Where did it go?", "More bubbles, please?", "More, more, here they go!"],
    bpm: 88,
    motions: ["sway", "look", "clap", "look", "point", "cheer"],
    vocal: "sung",
    style: "dreamy gentle preschool song, soft celesta and light ukulele, 88 bpm, warm female vocal, slow and clear, airy and calm, original melody"
  },
  birthday: {
    titleKey: "ui.song.birthday",
    lyrics: ["Little cake, little cake,", "a pretend light glows.", "Take a breath and gently blow,", "whoo, whoo, out it goes!", "Clap for the party,", "a birthday hooray!"],
    bpm: 84,
    motions: ["sway", "point", "nod", "happy", "clap", "cheer"],
    vocal: "sung",
    style: "warm gentle preschool party song, soft ukulele and music box, 84 bpm, warm female vocal, slow and clear, cosy and celebratory, an original birthday melody of its own"
  },
  colours: {
    titleKey: "ui.song.colours",
    lyrics: ["Red, red, a red ball,", "rolling, rolling, red.", "Blue, blue, a blue ball,", "rolling, rolling, blue.", "Red and blue,", "a ball for you!"],
    bpm: 88,
    motions: ["point", "sway", "point", "sway", "clap", "cheer"],
    vocal: "sung",
    style: "bright gentle preschool song, soft xylophone and warm acoustic guitar, 88 bpm, warm female vocal, slow and clear, calm and cheerful, original melody"
  },
  shapes: {
    titleKey: "ui.song.shapes",
    lyrics: ["Circle, circle, round like a plate.", "Square, square, like a block.", "Triangle, triangle, like a hat.", "Circle, square, triangle,", "out of the oven,", "mmm, shapes!"],
    bpm: 84,
    motions: ["point", "point", "point", "sway", "look", "happy"],
    vocal: "sung",
    style: "cosy gentle preschool bakery song, soft piano and light marimba, 84 bpm, warm female vocal, slow and clear, calm and friendly, original melody"
  },
  trainSong: {
    titleKey: "ui.song.trainSong",
    lyrics: ["Choo-choo, here comes GoGo,", "chugga, chugga, slow.", "Ready, steady... go!", "Chugga, chugga, round we go,", "and now the train goes... stop!", "Bye-bye, train!"],
    bpm: 88,
    motions: ["look", "sway", "point", "dance", "freeze", "wave"],
    vocal: "sung",
    style: "gentle preschool train song, soft brushed snare, warm upright bass and toy xylophone, 88 bpm, warm male vocal, slow and clear, calm chugging rhythm, original melody"
  },
  routine: {
    titleKey: "ui.song.routine",
    lyrics: ["Wake up, wake up, the sun is up.", "Wash, wash, wash our hands.", "Eat, eat, a yummy breakfast.", "Brush, brush, brush our teeth.", "The moon is up, it's time for bed.", "Sleep, sleep, sleepy head."],
    bpm: 84,
    motions: ["wake", "nod", "eat", "nod", "look", "sleep"],
    vocal: "sung",
    style: "gentle preschool daily-routine song, soft acoustic guitar and glockenspiel, 84 bpm, warm female vocal, slow and clear, calm and cosy, original melody"
  },
  abc: {
    titleKey: "ui.song.abc",
    lyrics: ["Here is B, big B,", "B for ball, B for bear.", "Bounce, bounce, the ball goes up,", "hug, hug, the big brown bear.", "Ball and bear,", "B is here!"],
    bpm: 84,
    motions: ["point", "nod", "hop", "happy", "sway", "cheer"],
    vocal: "sung",
    style: "gentle preschool letter song, soft ukulele and celesta, 84 bpm, warm female vocal, slow and clear, an original melody (not an alphabet tune)"
  },
  lullaby: {
    titleKey: "ui.song.lullaby",
    lyrics: ["The moon is up, the stars are too,", "a sleepy yawn for me and you.", "Teddy's tucked in, warm in bed,", "rest your sleepy little head.", "Night-night, night-night,", "sleep tight."],
    bpm: 66,
    motions: ["sway", "sway", "nod", "sway", "wave", "sleep"],
    vocal: "sung",
    style: "very soft preschool lullaby, gentle music box and felt piano, 66 bpm, warm hushed female vocal, slow and clear, quiet and soothing, original melody"
  }
};

/** Song ids in a stable order. */
export const SONG_IDS: readonly SongId[] = keysOf(SONGS);

function keysOf<T extends string>(record: Readonly<Record<T, unknown>>): T[] {
  const out: T[] = [];
  for (const key in record) out.push(key);
  return out;
}

/**
 * The length (seconds) tools/gen-audio.ts asks the music generator for: four
 * beats per lyric line at the song's tempo, clamped to 10-30 s. The validator
 * uses it until the recorded song exists.
 */
export function songLengthSec(song: Pick<SongSpec, "lyrics" | "bpm">): number {
  return Math.min(30, Math.max(10, Math.round((song.lyrics.length * 60 * 4) / Math.max(60, song.bpm))));
}

/**
 * Start time (ms) of each lyric line, spread evenly over the song. Pass the
 * recorded duration when it is known; otherwise the generated length is used.
 */
export function songCueTimesMs(id: SongId, durationMs?: number): number[] {
  const song = SONGS[id];
  const total = durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0 ? durationMs : songLengthSec(song) * 1000;
  const count = Math.max(1, song.lyrics.length);
  return song.lyrics.map((_, index) => Math.round((index * total) / count));
}
