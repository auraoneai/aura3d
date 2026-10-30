// Aura FC 3D — mode controllers + overlay panels.
//
// Owns the app-level flow: menu orbit, Quick Play, Shootout Lab, Touch Lab,
// the 32-team World Circuit (group → R16 → QF → SF → Final) and the Player
// Studio. Each controller drives the sim via MatchConfig; lab drills and
// circuit progression are ticked from `frame()` once per rendered frame.
// Panels are plain DOM overlays — the 3D world stays in the canvas.

import type { Sim } from "./sim";
import type { MatchConfig, ClubId, VenueId, UserInputFrame, CircuitMatch } from "./types";
import { CLUBS, CLUB_ORDER, VENUES, circuitEntrants, type CircuitEntrant } from "./content";
import { loadSave, persistSave, newCircuit, type FcSave, type CircuitSave, type StudioSave } from "./save";
import { PITCH_HX, PITCH_HZ } from "./dims";
import { makeRng } from "./sim";
import { CELEBRATIONS } from "./locomotion";

export type AppMode = "menu" | "quick" | "demo" | "shootout" | "touch" | "circuit" | "studio";

export interface ModeFrameCtx {
  /** hud context additions a mode wants to surface */
  tag?: string;
  labLabel?: string;
  labScore?: string;
  labBest?: string;
}

export interface Modes {
  readonly mode: AppMode;
  readonly cfg: MatchConfig | null;
  /** touch-lab ring world position for the scene marker */
  readonly labRing: [number, number] | null;
  venue: VenueId;
  save: FcSave;
  studio: StudioSave;
  frame(dt: number, input: UserInputFrame): ModeFrameCtx;
  enterMenu(): void;
  startQuick(opponent?: ClubId): void;
  startDemo(): void;
  startShootoutLab(): void;
  startTouchLab(): void;
  openStudio(): void;
  openCircuit(): void;
  playCircuitMatch(): void;
  /** re-render club colors onto the home squad rigs (studio preview) */
  onKitsChanged?: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ */
/*  Panel CSS                                                          */
/* ------------------------------------------------------------------ */

const panelCss = `
.fc-panel { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  z-index: 50; pointer-events: auto;
  background: radial-gradient(90% 70% at 50% 30%, rgba(10,26,32,.55), rgba(4,10,14,.82));
  backdrop-filter: blur(3px); font-family: "A3G Calibre","Whitney","Graphik",sans-serif; color: #f3f0dc; }
.fc-card { width: min(680px, 92vw); max-height: 84vh; overflow: auto; border-radius: 18px;
  background: linear-gradient(180deg, rgba(10,22,30,.96), rgba(6,12,17,.96));
  border: 1px solid rgba(216,255,62,.32); padding: 26px 30px;
  box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06); }
.fc-card h1 { margin: 0; font-family: "DIN Pro",sans-serif; font-size: 38px;
  letter-spacing: .1em; }
.fc-card h1 .fc3d { color: #d8ff3e; }
.fc-card h2 { margin: 0 0 14px; font-size: 15px; letter-spacing: .2em; text-transform: uppercase; color: #7dfcff; }
.fc-card p.sub { margin: 4px 0 20px; opacity: .75; font-size: 13px; }
.fc-btnrow { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.fc-btn { appearance: none; border: 1px solid rgba(243,240,220,.25); background: rgba(255,255,255,.07);
  color: #f3f0dc; font: 600 14px "Whitney",sans-serif; padding: 11px 20px; border-radius: 10px;
  cursor: pointer; letter-spacing: .04em; transition: transform .12s, background .15s, border-color .15s; }
.fc-btn:hover { transform: translateY(-1px); border-color: #d8ff3e; }
.fc-btn.primary { background: linear-gradient(135deg,#d8ff3e,#9be84e); color: #0b1f1c; border-color: #d8ff3e; }
.fc-btn.cyan { background: linear-gradient(135deg,#7dfcff,#4db8ff); color: #08222b; border-color: #7dfcff; }
.fc-btn.ghost { opacity: .8; }
.fc-clubs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
.fc-clubchip { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 9px;
  border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); cursor: pointer;
  font-size: 12px; font-weight: 600; }
.fc-clubchip.sel { border-color: #d8ff3e; box-shadow: 0 0 0 1px #d8ff3e inset; }
.fc-clubchip i { width: 16px; height: 16px; border-radius: 4px; display: inline-block; }
.fc-swatches { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 16px; }
.fc-sw { width: 30px; height: 30px; border-radius: 8px; border: 2px solid rgba(255,255,255,.2); cursor: pointer; }
.fc-sw.sel { border-color: #fff; box-shadow: 0 0 0 2px #d8ff3e; }
.fc-cel-row { display: flex; gap: 8px; flex-wrap: wrap; }
.fc-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 10px 0; }
.fc-table th, .fc-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.1); }
.fc-table th { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; opacity: .65; }
.fc-badge { display: inline-block; padding: 2px 9px; border-radius: 5px; font-size: 10.5px; font-weight: 700;
  letter-spacing: .1em; }
.fc-badge.win { background: rgba(216,255,62,.2); color: #d8ff3e; }
.fc-badge.loss { background: rgba(255,59,48,.18); color: #ff9a3d; }
.fc-badge.next { background: rgba(125,252,255,.16); color: #7dfcff; }
.fc-result-score { font-family: "DIN Pro",sans-serif; font-size: 58px; font-weight: 800; letter-spacing: .08em;
  margin: 8px 0 4px; }
.fc-kbd { font-family: "Monument Grotesk Mono",monospace; font-size: 11px; opacity: .8; }
.fc-kbd b { color: #d8ff3e; }
@media (prefers-reduced-motion: reduce) { .fc-btn { transition: none; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createModes(deps: {
  sim: Sim;
  host: HTMLElement;
  banner: (text: string, ms?: number, cls?: string) => void;
  ticker: (label: string, severity?: "info" | "success" | "warn") => void;
  celebrate?: () => void;      // confetti etc.
}): Modes {
  const { sim } = deps;
  const save = loadSave();
  // seeded: opponent draws, demo fixtures and Touch Lab rings replay from the same seed (FC-18)
  const rand = makeRng(0x5eed0fc3);
  const applyCelebration = () => sim.setUserCelebration(Math.max(0, CELEBRATIONS.indexOf(save.studio.celebration)));
  applyCelebration();
  let mode: AppMode = "menu";
  let cfg: MatchConfig | null = null;
  let panel: HTMLElement | null = null;
  let endedHandled = false;

  // lab state
  const lab = {
    pensDone: false,
    touchDone: false,
    touchScore: 0, touchT: 45, ring: null as [number, number] | null,
    settle: 0, feedT: 0
  };

  // circuit runtime
  let circuit: CircuitSave | null = save.circuit;
  let entrants: CircuitEntrant[] = [];
  let circuitMatch: CircuitMatch | null = null;

  const persist = () => { save.circuit = circuit; persistSave(save); };

  /* ------------------------- panel plumbing ------------------------- */

  const styleEl = document.createElement("style");
  styleEl.textContent = panelCss;
  document.head.appendChild(styleEl);

  function closePanel() { panel?.remove(); panel = null; }
  function showPanel(build: (card: HTMLElement) => void): HTMLElement {
    closePanel();
    const ov = el("div", "fc-panel", deps.host);
    const card = el("div", "fc-card", ov);
    build(card);
    panel = ov;
    return ov;
  }

  /* ------------------------- studio ------------------------- */

  function studioCard(card: HTMLElement) {
    el("h2", "", card).textContent = "PLAYER STUDIO";
    el("h1", "", card).innerHTML = `KIT YOUR <span class="fc3d">CLUB</span>`;
    el("p", "sub", card).textContent = "Pick your club and your goal celebration. Your club's name leads the scoreboard and your scorers celebrate your way. Your squad always plays in the home red so both sides read apart on the pitch.";

    el("h2", "", card).textContent = "CLUB";
    const grid = el("div", "fc-clubs", card);
    for (const id of CLUB_ORDER) {
      const c = CLUBS[id];
      const chip = el("div", `fc-clubchip${save.studio.club === id ? " sel" : ""}`, grid);
      const sw = el("i", "", chip); sw.style.background = c.primary;
      el("span", "", chip).textContent = c.name;
      chip.title = c.style;
      chip.onclick = () => {
        save.studio.club = id;
        save.studio.primary = c.primary; save.studio.secondary = c.secondary;
        grid.querySelectorAll(".fc-clubchip").forEach((x) => x.classList.remove("sel"));
        chip.classList.add("sel");
        persist(); api.onKitsChanged?.();
      };
    }

    el("h2", "", card).textContent = "CELEBRATION";
    const cels = el("div", "fc-cel-row", card);
    const CEL_NAMES: [string, string][] = [["knee", "Knee Slide"], ["spin", "Aircraft Spin"], ["leap", "Fist-Leap"], ["heart", "Hands Heart"]];
    for (const [id, name] of CEL_NAMES) {
      const b = el("button", `fc-btn ghost${save.studio.celebration === id ? " primary" : ""}`, cels);
      b.textContent = name;
      b.onclick = () => {
        save.studio.celebration = id as StudioSave["celebration"]; persist(); applyCelebration();
        cels.querySelectorAll(".fc-btn").forEach((x) => { x.classList.remove("primary"); });
        b.classList.add("primary");
      };
    }

    const row = el("div", "fc-btnrow", card);
    const back = el("button", "fc-btn primary", row);
    back.textContent = "Done";
    back.onclick = () => { persist(); api.onKitsChanged?.(); api.enterMenu(); };
  }

  /* ------------------------- menu ------------------------- */

  function menuCard(card: HTMLElement) {
    el("h1", "", card).innerHTML = `AURA <span class="fc3d">FC 3D</span>`;
    el("p", "sub", card).textContent = `${CLUBS[save.studio.club].name} · ${VENUES[venueRef.value].label} — five-a-side broadcast football on the Aura3D engine.`;

    const row = el("div", "fc-btnrow", card);
    const mk = (label: string, cls: string, fn: () => void, title = "") => {
      const b = el("button", `fc-btn ${cls}`, row);
      b.textContent = label; b.title = title; b.onclick = fn;
      return b;
    };
    mk("Quick Play", "primary", () => api.startQuick(), "Two 90-second halves vs the CPU");
    mk("Shootout Lab", "cyan", () => api.startShootoutLab(), "Five penalties — beat the keeper");
    mk("Touch Lab", "cyan", () => api.startTouchLab(), "First-touch control drill");
    mk("World Circuit", "", () => api.openCircuit(), "32 teams · groups → knockouts");
    mk("Player Studio", "", () => api.openStudio(), "Club and goal celebration");
    mk("CPU vs CPU Demo", "ghost", () => api.startDemo(), "Watch the sim play itself");
    // FC-11: auto-run is an assist, off by default (with no stick input your player stands; Shift sprints)
    const assistBtn = mk(`Auto-run assist: ${sim.assist ? "on" : "off"}`, "ghost", () => {
      sim.setAssist(!sim.assist);
      assistBtn.textContent = `Auto-run assist: ${sim.assist ? "on" : "off"}`;
    }, "With no stick input, your player chases loose balls and dribbles at goal");

    el("h2", "", card).textContent = "SELECTED CLUB";
    const grid = el("div", "fc-clubs", card);
    for (const id of CLUB_ORDER) {
      const c = CLUBS[id];
      const chip = el("div", `fc-clubchip${save.studio.club === id ? " sel" : ""}`, grid);
      const sw = el("i", "", chip); sw.style.background = c.primary;
      el("span", "", chip).textContent = c.short;
      chip.onclick = () => {
        save.studio.club = id;
        save.studio.primary = c.primary; save.studio.secondary = c.secondary;
        persist(); api.onKitsChanged?.();
        grid.querySelectorAll(".fc-clubchip").forEach((x) => x.classList.remove("sel"));
        chip.classList.add("sel");
        card.querySelector("p.sub")!.textContent = `${c.name} · ${VENUES[venueRef.value].label} — five-a-side broadcast football on the Aura3D engine.`;
      };
    }

    const kbd = el("p", "fc-kbd", card);
    kbd.innerHTML = "Move <b>WASD</b> · Sprint <b>SHIFT</b> · Pass <b>E</b> · Driven <b>R</b> · Shoot <b>SPACE (hold)</b> · Skill <b>J</b>/<b>K</b> · Slide <b>K</b> · Switch <b>Q</b> · Keeper rush <b>SHIFT off-ball</b> · Pause <b>P</b>";
  }

  /* ------------------------- result card ------------------------- */

  function resultCard(opts: { title: string; score: string; sub: string; buttons: [string, string, () => void][] }) {
    showPanel((card) => {
      el("h2", "", card).textContent = "FULL TIME";
      el("h1", "", card).innerHTML = opts.title;
      el("div", "fc-result-score", card).textContent = opts.score;
      el("p", "sub", card).textContent = opts.sub;
      const row = el("div", "fc-btnrow", card);
      for (const [label, cls, fn] of opts.buttons) {
        const b = el("button", `fc-btn ${cls}`, row);
        b.textContent = label; b.onclick = fn;
      }
    });
  }

  /* ------------------------- circuit ------------------------- */

  const STAGE_LABEL: Record<string, string> = {
    group: "GROUP STAGE", r16: "ROUND OF 16", qf: "QUARTER-FINAL", sf: "SEMI-FINAL", final: "THE FINAL", done: "CHAMPIONS"
  };
  const STAGE_VENUE: Record<string, VenueId> = {
    group: "favela", r16: "munich", qf: "kyoto", sf: "lagos", final: "glacier"
  };
  const STAGE_DIFF: Record<string, number> = {
    group: 0.5, r16: 0.62, qf: 0.72, sf: 0.82, final: 0.92
  };

  function startCircuit() {
    entrants = circuitEntrants(save.studio.club);
    circuit = newCircuit(entrants.map((e) => e.name));
    persist();
  }

  function userGroup(): CircuitEntrant[] {
    // user's group = their entrant + next three in bracket order
    return entrants.slice(0, 4);
  }

  function circuitOpponent(): CircuitEntrant | null {
    if (!circuit) return null;
    if (circuit.stage === "group") {
      if (circuit.groupPlayed >= 3) return null;
      return userGroup()[circuit.groupPlayed + 1] ?? null;
    }
    if (circuit.stage === "done") return null;
    // knockout: draw a non-user entrant deterministically by results count
    const pool = entrants.slice(4);
    const i = (circuit.results.length * 7 + circuit.results.filter(r => r.won).length * 3) % pool.length;
    return pool[i];
  }

  function otherResultsFor(): string[] {
    // simulated scorelines for bracket texture — deterministic-ish
    const lines: string[] = [];
    const names = entrants.map((e) => e.short);
    for (let i = 0; i < 6; i++) {
      const a = names[(i * 5 + circuit!.results.length) % names.length];
      const b = names[(i * 7 + 3) % names.length];
      lines.push(`${a} ${1 + ((i * 3 + 1) % 4)}–${(i * 2) % 3} ${b}`);
    }
    return lines;
  }

  function circuitCard(card: HTMLElement) {
    const c = circuit!;
    el("h2", "", card).textContent = "WORLD CIRCUIT";
    el("h1", "", card).innerHTML = `ROAD TO <span class="fc3d">GLACIER</span>`;
    el("p", "sub", card).textContent = "32 teams. Survive the group, win the knockouts, lift it under the aurora.";

    const stage = el("div", "", card);
    stage.innerHTML = `<span class="fc-badge next">${STAGE_LABEL[c.stage] ?? c.stage}</span>`;

    if (c.champion) {
      el("h1", "", card).innerHTML = `<span class="fc3d">CHAMPIONS</span>`;
      el("p", "sub", card).textContent = "The 32-team circuit is yours. Confetti deserved.";
    } else if (!c.alive) {
      el("p", "sub", card).textContent = "Eliminated. The circuit resets — run it back.";
    } else {
      const opp = circuitOpponent();
      el("p", "sub", card).innerHTML = opp
        ? `Next up: <b style="color:#f3f0dc">${opp.name}</b> at ${VENUES[c.venueByStage[c.stage] ?? STAGE_VENUE[c.stage]].label}`
        : "Draw complete.";
    }

    // user results table
    if (c.results.length) {
      const t = el("table", "fc-table", card);
      const head = el("tr", "", t);
      for (const h of ["ROUND", "OPPONENT", "SCORE", ""]) el("th", "", head).textContent = h;
      for (const r of c.results) {
        const rowEl = el("tr", "", t);
        el("td", "", rowEl).textContent = r.round;
        el("td", "", rowEl).textContent = r.opponent;
        el("td", "", rowEl).textContent = r.scoreline;
        el("td", "", rowEl).innerHTML = `<span class="fc-badge ${r.won ? "win" : "loss"}">${r.won ? "WON" : "LOST"}</span>`;
      }
    }

    // group standing line + simulated bracket texture
    if (c.stage === "group") {
      el("p", "sub", card).textContent = `Group ${"ABCDEFGH"[0]} — played ${c.groupPlayed}/3 · ${c.groupPoints} pts · GD ${c.groupGd >= 0 ? "+" : ""}${c.groupGd} (top two advance)`;
    }
    if (c.otherResults.length) {
      const p = el("p", "sub", card);
      p.innerHTML = `<i style="opacity:.6">Elsewhere: ${c.otherResults.join(" · ")}</i>`;
    }

    const row = el("div", "fc-btnrow", card);
    if (!c.champion && c.alive && circuitOpponent()) {
      const play = el("button", "fc-btn primary", row);
      play.textContent = c.stage === "group" ? `Play group match ${c.groupPlayed + 1}` : `Play ${STAGE_LABEL[c.stage].toLowerCase()}`;
      play.onclick = () => api.playCircuitMatch();
    }
    const reset = el("button", "fc-btn ghost", row);
    reset.textContent = "New circuit";
    reset.onclick = () => { startCircuit(); circuitCard(card); };
    const back = el("button", "fc-btn", row);
    back.textContent = "Back";
    back.onclick = () => api.enterMenu();
  }

  function recordCircuitResult() {
    if (!circuit || !circuitMatch) return;
    const s = sim.state;
    const won = s.winner === 0;
    const pens = s.shootout ? ` (${s.shootout.scores[0]}–${s.shootout.scores[1]}p)` : "";
    circuit.results.push({
      round: circuitMatch.stage === "group" ? `G${circuit.groupPlayed + 1}` : STAGE_LABEL[circuitMatch.stage].split(" ")[0],
      opponent: circuitMatch.opponentName,
      scoreline: `${s.score[0]}–${s.score[1]}${pens}`,
      won
    });
    circuit.otherResults = otherResultsFor();

    if (circuitMatch.stage === "group") {
      circuit.groupPlayed++;
      if (won) circuit.groupPoints += 3;
      else if (s.winner === null) circuit.groupPoints += 1;
      circuit.groupGd += s.score[0] - s.score[1];
      if (circuit.groupPlayed >= 3) {
        // advance on 4+ points (top-two proxy)
        if (circuit.groupPoints >= 4) {
          circuit.stage = "r16";
          deps.banner("YOU ADVANCE — ROUND OF 16", 2600, "gold");
        } else {
          circuit.alive = false;
        }
      }
    } else {
      if (won) {
        if (circuitMatch.stage === "final") {
          circuit.stage = "done"; circuit.champion = true;
          deps.celebrate?.();
        } else {
          circuit.stage = circuitMatch.stage === "r16" ? "qf" : circuitMatch.stage === "qf" ? "sf" : "final";
        }
      } else {
        circuit.alive = false;
      }
    }
    persist();
    circuitMatch = null;
  }

  /* ------------------------- touch lab drill ------------------------- */

  function nextRing(px: number, pz: number): [number, number] {
    for (let i = 0; i < 20; i++) {
      const x = -14 + rand() * 28;
      const z = -9 + rand() * 18;
      if (Math.hypot(x - px, z - pz) > 8) return [x, z];
    }
    return [8, 6];
  }

  function feedBall(to: [number, number]) {
    const b = sim.state.ball;
    // feed arrives from the left touchline, lofted to drop in the ring
    b.x = -PITCH_HX + 0.5; b.z = clamp(to[1] + (rand() - 0.5) * 6, -PITCH_HZ + 1, PITCH_HZ - 1); b.y = 0.3;
    const T = clamp(Math.hypot(to[0] - b.x, to[1] - b.z) / 11, 0.7, 1.9);
    b.vx = (to[0] - b.x) / T; b.vz = (to[1] - b.z) / T;
    b.vy = 4.9 * T * 0.7;
    b.mode = "flight"; b.ownerId = null; b.kickerId = null; b.freeT = 0; b.intendedTargetId = null; b.rolling = false;
    lab.feedT = 0;
  }

  function touchFrame(dt: number, ctx: ModeFrameCtx) {
    lab.touchT = Math.max(0, lab.touchT - dt);
    const me = sim.state.players.find((p) => p.id === sim.state.controlledId);
    const b = sim.state.ball;
    if (!lab.ring) lab.ring = nextRing(me?.x ?? 0, me?.z ?? 0);

    const owner = b.ownerId === (me?.id ?? "");
    const inRing = me && Math.hypot(me.x - lab.ring[0], me.z - lab.ring[1]) < 1.35;
    if (owner && inRing) {
      lab.settle += dt;
      if (lab.settle > 0.55) {
        lab.touchScore++;
        lab.settle = 0;
        lab.ring = nextRing(me!.x, me!.z);
        feedBall(lab.ring);
        deps.ticker(`touch ${lab.touchScore} — received in the ring`, "success");
      }
    } else {
      lab.settle = Math.max(0, lab.settle - dt * 2);
    }
    // dead ball with no ring hit → refeed
    lab.feedT += dt;
    if (lab.feedT > 6 && b.mode !== "flight") { feedBall(lab.ring); }
    if (Math.abs(b.x) > PITCH_HX || Math.abs(b.z) > PITCH_HZ) { feedBall(lab.ring); }

    ctx.labLabel = "TOUCH LAB";
    ctx.labScore = `${lab.touchScore}`;
    ctx.labBest = `best ${save.touchBest} · ${Math.ceil(lab.touchT)}s`;

    if (lab.touchT <= 0 && !lab.touchDone) {
      lab.touchDone = true;
      if (lab.touchScore > save.touchBest) { save.touchBest = lab.touchScore; persist(); }
      const sc = lab.touchScore;
      enterMenuSoon(`TOUCH LAB DONE`, `${sc} first-touch receptions`, [
        ["Run it again", "primary", () => api.startTouchLab()],
        ["Menu", "", () => api.enterMenu()]
      ]);
    }
  }

  function shootoutLabFrame(ctx: ModeFrameCtx) {
    const so = sim.state.shootout;
    const taken = so?.taken[sim.state.userTeam ?? 0] ?? 0;
    ctx.labLabel = "SHOOTOUT LAB";
    ctx.labScore = `${so?.scores[sim.state.userTeam ?? 0] ?? 0} / ${Math.max(5, taken)}`;
    ctx.labBest = `best ${save.bestPens}/5`;
    ctx.tag = "WASD aim · hold SPACE · release to strike";

    if (sim.state.phase === "ended" && !lab.pensDone) {
      lab.pensDone = true;
      const scored = sim.state.shootout?.scores[sim.state.userTeam ?? 0] ?? 0;
      if (scored > save.bestPens) { save.bestPens = scored; persist(); }
      enterMenuSoon("SHOOTOUT LAB DONE", `${scored}/5 penalties scored`, [
        ["Five more", "primary", () => api.startShootoutLab()],
        ["Menu", "", () => api.enterMenu()]
      ]);
    }
  }

  /** small helper — shows result panel while leaving the world running behind it */
  function enterMenuSoon(title: string, sub: string, buttons: [string, string, () => void][]) {
    resultCard({ title, score: "", sub, buttons });
  }

  /* ------------------------- quick / demo frame ------------------------- */

  function matchEndFrame() {
    const s = sim.state;
    if (s.phase !== "ended" || endedHandled) return;
    endedHandled = true;
    if (mode === "demo") {
      // demo loops — fresh kickoff keeps capture alive
      window.setTimeout(() => {
        if (mode === "demo") api.startDemo();
      }, 3800);
      return;
    }
    if (mode === "circuit" && circuitMatch) {
      recordCircuitResult();
      const won = sim.state.winner === 0;
      const pens = s.shootout ? ` on pens ${s.shootout.scores[0]}–${s.shootout.scores[1]}` : "";
      resultCard({
        title: won ? "YOU <span class=fc3d>ADVANCE</span>" : circuit?.alive === false ? "ELIMINATED" : "GROUP POINTS",
        score: `${s.score[0]} – ${s.score[1]}`,
        sub: `${circuitMatch === null ? "" : ""}${won ? "Won" : "Lost"}${pens} · World Circuit ${circuit ? STAGE_LABEL[circuit.stage] : ""}`,
        buttons: [
          ["Circuit hub", "primary", () => api.openCircuit()],
          ["Menu", "", () => api.enterMenu()]
        ]
      });
      return;
    }
    if (mode === "quick") {
      const won = s.winner === 0;
      if (s.winner !== null) { won ? save.wins++ : save.losses++; persist(); }
      const pens = s.shootout ? ` · pens ${s.shootout.scores[0]}–${s.shootout.scores[1]}` : "";
      resultCard({
        title: s.winner === null ? "ALL <span class=fc3d>SQUARE</span>" : won ? "YOU <span class=fc3d>WIN</span>" : "FULL <span class=fc3d>TIME</span>",
        score: `${s.score[0]} – ${s.score[1]}`,
        sub: `${CLUBS[cfg?.homeClub ?? "aurora"].name} vs ${CLUBS[cfg?.awayClub ?? "iron"].name}${pens} · record ${save.wins}W–${save.losses}L`,
        buttons: [
          ["Rematch", "primary", () => api.startQuick(cfg?.awayClub)],
          ["Menu", "", () => api.enterMenu()]
        ]
      });
    }
  }

  /* ------------------------- public api ------------------------- */

  const venueRef = { value: save.venue };

  const api: Modes = {
    get mode() { return mode; },
    get cfg() { return cfg; },
    get labRing() { return mode === "touch" ? lab.ring : null; },
    get venue() { return venueRef.value; },
    set venue(v: VenueId) { venueRef.value = v; save.venue = v; persist(); },
    get save() { return save; },
    get studio() { return save.studio; },
    onKitsChanged: undefined,

    frame(dt, _input) {
      const ctx: ModeFrameCtx = {};
      // paused: the lab clocks and drills hold too (only the sim step was gated before, FC-15)
      if (sim.state.paused) dt = 0;
      if (mode === "touch") touchFrame(dt, ctx);
      if (mode === "shootout") shootoutLabFrame(ctx);
      if (mode === "quick" || mode === "demo" || mode === "circuit") matchEndFrame();
      if (circuit && mode === "circuit" && circuitMatch) ctx.tag = `WORLD CIRCUIT · ${STAGE_LABEL[circuitMatch.stage]}`;
      return ctx;
    },

    enterMenu() {
      mode = "menu"; cfg = null; endedHandled = false;
      closePanel();
      sim.spawnIdle();
      showPanel(menuCard);
    },

    startQuick(opponent) {
      closePanel();
      mode = "quick"; endedHandled = false;
      const opp = opponent ?? CLUB_ORDER.filter((c) => c !== save.studio.club)[(rand() * (CLUB_ORDER.length - 1)) | 0];
      cfg = {
        mode: "quick", venue: venueRef.value,
        homeClub: save.studio.club, awayClub: opp,
        userTeam: 0, difficulty: 0.6,
        goldenGoal: true, shootoutOnTie: true
      };
      sim.startMatch(cfg);
      deps.banner(`${CLUBS[cfg.homeClub].name} vs ${CLUBS[opp].name}`, 2400, "gold");
    },

    startDemo() {
      closePanel();
      mode = "demo"; endedHandled = false;
      const [h, a] = [CLUB_ORDER[(rand() * 8) | 0], CLUB_ORDER[(rand() * 8) | 0]];
      const away = a === h ? "iron" : a;
      cfg = {
        mode: "quick", venue: venueRef.value, homeClub: h, awayClub: away,
        userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false
      };
      sim.startMatch(cfg);
      deps.banner(`${CLUBS[h].name} vs ${CLUBS[away].name} — CPU v CPU`, 2400);
    },

    startShootoutLab() {
      closePanel();
      mode = "shootout"; endedHandled = false; lab.pensDone = false;
      cfg = {
        mode: "shootout", venue: venueRef.value,
        homeClub: save.studio.club, awayClub: "iron",
        userTeam: 0, difficulty: 0.6, goldenGoal: false, shootoutOnTie: false
      };
      sim.startMatch({ ...cfg, mode: "quick" });   // spawn squads + kit wiring
      sim.spawnLab("shootout");
      deps.banner("SHOOTOUT LAB — 5 pens", 2200, "gold");
    },

    startTouchLab() {
      closePanel();
      mode = "touch"; endedHandled = false;
      lab.touchDone = false;
      lab.touchScore = 0; lab.touchT = 45; lab.ring = null; lab.settle = 0; lab.feedT = 0;
      cfg = {
        mode: "touch", venue: venueRef.value,
        homeClub: save.studio.club, awayClub: "iron",
        userTeam: 0, difficulty: 0.4, goldenGoal: false, shootoutOnTie: false
      };
      sim.startMatch({ ...cfg, mode: "quick" });
      sim.spawnLab("touch");
      deps.banner("TOUCH LAB — control it in the ring", 2400, "gold");
    },

    openStudio() {
      mode = "studio";
      sim.spawnIdle();
      showPanel(studioCard);
    },

    openCircuit() {
      closePanel();
      mode = "circuit";
      if (!circuit || !circuit.active || circuit.stage === "done" || !circuit.alive) {
        // keep a finished/abandoned run viewable until user resets — but a fresh one is the default
        if (!circuit || !circuit.active) { startCircuit(); }
        else if (!circuit.alive || circuit.champion) { /* show panel; reset is a button */ }
      }
      sim.spawnIdle();
      showPanel(circuitCard);
    },

    playCircuitMatch() {
      if (!circuit || !circuit.active) startCircuit();
      const opp = circuitOpponent();
      if (!opp) return;
      const stage = circuit!.stage === "done" ? "final" : circuit!.stage;
      circuitMatch = {
        stage: stage === "group" ? "group" : stage as CircuitMatch["stage"],
        opponentName: opp.name,
        opponentClub: opp.club ?? CLUB_ORDER[(opp.short.charCodeAt(0) + opp.short.length) % 8],
        difficulty: STAGE_DIFF[stage] + (stage === "group" ? circuit!.groupPlayed * 0.06 : 0),
        mustWin: stage !== "group"
      };
      const venue = circuit!.venueByStage[stage] ?? STAGE_VENUE[stage];
      circuit!.venueByStage[stage] = venue;
      persist();
      closePanel();
      mode = "circuit"; endedHandled = false;
      cfg = {
        mode: "quick", venue,
        homeClub: save.studio.club, awayClub: circuitMatch.opponentClub,
        userTeam: 0, difficulty: circuitMatch.difficulty,
        goldenGoal: true, shootoutOnTie: true,
        circuitTag: `WORLD CIRCUIT · ${STAGE_LABEL[stage]}`
      };
      sim.startMatch(cfg);
      deps.banner(`${STAGE_LABEL[stage]} — vs ${opp.name}`, 2600, "gold");
    }
  };

  return api;
}
