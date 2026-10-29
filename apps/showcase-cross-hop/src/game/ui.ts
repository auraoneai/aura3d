/** Cross Hop DOM shell: title menu, HUD, critterdex, drill picker, death card. */
import { CRITTERS, DRILLS, st, startRun, restartRun, endToTitle, swapCritter, displayCoins, setPaused, type CritterDef } from "./core";
import { saveProfile } from "./persistence";
import { THEMES } from "./themes";

let root: HTMLElement | null = null;
let panel: "menu" | "tour" | "school" | "studio" | "dex" | null = null;
let uiSound: () => void = () => undefined;
/** Menu and quick-bar buttons play the `ui` cue (CH-14). */
export function setUiSound(fn: () => void): void { uiSound = fn; }

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
        <span class="ch-cap">SCORE</span>
        <div id="ch-score">0</div>
      </div>
      <div id="ch-theme"></div>
      <div id="ch-meta">
        <span id="ch-coins" class="ch-pill">◈ 0</span>
        <span id="ch-best" class="ch-pill">BEST 0</span>
      </div>
    </div>
    <div id="ch-msg"></div>
    <div id="ch-ticker"></div>
    <div id="ch-intro" class="hidden" role="status">
      <b>Hop as far as you can.</b>
      <span>Dodge cars and trains, ride logs across rivers, and keep moving: the hawk takes critters that stand still.</span>
      <span id="ch-intro-keys"></span>
    </div>
    <button id="ch-pause-btn" type="button" aria-label="Pause">II</button>
    <div id="ch-paused" class="ch-panel hidden">
      <h2>PAUSED</h2>
      <button id="ch-resume" type="button">RESUME</button>
      <button id="ch-home2" type="button">MENU</button>
    </div>
    <div id="ch-menu" class="ch-panel">
      <h1>CROSS HOP</h1>
      <p class="ch-sub">Endless lane-hopper — six worlds, twelve critters.</p>
      <button data-m="quick">QUICK PLAY</button>
      <button data-m="school">TIMING SCHOOL</button>
      <button data-m="tour">WORLD TOUR</button>
      <button data-m="studio">PLAYER STUDIO</button>
      <button data-m="dex">CRITTERDEX</button>
      <p class="ch-hint">WASD / arrows / swipe — hop. Don't idle; the hawk is patient.</p>
    </div>
    <div id="ch-dead" class="ch-panel hidden">
      <p id="ch-newbest" class="hidden">NEW BEST!</p>
      <h2 id="ch-death-title"></h2>
      <p id="ch-death-sub"></p>
      <p id="ch-death-unlocks"></p>
      <button id="ch-again">HOP AGAIN</button>
      <button id="ch-home">MENU</button>
    </div>
    <div id="ch-sub" class="ch-panel hidden"></div>
    <div id="ch-help">WASD/arrows hop · P pause · R restart · Esc menu</div>`;
  host.appendChild(root);
  root.addEventListener("click", onClick);
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
  if (!btn) return;
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
  let html = `<button id="ch-back" class="ch-back">← BACK</button>`;
  if (panel === "school") {
    html += `<h2>TIMING SCHOOL</h2><p class="ch-hint">Drills are short practice courses. They pay coins but do not count toward Best.</p>` + DRILLS.map(d =>
      `<button data-drill="${d.id}" class="ch-card"><b>${d.label}</b><i>${d.desc}</i>${st.profile.drills.includes(d.id) ? '<em>CLEARED</em>' : ""}</button>`).join("");
  } else if (panel === "tour") {
    html += `<h2>WORLD TOUR</h2>` + THEMES.map((t, i) =>
      `<button data-theme="${i}" class="ch-card"><b>${t.label}</b><i>Start a run seeded in ${t.label}.</i></button>`).join("");
  } else if (panel === "studio" || panel === "dex") {
    html += `<h2>${panel === "studio" ? "PLAYER STUDIO" : "CRITTERDEX"}</h2><div class="ch-grid">` +
      CRITTERS.map(c => {
        const un = st.profile.unlocked.includes(c.id);
        const sel = st.profile.selected === c.id;
        return `<button data-critter="${c.id}" class="ch-crit ${sel ? "sel" : ""} ${un ? "" : "lock"}">
          <b>${un ? c.label : "???"}</b><i>${un ? c.tagline : c.price + " coins"}</i></button>`;
      }).join("") + `</div><p class="ch-hint">Coins: ${st.profile.coins} — rescue pods unlock critters free.</p>`;
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
      ? "Tap or swipe up to hop. Swipe left, right or down to step aside."
      : "W or Up to hop. A, D, S or the arrows to step aside. P pauses.";
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
  const dead = root.querySelector("#ch-dead") as HTMLElement;
  const sub = root.querySelector("#ch-sub") as HTMLElement;
  if (panel === null || inRun) sub.classList.add("hidden");
  else if (!sub.innerHTML) renderSub();
  tickIntro();

  if (st.mode === "dead") {
    dead.classList.remove("hidden");
    const t = root.querySelector("#ch-death-title") as HTMLElement;
    const s = root.querySelector("#ch-death-sub") as HTMLElement;
    t.textContent = st.dead ? st.dead.label.toUpperCase() : "RUN COMPLETE";
    s.textContent = `Score ${st.score} · Rows ${st.row} · Coins +${st.coins} · Best ${st.profile.best}`;
    (root.querySelector("#ch-death-unlocks") as HTMLElement).textContent = st.runUnlocks.length ? `Unlocked: ${st.runUnlocks.join(", ")}` : "";
    (root.querySelector("#ch-newbest") as HTMLElement).classList.toggle("hidden", !st.newBest);
  } else dead.classList.add("hidden");

  if (inRun) {
    (root.querySelector("#ch-score") as HTMLElement).textContent = String(st.score);
    (root.querySelector("#ch-coins") as HTMLElement).textContent = `◈ ${displayCoins()}`;
    (root.querySelector("#ch-best") as HTMLElement).textContent = `BEST ${st.profile.best}`;
    (root.querySelector("#ch-theme") as HTMLElement).textContent = THEMES[st.themeIdx].label.toUpperCase();
    document.querySelectorAll<HTMLButtonElement>(".aura3d-top-bar button[data-ch-theme]").forEach(b => {
      b.classList.toggle("active", st.mode !== "title" && st.runKind === "tour" && parseInt(b.dataset.chTheme ?? "-1", 10) === st.themeIdx);
    });
    document.getElementById("ch-bar-quick")?.classList.toggle("active", st.mode !== "title" && st.runKind === "quick");
    // CH-E6: the banner shows the latest event; the ticker lists the ones before it, so nothing shows twice.
    const showing = st.messageT > 0;
    (root.querySelector("#ch-ticker") as HTMLElement).textContent = st.events.slice(showing ? -4 : -3, showing ? -1 : undefined).join("  ·  ");
    (root.querySelector("#ch-msg") as HTMLElement).textContent = showing ? st.message : "";
  }
}
