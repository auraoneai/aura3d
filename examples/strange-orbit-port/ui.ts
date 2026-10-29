/**
 * Presentation layer for the title, HUD, pause and result screens. It injects its own stylesheet and enhances the
 * existing DOM by id, so the example page and the live showcase wrapper (which carries its own HTML copy) both get it.
 */
const CSS = /* css */ `
:root { --ink: #f4ead6; --muted: #a9bdb9; --panel: rgba(11, 28, 34, 0.78); --line: rgba(160, 222, 214, 0.2); --warm: #f3e6cb; --jade: #7fe0cf; --ember: #f0a56b; }
html, body { background: #070b12; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; backdrop-filter: blur(10px); box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45); }
h1, h2, .value, #count, button, .kicker, .brand, .tagline { font-family: "Graphik Web", sans-serif; }
h2 { font-size: 24px; font-weight: 500; color: var(--warm); }
button { border-radius: 6px; background: rgba(160, 222, 214, 0.08); border: 1px solid var(--line); font-size: 14px; font-weight: 500; padding: 10px 16px; transition: background 0.15s, transform 0.15s; }
button:hover:not(:disabled) { background: rgba(160, 222, 214, 0.2); transform: translateY(-1px); }
button.primary { background: var(--warm); color: #14201f; font-size: 16px; padding: 12px 22px; }
button.primary:hover:not(:disabled) { background: #fff4de; }
button[aria-pressed="true"] { border-color: var(--warm); background: rgba(243, 230, 203, 0.16); color: var(--warm); }
.overlay { background: rgba(5, 10, 16, 0.5); }
#menu { background: linear-gradient(90deg, rgba(5, 11, 18, 0.9) 0%, rgba(5, 11, 18, 0.55) 38%, rgba(5, 11, 18, 0) 72%); padding-left: 6vw; }
#menu .panel { background: transparent; border: 0; box-shadow: none; backdrop-filter: none; width: min(480px, 92vw); gap: 10px; padding: 0; }
#menu h1 { font-size: clamp(48px, 8vw, 84px); line-height: 0.95; font-weight: 500; color: var(--warm); letter-spacing: -0.02em; text-transform: uppercase; text-shadow: 0 6px 40px rgba(0, 0, 0, 0.55); }
#menu .kicker { font-size: 13px; color: var(--muted); }
#menu .tagline { font-size: 16px; color: var(--ink); }
.orbit-brand { position: fixed; top: 18px; left: 6vw; font-family: "Graphik Web", sans-serif; font-size: 13px; color: var(--muted); pointer-events: none; }
.orbit-tag { position: fixed; right: 36px; bottom: 30px; font-family: "Graphik Web", sans-serif; font-size: 34px; font-weight: 500; letter-spacing: -0.02em; text-transform: uppercase; color: rgba(244, 234, 214, 0.5); pointer-events: none; }
#hud .block { background: var(--panel); border-radius: 10px; backdrop-filter: blur(8px); }
#hud .meta { font-size: 12px; color: var(--muted); }
#hud .value { font-size: 26px; font-weight: 500; color: var(--warm); }
#speed { font-size: 46px !important; line-height: 1; }
#order li.you { color: var(--ember); }
#banner { font-family: "Graphik Web", sans-serif; font-size: 20px; font-weight: 500; color: var(--jade); text-shadow: 0 0 16px rgba(127, 224, 207, 0.55); }
#notice { font-family: "Graphik Web", sans-serif; font-size: 22px; font-weight: 500; color: var(--warm); }
.meter { height: 8px; border-radius: 4px; background: rgba(160, 222, 214, 0.14); }
.meter > i { background: linear-gradient(90deg, var(--jade), var(--ember)); box-shadow: 0 0 12px rgba(127, 224, 207, 0.5); }
#progress { height: 4px; }
#progress > i { background: linear-gradient(90deg, var(--jade), var(--warm)); }
#count { font-size: 160px; font-weight: 500; letter-spacing: -0.02em; color: var(--warm); text-shadow: 0 0 60px rgba(243, 230, 203, 0.45); }
#loading { background: #070b12; }
#difficulty-row { gap: 8px; }
.orbit-hint { font-size: 12px; color: var(--muted); margin: 0; }
#menu .meta { font-size: 12px; margin: 0; }
@media (max-height: 640px) { .orbit-brand { display: none; } #menu h1 { font-size: 60px; } #menu .tagline { font-size: 14px; } }
#order, #banner { top: 104px; }
#hud-tools { position: absolute; top: 104px; left: 12px; display: flex; gap: 8px; pointer-events: auto; }
#hud-tools button { min-width: 44px; min-height: 44px; padding: 0 12px; font-size: 13px; background: var(--panel); }
.menu-row-label { font-size: 12px; color: var(--muted); min-width: 52px; }
#menu .row button { min-height: 40px; }
#best-time, #result-best { margin: 0; }
@media (max-width: 720px) {
  #hud .top { top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); right: max(8px, env(safe-area-inset-right)); gap: 6px; }
  #hud .top .block { min-width: 0; flex: 1 1 0; padding: 6px 8px; }
  #hud .top .value { font-size: 18px; white-space: nowrap; }
  #hud .meta { font-size: 11px; }
  #order, #banner { top: 96px; }
  #hud-tools { top: 96px; left: max(8px, env(safe-area-inset-left)); }
  #banner { top: 150px; }
  #order { right: max(8px, env(safe-area-inset-right)); min-width: 128px; padding: 6px 8px; }
  #banner { left: max(8px, env(safe-area-inset-left)); transform: none; max-width: calc(100% - 148px); font-size: 16px; }
  #hud .bottom { left: max(8px, env(safe-area-inset-left)); right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); gap: 8px; }
  #speed { font-size: 34px !important; }
  #notice { font-size: 18px; max-width: 92vw; }
  .keys { display: none; }
  #menu .panel { background: linear-gradient(180deg, rgba(7, 11, 18, 0.62), rgba(7, 11, 18, 0.5)); border-radius: 14px; padding: 14px; width: min(480px, calc(100vw - 24px)); backdrop-filter: blur(6px); }
  .orbit-tag { left: max(14px, env(safe-area-inset-left)); right: auto; bottom: max(16px, env(safe-area-inset-bottom)); font-size: 20px; }
  .orbit-brand { left: max(14px, env(safe-area-inset-left)); }
}
/* Portrait phones (SO-5): the menu sits at the top and the menu camera frames the riders in the lower third. */
@media (max-aspect-ratio: 17/20) {
  #menu { place-items: start center; padding: max(44px, env(safe-area-inset-top)) 12px 0; }
  #menu .panel { gap: 8px; }
  #menu h1 { font-size: 44px; }
  .orbit-brand { top: max(14px, env(safe-area-inset-top)); }
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
  brand.textContent = "Craterline Cup";
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
      kicker.textContent = "One impossible world";
      panel.insertBefore(kicker, h1);
      h1.innerHTML = "Craterline<br>GP.";
      const lead = panel.querySelector("p.meta");
      if (lead) { lead.className = "tagline"; lead.textContent = "Ride the rings. Find your own way."; }
      const startRow = byId("start")?.parentElement ?? null;
      const row = document.createElement("div");
      row.className = "row";
      row.id = "difficulty-row";
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
  if (start) start.textContent = "Let's ride";
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
