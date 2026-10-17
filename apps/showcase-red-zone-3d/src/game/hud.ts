/**
 * Red Zone 3D — DOM HUD: broadcast scorebug, down & distance, field bar,
 * play-card sheet, lab tracker, ticker, big calls, and the venue banner.
 */
import { FIELD, type Club, type GameState, type PlayDef, type Stadium } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const ord = (n: number) => (n === 1 ? "1ST" : n === 2 ? "2ND" : n === 3 ? "3RD" : `${n}TH`);
const fmtClock = (t: number, ot: boolean) => {
  if (ot) return `OT ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const fmtYard = (z: number) => {
  const y = Math.max(0, Math.min(100, Math.round(z)));
  return y <= 50 ? `${y}` : `${100 - y}`;
};

export interface HudRefs {
  root: HTMLElement;
  awayAbbr: HTMLElement; awayDot: HTMLElement; awayPoss: HTMLElement; awayScore: HTMLElement;
  homeAbbr: HTMLElement; homeDot: HTMLElement; homePoss: HTMLElement; homeScore: HTMLElement;
  quarter: HTMLElement; clock: HTMLElement; dd: HTMLElement; ballOn: HTMLElement;
  labHud: HTMLElement; sheet: HTMLElement;
  fbLos: HTMLElement; fbTogo: HTMLElement; fbBall: HTMLElement;
  announce: HTMLElement;
  banner: HTMLElement; bigCall: HTMLElement; ticker: HTMLElement;
}

export function createHud(): HudRefs {
  return {
    root: $<HTMLElement>("rz-hud")!,
    awayAbbr: $("hud-away-abbr")!, awayDot: $("hud-away-dot")!, awayPoss: $("hud-away-poss")!, awayScore: $("hud-away-score")!,
    homeAbbr: $("hud-home-abbr")!, homeDot: $("hud-home-dot")!, homePoss: $("hud-home-poss")!, homeScore: $("hud-home-score")!,
    quarter: $("hud-quarter")!, clock: $("hud-clock")!,
    dd: $("hud-dd")!, ballOn: $("hud-ballon")!,
    labHud: $("rz-lab-hud")!, sheet: $("rz-playcard-sheet")!,
    fbLos: $("fb-los")!, fbTogo: $("fb-togo")!, fbBall: $("fb-ball")!,
    announce: $("hud-announcement")!,
    banner: $("rz-venue-banner")!, bigCall: $("rz-big-call")!, ticker: $("rz-event-ticker")!
  };
}

let bannerUntil = 0;
let bigCallUntil = 0;
let lastAnnounce = "";

export function showHud(hud: HudRefs, on: boolean) {
  hud.root.classList.toggle("hidden", !on);
}

export function banner(hud: HudRefs, text: string, seconds = 2.6) {
  hud.banner.textContent = text;
  hud.banner.classList.remove("hidden");
  bannerUntil = performance.now() / 1000 + seconds;
}

export function bigCall(hud: HudRefs, text: string, seconds = 2.1) {
  hud.bigCall.textContent = text;
  hud.bigCall.classList.add("show");
  bigCallUntil = performance.now() / 1000 + seconds;
  hud.announce.textContent = text;
}

export function ticker(hud: HudRefs, label: string, severity: "info" | "success" | "warn" = "info") {
  const item = document.createElement("span");
  item.className = `rz-tick rz-tick-${severity}`;
  item.textContent = label;
  hud.ticker.prepend(item);
  while (hud.ticker.children.length > 5) hud.ticker.lastElementChild?.remove();
  requestAnimationFrame(() => item.classList.add("show"));
}

/** Route-diagram mini-SVG for a play card. */
function cardDiagram(def: PlayDef): string {
  const W = 100, H = 60, losY = H - 10;
  let inner = `<line x1="0" y1="${losY}" x2="${W}" y2="${losY}" stroke="rgba(255,255,255,.5)" stroke-width="1.4"/>`;
  inner += `<circle cx="${W / 2}" cy="${losY + 5}" r="3.2" fill="#f6c945"/>`;
  if (def.type === "run" && def.runPath) {
    const pts = def.runPath.map(([dx, dz]) => `${W / 2 + dx * 3.1},${losY - 5 - dz * 4.6}`).join(" L");
    inner += `<path d="M ${pts}" stroke="#ffb224" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    const last = def.runPath[def.runPath.length - 1]!;
    inner += `<path d="M ${W / 2 + last[0] * 3.1 - 2},${losY - 5 - last[1] * 4.6 + 3} l 4,-5" stroke="#ffb224" stroke-width="2"/>`;
  } else if (def.routes) {
    const colors = ["#7dfcff", "#ff7ab8", "#d8ff3e", "#ffb224"];
    const alignments: Record<string, number> = { wl: 14, sl: 34, sr: 66, wr: 86, rb: 54, c: 50 };
    let k = 0;
    for (const [slot, route] of Object.entries(def.routes)) {
      const ax = alignments[slot] ?? 50;
      const pts = route.stem.map(([dx, dz]) => `${ax + dx * 2.6},${losY - 2 - dz * 4.2}`).join(" L");
      inner += `<path d="M ${ax},${losY - 2} L ${pts}" stroke="${colors[k % 4]}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      k++;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${inner}</svg>`;
}

export function renderPlayCards(hud: HudRefs, sheet: readonly PlayDef[], selected: number, visible: boolean) {
  if (!visible) { hud.sheet.classList.add("hidden"); return; }
  hud.sheet.classList.remove("hidden");
  hud.sheet.innerHTML = sheet.map((def, i) => `
    <div class="rz-card ${i === selected ? "selected" : ""}" data-card="${i}" role="button" tabindex="0" aria-label="Play ${i + 1}: ${def.name}">
      <div class="rz-card-type ${def.type}">${def.type === "run" ? "■ RUN" : def.type === "short" ? "◆ SHORT PASS" : "▲ DEEP SHOT"}</div>
      <div class="rz-card-name">${def.name}</div>
      ${cardDiagram(def)}
      <div class="rz-card-key">press <b>${i + 1}</b></div>
    </div>`).join("");
  for (const el of hud.sheet.querySelectorAll<HTMLElement>(".rz-card")) {
    el.onclick = () => el.dispatchEvent(new CustomEvent("rz-pick-card", { detail: Number(el.dataset.card), bubbles: true }));
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") el.click(); };
  }
}

export function updateHud(hud: HudRefs, s: GameState) {
  const now = performance.now() / 1000;
  if (bannerUntil && now > bannerUntil) { hud.banner.classList.add("hidden"); bannerUntil = 0; }
  if (bigCallUntil && now > bigCallUntil) { hud.bigCall.classList.remove("show"); bigCallUntil = 0; }

  hud.awayAbbr.textContent = s.cpuTeam?.abbr ?? "";
  hud.awayDot.style.background = s.cpuTeam?.colors?.primary ?? "transparent";
  hud.awayScore.textContent = String(s.score.away);
  hud.homeAbbr.textContent = s.userTeam?.abbr ?? "";
  hud.homeDot.style.background = s.userTeam?.colors?.primary ?? "transparent";
  hud.homeScore.textContent = String(s.score.home);
  hud.homePoss.hidden = s.possession !== "user";
  hud.awayPoss.hidden = s.possession !== "cpu";
  hud.quarter.textContent = s.ot ? "OT" : `Q${s.quarter}`;
  hud.clock.textContent = fmtClock(s.clock, s.ot);

  const lab = s.mode === "routelab" || s.mode === "tacklelab";
  hud.labHud.classList.toggle("hidden", !lab);
  if (lab && s.labScore) {
    hud.labHud.innerHTML = s.mode === "routelab"
      ? `ROUTE LAB — REP <b>${s.labScore.rep}/${s.labScore.reps}</b> · MADE <b>${s.labScore.made}</b> · DIMES <b>${s.labScore.perfect}</b>${s.labScore.grade !== "—" ? ` · GRADE <b>${s.labScore.grade}</b>` : ""}`
      : `TACKLE LAB — REP <b>${s.labScore.rep}/${s.labScore.reps}</b> · BEST <b>${s.labScore.perfect === 99 ? "—" : s.labScore.perfect}Y</b>${s.labScore.grade !== "—" ? ` · GRADE <b>${s.labScore.grade}</b>` : ""}`;
  }

  const pat = s.phase === "patChoice";
  const dd = $<HTMLElement>("rz-downdistance");
  if (dd) dd.classList.toggle("pat", pat);
  if (pat) {
    hud.dd.textContent = "1 XP / 2 CONV";
    hud.ballOn.textContent = "PRESS 1 OR 2";
  } else if (s.mode === "tacklelab") {
    hud.dd.textContent = "OPEN FIELD";
    hud.ballOn.textContent = "RUN HIM DOWN";
  } else if (s.mode === "routelab") {
    hud.dd.textContent = "TIMING THROWS";
    hud.ballOn.textContent = `BALL ON ${fmtYard(s.los)}`;
  } else {
    const goalToGo = s.dir === 1 ? s.toGo >= FIELD.GOAL_FAR - s.los - 0.01 : s.toGo >= s.los - 0.01;
    hud.dd.textContent = `${ord(s.down)} & ${goalToGo ? "GOAL" : Math.ceil(s.toGo)}`;
    hud.ballOn.textContent = `BALL ON ${fmtYard(s.los)}${s.possession === "cpu" ? " · CPU BALL" : ""}`;
  }

  // field strip markers — left = own goal (0), right = attack goal (100) in absolute z
  hud.fbLos.style.left = `${s.los}%`;
  hud.fbTogo.style.left = `${Math.max(0, Math.min(100, s.firstDownLine))}%`;
  hud.fbBall.style.left = `${Math.max(0, Math.min(100, s.ball.z))}%`;

  // accessibility announcements for big moments
  if (s.lastCall && s.lastCall !== lastAnnounce) {
    lastAnnounce = s.lastCall;
    hud.announce.textContent = s.lastCall;
  }
}

export function updateVenueBanner(hud: HudRefs, stadium: Stadium) {
  banner(hud, `${stadium.label} — RED ZONE 3D`);
}

export function updateTeamsHud(hud: HudRefs, user: Club, cpu: Club) {
  hud.homeAbbr.textContent = user.abbr;
  hud.homeDot.style.background = user.colors.primary;
  hud.awayAbbr.textContent = cpu.abbr;
  hud.awayDot.style.background = cpu.colors.primary;
}
