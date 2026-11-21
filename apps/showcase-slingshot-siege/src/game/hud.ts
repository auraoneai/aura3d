/**
 * Slingshot Siege — DOM HUD + shell surfaces.
 *
 * All chrome is DOM reflecting runtime state (score, ammo dock, gull pips,
 * star meter, toasts, result card, Siege Map / Player Studio / Trajectory
 * Range overlays, pause veil). Gameplay truth stays in the sim + scene.
 */
import { HUD_THEMES } from "@aura3d/engine/game";
import { AMMO, type AmmoId } from "./ammo";
import { CHAPTERS, LEVELS, isLevelUnlocked, totalStars, type LevelSpec } from "./levels";

/** Crisp SVG raider crest replacing the raw boar emoji in the target-pip counter. */
const RAIDER_CREST_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 14c0-4.2 3.1-7.4 7-7.4s7 3.2 7 7.4c0 3-2.5 5.4-7 5.4S5 17 5 14Z" fill="#7a4c32" stroke="#3d2a17" stroke-width="1.5"/><path d="M4.5 13.5 2.4 10.6l2.8.8M19.5 13.5l2.1-2.9-2.8.8" fill="none" stroke="#f7ecd4" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="12" cy="14.7" rx="3.4" ry="2.2" fill="#d99a74" stroke="#3d2a17" stroke-width="1.2"/><circle cx="10.8" cy="14.7" r="0.7" fill="#3d2a17"/><circle cx="13.2" cy="14.7" r="0.7" fill="#3d2a17"/><circle cx="9.2" cy="11.1" r="1.05" fill="#fff7e8"/><circle cx="14.8" cy="11.1" r="1.05" fill="#fff7e8"/></svg>`;

export type ModeId = "siege" | "map" | "studio" | "range";

export interface HudActions {
  onFireAbility(): void;
  onReset(): void;
  onPause(paused: boolean): void;
  onLevelSelect(levelId: number): void;
  onModeChange(mode: ModeId): void;
  onResult(next: "next" | "retry" | "map"): void;
  onBandColor(color: string): void;
  onFlagColor(color: string): void;
  onRangeShot(ammo: AmmoId, powerPct: number, angleDeg: number): void;
  onMuteToggle(): boolean;
  onQuickPan?(): void;
}

export interface HudState {
  mode: ModeId;
  level: LevelSpec;
  score: number;
  ammo: readonly AmmoId[];
  /** Shots already fired this level: chips [0, shotsUsed) are spent, chip `shotsUsed` is next. */
  shotsUsed: number;
  ammoLeft: number;
  currentAmmo: AmmoId | null;
  abilityReady: boolean;
  gullsLeft: number;
  gullsTotal: number;
  stars: Readonly<Record<number, number>>;
  paused: boolean;
  muted: boolean;
  unlockedCount: number;
  bandColor: string;
  flagColor: string;
}

const BAND_COLORS = ["#d94f30", "#ffb84d", "#57c8ff", "#b388ff", "#7ee0a0"] as const;
const FLAG_COLORS = ["#ff4d5a", "#ffb84d", "#57c8ff", "#7ee0a0", "#ffd166"] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (html) node.innerHTML = html;
  return node;
}

export function starRating(score: number, thresholds: readonly [number, number, number]): number {
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

export class SiegeHud {
  readonly root: HTMLElement;
  private actions: HudActions;
  private scoreEl!: HTMLElement;
  private starEls!: HTMLElement[];
  private levelTag!: HTMLElement;
  private gullPips!: HTMLElement;
  private ammoDock!: HTMLElement;
  private abilityBtn!: HTMLButtonElement;
  private toasts!: HTMLElement;
  private popups!: HTMLElement;
  private banner!: HTMLElement;
  private resultCard!: HTMLElement;
  private pauseVeil!: HTMLElement;
  private mapOverlay!: HTMLElement;
  private studioOverlay!: HTMLElement;
  private rangeOverlay!: HTMLElement;
  private shotMeter!: HTMLElement;
  private mode: ModeId = "siege";
  private state!: HudState;
  private destroyed = false;
  private muteBtn!: HTMLButtonElement;
  private coach!: HTMLElement;
  private aimBadge!: HTMLElement;
  private panBtn!: HTMLButtonElement;
  /** Last written HUD fragments: `update()` touches the DOM only when one changes. */
  private written = { score: "", rating: -1, levelTag: "", pips: "", dock: "", ability: "" };

  constructor(container: HTMLElement, actions: HudActions) {
    this.actions = actions;
    this.root = el("div", "ss-hud");
    for (const [k, v] of Object.entries(HUD_THEMES.storybook)) {
      this.root.style.setProperty(k, v);
    }
    container.appendChild(this.root);
    this.build();
  }

  private build(): void {
    // ---------------- topbar: shared quickbar contract + compact mobile labels ------------------------
    const topbar = el("div", "aura3d-top-bar ss-topbar");
    const brand = el("div", "ss-brand", `<span class="ss-brand-mark" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 1v14" stroke="currentColor" stroke-width="1.6"/><path d="M4 2h9l-3 3 3 3H4z" fill="currentColor"/></svg></span><span class="ss-brand-text">Slingshot Siege</span>`);
    const tabs = el("div", "ss-tabs");
    const tabDefs: readonly [ModeId, string, string][] = [
      ["siege", "Siege", "Play"],
      ["map", "Siege Map", "Map"],
      ["studio", "Player Studio", "Paint"],
      ["range", "Trajectory Range", "Lab"]
    ];
    for (const [id, label, shortLabel] of tabDefs) {
      const btn = el("button", "ss-tab", `<span class="ss-tab-full">${label}</span><span class="ss-tab-short">${shortLabel}</span>`);
      btn.type = "button";
      btn.dataset.mode = id;
      btn.addEventListener("click", () => this.actions.onModeChange(id));
      tabs.appendChild(btn);
    }
    const mute = el("button", "ss-topbar-btn", "🔊");
    mute.type = "button";
    mute.title = "Mute sound";
    mute.setAttribute("aria-label", "Mute sound");
    mute.addEventListener("click", () => this.setMuted(this.actions.onMuteToggle()));
    this.muteBtn = mute;
    topbar.append(brand, tabs, mute);
    this.root.appendChild(topbar);

    // ---------------- gameplay hud ------------------------------------------
    const hud = el("div", "ss-game-hud");
    hud.dataset.zone = "game";
    const scoreCard = el("div", "ss-score-card");
    this.scoreEl = el("div", "ss-score", "0");
    const starRow = el("div", "ss-stars");
    this.starEls = [0, 1, 2].map(() => el("span", "ss-star", "★"));
    starRow.append(...this.starEls);
    scoreCard.append(el("div", "ss-score-label", "SCORE"), this.scoreEl, starRow);

    this.levelTag = el("div", "ss-level-tag");

    this.gullPips = el("div", "ss-gull-pips");

    this.ammoDock = el("div", "ss-ammo-dock");

    this.abilityBtn = el("button", "ss-ability");
    this.abilityBtn.innerHTML = `<span class="ss-ability-key">TAP</span><span class="ss-ability-name"></span>`;
    this.abilityBtn.addEventListener("click", () => this.actions.onFireAbility());

    const utility = el("div", "ss-utility");
    const panBtn = el("button", "ss-utility-btn ss-pan-btn", "Fort");
    panBtn.type = "button";
    panBtn.title = "Pan between Fort and Sling";
    panBtn.addEventListener("click", () => this.actions.onQuickPan?.());
    this.panBtn = panBtn;
    const resetBtn = el("button", "ss-utility-btn", "↺");
    resetBtn.type = "button";
    resetBtn.title = "Reset level";
    resetBtn.addEventListener("click", () => this.actions.onReset());
    const pauseBtn = el("button", "ss-utility-btn", "⏸");
    pauseBtn.type = "button";
    pauseBtn.title = "Pause";
    pauseBtn.addEventListener("click", () => this.actions.onPause(true));
    utility.append(panBtn, resetBtn, pauseBtn);

    this.shotMeter = el("div", "ss-shot-meter");
    this.aimBadge = el("div", "ss-aim-badge ss-hidden");
    hud.append(scoreCard, this.levelTag, this.gullPips, this.ammoDock, this.abilityBtn, utility, this.shotMeter, this.aimBadge);
    this.root.appendChild(hud);

    // ---------------- feedback layers ----------------------------------------
    this.toasts = el("div", "ss-toasts");
    this.popups = el("div", "ss-popups");
    this.banner = el("div", "ss-banner ss-hidden");
    this.root.append(this.toasts, this.popups, this.banner);

    // ---------------- result card ---------------------------------------------
    this.resultCard = el("div", "ss-result ss-hidden");
    // One delegated listener for the card's lifetime: clicks that miss a button do nothing,
    // and a re-shown card never stacks a second handler.
    this.resultCard.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-act]");
      const act = btn?.dataset.act;
      if (act === "next" || act === "retry" || act === "map") this.actions.onResult(act);
    });
    this.root.appendChild(this.resultCard);

    // ---------------- first-level coach -----------------------------------------
    this.coach = el("div", "ss-coach ss-hidden");
    this.coach.innerHTML = `<b>Drag pouch back</b> &amp; release to fire
      <span class="ss-coach-keys">W/S aim · A/D power · Space launch &amp; ability</span>`;
    this.root.appendChild(this.coach);

    // ---------------- pause veil -----------------------------------------------
    this.pauseVeil = el("div", "ss-veil ss-hidden");
    this.pauseVeil.innerHTML = `<div class="ss-veil-card"><h2>Paused</h2>
      <button class="ss-btn ss-btn-primary" data-act="resume">Resume</button>
      <button class="ss-btn" data-act="retry">Restart Level</button>
      <button class="ss-btn" data-act="map">Siege Map</button></div>`;
    this.pauseVeil.addEventListener("click", (ev) => {
      const act = (ev.target as HTMLElement).dataset.act;
      if (act === "resume") this.actions.onPause(false);
      else if (act === "retry") this.actions.onReset();
      else if (act === "map") this.actions.onModeChange("map");
    });
    this.root.appendChild(this.pauseVeil);

    // ---------------- overlays -------------------------------------------------
    this.mapOverlay = el("div", "ss-overlay ss-hidden");
    this.studioOverlay = el("div", "ss-overlay ss-hidden");
    this.rangeOverlay = el("div", "ss-overlay ss-hidden");
    this.root.append(this.mapOverlay, this.studioOverlay, this.rangeOverlay);
  }

  setMode(mode: ModeId): void {
    this.mode = mode;
    this.root.querySelectorAll(".ss-tab").forEach((t) => t.classList.toggle("active", (t as HTMLElement).dataset.mode === mode));
    (this.root.querySelector(".ss-game-hud") as HTMLElement).classList.toggle("ss-hidden", mode !== "siege");
    this.mapOverlay.classList.toggle("ss-hidden", mode !== "map");
    this.studioOverlay.classList.toggle("ss-hidden", mode !== "studio");
    this.rangeOverlay.classList.toggle("ss-hidden", mode !== "range");
    if (mode === "map") this.renderMap();
    if (mode === "studio") this.renderStudio();
    if (mode === "range") this.renderRange();
  }

  update(state: HudState): void {
    this.state = state;
    const w = this.written;
    const score = Math.round(state.score).toLocaleString();
    if (score !== w.score) { w.score = score; this.scoreEl.textContent = score; }
    const rating = starRating(state.score, state.level.stars);
    if (rating !== w.rating) { w.rating = rating; this.starEls.forEach((s, i) => s.classList.toggle("lit", i < rating)); }
    const levelTag = `${state.level.id}`;
    if (levelTag !== w.levelTag) {
      w.levelTag = levelTag;
      this.levelTag.innerHTML = `<b>${CHAPTERS[state.level.chapter]!.name}</b> · ${state.level.slot + 1}. ${state.level.name}`;
    }

    const pips = `${state.gullsLeft}/${state.gullsTotal}`;
    if (pips !== w.pips) {
      w.pips = pips;
      this.gullPips.innerHTML = "";
      for (let i = 0; i < state.gullsTotal; i += 1) {
        const alive = i < state.gullsLeft;
        const pip = el("span", `ss-gull-pip ${alive ? "alive" : "down"}`, alive ? RAIDER_CREST_SVG : "✕");
        pip.title = alive ? "Raider still standing" : "Raider squashed";
        this.gullPips.appendChild(pip);
      }
    }

    const dock = `${state.level.id}:${state.ammo.join(",")}:${state.shotsUsed}`;
    if (dock !== w.dock) {
      w.dock = dock;
      this.ammoDock.innerHTML = "";
      state.ammo.forEach((ammo, i) => {
        const spent = i < state.shotsUsed;
        const current = i === state.shotsUsed;
        const chip = el("div", `ss-ammo-chip ${spent ? "spent" : "ready"}${current ? " current" : ""}`);
        chip.style.setProperty("--ammo-color", AMMO[ammo].glow);
        chip.innerHTML = `<i></i><span>${AMMO[ammo].short}</span>`;
        chip.title = `${AMMO[ammo].name} — ${AMMO[ammo].abilityHint}`;
        this.ammoDock.appendChild(chip);
      });
    }
    const ability = `${state.currentAmmo ?? ""}:${state.abilityReady}`;
    if (ability !== w.ability) {
      w.ability = ability;
      const cur = state.currentAmmo ? AMMO[state.currentAmmo] : null;
      this.abilityBtn.classList.toggle("armed", state.abilityReady);
      this.abilityBtn.querySelector(".ss-ability-name")!.textContent = cur ? cur.abilityName : "";
      this.abilityBtn.style.setProperty("--ammo-color", cur?.glow ?? "#888");
    }
    if (state.muted !== (this.muteBtn.dataset.muted === "1")) this.setMuted(state.muted);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.dataset.muted = muted ? "1" : "0";
    this.muteBtn.textContent = muted ? "🔇" : "🔊";
    const label = muted ? "Unmute sound" : "Mute sound";
    this.muteBtn.title = label;
    this.muteBtn.setAttribute("aria-label", label);
  }

  /** First-level onboarding card: shown until the first launch. */
  setCoach(visible: boolean): void {
    this.coach.classList.toggle("ss-hidden", !visible);
  }

  toast(text: string, cls = ""): void {
    const t = el("div", `ss-toast ${cls}`, text);
    this.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 1600);
  }

  scorePopup(text: string, xPct: number, yPct: number, big = false): void {
    const p = el("div", `ss-popup ${big ? "big" : ""}`, text);
    p.style.left = `${xPct}%`;
    p.style.top = `${yPct}%`;
    this.popups.appendChild(p);
    setTimeout(() => p.remove(), 1100);
  }

  showBanner(text: string, sub = ""): void {
    this.banner.innerHTML = `<h1>${text}</h1>${sub ? `<p>${sub}</p>` : ""}`;
    this.banner.classList.remove("ss-hidden");
    this.banner.classList.add("in");
    setTimeout(() => { this.banner.classList.remove("in"); setTimeout(() => this.banner.classList.add("ss-hidden"), 350); }, 1800);
  }

  setPaused(paused: boolean): void {
    this.pauseVeil.classList.toggle("ss-hidden", !paused);
  }

  setShotMeter(pct: number, angleDeg?: number, screenPct?: { x: number; y: number }): void {
    const clamped = Math.max(0, Math.min(1, pct));
    this.shotMeter.style.setProperty("--pull", `${clamped * 100}%`);
    this.shotMeter.classList.toggle("active", clamped > 0.01);
    if (clamped > 0.04 && angleDeg !== undefined && screenPct) {
      this.aimBadge.textContent = `${Math.round(angleDeg)}° · ${Math.round(clamped * 100)}%`;
      this.aimBadge.style.left = `${Math.max(12, Math.min(86, screenPct.x))}%`;
      this.aimBadge.style.top = `${Math.max(16, Math.min(74, screenPct.y - 9))}%`;
      this.aimBadge.classList.remove("ss-hidden");
    } else {
      this.aimBadge.classList.add("ss-hidden");
    }
  }

  setPanLabel(lookingAtFort: boolean): void {
    this.panBtn.textContent = lookingAtFort ? "Sling" : "Fort";
  }

  showResult(opts: { won: boolean; stars: number; score: number; bonus: number; levelName: string; hasNext: boolean }): void {
    const { won, stars, score, bonus, levelName, hasNext } = opts;
    this.resultCard.className = "ss-result in";
    this.resultCard.innerHTML = `<div class="ss-result-card ${won ? "won" : "lost"}">
      <div class="ss-result-title">${won ? "FORTRESS CLEARED!" : "RAIDERS SURVIVE…"}</div>
      <div class="ss-result-level">${levelName}</div>
      <div class="ss-result-stars">${[0, 1, 2].map((i) => `<span class="ss-star ${i < stars ? "lit" : ""}">★</span>`).join("")}</div>
      <div class="ss-result-score">${score.toLocaleString()}</div>
      ${bonus > 0 ? `<div class="ss-result-bonus">+${bonus.toLocaleString()} spare-ammo bonus</div>` : ""}
      <div class="ss-result-actions">
        ${won && hasNext ? `<button class="ss-btn ss-btn-primary" data-act="next">Next Level ▸</button>` : ""}
        <button class="ss-btn ${won && hasNext ? "" : "ss-btn-primary"}" data-act="retry">${won ? "Replay" : "Try Again"}</button>
        <button class="ss-btn" data-act="map">Siege Map</button>
      </div></div>`;
  }

  hideResult(): void {
    this.resultCard.classList.add("ss-hidden");
    this.resultCard.classList.remove("in");
  }

  private renderMap(): void {
    const stars = this.state.stars;
    const total = totalStars(stars);
    this.mapOverlay.innerHTML = `<div class="ss-map">
      <h2>SIEGE MAP</h2><p class="ss-map-sub">${total}★ earned — stars unlock the road ahead</p>
      <div class="ss-map-grid"></div></div>`;
    const grid = this.mapOverlay.querySelector(".ss-map-grid")!;
    CHAPTERS.forEach((chapter) => {
      const col = el("div", "ss-map-chapter");
      col.style.setProperty("--chip", chapter.chipColor);
      col.innerHTML = `<h3>${chapter.name}</h3><p>${chapter.tagline}</p>`;
      LEVELS.filter((l) => l.chapter === chapter.id).forEach((level) => {
        const unlocked = isLevelUnlocked(level.id, stars);
        const tile = el("button", `ss-level-tile ${unlocked ? "open" : "locked"} ${level.id === this.state.level.id ? "current" : ""}`);
        const earned = stars[level.id] ?? 0;
        tile.innerHTML = `<b>${level.slot + 1}</b><span>${unlocked ? level.name : "🔒"}</span>
          <i>${[0, 1, 2].map((i) => `<s class="${i < earned ? "lit" : ""}">★</s>`).join("")}</i>`;
        if (unlocked) tile.addEventListener("click", () => this.actions.onLevelSelect(level.id));
        col.appendChild(tile);
      });
      grid.appendChild(col);
    });
  }

  private renderStudio(): void {
    this.studioOverlay.innerHTML = `<div class="ss-studio">
      <h2>PLAYER STUDIO</h2><p class="ss-map-sub">Personalize your slingshot + keep colours</p>
      <div class="ss-studio-card"><h3>Slingshot bands</h3><div class="ss-swatches" data-pick="band">
        ${BAND_COLORS.map((c) => `<button class="ss-swatch ${c === this.state.bandColor ? "sel" : ""}" style="--sw:${c}" data-color="${c}"></button>`).join("")}
      </div></div>
      <div class="ss-studio-card"><h3>Fortress flag</h3><div class="ss-swatches" data-pick="flag">
        ${FLAG_COLORS.map((c) => `<button class="ss-swatch ${c === this.state.flagColor ? "sel" : ""}" style="--sw:${c}" data-color="${c}"></button>`).join("")}
      </div></div>
      <div class="ss-studio-card ss-studio-stats"><h3>Siege record</h3>
        <p>Levels cleared: <b>${Object.values(this.state.stars).filter((s) => s > 0).length}</b> / ${LEVELS.length}</p>
        <p>Stars: <b>${totalStars(this.state.stars)}</b> / 90</p>
      </div></div>`;
    this.studioOverlay.querySelectorAll<HTMLElement>(".ss-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        const group = (sw.parentElement as HTMLElement).dataset.pick;
        const color = sw.dataset.color!;
        if (group === "band") this.actions.onBandColor(color); else this.actions.onFlagColor(color);
        this.renderStudio();
      });
    });
  }

  private renderRange(): void {
    this.rangeOverlay.innerHTML = `<div class="ss-range">
      <h2>TRAJECTORY RANGE</h2><p class="ss-map-sub">Sandbox: pick ammo, power and angle — watch the flight arc in the scene</p>
      <div class="ss-range-controls">
        <label>Ammo</label>
        <div class="ss-range-ammo">${(Object.keys(AMMO) as AmmoId[]).map((id) =>
          `<button class="ss-range-chip" data-ammo="${id}" style="--ammo-color:${AMMO[id].glow}">${AMMO[id].name}</button>`).join("")}</div>
        <label>Power <span id="ss-power-val">70</span>%</label>
        <input id="ss-range-power" type="range" min="20" max="100" value="70" />
        <label>Angle <span id="ss-angle-val">38</span>°</label>
        <input id="ss-range-angle" type="range" min="5" max="75" value="38" />
        <button class="ss-btn ss-btn-primary" id="ss-range-fire">LAUNCH TEST SHOT</button>
      </div></div>`;
    let ammo: AmmoId = "pebble";
    const fire = () => {
      const power = Number((this.rangeOverlay.querySelector("#ss-range-power") as HTMLInputElement).value);
      const angle = Number((this.rangeOverlay.querySelector("#ss-range-angle") as HTMLInputElement).value);
      this.actions.onRangeShot(ammo, power, angle);
    };
    this.rangeOverlay.querySelectorAll<HTMLElement>(".ss-range-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        this.rangeOverlay.querySelectorAll(".ss-range-chip").forEach((c) => c.classList.remove("sel"));
        chip.classList.add("sel");
        ammo = chip.dataset.ammo as AmmoId;
      });
    });
    (this.rangeOverlay.querySelector(".ss-range-chip") as HTMLElement).classList.add("sel");
    for (const id of ["#ss-range-power", "#ss-range-angle"]) {
      const input = this.rangeOverlay.querySelector(id) as HTMLInputElement;
      // Sliders only set the shot; the LAUNCH button fires it.
      input.addEventListener("input", () => {
        (this.rangeOverlay.querySelector(id === "#ss-range-power" ? "#ss-power-val" : "#ss-angle-val") as HTMLElement).textContent = input.value;
      });
    }
    this.rangeOverlay.querySelector("#ss-range-fire")!.addEventListener("click", fire);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
  }
}
