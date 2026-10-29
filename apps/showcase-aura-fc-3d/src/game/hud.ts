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
}

const css = `
.fc-hud { position: fixed; inset: 0; pointer-events: none; z-index: 30;
  font-family: "Whitney", "Graphik", system-ui, sans-serif; color: #f3f0dc; }
.fc-hud * { box-sizing: border-box; }
.fc-bug { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 8px); left: 18px; display: flex; align-items: stretch;
  background: linear-gradient(180deg, rgba(8,18,24,.92), rgba(5,12,16,.92));
  border: 1px solid rgba(216,255,62,.3); border-radius: 10px; overflow: hidden;
  box-shadow: 0 8px 26px rgba(0,0,0,.4); }
.fc-bug .team { display: flex; align-items: center; gap: 7px; padding: 7px 10px; font-weight: 700;
  font-size: 13px; letter-spacing: .06em; }
.fc-bug .kit { width: 10px; height: 18px; border-radius: 2px; }
.fc-bug .score { display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  background: rgba(216,255,62,.1); font-size: 19px; font-weight: 800; font-variant-numeric: tabular-nums; }
.fc-bug .meta { display: flex; flex-direction: column; justify-content: center; padding: 4px 12px;
  border-left: 1px solid rgba(255,255,255,.12); }
.fc-bug .clock { font-family: "Monument Grotesk Mono", monospace; font-size: 15px; color: #d8ff3e; }
.fc-bug .half { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; opacity: .75; }
.fc-tag { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 64px); left: 18px; padding: 3px 10px; font-size: 12px;
  letter-spacing: .16em; font-weight: 700; color: #0b1f1c; background: linear-gradient(135deg,#d8ff3e,#9be84e);
  border-radius: 6px; }
.fc-poss { position: relative; width: 170px; height: 6px; border-radius: 3px;
  background: rgba(255,255,255,.12); overflow: hidden; display: flex; }
.fc-poss > i { display: block; height: 100%; transition: width .4s; }
.fc-poss-l { font-size: 12px; letter-spacing: .12em; opacity: .6; margin-top: 2px; }
.fc-poss-wrap { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 56px); left: 18px; }
.fc-stamina { position: absolute; bottom: 84px; left: 50%; transform: translateX(-50%);
  width: 150px; height: 7px; border-radius: 4px; background: rgba(0,0,0,.5);
  border: 1px solid rgba(255,255,255,.18); overflow: hidden; }
.fc-stamina > i { display: block; height: 100%; background: linear-gradient(90deg,#7dfcff,#d8ff3e);
  transition: width .12s linear; }
.fc-stamina-l { text-align: center; font-size: 12px; letter-spacing: .18em; opacity: .7; margin-top: 3px; }
.fc-charge { position: absolute; bottom: 108px; left: 50%; transform: translateX(-50%);
  width: 190px; height: 11px; border-radius: 6px; background: rgba(0,0,0,.55);
  border: 1px solid rgba(216,255,62,.45); overflow: hidden; }
.fc-charge > i { display: block; height: 100%; background: linear-gradient(90deg,#d8ff3e,#ffd76a,#ff9a3d); }
.fc-charge-l { text-align: center; font-size: 12px; letter-spacing: .22em; color: #d8ff3e; margin-top: 3px; font-weight: 700; }
.fc-ticker { position: absolute; left: 18px; bottom: 46px; display: flex; flex-direction: column;
  gap: 4px; max-width: 340px; }
.fc-tick { font-family: "Monument Grotesk Mono", monospace; font-size: 12px; letter-spacing: .04em;
  color: #cfd6c8; background: rgba(7,16,22,.8); border-left: 2px solid rgba(216,255,62,.5);
  padding: 4px 10px; border-radius: 3px; opacity: 0; transform: translateX(-8px); line-height: 1.35;
  transition: opacity .25s, transform .25s; white-space: normal; overflow-wrap: anywhere; }
.fc-tick.show { opacity: .93; transform: translateX(0); }
.fc-tick-warn { border-left-color: #ff3b30; color: #ffb3ac; }
.fc-tick-success { border-left-color: #d8ff3e; color: #e8f5c0; }
.fc-banner { position: absolute; top: 34%; left: 50%; transform: translate(-50%,-50%) scale(.9);
  font-family: "DIN Pro", sans-serif; font-weight: 800; font-size: 54px;
  letter-spacing: .12em; text-transform: uppercase; color: #f3f0dc; text-align: center;
  text-shadow: 0 4px 30px rgba(0,0,0,.7), 0 0 60px rgba(216,255,62,.3);
  opacity: 0; transition: opacity .2s, transform .3s cubic-bezier(.2,.9,.3,1.4); pointer-events: none; }
.fc-banner.show { opacity: 1; transform: translate(-50%,-50%) scale(1); }
.fc-banner.goal { color: #d8ff3e; font-size: 72px; }
.fc-banner.warn { color: #ff9a3d; }
.fc-banner.gold { color: #ffd76a; }
.fc-so { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 8px); right: 18px; background: rgba(7,16,22,.88);
  border: 1px solid rgba(216,255,62,.3); border-radius: 10px; padding: 10px 14px; min-width: 210px; }
.fc-so h4 { margin: 0 0 7px; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; opacity: .8; }
.fc-so .row { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 12px; font-weight: 700; }
.fc-so .dots { display: flex; gap: 4px; }
.fc-so .dot { width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,.14);
  display: inline-flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1; font-weight: 800; }
.fc-so .dot.in { background: #d8ff3e; color: #0b1f1c; box-shadow: 0 0 8px rgba(216,255,62,.6); }
.fc-so .dot.miss { background: #ff3b30; color: #fff; }
.fc-so .dot.cur { outline: 2px solid #7dfcff; }
.fc-lab { position: absolute; top: calc(var(--a3d-bar-space, 44px) + 8px); right: 18px; background: rgba(7,16,22,.88);
  border: 1px solid rgba(125,252,255,.4); border-radius: 10px; padding: 10px 16px; text-align: right; }
.fc-lab h4 { margin: 0 0 4px; font-size: 12px; letter-spacing: .18em; color: #7dfcff; text-transform: uppercase; }
.fc-lab .big { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.fc-lab .sub { font-size: 12px; opacity: .7; letter-spacing: .1em; }
.fc-hidden { display: none !important; }
.fc-prompt { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); padding: 8px 18px; border-radius: 10px;
  font: 700 14px "Whitney", sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #0b1f1c;
  background: linear-gradient(135deg,#d8ff3e,#9be84e); box-shadow: 0 8px 26px rgba(0,0,0,.4); white-space: nowrap; }
.fc-pause { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;
  background: rgba(4,10,14,.45); }
.fc-pause > div { padding: 18px 34px; border-radius: 14px; text-align: center; background: rgba(7,16,22,.92);
  border: 1px solid rgba(216,255,62,.4); }
.fc-pause b { display: block; font-family: "DIN Pro", sans-serif; font-size: 40px; letter-spacing: .16em; color: #f3f0dc; }
.fc-pause span { display: block; margin-top: 6px; font-size: 13px; letter-spacing: .1em; opacity: .8; }
@media (max-width: 760px) { .fc-ticker { bottom: 110px; max-width: 220px; } .fc-bug { top: calc(var(--a3d-bar-space, 44px) + 4px); } .fc-banner { font-size: 30px; white-space: nowrap; } .fc-banner.goal { font-size: 44px; } }
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
  const possL = el("div", "fc-poss-l", possWrap);
  possL.textContent = "POSSESSION";

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
    update(state, ctx) {
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
    }
  };
}

export function clubFor(id: keyof typeof CLUBS | string): ClubSpec {
  return (CLUBS as Record<string, ClubSpec>)[id] ?? CLUBS.aurora;
}
