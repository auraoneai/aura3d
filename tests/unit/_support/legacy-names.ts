/**
 * Test-only bridge between the names recorded from the original games (captured evidence under
 * evidence/crayon-capture/ and tests/fixtures/crayon/, which stay exactly as captured) and the original
 * names this repository's games use now. The shipped games and their pages contain none of the old terms.
 */
export type LegacyGame = "saiyan" | "ninja" | "cloud";

type Rule = readonly [string | RegExp, string];

const PROTECT: readonly string[] = [
  "kid-goku-beyond-the-clouds", "kid-goku", "saiyan-snake-way", "showcase-cloud-runner-port", "tools/kid-goku", "crayon/kid-goku",
  "kid_goku_beyond", "saiyanSnakeWayPort"
];

const RULES: Record<LegacyGame, readonly Rule[]> = {
  saiyan: [
    ["Saiyan through the Snake way!", "Serpentine Sky Run"],
    ["Saiyan Snake Way", "Serpentine Sky Run"],
    ["SAIYAN_SNAKE_WAY", "SERPENTINE_SKY_RUN"],
    ["Son Goku", "the runner"],
    ["Goku's", "the runner's"],
    ["KAIO-KEN ×", "SURGE ×"],
    ["KAIO-KEN", "SURGE"],
    ["Kaio-ken", "Surge"],
    ["kaio-ken", "surge"],
    [/\bkaio\b/g, "surge"],
    ["SENZU BEAN", "VITAL SEED"],
    ["Senzu", "Vitalseed"],
    ["senzu", "vitalseed"],
    ["YEMMA'S STAMP", "WAYPOINT STAMP"],
    ["Yemma", "Waypoint"],
    ["yemma", "waypoint"],
    ["POWER POLE", "GRAPPLE STAFF"],
    ["Power Pole", "Grapple Staff"],
    ["power pole", "grapple staff"],
    ["PRINCESS SNAKE'S PALACE", "THE SERPENT HALL"],
    ["Princess Snake", "the Serpent Queen"],
    ["SAIBAMAN", "BRUTE"],
    ["Saibaman", "Brute"],
    ["saibaman", "brute"],
    [/\bsaiba\b/g, "brute"],
    ["King Kai's world is down there", "the world below is waiting"],
    ["King Kai", "Sky King"],
    ["king kai", "sky king"],
    ["Nimbus", "Puff"],
    ["NIMBUS", "PUFF"],
    ["nimbus", "puff"],
    ["Dragon Balls", "Star Orbs"],
    ["Dragon Ball", "Star Orb"],
    ["dragonball", "starorb"],
    ["Vegeta", "the rival"],
    ["vegeta", "the rival"],
    ["Piccolo", "the mentor"],
    ["piccolo", "the mentor"],
    ["Namek", "the green planet"],
    ["namek", "the green planet"],
    ["Kamehameha", "the beam"],
    ["kamehameha", "the beam"],
    ["Goku", "the runner"],
    ["goku", "runner"],
    ["Saiyan", "Sky"],
    ["saiyan", "sky"]
  ],
  ninja: [
    ["Hidden Leaf Village", "Lantern Village"],
    ["Hidden Leaf", "Lantern Village"],
    ["hidden leaf", "lantern village"],
    ["Valley of the End", "Valley Gate"],
    ["The Naka Crossing", "River Crossing"],
    ["the Naka crossing", "the river crossing"],
    ["Forest of Death", "Whispering Forest"],
    ["Above the Village", "Rooftop Run"],
    ["__konoha", "__lanternhold"],
    ["Konoha", "Lanternhold"],
    ["konoha", "lanternhold"],
    ["Rasenshuriken", "Spiralstar"],
    ["RASENSHURIKEN", "SPIRALSTAR"],
    ["rasenshuriken", "spiralstar"],
    ["Rasengan", "Spiralorb"],
    ["RASENGAN", "SPIRALORB"],
    ["rasengan", "spiralorb"],
    ["Kurama", "Beast"],
    ["KURAMA", "BEAST"],
    ["kurama", "beast"],
    ["Chakra", "Spirit"],
    ["CHAKRA", "SPIRIT"],
    ["chakra", "spirit"],
    ["Jutsu", "Technique"],
    ["jutsu", "technique"],
    ["Kunai", "Dart"],
    ["kunai", "dart"],
    ["Shinobi", "Fighter"],
    ["shinobi", "fighter"],
    ["Hokage", "Elder"],
    ["hokage", "elder"],
    ["Naruto", "the runner"],
    ["Uzumaki", "Runner"],
    ["uzumaki", "runner"]
  ],
  cloud: [
    ["Kid Goku: Beyond the Clouds", "Cumulus Dash"],
    ["Kid Goku", "Cumulus Dash"],
    ["KID_GOKU", "CUMULUS_DASH"],
    ["Mount Paozu", "Cumulus Ridge"],
    ["MOUNT_PAOZU", "CUMULUS_RIDGE"],
    ["Paozu", "Ridge"],
    ["paozu", "ridge"],
    ["Dragon Balls", "Sky Pearls"],
    ["Dragon Ball", "Sky Pearl"],
    ["DragonBall", "SkyPearl"],
    ["dragonball", "skypearl"],
    ["Nimbus", "Glider"],
    ["NIMBUS", "GLIDER"],
    ["nimbus", "glider"],
    ["Vegeta", "the rival"],
    ["Piccolo", "the mentor"],
    ["Namek", "the green planet"],
    ["Kamehameha", "the beam"],
    ["Goku", "Kip"],
    ["goku", "kip"]
  ]
};


/** Rewrites the names inside a captured JSON text to the names the ports use now (paths and slugs are kept). */
export function legacyToCurrent(game: LegacyGame, text: string): string {
  let s = text;
  PROTECT.forEach((p, i) => { s = s.split(p).join(`\u0001P${i}\u0001`); });
  for (const [from, to] of RULES[game]) s = typeof from === "string" ? s.split(from).join(to) : s.replace(from, to);
  PROTECT.forEach((p, i) => { s = s.split(`\u0001P${i}\u0001`).join(p); });
  return s;
}

/** Parses a captured reference file and applies {@link legacyToCurrent} to every key and string. */
export function loadLegacyJson<T>(game: LegacyGame, text: string): T {
  return JSON.parse(legacyToCurrent(game, text)) as T;
}

/** The inverse for a single lowercase identifier (entity type, action name), used to rebuild the original's digests. */
export function currentToLegacyWord(game: LegacyGame, word: string): string {
  for (const [from, to] of RULES[game]) {
    if (typeof from === "string" && to === word && /^[a-z]+$/.test(from)) return from;
  }
  return word;
}
