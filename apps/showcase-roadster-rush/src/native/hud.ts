import type { InputKey } from "./constants";
import type { GameHud } from "./game";
import {
  AIR_LOW,
  CONTROL_ICONS,
  HUD_ICONS,
  airRungsLit,
  clusterMarkup,
  engineTelemetry,
  formatRunClock,
  speedoPercent,
  type HudIconKey
} from "./hudCluster";

export interface HudCallbacks {
  onStart?(): void;
  onPause?(): void;
  onResume?(): void;
  onRetry?(): void;
  onToggleMute?(): boolean;
  onInject?(action: InputKey, down: boolean): void;
}

const POWERUP_NAMES: Record<string, string> = { rocket: "rocket", shield: "shield", magnet: "magnet", multiplier: "×2" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

/** DOM heads-up display for Apex Overdrive: telemetry cluster, air ladder, power-ups, trick popups, pause/wreck cards, touch pads. */
export class RoadsterHud implements GameHud {
  private root: HTMLElement;
  private cb: HudCallbacks;
  private scoreEl!: HTMLElement;
  private distEl!: HTMLElement;
  private multEl!: HTMLElement;
  private comboFill!: HTMLElement;
  /** GU47 AO-H2: the AIR ladder rungs (bottom first) and the speedometer's value arc. */
  private rungs: HTMLElement[] = [];
  private gaugeValue!: Element;
  private lastRungs = -1;
  private airWrap!: HTMLElement;
  private boltsEl!: HTMLElement;
  private puWrap!: HTMLElement;
  private popWrap!: HTMLElement;
  private objectiveEl!: HTMLElement;
  private objectiveTimer: ReturnType<typeof setTimeout> | null = null;
  private pause!: HTMLElement;
  private over!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private title!: HTMLElement;
  private speedEl!: HTMLElement;
  private gearEl!: HTMLElement;
  private rpmEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private mileFill!: HTMLElement;
  private mileLabel!: HTMLElement;
  private srEl!: HTMLElement;
  private srPending = "";
  private srTimer: ReturnType<typeof setTimeout> | null = null;
  private srLast = 0;
  private touchy = false;
  private pu = new Map<string, { node: HTMLElement; bar: HTMLElement }>();
  private last = { score: -1, dist: -1, bolts: -1, mult: -1, speed: -1, mile: -1, gear: -1, rpm: -1, tenths: -1 };
  private runStartedMs = 0;
  private popups = 0;

  constructor(root: HTMLElement, callbacks: HudCallbacks = {}) {
    this.root = root;
    this.cb = callbacks;
    this.build();
  }

  private build(): void {
    const root = this.root;
    root.innerHTML = "";
    root.classList.add("rr-hud");
    this.touchy = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    const run = el(
      "div",
      "rr-run",
      `<div class="rr-left">
        <div class="rr-card rr-score-card">
          <div class="rr-head"><span class="rr-micro">score</span><span class="rr-mult">×1</span></div>
          <div class="rr-score">0</div>
          <div class="rr-sub"><span class="rr-dist">0</span><span class="rr-micro">m</span></div>
          <div class="rr-combo"><i></i></div>
          ${clusterMarkup()}
          <div class="rr-mile"><span class="rr-micro">next</span><span class="rr-mile-label rr-micro">1 km</span><div class="rr-mile-track"><div class="rr-mile-fill"></div></div></div>
        </div>
        <div class="rr-powerups"></div>
      </div>
      <div class="rr-objective rr-hidden" aria-hidden="true">hit carrier ramps · collect bolts · survive sky traffic</div>
      <div class="rr-popups" aria-hidden="true"></div>
      <div class="rr-sr" role="status" aria-live="polite"></div>`
    );
    root.appendChild(run);
    this.scoreEl = run.querySelector(".rr-score")!;
    this.distEl = run.querySelector(".rr-dist")!;
    this.multEl = run.querySelector(".rr-mult")!;
    this.comboFill = run.querySelector(".rr-combo i")!;
    this.airWrap = run.querySelector(".rr-air")!;
    this.rungs = Array.from(run.querySelectorAll<HTMLElement>(".rr-rung"));
    this.gaugeValue = run.querySelector(".rr-gauge-value")!;
    this.puWrap = run.querySelector(".rr-powerups")!;
    this.objectiveEl = run.querySelector(".rr-objective")!;
    this.popWrap = run.querySelector(".rr-popups")!;
    this.srEl = run.querySelector(".rr-sr")!;
    this.speedEl = run.querySelector(".rr-speed")!;
    this.gearEl = run.querySelector(".rr-gear-val")!;
    this.rpmEl = run.querySelector(".rr-rpm-val")!;
    this.timeEl = run.querySelector(".rr-time-val")!;
    this.mileFill = run.querySelector(".rr-mile-fill")!;
    this.mileLabel = run.querySelector(".rr-mile-label")!;

    const right = el("div", "rr-right");
    const pauseBtn = el("button", "rr-icon-btn", CONTROL_ICONS.pause);
    pauseBtn.type = "button";
    pauseBtn.setAttribute("aria-label", "Pause game");
    pauseBtn.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      this.cb.onPause?.();
    });
    this.muteBtn = el("button", "rr-icon-btn", CONTROL_ICONS.soundOn);
    this.muteBtn.type = "button";
    this.muteBtn.setAttribute("aria-label", "Toggle sound");
    this.muteBtn.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      this.setMuted(this.cb.onToggleMute ? this.cb.onToggleMute() : false);
    });
    const bolts = el("div", "rr-card rr-bolts", `<span class="rr-micro">bolts</span><b class="rr-bolts-value">0</b>`);
    this.boltsEl = bolts.querySelector(".rr-bolts-value")!;
    right.append(pauseBtn, this.muteBtn, bolts);
    root.appendChild(right);

    const controls = this.touchy
      ? `<li><b>Steer L / R</b> weave through highway traffic</li><li><b>Fly</b> hold to hop and ride the sky lane</li><li><b>Roll L / R</b> cold-gas barrel roll dodges threats</li><li><b>Boost</b> overdrive surge · <b>Dive</b> slam to deck</li>`
      : `<li><b>A / D</b> or arrows: weave across 5 highway lanes</li><li><b>Space</b> or <b>W</b>: hop onto truck roofs, hold to fly</li><li><b>Q / E</b>: cold-gas barrel roll dodges threats</li><li><b>Shift</b> boost, <b>S</b> dive, <b>P</b> pause</li>`;
    this.title = el(
      "div",
      "rr-layer rr-title rr-hidden",
      `<div class="rr-card rr-dialog rr-title-card">
        <div class="rr-kicker">sunset sky-lane interceptor</div>
        <h2>Apex Overdrive</h2>
        <p>Weave through coastal sunset traffic, launch off carrier ramps and fly the elevated sky lane on cold-gas thrusters. Every metre scores; bolts and stunts build your multiplier.</p>
        <ul class="rr-controls">${controls}</ul>
        <div class="rr-best title-best"></div>
        <button type="button" class="rr-btn title-start">Launch Run</button>
        <small>${this.touchy ? "Tap anywhere to launch" : "Press Space or Enter to launch"}</small>
      </div>`
    );
    const start = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onStart?.();
    };
    this.title.addEventListener("click", start);
    root.appendChild(this.title);

    this.pause = el(
      "div",
      "rr-layer rr-hidden",
      `<div class="rr-card rr-dialog"><h2>Paused</h2><p>Freeway telemetry holding.</p><button type="button" class="rr-btn">Resume</button><small>${this.touchy ? "Tap Resume" : "Press P to resume"}</small></div>`
    );
    this.pause.querySelector(".rr-btn")!.addEventListener("click", () => this.cb.onResume?.());
    root.appendChild(this.pause);

    this.over = el(
      "div",
      "rr-layer rr-hidden",
      `<div class="rr-card rr-dialog">
        <h2>Wrecked!</h2>
        <div class="rr-big go-score">0</div>
        <div class="rr-best go-best"></div>
        <div class="rr-new go-new rr-hidden">new best</div>
        <div class="rr-best go-assisted rr-hidden">Assisted run: the best score is not saved</div>
        <div class="rr-stats">
          <div><b class="go-dist">0</b><span>distance m</span></div>
          <div><b class="go-bolts">0</b><span>bolts</span></div>
          <div><b class="go-combo">0</b><span>best combo</span></div>
        </div>
        <button type="button" class="rr-btn go-retry">Retry</button>
        <small>${this.touchy ? "Tap Retry to go again" : "Space to go again"}</small>
      </div>`
    );
    this.over.querySelector(".go-retry")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cb.onRetry?.();
    });
    root.appendChild(this.over);

    const touch = el(
      "div",
      "rr-touch",
      `<div class="rr-touch-left">
        <button type="button" data-a="rollLeft" aria-label="Barrel roll left">${CONTROL_ICONS.rollLeft}<span>roll l</span></button>
        <div class="rr-touch-row">
          <button type="button" data-a="left" aria-label="Steer left">${CONTROL_ICONS.steerLeft}<span>left</span></button>
          <button type="button" data-a="right" aria-label="Steer right">${CONTROL_ICONS.steerRight}<span>right</span></button>
        </div>
      </div>
      <div class="rr-touch-right">
        <div class="rr-touch-row">
          <button type="button" data-a="rollRight" aria-label="Barrel roll right">${CONTROL_ICONS.rollRight}<span>roll r</span></button>
          <button type="button" data-a="boost" data-hold="1" aria-label="Hold boost">${CONTROL_ICONS.boost}<span>boost</span></button>
          <button type="button" data-a="dive" data-hold="1" aria-label="Hold dive">${CONTROL_ICONS.dive}<span>dive</span></button>
        </div>
        <button type="button" data-a="thrust" data-hold="1" class="rr-fly" aria-label="Hold to hop and fly">${CONTROL_ICONS.fly}<span>fly</span></button>
      </div>`
    );
    touch.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const action = button.dataset.a as InputKey;
      const hold = button.dataset.hold === "1";
      const down = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
        button.classList.add("active");
        this.cb.onInject?.(action, true);
      };
      const up = (e: Event): void => {
        e.preventDefault();
        button.classList.remove("active");
        if (hold) this.cb.onInject?.(action, false);
      };
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("pointerleave", up);
    });
    root.appendChild(touch);
    if (this.touchy) root.classList.add("rr-touchy");
  }

  private flashObjective(): void {
    this.runStartedMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.last.tenths = -1;
    this.objectiveEl.classList.remove("rr-hidden");
    if (this.objectiveTimer) clearTimeout(this.objectiveTimer);
    this.objectiveTimer = setTimeout(() => {
      this.objectiveEl.classList.add("rr-hidden");
      this.objectiveTimer = null;
    }, 3400);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.classList.toggle("rr-off", muted);
    this.muteBtn.innerHTML = muted ? CONTROL_ICONS.soundOff : CONTROL_ICONS.soundOn;
  }

  showRun(): void {
    this.root.classList.remove("rr-idle");
    this.flashObjective();
  }
  showTitle(best = 0): void {
    this.root.classList.add("rr-idle");
    (this.title.querySelector(".title-best") as HTMLElement).textContent = best > 0 ? `Best ${Math.floor(best).toLocaleString()}` : "";
    this.title.classList.remove("rr-hidden");
  }
  hideTitle(): void {
    this.root.classList.remove("rr-idle");
    this.title.classList.add("rr-hidden");
    this.flashObjective();
  }
  showPause(visible: boolean): void {
    this.pause.classList.toggle("rr-hidden", !visible);
  }
  hideGameOver(): void {
    this.over.classList.add("rr-hidden");
  }
  showGameOver(summary: { score: number; best: number; isBest: boolean; distance: number; bolts: number; bestCombo: number; assisted?: boolean }): void {
    const q = (cls: string): HTMLElement => this.over.querySelector(cls)!;
    q(".go-score").textContent = Math.floor(summary.score).toLocaleString();
    q(".go-best").textContent = `Best ${Math.floor(summary.best).toLocaleString()}`;
    q(".go-new").classList.toggle("rr-hidden", !summary.isBest);
    q(".go-assisted").classList.toggle("rr-hidden", !summary.assisted);
    q(".go-dist").textContent = String(Math.floor(summary.distance));
    q(".go-bolts").textContent = String(summary.bolts);
    q(".go-combo").textContent = `×${summary.bestCombo}`;
    this.over.classList.remove("rr-hidden");
  }

  flashAir(): void {
    this.airWrap.classList.remove("rr-flash");
    void this.airWrap.offsetWidth;
    this.airWrap.classList.add("rr-flash");
  }

  popup(text: string, points: number, style = ""): void {
    const node = el("div", `rr-popup ${style}`.trim());
    node.innerHTML = `<b>${text}</b>${points > 0 ? `<span>+${Math.round(points).toLocaleString()}</span>` : ""}`;
    this.popWrap.appendChild(node);
    this.popups++;
    while (this.popWrap.childElementCount > 4) this.popWrap.firstElementChild?.remove();
    setTimeout(() => node.remove(), 1800);
    this.announce(points > 0 ? `${text} plus ${Math.round(points)}` : text);
  }

  /** Screen-reader line for trick popups, at most one announcement every 1.5 s (the visual popups are aria-hidden). */
  private announce(text: string): void {
    this.srPending = text;
    if (this.srTimer) return;
    const wait = Math.max(0, 1500 - (Date.now() - this.srLast));
    this.srTimer = setTimeout(() => {
      this.srTimer = null;
      this.srLast = Date.now();
      this.srEl.textContent = this.srPending;
    }, wait);
  }

  clearPopups(): void {
    this.popWrap.innerHTML = "";
  }

  update(state: { score: number; distance: number; bolts: number; mult: number; comboT: number; air: number; airMax: number; powerups: Record<string, number>; speed?: number; nextMilestone?: number }): void {
    const score = Math.floor(state.score);
    if (score !== this.last.score) {
      this.last.score = score;
      this.scoreEl.textContent = score.toLocaleString();
    }
    const dist = Math.floor(state.distance);
    if (dist !== this.last.dist) {
      this.last.dist = dist;
      this.distEl.textContent = dist.toLocaleString();
    }
    if (state.bolts !== this.last.bolts) {
      this.last.bolts = state.bolts;
      this.boltsEl.textContent = String(state.bolts);
    }
    if (state.mult !== this.last.mult) {
      this.last.mult = state.mult;
      this.multEl.textContent = `×${state.mult}`;
      this.multEl.classList.toggle("rr-hot", state.mult > 1);
    }
    const speed = Math.round((state.speed ?? 0) * 3.6);
    if (speed !== this.last.speed) {
      this.last.speed = speed;
      this.speedEl.textContent = String(speed);
      (this.gaugeValue as SVGElement | HTMLElement).style.strokeDasharray = `${Math.max(0.5, speedoPercent(speed))} 100`;
      const tele = engineTelemetry(speed);
      if (tele.gear !== this.last.gear) {
        this.last.gear = tele.gear;
        this.gearEl.textContent = String(tele.gear);
      }
      if (tele.rpm !== this.last.rpm) {
        this.last.rpm = tele.rpm;
        this.rpmEl.textContent = tele.rpm.toLocaleString();
      }
    }
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.runStartedMs === 0) this.runStartedMs = nowMs;
    const elapsedSec = state.distance <= 0 ? 0 : Math.max(0, (nowMs - this.runStartedMs) / 1000);
    if (state.distance <= 0.5 && this.last.dist <= 0) this.runStartedMs = nowMs;
    const tenths = Math.floor(elapsedSec * 10);
    if (tenths !== this.last.tenths) {
      this.last.tenths = tenths;
      this.timeEl.textContent = formatRunClock(elapsedSec);
    }
    if (state.nextMilestone !== undefined) {
      if (state.nextMilestone !== this.last.mile) {
        this.last.mile = state.nextMilestone;
        this.mileLabel.textContent = `${Math.round(state.nextMilestone / 1000)} km`;
      }
      const into = 1 - Math.max(0, Math.min(1, (state.nextMilestone - state.distance) / 1000));
      this.mileFill.style.transform = `scaleX(${into})`;
    }
    this.comboFill.style.transform = `scaleX(${Math.max(0, Math.min(1, state.comboT))})`;
    const air = Math.max(0, Math.min(1, state.air / state.airMax));
    const lit = airRungsLit(air);
    if (lit !== this.lastRungs) {
      this.lastRungs = lit;
      this.rungs.forEach((rung, i) => rung.classList.toggle("rr-on", i < lit));
    }
    this.airWrap.classList.toggle("rr-low", air <= AIR_LOW);
    const limits: Record<string, number> = { rocket: 6, shield: 8, magnet: 10, multiplier: 12 };
    for (const [kind, remaining] of Object.entries(state.powerups)) {
      let entry = this.pu.get(kind);
      if (remaining > 0) {
        if (!entry) {
          const icon = kind in HUD_ICONS ? HUD_ICONS[kind as HudIconKey] : "";
          const node = el("div", `rr-pu rr-pu-${kind}`, `${icon}<span class="rr-micro">${POWERUP_NAMES[kind] ?? kind}</span><div><i></i></div>`);
          this.puWrap.appendChild(node);
          entry = { node, bar: node.querySelector("i")! };
          this.pu.set(kind, entry);
        }
        entry.bar.style.transform = `scaleX(${Math.min(1, remaining / (limits[kind] ?? 8))})`;
      } else if (entry) {
        entry.node.remove();
        this.pu.delete(kind);
      }
    }
  }
}
