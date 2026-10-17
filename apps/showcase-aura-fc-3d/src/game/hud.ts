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
}

export interface Hud {
  readonly root: HTMLElement;
  update(state: MatchState, ctx: HudContext): void;
  ticker(ev: SimEvent): void;
  banner(text: string, ms?: number, cls?: string): void;
  setVisible(on: boolean): void;
}

const css = `
.fc-hud { position: fixed; inset: 0; pointer-events: none; z-index: 30;
  font-family: "Whitney", "Graphik", system-ui, sans-serif; color: #f3f0dc; }
.fc-hud * { box-sizing: border-box; }
.fc-bug { position: absolute; top: 56px; left: 18px; display: flex; align-items: stretch;
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
.fc-bug .half { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; opacity: .75; }
.fc-tag { position: absolute; top: 106px; left: 18px; padding: 3px 10px; font-size: 10.5px;
  letter-spacing: .16em; font-weight: 700; color: #0b1f1c; background: linear-gradient(135deg,#d8ff3e,#9be84e);
  border-radius: 6px; }
.fc-poss { position: absolute; top: 98px; left: 18px; width: 170px; height: 6px; border-radius: 3px;
  background: rgba(255,255,255,.12); overflow: hidden; display: flex; }
.fc-poss > i { display: block; height: 100%; transition: width .4s; }
.fc-poss-l { font-size: 9px; letter-spacing: .12em; opacity: .6; margin-top: 2px; }
.fc-poss-wrap { position: absolute; top: 96px; left: 18px; }
.fc-stamina { position: absolute; bottom: 84px; left: 50%; transform: translateX(-50%);
  width: 150px; height: 7px; border-radius: 4px; background: rgba(0,0,0,.5);
  border: 1px solid rgba(255,255,255,.18); overflow: hidden; }
.fc-stamina > i { display: block; height: 100%; background: linear-gradient(90deg,#7dfcff,#d8ff3e);
  transition: width .12s linear; }
.fc-stamina-l { text-align: center; font-size: 9px; letter-spacing: .18em; opacity: .7; margin-top: 3px; }
.fc-charge { position: absolute; bottom: 108px; left: 50%; transform: translateX(-50%);
  width: 190px; height: 11px; border-radius: 6px; background: rgba(0,0,0,.55);
  border: 1px solid rgba(216,255,62,.45); overflow: hidden; }
.fc-charge > i { display: block; height: 100%; background: linear-gradient(90deg,#d8ff3e,#ffd76a,#ff9a3d); }
.fc-charge-l { text-align: center; font-size: 9.5px; letter-spacing: .22em; color: #d8ff3e; margin-top: 3px; font-weight: 700; }
.fc-ticker { position: absolute; left: 18px; bottom: 46px; display: flex; flex-direction: column;
  gap: 4px; max-width: 330px; }
.fc-tick { font-family: "Monument Grotesk Mono", monospace; font-size: 10.5px; letter-spacing: .03em;
  color: #cfd6c8; background: rgba(7,16,22,.74); border-left: 2px solid rgba(216,255,62,.5);
  padding: 3px 10px; border-radius: 3px; opacity: 0; transform: translateX(-8px);
  transition: opacity .25s, transform .25s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-tick.show { opacity: .93; transform: translateX(0); }
.fc-tick-warn { border-left-color: #ff3b30; color: #ffb3ac; }
.fc-tick-success { border-left-color: #d8ff3e; color: #e8f5c0; }
.fc-banner { position: absolute; top: 34%; left: 50%; transform: translate(-50%,-50%) scale(.9);
  font-family: "DIN Pro", "Arial Black", sans-serif; font-weight: 800; font-size: 54px;
  letter-spacing: .12em; text-transform: uppercase; color: #f3f0dc; text-align: center;
  text-shadow: 0 4px 30px rgba(0,0,0,.7), 0 0 60px rgba(216,255,62,.3);
  opacity: 0; transition: opacity .2s, transform .3s cubic-bezier(.2,.9,.3,1.4); pointer-events: none; }
.fc-banner.show { opacity: 1; transform: translate(-50%,-50%) scale(1); }
.fc-banner.goal { color: #d8ff3e; font-size: 72px; }
.fc-banner.warn { color: #ff9a3d; }
.fc-banner.gold { color: #ffd76a; }
.fc-so { position: absolute; top: 56px; right: 18px; background: rgba(7,16,22,.88);
  border: 1px solid rgba(216,255,62,.3); border-radius: 10px; padding: 10px 14px; min-width: 210px; }
.fc-so h4 { margin: 0 0 7px; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; opacity: .8; }
.fc-so .row { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 12px; font-weight: 700; }
.fc-so .dots { display: flex; gap: 4px; }
.fc-so .dot { width: 11px; height: 11px; border-radius: 50%; background: rgba(255,255,255,.14); }
.fc-so .dot.in { background: #d8ff3e; box-shadow: 0 0 8px rgba(216,255,62,.6); }
.fc-so .dot.miss { background: #ff3b30; }
.fc-so .dot.cur { outline: 2px solid #7dfcff; }
.fc-lab { position: absolute; top: 56px; right: 18px; background: rgba(7,16,22,.88);
  border: 1px solid rgba(125,252,255,.4); border-radius: 10px; padding: 10px 16px; text-align: right; }
.fc-lab h4 { margin: 0 0 4px; font-size: 11px; letter-spacing: .18em; color: #7dfcff; text-transform: uppercase; }
.fc-lab .big { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.fc-lab .sub { font-size: 10px; opacity: .7; letter-spacing: .1em; }
.fc-hidden { display: none !important; }
@media (max-width: 760px) { .fc-ticker { bottom: 110px; max-width: 220px; } .fc-bug { top: 52px; } }
@media (prefers-reduced-motion: reduce) { .fc-banner, .fc-tick { transition: none; } }
`;

function el(tag: string, cls?: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
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

  // lab card
  const lab = el("div", "fc-lab fc-hidden", root);
  const labTitle = el("h4", "", lab);
  const labBig = el("div", "big", lab);
  const labSub = el("div", "sub", lab);

  let bannerTimer = 0;

  const fmtClock = (state: MatchState): string => {
    if (state.half === 3) return `ET ${Math.floor(state.clock)}″`;
    const base = state.half === 2 ? 90 : 0;
    const t = base + Math.floor(state.clock);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };

  return {
    root,
    setVisible(on) { root.classList.toggle("fc-hidden", !on); },
    banner(text, ms = 2200, cls = "") {
      bannerEl.textContent = text;
      bannerEl.className = `fc-banner show ${cls}`;
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => { bannerEl.className = "fc-banner"; }, ms);
    },
    ticker(ev) {
      const item = el("span", `fc-tick fc-tick-${ev.severity ?? "info"}`);
      item.textContent = ev.label;
      ticker.prepend(item);
      requestAnimationFrame(() => item.classList.add("show"));
      while (ticker.children.length > 5) ticker.lastElementChild?.remove();
      window.setTimeout(() => { item.classList.remove("show"); window.setTimeout(() => item.remove(), 300); }, 5200);
    },
    update(state, ctx) {
      homeName.textContent = ctx.home.short;
      awayName.textContent = ctx.away.short;
      homeKit.style.background = ctx.home.primary;
      awayKit.style.background = ctx.away.primary;
      scoreEl.textContent = `${state.score[0]} – ${state.score[1]}`;
      clockEl.textContent = state.mode === "shootout" ? "PENS" : fmtClock(state);
      halfEl.textContent = state.half === 3 ? "golden goal" : describePhase(state);

      tagEl.classList.toggle("fc-hidden", !ctx.tag);
      if (ctx.tag) tagEl.textContent = ctx.tag;

      // possession split
      const tot = state.possession[0] + state.possession[1];
      const hPct = tot > 0 ? Math.round((state.possession[0] / tot) * 100) : 50;
      possH.style.width = `${hPct}%`; possH.style.background = ctx.home.primary;
      possA.style.width = `${100 - hPct}%`; possA.style.background = ctx.away.primary;

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
        const paintRow = (elc: HTMLElement, team: 0 | 1) => {
          elc.innerHTML = "";
          for (let i = 0; i < Math.max(5, s.taken[team]); i++) {
            const d = document.createElement("span");
            d.className = "dot";
            if (i < s.taken[team]) d.classList.add(i < s.scores[team] ? "in" : "miss");
            if (i === s.taken[team] && s.takerTeam === team && s.stage !== "done") d.classList.add("cur");
            elc.appendChild(d);
          }
        };
        paintRow(soHomeDots, 0);
        paintRow(soAwayDots, 1);
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
