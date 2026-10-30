/**
 * HUD and menus. Every DOM write goes through a change check (audit C20); the beacon and minimap are throttled.
 * C1 results panel with Restart and Change drone, C3 position chip hidden in time trial, C7 lock bracket in pixels
 * with an edge arrow, C15 boot values from the race state, C21 text cues next to colour, A11Y1 boot overlay hidden.
 * GU47 HS-18: a thermal instrument cluster (core temperature readout in degrees C over a soot-amber-slag heat gauge with
 * the 80% haze-ramp and overheat ticks), separate slag-red damage and molten-orange overheat overlays, and the title
 * card hides the race chrome (`body.td-card`). Reduced motion caps the damage overlay and never pulses it.
 */
import { CIRCUITS, DRONE_SPECS, TOTAL_LAPS, type CircuitId, type DroneId, type ModeId } from "./data";
import type { RaceResult, RaceState } from "./sim";

export function formatRaceTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--.-";
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const secs = Math.floor(rem);
  const tenths = Math.floor((rem - secs) * 10);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}.${tenths}`;
}

/** Core temperature shown by the thermal cluster: 300 C cold to 1200 C at 100% heat (display only). */
export const CORE_TEMP = { coldC: 300, hotC: 1200 } as const;
export function coreTemperatureC(heatPercent: number): number {
  const h = Math.min(100, Math.max(0, heatPercent));
  return Math.round(CORE_TEMP.coldC + ((CORE_TEMP.hotC - CORE_TEMP.coldC) * h) / 100);
}

/** Damage overlay peak (slag red), its reduced-motion cap, and the overheat overlay (molten orange). */
export const OVERLAY = { damage: 0.7, damageReduced: 0.4, overheat: 0.8, warnFrom: 72, warnMax: 0.6 } as const;
/** Opacities of the two HS-18 overlays (pure; unit-tested). */
export function overlayOpacities(input: { readonly damageTimer: number; readonly overheated: boolean; readonly heat: number; readonly reducedMotion: boolean }): { damage: number; overheat: number } {
  const damage = input.damageTimer > 0 ? (input.reducedMotion ? OVERLAY.damageReduced : OVERLAY.damage) : 0;
  const overheat = input.overheated ? OVERLAY.overheat : Math.max(0, Math.min(OVERLAY.warnMax, (input.heat - OVERLAY.warnFrom) / 35));
  return { damage, overheat };
}

export interface HudExtra {
  readonly sector: string;
  readonly ghost: number | null;
  readonly lock: { x: number; y: number; offscreen: boolean; name: string; dist: number } | null;
  readonly autopilot: boolean;
  readonly reducedMotion: boolean;
  readonly boosting: boolean;
}

export interface BarCallbacks {
  onDrone(id: DroneId): void;
  onCircuit(id: CircuitId): void;
  onMode(id: ModeId): void;
  onRestart(): void;
  onAutopilot(): void;
  onResultsRestart(): void;
}

export function createHud(doc: Document) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null => doc.getElementById(id) as T | null;
  const el = {
    mode: $("h-mode"), pos: $("h-pos"), posOf: $("h-posof"), posChip: doc.querySelector<HTMLElement>(".pos-chip"),
    lap: $("h-lap"), lapOf: $("h-lapof"), time: $("h-time"), best: $("h-best"),
    elimCard: $("h-elim-card"), elimTime: $("h-elim-time"), elimLast: $("h-elim-last"),
    ghostCard: $("h-ghost-card"), ghostDelta: $("h-ghost-delta"), ghostNote: $("h-ghost-note"),
    hull: $("h-hull"), hullNum: $("h-hull-num"), td: $("h-td"), droneName: $("h-drone-name"), sector: $("h-sector-name"), droneTag: $("h-drone-tag"),
    item: $("h-item"), shock: $("h-shock"), roll: $("h-roll"), mine: $("h-mine"),
    speed: $("h-speed"), ab: $("h-ab"), heat: $("h-heat"), shield: $("h-shield"), gun: $("h-gun"),
    lock: $("lock"), lockLabel: $("lock-label"), incoming: $("incoming"),
    msg: $("msg"), msgText: $("msg-text"), msgSub: $("msg-sub"), banner: $("banner"), hyper: $("hyper-status"),
    autopilot: $("h-autopilot"), speedLines: $("speed-lines"), heatGlaze: $("heat-glaze"), damageGlaze: $("damage-glaze"), core: $("h-core"),
    countdown: $("countdown"), results: $("results"), start: $("start"), boot: $("boot"),
    minimap: $<HTMLCanvasElement>("minimap"), app: $("app"), mute: doc.querySelector<HTMLElement>("[data-touch=mute]")
  };
  const last = new WeakMap<HTMLElement, string>();
  const text = (node: HTMLElement | null, value: string): void => {
    if (!node || last.get(node) === value) return;
    last.set(node, value);
    node.textContent = value;
  };
  const lastStyle = new WeakMap<HTMLElement, Record<string, string>>();
  const style = (node: HTMLElement | null, prop: "width" | "opacity" | "left" | "top" | "display", value: string): void => {
    if (!node) return;
    let seen = lastStyle.get(node);
    if (!seen) { seen = {}; lastStyle.set(node, seen); }
    if (seen[prop] === value) return;
    seen[prop] = value;
    node.style[prop] = value;
  };
  const toggle = (node: HTMLElement | null, cls: string, on: boolean): void => {
    if (node && node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
  };
  const pct = (v: number): string => `${(Math.round(Math.max(0, Math.min(100, v)) * 2) / 2).toFixed(1)}%`;

  let bannerTimer = 0;
  let msgTimer = 0;
  let countdownTimer = 0;
  let minimapTimer = 0;
  let damageTimer = 0;

  const minimapCtx = el.minimap?.getContext("2d") ?? null;
  const sizeMinimap = (): void => {
    if (!el.minimap) return;
    const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    const css = el.minimap.clientWidth || 136;
    const px = Math.round(css * dpr);
    if (el.minimap.width !== px) { el.minimap.width = px; el.minimap.height = px; }
  };
  sizeMinimap();
  globalThis.addEventListener?.("resize", sizeMinimap);

  function drawMinimap(race: RaceState): void {
    if (!minimapCtx || !el.minimap) return;
    const scale = el.minimap.width / 136;
    const ctx = minimapCtx;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, 136, 136);
    const circuit = CIRCUITS[race.circuit];
    const cx = 68, cy = 68;
    const pointFor = (frac: number, lateral = 0): [number, number] => {
      const a = frac * Math.PI * 2 - Math.PI * 0.5;
      const h = circuit.id === "grand" ? Math.sin(a * 3) * 9 + Math.cos(a * 2) * 6 : circuit.id === "dustfall" ? Math.sin(a * 2) * 12 + Math.sin(a * 4) * 5 : Math.cos(a * 3) * 11 + Math.sin(a * 5) * 6;
      const r = 44 + h + lateral * 0.35;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86];
    };
    const frac = (progress: number) => (((progress % circuit.length) + circuit.length) % circuit.length) / circuit.length;
    ctx.strokeStyle = "rgba(244, 242, 236, 0.3)";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    for (let i = 0; i <= 64; i += 1) { const [x, y] = pointFor(i / 64); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "#35d6ff";
    for (const sec of circuit.sectors) { const [x, y] = pointFor(sec.startFrac); ctx.fillRect(x - 2, y - 2, 4, 4); }
    for (const r of race.rivals) {
      if (r.eliminated) continue;
      const [x, y] = pointFor(frac(r.progress), r.x);
      const locked = r.index === race.locked;
      ctx.fillStyle = locked ? "#ffb800" : "#f4f2ec";
      if (locked) ctx.fillRect(x - 3, y - 3, 6, 6); // locked rival: a square, not only a colour
      else { ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2); ctx.fill(); }
    }
    const [ux, uy] = pointFor(frac(race.player.progress), race.player.x);
    ctx.fillStyle = "#ff4d1f";
    ctx.beginPath();
    ctx.moveTo(ux, uy - 5); ctx.lineTo(ux + 4.5, uy + 4); ctx.lineTo(ux - 4.5, uy + 4); ctx.closePath(); // you: a triangle
    ctx.fill();
  }

  function showFor(node: HTMLElement | null, on: boolean): void {
    toggle(node, "show", on);
  }

  const hud = {
    bindBars(cb: BarCallbacks): void {
      const bind = (selector: string, fn: (btn: HTMLButtonElement) => void): void => {
        doc.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
          btn.addEventListener("click", () => { fn(btn); btn.blur(); });
        });
      };
      bind("#drone-bar [data-drone]", (b) => cb.onDrone(b.dataset.drone as DroneId));
      bind("#circuit-bar [data-circuit]", (b) => cb.onCircuit(b.dataset.circuit as CircuitId));
      bind("#mode-bar [data-mode]", (b) => cb.onMode(b.dataset.mode as ModeId));
      bind("#h-restart", () => cb.onRestart());
      bind("#h-autopilot", () => cb.onAutopilot());
      bind("#results-restart", () => cb.onResultsRestart());
      bind("#results-drone", () => toggle($("results-garage"), "open", true));
      bind("#results-garage [data-pick-drone]", (b) => cb.onDrone(b.dataset.pickDrone as DroneId));
    },
    selectDrone(id: DroneId): void {
      doc.querySelectorAll<HTMLButtonElement>("#drone-bar [data-drone]").forEach((b) => toggle(b, "active", b.dataset.drone === id));
      text(el.droneName, DRONE_SPECS[id].name);
      text(el.droneTag, DRONE_SPECS[id].tag);
    },
    selectCircuit(id: CircuitId): void {
      doc.querySelectorAll<HTMLButtonElement>("#circuit-bar [data-circuit]").forEach((b) => toggle(b, "active", b.dataset.circuit === id));
    },
    selectMode(id: ModeId): void {
      doc.querySelectorAll<HTMLButtonElement>("#mode-bar [data-mode]").forEach((b) => toggle(b, "active", b.dataset.mode === id));
    },
    resetRace(race: RaceState): void {
      text(el.mode, race.mode === "race" ? "RACE" : race.mode === "trial" ? "TIME TRIAL" : "ELIMINATION");
      style(el.elimCard, "display", race.mode === "elim" ? "flex" : "none");
      style(el.ghostCard, "display", race.mode === "trial" ? "flex" : "none");
      style(el.posChip, "display", race.mode === "trial" ? "none" : "flex");
      text(el.lapOf, race.mode === "elim" ? "" : `/${TOTAL_LAPS}`);
      text(el.droneName, DRONE_SPECS[race.drone].name);
      text(el.droneTag, DRONE_SPECS[race.drone].tag);
      hud.centerMessage(CIRCUITS[race.circuit].shortName, race.mode === "trial" ? "TIME TRIAL · BEAT YOUR GHOST" : race.mode === "elim" ? "LAST PLACE IS OUT EVERY 20 S" : `${TOTAL_LAPS} LAPS · FINISH AHEAD OF 11 RIVALS`, 2.4);
      toggle(el.lock, "visible", false);
      hud.hideResults();
    },
    countdown(value: string): void {
      text(el.countdown, value);
      showFor(el.countdown, true);
      countdownTimer = value === "GO" ? 0.9 : 1.1;
    },
    centerMessage(big: string, sub: string, seconds = 2): void {
      text(el.msgText, big);
      text(el.msgSub, sub);
      showFor(el.msg, true);
      msgTimer = seconds;
    },
    banner(value: string, seconds = 1.6): void {
      text(el.banner, value);
      showFor(el.banner, true);
      bannerTimer = seconds;
    },
    flashDamage(): void {
      damageTimer = 0.35;
    },
    showStart(touch: boolean): void {
      if (!el.start) return;
      text($("start-how"), touch ? "TAP TO START · STEER ON THE LEFT PAD, FIRE ON THE RIGHT" : "PRESS ENTER OR CLICK TO START · WASD / ARROWS FLY · SPACE FIRE · SHIFT BOOST");
      el.start.hidden = false;
      showFor(el.start, true);
      doc.body.classList.add("td-card");
    },
    hideStart(): void {
      if (!el.start) return;
      showFor(el.start, false);
      el.start.hidden = true;
      doc.body.classList.remove("td-card");
    },
    showResults(result: RaceResult, race: RaceState): void {
      if (!el.results) return;
      const title = result.outcome === "eliminated" ? "ELIMINATED" : result.outcome === "won" ? "LAST DRONE FLYING" : race.mode === "trial" ? "TIME TRIAL COMPLETE" : result.position === 1 ? "VICTORY" : "RACE COMPLETE";
      text($("results-title"), title);
      text($("results-pos"), race.mode === "trial" ? "—" : `P${result.position} / ${result.field}`);
      text($("results-time"), formatRaceTime(result.totalTime));
      text($("results-best"), `${formatRaceTime(result.bestLap)}${result.newBest ? " · NEW BEST" : ""}`);
      text($("results-ko"), String(result.takedowns));
      text($("results-laps"), result.lapTimes.map((t, i) => `L${i + 1} ${formatRaceTime(t)}`).join("   ") || "—");
      toggle($("results-garage"), "open", false);
      el.results.hidden = false;
      showFor(el.results, true);
      toggle(el.lock, "visible", false);
      showFor(el.incoming, false);
    },
    hideResults(): void {
      if (!el.results) return;
      showFor(el.results, false);
      el.results.hidden = true;
    },
    setAutopilot(on: boolean): void {
      text(el.autopilot, on ? "AI DEMO FLIGHT: ON" : "PILOT CONTROL: MANUAL");
      toggle(el.autopilot, "manual", !on);
      const auto = doc.querySelector<HTMLElement>("[data-touch=auto]");
      toggle(auto, "on", on);
      text(auto, on ? "AUTO ON" : "AUTO");
    },
    setMuted(muted: boolean): void {
      text(el.mute, muted ? "MUTED" : "SOUND");
      toggle(el.mute, "on", muted);
    },
    bootDone(): void {
      const boot = el.boot;
      if (!boot) return;
      boot.classList.add("done");
      boot.setAttribute("aria-hidden", "true");
      // A11Y1: out of the accessibility tree and the tab order once the fade ends.
      setTimeout(() => { boot.hidden = true; }, 300);
    },
    bootFailed(message: string): void {
      const boot = el.boot;
      if (!boot) return;
      boot.classList.remove("done");
      boot.hidden = false;
      boot.removeAttribute("aria-hidden");
      boot.textContent = `THERMAL DRIFT COULD NOT START · ${message.slice(0, 160)}`;
    },
    frame(race: RaceState, extra: HudExtra, dt: number): void {
      const p = race.player;
      if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) showFor(el.banner, false);
      if (msgTimer > 0 && (msgTimer -= dt) <= 0) showFor(el.msg, false);
      if (countdownTimer > 0 && (countdownTimer -= dt) <= 0) showFor(el.countdown, false);
      damageTimer = Math.max(0, damageTimer - dt);

      text(el.pos, String(race.position));
      text(el.posOf, `/${race.field}`);
      text(el.lap, String(race.mode === "elim" ? race.lapsDone + 1 : Math.min(TOTAL_LAPS, race.lapsDone + 1)));
      // After the finish the lap clock would read 0:00.0; keep the last lap's time behind the results panel.
      text(el.time, formatRaceTime(race.phase === "countdown" ? 0 : race.phase === "results" ? (race.lapTimes[race.lapTimes.length - 1] ?? 0) : race.time - race.lapStartTime));
      text(el.best, formatRaceTime(race.bestLap));
      text(el.td, String(race.takedowns));
      text(el.sector, extra.sector);
      style(el.hull, "width", pct(p.hull));
      toggle(el.hull, "warn", p.hull < 55 && p.hull >= 28);
      toggle(el.hull, "crit", p.hull < 28);
      text(el.hullNum, p.respawn > 0 ? "DOWN" : p.hull < 28 ? `▲${Math.ceil(p.hull)}` : String(Math.ceil(p.hull)));
      text(el.speed, String(Math.round(p.speedKmh)));
      style(el.ab, "width", pct(p.ab));
      style(el.heat, "width", pct(p.heat));
      toggle(el.heat, "overheat", p.overheated);
      text(el.core, String(coreTemperatureC(p.heat)));
      toggle(el.core, "hot", p.heat >= 80);
      style(el.shield, "width", pct(p.shield));
      style(el.gun, "width", pct(p.gun));
      text(el.item, p.item ?? "— NONE —");
      toggle(el.item, "empty", !p.item);
      const pill = (node: HTMLElement | null, key: string, label: string, cd: number): void => {
        toggle(node, "cooling", cd > 0);
        if (!node) return;
        const value = cd > 0 ? `${Math.ceil(cd)}S` : label;
        if (last.get(node) === value) return;
        last.set(node, value);
        node.innerHTML = `<b>${key}</b>${value}`;
      };
      pill(el.shock, "Q", "SHOCK", p.shockCooldown);
      pill(el.roll, "R", "BARREL", p.rollCooldown);
      pill(el.mine, "C", "MINE", p.mineCooldown);
      showFor(el.hyper, p.hyper > 0);
      showFor(el.incoming, race.incoming.active && race.phase === "racing");
      if (race.mode === "elim") {
        text(el.elimTime, `${Math.max(0, race.elimTimer).toFixed(1)}s`);
        text(el.elimLast, race.lastEliminated);
      }
      if (race.mode === "trial") {
        const g = extra.ghost;
        text(el.ghostDelta, g === null ? "—" : `${g >= 0 ? "+" : "−"}${Math.abs(g).toFixed(2)}s`);
        text(el.ghostNote, race.ghost === null ? "NO GHOST YET · SET A LAP" : g === null ? "GHOST READY" : g <= 0 ? "▼ AHEAD OF BEST LAP" : "▲ BEHIND BEST LAP");
      }
      const speedAlpha = extra.reducedMotion ? 0 : Math.max(0, Math.min(0.85, (p.speedKmh - 560) / 240));
      style(el.speedLines, "opacity", speedAlpha.toFixed(2));
      const overlays = overlayOpacities({ damageTimer, overheated: p.overheated, heat: p.heat, reducedMotion: extra.reducedMotion });
      style(el.damageGlaze, "opacity", overlays.damage.toFixed(2));
      style(el.heatGlaze, "opacity", overlays.overheat.toFixed(2));

      // Lock bracket: placed in pixels from the real projection; clamped to the edge with an arrow when off-screen.
      if (el.lock) {
        const lock = race.phase === "racing" ? extra.lock : null;
        toggle(el.lock, "visible", lock !== null);
        if (lock) {
          const rect = el.app?.getBoundingClientRect();
          const w = rect?.width ?? globalThis.innerWidth, h = rect?.height ?? globalThis.innerHeight;
          style(el.lock, "left", `${Math.round((rect?.left ?? 0) + lock.x * w)}px`);
          style(el.lock, "top", `${Math.round((rect?.top ?? 0) + lock.y * h)}px`);
          toggle(el.lock, "offscreen", lock.offscreen);
          text(el.lockLabel, `◆ LOCK · ${lock.name.toUpperCase()} · ${lock.dist}M`);
        }
      }
      minimapTimer -= dt;
      if (minimapTimer <= 0) { minimapTimer = 0.1; drawMinimap(race); }
    }
  };
  return hud;
}

export type Hud = ReturnType<typeof createHud>;
