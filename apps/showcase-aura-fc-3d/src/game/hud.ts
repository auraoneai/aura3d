// Aura FC 3D — DOM HUD layer.
//
// Broadcast chrome only — score bug, clock, possession bar, stamina,
// shot-charge meter, event ticker, phase banners, shootout ledger and the
// lab scorecard. All real DOM over the canvas; nothing in here pretends to
// be a 3D effect.

import type { ClubSpec } from "./content";
import type { MatchState, SimEvent } from "./types";
import { CLUBS } from "./content";
import { describePhase } from "./ai";
import { PITCH_HX, PITCH_HZ } from "./dims";

/**
 * Colours of the kits the athletes actually wear (rig.ts TEAM_KITS, outfield shirts). The HUD kit chips and the
 * possession bar use these, not the club colours: the club picks the name on the scoreboard, the kit stays fixed
 * per side so both teams always read apart on the pitch. Kept here (not imported from rig.ts) so the HUD stays
 * engine-free; tests/unit/aura-fc-3d/audit-fixes.test.ts checks the two lists match.
 */
export const HUD_KIT_COLORS: readonly [string, string] = ["#b2352f", "#d9e8f7"];

export interface HudContext {
  home: ClubSpec;
  away: ClubSpec;
  tag?: string;                 // circuit stage ribbon
  userIsHome?: boolean;
  labLabel?: string;            // e.g. "SHOOTOUT LAB"
  labScore?: string;            // e.g. "3 / 5"
  labBest?: string;
  charge?: number | null;       // 0..1 while a shot is charging
  controlledStamina?: number | null;
  /** Show the "move to kick off" cue (the user's kickoff waits for input). */
  kickoffPrompt?: boolean;
}

export interface Hud {
  readonly root: HTMLElement;
  update(state: MatchState, ctx: HudContext): void;
  ticker(ev: SimEvent): void;
  banner(text: string, ms?: number, cls?: string): void;
  setVisible(on: boolean): void;
  /** Persistent pause panel (stays until play resumes). */
  setPaused(on: boolean): void;
  /** FC47-H1 TV package: venue ident card (venue name and local time of day), top centre. */
  ident(venue: string, timeOfDay: string, ms?: number): void;
  /** FC47-H1 TV package: goal lower third (scoring club and match minute) from the last update's clubs. */
  goalLowerThird(team: 0 | 1, state: MatchState, ms?: number): void;
  /** FC47-C1: letterbox bars while the intro rail plays. */
  bars(on: boolean): void;
  /** FC47-C1 / H1: the REPLAY stinger while a goal replay plays. */
  replayTag(on: boolean): void;
}

/**
 * WP-04 AuraOne TV Broadcast Typography:
 * - `var(--font-ui)` ("Whitney", weights 400/500/600, tabular-nums) for team codes, phase tags, banners & lower thirds
 * - `var(--font-metric)` ("DIN Pro", weight 500, tabular-nums) strictly for standalone scoreline, clock & KPI figures
 * - `var(--font-mono)` ("Monument Grotesk Mono", weight 400, >= 12px) strictly for match event telemetry
 */
export const FC_HUD_FONT = "Whitney";
export const FC_HUD_FONT_FACES = [
  { file: "calibre-400.woff2", weight: "400" },
  { file: "calibre-600.woff2", weight: "600" }
] as const;
let fontsRegistered = false;
export function registerFcHudFonts(_baseUrl = "/fc-fonts/", doc: Document | undefined = typeof document === "undefined" ? undefined : document): number {
  if (fontsRegistered || !doc || typeof FontFace === "undefined") return 0;
  fontsRegistered = true;
  return FC_HUD_FONT_FACES.length;
}

const css = `
.fc-hud { position: fixed; inset: 0; pointer-events: none; z-index: 30;
  font-family: var(--font-ui, "Whitney", "Whitney Fallback", sans-serif);
  font-variant-numeric: tabular-nums; color: #f3f0dc; }
.fc-hud * { box-sizing: border-box; }
.fc-hud b { font-weight: 600; }
.fc-bug { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 8px); left: 18px; display: flex; align-items: stretch;
  background: linear-gradient(180deg, rgba(8,16,24,.9), rgba(4,10,16,.94));
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(216,255,62,.32); border-top: 2px solid #d8ff3e; border-radius: 9px; overflow: hidden;
  box-shadow: 0 10px 28px rgba(0,0,0,.46); }
.fc-bug .team { display: flex; align-items: center; gap: 7px; padding: 6px 10px; font-weight: 600;
  font-size: 13px; letter-spacing: .07em; }
.fc-bug .kit { width: 5px; height: 20px; border-radius: 2px; box-shadow: 0 0 8px rgba(255,255,255,.16); }
.fc-bug .score { display: flex; align-items: center; gap: 8px; padding: 5px 13px;
  font-family: var(--font-metric, "DIN Pro", sans-serif);
  background: linear-gradient(180deg, rgba(216,255,62,.16), rgba(216,255,62,.07));
  border-left: 1px solid rgba(255,255,255,.08); border-right: 1px solid rgba(255,255,255,.08);
  font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums; color: #ffffff; }
.fc-bug .meta { display: flex; flex-direction: column; justify-content: center; padding: 4px 12px;
  border-left: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.22); }
.fc-bug .clock { font-family: var(--font-metric, "DIN Pro", sans-serif); font-size: 15px; font-weight: 500;
  font-variant-numeric: tabular-nums; letter-spacing: .04em; color: #d8ff3e; line-height: 1.1; }
.fc-bug .half { font-size: 12px; font-weight: 500; font-variant-caps: all-small-caps; letter-spacing: .09em; opacity: .78; line-height: 1.1; }
.fc-tag { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 108px); left: 18px; padding: 3px 10px; font-size: 12px;
  letter-spacing: .12em; font-weight: 600; font-variant-caps: all-small-caps; color: #0b1f1c;
  background: linear-gradient(135deg,#d8ff3e,#9be84e); border-radius: 6px; }
.fc-poss { position: relative; width: 176px; height: 5px; border-radius: 3px;
  background: rgba(255,255,255,.12); overflow: hidden; display: flex; }
.fc-poss > i { display: block; height: 100%; transition: width .4s; }
.fc-poss-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; line-height: 1; }
.fc-poss-l { font-size: 12px; font-weight: 500; font-variant-caps: all-small-caps; letter-spacing: .09em; opacity: .82; }
.fc-poss-pct { font-family: var(--font-metric, "DIN Pro", sans-serif); font-size: 12px; font-weight: 500;
  font-variant-numeric: tabular-nums; color: #dce6ec; opacity: .9; }
.fc-poss-wrap { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 64px); left: 18px; padding: 6px 10px 5px;
  background: rgba(6,13,20,.82); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(216,255,62,.18); border-radius: 8px; }
.fc-stamina { position: absolute; bottom: 84px; left: 50%; transform: translateX(-50%);
  width: 152px; height: 6px; border-radius: 4px; background: rgba(5,12,18,.68);
  border: 1px solid rgba(255,255,255,.2); overflow: hidden; }
.fc-stamina > i { display: block; height: 100%; background: linear-gradient(90deg,#7dfcff,#d8ff3e);
  transition: width .12s linear; }
.fc-stamina-l { position: absolute; bottom: 66px; left: 50%; transform: translateX(-50%);
  text-align: center; font-size: 12px; font-weight: 500; font-variant-caps: all-small-caps; letter-spacing: .12em; opacity: .76; }
.fc-charge { position: absolute; bottom: 112px; left: 50%; transform: translateX(-50%);
  width: 188px; height: 10px; border-radius: 6px; background: rgba(5,12,18,.72);
  border: 1px solid rgba(216,255,62,.5); overflow: hidden; }
.fc-charge > i { display: block; height: 100%; background: linear-gradient(90deg,#d8ff3e,#ffd76a,#ff9a3d); }
.fc-charge-l { position: absolute; bottom: 125px; left: 50%; transform: translateX(-50%);
  text-align: center; font-size: 12px; font-weight: 600; font-variant-caps: all-small-caps; letter-spacing: .14em; color: #d8ff3e; }
.fc-ticker { position: absolute; left: 18px; bottom: 44px; display: flex; flex-direction: column;
  gap: 4px; max-width: 340px; }
.fc-tick { font-family: var(--font-mono, "Monument Grotesk Mono", monospace); font-size: 12px; font-weight: 400; letter-spacing: .03em;
  color: #cfd6c8; background: rgba(7,16,22,.84); border-left: 2px solid rgba(216,255,62,.55);
  padding: 4px 10px; border-radius: 4px; opacity: 0; transform: translateX(-8px); line-height: 1.35;
  transition: opacity .25s, transform .25s; white-space: normal; overflow-wrap: anywhere; }
.fc-tick.show { opacity: .94; transform: translateX(0); }
.fc-tick-warn { border-left-color: #ff3b30; color: #ffb3ac; }
.fc-tick-success { border-left-color: #d8ff3e; color: #e8f5c0; }
.fc-banner { position: absolute; top: 34%; left: 50%; transform: translate(-50%,-50%) scale(.92);
  font-family: var(--font-ui, "Whitney", "Whitney Fallback", sans-serif); font-weight: 600; font-size: 52px;
  letter-spacing: .1em; text-transform: uppercase; color: #f3f0dc; text-align: center;
  text-shadow: 0 4px 30px rgba(0,0,0,.72), 0 0 60px rgba(216,255,62,.28);
  opacity: 0; transition: opacity .2s, transform .3s cubic-bezier(.2,.9,.3,1.4); pointer-events: none; }
.fc-banner.show { opacity: 1; transform: translate(-50%,-50%) scale(1); }
.fc-banner.goal { color: #d8ff3e; font-size: 68px; }
.fc-banner.warn { color: #ff9a3d; }
.fc-banner.gold { color: #ffd76a; }
.fc-so { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 8px); right: 18px; background: rgba(7,16,22,.9);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(216,255,62,.3); border-radius: 10px; padding: 10px 14px; min-width: 210px; }
.fc-so h4 { margin: 0 0 7px; font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; opacity: .82; }
.fc-so .row { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 12px; font-weight: 600; }
.fc-so .dots { display: flex; gap: 4px; }
.fc-so .dot { width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,.14);
  display: inline-flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1; font-weight: 600; }
.fc-so .dot.in { background: #d8ff3e; color: #0b1f1c; box-shadow: 0 0 8px rgba(216,255,62,.6); }
.fc-so .dot.miss { background: #ff3b30; color: #fff; }
.fc-so .dot.cur { outline: 2px solid #7dfcff; }
.fc-lab { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 8px); right: 18px; background: rgba(7,16,22,.9);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(125,252,255,.4); border-radius: 10px; padding: 10px 16px; text-align: right; }
/* Shootout Lab shows both cards: the lab score card stacks under the ledger instead of covering it */
.fc-so:not(.fc-hidden) ~ .fc-lab { top: calc(var(--a3d-bar-space, 44px) + 104px); }
.fc-lab h4 { margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: .14em; color: #7dfcff; text-transform: uppercase; }
.fc-lab .big { font-family: var(--font-metric, "DIN Pro", sans-serif); font-size: 26px; font-weight: 500; font-variant-numeric: tabular-nums; }
.fc-lab .sub { font-size: 12px; font-weight: 500; opacity: .76; letter-spacing: .06em; }
.fc-hidden { display: none !important; }
.fc-prompt { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); padding: 8px 18px; border-radius: 10px;
  font-family: var(--font-ui, "Whitney", "Whitney Fallback", sans-serif); font-weight: 600; font-size: 13px;
  letter-spacing: .12em; text-transform: uppercase; color: #0b1f1c;
  background: linear-gradient(135deg,#d8ff3e,#9be84e); box-shadow: 0 8px 26px rgba(0,0,0,.4); white-space: nowrap; }
.fc-pause { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;
  background: rgba(4,10,14,.48); }
.fc-pause > div { padding: 18px 34px; border-radius: 14px; text-align: center; background: rgba(7,16,22,.94);
  border: 1px solid rgba(216,255,62,.4); }
.fc-pause b { display: block; font-family: var(--font-ui, "Whitney", "Whitney Fallback", sans-serif); font-weight: 600;
  font-size: 36px; letter-spacing: .14em; color: #f3f0dc; }
.fc-pause span { display: block; margin-top: 6px; font-size: 13px; font-weight: 500; letter-spacing: .08em; opacity: .82; }
.fc-ident { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 10px); left: 50%; transform: translate(-50%, -6px);
  display: flex; align-items: stretch; background: rgba(7,16,22,.92); border-top: 3px solid #d8ff3e; border-radius: 0 0 6px 6px;
  overflow: hidden; opacity: 0; transition: opacity .25s, transform .25s; }
.fc-ident b { padding: 6px 12px; font-size: 14px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #f3f0dc; }
.fc-ident span { padding: 6px 12px; font-size: 12px; letter-spacing: .06em; color: #0b1f1c; background: #d8ff3e; font-weight: 600; }
.fc-ident.show { opacity: 1; transform: translate(-50%, 0); }
.fc-l3 { position: absolute; left: 18px; bottom: 96px; display: flex; flex-direction: column; min-width: 240px; opacity: 0;
  transform: translateX(-16px); transition: opacity .25s, transform .3s; border-radius: 6px; overflow: hidden; }
.fc-l3 b { padding: 6px 14px; background: #d8ff3e; color: #0b1f1c; font-size: 20px; font-weight: 600; letter-spacing: .12em; }
.fc-l3 span { padding: 5px 14px; background: rgba(7,16,22,.94); color: #f3f0dc; font-size: 13px; font-weight: 500; letter-spacing: .05em; }
.fc-l3.show { opacity: 1; transform: translateX(0); }
.fc-bars { position: absolute; inset: 0; pointer-events: none; }
.fc-bars::before, .fc-bars::after { content: ""; position: absolute; left: 0; right: 0; height: 0; background: #000; transition: height .35s; }
.fc-bars::before { top: 0; } .fc-bars::after { bottom: 0; }
.fc-bars.show::before, .fc-bars.show::after { height: 10vh; }
.fc-replay { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 12px); right: 18px; display: flex; align-items: center; gap: 8px;
  padding: 5px 14px; background: rgba(7,16,22,.92); border-left: 4px solid #d8ff3e; border-radius: 4px;
  color: #f3f0dc; font-size: 16px; font-weight: 600; letter-spacing: .18em; opacity: 0; transform: translateX(12px); transition: opacity .2s, transform .25s; }
.fc-replay i { width: 9px; height: 9px; border-radius: 50%; background: #d8ff3e; font-style: normal; }
.fc-replay.show { opacity: 1; transform: translateX(0); }
/* 2D Broadcast Tactical Pitch Radar */
.fc-radar { position: absolute; right: 18px; bottom: 38px; width: 148px; height: 92px; border-radius: 8px;
  background: linear-gradient(180deg, rgba(8,22,18,.84), rgba(5,14,12,.88));
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(216,255,62,.28); box-shadow: 0 8px 22px rgba(0,0,0,.42); overflow: hidden; }
.fc-radar::before { content: ""; position: absolute; top: 5px; bottom: 5px; left: 50%; width: 1px; background: rgba(243,240,220,.18); }
.fc-radar::after { content: ""; position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px;
  border-radius: 50%; border: 1px solid rgba(243,240,220,.18); }
.fc-radar-in { position: absolute; inset: 5px; border: 1px solid rgba(243,240,220,.22); border-radius: 4px; }
.fc-r-dot { position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%;
  box-shadow: 0 0 4px rgba(0,0,0,.7); transition: left .06s linear, top .06s linear; }
.fc-r-dot.ctrl { outline: 1.5px solid #d8ff3e; outline-offset: 1px; z-index: 2; }
.fc-r-ball { position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%;
  background: #d8ff3e; box-shadow: 0 0 8px rgba(216,255,62,.95); z-index: 3; transition: left .05s linear, top .05s linear; }
@media (prefers-reduced-motion: reduce) { .fc-bars::before, .fc-bars::after, .fc-replay, .fc-r-dot, .fc-r-ball { transition: none; transform: none; } }
@media (prefers-reduced-motion: reduce) { .fc-ident, .fc-l3, .fc-banner { transition: opacity .15s; transform: none !important; } .fc-ident { transform: translateX(-50%) !important; } }
@media (max-width: 760px), (pointer: coarse) {
  .fc-bug { top: calc(var(--a3d-bar-space, 44px) + 4px); left: 10px; }
  .fc-bug .team { padding: 5px 7px; font-size: 12px; gap: 5px; }
  .fc-bug .score { padding: 4px 9px; font-size: 17px; gap: 5px; }
  .fc-bug .meta { padding: 3px 8px; }
  .fc-bug .clock { font-size: 13px; }
  .fc-poss-wrap { top: calc(var(--a3d-bar-space, 44px) + 54px); left: 10px; padding: 5px 8px 4px; }
  .fc-poss { width: 146px; }
  .fc-tag { top: calc(var(--a3d-bar-space, 44px) + 94px); left: 10px; }
  .fc-radar { top: calc(var(--a3d-bar-space, 44px) + 4px); right: 10px; bottom: auto; width: 106px; height: 66px; }
  .fc-hud[data-right-card="1"] .fc-radar { display: none; }
  .fc-stamina { bottom: 164px; width: 132px; }
  .fc-stamina-l { bottom: 147px; }
  .fc-charge { bottom: 190px; width: 156px; }
  .fc-charge-l { bottom: 203px; }
  .fc-l3 { bottom: 162px; left: 10px; min-width: 0; }
  .fc-l3 b { font-size: 17px; }
  .fc-ticker { bottom: 162px; left: 10px; max-width: 204px; }
  .fc-banner { font-size: 28px; white-space: nowrap; }
  .fc-banner.goal { font-size: 42px; }
}
@media (prefers-reduced-motion: reduce) { .fc-banner, .fc-tick { transition: none; } }
`;

function el(tag: string, cls?: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Broadcast phrasing for the recurring sim events; unknown labels upper-case. */
const TICK_COPY: Record<string, string> = {
  "slide tackle wins it": "SLIDE TACKLE — POSSESSION WON",
  "slide tackle": "SLIDE TACKLE — CHALLENGE",
  "keeper save": "SAVE — KEEPER DENIES",
  "off the post": "OFF THE POST — INCHES AWAY",
  "off the bar": "OFF THE CROSSBAR — INCHES AWAY",
  "off the boards": "OFF THE BOARDS — STILL LIVE",
  "corner": "CORNER — SET-PIECE CHANCE",
  "goal kick": "GOAL KICK — PLAY RESUMES",
  "kick-in": "KICK-IN — RESTART",
  "bounce": "BOUNCE — LOOSE BALL",
  "penalty taken": "PENALTY — TAKEN",
  "step-over": "STEP-OVER — INTO SPACE",
  "chop — cuts it back": "CHOP — CUTS IT BACK"
};

function tickerText(ev: SimEvent): string {
  return TICK_COPY[ev.label] ?? ev.label.toUpperCase();
}

export function createHud(host: HTMLElement): Hud {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  registerFcHudFonts();
  const root = el("div", "fc-hud") as HTMLElement;
  host.appendChild(root);

  // score bug
  const bug = el("div", "fc-bug", root);
  const homeT = el("span", "team", bug);
  const homeKit = el("i", "kit", homeT) as HTMLElement;
  const homeName = el("b", "", homeT);
  const scoreEl = el("span", "score", bug);
  const awayT = el("span", "team", bug);
  const awayName = el("b", "", awayT);
  const awayKit = el("i", "kit", awayT) as HTMLElement;
  const meta = el("span", "meta", bug);
  const clockEl = el("span", "clock", meta);
  const halfEl = el("span", "half", meta);

  const tagEl = el("div", "fc-tag fc-hidden", root);

  const possWrap = el("div", "fc-poss-wrap", root);
  const poss = el("div", "fc-poss", possWrap);
  const possH = el("i", "", poss) as HTMLElement;
  const possA = el("i", "", poss) as HTMLElement;
  const possRow = el("div", "fc-poss-row", possWrap);
  const possL = el("span", "fc-poss-l", possRow);
  possL.textContent = "POSSESSION";
  const possPct = el("span", "fc-poss-pct", possRow);
  possPct.textContent = "50% · 50%";

  const stam = el("div", "fc-stamina", root);
  const stamFill = el("i", "", stam) as HTMLElement;
  const stamL = el("div", "fc-stamina-l", root);
  stamL.textContent = "SPRINT";

  const chargeWrap = el("div", "", root);
  const charge = el("div", "fc-charge fc-hidden", chargeWrap);
  const chargeFill = el("i", "", charge) as HTMLElement;
  const chargeL = el("div", "fc-charge-l fc-hidden", chargeWrap);
  chargeL.textContent = "SHOT POWER";

  const ticker = el("div", "fc-ticker", root);
  const bannerEl = el("div", "fc-banner", root);

  // shootout ledger
  const so = el("div", "fc-so fc-hidden", root);
  const soTitle = el("h4", "", so); soTitle.textContent = "SHOOTOUT";
  const soHomeRow = el("div", "row", so);
  const soHomeName = el("b", "", soHomeRow);
  const soHomeDots = el("span", "dots", soHomeRow);
  const soAwayRow = el("div", "row", so);
  const soAwayName = el("b", "", soAwayRow);
  const soAwayDots = el("span", "dots", soAwayRow);

  // kickoff cue + pause panel
  const prompt = el("div", "fc-prompt fc-hidden", root);
  prompt.textContent = "Move to kick off";
  const pausePanel = el("div", "fc-pause fc-hidden", root);
  const pauseCard = el("div", "", pausePanel);
  el("b", "", pauseCard).textContent = "PAUSED";
  el("span", "", pauseCard).textContent = "P or II to play on";

  // lab card
  const lab = el("div", "fc-lab fc-hidden", root);
  const labTitle = el("h4", "", lab);
  const labBig = el("div", "big", lab);
  const labSub = el("div", "sub", lab);

  // FC47-H1: venue ident and goal lower third
  const identEl = el("div", "fc-ident", root);
  const identVenue = el("b", "", identEl);
  const identTime = el("span", "", identEl);
  const l3 = el("div", "fc-l3", root);
  const l3Title = el("b", "", l3);
  const l3Sub = el("span", "", l3);
  // FC47-C1: intro letterbox and the REPLAY stinger
  const barsEl = el("div", "fc-bars", root);
  const replayEl = el("div", "fc-replay", root);
  el("i", "", replayEl);
  el("span", "", replayEl).textContent = "REPLAY";

  // WP-04: 2D Broadcast Tactical Pitch Radar (10 players + ball)
  const radar = el("div", "fc-radar fc-hidden", root);
  radar.setAttribute("aria-hidden", "true");
  const radarIn = el("div", "fc-radar-in", radar);
  const radarDots = new Map<string, HTMLElement>();
  const radarBall = el("i", "fc-r-ball", radarIn);
  let identTimer = 0;
  let l3Timer = 0;
  let lastClubs: { home: ClubSpec; away: ClubSpec } | null = null;

  let bannerTimer = 0;
  let ledgerKey = "";

  const fmtClock = (state: MatchState): string => {
    if (state.half === 3) return `ET ${Math.floor(state.clock)}″`;
    const base = state.half === 2 ? 90 : 0;
    const t = base + Math.floor(state.clock);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };

  return {
    root,
    setVisible(on) { root.classList.toggle("fc-hidden", !on); },
    setPaused(on) { pausePanel.classList.toggle("fc-hidden", !on); },
    banner(text, ms = 2200, cls = "") {
      bannerEl.textContent = text;
      bannerEl.className = `fc-banner show ${cls}`;
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => { bannerEl.className = "fc-banner"; }, ms);
    },
    ticker(ev) {
      const key = `${ev.type}|${ev.label}`;
      // Consecutive/duplicate events used to stack identical "slide tackle"
      // rows; keep one live row per event signature.
      if (Array.from(ticker.children).some((n) => (n as HTMLElement).dataset.tickKey === key)) return;
      const item = el("span", `fc-tick fc-tick-${ev.severity ?? "info"}`);
      item.dataset.tickKey = key;
      item.textContent = tickerText(ev);
      ticker.prepend(item);
      requestAnimationFrame(() => item.classList.add("show"));
      while (ticker.children.length > 4) ticker.lastElementChild?.remove();
      window.setTimeout(() => { item.classList.remove("show"); window.setTimeout(() => item.remove(), 300); }, 7000);
    },
    ident(venue, timeOfDay, ms = 3200) {
      identVenue.textContent = venue;
      identTime.textContent = timeOfDay;
      identEl.classList.add("show");
      window.clearTimeout(identTimer);
      identTimer = window.setTimeout(() => identEl.classList.remove("show"), ms);
    },
    bars(on) { barsEl.classList.toggle("show", on); },
    replayTag(on) { replayEl.classList.toggle("show", on); },
    goalLowerThird(team, state, ms = 4000) {
      const club = lastClubs ? (team === 0 ? lastClubs.home : lastClubs.away) : null;
      l3Title.textContent = "GOAL";
      l3Sub.textContent = `${club?.name ?? (team === 0 ? "Home" : "Away")}  ·  ${fmtClock(state)}  ·  ${state.score[0]} – ${state.score[1]}`;
      l3.classList.add("show");
      window.clearTimeout(l3Timer);
      l3Timer = window.setTimeout(() => l3.classList.remove("show"), ms);
    },
    update(state, ctx) {
      lastClubs = { home: ctx.home, away: ctx.away };
      homeName.textContent = ctx.home.short;
      awayName.textContent = ctx.away.short;
      homeKit.style.background = HUD_KIT_COLORS[0];
      awayKit.style.background = HUD_KIT_COLORS[1];
      scoreEl.textContent = `${state.score[0]} – ${state.score[1]}`;
      clockEl.textContent = state.mode === "shootout" ? "PENS" : fmtClock(state);
      halfEl.textContent = state.half === 3 ? "golden goal" : describePhase(state);

      tagEl.classList.toggle("fc-hidden", !ctx.tag);
      if (ctx.tag) tagEl.textContent = ctx.tag;

      // possession split
      const tot = state.possession[0] + state.possession[1];
      const hPct = tot > 0 ? Math.round((state.possession[0] / tot) * 100) : 50;
      possH.style.width = `${hPct}%`; possH.style.background = HUD_KIT_COLORS[0];
      possA.style.width = `${100 - hPct}%`; possA.style.background = HUD_KIT_COLORS[1];
      possPct.textContent = `${hPct}% · ${100 - hPct}%`;
      prompt.classList.toggle("fc-hidden", !ctx.kickoffPrompt);

      // stamina of the controlled player
      const c = state.players.find((p) => p.id === state.controlledId);
      const st = ctx.controlledStamina ?? c?.stamina ?? null;
      const showStam = st !== null && state.userTeam !== null && (state.phase === "live" || state.phase === "kickoff");
      stam.classList.toggle("fc-hidden", !showStam);
      stamL.classList.toggle("fc-hidden", !showStam);
      if (st !== null) stamFill.style.width = `${Math.round(st * 100)}%`;

      // charge meter
      const ch = ctx.charge ?? null;
      charge.classList.toggle("fc-hidden", ch === null);
      chargeL.classList.toggle("fc-hidden", ch === null);
      if (ch !== null) chargeFill.style.width = `${Math.round(ch * 100)}%`;

      // shootout ledger
      const showSo = state.phase === "shootout" && !!state.shootout;
      so.classList.toggle("fc-hidden", !showSo);
      if (showSo && state.shootout) {
        const s = state.shootout;
        soTitle.textContent = state.mode === "shootout" ? "SHOOTOUT LAB" : `SHOOTOUT · R${Math.min(5, s.round)}`;
        soHomeName.textContent = ctx.home.short;
        soAwayName.textContent = ctx.away.short;
        // kick-by-kick history from the per-kick log; repainted only when a kick is recorded or the taker changes
        const key = `${s.log[0].join("")}|${s.log[1].join("")}|${s.takerTeam}|${s.stage === "done"}|${s.taken[0]},${s.taken[1]}`;
        if (key !== ledgerKey) {
          ledgerKey = key;
          const paintRow = (elc: HTMLElement, team: 0 | 1) => {
            elc.textContent = "";
            const log = s.log[team];
            for (let i = 0; i < Math.max(5, log.length + (s.takerTeam === team ? 1 : 0)); i++) {
              const d = document.createElement("span");
              d.className = "dot";
              const r = log[i];
              if (r) { d.classList.add(r === "in" ? "in" : "miss"); d.textContent = r === "in" ? "\u2713" : "\u2715"; d.setAttribute("aria-label", r === "in" ? "scored" : "missed"); }
              if (i === log.length && s.takerTeam === team && s.stage !== "done") d.classList.add("cur");
              elc.appendChild(d);
            }
          };
          paintRow(soHomeDots, 0);
          paintRow(soAwayDots, 1);
        }
      }

      // lab card
      const showLab = !!ctx.labLabel;
      lab.classList.toggle("fc-hidden", !showLab);
      if (showLab) {
        labTitle.textContent = ctx.labLabel!;
        labBig.textContent = ctx.labScore ?? "";
        labSub.textContent = ctx.labBest ?? "";
      }

      // 2D Tactical Pitch Radar
      const rightBusy = showSo || showLab || replayEl.classList.contains("show");
      root.dataset.rightCard = rightBusy ? "1" : "0";
      const showRadar = (state.phase === "live" || state.phase === "kickoff" || state.phase === "restart") && state.players.length > 0;
      radar.classList.toggle("fc-hidden", !showRadar);
      if (showRadar) {
        const toPctX = (wx: number) => `${Math.max(2, Math.min(98, ((wx + PITCH_HX) / (PITCH_HX * 2)) * 100)).toFixed(1)}%`;
        const toPctY = (wz: number) => `${Math.max(4, Math.min(96, ((wz + PITCH_HZ) / (PITCH_HZ * 2)) * 100)).toFixed(1)}%`;
        const activeIds = new Set<string>();
        for (const p of state.players) {
          activeIds.add(p.id);
          let dot = radarDots.get(p.id);
          if (!dot) {
            dot = el("i", "fc-r-dot", radarIn);
            radarDots.set(p.id, dot);
          }
          dot.style.background = p.team === 0 ? HUD_KIT_COLORS[0] : HUD_KIT_COLORS[1];
          dot.classList.toggle("ctrl", p.id === state.controlledId);
          dot.style.left = toPctX(p.x);
          dot.style.top = toPctY(p.z);
        }
        for (const [id, dot] of radarDots) {
          if (!activeIds.has(id)) {
            dot.remove();
            radarDots.delete(id);
          }
        }
        radarBall.style.left = toPctX(state.ball.x);
        radarBall.style.top = toPctY(state.ball.z);
      }
    }
  };
}

export function clubFor(id: keyof typeof CLUBS | string): ClubSpec {
  return (CLUBS as Record<string, ClubSpec>)[id] ?? CLUBS.aurora;
}
