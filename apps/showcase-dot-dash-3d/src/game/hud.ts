// Glint Courier — DOM shell wiring for the static index.html chrome:
// title overlay, top bar, pause menu, circuit map, player studio,
// clear/gameover cards, and the in-run HUD.

import { MAZE_ORDER, MAZES, FRUIT_LABEL } from "./mazes.js";
import { GHOST_ORDER, GHOST_TINT, st, startRun, endToTitle } from "./sim.js";
import { saveProfile } from "./save.js";
import type { MazeId } from "./mazes.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const ORB_SWATCHES = ["#45e8ff", "#7dff5e", "#ff9ed2", "#ffd23d", "#ff6a4d", "#c46bff"];
const TRAIL_SWATCHES = ["#ffd23d", "#45e8ff", "#ff4d5e", "#7dff5e", "#ff9ed2", "#ffffff"];

let paused = false;
export const isPaused = (): boolean => paused;

export function mountUI(): void {
  // ---- title buttons
  $("dd-t-quick").addEventListener("click", () => startRun("quick", "classic"));
  $("dd-t-school").addEventListener("click", () => startRun("school", "classic"));
  $("dd-t-circuit").addEventListener("click", () => openCircuit());
  $("dd-t-studio").addEventListener("click", () => openStudio());

  // ---- top bar
  $("dd-btn-play").addEventListener("click", () => startRun("quick", "classic"));
  $("dd-btn-school").addEventListener("click", () => startRun("school", "classic"));
  $("dd-btn-circuit").addEventListener("click", () => openCircuit());
  $("dd-btn-studio").addEventListener("click", () => openStudio());
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-venue]"))) {
    b.addEventListener("click", () => startRun("circuit", b.dataset.venue as MazeId));
  }
  $("dd-btn-dash").addEventListener("click", () => {
    st.profile.dashEnabled = !st.profile.dashEnabled;
    saveProfile(st.profile);
    syncTopBar();
  });
  $("dd-btn-cam").addEventListener("click", () => {
    st.camera = st.camera === "follow" ? "overhead" : "follow";
    st.profile.cameraDefault = st.camera;
    saveProfile(st.profile);
    syncTopBar();
  });

  // ---- pause
  $("dd-resume").addEventListener("click", () => setPaused(false));
  $("dd-restart").addEventListener("click", () => { setPaused(false); startRun(st.runKind, st.mazeId); });
  $("dd-pause-circuit").addEventListener("click", () => { setPaused(false); openCircuit(); });
  $("dd-pause-studio").addEventListener("click", () => { setPaused(false); openStudio(); });

  // ---- circuit + studio close
  $("dd-circuit-close").addEventListener("click", closeOverlays);
  $("dd-studio-close").addEventListener("click", closeOverlays);

  // ---- clear card
  $("dd-next-maze").addEventListener("click", () => {
    const next = MAZE_ORDER[MAZE_ORDER.indexOf(st.mazeId) + 1];
    if (next) startRun(st.runKind === "quick" ? "quick" : "circuit", next);
    closeOverlays();
  });
  $("dd-clear-retry").addEventListener("click", () => { startRun(st.runKind, st.mazeId); closeOverlays(); });
  $("dd-clear-circuit").addEventListener("click", () => { closeOverlays(); openCircuit(); });

  // ---- gameover card
  $("dd-go-retry").addEventListener("click", () => { startRun(st.runKind, st.mazeId); closeOverlays(); });
  $("dd-go-circuit").addEventListener("click", () => { closeOverlays(); openCircuit(); });

  document.addEventListener("keydown", onKey);
  syncTopBar();
  buildStudioSwatches();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (st.mode === "title") { closeOverlays(); return; }
    if ($("dd-circuit").hidden === false || $("dd-studio").hidden === false) { closeOverlays(); return; }
    setPaused(!paused);
    return;
  }
  if ((e.key === "r" || e.key === "R") && st.mode !== "title") startRun(st.runKind, st.mazeId);
  if (e.key === "Enter" && st.mode === "title") startRun("quick", "classic");
}

export function setPaused(v: boolean): void {
  paused = v && st.mode !== "title";
  $("dd-pause").hidden = !paused;
}

function openCircuit(): void {
  const grid = $("dd-circuit-grid");
  grid.innerHTML = MAZE_ORDER.map((id, i) => {
    const d = MAZES[id];
    const best = st.profile.mazeBest[id] ?? 0;
    const cleared = st.profile.cleared.includes(id);
    return `<button type="button" class="dd-maze-card" data-maze="${id}" style="border-color:${d.palette.accent}55">
      <div class="m-name" style="color:${d.palette.accent}">${i + 1}. ${d.title}</div>
      <div class="m-desc">${d.desc}</div>
      <div class="m-fruit">${FRUIT_LABEL[d.fruit]}${cleared ? " · CLEARED ✓" : ""}</div>
      <div class="m-best">BEST ${best}</div>
    </button>`;
  }).join("");
  for (const b of Array.from(grid.querySelectorAll<HTMLButtonElement>("[data-maze]"))) {
    b.addEventListener("click", () => { closeOverlays(); startRun(st.runKind === "school" ? "school" : "circuit", b.dataset.maze as MazeId); });
  }
  $("dd-circuit").hidden = false;
  $("dd-studio").hidden = true;
  $("dd-title").hidden = true;
}

function openStudio(): void {
  $("dd-studio").hidden = false;
  $("dd-circuit").hidden = true;
  $("dd-title").hidden = true;
  refreshSwatches();
}

function closeOverlays(): void {
  $("dd-circuit").hidden = true;
  $("dd-studio").hidden = true;
  if (st.mode === "title") $("dd-title").hidden = false;
  setPaused(false);
}

function buildStudioSwatches(): void {
  const orbHost = $("dd-orb-swatches");
  const trailHost = $("dd-trail-swatches");
  orbHost.innerHTML = ORB_SWATCHES.map(c => `<button type="button" class="dd-swatch" data-orb="${c}" style="background:${c}" aria-label="core ${c}"></button>`).join("");
  trailHost.innerHTML = TRAIL_SWATCHES.map(c => `<button type="button" class="dd-swatch" data-trail="${c}" style="background:${c}" aria-label="trail ${c}"></button>`).join("");
  for (const b of Array.from(orbHost.querySelectorAll<HTMLButtonElement>("[data-orb]"))) {
    b.addEventListener("click", () => { st.profile.orbColor = b.dataset.orb!; saveProfile(st.profile); refreshSwatches(); });
  }
  for (const b of Array.from(trailHost.querySelectorAll<HTMLButtonElement>("[data-trail]"))) {
    b.addEventListener("click", () => { st.profile.trailColor = b.dataset.trail!; saveProfile(st.profile); refreshSwatches(); });
  }
}

function refreshSwatches(): void {
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-orb]"))) b.classList.toggle("active", b.dataset.orb === st.profile.orbColor);
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-trail]"))) b.classList.toggle("active", b.dataset.trail === st.profile.trailColor);
}

function syncTopBar(): void {
  $("dd-btn-dash").classList.toggle("on", st.profile.dashEnabled);
  $("dd-btn-dash").textContent = st.profile.dashEnabled ? "Dash ON" : "Dash OFF";
  $("dd-btn-cam").classList.toggle("on", st.camera === "overhead");
  $("dd-btn-cam").textContent = st.camera === "overhead" ? "Overhead" : "Tilt Cam";
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-venue]"))) {
    b.classList.toggle("active", b.dataset.venue === st.mazeId);
  }
  for (const id of ["dd-btn-play", "dd-btn-school", "dd-btn-circuit", "dd-btn-studio"]) {
    const el = $(id);
    el.classList.toggle("active",
      (id === "dd-btn-play" && st.runKind === "quick" && st.mode !== "title") ||
      (id === "dd-btn-school" && st.runKind === "school" && st.mode !== "title") ||
      (id === "dd-btn-circuit" && $("dd-circuit").hidden === false) ||
      (id === "dd-btn-studio" && $("dd-studio").hidden === false));
  }
}

let lastMode = "";
export function tickUI(): void {
  // title overlay
  $("dd-title").hidden = st.mode !== "title";
  if (st.mode !== lastMode) {
    lastMode = st.mode;
    syncTopBar();
    if (st.mode === "cleared") showClearCard();
    if (st.mode === "gameover") showGameoverCard();
  }

  const inRun = st.mode !== "title";
  $("dd-hud").style.opacity = inRun ? "1" : "0.25";

  // mode tag + school legend + wave
  $("dd-mode-tag").textContent =
    st.runKind === "school" ? "SENTRY LAB" : st.runKind === "circuit" ? "BOARD MAP" : "QUICK PLAY";
  $("dd-school-legend").hidden = !(st.school && inRun);
  if (st.school) {
    const rows = document.querySelectorAll("#dd-school-legend .dd-school-row");
    GHOST_ORDER.forEach((g, i) => {
      const row = rows[i] as HTMLElement | undefined;
      if (row) row.style.setProperty("--t", "1");
    });
  }

  // HUD numbers
  $("dd-score").textContent = String(st.score).padStart(6, "0");
  $("dd-hiscore").textContent = String(Math.max(st.profile.best, st.score)).padStart(6, "0");
  $("dd-lives").textContent = "●".repeat(Math.max(0, st.lives)) + "○".repeat(Math.max(0, 3 - st.lives));
  $("dd-dots").textContent = String(st.dotsLeft);
  const fruitChip = $("dd-fruit");
  fruitChip.textContent = st.fruitActive ? FRUIT_LABEL[st.maze.def.fruit] : FRUIT_LABEL[st.maze.def.fruit];

  // orb timer + dash
  const orbChip = $("dd-orb-chip");
  orbChip.hidden = st.fright <= 0;
  if (st.fright > 0) ($("dd-orb-fill") as HTMLElement).style.width = `${Math.min(100, (st.fright / 6) * 100)}%`;
  const dashFill = $("dd-dash-fill") as HTMLElement;
  const dashFrac = st.profile.dashEnabled ? Math.max(0, 1 - st.player.dashCd / 1.7) : 0;
  dashFill.style.width = `${dashFrac * 100}%`;
  $("dd-dash-chip").classList.toggle("cooling", st.player.dashCd > 0 || !st.profile.dashEnabled);

  // objective line
  $("dd-objective").textContent = st.school
    ? "Watch each sentry's target tile — colored squares mark where it is heading."
    : `Board ${MAZE_ORDER.indexOf(st.mazeId) + 1}/6 — ${st.maze.def.subtitle}`;

  // banner
  const banner = $("dd-banner");
  const big = $("dd-banner-big");
  const small = $("dd-banner-small");
  if (st.mode === "ready") {
    banner.classList.add("show");
    big.textContent = "LINK UP";
    small.textContent = st.maze.def.title;
  } else if (st.mode === "dying") {
    banner.classList.add("show");
    big.textContent = "INTERCEPTED";
    small.textContent = st.lives > 0 ? `${st.lives} ${st.lives === 1 ? "life" : "lives"} left` : "";
  } else banner.classList.remove("show");

  // toast
  const toast = $("dd-toast");
  if (st.msgT > 0 && st.msg) { toast.textContent = st.msg; toast.classList.add("show"); }
  else toast.classList.remove("show");

  // ghost-tint school legend dots (static — set once)
  const legendDots = document.querySelectorAll<HTMLElement>("#dd-school-legend .dd-dot");
  GHOST_ORDER.forEach((g, i) => {
    const d = legendDots[i];
    if (d) d.style.background = GHOST_TINT[g];
  });
}

function showClearCard(): void {
  const next = MAZE_ORDER[MAZE_ORDER.indexOf(st.mazeId) + 1];
  $("dd-clear-title").textContent = `${st.maze.def.title.toUpperCase()} CLEARED`;
  $("dd-clear-sub").textContent = next && st.runKind === "quick" ? `Next: ${MAZES[next].title}` : "The board is clear.";
  $("dd-clear-stats").innerHTML =
    `<div class="dd-stat">SCORE <b>${st.score}</b></div>` +
    `<div class="dd-stat">LIVES LEFT <b>${st.lives}</b></div>` +
    `<div class="dd-stat">BOARD BEST <b>${st.profile.mazeBest[st.mazeId] ?? st.score}</b></div>`;
  ($("dd-next-maze") as HTMLButtonElement).hidden = !(next && st.runKind === "quick");
  $("dd-clear").hidden = false;
  setTimeout(() => { $("dd-clear").hidden = true; }, 2100);
}

function showGameoverCard(): void {
  $("dd-gameover-sub").textContent = st.school ? "Lab session over." : "The sentries cut your link.";
  $("dd-gameover-stats").innerHTML =
    `<div class="dd-stat">SCORE <b>${st.score}</b></div>` +
    `<div class="dd-stat">BEST <b>${st.profile.best}</b></div>` +
    `<div class="dd-stat">REACHED <b>${st.maze.def.title}</b></div>`;
  $("dd-gameover").hidden = false;
}
