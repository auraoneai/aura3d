/** Cross Hop DOM shell: compact side-plaque menu, AuraOne HUD, critter studio, drill picker, death card, mobile D-pad. */
import { CRITTERS, DRILLS, st, startRun, restartRun, endToTitle, swapCritter, displayCoins, setPaused, type CritterDef } from "./core";
import { saveProfile } from "./persistence";
import { THEMES } from "./themes";

export type HopAction = "up" | "down" | "left" | "right";

let root: HTMLElement | null = null;
let panel: "menu" | "tour" | "school" | "studio" | "dex" | null = null;
let uiSound: () => void = () => undefined;
let uiHop: (action: HopAction) => void = () => undefined;

/** Menu and quick-bar buttons play the `ui` cue (CH-14). */
export function setUiSound(fn: () => void): void { uiSound = fn; }
/** Coarse-pointer directional hop pad routes buffered actions into main.ts. */
export function setUiHop(fn: (action: HopAction) => void): void { uiHop = fn; }

/** First-run objective card (CH-E2): shown for this long on the first run, then the profile remembers it. */
const INTRO_MS = 3000;
let introUntil = 0;
const coarsePointer = (): boolean => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export function mountUI(host: HTMLElement): void {
  root = document.createElement("div");
  root.id = "ch-hud";
  root.innerHTML = `
    <div id="ch-top">
      <div id="ch-score-wrap">
        <span class="ch-cap">steps</span>
        <div id="ch-score">0</div>
      </div>
      <div id="ch-theme"></div>
      <div id="ch-meta">
        <span id="ch-coins" class="ch-pill"><span class="ch-pill-label">coins</span><span id="ch-coins-val">0</span></span>
        <span id="ch-best" class="ch-pill"><span class="ch-pill-label">best</span><span id="ch-best-val">0</span></span>
        <span id="ch-seed-pill" class="ch-pill ch-mono"></span>
      </div>
    </div>
    <div id="ch-msg"></div>
    <div id="ch-intro" class="hidden" role="status">
      <b>Hop across sunlit lanes.</b>
      <span>Dodge cars and coupled trains, ride damp bark rafts across rivers, and keep moving before the hawk swoops.</span>
      <span id="ch-intro-keys"></span>
    </div>
    <button id="ch-pause-btn" type="button" aria-label="Pause">II</button>
    <div id="ch-dpad" class="hidden" role="group" aria-label="Directional hop controls">
      <button type="button" class="ch-dpad-btn ch-dpad-up" data-hop="up" aria-label="Hop forward">▲</button>
      <button type="button" class="ch-dpad-btn ch-dpad-left" data-hop="left" aria-label="Hop left">◀</button>
      <button type="button" class="ch-dpad-btn ch-dpad-down" data-hop="down" aria-label="Hop back">▼</button>
      <button type="button" class="ch-dpad-btn ch-dpad-right" data-hop="right" aria-label="Hop right">▶</button>
    </div>
    <div id="ch-paused" class="ch-panel ch-modal hidden">
      <h2>paused</h2>
      <button id="ch-resume" type="button" class="ch-btn-primary">Resume Run</button>
      <button id="ch-home2" type="button" class="ch-btn-ghost">Main Menu</button>
    </div>
    <div id="ch-menu" class="ch-panel ch-plaque">
      <span class="ch-kicker">isometric lane hopper</span>
      <h1>Cross Hop</h1>
      <p class="ch-sub">Six sunlit worlds, twelve critters, rivers, rails, and traffic.</p>
      <button type="button" data-m="quick" class="ch-btn-primary">Quick Play</button>
      <div class="ch-menu-grid">
        <button type="button" data-m="tour">World Tour</button>
        <button type="button" data-m="studio">Critter Studio</button>
        <button type="button" data-m="school">Timing School</button>
        <button type="button" data-m="dex">Critterdex</button>
      </div>
      <p class="ch-hint">WASD / arrows / tap or swipe to hop. Keep moving — the hawk watches idle critters.</p>
    </div>
    <div id="ch-dead" class="ch-panel ch-modal hidden">
      <p id="ch-newbest" class="hidden">new best</p>
      <h2 id="ch-death-title"></h2>
      <div id="ch-death-stats" class="ch-stats-row">
        <div class="ch-stat"><span class="ch-cap">steps</span><span id="ch-stat-score" class="ch-stat-num">0</span></div>
        <div class="ch-stat"><span class="ch-cap">coins</span><span id="ch-stat-coins" class="ch-stat-num">0</span></div>
        <div class="ch-stat"><span class="ch-cap">best</span><span id="ch-stat-best" class="ch-stat-num">0</span></div>
        <div class="ch-stat"><span class="ch-cap">close</span><span id="ch-stat-near" class="ch-stat-num">0</span></div>
      </div>
      <p id="ch-death-sub"></p>
      <p id="ch-death-unlocks"></p>
      <div class="ch-modal-actions">
        <button id="ch-again" type="button" class="ch-btn-primary">Hop Again</button>
        <button id="ch-home" type="button" class="ch-btn-ghost">Menu</button>
      </div>
    </div>
    <div id="ch-sub" class="ch-panel ch-plaque hidden"></div>
    <div id="ch-help">WASD / Arrows hop · P pause · R restart · Esc menu</div>`;
  host.appendChild(root);
  root.addEventListener("click", onClick);
  root.querySelector("#ch-dpad")?.addEventListener("pointerdown", onDpadPointerDown);
  document.addEventListener("keydown", onKey);
  document.querySelector(".aura3d-top-bar")?.addEventListener("click", onBarClick);
}

const GAME_KEYS = new Set([" ", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function onKey(e: KeyboardEvent): void {
  // CH-7: while a run is live, hop keys belong to the game. A focused button must not also activate on Space/Enter.
  if (st.mode !== "title" && GAME_KEYS.has(e.key) && (e.target as HTMLElement | null)?.closest?.("button")) e.preventDefault();
  if (e.key === "Escape" && st.mode !== "title") { endToTitle(); return; }
  if ((e.key === "p" || e.key === "P") && st.mode === "run") { setPaused(!st.paused); return; }
  if ((e.key === "r" || e.key === "R") && st.mode !== "title") { restartRun(); }
  if (e.key === "Enter" && st.mode === "title" && panel === null) startRun("quick", null);
}

/** CH-7: a clicked button gives focus back, so Space and Enter go to the game, not to the button again. */
function release(btn: HTMLButtonElement): void {
  btn.blur();
  uiSound();
}

function onDpadPointerDown(e: Event): void {
  const pe = e as PointerEvent;
  const btn = (pe.target as HTMLElement | null)?.closest?.("button[data-hop]") as HTMLButtonElement | null;
  if (!btn) return;
  pe.preventDefault();
  pe.stopPropagation();
  btn.blur();
  const dir = btn.dataset.hop as HopAction | undefined;
  if (dir === "up" || dir === "down" || dir === "left" || dir === "right") {
    uiHop(dir);
  }
}

function onBarClick(e: Event): void {
  const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!btn) return;
  release(btn);
  panel = null;
  if (btn.id === "ch-bar-quick") startRun("quick", null);
  else if (btn.dataset.chTheme) {
    const i = parseInt(btn.dataset.chTheme, 10);
    startRun("tour", null, (i + 1) * 97777 + 13, i);
  }
}

function onClick(e: MouseEvent): void {
  const el = e.target as HTMLElement;
  const btn = el.closest("button") as HTMLButtonElement | null;
  if (!btn || btn.dataset.hop) return;
  release(btn);
  const m = btn.dataset.m;
  if (m === "quick") { startRun("quick", null); panel = null; }
  else if (m === "school") { panel = "school"; renderSub(); }
  else if (m === "tour") { panel = "tour"; renderSub(); }
  else if (m === "studio") { panel = "studio"; renderSub(); }
  else if (m === "dex") { panel = "dex"; renderSub(); }
  else if (btn.id === "ch-again") { restartRun(); }
  else if (btn.id === "ch-home" || btn.id === "ch-home2") { endToTitle(); }
  else if (btn.id === "ch-pause-btn") { setPaused(!st.paused); }
  else if (btn.id === "ch-resume") { setPaused(false); }
  else if (btn.dataset.drill) {
    const d = DRILLS.find(x => x.id === btn.dataset.drill);
    if (d) { startRun("drill", d); panel = null; }
  } else if (btn.dataset.theme) {
    startRun("tour", null, (parseInt(btn.dataset.theme, 10) + 1) * 97777 + 13, parseInt(btn.dataset.theme, 10));
    panel = null;
  } else if (btn.dataset.critter) {
    const c = CRITTERS.find(x => x.id === btn.dataset.critter);
    if (c) pickCritter(c);
  } else if (btn.id === "ch-back") { panel = null; }
}

function pickCritter(c: CritterDef): void {
  const unlocked = st.profile.unlocked.includes(c.id);
  if (!unlocked) {
    if (st.profile.coins >= c.price) {
      st.profile.coins -= c.price;
      st.profile.unlocked.push(c.id);
      swapCritter(c);
    } else { flash(`Need ${c.price} coins`); return; }
  } else swapCritter(c);
  renderSub();
}

function flash(msg: string): void {
  const el = root?.querySelector("#ch-msg");
  if (el) el.textContent = msg;
}

function renderSub(): void {
  const el = root?.querySelector("#ch-sub") as HTMLElement;
  if (!el) return;
  let html = `<button id="ch-back" type="button" class="ch-back">← Back</button>`;
  if (panel === "school") {
    html += `<h2>timing school</h2><p class="ch-hint">Short practice courses that pay coins without affecting Best.</p><div class="ch-list">` + DRILLS.map(d =>
      `<button type="button" data-drill="${d.id}" class="ch-card"><b>${d.label}</b><i>${d.desc}</i>${st.profile.drills.includes(d.id) ? '<em>cleared</em>' : ""}</button>`).join("") + `</div>`;
  } else if (panel === "tour") {
    html += `<h2>world tour</h2><div class="ch-list">` + THEMES.map((t, i) =>
      `<button type="button" data-theme="${i}" class="ch-card"><b>${t.label}</b><i>Seeded departure in ${t.label}.</i></button>`).join("") + `</div>`;
  } else if (panel === "studio" || panel === "dex") {
    html += `<h2>${panel === "studio" ? "critter studio" : "critterdex"}</h2><div class="ch-grid">` +
      CRITTERS.map(c => {
        const un = st.profile.unlocked.includes(c.id);
        const sel = st.profile.selected === c.id;
        return `<button type="button" data-critter="${c.id}" class="ch-crit ${sel ? "sel" : ""} ${un ? "" : "lock"}">
          <b>${un ? c.label : "Locked"}</b><i>${un ? c.tagline : c.price + " coins"}</i></button>`;
      }).join("") + `</div><p class="ch-hint">Bank: ${st.profile.coins} coins · rescue pods unlock critters free.</p>`;
  }
  el.innerHTML = html;
  el.classList.remove("hidden");
}

function tickIntro(): void {
  const el = root?.querySelector("#ch-intro") as HTMLElement | null;
  if (!el) return;
  const now = performance.now();
  if (introUntil === 0 && st.mode === "run" && !st.profile.seenIntro) {
    introUntil = now + INTRO_MS;
    (root!.querySelector("#ch-intro-keys") as HTMLElement).textContent = coarsePointer()
      ? "Tap, swipe, or use the corner hop pad to step in four directions."
      : "W / Up to hop ahead. A, D, S or Arrows to step aside. P pauses.";
    st.profile.seenIntro = true;
    saveProfile(st.profile);
  }
  el.classList.toggle("hidden", !(introUntil > now && st.mode === "run"));
}

export function tickUI(): void {
  if (!root) return;
  const inRun = st.mode !== "title";
  (root.querySelector("#ch-menu") as HTMLElement).classList.toggle("hidden", inRun || panel !== null);
  (root.querySelector("#ch-top") as HTMLElement).classList.toggle("hidden", !inRun);
  (root.querySelector("#ch-pause-btn") as HTMLElement).classList.toggle("hidden", st.mode !== "run");
  (root.querySelector("#ch-paused") as HTMLElement).classList.toggle("hidden", !(st.paused && st.mode === "run"));
  (root.querySelector("#ch-dpad") as HTMLElement).classList.toggle("hidden", !(st.mode === "run" && !st.paused));
  const dead = root.querySelector("#ch-dead") as HTMLElement;
  const sub = root.querySelector("#ch-sub") as HTMLElement;
  if (panel === null || inRun) sub.classList.add("hidden");
  else if (!sub.innerHTML) renderSub();
  tickIntro();

  if (st.mode === "dead") {
    dead.classList.remove("hidden");
    const t = root.querySelector("#ch-death-title") as HTMLElement;
    const s = root.querySelector("#ch-death-sub") as HTMLElement;
    t.textContent = st.dead ? st.dead.label.toLowerCase() : "drill complete";
    (root.querySelector("#ch-stat-score") as HTMLElement).textContent = String(st.score);
    (root.querySelector("#ch-stat-coins") as HTMLElement).textContent = String(st.coins);
    (root.querySelector("#ch-stat-best") as HTMLElement).textContent = String(st.profile.best);
    (root.querySelector("#ch-stat-near") as HTMLElement).textContent = String(st.nearMisses);
    s.textContent = `Reached row ${st.row} in ${THEMES[st.themeIdx].label}`;
    (root.querySelector("#ch-death-unlocks") as HTMLElement).textContent = st.runUnlocks.length ? `Unlocked: ${st.runUnlocks.join(", ")}` : "";
    (root.querySelector("#ch-newbest") as HTMLElement).classList.toggle("hidden", !st.newBest);
  } else dead.classList.add("hidden");

  if (inRun) {
    (root.querySelector("#ch-score") as HTMLElement).textContent = String(st.score);
    (root.querySelector("#ch-coins-val") as HTMLElement).textContent = String(displayCoins());
    (root.querySelector("#ch-best-val") as HTMLElement).textContent = String(st.profile.best);
    (root.querySelector("#ch-theme") as HTMLElement).textContent = THEMES[st.themeIdx].label.toLowerCase();
    const seedEl = root.querySelector("#ch-seed-pill") as HTMLElement | null;
    if (seedEl) seedEl.textContent = `#${(st.seed >>> 0).toString(16).slice(0, 6)}`;
    document.querySelectorAll<HTMLButtonElement>(".aura3d-top-bar button[data-ch-theme]").forEach(b => {
      b.classList.toggle("active", st.mode !== "title" && st.runKind === "tour" && parseInt(b.dataset.chTheme ?? "-1", 10) === st.themeIdx);
    });
    document.getElementById("ch-bar-quick")?.classList.toggle("active", st.mode !== "title" && st.runKind === "quick");
    const showing = st.messageT > 0;
    (root.querySelector("#ch-msg") as HTMLElement).textContent = showing ? st.message : "";
  }
}
