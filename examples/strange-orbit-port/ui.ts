/**
 * Presentation layer for the title, HUD, pause and result screens. It injects its own stylesheet and enhances the
 * existing DOM by id, so the example page and the live showcase wrapper (which carries its own HTML copy) both get it.
 * Uses strictly AuraOne licensed self-hosted font tokens (`var(--font-ui)` Whitney, `var(--font-metric)` DIN Pro,
 * `var(--font-mono)` Monument Grotesk Mono) with zero synthetic weights and `>= 44x44px` touch ergonomics.
 */
const CSS = /* css */ `
:root {
  --ink: #eef3fa;
  --muted: #a8b6ca;
  --panel: rgba(9, 13, 24, 0.80);
  --line: rgba(255, 255, 255, 0.15);
  --warm: #f3e4c6;
  --jade: #7fe0cf;
  --ember: #f0a56b;
}
html { font-synthesis: none; }
html, body {
  background: #060911;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.45;
}
.aura-credit { font-family: var(--font-ui) !important; font-size: 12px !important; }
.panel, #hud .block, #order {
  background: var(--hud-glass-bg, var(--panel));
  border: 1px solid var(--hud-glass-border, var(--line));
  box-shadow: var(--hud-glass-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.12)), var(--hud-shadow, 0 10px 28px rgba(2, 6, 16, 0.42));
  border-radius: 10px;
  backdrop-filter: blur(12px) saturate(135%);
  -webkit-backdrop-filter: blur(12px) saturate(135%);
}
h1, h2, button, .kicker, .orbit-brand, .orbit-tag, .tagline, #banner, #notice, #lap, #section, #best-lap, #gravity {
  font-family: var(--font-ui);
}
#speed, #timer, #place, #count, #result-place, #result-time, #result-score, #energy-value, #dust {
  font-family: var(--font-metric);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
h2 { font-size: 20px; font-weight: 600; color: var(--warm); letter-spacing: -0.01em; }
button {
  font-family: var(--font-ui);
  border-radius: 6px;
  background: rgba(238, 243, 250, 0.08);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  min-height: 36px;
  padding: 9px 14px;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}
button:hover:not(:disabled) { background: rgba(238, 243, 250, 0.16); transform: translateY(-1px); }
button.primary { background: var(--warm); color: #101622; font-size: 15px; font-weight: 600; min-height: 44px; padding: 11px 22px; border-color: transparent; }
button.primary:hover:not(:disabled) { background: #fff5e2; }
button[aria-pressed="true"] { border-color: var(--warm); background: rgba(243, 228, 198, 0.18); color: var(--warm); }

.overlay { background: rgba(5, 9, 17, 0.56); padding-bottom: var(--a3d-bar-space, 0px); }
#menu {
  background: linear-gradient(90deg, rgba(5, 9, 18, 0.92) 0%, rgba(5, 9, 18, 0.62) 40%, rgba(5, 9, 18, 0) 74%);
  padding-left: 6vw;
  padding-bottom: calc(var(--a3d-bar-space, 0px) + 16px);
}
#menu .panel { background: transparent; border: 0; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; width: min(472px, 92vw); gap: 10px; padding: 0; }
#menu h1 {
  font-size: clamp(44px, 7vw, 76px);
  line-height: 0.96;
  font-weight: 600;
  color: var(--warm);
  letter-spacing: -0.02em;
  text-shadow: 0 8px 36px rgba(0, 0, 0, 0.6);
}
#menu .kicker {
  font-size: 12px;
  font-weight: 500;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.04em;
  color: var(--jade);
}
#menu .tagline { font-size: 15px; font-weight: 400; color: var(--ink); margin: 0; }
.orbit-brand {
  position: fixed;
  top: 18px;
  left: 6vw;
  font-size: 12px;
  font-weight: 500;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.04em;
  color: var(--muted);
  pointer-events: none;
}
.orbit-tag {
  position: fixed;
  right: 32px;
  bottom: calc(var(--a3d-bar-space, 0px) + 24px);
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.015em;
  color: rgba(238, 243, 250, 0.44);
  pointer-events: none;
}

#hud { z-index: 3; }
#hud .top {
  top: max(12px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  right: max(12px, env(safe-area-inset-right));
  gap: 10px;
}
#hud .block { padding: 8px 12px; min-width: 124px; }
#hud .meta { font-size: 12px; font-weight: 500; color: var(--muted); font-variant-numeric: tabular-nums; }
#hud .top .block > .meta:first-child { font-variant-caps: all-small-caps; letter-spacing: 0.03em; line-height: 1.15; }
#hud .value { font-size: 22px; font-weight: 500; line-height: 1.15; color: var(--warm); font-variant-numeric: tabular-nums; }
#lap { font-family: var(--font-ui); font-weight: 600; font-variant-numeric: tabular-nums; }
#speed { font-size: 42px !important; line-height: 1; }
#hud.hud-gouache > .bottom { display: none; }
#hud > .bottom {
  left: max(12px, env(safe-area-inset-left));
  right: max(12px, env(safe-area-inset-right));
  bottom: calc(var(--a3d-bar-space, 0px) + max(12px, env(safe-area-inset-bottom)));
}

/* Unified orbital telemetry cluster (.gouache-hud) */
.gouache-hud {
  position: absolute;
  right: max(12px, env(safe-area-inset-right));
  bottom: calc(var(--a3d-bar-space, 0px) + max(14px, env(safe-area-inset-bottom)));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  pointer-events: none;
}
body.touch-on .gouache-hud {
  bottom: auto;
  top: 236px;
}
.gouache-telemetry {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-end;
  text-align: right;
}
.gouache-sector {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.1;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(238, 243, 250, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: var(--ink);
}
.gouache-sector-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.gouache-gap { font-size: 12px; line-height: 1.2; color: var(--warm); }
.gouache-status { display: flex; gap: 8px; font-size: 12px; line-height: 1.2; color: var(--muted); }
.gouache-grav { color: var(--jade); font-weight: 500; }
.gouache-gauge { position: relative; width: 88px; height: 88px; flex: 0 0 auto; }
.gouache-gauge svg { display: block; }
.gouache-gauge-readout {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 6px;
}
.gouache-speed-num { font-size: 25px; line-height: 1; color: var(--ink); }
.gouache-speed-unit { font-family: var(--font-ui); font-size: 12px; font-weight: 500; line-height: 1.1; color: var(--muted); }
.gouache-map { flex: 0 0 auto; display: block; }

#order { top: 88px; right: max(12px, env(safe-area-inset-right)); min-width: 156px; padding: 7px 11px; }
#order li { font-family: var(--font-ui); font-size: 12px; font-weight: 400; line-height: 1.6; font-variant-numeric: tabular-nums; }
#order li.you { color: var(--ember); font-weight: 600; }
#order li span:last-child { font-family: var(--font-mono); font-size: 12px; }
#hud-tools { position: absolute; top: 88px; left: max(12px, env(safe-area-inset-left)); display: flex; gap: 8px; pointer-events: auto; }
#hud-tools button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 500;
  background: var(--hud-glass-bg, var(--panel));
  touch-action: manipulation;
}
#banner {
  top: 96px;
  font-size: 17px;
  font-weight: 600;
  color: var(--jade);
  text-shadow: 0 2px 14px rgba(2, 8, 18, 0.85);
}
#notice {
  font-size: 18px;
  font-weight: 500;
  color: var(--warm);
  top: 142px;
  bottom: auto;
  text-shadow: 0 2px 12px rgba(2, 8, 18, 0.88);
}

#countdown { place-items: end center; padding-bottom: calc(var(--a3d-bar-space, 0px) + 12vh); box-sizing: border-box; }
.meter { height: 7px; border-radius: 4px; background: rgba(238, 243, 250, 0.14); }
.meter > i { background: linear-gradient(90deg, var(--jade), var(--ember)); }
#progress { bottom: var(--a3d-bar-space, 0px); height: 3px; }
#progress > i { background: linear-gradient(90deg, var(--jade), var(--warm)); }
#count { font-size: 144px; font-weight: 500; letter-spacing: -0.02em; color: var(--warm); text-shadow: 0 4px 48px rgba(0, 0, 0, 0.65); }
#loading { background: #060911; }
#difficulty-row { gap: 8px; }
.orbit-hint { font-size: 12px; color: var(--muted); margin: 0; font-variant-numeric: tabular-nums; }
#menu .meta { font-size: 12px; margin: 0; }
.menu-row-label { font-size: 12px; font-weight: 500; font-variant-caps: all-small-caps; letter-spacing: 0.03em; color: var(--muted); min-width: 52px; }
#menu .row button { min-height: 40px; }
#best-time, #result-best { margin: 0; font-variant-numeric: tabular-nums; }

@media (max-height: 640px) {
  .orbit-brand { display: none; }
  #menu h1 { font-size: 52px; }
  #menu .tagline { font-size: 14px; }
}

@media (pointer: coarse), (max-width: 760px) {
  button, #menu .row button, .overlay button, #hud-tools button {
    min-width: 44px;
    min-height: 44px;
    touch-action: manipulation;
  }
}

@media (max-width: 760px) {
  #hud .top {
    top: max(8px, env(safe-area-inset-top));
    left: max(8px, env(safe-area-inset-left));
    right: max(8px, env(safe-area-inset-right));
    gap: 6px;
  }
  #hud .top .block { min-width: 0; flex: 1 1 0; padding: 6px 8px; }
  #hud .top .value { font-size: 17px; white-space: nowrap; }
  #hud .meta { font-size: 12px; }
  #hud-tools { top: 72px; left: max(8px, env(safe-area-inset-left)); gap: 6px; }
  #order {
    top: 72px;
    right: max(8px, env(safe-area-inset-right));
    min-width: 126px;
    padding: 5px 8px;
  }
  #order li { line-height: 1.45; }
  #order li:nth-child(n+4):not(.you) { display: none; }
  #banner {
    top: 122px;
    left: max(8px, env(safe-area-inset-left));
    transform: none;
    max-width: calc(100% - 148px);
    font-size: 15px;
  }
  .gouache-hud, body.touch-on .gouache-hud {
    top: 156px;
    bottom: auto;
    left: max(8px, env(safe-area-inset-left));
    right: max(8px, env(safe-area-inset-right));
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
  }
  .gouache-telemetry { align-items: flex-start; text-align: left; min-width: 0; flex: 1 1 auto; }
  .gouache-gauge { width: 74px; height: 74px; }
  .gouache-gauge svg { width: 74px; height: 74px; }
  .gouache-speed-num { font-size: 21px; }
  .gouache-map { width: 62px; height: 62px; }
  #notice, body.touch-on #notice {
    top: 246px;
    bottom: auto;
    font-size: 15px;
    max-width: 90vw;
  }
  #hud > .bottom {
    left: max(8px, env(safe-area-inset-left));
    right: max(8px, env(safe-area-inset-right));
    bottom: calc(var(--a3d-bar-space, 0px) + max(8px, env(safe-area-inset-bottom)));
    gap: 8px;
  }
  #speed { font-size: 32px !important; }
  .keys { display: none; }
  #menu .panel {
    background: var(--hud-glass-bg, rgba(9, 13, 24, 0.80));
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 14px;
    width: min(460px, calc(100vw - 20px));
    gap: 7px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .orbit-tag { display: none; }
  .orbit-brand { left: max(12px, env(safe-area-inset-left)); }
}

/* Portrait phones (SO-5): the menu sits at the top and the menu camera frames the riders in the lower third. */
@media (max-aspect-ratio: 17/20) {
  #menu {
    place-items: start center;
    padding: max(38px, env(safe-area-inset-top)) 10px calc(var(--a3d-bar-space, 0px) + 10px);
  }
  #menu .panel { gap: 6px; }
  #menu h1 { font-size: 36px; }
  #menu .h1-br { display: none; }
  .orbit-brand { top: max(12px, env(safe-area-inset-top)); }
}
`;

const DIFFICULTIES: readonly { id: string; label: string; blurb: string }[] = [
  { id: "explorer", label: "Explorer", blurb: "Forgiving edges, 5 rescues, relaxed rivals" },
  { id: "racer", label: "Racer", blurb: "Precise lines, 3 rescues, competitive rivals" },
  { id: "expert", label: "Expert", blurb: "Exposed edges, 2 rescues, relentless rivals" }
];

const byId = (id: string): HTMLElement | null => document.getElementById(id);

const RIDER_CHOICES: readonly { id: string; label: string }[] = [{ id: "0", label: "Sol" }, { id: "1", label: "Ciel" }, { id: "2", label: "Ember" }];
const MODE_CHOICES: readonly { id: string; label: string; blurb: string }[] = [
  { id: "cup", label: "Cup", blurb: "Seven laps against five rivals" },
  { id: "trial", label: "Time trial", blurb: "Five laps alone against your best ghost" },
  { id: "free", label: "Free ride", blurb: "No finish line, no rivals' clock" }
];

export interface OrbitUiChoices {
  readonly difficulty: string;
  readonly rider: number;
  readonly mode: string;
}

function choiceRow(doc: Document, id: string, label: string, choices: readonly { id: string; label: string; blurb?: string }[], current: string, onPick: (value: string) => void): HTMLElement {
  const row = doc.createElement("div");
  row.className = "row";
  row.id = id;
  const tag = doc.createElement("span");
  tag.className = "menu-row-label";
  tag.textContent = label;
  row.appendChild(tag);
  for (const c of choices) {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = c.label;
    if (c.blurb) button.title = c.blurb;
    button.dataset.choice = c.id;
    button.setAttribute("aria-pressed", String(c.id === current));
    button.addEventListener("click", () => onPick(c.id));
    row.appendChild(button);
  }
  return row;
}

/** Append a button to the row that holds `anchorId`. */
function addButton(doc: Document, anchorId: string, id: string, label: string): void {
  const row = doc.getElementById(anchorId)?.parentElement;
  if (!row || doc.getElementById(id)) return;
  const button = doc.createElement("button");
  button.type = "button";
  button.id = id;
  button.textContent = label;
  row.appendChild(button);
}

export function installOrbitUi(params: URLSearchParams, choices: OrbitUiChoices): void {
  const { difficulty } = choices;
  const style = document.createElement("style");
  style.id = "orbit-ui-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  const brand = document.createElement("div");
  brand.className = "orbit-brand";
  brand.id = "orbit-brand";
  brand.textContent = "Craterline Cup · Low-G Lunar Circuit";
  const tag = document.createElement("div");
  tag.className = "orbit-tag";
  tag.id = "orbit-tag";
  tag.textContent = "Above. Below. Beyond.";
  const menu = byId("menu");
  if (menu) {
    menu.append(brand, tag);
    const panel = menu.querySelector(".panel");
    const h1 = panel?.querySelector("h1");
    if (panel && h1) {
      const kicker = document.createElement("div");
      kicker.className = "kicker";
      kicker.textContent = "Lunar crater rim grand prix";
      panel.insertBefore(kicker, h1);
      h1.innerHTML = 'Craterline <br class="h1-br">GP';
      const lead = panel.querySelector("p.meta");
      if (lead) { lead.className = "tagline"; lead.textContent = "Carve the regolith rings. Sling across zero-G gaps."; }
      const startRow = byId("start")?.parentElement ?? null;
      const row = document.createElement("div");
      row.className = "row";
      row.id = "difficulty-row";
      const diffTag = document.createElement("span");
      diffTag.className = "menu-row-label";
      diffTag.textContent = "Class";
      row.appendChild(diffTag);
      for (const d of DIFFICULTIES) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = d.label;
        button.title = d.blurb;
        button.dataset.difficulty = d.id;
        button.setAttribute("aria-pressed", String(d.id === difficulty));
        button.addEventListener("click", () => { params.set("difficulty", d.id); location.search = params.toString(); });
        row.appendChild(button);
      }
      const reload = (key: string) => (value: string) => { params.set(key, value); location.search = params.toString(); };
      const riderRow = choiceRow(document, "rider-row", "Rider", RIDER_CHOICES, String(choices.rider), reload("rider"));
      const modeRow = choiceRow(document, "mode-row", "Mode", MODE_CHOICES, choices.mode, reload("mode"));
      for (const r of [riderRow, modeRow, row]) { if (startRow) panel.insertBefore(r, startRow); else panel.appendChild(r); }
      const hint = document.createElement("p");
      hint.className = "orbit-hint";
      hint.id = "difficulty-hint";
      hint.textContent = DIFFICULTIES.find((d) => d.id === difficulty)?.blurb ?? "";
      panel.insertBefore(hint, startRow);
      const best = document.createElement("p");
      best.className = "orbit-hint";
      best.id = "best-time";
      panel.insertBefore(best, startRow);
    }
  }
  const start = byId("start");
  if (start) start.textContent = "Launch race";
  const vehicle = (id: string, active: boolean): void => byId(id)?.setAttribute("aria-pressed", String(active));
  const current = params.get("vehicle") === "skate" ? "skate" : "bike";
  vehicle("vehicle-bike", current === "bike");
  vehicle("vehicle-skate", current === "skate");
  // Results and Lost panels: a way back to the menu next to "Race again" (SO-E3); the pause panel gets the sound switch (SO-9).
  addButton(document, "again", "results-menu", "Menu");
  addButton(document, "again-lost", "lost-menu", "Menu");
  addButton(document, "resume", "pause-mute", "Sound on");
  const results = byId("results")?.querySelector("#result-goals");
  if (results && !byId("result-best")) {
    const best = document.createElement("p");
    best.className = "meta";
    best.id = "result-best";
    results.insertAdjacentElement("afterend", best);
  }
  // HUD tools: pause and sound buttons for mouse and touch players.
  const hud = byId("hud");
  if (hud && !byId("hud-tools")) {
    const tools = document.createElement("div");
    tools.id = "hud-tools";
    for (const [id, label] of [["hud-pause", "Pause"], ["hud-mute", "Sound on"]] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.textContent = label;
      tools.appendChild(b);
    }
    hud.appendChild(tools);
  }
  const keys = menu?.querySelector("p.meta:last-of-type");
  if (keys && /accelerate/i.test(keys.textContent ?? "")) keys.textContent = `${keys.textContent!.replace(/\.$/, "")}, M mute.`;
}
