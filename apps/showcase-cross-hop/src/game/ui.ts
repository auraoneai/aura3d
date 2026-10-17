/** Cross Hop DOM shell: title menu, HUD, critterdex, drill picker, death card. */
import { CRITTERS, DRILLS, st, startRun, endToTitle, swapCritter, type CritterDef } from "./core";
import { THEMES } from "./themes";

let root: HTMLElement | null = null;
let panel: "menu" | "tour" | "school" | "studio" | "dex" | null = null;

export function mountUI(host: HTMLElement): void {
  root = document.createElement("div");
  root.id = "ch-hud";
  root.innerHTML = `
    <div id="ch-top">
      <div id="ch-score">0</div>
      <div id="ch-meta">
        <span id="ch-coins">0</span><span id="ch-best">BEST 0</span>
        <span id="ch-theme"></span>
      </div>
    </div>
    <div id="ch-msg"></div>
    <div id="ch-ticker"></div>
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
      <h2 id="ch-death-title"></h2>
      <p id="ch-death-sub"></p>
      <button id="ch-again">HOP AGAIN</button>
      <button id="ch-home">MENU</button>
    </div>
    <div id="ch-sub" class="ch-panel hidden"></div>
    <div id="ch-help">WASD/arrows hop · R restart · Esc menu</div>`;
  host.appendChild(root);
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && st.mode !== "title") { st.mode = "title"; saveClose(); return; }
  if ((e.key === "r" || e.key === "R") && st.mode !== "title") { startRun(st.runKind, st.drill); }
  if (e.key === "Enter" && st.mode === "title" && panel === null) startRun("quick", null);
}
function saveClose(): void { endToTitle(); }

function onClick(e: MouseEvent): void {
  const el = e.target as HTMLElement;
  const btn = el.closest("button") as HTMLButtonElement | null;
  if (!btn) return;
  const m = btn.dataset.m;
  if (m === "quick") { startRun("quick", null); panel = null; }
  else if (m === "school") { panel = "school"; renderSub(); }
  else if (m === "tour") { panel = "tour"; renderSub(); }
  else if (m === "studio") { panel = "studio"; renderSub(); }
  else if (m === "dex") { panel = "dex"; renderSub(); }
  else if (btn.id === "ch-again") { startRun(st.runKind, st.drill); }
  else if (btn.id === "ch-home") { endToTitle(); }
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
    html += `<h2>TIMING SCHOOL</h2>` + DRILLS.map(d =>
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

export function tickUI(): void {
  if (!root) return;
  const inRun = st.mode !== "title";
  (root.querySelector("#ch-menu") as HTMLElement).classList.toggle("hidden", inRun || panel !== null);
  (root.querySelector("#ch-top") as HTMLElement).classList.toggle("hidden", !inRun);
  const dead = root.querySelector("#ch-dead") as HTMLElement;
  const sub = root.querySelector("#ch-sub") as HTMLElement;
  if (panel === null || inRun) sub.classList.add("hidden");
  else if (!sub.innerHTML) renderSub();

  if (st.mode === "dead") {
    dead.classList.remove("hidden");
    const t = root.querySelector("#ch-death-title") as HTMLElement;
    const s = root.querySelector("#ch-death-sub") as HTMLElement;
    t.textContent = st.dead ? st.dead.label.toUpperCase() : "RUN COMPLETE";
    s.textContent = `Score ${st.score} · Coins +${st.coins} · Best ${st.profile.best}`;
  } else dead.classList.add("hidden");

  if (inRun) {
    (root.querySelector("#ch-score") as HTMLElement).textContent = String(st.score);
    (root.querySelector("#ch-coins") as HTMLElement).textContent = `◈ ${st.coins + st.profile.coins}`;
    (root.querySelector("#ch-best") as HTMLElement).textContent = `BEST ${st.profile.best}`;
    (root.querySelector("#ch-theme") as HTMLElement).textContent = THEMES[st.themeIdx].label.toUpperCase();
    (root.querySelector("#ch-ticker") as HTMLElement).textContent = st.events.slice(-1)[0] ?? "";
    (root.querySelector("#ch-msg") as HTMLElement).textContent = st.messageT > 0 ? st.message : "";
  }
}
