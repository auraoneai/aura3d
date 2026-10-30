import type { Page } from "@playwright/test";

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
/** Grid Dispatch sky presets (`#teleopDock button[data-tod]`); noon is the boot state. */
export const TELEOP_SKIES = ["noon", "golden", "fog", "night"] as const;

/** Shadowstep Gauntlet in manual mode: the sim advances only through the hook, so the shots see the run at step 300. */
const gauntletRun = async (page: Page): Promise<void> => {
  await page.waitForFunction("window.__AURA_NINJA_RUNNER__ && window.__AURA_NINJA_RUNNER__.ready() === true", undefined, { timeout: 420_000, polling: 500 });
  await page.evaluate("(() => { const h = window.__AURA_NINJA_RUNNER__; h.begin(); h.stepFrames(300); h.settle(4, 1 / 60); })()");
};

/** Saltwind Highway boots on the level from `?level=`; wait for its own ready flag, which follows the first frame. */
const saltwindReady = async (page: Page): Promise<void> => {
  await page.waitForFunction("(() => { const r = window.__AURA_ROADSTER_HOURS__?.ready; return typeof r === 'function' ? r() : r === true; })()", undefined, { timeout: 420_000, polling: 500 });
};

const DRAFTS: readonly Draft[] = [
  t("top-tennis", "default", "/apps/showcase-top-tennis/"),
  // capture=1 starts the run at once (the page otherwise opens on a title card); seed=42 fixes the traffic.
  t("roadster-rush", "default", "/apps/showcase-roadster-rush/?seed=42&capture=1"),
  t("heatsink", "default", "/apps/showcase-heatsink/"),
  ...each(TELEOP_SKIES, (k) => t("teleoperator", k, "/apps/showcase-teleoperator/", k === "noon" ? undefined : clickSelector(`#teleopDock button[data-tod="${k}"]`))),
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
  ...SALTWIND_LEVELS.map((id, i) => t("roadster-hours-port", id, `/apps/showcase-roadster-hours-port/?level=${i}&autostart=1&autopilot=1`, saltwindReady)),
  t("where-the-wind-wanders-port", "default", "/apps/showcase-where-the-wind-wanders-port/"),
  t("silt-and-signal-port", "default", "/apps/showcase-silt-and-signal-port/"),
  t("cloud-runner-port", "default", "/apps/showcase-cloud-runner-port/")
];

export const GAME_LUMA_TARGETS: readonly GameLumaTarget[] = DRAFTS.map((d, i) => ({ ...d, group: `g${Math.floor(i / GROUP_SIZE) + 1}` }));
