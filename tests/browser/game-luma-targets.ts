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

const DRAFTS: readonly Draft[] = [
  t("top-tennis", "default", "/apps/showcase-top-tennis/"),
  t("roadster-rush", "default", "/apps/showcase-roadster-rush/"),
  t("heatsink", "default", "/apps/showcase-heatsink/"),
  t("teleoperator", "default", "/apps/showcase-teleoperator/"),
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
  t("heatsink-port", "default", "/apps/showcase-heatsink-port/"),
  t("ninja-runner-port", "default", "/apps/showcase-ninja-runner-port/"),
  t("last-train-port", "default", "/apps/showcase-last-train-port/"),
  t("roadster-hours-port", "default", "/apps/showcase-roadster-hours-port/"),
  t("where-the-wind-wanders-port", "default", "/apps/showcase-where-the-wind-wanders-port/"),
  t("silt-and-signal-port", "default", "/apps/showcase-silt-and-signal-port/"),
  t("cloud-runner-port", "default", "/apps/showcase-cloud-runner-port/")
];

export const GAME_LUMA_TARGETS: readonly GameLumaTarget[] = DRAFTS.map((d, i) => ({ ...d, group: `g${Math.floor(i / GROUP_SIZE) + 1}` }));
