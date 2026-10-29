// Pip's Big Leap — HUD + shell overlay wiring.
//
// All DOM lives in index.html; this module owns updates: hearts, seed/acorn
// counters, timer, objective line, banners, boss bar, toasts, the pause /
// atlas / studio / world-complete overlays, and the top-bar mode+venue
// buttons.

import type { PipSave } from "./save.js";
import { totalSeeds } from "./save.js";
import { WORLDS } from "./worlds.js";
import type { ModeId, WorldId } from "./types.js";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Pip's Big Leap HUD missing element #${id}`);
  return el as T;
};

export interface Hud {
  setMode(mode: ModeId): void;
  setWorld(title: string): void;
  setHearts(n: number): void;
  setSeeds(got: number, total: number): void;
  setAcorns(n: number): void;
  setTimer(seconds: number | null, medals?: { gold: number; silver: number; bronze: number }): void;
  setObjective(text: string): void;
  setBoss(hp: number, max: number, active: boolean): void;
  banner(big: string, small?: string, seconds?: number): void;
  toast(text: string, seconds?: number): void;
  showPause(show: boolean): void;
  showAtlas(show: boolean): void;
  showStudio(show: boolean): void;
  showComplete(show: boolean, title?: string, sub?: string, stats?: readonly string[], nextLabel?: string): void;
  renderAtlas(save: PipSave): void;
  renderStudio(save: PipSave, onPick: (which: "cape", color: string) => void): void;
  setVenue(id: WorldId): void;
  setTopMode(mode: ModeId): void;
}

export function createHud(): Hud {
  const modeTag = $<HTMLDivElement>("pbl-mode-tag");
  const heartsEl = $<HTMLDivElement>("pbl-hearts");
  const worldEl = $<HTMLSpanElement>("pbl-world");
  const seedsEl = $<HTMLSpanElement>("pbl-seeds");
  const acornsEl = $<HTMLSpanElement>("pbl-acorns");
  const timerChip = $<HTMLDivElement>("pbl-timer-chip");
  const timerEl = $<HTMLSpanElement>("pbl-timer");
  const objectiveEl = $<HTMLDivElement>("pbl-objective");
  const bossWrap = $<HTMLDivElement>("pbl-boss-wrap");
  const bossFill = $<HTMLDivElement>("pbl-boss-fill");
  const bannerEl = $<HTMLDivElement>("pbl-banner");
  const bannerBig = $<HTMLDivElement>("pbl-banner-big");
  const bannerSmall = $<HTMLDivElement>("pbl-banner-small");
  const toastEl = $<HTMLDivElement>("pbl-toast");
  const pauseEl = $<HTMLDivElement>("pbl-pause");
  const atlasEl = $<HTMLDivElement>("pbl-atlas");
  const studioEl = $<HTMLDivElement>("pbl-studio");
  const completeEl = $<HTMLDivElement>("pbl-complete");
  const completeTitle = $<HTMLHeadingElement>("pbl-complete-title");
  const completeSub = $<HTMLParagraphElement>("pbl-complete-sub");
  const completeStats = $<HTMLDivElement>("pbl-complete-stats");
  const nextWorldBtn = $<HTMLButtonElement>("pbl-next-world");
  const atlasGrid = $<HTMLDivElement>("pbl-atlas-grid");
  const capeSwatches = $<HTMLDivElement>("pbl-cape-swatches");

  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  // The timer is written every frame; only touch the DOM when its text changes.
  let timerText = "";
  let timerShown: boolean | null = null;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
  };

  return {
    setMode(mode) {
      modeTag.textContent = mode === "quick" ? "QUICK PLAY"
        : mode === "academy" ? "JUMP ACADEMY"
        : mode === "atlas" ? "VALE ATLAS"
        : mode === "studio" ? "PLAYER STUDIO"
        : "TIME TRIAL";
    },
    setWorld(title) { worldEl.textContent = title.toUpperCase(); },
    setHearts(n) {
      heartsEl.innerHTML = Array.from({ length: 3 }, (_, i) =>
        `<span class="${i < n ? "on" : "off"}">&#10084;</span>`).join("");
    },
    setSeeds(got, total) { seedsEl.textContent = `${got}/${total}`; },
    setAcorns(n) { acornsEl.textContent = String(n); },
    setTimer(seconds, medals) {
      const show = seconds !== null;
      if (show !== timerShown) {
        timerChip.style.display = show ? "" : "none";
        timerShown = show;
      }
      if (seconds === null) return;
      const medal = medals ? (seconds <= medals.gold ? " 🥇" : seconds <= medals.silver ? " 🥈" : seconds <= medals.bronze ? " 🥉" : "") : "";
      const text = fmt(seconds) + medal;
      if (text !== timerText) {
        timerEl.textContent = text;
        timerText = text;
      }
    },
    setObjective(text) { objectiveEl.textContent = text; },
    setBoss(hp, max, active) {
      bossWrap.hidden = !active;
      bossFill.style.width = `${Math.max(0, (hp / max) * 100)}%`;
    },
    banner(big, small = "", seconds = 2.6) {
      bannerBig.textContent = big;
      bannerSmall.textContent = small;
      bannerEl.classList.add("show");
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove("show"), seconds * 1000);
    },
    toast(text, seconds = 2.2) {
      toastEl.textContent = text;
      toastEl.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), seconds * 1000);
    },
    showPause(show) { pauseEl.hidden = !show; },
    showAtlas(show) { atlasEl.hidden = !show; },
    showStudio(show) { studioEl.hidden = !show; },
    showComplete(show, title, sub, stats, nextLabel) {
      completeEl.hidden = !show;
      if (!show) return;
      if (title) completeTitle.textContent = title;
      if (sub) completeSub.textContent = sub;
      if (stats) completeStats.innerHTML = stats.map((s) => `<div class="pbl-stat">${s}</div>`).join("");
      if (nextLabel) nextWorldBtn.textContent = nextLabel;
    },
    renderAtlas(save) {
      const total = totalSeeds(save);
      atlasGrid.innerHTML = WORLDS.filter((w) => w.id !== "academy").map((w) => {
        const got = (save.seeds[w.id] ?? []).length;
        const done = save.completed[w.id] === true;
        const best = save.bestTimes[w.id];
        return `<button type="button" class="pbl-atlas-card ${done ? "done" : ""}" data-world="${w.id}">
          <div class="n">${w.order}</div>
          <div class="t">${w.title.toUpperCase()}</div>
          <div class="s">${w.subtitle}</div>
          <div class="p">${done ? "✔ SUN-GATE OPENED" : "···"}</div>
          <div class="sd">☀ ${got}/${w.seedGoal} seeds${best !== undefined ? ` · ⏱ ${best.toFixed(1)}s` : ""}</div>
        </button>`;
      }).join("") + `<div class="pbl-atlas-total">VALE TOTAL — ☀ ${total}/36 sun-seeds</div>`;
    },
    renderStudio(save, onPick) {
      const CAPES = ["#3f8cff", "#ffd95e", "#ff6a8a", "#5fd38a", "#9a8ce0", "#ff9435", "#6fd8ff", "#f0e6d4"];
      const make = (host: HTMLElement, which: "cape", colors: readonly string[]) => {
        host.innerHTML = "";
        for (const c of colors) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "pbl-swatch" + (save.studio[which] === c ? " active" : "");
          b.style.background = c;
          b.setAttribute("aria-label", `${which} ${c}`);
          b.addEventListener("click", () => onPick(which, c));
          host.appendChild(b);
        }
      };
      make(capeSwatches, "cape", CAPES);
    },
    setVenue(id) {
      document.querySelectorAll("[data-aura-venue]").forEach((el) =>
        el.classList.toggle("active", (el as HTMLElement).dataset.auraVenue === id));
    },
    setTopMode(mode) {
      const map: Record<ModeId, string> = {
        quick: "aura-btn-play", academy: "aura-btn-academy", atlas: "aura-btn-atlas",
        studio: "aura-btn-studio", trial: "aura-btn-trial"
      };
      for (const [m, id] of Object.entries(map)) {
        $(id).classList.toggle("active", m === mode);
      }
    }
  };
}
