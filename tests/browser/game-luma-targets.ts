import type { Page } from "@playwright/test";
import type { GameLumaCrop } from "./game-luma-stats";

/**
 * Steady-state luma targets: every live game in docs/workflows/game-inventory.json, and every lighting variant a player
 * can pick (park, court, course, venue, stage, world, theme). URLs are the dev-server paths (`/apps/<appFolder>/`), not
 * the production rewrites, so the same list runs against any checkout, including v4.3.7.
 * Names before this list existed (2026-10-28): diamond-skyline, diamond-lunar, diamond-sandlot, pips-w6, pips-w1,
 * hoops-shanghai, hoops-orbit, hoops-rucker, crosshop, dotdash. They map to `<slug>--<variant>` below; `cross-hop--theme0`
 * and `dot-dash-3d--default` load the same URLs as the old crosshop and dotdash targets.
 */
export interface GameLumaTarget {
  readonly name: string;
  readonly slug: string;
  readonly variant: string;
  readonly url: string;
  /** Run group `g1`..`gN` (9 targets each, in list order): select one with `--grep=@g3`. The ACR step runs SPECS through
   *  /bin/sh and times out at 3600 s, so a grep must be shell-safe (no parentheses or pipes) and a group must fit the hour. */
  readonly group: string;
  prepare?(page: Page): Promise<void>;
  /** Static named crops, normalised 0..1 to the main canvas (the game's QA hook crops win on a name clash). */
  readonly crops?: readonly GameLumaCrop[];
  /** GL_PAIR_MS only: runs between the two screenshots of a pair (for example step a manual-mode sim). */
  pairAdvance?(page: Page): Promise<void>;
}

/** Click an element by selector through `element.click()`, so a title overlay cannot intercept the pointer. */
const clickSelector = (selector: string, delayMs = 0) => async (page: Page): Promise<void> => {
  if (delayMs > 0) await page.waitForTimeout(delayMs);
  await page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), selector);
};

const pipsWorld = (world: string) => async (page: Page): Promise<void> => {
  await page.evaluate(() => (document.getElementById("aura-btn-atlas") as HTMLElement | null)?.click());
  await page.waitForTimeout(500);
  await clickSelector(`.pbl-atlas-card[data-world="${world}"]`)(page);
};

type Draft = Omit<GameLumaTarget, "group">;
const t = (slug: string, variant: string, url: string, prepare?: (page: Page) => Promise<void>): Draft =>
  ({ name: `${slug}--${variant}`, slug, variant, url, ...(prepare ? { prepare } : {}) });

export const GROUP_SIZE = 9;

const each = <V extends string>(variants: readonly V[], make: (v: V) => Draft): Draft[] => variants.map(make);

export const DIAMOND_PARKS = ["sandlot", "skyline", "canyon", "ivy", "dome", "lunar"] as const;
export const HOOPS_COURTS = ["rucker", "venice", "athens", "manila", "shanghai", "orbit"] as const;
export const FC_VENUES = ["favela", "munich", "lagos", "kyoto", "uyuni", "glacier"] as const;
export const LINKS_COURSES = ["stAuroras", "mapleHollow", "cinderRim", "cloudTerrace", "neonBay", "mareCourse"] as const;
export const IRON_CROWN_STAGES = ["crown-arena", "neo-tokyo-rooftop", "bangkok-dock", "colosseum-ruins", "desert-airbase", "himalayan-monastery"] as const;
export const PIPS_WORLDS = ["w1", "w2", "w3", "w4", "w5", "w6"] as const;
export const CROSS_HOP_THEMES = [0, 1, 2, 3, 4, 5] as const;
/** Saltwind Highway levels (`LEVELS` in examples/roadster-hours-port/data.ts); each has its own sky, fog and sun. */
export const SALTWIND_LEVELS = ["sunbreak", "redline", "halo"] as const;
/** Grid Dispatch sky presets (`#teleopDock button[data-tod]`). Marine dusk (`golden`) is the boot state since GD-21 (noon on
 *  4.6.0), so every row names its sky twice: `?sky=` for 4.7 builds and a dock click for builds that ignore the param.
 *  `?intro=0` skips the GD-17 intro, which owns the camera for 3 x 1.4 s. */
export const TELEOP_SKIES = ["noon", "golden", "fog", "night"] as const;

/**
 * GameUpgrades47 variant targets (PRD WP-9 E-I, wave 1). The query param each game reads for a variant shot: "exists"
 * params work on 4.6.0, so WP-38's before capture on that build already shows the variant; "NEW" params are implemented by
 * the game lane named in the comment (until then the page ignores the param and boots its default view). Existing targets
 * keep their names, URLs and run groups; the GU47 rows are appended after them in groups of their own (`@g9` onwards).
 */
export const VARIANT_PARAMS = {
  "top-tennis": "venue", // exists: examples/aura-slam/shell/boot.ts (VenueId in contract/venues.ts); G01
  heatsink: "circuit", // NEW: G03 HS-21 (CircuitId in apps/showcase-heatsink/src/data.ts)
  "aura-hoops-3d": "court", // exists
  "aura-diamond-3d": "park", // exists
  "aura-fc-3d": "venue", // exists
  "aura-links-3d": "course", // exists
  "bunker-zero": "floor", // NEW: G11 BZ-20 (`1`..`6`, `kh`; a fixed reference viewpoint per floor)
  "slingshot-siege": "level", // exists: chapter c starts at level 5c (SS47-E1)
  "dot-dash-3d": "maze", // exists: MAZE_ORDER in apps/showcase-dot-dash-3d/src/game/mazes.ts (DD47-P3)
  "cross-hop": "theme", // exists
  "splat-rush-port": "look", // NEW: G16 CR-00 (`original` | `carnival`, default carnival)
  "serpentine-sky-run-port": "stage", // NEW: G17 SSR-19 (1-based index into STAGES, examples/saiyan-snake-way-port/sim.ts)
  "drift-and-deliver-port": "at", // NEW: G18 GC-L6 (elapsed shift seconds); `env` also exists (noenv target)
  "ninja-runner-port": "at", // NEW: G20 NR-22 (metres, through the QA advanceTo hook)
  "last-train-port": "band", // NEW: G21 LT-01 (`A`..`E`)
  "roadster-hours-port": "level", // exists
  "where-the-wind-wanders-port": "found", // NEW: G23 WW47-L1 (letters found `0`..`3`, or `epilogue`)
  "silt-and-signal-port": "chapter", // exists: examples/silt-and-signal-port/main.ts (`chapter=0..6`, with `start=1`)
  "roadster-rush": "tod" // NEW: G02 AO-L2 (`dusk` | `night`; the boot view is sunset)
} as const;

/**
 * Second params a GU47 row may vary instead of (or beside) the game's VARIANT_PARAMS param (pass 4, game-lane handoffs):
 * `look=original` is the 4.6 look kept in-branch for before/after pairs on one build; the others are per-game switches.
 */
export const EXTRA_VARIANT_PARAMS: Readonly<Record<string, readonly string[]>> = {
  "cross-hop": ["look"], // G14 CH47-05
  "strange-orbit-port": ["look", "env"], // G15 SO47-X1 / E1 (`env=neutral`)
  "drift-and-deliver-port": ["look"], // G18
  "heatsink-port": ["look"], // G19 (`?at=` districts wait for a param in the game)
  "ninja-runner-port": ["look", "lanterns", "cones"], // G20 NR-03, NR-16
  "roadster-hours-port": ["look"], // G22 RH47-01
  "silt-and-signal-port": ["look"] // G24 (inked look is the default)
};

/** Aura Slam venues besides the boot venue `hard` (the `top-tennis--default` target). */
export const TENNIS_VENUES = ["grass", "clay", "desert", "beach", "moon"] as const;
/** Thermal Drift circuits besides the boot circuit `grand` (the `heatsink--default` target). */
export const HEATSINK_CIRCUITS = ["dustfall", "vesper"] as const;
/** Bunker Zero floors 1..6 and the kill house: [variant, `?floor=` value]. */
export const BUNKER_FLOORS = [["floor1", "1"], ["floor2", "2"], ["floor3", "3"], ["floor4", "4"], ["floor5", "5"], ["floor6", "6"], ["killhouse", "kh"]] as const;
/** Slingshot Siege chapters (CHAPTERS in src/game/levels.ts); chapter c opens at level 5c. */
export const SLINGSHOT_CHAPTERS = [0, 1, 2, 3, 4, 5] as const;
/** Dot Dash boards in MAZE_ORDER; `classic` is the boot board, shot here through `?maze=` as one of the six board rows. */
export const DOT_DASH_MAZES = ["classic", "spiral", "twin", "garden", "foundry", "zerocore"] as const;
/** Chroma Roll looks besides the boot look `carnival`. */
export const SPLAT_RUSH_LOOKS = ["original"] as const;
/** Serpentine Sky Run stages (STAGES, 8 entries), 1-based. */
export const SERPENTINE_STAGES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Gridlock Courier shift phases (GC-L6): [variant, elapsed shift seconds]. */
export const DRIFT_PHASES = [["golden", 10], ["sunset", 120], ["bluehour", 170]] as const;
/** Shadowstep Gauntlet districts (NR-22): [variant, metres]. */
export const NINJA_DISTRICTS = [["village", 100], ["rooftops", 700], ["river", 1300], ["forest", 1900], ["gate", 2500]] as const;
/** Lamplight Line time bands (LT-01). */
export const LAST_TRAIN_BANDS = ["A", "B", "C", "D", "E"] as const;
/** Bellkeeper's Walk daylight keys (WW47-L1): [variant, `?found=` value]. */
export const WIND_DAYLIGHT = [["found0", "0"], ["found2", "2"], ["found3", "3"], ["epilogue", "epilogue"]] as const;
/** Apex Overdrive times of day besides the boot sunset (`roadster-rush--default`), read from `?tod=` (G02 AO-L2). */
export const ROADSTER_RUSH_TODS = ["dusk", "night"] as const;
/** Duneglide chapters 0..6 (CHAPTERS in examples/silt-and-signal-port/chapters-data.ts). */
export const SILT_CHAPTERS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Shadowstep Gauntlet in manual mode: the sim advances only through the hook, so the shots see the run at step 300. */
const gauntletRun = async (page: Page): Promise<void> => {
  await page.waitForFunction("window.__AURA_NINJA_RUNNER__ && window.__AURA_NINJA_RUNNER__.ready() === true", undefined, { timeout: 420_000, polling: 500 });
  await page.evaluate("(() => { const h = window.__AURA_NINJA_RUNNER__; h.begin(); h.stepFrames(300); h.settle(4, 1 / 60); })()");
};

/** Saltwind Highway boots on the level from `?level=`; wait for its own ready flag, which follows the first frame, and (G22
 *  RH47-01, 4.7 builds) for `texturesReady()`, so judged shots never see an untextured model. Builds without the hook skip it. */
const saltwindReady = async (page: Page): Promise<void> => {
  await page.waitForFunction("(() => { const h = window.__AURA_ROADSTER_HOURS__; const r = h?.ready; if (!(typeof r === 'function' ? r() : r === true)) return false; return typeof h.texturesReady !== 'function' || h.texturesReady() === true; })()", undefined, { timeout: 420_000, polling: 500 });
};

/** Saltwind Highway chase-camera crops (G22; the game's hook crops win on a name clash). */
export const SALTWIND_CROPS: readonly GameLumaCrop[] = [
  { name: "car", x: 0.40, y: 0.55, w: 0.20, h: 0.25 },
  { name: "road", x: 0.30, y: 0.75, w: 0.40, h: 0.25 },
  { name: "sky", x: 0, y: 0, w: 1, h: 0.3 },
  { name: "sea", x: 0, y: 0.4, w: 0.3, h: 0.3 }
];

/** Prepare steps a GU47 row may carry: readiness waits only, never a click (the row's URL alone picks the variant). */
export const GU47_READY_WAITS: readonly ((page: Page) => Promise<void>)[] = [saltwindReady];

const DRAFTS: readonly Draft[] = [
  t("top-tennis", "default", "/apps/showcase-top-tennis/"),
  // capture=1 starts the run at once (the page otherwise opens on a title card); seed=42 fixes the traffic.
  t("roadster-rush", "default", "/apps/showcase-roadster-rush/?seed=42&capture=1"),
  t("heatsink", "default", "/apps/showcase-heatsink/"),
  ...each(TELEOP_SKIES, (k) => t("teleoperator", k, `/apps/showcase-teleoperator/?sky=${k}&intro=0`, clickSelector(`#teleopDock button[data-tod="${k}"]`))),
  ...each(IRON_CROWN_STAGES, (s) => t("iron-crown", s, "/apps/showcase-iron-crown/", s === "crown-arena" ? undefined : clickSelector(`#ic-venues button[data-stage="${s}"]`))),
  t("pips-big-leap", "academy", "/apps/showcase-pips-big-leap/"),
  ...each(PIPS_WORLDS, (w) => t("pips-big-leap", w, "/apps/showcase-pips-big-leap/", pipsWorld(w))),
  ...each(HOOPS_COURTS, (c) => t("aura-hoops-3d", c, `/apps/showcase-aura-hoops-3d/index.html?court=${c}`)),
  ...each(DIAMOND_PARKS, (p) => t("aura-diamond-3d", p, `/apps/showcase-aura-diamond-3d/index.html?park=${p}`)),
  ...each(FC_VENUES, (v) => t("aura-fc-3d", v, `/apps/showcase-aura-fc-3d/index.html?venue=${v}`)),
  ...each(LINKS_COURSES, (c) => t("aura-links-3d", c, `/apps/showcase-aura-links-3d/index.html?course=${c}`)),
  t("bunker-zero", "default", "/apps/showcase-bunker-zero/"),
  t("slingshot-siege", "default", "/apps/showcase-slingshot-siege/"),
  t("dot-dash-3d", "default", "/apps/showcase-dot-dash-3d/"),
  ...CROSS_HOP_THEMES.map((n) => t("cross-hop", `theme${n}`, n === 0 ? "/apps/showcase-cross-hop/" : `/apps/showcase-cross-hop/?theme=${n}`)),
  t("strange-orbit-port", "default", "/apps/showcase-strange-orbit-port/"),
  t("splat-rush-port", "default", "/apps/showcase-splat-rush-port/"),
  t("serpentine-sky-run-port", "default", "/apps/showcase-serpentine-sky-run-port/"),
  t("drift-and-deliver-port", "default", "/apps/showcase-drift-and-deliver-port/"),
  // ?env=0 drops the HDRI (main.ts `env`), so the hemisphere and sun light the city alone.
  t("drift-and-deliver-port", "noenv", "/apps/showcase-drift-and-deliver-port/?env=0"),
  t("heatsink-port", "default", "/apps/showcase-heatsink-port/"),
  t("ninja-runner-port", "default", "/apps/showcase-ninja-runner-port/"),
  t("ninja-runner-port", "gauntlet-run", "/apps/showcase-ninja-runner-port/?manual=1", gauntletRun),
  t("last-train-port", "default", "/apps/showcase-last-train-port/"),
  ...SALTWIND_LEVELS.map((id, i) => ({ ...t("roadster-hours-port", id, `/apps/showcase-roadster-hours-port/?level=${i}&autostart=1&autopilot=1`, saltwindReady), crops: SALTWIND_CROPS })),
  t("where-the-wind-wanders-port", "default", "/apps/showcase-where-the-wind-wanders-port/"),
  t("silt-and-signal-port", "default", "/apps/showcase-silt-and-signal-port/"),
  t("cloud-runner-port", "default", "/apps/showcase-cloud-runner-port/")
];

/** GU47 variant rows, in inventory order (see VARIANT_PARAMS). */
const GU47_DRAFTS: readonly Draft[] = [
  ...each(TENNIS_VENUES, (v) => t("top-tennis", v, `/apps/showcase-top-tennis/?venue=${v}`)),
  ...each(HEATSINK_CIRCUITS, (c) => t("heatsink", c, `/apps/showcase-heatsink/?circuit=${c}`)),
  ...BUNKER_FLOORS.map(([v, f]) => t("bunker-zero", v, `/apps/showcase-bunker-zero/?floor=${f}`)),
  ...SLINGSHOT_CHAPTERS.map((c) => t("slingshot-siege", `ch${c}`, `/apps/showcase-slingshot-siege/?level=${c * 5}`)),
  ...each(DOT_DASH_MAZES, (m) => t("dot-dash-3d", m, `/apps/showcase-dot-dash-3d/?maze=${m}`)),
  ...each(SPLAT_RUSH_LOOKS, (l) => t("splat-rush-port", l, `/apps/showcase-splat-rush-port/?look=${l}`)),
  ...SERPENTINE_STAGES.map((n) => t("serpentine-sky-run-port", `stage${n}`, `/apps/showcase-serpentine-sky-run-port/?stage=${n}`)),
  ...DRIFT_PHASES.map(([v, s]) => t("drift-and-deliver-port", v, `/apps/showcase-drift-and-deliver-port/?at=${s}`)),
  ...NINJA_DISTRICTS.map(([v, m]) => t("ninja-runner-port", v, `/apps/showcase-ninja-runner-port/?at=${m}`)),
  // title=0 (G21) skips the title orbit, so a band row shows the platform.
  ...LAST_TRAIN_BANDS.map((b) => t("last-train-port", `band-${b.toLowerCase()}`, `/apps/showcase-last-train-port/?band=${b}&title=0`)),
  ...WIND_DAYLIGHT.map(([v, f]) => t("where-the-wind-wanders-port", v, `/apps/showcase-where-the-wind-wanders-port/?found=${f}`)),
  ...SILT_CHAPTERS.map((c) => t("silt-and-signal-port", `ch${c}`, `/apps/showcase-silt-and-signal-port/?chapter=${c}&start=1`)),
  // Pass 4 (game-lane handoffs): new variants and in-branch `?look=original` before rows.
  ...ROADSTER_RUSH_TODS.map((k) => t("roadster-rush", k, `/apps/showcase-roadster-rush/?seed=42&capture=1&tod=${k}`)),
  t("cross-hop", "original", "/apps/showcase-cross-hop/?look=original"),
  t("strange-orbit-port", "original", "/apps/showcase-strange-orbit-port/?look=original"),
  t("strange-orbit-port", "neutral-env", "/apps/showcase-strange-orbit-port/?env=neutral"),
  t("drift-and-deliver-port", "original", "/apps/showcase-drift-and-deliver-port/?look=original"),
  t("heatsink-port", "original", "/apps/showcase-heatsink-port/?look=original"),
  t("ninja-runner-port", "original", "/apps/showcase-ninja-runner-port/?look=original"),
  t("ninja-runner-port", "village-lanterns-off", "/apps/showcase-ninja-runner-port/?at=100&lanterns=0"),
  t("ninja-runner-port", "gate-cones-off", "/apps/showcase-ninja-runner-port/?at=2500&cones=0"),
  ...SALTWIND_LEVELS.map((id, i) => ({ ...t("roadster-hours-port", `${id}-original`, `/apps/showcase-roadster-hours-port/?level=${i}&autostart=1&autopilot=1&look=original`, saltwindReady), crops: SALTWIND_CROPS })),
  t("where-the-wind-wanders-port", "bell", "/apps/showcase-where-the-wind-wanders-port/?found=bell"),
  ...SILT_CHAPTERS.map((c) => t("silt-and-signal-port", `ch${c}-original`, `/apps/showcase-silt-and-signal-port/?chapter=${c}&start=1&look=original`))
];

/** First run group of the GU47 rows: the pre-GU47 targets keep `@g1`..`@g8` exactly as on 4.6.0. */
export const GU47_FIRST_GROUP = Math.ceil(DRAFTS.length / GROUP_SIZE) + 1;

export const GAME_LUMA_TARGETS: readonly GameLumaTarget[] = [
  ...DRAFTS.map((d, i) => ({ ...d, group: `g${Math.floor(i / GROUP_SIZE) + 1}` })),
  ...GU47_DRAFTS.map((d, i) => ({ ...d, group: `g${GU47_FIRST_GROUP + Math.floor(i / GROUP_SIZE)}` }))
];
