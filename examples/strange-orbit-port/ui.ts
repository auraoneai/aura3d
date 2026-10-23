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
`;

const DIFFICULTIES: readonly { id: string; label: string; blurb: string }[] = [
  { id: "explorer", label: "Explorer", blurb: "Forgiving edges, 5 rescues, relaxed rivals" },
  { id: "racer", label: "Racer", blurb: "Precise lines, 3 rescues, competitive rivals" },
  { id: "expert", label: "Expert", blurb: "Exposed edges, 2 rescues, relentless rivals" }
];

const byId = (id: string): HTMLElement | null => document.getElementById(id);

export function installOrbitUi(params: URLSearchParams, difficulty: string): void {
  const style = document.createElement("style");
  style.id = "orbit-ui-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  const brand = document.createElement("div");
  brand.className = "orbit-brand";
  brand.id = "orbit-brand";
  brand.textContent = "Orbital Cycling Club";
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
      h1.innerHTML = "Strange<br>Orbit.";
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
      if (startRow) panel.insertBefore(row, startRow); else panel.appendChild(row);
      const hint = document.createElement("p");
      hint.className = "orbit-hint";
      hint.id = "difficulty-hint";
      hint.textContent = DIFFICULTIES.find((d) => d.id === difficulty)?.blurb ?? "";
      panel.insertBefore(hint, startRow);
    }
  }
  const start = byId("start");
  if (start) start.textContent = "Let's ride";
  const vehicle = (id: string, active: boolean): void => byId(id)?.setAttribute("aria-pressed", String(active));
  const current = params.get("vehicle") === "skate" ? "skate" : "bike";
  vehicle("vehicle-bike", current === "bike");
  vehicle("vehicle-skate", current === "skate");
  const keys = menu?.querySelector("p.meta:last-of-type");
  if (keys && /accelerate/i.test(keys.textContent ?? "")) keys.textContent = `${keys.textContent!.replace(/\.$/, "")}, M mute.`;
}
