import type { InputKey } from "./constants";
import type { GameHud } from "./game";

export interface HudCallbacks {
  onStart?(): void;
  onPause?(): void;
  onResume?(): void;
  onRetry?(): void;
  onToggleMute?(): boolean;
  onInject?(action: InputKey, down: boolean): void;
}

const POWERUP_NAMES: Record<string, string> = { rocket: "Rocket", shield: "Shield", magnet: "Magnet", multiplier: "×2" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

/** DOM heads-up display for Apex Overdrive: score card, air meter, power-ups, trick popups, pause and wreck cards, touch pads. */
export class RoadsterHud implements GameHud {
  private root: HTMLElement;
  private cb: HudCallbacks;
  private scoreEl!: HTMLElement;
  private distEl!: HTMLElement;
  private multEl!: HTMLElement;
  private comboFill!: HTMLElement;
  private airFill!: HTMLElement;
  private airWrap!: HTMLElement;
  private boltsEl!: HTMLElement;
  private puWrap!: HTMLElement;
  private popWrap!: HTMLElement;
  private pause!: HTMLElement;
  private over!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private title!: HTMLElement;
  private speedEl!: HTMLElement;
  private mileFill!: HTMLElement;
  private mileLabel!: HTMLElement;
  private srEl!: HTMLElement;
  private srPending = "";
  private srTimer: ReturnType<typeof setTimeout> | null = null;
  private srLast = 0;
  private touchy = false;
  private pu = new Map<string, { node: HTMLElement; bar: HTMLElement }>();
  private last = { score: -1, dist: -1, bolts: -1, mult: -1, speed: -1, mile: -1 };
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
          <div class="rr-head"><span class="rr-micro">Score</span><span class="rr-mult">×1</span></div>
          <div class="rr-score">0</div>
          <div class="rr-sub"><span class="rr-dist">0</span><span class="rr-micro">m</span></div>
          <div class="rr-combo"><i></i></div>
          <div class="rr-air"><span class="rr-micro">Air</span><div class="rr-air-track"><div class="rr-air-fill"></div></div></div>
          <div class="rr-speedo"><b class="rr-speed">0</b><span class="rr-micro">km/h</span><span class="rr-mile-label rr-micro">1 km</span><div class="rr-mile-track"><div class="rr-mile-fill"></div></div></div>
        </div>
        <div class="rr-powerups"></div>
      </div>
      <div class="rr-popups" aria-hidden="true"></div>
      <div class="rr-sr" role="status" aria-live="polite"></div>`
    );
    root.appendChild(run);
    this.scoreEl = run.querySelector(".rr-score")!;
    this.distEl = run.querySelector(".rr-dist")!;
    this.multEl = run.querySelector(".rr-mult")!;
    this.comboFill = run.querySelector(".rr-combo i")!;
    this.airWrap = run.querySelector(".rr-air")!;
    this.airFill = run.querySelector(".rr-air-fill")!;
    this.puWrap = run.querySelector(".rr-powerups")!;
    this.popWrap = run.querySelector(".rr-popups")!;
    this.srEl = run.querySelector(".rr-sr")!;
    this.speedEl = run.querySelector(".rr-speed")!;
    this.mileFill = run.querySelector(".rr-mile-fill")!;
    this.mileLabel = run.querySelector(".rr-mile-label")!;

    const right = el("div", "rr-right");
    const pauseBtn = el("button", "rr-icon-btn", "II");
    pauseBtn.type = "button";
    pauseBtn.setAttribute("aria-label", "Pause game");
    pauseBtn.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      this.cb.onPause?.();
    });
    this.muteBtn = el("button", "rr-icon-btn", "♪");
    this.muteBtn.type = "button";
    this.muteBtn.setAttribute("aria-label", "Toggle sound");
    this.muteBtn.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      this.setMuted(this.cb.onToggleMute ? this.cb.onToggleMute() : false);
    });
    const bolts = el("div", "rr-card rr-bolts", `<span class="rr-micro">Bolts</span><b class="rr-bolts-value">0</b>`);
    this.boltsEl = bolts.querySelector(".rr-bolts-value")!;
    right.append(pauseBtn, this.muteBtn, bolts);
    root.appendChild(right);

    const controls = this.touchy
      ? `<li><b>◀ ▶</b> change lane</li><li><b>Fly</b> hold to hop and fly</li><li><b>Roll L / R</b> barrel roll, dodges anything</li><li><b>Boost</b> and <b>Dive</b> hold</li>`
      : `<li><b>A / D</b> or arrows: change lane</li><li><b>Space</b> or <b>W</b>: hop, hold to fly</li><li><b>Q / E</b>: barrel roll, dodges anything</li><li><b>Shift</b> boost, <b>S</b> dive, <b>P</b> pause</li>`;
    this.title = el(
      "div",
      "rr-layer rr-title rr-hidden",
      `<div class="rr-card rr-dialog rr-title-card">
        <h2>Apex Overdrive</h2>
        <p>Weave through the evening freeway, hop onto truck roofs and fly the sky lane on cold-gas thrusters. Every metre scores, tricks and bolts multiply it. One crash ends the run.</p>
        <ul class="rr-controls">${controls}</ul>
        <div class="rr-best title-best"></div>
        <button type="button" class="rr-btn title-start">Start</button>
        <small>${this.touchy ? "Tap Start" : "Press Space or Enter"}</small>
      </div>`
    );
    const start = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onStart?.();
    };
    // the whole card layer starts the run, so a tap anywhere on a phone works
    this.title.addEventListener("click", start);
    root.appendChild(this.title);

    this.pause = el(
      "div",
      "rr-layer rr-hidden",
      `<div class="rr-card rr-dialog"><h2>Paused</h2><p>The traffic will wait.</p><button type="button" class="rr-btn">Resume</button><small>${this.touchy ? "Tap Resume" : "Press P to resume"}</small></div>`
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
        <div class="rr-new go-new rr-hidden">New best</div>
        <div class="rr-best go-assisted rr-hidden">Assisted run: the best score is not saved</div>
        <div class="rr-stats">
          <div><b class="go-dist">0</b><span>Distance m</span></div>
          <div><b class="go-bolts">0</b><span>Bolts</span></div>
          <div><b class="go-combo">0</b><span>Best combo</span></div>
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
        <button type="button" data-a="rollLeft">Roll L</button>
        <div><button type="button" data-a="left">◀</button><button type="button" data-a="right">▶</button></div>
      </div>
      <div class="rr-touch-right">
        <div><button type="button" data-a="rollRight">Roll R</button><button type="button" data-a="boost" data-hold="1">Boost</button><button type="button" data-a="dive" data-hold="1">Dive</button></div>
        <button type="button" data-a="thrust" data-hold="1" class="rr-fly">Fly</button>
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

  setMuted(muted: boolean): void {
    this.muteBtn.classList.toggle("rr-off", muted);
    this.muteBtn.textContent = muted ? "×" : "♪";
  }

  showRun(): void {
    this.root.classList.remove("rr-idle");
  }
  showTitle(best = 0): void {
    this.root.classList.add("rr-idle");
    (this.title.querySelector(".title-best") as HTMLElement).textContent = best > 0 ? `Best ${Math.floor(best).toLocaleString()}` : "";
    this.title.classList.remove("rr-hidden");
  }
  hideTitle(): void {
    this.root.classList.remove("rr-idle");
    this.title.classList.add("rr-hidden");
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
    this.airFill.style.transform = `scaleX(${air})`;
    this.airWrap.classList.toggle("rr-low", air < 0.2);
    const limits: Record<string, number> = { rocket: 6, shield: 8, magnet: 10, multiplier: 12 };
    for (const [kind, remaining] of Object.entries(state.powerups)) {
      let entry = this.pu.get(kind);
      if (remaining > 0) {
        if (!entry) {
          const node = el("div", `rr-pu rr-pu-${kind}`, `<span>${POWERUP_NAMES[kind] ?? kind}</span><div><i></i></div>`);
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
