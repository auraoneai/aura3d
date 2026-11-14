// Season 1 52-week curriculum calendar, developmental age bands, recurring
// segment templates, character banter bible, efficacy-claim guards, and child
// safety-facts rules (PRD 09 C.1-C.6, A.6-A.7, B.6, R9).
//
// Pure TypeScript data and deterministic checks: no DOM, no network, no casts,
// no child data.

import type {
  AgeBand,
  BeatKind,
  CharacterId,
  SegmentTemplateId,
  SegmentTransition,
  SleepCategory,
  SongId,
  SpeakerId,
  WorldId
} from "../types.js";

// ---------------------------------------------------------------------------
// C.1 Developmental age bands & Short format rules.

export interface AgeBandSpec {
  readonly id: AgeBand;
  readonly label: string;
  readonly ageYears: string;
  readonly viewingModel: string;
  readonly maxWordsPerLine: number;
  readonly maxCutsPerMin: number;
  readonly minPauseMs: number;
  readonly minPauses: number;
  readonly durationSec: readonly [number, number];
  readonly targetWordRange: readonly [number, number];
  readonly maxSpokenCount: number;
  readonly shortDurationSec: readonly [number, number];
  readonly shortMinPauses: number;
}

export const AGE_BANDS: Readonly<Record<AgeBand, AgeBandSpec>> = {
  little: {
    id: "little",
    label: "Little Ones",
    ageYears: "1-2",
    viewingModel: "Co-viewing with a grown-up; caregiver tips are prominent.",
    maxWordsPerLine: 6,
    maxCutsPerMin: 3,
    minPauseMs: 3000,
    minPauses: 6,
    durationSec: [480, 600],
    targetWordRange: [1, 2],
    maxSpokenCount: 3,
    shortDurationSec: [20, 60],
    shortMinPauses: 1
  },
  toddler: {
    id: "toddler",
    label: "Toddlers",
    ageYears: "2-3",
    viewingModel: "Co-viewing encouraged; calm pauses for pointing and answering together.",
    maxWordsPerLine: 9,
    maxCutsPerMin: 4,
    minPauseMs: 2500,
    minPauses: 6,
    durationSec: [570, 720],
    targetWordRange: [2, 4],
    maxSpokenCount: 5,
    shortDurationSec: [20, 60],
    shortMinPauses: 1
  },
  preschool: {
    id: "preschool",
    label: "Preschool",
    ageYears: "3-5",
    viewingModel: "Suitable for independent or shared viewing; caregiver bridge at the close.",
    maxWordsPerLine: 12,
    maxCutsPerMin: 6,
    minPauseMs: 2000,
    minPauses: 6,
    durationSec: [600, 840],
    targetWordRange: [3, 5],
    maxSpokenCount: 20,
    shortDurationSec: [20, 60],
    shortMinPauses: 1
  }
};

export const SHORT_SPEC = {
  durationSec: [20, 60] as const,
  targetCutMaxSec: 55,
  minPauses: 1,
  aspect: "9:16" as const,
  maxWordsPerLine(band: AgeBand): number {
    return AGE_BANDS[band].maxWordsPerLine;
  }
} as const;

// ---------------------------------------------------------------------------
// C.3 Recurring segment templates.

export interface SegmentTemplateSpec {
  readonly id: SegmentTemplateId;
  readonly label: string;
  readonly preferredWorlds: readonly WorldId[];
  readonly defaultTransitionIn: SegmentTransition;
  readonly typicalBeatKinds: readonly BeatKind[];
  readonly requiresPause: boolean;
  readonly requiresSong: boolean;
  readonly durationSecRange: readonly [number, number];
  readonly learningFocus: string;
  readonly pattern: string;
}

export const SEGMENT_TEMPLATES: Readonly<Record<SegmentTemplateId, SegmentTemplateSpec>> = {
  coldOpen: {
    id: "coldOpen",
    label: "Cold Open",
    preferredWorlds: ["meadow", "home-nook", "station", "music-garden"],
    defaultTransitionIn: "none",
    typicalBeatKinds: ["greeting", "hook"],
    requiresPause: false,
    requiresSong: false,
    durationSecRange: [15, 35],
    learningFocus: "Warm greeting and tiny visual curiosity hook.",
    pattern: "Island establishing view, host waves to viewer, poses today's friendly question."
  },
  theme: {
    id: "theme",
    label: "Hello, Wonder World! Theme",
    preferredWorlds: ["meadow"],
    defaultTransitionIn: "cut",
    typicalBeatKinds: ["song", "event"],
    requiresPause: false,
    requiresSong: true,
    durationSecRange: [25, 45],
    learningFocus: "Predictable opening ritual and cast recognition.",
    pattern: "Sing wonderTheme with the cast on stage, followed by one tiny running-gag beat."
  },
  arrival: {
    id: "arrival",
    label: "Arrival & Today's Goal",
    preferredWorlds: ["meadow", "home-nook", "station", "peekaboo-barn"],
    defaultTransitionIn: "cut",
    typicalBeatKinds: ["greeting", "hook", "model", "invite"],
    requiresPause: true,
    requiresSong: false,
    durationSecRange: [65, 110],
    learningFocus: "Introduce target words with a clear concrete prop and first PAUSE turn.",
    pattern: "Host names today's friendly goal, shows the first object, and invites the viewer to notice it."
  },
  wordGame: {
    id: "wordGame",
    label: "Playful Word Game",
    preferredWorlds: ["meadow", "station", "peekaboo-barn", "learning-cloud", "home-nook"],
    defaultTransitionIn: "train",
    typicalBeatKinds: ["model", "event", "invite", "repeat"],
    requiresPause: true,
    requiresSong: false,
    durationSecRange: [85, 130],
    learningFocus: "Repeat target words across silly mistake -> PAUSE -> gentle fix loops.",
    pattern: "Co-star tries a funny wrong guess first, pauses for the child, then celebrates the right object."
  },
  songBreak: {
    id: "songBreak",
    label: "Movement or Topic Song Break",
    preferredWorlds: ["music-garden", "station", "meadow", "peekaboo-barn"],
    defaultTransitionIn: "train",
    typicalBeatKinds: ["greeting", "model", "invite", "song", "repeat"],
    requiresPause: true,
    requiresSong: true,
    durationSecRange: [80, 125],
    learningFocus: "Copy-me body motion, rhythm, and sung target vocabulary.",
    pattern: "Practice one simple gesture with a PAUSE turn, then perform the matching catalogue song."
  },
  surprise: {
    id: "surprise",
    label: "Gentle Discovery & Peekaboo Surprise",
    preferredWorlds: ["peekaboo-barn", "learning-cloud", "meadow", "home-nook"],
    defaultTransitionIn: "train",
    typicalBeatKinds: ["hook", "event", "invite", "model", "repeat"],
    requiresPause: true,
    requiresSong: false,
    durationSecRange: [75, 120],
    learningFocus: "Object permanence, positions, or counting with a soft pre-cued reveal.",
    pattern: "Soft rustle or peek cue first (never startling), PAUSE to spot it, joyful reveal and recap."
  },
  tryAtHome: {
    id: "tryAtHome",
    label: "Recap & Try Together",
    preferredWorlds: ["home-nook", "learning-cloud", "meadow"],
    defaultTransitionIn: "fade",
    typicalBeatKinds: ["model", "invite", "repeat", "song"],
    requiresPause: true,
    requiresSong: false,
    durationSecRange: [70, 115],
    learningFocus: "Consolidate target words in a new context and callback the funniest gag.",
    pattern: "Friends gather to use everything they found, count/review together with a PAUSE, and share a warm laugh."
  },
  goodbye: {
    id: "goodbye",
    label: "All Done, Goodnight",
    preferredWorlds: ["home-nook", "starlight-cloud", "moonlit-nursery"],
    defaultTransitionIn: "fade",
    typicalBeatKinds: ["song", "outro"],
    requiresPause: false,
    requiresSong: true,
    durationSecRange: [45, 75],
    learningFocus: "Calm closure, goodbye routine, and real-world caregiver play handoff.",
    pattern: "Sing allDone, wave bye-bye one friend at a time, settle softly, and hold on the offline play card."
  },
  shortMoment: {
    id: "shortMoment",
    label: "9:16 Standalone Short Moment",
    preferredWorlds: ["meadow", "music-garden", "peekaboo-barn", "station", "learning-cloud"],
    defaultTransitionIn: "none",
    typicalBeatKinds: ["hook", "event", "invite", "repeat", "outro"],
    requiresPause: true,
    requiresSong: false,
    durationSecRange: [20, 55],
    learningFocus: "One complete joke or mini-song with one PAUSE beat in under 60 seconds.",
    pattern: "Quick visual hook, one silly gag + PAUSE beat + payoff, and a warm wave goodbye."
  }
};

export const LONG_SHOW_SEGMENT_ORDER: readonly SegmentTemplateId[] = [
  "coldOpen",
  "theme",
  "arrival",
  "wordGame",
  "songBreak",
  "surprise",
  "tryAtHome",
  "goodbye"
];

// ---------------------------------------------------------------------------
// C.4 Banter bible & character voice profiles.

export interface BanterCharacterVoice {
  readonly id: CharacterId | "narrator";
  readonly speaks: boolean;
  readonly personality: string;
  readonly runningGag: string;
  readonly catchphrases: readonly string[];
  readonly exampleLine: string;
  readonly bannedBehaviours: readonly string[];
}

export const BANTER_BIBLE: Readonly<Record<CharacterId | "narrator", BanterCharacterVoice>> = {
  momo: {
    id: "momo",
    speaks: true,
    personality: "Warm, curious, enthusiastic everyday friend who welcomes the viewer and asks for help kindly.",
    runningGag: 'Says "Uh-oh!" before every tiny problem, then solves it together with friends.',
    catchphrases: ["Uh-oh!", "Hi, friend!", "Thank you, friends!"],
    exampleLine: "Uh-oh! Where did my hat go?",
    bannedBehaviours: ["Never teases or scolds a friend.", "Never rushes the viewer during a pause."]
  },
  lulu: {
    id: "lulu",
    speaks: true,
    personality: "Joyful, bouncy music-loving dino who adores drums, stomping, and dancing.",
    runningGag: "Always one beat late on claps, stomps, or freezes, and giggles happily about it.",
    catchphrases: ["La la la!", "Boom, boom!", "Oops, I'm late!"],
    exampleLine: "Boom... boom... Oops, I'm late! La la!",
    bannedBehaviours: ["Never loud or startling.", "Never upset when off-beat; always models cheerful self-kindness."]
  },
  sheru: {
    id: "sheru",
    speaks: false,
    personality: "Loyal, eager, tail-wagging puppy who communicates purely with soft barks, sniffs, and proud hops.",
    runningGag: "Proudly fetches a funny wrong item first (like a sponge) before bringing the right toy.",
    catchphrases: ["Woof!"],
    exampleLine: "(sfx woofDouble; carries sponge proudly)",
    bannedBehaviours: [
      "NEVER speaks English or localized words; uses bark SFX only (or pure Woof! bark cues).",
      "Never growls, snaps, or scares anyone."
    ]
  },
  gogo: {
    id: "gogo",
    speaks: true,
    personality: "Cheerful, ultra-polite little train engine who loves counting carriages and steady rhythms.",
    runningGag: 'Stops politely and says "Excuse me!" to tiny things like butterflies, leaves, or clouds.',
    catchphrases: ["Choo-choo!", "All aboard!", "Excuse me, butterfly!"],
    exampleLine: "Stop! Excuse me, butterfly. You first!",
    bannedBehaviours: ["Never speeds recklessly or crashes.", "Never honks a harsh horn; uses soft whistle only."]
  },
  peeko: {
    id: "peeko",
    speaks: true,
    personality: "Sunny, giggly little yellow chick who loves peekaboo and cosy barn games.",
    runningGag: "Hides in plain sight behind tiny props, completely sure nobody can see.",
    catchphrases: ["Peekaboo!", "You can't see me!", "Here I am!"],
    exampleLine: "You can't see me! I'm hiding!",
    bannedBehaviours: ["Never pops out with a loud scare; always gives a soft giggle or rustle cue first."]
  },
  lumi: {
    id: "lumi",
    speaks: true,
    personality: "Calm, glowing cloud-and-star guide who introduces letters, colours, shapes, and bedtime hush.",
    runningGag: 'Models gentle correction by showing a real object, never saying "wrong" or "no, try again".',
    catchphrases: ["Look what I found!", "Twinkle, twinkle, soft and bright.", "Sweet dreams, friends."],
    exampleLine: "Hmm, that's a cookie. Look, here's the circle!",
    bannedBehaviours: ["Never quizzes, grades, or says wrong.", "Never speaks rapidly."]
  },
  tiko: {
    id: "tiko",
    speaks: true,
    personality: "Friendly rhythmic block-and-shape buddy who loves counting in threes and neat little stacks.",
    runningGag: "Counts one happy extra tap on his tummy or lines up shapes in tidy trios before a gentle wobble.",
    catchphrases: ["Tap, tap, count with me!", "One, two, three, tidy!", "Wobble, wobble, hooray!"],
    exampleLine: "Tap, tap! One, two, three blocks!",
    bannedBehaviours: ["Never counts above the episode's age-band limit.", "Never gets frustrated when blocks topple."]
  },
  narrator: {
    id: "narrator",
    speaks: true,
    personality: "Gentle, unhurried off-screen picture-book storyteller who bridges scenes warmly.",
    runningGag: "Names the quiet picture details and echoes the counted total calmly.",
    catchphrases: ["Far away, on Wonder World...", "All done for today."],
    exampleLine: "Far away, there's a little island.",
    bannedBehaviours: ["Never commands the child to speak.", "Never talks over a character or sung song."]
  }
};

export const BANTER_RULES: readonly string[] = [
  "One speaker at a time; every joke is one short sentence followed by a calm beat.",
  "Use the silly-mistake -> PAUSE -> child notices -> character thanks the viewer loop.",
  "Characters tease the situation, never each other; zero put-downs, eye-rolling, or sarcasm.",
  "Mistakes belong to the characters, never the child; silence always completes every turn.",
  "Every episode includes at least one warm thank-you or praise between friends.",
  "Every surprise has a soft audio or visual cue beforehand (rustle, peek, or 'Hmm?').",
  "Never show unsafe toddler behaviour (mouthing small items, climbing furniture, running from grown-ups) as a gag.",
  "Close long episodes with one warm callback to the episode's funniest moment."
];

// ---------------------------------------------------------------------------
// R9 Banned efficacy/marketing claims & A.7 / B.6 Child safety-facts checker.

export const BANNED_EFFICACY_CLAIMS: readonly string[] = [
  "teaches your child to talk",
  "teaches your toddler to talk",
  "speech therapy",
  "cures",
  "guarantees",
  "clinically proven",
  "milestone",
  "diagnose",
  "iq",
  "smart baby",
  "subscribe",
  "smash like",
  "link in bio",
  "buy now",
  "merch"
];

export const SCARY_OR_MEAN_WORDS: readonly string[] = [
  "monster",
  "monsters",
  "ghost",
  "ghosts",
  "scary",
  "scream",
  "screams",
  "hate",
  "stupid",
  "shut up",
  "die",
  "kill"
];

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryPattern(phrase: string): RegExp {
  return new RegExp(`(?:^|[^a-z0-9])${escapePattern(phrase).replace(/\s+/g, "\\s+")}(?=$|[^a-z0-9])`, "i");
}

const BANNED_CLAIM_PATTERNS = BANNED_EFFICACY_CLAIMS.map((claim) => ({
  claim,
  pattern: wordBoundaryPattern(claim)
}));

const SCARY_WORD_PATTERNS = SCARY_OR_MEAN_WORDS.map((word) => ({
  word,
  pattern: wordBoundaryPattern(word)
}));

/** Returns every banned efficacy, clinical, or CTA phrase found in `text`. */
export function bannedEfficacyClaimsIn(text: string): string[] {
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  return BANNED_CLAIM_PATTERNS.filter((entry) => entry.pattern.test(normalized)).map((entry) => entry.claim);
}

export interface SafetyFactIssue {
  readonly ruleId: string;
  readonly message: string;
}

const GROWN_UP_NOTE_PATTERN = /\b(?:grown-up|grown up|grownups|adult|parent|together|with you|picture book|not toddler toys)\b/i;

export const SAFETY_FACTS = {
  scaryWords: SCARY_OR_MEAN_WORDS,
  chokingHazards: [
    "whole grape",
    "whole grapes",
    "popcorn for babies",
    "marbles",
    "button battery",
    "small beads",
    "put a coin",
    "coins in mouth"
  ] as const,
  infantHoneyPattern: /\bhoney\b[^.?!]*\b(?:baby|babies|infant|one-year-old)\b|\b(?:baby|babies|infant)\b[^.?!]*\bhoney\b/i,
  balloonMouthPattern:
    /\b(?:blow\s+up|chew|mouth|suck|bite)\b[^.?!]*\bballoons?\b|\bballoons?\b[^.?!]*\b(?:in\s+(?:your|the|a)\s+mouth|blow\s+up|chew|suck)\b/i,
  streetAlonePattern:
    /\bcross(?:ing)?\s+the\s+(?:street|road)\s+(?:alone|by\s+yourself)\b|\brun\s+into\s+the\s+(?:street|road)\b/i,
  streetMentionPattern: /\bcross(?:ing)?\s+the\s+(?:street|road)\b/i,
  waterAlonePattern:
    /\b(?:water|bath|bathtub|pool|tub|swim|swimming)\b[^.?!]*\b(?:alone|by\s+yourself|without\s+a\s+grown-up)\b/i,
  waterPlayOfflinePattern: /\b(?:bath|bathtub|pool|tub|swim|bucket\s+of\s+water|pour\s+water)\b/i,
  unsafeStuntPattern:
    /\b(?:without\s+a\s+seatbelt|no\s+seatbelt|climb\s+on\s+the\s+(?:table|counter|shelf|window)|hide\s+from\s+(?:your\s+)?(?:grown-up|parent)|eat\s+non-food)\b/i
} as const;

/**
 * Checks a line, offline play card, caregiver bridge, or video description
 * against child-safety facts (PRD 09 A.7, B.6, C.4 #7).
 */
export function checkSafetyFacts(
  text: string,
  opts: { readonly context?: "line" | "offline" | "bridge" | "metadata" } = {}
): SafetyFactIssue[] {
  const issues: SafetyFactIssue[] = [];
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  const context = opts.context ?? "line";

  for (const entry of SCARY_WORD_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      issues.push({
        ruleId: "frightening-or-mean-word",
        message: `uses frightening or mean word "${entry.word}"`
      });
    }
  }

  for (const hazard of SAFETY_FACTS.chokingHazards) {
    if (wordBoundaryPattern(hazard).test(normalized)) {
      issues.push({
        ruleId: "choking-hazard",
        message: `mentions choking hazard "${hazard}"`
      });
    }
  }

  if (SAFETY_FACTS.infantHoneyPattern.test(normalized)) {
    issues.push({
      ruleId: "infant-honey",
      message: "mentions honey for babies/infants (infant botulism hazard)"
    });
  }

  if (SAFETY_FACTS.balloonMouthPattern.test(normalized) && !GROWN_UP_NOTE_PATTERN.test(normalized)) {
    issues.push({
      ruleId: "balloon-mouth-hazard",
      message: "instructs mouthing or blowing up balloons without a grown-up safety note"
    });
  } else if (context === "offline" && /\breal\s+balloons?\b/i.test(normalized) && !/not\s+toddler\s+toys/i.test(normalized)) {
    issues.push({
      ruleId: "balloon-offline-toy",
      message: "offline card suggests real balloons without noting that real balloons are not toddler toys"
    });
  }

  if (
    SAFETY_FACTS.streetAlonePattern.test(normalized) ||
    (SAFETY_FACTS.streetMentionPattern.test(normalized) && !GROWN_UP_NOTE_PATTERN.test(normalized))
  ) {
    issues.push({
      ruleId: "street-safety",
      message: "mentions crossing the street/road without holding a grown-up's hand"
    });
  }

  if (
    SAFETY_FACTS.waterAlonePattern.test(normalized) ||
    (context === "offline" && SAFETY_FACTS.waterPlayOfflinePattern.test(normalized) && !GROWN_UP_NOTE_PATTERN.test(normalized))
  ) {
    issues.push({
      ruleId: "water-supervision",
      message: "mentions water or bath play without grown-up supervision"
    });
  }

  if (SAFETY_FACTS.unsafeStuntPattern.test(normalized)) {
    issues.push({
      ruleId: "unsafe-behaviour",
      message: "depicts unsafe seatbelts, climbing, or hiding from a grown-up"
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// C.2 Season 1 52-week episode curriculum calendar.

export type CurriculumArc =
  | "launch"
  | "first-words"
  | "sounds-animals"
  | "body-routine"
  | "concepts-positions"
  | "numbers-shapes"
  | "letters"
  | "sleep-calm";

export interface EpisodeBrief {
  readonly week: number;
  readonly code: string;
  readonly slug: string;
  readonly title: string;
  readonly arc: CurriculumArc;
  readonly band: AgeBand;
  readonly host: Exclude<CharacterId, "sheru">;
  readonly coStars: readonly CharacterId[];
  readonly worlds: readonly WorldId[];
  readonly targetWords: readonly string[];
  readonly supportWords: readonly string[];
  readonly song: SongId;
  readonly comedyHook: string;
  readonly summary: string;
  readonly letter?: string;
  readonly sleepCategory?: SleepCategory;
}

function brief(spec: EpisodeBrief): EpisodeBrief {
  return spec;
}

export const SEASON_1_CALENDAR: readonly EpisodeBrief[] = [
  // Week 1 — Launch Episode (Part E).
  brief({
    week: 1,
    code: "s01e01",
    slug: "s01e01-welcome-to-wonder-world",
    title: "Welcome to Wonder World!",
    arc: "launch",
    band: "toddler",
    host: "momo",
    coStars: ["sheru", "gogo", "lulu", "peeko", "lumi"],
    worlds: ["meadow", "station", "music-garden", "peekaboo-barn", "learning-cloud", "home-nook", "starlight-cloud"],
    targetWords: ["hello", "friend", "ball", "go", "stop"],
    supportWords: ["uh-oh", "look", "more", "boom", "peekaboo", "star", "cake", "bye-bye"],
    song: "wonderTheme",
    comedyHook: "Sheru proudly brings a sponge instead of a ball, and brings the sponge back again at the party.",
    summary: "Momo gathers five party things across Wonder World with every friend to welcome a new friend: you."
  }),

  // Weeks 2-8 — First Words.
  brief({
    week: 2,
    code: "s01e02",
    slug: "s01e02-hello-and-bye-bye-wave",
    title: "Hello and Bye-Bye Wave",
    arc: "first-words",
    band: "little",
    host: "momo",
    coStars: ["peeko", "lulu"],
    worlds: ["meadow", "peekaboo-barn", "home-nook"],
    targetWords: ["hi", "bye"],
    supportWords: ["hello", "wave", "door", "look"],
    song: "hello",
    comedyHook: "Lulu waves hello one beat after the door closes, then Peeko peeks back out so Lulu gets a proper wave.",
    summary: "Momo and friends knock on cosy doors across the meadow and barn, practising warm waves hello and bye-bye."
  }),
  brief({
    week: 3,
    code: "s01e03",
    slug: "s01e03-more-bubbles-please",
    title: "More Bubbles, Please!",
    arc: "first-words",
    band: "little",
    host: "momo",
    coStars: ["sheru", "lumi"],
    worlds: ["meadow", "music-garden", "home-nook"],
    targetWords: ["more", "bubble"],
    supportWords: ["pop", "again", "up", "look"],
    song: "bubbleSong",
    comedyHook: "Sheru tries to catch a giant shiny bubble on his nose and looks puzzled when it pops softly.",
    summary: "Momo blows gentle floating bubbles in the meadow while Sheru hops after them and asks for more."
  }),
  brief({
    week: 4,
    code: "s01e04",
    slug: "s01e04-roll-the-ball-again",
    title: "Roll the Ball Again",
    arc: "first-words",
    band: "little",
    host: "momo",
    coStars: ["sheru", "gogo"],
    worlds: ["meadow", "station", "home-nook"],
    targetWords: ["ball", "roll"],
    supportWords: ["again", "go", "stop", "woof"],
    song: "ballRolls",
    comedyHook: "Sheru fetches a fluffy cushion first before rolling the bouncy red ball right to GoGo.",
    summary: "Momo, Sheru, and GoGo roll a bright ball back and forth from the meadow grass to the station platform."
  }),
  brief({
    week: 5,
    code: "s01e05",
    slug: "s01e05-open-the-surprise-box",
    title: "Open the Surprise Box",
    arc: "first-words",
    band: "toddler",
    host: "peeko",
    coStars: ["momo", "sheru"],
    worlds: ["peekaboo-barn", "meadow", "home-nook"],
    targetWords: ["open", "close", "box"],
    supportWords: ["teddy", "look", "uh-oh", "there"],
    song: "peekaboo",
    comedyHook: "Peeko hides behind a tiny closed toy box with yellow feathers sticking right out the top.",
    summary: "Peeko and Momo discover three colourful boxes at the barn and open and close each lid to see what is inside."
  }),
  brief({
    week: 6,
    code: "s01e06",
    slug: "s01e06-meet-tiko-tap-along",
    title: "Meet Tiko! Tap and Play",
    arc: "first-words",
    band: "toddler",
    host: "momo",
    coStars: ["tiko", "lulu"],
    worlds: ["meadow", "music-garden", "home-nook"],
    targetWords: ["hello", "block", "again"],
    supportWords: ["hi", "clap", "my-turn", "your-turn", "thank-you"],
    song: "hello",
    comedyHook: "Momo introduces newcomer Tiko, who taps three neat block beats while Lulu claps one happy beat late.",
    summary: "Momo welcomes friendly block-buddy Tiko to Wonder World with a gentle tap-and-stack game in the Music Garden."
  }),
  brief({
    week: 7,
    code: "s01e07",
    slug: "s01e07-help-and-thank-you-picnic",
    title: "Help and Thank You Picnic",
    arc: "first-words",
    band: "toddler",
    host: "momo",
    coStars: ["sheru", "peeko", "gogo"],
    worlds: ["meadow", "station", "home-nook"],
    targetWords: ["help", "thank-you", "picnic"],
    supportWords: ["apple", "plate", "more", "all-done"],
    song: "hello",
    comedyHook: "Momo's picnic basket lid is stuck ('Uh-oh!'), and Sheru offers a toy towel before Peeko helps lift the latch.",
    summary: "GoGo carries the picnic basket to the meadow where friends help unpack plates and model warm thank-yous."
  }),
  brief({
    week: 8,
    code: "s01e08",
    slug: "s01e08-my-turn-your-turn-drum",
    title: "My Turn, Your Turn Drum",
    arc: "first-words",
    band: "toddler",
    host: "lulu",
    coStars: ["momo", "tiko"],
    worlds: ["music-garden", "meadow", "home-nook"],
    targetWords: ["my-turn", "your-turn", "drum"],
    supportWords: ["boom", "stop", "go", "all-done"],
    song: "goStop",
    comedyHook: "Lulu waits so patiently for Tiko's turn that she freezes like a statue and forgets one boom.",
    summary: "Lulu, Momo, and Tiko share one big garden drum, taking calm turns tapping soft rhythms together."
  }),

  // Weeks 9-16 — Sounds & Animals.
  brief({
    week: 9,
    code: "s01e09",
    slug: "s01e09-moo-and-baa-at-the-barn",
    title: "Moo and Baa at the Barn",
    arc: "sounds-animals",
    band: "little",
    host: "peeko",
    coStars: ["momo", "sheru"],
    worlds: ["peekaboo-barn", "meadow", "home-nook"],
    targetWords: ["cow", "moo"],
    supportWords: ["sheep", "baa", "look", "door"],
    song: "animalBand",
    comedyHook: "Momo guesses the spotted cow says quack until Peeko opens the barn door for a gentle moo.",
    summary: "Peeko and Momo listen at the barn door and greet the friendly cow and fluffy sheep by sound."
  }),
  brief({
    week: 10,
    code: "s01e10",
    slug: "s01e10-little-duck-says-quack",
    title: "Little Duck Says Quack",
    arc: "sounds-animals",
    band: "little",
    host: "peeko",
    coStars: ["lulu", "sheru"],
    worlds: ["meadow", "peekaboo-barn", "home-nook"],
    targetWords: ["duck", "quack"],
    supportWords: ["water", "walk", "hi", "bye"],
    song: "animalBand",
    comedyHook: "Lulu waddles one step behind the little duck and quacks right after everyone stops.",
    summary: "A toy duck waddles across the sunny meadow while Peeko and Lulu copy its soft quack-quack rhythm."
  }),
  brief({
    week: 11,
    code: "s01e11",
    slug: "s01e11-gentle-horse-says-neigh",
    title: "Gentle Horse Says Neigh",
    arc: "sounds-animals",
    band: "toddler",
    host: "gogo",
    coStars: ["peeko", "momo"],
    worlds: ["station", "peekaboo-barn", "home-nook"],
    targetWords: ["horse", "neigh", "bell"],
    supportWords: ["go", "stop", "barn", "thank-you"],
    song: "trainSong",
    comedyHook: "GoGo stops on the tracks and says 'Excuse me, Mr Horse!' even though the horse is standing beside the barn.",
    summary: "GoGo rides past Peekaboo Barn where a gentle toy horse greets the train with a soft neigh and a bell."
  }),
  brief({
    week: 12,
    code: "s01e12",
    slug: "s01e12-sherus-happy-woof-trail",
    title: "Sheru's Happy Woof Trail",
    arc: "sounds-animals",
    band: "little",
    host: "momo",
    coStars: ["sheru", "peeko"],
    worlds: ["meadow", "peekaboo-barn", "home-nook"],
    targetWords: ["dog", "woof"],
    supportWords: ["ball", "find", "where", "there"],
    song: "ballRolls",
    comedyHook: "Sheru sniffs three bushes looking for his ball and proudly pulls out a yellow party hat first.",
    summary: "Momo follows Sheru's soft woof clues across the meadow to find where his favourite ball rolled."
  }),
  brief({
    week: 13,
    code: "s01e13",
    slug: "s01e13-tweet-tweet-little-bird",
    title: "Tweet, Tweet, Little Bird",
    arc: "sounds-animals",
    band: "little",
    host: "lumi",
    coStars: ["peeko", "gogo"],
    worlds: ["meadow", "learning-cloud", "home-nook"],
    targetWords: ["bird", "tweet"],
    supportWords: ["butterfly", "flower", "up", "look"],
    song: "hello",
    comedyHook: "GoGo whispers 'Excuse me, butterfly!' in a tiny hush so the little bird on the branch keeps singing.",
    summary: "Lumi and Peeko listen quietly in the meadow trees for a little bird's soft tweet and watch butterflies flutter."
  }),
  brief({
    week: 14,
    code: "s01e14",
    slug: "s01e14-momo-silly-sound-mirror",
    title: "Momo's Silly Sound Mirror",
    arc: "sounds-animals",
    band: "little",
    host: "momo",
    coStars: ["lulu", "peeko"],
    worlds: ["home-nook", "music-garden"],
    targetWords: ["ah", "oh"],
    supportWords: ["mmm", "mirror", "happy", "more"],
    song: "faceSong",
    comedyHook: "Momo makes a big surprised 'Oh!' in the mirror and Lulu makes her 'Oh!' pose after Momo already switched to 'Mmm!'.",
    summary: "Momo and Lulu play in front of the cosy Home Nook mirror, pairing playful poses with soft ah, oh, and mmm sounds."
  }),
  brief({
    week: 15,
    code: "s01e15",
    slug: "s01e15-lulus-little-animal-band",
    title: "Lulu's Little Animal Band",
    arc: "sounds-animals",
    band: "toddler",
    host: "lulu",
    coStars: ["peeko", "sheru", "momo"],
    worlds: ["music-garden", "peekaboo-barn", "home-nook"],
    targetWords: ["boom", "moo", "quack", "baa"],
    supportWords: ["drum", "woof", "clap", "all-done"],
    song: "animalBand",
    comedyHook: "Lulu conducts the farm band, taps 'Boom!' one beat late, and bows proudly to the sheep.",
    summary: "Lulu invites the barn animals to the Music Garden so each animal sound joins one gentle song."
  }),
  brief({
    week: 16,
    code: "s01e16",
    slug: "s01e16-beep-beep-friendly-robot",
    title: "Beep, Beep, Friendly Robot",
    arc: "sounds-animals",
    band: "toddler",
    host: "tiko",
    coStars: ["momo", "lumi"],
    worlds: ["learning-cloud", "home-nook", "music-garden"],
    targetWords: ["robot", "beep", "dance"],
    supportWords: ["go", "stop", "hat", "uh-oh"],
    song: "goStop",
    comedyHook: "Momo puts a hat on the toy robot ('Uh-oh, upside down!'), and Tiko taps three neat beeps to start its dance.",
    summary: "Tiko and Momo wind up a gentle toy robot on Learning Cloud and copy its slow beep-beep robot steps."
  }),

  // Weeks 17-24 — Body & Routine.
  brief({
    week: 17,
    code: "s01e17",
    slug: "s01e17-clap-hands-stomp-feet",
    title: "Clap Hands, Stomp Feet",
    arc: "body-routine",
    band: "toddler",
    host: "lulu",
    coStars: ["momo", "tiko"],
    worlds: ["music-garden", "meadow", "home-nook"],
    targetWords: ["hands", "feet", "clap", "stomp"],
    supportWords: ["dance", "stop", "go", "again"],
    song: "goStop",
    comedyHook: "Lulu stomps when everyone claps and claps when everyone freezes, giggling 'La la! My feet wanted a turn!'",
    summary: "Lulu leads a gentle garden movement game naming hands for clapping and feet for slow dino stomps."
  }),
  brief({
    week: 18,
    code: "s01e18",
    slug: "s01e18-boop-nose-and-silly-hat",
    title: "Boop Nose and Silly Hat",
    arc: "body-routine",
    band: "little",
    host: "momo",
    coStars: ["peeko", "sheru"],
    worlds: ["home-nook", "meadow"],
    targetWords: ["nose", "hat"],
    supportWords: ["hand", "mirror", "where", "there"],
    song: "faceSong",
    comedyHook: "Sheru brings a toy plate as a hat, then Momo balances a soft party hat right over his nose.",
    summary: "Momo plays a gentle mirror game finding his nose, waving a hand, and trying on a cosy hat."
  }),
  brief({
    week: 19,
    code: "s01e19",
    slug: "s01e19-good-morning-sunny-wake-up",
    title: "Good Morning, Sunny Wake-Up",
    arc: "body-routine",
    band: "toddler",
    host: "momo",
    coStars: ["peeko", "lumi"],
    worlds: ["home-nook", "meadow"],
    targetWords: ["wake", "sun", "bed"],
    supportWords: ["blanket", "hi", "open", "look"],
    song: "routine",
    comedyHook: "Peeko thinks it is still peekaboo time under the blanket while the golden sun shines outside.",
    summary: "The warm sun rises over Home Nook as Momo stretches awake, folds his blanket, and greets the morning."
  }),
  brief({
    week: 20,
    code: "s01e20",
    slug: "s01e20-wash-wash-happy-hands",
    title: "Wash, Wash, Happy Hands",
    arc: "body-routine",
    band: "toddler",
    host: "momo",
    coStars: ["sheru", "lulu"],
    worlds: ["home-nook", "meadow"],
    targetWords: ["wash", "water", "towel"],
    supportWords: ["hands", "sponge", "wet", "dry"],
    song: "routine",
    comedyHook: "Sheru brings his favourite sponge to the sink, and Lulu dries her hands one beat after the song ends.",
    summary: "After garden play, Momo and Lulu wash their hands at the sink and pat them dry with a soft towel."
  }),
  brief({
    week: 21,
    code: "s01e21",
    slug: "s01e21-yummy-apple-and-banana-snack",
    title: "Yummy Apple and Banana Snack",
    arc: "body-routine",
    band: "toddler",
    host: "momo",
    coStars: ["peeko", "tiko"],
    worlds: ["home-nook", "meadow"],
    targetWords: ["eat", "apple", "banana"],
    supportWords: ["tummy", "plate", "drink", "mmm", "thank-you"],
    song: "routine",
    comedyHook: "Momo's tummy gives a soft rumble ('Uh-oh!'), and Tiko lines up three neat snack plates on the table.",
    summary: "Momo shares a calm snack of red apple slices, yellow bananas, and a sip of water with Peeko and Tiko."
  }),
  brief({
    week: 22,
    code: "s01e22",
    slug: "s01e22-brush-brush-sparkle-time",
    title: "Brush, Brush, Sparkle Time",
    arc: "body-routine",
    band: "toddler",
    host: "momo",
    coStars: ["lumi", "sheru"],
    worlds: ["home-nook", "starlight-cloud"],
    targetWords: ["brush", "mirror", "water"],
    supportWords: ["hand", "open", "all-done", "star"],
    song: "routine",
    comedyHook: "Sheru brings a bubble wand instead of the toothbrush first ('Uh-oh, Sheru, bubbles are for outside!').",
    summary: "Momo stands by the Home Nook mirror and practises slow, gentle up-and-down brushing before evening storytime."
  }),
  brief({
    week: 23,
    code: "s01e23",
    slug: "s01e23-all-done-tidy-toy-box",
    title: "All Done! Tidy Toy Box",
    arc: "body-routine",
    band: "toddler",
    host: "tiko",
    coStars: ["momo", "sheru", "peeko"],
    worlds: ["home-nook", "peekaboo-barn"],
    targetWords: ["all-done", "in", "box"],
    supportWords: ["ball", "teddy", "block", "thank-you", "bye"],
    song: "allDone",
    comedyHook: "Tiko counts each toy going in the toy box, and Peeko hops in too pretending to be a fluffy yellow toy.",
    summary: "Playtime winds down as Tiko, Momo, and Sheru put the ball, blocks, and teddy neatly into the toy box."
  }),
  brief({
    week: 24,
    code: "s01e24",
    slug: "s01e24-teddy-bedtime-tuck-in",
    title: "Teddy's Bedtime Tuck-In",
    arc: "body-routine",
    band: "little",
    host: "momo",
    coStars: ["lumi", "peeko"],
    worlds: ["home-nook", "moonlit-nursery", "starlight-cloud"],
    targetWords: ["teddy", "sleep"],
    supportWords: ["bed", "blanket", "moon", "quiet", "hush"],
    song: "lullaby",
    comedyHook: "Momo tucks the blanket over a toy drum by mistake ('Uh-oh!') before Lumi shines softly on sleepy Teddy.",
    summary: "Momo and Lumi help sleepy Teddy settle onto his pillow under a warm blanket as the moon rises.",
    sleepCategory: "bedtime"
  }),

  // Weeks 25-32 — Concepts & Positions.
  brief({
    week: 25,
    code: "s01e25",
    slug: "s01e25-big-ball-small-ball",
    title: "Big Ball, Small Ball",
    arc: "concepts-positions",
    band: "toddler",
    host: "momo",
    coStars: ["sheru", "lulu"],
    worlds: ["meadow", "music-garden", "home-nook"],
    targetWords: ["big", "small", "ball"],
    supportWords: ["roll", "drum", "look", "more"],
    song: "ballRolls",
    comedyHook: "Sheru tries to carry a giant meadow ball that is bigger than he is, then wags happily with a small one.",
    summary: "Momo, Sheru, and Lulu compare big and small balls and drums across the Meadow and Music Garden."
  }),
  brief({
    week: 26,
    code: "s01e26",
    slug: "s01e26-up-high-and-down-low-lift",
    title: "Up High and Down Low Lift",
    arc: "concepts-positions",
    band: "toddler",
    host: "gogo",
    coStars: ["momo", "lumi"],
    worlds: ["station", "learning-cloud", "home-nook"],
    targetWords: ["up", "down", "lift"],
    supportWords: ["balloon", "cloud", "go", "stop"],
    song: "trainSong",
    comedyHook: "GoGo says 'Excuse me, cloud!' as the little station lift rises gently toward Learning Cloud.",
    summary: "GoGo and Momo ride the little lift up high to visit Lumi's clouds and glide back down to the station."
  }),
  brief({
    week: 27,
    code: "s01e27",
    slug: "s01e27-in-the-barn-and-out-again",
    title: "In the Barn and Out Again",
    arc: "concepts-positions",
    band: "toddler",
    host: "peeko",
    coStars: ["gogo", "sheru"],
    worlds: ["peekaboo-barn", "station", "home-nook"],
    targetWords: ["in", "out", "door"],
    supportWords: ["open", "close", "cow", "duck"],
    song: "peekaboo",
    comedyHook: "Peeko steps out of the barn while Sheru trots in, so they keep missing each other with soft giggles.",
    summary: "Peeko opens the big barn doors to guide toy animals in from the meadow and back out into the sunshine."
  }),
  brief({
    week: 28,
    code: "s01e28",
    slug: "s01e28-on-the-table-under-the-blanket",
    title: "On the Table, Under the Blanket",
    arc: "concepts-positions",
    band: "toddler",
    host: "momo",
    coStars: ["peeko", "lumi"],
    worlds: ["home-nook", "peekaboo-barn"],
    targetWords: ["on", "under", "where"],
    supportWords: ["teddy", "blanket", "hat", "there"],
    song: "peekaboo",
    comedyHook: "Peeko sits right on top of the cushion while calling 'I am hiding under here!'",
    summary: "Momo and Lumi play a gentle hide-and-find game spotting toys on the table and cosy under a soft blanket."
  }),
  brief({
    week: 29,
    code: "s01e29",
    slug: "s01e29-behind-the-bush-peekaboo",
    title: "Behind the Bush Peekaboo",
    arc: "concepts-positions",
    band: "toddler",
    host: "peeko",
    coStars: ["momo", "sheru", "lulu"],
    worlds: ["meadow", "peekaboo-barn", "home-nook"],
    targetWords: ["behind", "where", "there"],
    supportWords: ["peekaboo", "find", "look", "flower"],
    song: "peekaboo",
    comedyHook: "Peeko hides behind one slender flower stem while Lulu peeks out a beat late behind the big bush.",
    summary: "Friends take turns hiding gently behind bushes and barn doors so the viewer can spot where everyone is."
  }),
  brief({
    week: 30,
    code: "s01e30",
    slug: "s01e30-fast-and-slow-with-gogo",
    title: "Fast and Slow with GoGo",
    arc: "concepts-positions",
    band: "toddler",
    host: "gogo",
    coStars: ["lulu", "sheru"],
    worlds: ["station", "music-garden", "home-nook"],
    targetWords: ["fast", "slow", "stop"],
    supportWords: ["go", "train", "car", "drum"],
    song: "trainSong",
    comedyHook: "GoGo rolls along briskly, then slows right down to a crawl to let a tiny butterfly cross first.",
    summary: "GoGo demonstrates smooth fast chugging and calm slow gliding at the station while Lulu matches the tempo on her drum."
  }),
  brief({
    week: 31,
    code: "s01e31",
    slug: "s01e31-wet-sponge-dry-towel-car-wash",
    title: "Wet Sponge, Dry Towel Car Wash",
    arc: "concepts-positions",
    band: "toddler",
    host: "momo",
    coStars: ["gogo", "sheru"],
    worlds: ["meadow", "station", "home-nook"],
    targetWords: ["wet", "dry", "car"],
    supportWords: ["wash", "sponge", "towel", "water"],
    song: "routine",
    comedyHook: "At last Sheru's famous sponge is the exact right thing to bring, and everyone cheers for Sheru!",
    summary: "Momo, GoGo, and proud helper Sheru wash a muddy little toy car with a wet sponge and buff it dry with a towel."
  }),
  brief({
    week: 32,
    code: "s01e32",
    slug: "s01e32-red-blue-yellow-green-colours",
    title: "Red, Blue, Yellow, Green Colours",
    arc: "concepts-positions",
    band: "toddler",
    host: "lumi",
    coStars: ["momo", "lulu", "tiko"],
    worlds: ["learning-cloud", "meadow", "home-nook"],
    targetWords: ["red", "blue", "yellow", "green"],
    supportWords: ["ball", "apple", "banana", "flower"],
    song: "colours",
    comedyHook: "Momo guesses a yellow banana is blue until Lumi holds it beside a bright blue ball.",
    summary: "Lumi lights up the Magic Colour Machine on Learning Cloud, matching red apples, blue balls, yellow bananas, and green grass."
  }),

  // Weeks 33-40 — Numbers 1-3 (and 1-5) & Shapes (featuring Tiko).
  brief({
    week: 33,
    code: "s01e33",
    slug: "s01e33-one-two-three-blocks-with-tiko",
    title: "One, Two, Three Blocks with Tiko",
    arc: "numbers-shapes",
    band: "little",
    host: "tiko",
    coStars: ["momo", "sheru"],
    worlds: ["learning-cloud", "meadow", "home-nook"],
    targetWords: ["one", "two", "three"],
    supportWords: ["block", "up", "uh-oh", "again"],
    song: "countToThree",
    comedyHook: "Tiko stacks three neat blocks, taps one extra beat on his tummy, and giggles when the top block wobbles.",
    summary: "Tiko places big colourful blocks one at a time, counting one, two, three before a gentle tumble and rebuild."
  }),
  brief({
    week: 34,
    code: "s01e34",
    slug: "s01e34-three-round-cookies-on-a-plate",
    title: "Three Round Cookies on a Plate",
    arc: "numbers-shapes",
    band: "toddler",
    host: "momo",
    coStars: ["tiko", "peeko"],
    worlds: ["home-nook", "meadow"],
    targetWords: ["one", "two", "three", "cookie"],
    supportWords: ["plate", "eat", "mmm", "thank-you"],
    song: "countToThree",
    comedyHook: "Momo sets out two cookies and says 'Three!' ('Uh-oh!') until Tiko brings the third cookie to the plate.",
    summary: "Momo, Tiko, and Peeko count three round toy cookies onto a picnic plate so each friend gets one."
  }),
  brief({
    week: 35,
    code: "s01e35",
    slug: "s01e35-round-circles-with-tiko-and-lumi",
    title: "Round Circles with Tiko and Lumi",
    arc: "numbers-shapes",
    band: "toddler",
    host: "tiko",
    coStars: ["lumi", "momo"],
    worlds: ["learning-cloud", "home-nook", "music-garden"],
    targetWords: ["circle", "plate", "drum"],
    supportWords: ["ball", "cookie", "look", "one", "two", "three"],
    song: "shapes",
    comedyHook: "Momo holds up a square block for the circle parade, and Lumi gently traces a round plate right beside it.",
    summary: "Tiko and Lumi go on a circle hunt across Wonder World, spotting round plates, drums, cookies, and balls."
  }),
  brief({
    week: 36,
    code: "s01e36",
    slug: "s01e36-neat-little-squares-with-tiko",
    title: "Neat Little Squares with Tiko",
    arc: "numbers-shapes",
    band: "toddler",
    host: "tiko",
    coStars: ["momo", "gogo"],
    worlds: ["station", "learning-cloud", "home-nook"],
    targetWords: ["square", "block", "box"],
    supportWords: ["one", "two", "three", "in", "on"],
    song: "shapes",
    comedyHook: "Tiko lines up three square blocks on GoGo's carriage while GoGo politely asks a square pastry if it wants a ticket.",
    summary: "Tiko and GoGo load square blocks, square boxes, and bakery treats onto the train, counting four neat corners."
  }),
  brief({
    week: 37,
    code: "s01e37",
    slug: "s01e37-pointy-triangles-party-hats",
    title: "Pointy Triangles and Party Hats",
    arc: "numbers-shapes",
    band: "toddler",
    host: "lumi",
    coStars: ["tiko", "peeko", "lulu"],
    worlds: ["learning-cloud", "peekaboo-barn", "home-nook"],
    targetWords: ["triangle", "hat", "three"],
    supportWords: ["one", "two", "look", "happy"],
    song: "shapes",
    comedyHook: "Peeko wears a pointy triangle party hat over his eyes for peekaboo while Tiko taps its three corners.",
    summary: "Lumi and Tiko bake triangle pastries in the shape bakery and share pointy triangle hats with Peeko and Lulu."
  }),
  brief({
    week: 38,
    code: "s01e38",
    slug: "s01e38-count-to-five-train-carriages",
    title: "Count to Five Train Carriages",
    arc: "numbers-shapes",
    band: "toddler",
    host: "gogo",
    coStars: ["tiko", "momo", "sheru"],
    worlds: ["station", "meadow", "home-nook"],
    targetWords: ["one", "two", "three", "four", "five"],
    supportWords: ["train", "go", "stop", "all-done"],
    song: "trainSong",
    comedyHook: "GoGo couples four carriages and wonders who rides in number five — Sheru hops aboard wagging with his ball!",
    summary: "GoGo and Tiko couple five colourful train carriages in order at the station, counting passengers from one to five."
  }),
  brief({
    week: 39,
    code: "s01e39",
    slug: "s01e39-magic-shape-bakery-parade",
    title: "Magic Shape Bakery Parade",
    arc: "numbers-shapes",
    band: "preschool",
    host: "tiko",
    coStars: ["lumi", "lulu", "momo"],
    worlds: ["learning-cloud", "music-garden", "home-nook"],
    targetWords: ["circle", "square", "triangle"],
    supportWords: ["plate", "block", "hat", "one", "two", "three"],
    song: "shapes",
    comedyHook: "Lulu marches one beat late in the shape parade and accidentally swaps her circle drum for Momo's triangle hat.",
    summary: "Tiko, Lumi, and Lulu sort circles, squares, and triangles from the Magic Shape Bakery for a musical garden parade."
  }),
  brief({
    week: 40,
    code: "s01e40",
    slug: "s01e40-five-stars-in-the-sky",
    title: "Five Twinkly Stars in the Sky",
    arc: "numbers-shapes",
    band: "toddler",
    host: "lumi",
    coStars: ["tiko", "momo"],
    worlds: ["learning-cloud", "starlight-cloud", "home-nook"],
    targetWords: ["star", "one", "two", "three", "five"],
    supportWords: ["up", "cloud", "moon", "look"],
    song: "twinkleRest",
    comedyHook: "Tiko counts to four stars and pauses until Lumi gives a gentle glow and reveals star number five right overhead.",
    summary: "As dusk settles on Learning Cloud, Lumi, Tiko, and Momo light up five golden stars one by one."
  }),

  // Weeks 41-46 — Letters One at a Time.
  brief({
    week: 41,
    code: "s01e41",
    slug: "s01e41-letter-b-ball-bear-bird",
    title: "Letter B: Ball, Bear, and Bird",
    arc: "letters",
    band: "preschool",
    host: "lumi",
    coStars: ["momo", "sheru"],
    worlds: ["learning-cloud", "meadow", "home-nook"],
    targetWords: ["b", "ball", "bear", "bird"],
    supportWords: ["bubble", "look", "find", "there"],
    song: "abc",
    comedyHook: "Sheru brings a yellow banana too — and Lumi smiles because banana starts with the b-b-banana sound as well!",
    summary: "Lumi introduces the letter B and its gentle lip-popping sound using a bouncy ball, a teddy bear, and a little bird.",
    letter: "B"
  }),
  brief({
    week: 42,
    code: "s01e42",
    slug: "s01e42-letter-a-apple-on-gogo-train",
    title: "Letter A: Apples on GoGo's Train",
    arc: "letters",
    band: "preschool",
    host: "lumi",
    coStars: ["gogo", "momo"],
    worlds: ["learning-cloud", "station", "home-nook"],
    targetWords: ["a", "apple", "train"],
    supportWords: ["red", "eat", "in", "thank-you"],
    song: "trainSong",
    comedyHook: "Momo holds up a round cookie for A, and Lumi kindly sets a crisp red apple beside the big letter A.",
    summary: "Lumi and GoGo load red apples aboard the station carriage while keeping the letter name A distinct from its short sound.",
    letter: "A"
  }),
  brief({
    week: 43,
    code: "s01e43",
    slug: "s01e43-letter-m-moon-mirror-music",
    title: "Letter M: Moon, Mirror, and Music",
    arc: "letters",
    band: "preschool",
    host: "lumi",
    coStars: ["momo", "lulu"],
    worlds: ["learning-cloud", "music-garden", "home-nook"],
    targetWords: ["moon", "mirror", "mmm"],
    supportWords: ["look", "drum", "star", "happy"],
    song: "faceSong",
    comedyHook: "Momo hums 'mmm' for a tasty muffin while Lulu taps her music box one beat late.",
    summary: "Lumi explores the letter M and its humming mmm sound with Momo's mirror, Lulu's music box, and a glowing moon.",
    letter: "M"
  }),
  brief({
    week: 44,
    code: "s01e44",
    slug: "s01e44-letter-s-sun-star-sponge",
    title: "Letter S: Sun, Star, and Sponge",
    arc: "letters",
    band: "preschool",
    host: "lumi",
    coStars: ["sheru", "momo"],
    worlds: ["learning-cloud", "meadow", "home-nook"],
    targetWords: ["sun", "star", "sponge"],
    supportWords: ["stop", "slow", "soft", "look"],
    song: "colours",
    comedyHook: "Sheru brings his squishy sponge right on cue — and for Letter S, the sponge is the star of the show!",
    summary: "Lumi models the letter S and its soft sss sound alongside the morning sun, a star, and Sheru's famous sponge.",
    letter: "S"
  }),
  brief({
    week: 45,
    code: "s01e45",
    slug: "s01e45-letter-t-train-teddy-towel",
    title: "Letter T: Train, Teddy, and Towel",
    arc: "letters",
    band: "preschool",
    host: "tiko",
    coStars: ["lumi", "gogo"],
    worlds: ["station", "learning-cloud", "home-nook"],
    targetWords: ["train", "teddy", "towel"],
    supportWords: ["table", "two", "thank-you", "go"],
    song: "trainSong",
    comedyHook: "Tiko beams when Lumi points out that Tiko, train, teddy, and table all share the same crisp starting sound.",
    summary: "Tiko and Lumi ride GoGo's train to gather a teddy, a soft towel, and a little table for Letter T day.",
    letter: "T"
  }),
  brief({
    week: 46,
    code: "s01e46",
    slug: "s01e46-letter-p-plate-picnic-peekaboo",
    title: "Letter P: Plate, Picnic, and Peekaboo",
    arc: "letters",
    band: "preschool",
    host: "peeko",
    coStars: ["lumi", "momo"],
    worlds: ["peekaboo-barn", "meadow", "learning-cloud"],
    targetWords: ["plate", "picnic", "peekaboo"],
    supportWords: ["pop", "pillow", "open", "happy"],
    song: "peekaboo",
    comedyHook: "Peeko hides behind a round picnic plate and pops up gently when Lumi models the soft p-p-plate sound.",
    summary: "Peeko and Lumi host a meadow picnic with plates, popping bubbles, and peekaboo for Letter P.",
    letter: "P"
  }),

  // Weeks 47-52 — Sleep & Calm.
  brief({
    week: 47,
    code: "s01e47",
    slug: "s01e47-lumi-moonlit-lullaby-cloud",
    title: "Lumi's Moonlit Lullaby Cloud",
    arc: "sleep-calm",
    band: "little",
    host: "lumi",
    coStars: ["momo", "peeko"],
    worlds: ["moonlit-nursery", "starlight-cloud"],
    targetWords: ["moon", "sleep"],
    supportWords: ["star", "quiet", "hush", "night"],
    song: "lullaby",
    comedyHook: "Momo gives one tiny sleepy yawn and curls up beside his cushion while Lumi dims the cloud lanterns.",
    summary: "Lumi floats gently through Moonlit Nursery and Starlight Cloud, singing a hushed lullaby under the golden moon.",
    sleepCategory: "bedtime"
  }),
  brief({
    week: 48,
    code: "s01e48",
    slug: "s01e48-warm-blanket-cosy-friends",
    title: "Warm Blanket, Cosy Friends",
    arc: "sleep-calm",
    band: "little",
    host: "momo",
    coStars: ["lumi", "sheru"],
    worlds: ["home-nook", "moonlit-nursery"],
    targetWords: ["blanket", "soft"],
    supportWords: ["pillow", "teddy", "bed", "sleep"],
    song: "warmBlanketSong",
    comedyHook: "Sheru brings his soft blanket instead of the sponge and curls into a cosy little ball at the foot of the bed.",
    summary: "Momo and Lumi tuck Teddy and Sheru under warm, soft blankets as the room settles into evening calm.",
    sleepCategory: "bedtime"
  }),
  brief({
    week: 49,
    code: "s01e49",
    slug: "s01e49-three-sleepy-cloud-sheep",
    title: "Three Sleepy Cloud Sheep",
    arc: "sleep-calm",
    band: "toddler",
    host: "lumi",
    coStars: ["tiko", "peeko"],
    worlds: ["starlight-cloud", "moonlit-nursery"],
    targetWords: ["sheep", "one", "two", "three"],
    supportWords: ["cloud", "soft", "quiet", "sleep"],
    song: "countingSheepSong",
    comedyHook: "Tiko whispers a hushed one, two, three as each fluffy sheep settles onto a cloud pillow and yawns.",
    summary: "Lumi and Tiko count three fluffy sheep drifting slowly onto soft starlight clouds for a peaceful rest.",
    sleepCategory: "bedtime"
  }),
  brief({
    week: 50,
    code: "s01e50",
    slug: "s01e50-gogo-quiet-night-train",
    title: "GoGo's Quiet Night Train",
    arc: "sleep-calm",
    band: "toddler",
    host: "gogo",
    coStars: ["lumi", "momo"],
    worlds: ["station", "starlight-cloud", "moonlit-nursery"],
    targetWords: ["slow", "quiet", "night"],
    supportWords: ["train", "moon", "dream", "sleep"],
    song: "dreamBoatSong",
    comedyHook: "GoGo whispers the tiniest 'Excuse me, moonbeam!' as the night train glides slowly toward Starlight Cloud.",
    summary: "GoGo dims his headlamp and glides slowly along the evening tracks, carrying sleepy friends to Moonlit Nursery.",
    sleepCategory: "bedtime"
  }),
  brief({
    week: 51,
    code: "s01e51",
    slug: "s01e51-peeko-sleepy-garden-hush",
    title: "Peeko's Sleepy Garden Hush",
    arc: "sleep-calm",
    band: "little",
    host: "peeko",
    coStars: ["lumi", "lulu"],
    worlds: ["music-garden", "moonlit-nursery", "starlight-cloud"],
    targetWords: ["hush", "quiet"],
    supportWords: ["flower", "close", "night", "sleep"],
    song: "cricketHush",
    comedyHook: "Lulu plays one ultra-soft music-box note a moment late, then whispers 'Shh... goodnight, drum.'",
    summary: "Evening flowers close in the Music Garden as Peeko, Lulu, and Lumi whisper goodnight to every sleepy corner.",
    sleepCategory: "bedtime"
  }),
  brief({
    week: 52,
    code: "s01e52",
    slug: "s01e52-wonder-world-starlight-goodnight",
    title: "Wonder World's Starlight Goodnight",
    arc: "sleep-calm",
    band: "toddler",
    host: "momo",
    coStars: ["lumi", "lulu", "gogo", "peeko", "sheru", "tiko"],
    worlds: ["home-nook", "moonlit-nursery", "starlight-cloud"],
    targetWords: ["dream", "star", "bye"],
    supportWords: ["hello", "thank-you", "moon", "quiet", "sleep"],
    song: "twinkleRest",
    comedyHook: "Every friend brings one cosy bedtime treasure, and Sheru tucks his sponge beside his pillow for sweet dreams.",
    summary: "All seven Wonder World friends gather under the starlight sky to thank their friend, sing softly, and wish sweet dreams.",
    sleepCategory: "bedtime"
  })
];

const BY_WEEK: ReadonlyMap<number, EpisodeBrief> = new Map(SEASON_1_CALENDAR.map((item) => [item.week, item]));
const BY_CODE: ReadonlyMap<string, EpisodeBrief> = new Map(SEASON_1_CALENDAR.map((item) => [item.code, item]));

export function calendarBriefForWeek(week: number): EpisodeBrief | undefined {
  return BY_WEEK.get(week);
}

export function calendarBriefByCode(code: string): EpisodeBrief | undefined {
  return BY_CODE.get(code.toLowerCase());
}
