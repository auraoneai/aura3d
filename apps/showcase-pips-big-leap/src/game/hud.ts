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

const HEART_SVG = `<svg class="pbl-ico-heart" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 14.1 6.9 13.1C3.1 9.7 1 7.7 1 5.1 1 3 2.7 1.4 4.8 1.4c1.2 0 2.4.6 3.2 1.5.8-.9 2-1.5 3.2-1.5C13.3 1.4 15 3 15 5.1c0 2.6-2.1 4.6-5.9 8L8 14.1Z"/></svg>`;
const SUN_SVG = `<svg class="pbl-ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="3.4" fill="currentColor"/><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 1.4v1.8M8 12.8v1.8M1.4 8h1.8M12.8 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3"/></svg>`;
const CLOCK_SVG = `<svg class="pbl-ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 4.6V8l2.4 1.5"/></svg>`;
const CHECK_SVG = `<svg class="pbl-ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2.8 8.4 6.3 12l6.9-7.4"/></svg>`;
const CHEVRON_SVG = `<svg class="pbl-compass-ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 1.6 13.4 13.6 8 10.9 2.6 13.6Z"/></svg>`;

export interface Hud {
  setMode(mode: ModeId): void;
  setWorld(title: string): void;
  setHearts(n: number): void;
  setSeeds(got: number, total: number): void;
  setAcorns(n: number): void;
  setTimer(seconds: number | null, medals?: { gold: number; silver: number; bronze: number }): void;
  setObjective(text: string): void;
  setGateCompass(bearingRad: number | null, unlocked: boolean): void;
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
  const hudRoot = $<HTMLDivElement>("pbl-hud");
  let compassEl = document.getElementById("pbl-gate-compass") as HTMLDivElement | null;
  if (!compassEl) {
    compassEl = document.createElement("div");
    compassEl.id = "pbl-gate-compass";
    compassEl.className = "pbl-gate-compass";
    compassEl.hidden = true;
    compassEl.innerHTML = `<span class="pbl-compass-arrow">${CHEVRON_SVG}</span><span class="k">SUN-GATE</span>`;
    hudRoot.appendChild(compassEl);
  }
  const compassArrow = compassEl.querySelector(".pbl-compass-arrow") as HTMLSpanElement | null;

  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  // The timer is written every frame; only touch the DOM when its text changes.
  let timerText = "";
  let timerMedal = "";
  let timerShown: boolean | null = null;
  let compassDeg = Number.NaN;
  let compassUnlocked: boolean | null = null;

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
        `<span class="${i < n ? "on" : "off"}">${HEART_SVG}</span>`).join("");
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
      const medal = medals ? (seconds <= medals.gold ? "GOLD" : seconds <= medals.silver ? "SILVER" : seconds <= medals.bronze ? "BRONZE" : "") : "";
      const text = fmt(seconds);
      if (text !== timerText) {
        timerEl.textContent = text;
        timerText = text;
      }
      if (medal !== timerMedal) {
        timerChip.dataset.medal = medal.toLowerCase();
        timerMedal = medal;
      }
    },
    setObjective(text) { objectiveEl.textContent = text; },
    setGateCompass(bearingRad, unlocked) {
      if (!compassEl) return;
      if (bearingRad === null) {
        compassEl.hidden = true;
        return;
      }
      compassEl.hidden = false;
      if (unlocked !== compassUnlocked) {
        compassEl.classList.toggle("unlocked", unlocked);
        compassUnlocked = unlocked;
      }
      const deg = Math.round((bearingRad * 180) / Math.PI);
      if (deg !== compassDeg && compassArrow) {
        compassArrow.style.transform = `rotate(${deg}deg)`;
        compassDeg = deg;
      }
    },
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
          <div class="p">${done ? `${CHECK_SVG} SUN-GATE OPENED` : "UNEXPLORED"}</div>
          <div class="sd">${SUN_SVG} <span class="m">${got}/${w.seedGoal}</span> seeds${best !== undefined ? ` · ${CLOCK_SVG} <span class="m">${best.toFixed(1)}s</span>` : ""}</div>
        </button>`;
      }).join("") + `<div class="pbl-atlas-total">VALE TOTAL — ${SUN_SVG} <span class="m">${total}/36</span> sun-seeds</div>`;
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
