// Wonder World vocabulary (PRD 04 C03; PRD 01 section 4; PRD 05 section 5).
//
// Every word a story may target, support or name in `beat.words` is listed
// here, with its category, a clear model phrase, an optional expansion, the
// stories that use it in the PRD tables and one real-world play idea for the
// grown-up. These are language-exposure targets, never milestones: nothing in
// the app tests, counts or scores a child's words.
//
// Related story codes come from the core-word table in MASTER-PROMPT section 2
// and the reinforcement table in PRD 05 section 5 (`e01`-`e20` episodes,
// `g01`-`g12` activities). The content validator checks that every story's
// target words point back to that story here.

import { namesLetter } from "./letters.js";

/** The allowed word ids, lowercase, in curriculum order (PRD 01 section 4). */
export const WORD_IDS = [
  "more", "again", "help", "go", "stop", "up", "down", "open", "close", "pop", "roll",
  "hi", "hello", "bye", "thank-you", "my-turn", "your-turn", "all-done",
  "ball", "dog", "car", "train", "book", "teddy", "bear",
  "eat", "drink", "wash", "brush", "sleep", "wake",
  "woof", "moo", "quack", "baa", "neigh", "tweet", "beep", "boom",
  "apple", "banana", "cookie", "cake", "hat", "bird", "butterfly", "water", "flower",
  "hand", "hands", "foot", "feet", "nose", "tummy", "door", "box", "bed", "moon",
  "big", "small", "in", "out", "wet", "dry", "fast", "slow", "on", "under", "behind",
  "red", "blue", "yellow", "green", "one", "two", "three", "b", "a",
  "bubble", "look", "find", "where", "there", "blow", "circle", "square", "triangle",
  "clap", "stomp", "dance", "ah", "oh", "mmm", "uh-oh",
  "block", "drum", "lift", "star", "chick", "cow", "sheep", "duck", "horse", "robot", "mirror",
  "sun", "cloud", "balloon", "bell", "plate", "picnic", "sponge", "towel", "wave", "peekaboo"
] as const;

export type WordId = (typeof WORD_IDS)[number];

/** Clusters from PRD 01 section 4.1 (functional set) and 4.2 (expansion). */
export type WordCategory =
  | "request" | "movement" | "cause-effect" | "social" | "object" | "animal" | "sound" | "food"
  | "body" | "home" | "nature" | "daily-living" | "concept" | "position" | "colour" | "number"
  | "letter" | "shape" | "action" | "question";

export interface WordInfo {
  readonly id: WordId;
  /** How the word is written for grown-ups (the parent word list). */
  readonly label: string;
  readonly category: WordCategory;
  /** A short, natural model phrase with the word in it. */
  readonly model: string;
  /** One-step expansion a grown-up can add after any sound, gesture or word. */
  readonly extension?: string;
  /** Story codes (`e17`, `g03`) that use the word in the PRD tables. */
  readonly related: readonly string[];
  /** One real-world play idea for the grown-up (offline bridge). */
  readonly offline: string;
  /**
   * Spoken forms that count as "the line says this word". A form of three or
   * more letters also matches its regular inflections (balls, rolling,
   * popped), never a different word that only starts the same way (balloon is
   * not ball). Letter words count only when the line names the letter (see
   * `wordSpoken`).
   */
  readonly forms: readonly string[];
}

interface WordExtra {
  readonly label?: string;
  readonly extension?: string;
  readonly forms?: readonly string[];
}

function word(
  id: WordId,
  category: WordCategory,
  model: string,
  related: readonly string[],
  offline: string,
  extra: WordExtra = {}
): WordInfo {
  const label = extra.label ?? id;
  return {
    id,
    label,
    category,
    model,
    ...(extra.extension !== undefined ? { extension: extra.extension } : {}),
    related,
    offline,
    forms: extra.forms ?? [label]
  };
}

const ANIMAL_SOUND_PLAY = "Take turns making soft animal sounds with toy animals or a picture book.";
const TURN_TAKING_PLAY = "Take turns tapping a pot like a drum: \"My turn... your turn.\"";
const UP_DOWN_PLAY = "Lift a toy up high, then bring it down slowly, naming \"up\" and \"down\".";
const IN_OUT_PLAY = "Put toys in a box and take them out again, naming \"in\" and \"out\".";
const COUNT_PLAY = "Count up to three blocks together, touching each block as you name its number.";
const BIG_SMALL_PLAY = "Show a big ball and a small ball and name each one.";
const WET_DRY_PLAY = "Feel a wet cloth and a dry towel together and name each.";
const FAST_SLOW_PLAY = "Push a toy car fast, then slow, naming each.";
const MIRROR_PLAY = "Make silly faces in a mirror together: ah, oh, mmm.";

export const WORDS: Readonly<Record<WordId, WordInfo>> = {
  // Request.
  more: word("more", "request", "More? More bubbles!", ["e01", "e15", "e17", "g01", "g03", "g05", "g08"],
    "Pause before another turn of a favourite game, model \"more?\", and wait.", { extension: "One more turn." }),
  again: word("again", "request", "Again! Let's roll it again.", ["e15", "e17", "g01", "g03", "g05"],
    "Repeat a favourite action, like a gentle tickle or a ball roll, and model \"again\" before each turn.", { extension: "Again and again." }),
  help: word("help", "request", "Help, please. I can help.", ["e11", "e13"],
    "Offer a box with a tricky lid and open it together, modelling \"help\".", { extension: "Help open the box." }),
  // Movement.
  go: word("go", "movement", "Ready... go!", ["e04", "e06", "e17", "e20", "g02", "g03"],
    "Push a toy car, pause before \"go\", and let your child send it off.", { extension: "The train goes.", forms: ["go", "goes", "going"] }),
  stop: word("stop", "movement", "Stop! The train stops.", ["e04", "e06", "e17", "g02", "g03"],
    "Dance or walk together and freeze when you say \"stop\".", { extension: "Stop, ball, stop." }),
  up: word("up", "movement", "Up, up, up!", ["e11", "e20", "g07", "g08"], UP_DOWN_PLAY, { extension: "The balloon goes up." }),
  down: word("down", "movement", "Down it comes.", ["e11", "e20", "g07", "g08"], UP_DOWN_PLAY, { extension: "Down, down, down." }),
  // Cause and effect.
  open: word("open", "cause-effect", "Open! The door opens.", ["e02", "e18", "e20", "g04", "g07", "g11"],
    "Hide a toy in a box, pause, then open it together: \"Open!\"", { extension: "Open the box." }),
  close: word("close", "cause-effect", "Close. The door is closed.", ["e02", "g07"],
    "Open and close a cupboard door or a box lid together, naming each.", { extension: "Close the box.", forms: ["close", "closing"] }),
  pop: word("pop", "cause-effect", "Pop! The bubble pops.", ["e15", "g01"],
    "Blow bubbles together (with a grown-up holding the bottle) and pop them: \"Pop!\"", { extension: "Pop, pop, pop!" }),
  roll: word("roll", "cause-effect", "Roll! The ball rolls.", ["e17", "e20", "g03"],
    "Roll a ball back and forth and name \"roll\" each time it moves.", { extension: "Roll it to me." }),
  // Social.
  hi: word("hi", "social", "Hi! Hi, friend!", ["e02", "e18", "g03", "g04", "g09"],
    "Wave hi to a toy, a pet or someone coming into the room.", { extension: "Hi, Sheru!", forms: ["hi", "hiya"] }),
  hello: word("hello", "social", "Hello! Hello, flower.", ["g11"], "Say hello to a plant or a toy with a little wave."),
  bye: word("bye", "social", "Bye-bye! Bye, Sheru.", ["e02", "e18", "g02", "g04", "g09"],
    "Wave bye-bye when someone leaves or when toys go back in their box."),
  "thank-you": word("thank-you", "social", "Thank you!", ["g05", "g09"],
    "Pass toys back and forth and model \"thank you\" each time.",
    { label: "thank you", extension: "Thank you for the apple.", forms: ["thank you", "thanks"] }),
  "my-turn": word("my-turn", "social", "My turn!", ["g10"], TURN_TAKING_PLAY, { label: "my turn", extension: "My turn, then your turn." }),
  "your-turn": word("your-turn", "social", "Your turn!", ["g10"], TURN_TAKING_PLAY, { label: "your turn", extension: "Your turn to tap." }),
  "all-done": word("all-done", "social", "All done!", ["g05"],
    "At the end of play, model \"all done\" and put the toys away together.", { label: "all done", extension: "All done. Bye-bye." }),
  // Favourite objects.
  ball: word("ball", "object", "Ball! A ball.", ["e03", "e07", "e17", "e20", "g03", "g12"],
    "Roll a real ball back and forth and name it each time.", { extension: "The ball rolls." }),
  dog: word("dog", "animal", "A dog! Woof!", ["e08", "e17", "e20", "g03"],
    "Find a toy dog or a picture of a dog and make a soft \"woof\" together.", { extension: "The dog runs." }),
  car: word("car", "object", "Car! The car goes.", ["e20", "g06"], "Push a toy car across the floor: \"Car... go!\"", { extension: "Wash the car." }),
  train: word("train", "object", "Train! Here comes the train.", ["e04", "g02"],
    "Push a toy train slowly and stop it at a pretend station.", { extension: "The train stops." }),
  book: word("book", "object", "Book. Open the book.", ["e20", "g12"], "Share a picture book and let your child turn the pages.", { extension: "A book about a bear." }),
  teddy: word("teddy", "object", "Teddy! Hi, Teddy.", ["e14", "e20", "g05", "g12"],
    "Hide a teddy under a blanket and find it together.", { extension: "Teddy is sleepy." }),
  bear: word("bear", "animal", "Bear! A big bear.", ["e03", "e20", "g07", "g10"],
    "Find a bear in a book, or give a toy bear a hug.", { extension: "The bear has a ball." }),
  // Daily living.
  eat: word("eat", "daily-living", "Eat! Momo eats.", ["e05", "e10", "e19", "e20", "g05"],
    "At snack time, name each food and model \"eat\".", { extension: "Eat the apple.", forms: ["eat", "ate"] }),
  drink: word("drink", "daily-living", "Drink. A drink of water.", ["e19"], "Take a sip of water together and name it: \"drink\".", { forms: ["drink", "drank"] }),
  wash: word("wash", "daily-living", "Wash, wash, wash.", ["e19", "g06"], "Wash hands together and name it: \"Wash, wash.\"", { extension: "Wash the car." }),
  brush: word("brush", "daily-living", "Brush, brush.", ["e19"], "Brush teeth side by side and name each stroke: \"brush\".", { extension: "Brush teeth." }),
  sleep: word("sleep", "daily-living", "Sleep. Shh, sleep.", ["e19", "e20"], "Tuck a toy into bed and whisper \"sleep\".", { extension: "Teddy sleeps.", forms: ["sleep", "slept"] }),
  wake: word("wake", "daily-living", "Wake up! Good morning.", ["e19"], "Pretend a toy is asleep, then wake it gently: \"Wake up!\"", { forms: ["wake", "waking", "woke"] }),
  // Familiar sound play.
  woof: word("woof", "sound", "Woof! Woof, woof.", ["e03", "e08", "e09", "e17", "g03"], "Take turns making a soft \"woof\" with a toy dog."),
  moo: word("moo", "sound", "Moo! The cow says moo.", ["e03", "e09", "g04"], ANIMAL_SOUND_PLAY),
  quack: word("quack", "sound", "Quack! Quack, quack.", ["e03", "e09", "g04"], ANIMAL_SOUND_PLAY),
  baa: word("baa", "sound", "Baa! The sheep says baa.", ["e03", "e09"], ANIMAL_SOUND_PLAY),
  neigh: word("neigh", "sound", "Neigh! The horse says neigh.", ["g04"], ANIMAL_SOUND_PLAY),
  tweet: word("tweet", "sound", "Tweet, tweet!", ["e09", "e17"], "Listen for birds outside together and copy a soft \"tweet\"."),
  beep: word("beep", "sound", "Beep, beep!", ["e13"], "Press pretend buttons on a box and make a soft \"beep\"."),
  boom: word("boom", "sound", "Boom, boom!", ["e06", "g10"], "Tap a pot gently like a drum: \"Boom!\""),
  // Food.
  apple: word("apple", "food", "Apple! A red apple.", ["e04", "e10", "g05"], "At snack time, show an apple and name it together.", { extension: "Eat the apple." }),
  banana: word("banana", "food", "Banana! A yellow banana.", ["e10", "g05"], "Peel a banana together and name it."),
  cookie: word("cookie", "food", "Cookie! A round cookie.", ["e05"], "Count up to three crackers or toy cookies together, one touch for each."),
  cake: word("cake", "food", "Cake! A little cake.", ["e16"], "Make a pretend cake from blocks or cups and blow a pretend candle."),
  // Early vocabulary: objects, animals, nature, body, home.
  hat: word("hat", "object", "Hat! A hat on top.", ["e13"], "Put a hat on a toy, then on your own head, naming it each time."),
  bird: word("bird", "animal", "Bird! A little bird.", ["e17"], "Look for birds outside the window together."),
  butterfly: word("butterfly", "animal", "Butterfly! It flies.", ["e17"], "Flap your hands like butterfly wings together.", { forms: ["butterfly", "butterflies"] }),
  water: word("water", "nature", "Water. Splash!", ["e17", "e19", "g06"], "Pour water between cups at bath time and name it."),
  flower: word("flower", "nature", "Flower. A pretty flower.", ["g11"], "Look at flowers on a walk and open your hands like a blooming flower."),
  hand: word("hand", "body", "Hand. Wave your hand.", ["e13", "e19"], "Wave and clap hands together, naming them."),
  hands: word("hands", "body", "Hands! Clap your hands.", ["e13", "e19", "g10"], "Wash hands together and name them."),
  foot: word("foot", "body", "Foot! A little foot.", ["e13"], "Wiggle one foot, then the other, while getting dressed."),
  feet: word("feet", "body", "Feet! Stomp your feet.", ["e06", "e13"], "Stomp feet gently together, then tiptoe."),
  nose: word("nose", "body", "Nose. Boop!", ["e13"], "Gently touch noses with a toy and name it: \"nose\"."),
  tummy: word("tummy", "body", "Tummy. A rumbly tummy.", ["e05", "e10"], "Pat your tummy before a snack and name it."),
  door: word("door", "home", "Door. Knock, knock.", ["e02", "e18", "g09"], "Knock on a real door together, open it, and wave hi.", { extension: "Open the door." }),
  box: word("box", "home", "Box. A big box.", ["e08", "e20"], "Put a toy in a box, close it, then open it together.", { extension: "Open the box." }),
  bed: word("bed", "home", "Bed. Time for bed.", ["e19"], "Tuck a toy into bed and whisper \"night-night\"."),
  moon: word("moon", "nature", "Moon. The moon is up.", ["e19"], "Look for the moon in a book or out of the window at night."),
  // Concepts (one pair per scene).
  big: word("big", "concept", "Big! A big ball.", [], BIG_SMALL_PLAY),
  small: word("small", "concept", "Small. A small ball.", [], BIG_SMALL_PLAY),
  in: word("in", "position", "In! In the box.", ["e08", "e20", "g02", "g07"], IN_OUT_PLAY, { forms: ["in", "into", "inside"] }),
  out: word("out", "position", "Out! Out of the box.", ["e08", "e20", "g07"], IN_OUT_PLAY, { forms: ["out", "outside"] }),
  wet: word("wet", "concept", "Wet! The car is wet.", ["g06"], WET_DRY_PLAY),
  dry: word("dry", "concept", "Dry. Dry, dry, dry.", ["g06"], WET_DRY_PLAY, { forms: ["dry", "dries", "dried"] }),
  fast: word("fast", "concept", "Fast! Zoom!", [], FAST_SLOW_PLAY),
  slow: word("slow", "concept", "Slow. Slow and gentle.", [], FAST_SLOW_PLAY),
  on: word("on", "position", "On! On the table.", [], "Put a toy on a box, then under a blanket, naming where it is.", { forms: ["on", "onto"] }),
  under: word("under", "position", "Under! Under the box.", ["e08", "e14"], "Hide a toy under a blanket and find it together."),
  behind: word("behind", "position", "Behind. Behind the bush.", ["e08", "e14"], "Hide behind a chair for a gentle game of peekaboo."),
  // Colours.
  red: word("red", "colour", "Red! A red ball.", ["e07"], "Find something red in the room together."),
  blue: word("blue", "colour", "Blue! A blue ball.", ["e07"], "Find something blue in the room together."),
  yellow: word("yellow", "colour", "Yellow! A yellow banana.", [], "Find something yellow in the room together."),
  green: word("green", "colour", "Green. Green grass.", [], "Find something green on a walk."),
  // Numbers: counted objects, 1-3 only (PRD 01 section 3.3).
  one: word("one", "number", "One. One ball.", ["e05", "e11", "e16", "g08"], COUNT_PLAY),
  two: word("two", "number", "Two. Two balls.", ["e05", "e11", "e16", "g08"], COUNT_PLAY),
  three: word("three", "number", "Three! Three balls.", ["e05", "e11", "e16", "g08"], COUNT_PLAY),
  // Letters: the name and the sound stay apart (see letters.ts).
  b: word("b", "letter", "B. Bee. B is for ball.", ["e03"], "Find the letter B on a page, then find a real ball.", { label: "B", forms: ["b", "bee"] }),
  a: word("a", "letter", "A. Ay. A is for apple.", ["e04"], "Find the letter A on a page, then find a real apple.", { label: "A", forms: ["a", "ay"] }),
  // Play objects and actions.
  bubble: word("bubble", "object", "Bubble! A big bubble.", ["e15", "g01"],
    "Blow bubbles together (with a grown-up holding the bottle) and watch them float.", { extension: "The bubble pops." }),
  look: word("look", "action", "Look! Look at the ball.", ["e14", "e17"], "Point at something interesting and model \"look!\""),
  find: word("find", "action", "Find it! We found it.", ["e14", "g12"], "Hide a toy in the room and find it together.", { forms: ["find", "found"] }),
  where: word("where", "question", "Where is Sheru? Where?", ["e08"], "Play hide-and-find with a toy: \"Where is it? There!\""),
  there: word("there", "question", "There! There it is.", ["e08", "g12"], "Play hide-and-find with a toy: \"Where is it? There!\""),
  blow: word("blow", "action", "Blow! Whoo.", ["e16", "g01"], "Blow a feather or a pretend candle together.", { forms: ["blow", "blew"] }),
  circle: word("circle", "shape", "Circle. A round circle.", ["e12"], "Find a round plate and trace the circle with a finger."),
  square: word("square", "shape", "Square. A square block.", ["e12"], "Find a square napkin or block together."),
  triangle: word("triangle", "shape", "Triangle. A pointy triangle.", ["e12"], "Fold a napkin into a triangle together."),
  clap: word("clap", "action", "Clap, clap, clap!", ["e06", "g10"], "Clap a slow beat together, then stop."),
  stomp: word("stomp", "action", "Stomp, stomp!", ["e06"], "Stomp slowly like a little dinosaur, then freeze."),
  dance: word("dance", "action", "Dance! Lulu dances.", ["e06"], "Put on a calm song, dance together, then stop.", { forms: ["dance", "dancing"] }),
  // Sound play (no accuracy is ever judged).
  ah: word("ah", "sound", "Ah! A big ah.", ["e01"], MIRROR_PLAY, { forms: ["ah", "ahh", "aah", "aaah"] }),
  oh: word("oh", "sound", "Oh! Oh, look!", ["e01"], MIRROR_PLAY, { forms: ["oh", "ohh", "ooh", "oooh"] }),
  mmm: word("mmm", "sound", "Mmm! Yummy.", ["e01", "e05", "e10"], "At mealtime, model a happy \"mmm\" for a tasty bite.", { forms: ["mmm", "mm"] }),
  "uh-oh": word("uh-oh", "sound", "Uh-oh!", ["e13", "e14"], "When a toy tumbles, model a gentle \"uh-oh\".", { forms: ["uh-oh", "uh oh"] }),
  block: word("block", "object", "Block! A big block.", ["g08"], "Stack three big blocks and knock them down gently."),
  drum: word("drum", "object", "Drum. Boom, boom!", ["e06", "g10"], "Tap a pot gently like a drum, taking turns."),
  lift: word("lift", "object", "Lift. Up we go!", ["g07"], "Move a toy up and down a stack of books like a little lift."),
  star: word("star", "nature", "Star. A little star.", [], "Look at stars in a picture book or the night sky."),
  chick: word("chick", "animal", "Chick! A little chick.", ["e02", "e03", "e09"], "Make a soft \"tweet\" with a toy bird or a picture of a chick."),
  cow: word("cow", "animal", "Cow. Moo!", ["e09", "g04"], ANIMAL_SOUND_PLAY),
  sheep: word("sheep", "animal", "Sheep. Baa!", ["e09"], ANIMAL_SOUND_PLAY),
  duck: word("duck", "animal", "Duck! Quack, quack.", ["e02", "e09", "e20", "g04"], ANIMAL_SOUND_PLAY),
  horse: word("horse", "animal", "Horse. Neigh!", ["g04"], ANIMAL_SOUND_PLAY),
  robot: word("robot", "object", "Robot! Beep, beep.", ["e13"], "Move like a slow, friendly robot together."),
  mirror: word("mirror", "object", "Mirror. Look, it's me!", ["e01"], "Look in a mirror together and copy each other's faces."),
  sun: word("sun", "nature", "Sun! Good morning, sun.", ["e19"], "Open the curtains in the morning and say hello to the sun."),
  cloud: word("cloud", "nature", "Cloud. A soft cloud.", [], "Look at clouds in the sky together."),
  balloon: word("balloon", "object", "Balloon! A red balloon.", ["e11", "e16"],
    "Point to balloons in a picture book and count them together (real balloons are not toddler toys)."),
  bell: word("bell", "object", "Bell. Ding, ding!", ["e18", "g09"], "Ring a small bell together and wave hi."),
  plate: word("plate", "home", "Plate. A round plate.", ["e05", "e12"], "Put snacks on a plate together, one at a time."),
  picnic: word("picnic", "food", "Picnic! Food for friends.", ["g05"], "Have a pretend picnic on a blanket with toy food."),
  sponge: word("sponge", "object", "Sponge. Wash, wash.", ["g06"], "Wash a toy car with a damp sponge together."),
  towel: word("towel", "object", "Towel. Dry, dry.", ["g06"], "Dry a toy or your hands with a towel together."),
  wave: word("wave", "action", "Wave! Wave bye-bye.", ["e18", "g09"], "Wave hello and bye-bye to people and toys.", { forms: ["wave", "waving"] }),
  peekaboo: word("peekaboo", "sound", "Peekaboo! There you are.", ["e02", "g04"], "Play peekaboo with your hands or a soft blanket.", { forms: ["peekaboo", "peek a boo"] })
};

const WORD_SET: ReadonlySet<string> = new Set<string>(WORD_IDS);

export function isWordId(value: string): value is WordId {
  return WORD_SET.has(value);
}

/** Lowercase, straight apostrophes, hyphens as spaces, punctuation removed. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/'/g, "")
    .replace(/[-\u2010-\u2015]/g, " ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The regular inflections of a one-word form: -s/-es, -ed (-d after a final
 * e), -ing (dropping a final e), y to -ies/-ied, and a doubled final
 * consonant (popped, stopping). A word that merely starts with the form is a
 * different word: "balloon" is not "ball", "belly" is not "bell", "moon" is
 * not "moo" and "carriage" is not "car".
 */
function inflections(form: string): ReadonlySet<string> {
  const out = new Set<string>([form, `${form}s`, `${form}es`, `${form}ed`, `${form}ing`]);
  if (form.endsWith("e")) {
    out.add(`${form}d`);
    out.add(`${form.slice(0, -1)}ing`);
  }
  if (/[^aeiou]y$/.test(form)) {
    out.add(`${form.slice(0, -1)}ies`);
    out.add(`${form.slice(0, -1)}ied`);
  }
  if (/(?:^|[^aeiou])[aeiou][bdgklmnprt]$/.test(form)) {
    const last = form.slice(-1);
    out.add(`${form}${last}ed`);
    out.add(`${form}${last}ing`);
  }
  return out;
}

/** A sound word stretched by repeating its last letter ("Mooo!", "Mmmm", "Ahhh"). */
function stretched(form: string, token: string): boolean {
  const last = form.slice(-1);
  return token.length > form.length && token.startsWith(form) && [...token.slice(form.length)].every((c) => c === last);
}

/**
 * True when `text` says the word: a multi-word form appears as a phrase, a
 * short form (one or two letters) appears as a whole token, and a longer form
 * appears as a token or one of its regular inflections (so "balls",
 * "rolling" and "bye-bye" count, "balloon" does not). Sound words may be
 * stretched ("Mooo!"). A letter word counts only when the line names the
 * letter ("B. Bee.", "This letter is A."), never for the article in "A ball".
 */
export function wordSpoken(id: WordId, text: string): boolean {
  const info = WORDS[id];
  if (info.category === "letter") return namesLetter(info.label, text);
  const normal = normalize(text);
  if (normal === "") return false;
  const tokens = normal.split(" ");
  for (const form of info.forms) {
    const f = normalize(form);
    if (f === "") continue;
    if (f.includes(" ")) {
      if (` ${normal} `.includes(` ${f} `)) return true;
      continue;
    }
    if (f.length < 3) {
      if (tokens.includes(f)) return true;
    } else {
      const inflected = inflections(f);
      if (tokens.some((token) => inflected.has(token))) return true;
    }
    if (info.category === "sound" && tokens.some((token) => stretched(f, token))) return true;
  }
  return false;
}

/** Word choices for the parent word list, in curriculum order. */
export function wordChoices(ids: readonly WordId[] = WORD_IDS): readonly { readonly id: WordId; readonly label: string }[] {
  return ids.map((id) => ({ id, label: WORDS[id].label }));
}
