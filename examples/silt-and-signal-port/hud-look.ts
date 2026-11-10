/**
 * WP-29 & GU47 DG-H1: AuraOne licensed desert-expedition HUD for Duneglide (`silt-and-signal-port`).
 * Uses licensed self-hosted Whitney (`--font-ui`), DIN Pro (`--font-metric`), and Monument Grotesk Mono (`--font-mono`)
 * from `apps/showcase-port-shared/hud-tokens.css`, warm obsidian-and-sandstone glass panels, signal-jade accents (zero cyan),
 * a top-center horizon relay compass tape, a compact title card with collapsible flight controls, auto-fading key hints,
 * and >= 44-48px mobile touch ergonomics at 390x844 clearing `--a3d-bar-space` / `--credit-gap`.
 * Scoped to `html[data-silt-look="inked"]` so both `index.html` copies stay byte-identical and `?look=original` is preserved.
 */
import { SILT_PALETTE } from "./art/look";

const FONT_URLS = {
  whitney400: new URL("../../apps/showcase-port-shared/fonts/whitney-regular.woff2", import.meta.url).href,
  whitney500: new URL("../../apps/showcase-port-shared/fonts/whitney-medium.woff2", import.meta.url).href,
  whitney600: new URL("../../apps/showcase-port-shared/fonts/whitney-semibold.woff2", import.meta.url).href,
  din400: new URL("../../apps/showcase-port-shared/fonts/dinpro-regular.woff2", import.meta.url).href,
  din500: new URL("../../apps/showcase-port-shared/fonts/dinpro-medium.woff2", import.meta.url).href,
  mono400: new URL("../../apps/showcase-port-shared/fonts/monument-mono.woff2", import.meta.url).href
} as const;

/** Licensed AuraOne families registered for the inked HUD (`Whitney`, `DIN Pro`, `Monument Grotesk Mono`). */
export const SILT_HUD_FAMILIES = {
  body: "Whitney",
  display: "Whitney",
  metric: "DIN Pro",
  mono: "Monument Grotesk Mono"
} as const;

/** Scoped inked HUD stylesheet: zero cyan, every line scoped to `html[data-silt-look="inked"]`, all explicit px sizes >= 13px. */
export const SILT_HUD_CSS = `
html[data-silt-look="inked"] { font-synthesis: none; --ink: ${SILT_PALETTE.bone}; --muted: #d9c8ac; --panel: rgba(28, 19, 14, 0.78); --line: rgba(218, 168, 106, 0.34); --warm: ${SILT_PALETTE.sandstone}; --jade: ${SILT_PALETTE.jade}; --hud-meta: 13px; --hud-title: 17px; --silt-bar-gap: max(var(--a3d-bar-space, 0px), var(--credit-gap, 0px)); }
html[data-silt-look="inked"] body, html[data-silt-look="inked"] button, html[data-silt-look="inked"] summary { font-family: var(--font-ui, "${SILT_HUD_FAMILIES.body}", "Whitney Fallback", "Graphik", sans-serif); font-variant-numeric: tabular-nums; letter-spacing: 0; }
html[data-silt-look="inked"] h1 { font-family: var(--font-ui, "${SILT_HUD_FAMILIES.display}", "Whitney Fallback", "Graphik", sans-serif); font-weight: 600; font-size: 24px; line-height: 1.15; letter-spacing: 0; color: ${SILT_PALETTE.bone}; }
html[data-silt-look="inked"] h2, html[data-silt-look="inked"] #objective { font-family: var(--font-ui, "${SILT_HUD_FAMILIES.display}", "Whitney Fallback", "Graphik", sans-serif); font-weight: 500; line-height: 1.22; letter-spacing: 0; }
html[data-silt-look="inked"] #chapter, html[data-silt-look="inked"] #flight .meta, html[data-silt-look="inked"] .silt-tape-label, html[data-silt-look="inked"] .stats .cell .meta { font-family: var(--font-ui); font-size: 13px; font-weight: 500; text-transform: none; font-variant-caps: all-small-caps; letter-spacing: 0.04em; color: ${SILT_PALETTE.sandstone}; }
html[data-silt-look="inked"] #flight .meta, html[data-silt-look="inked"] .stats .cell .meta { color: var(--muted); }
html[data-silt-look="inked"] #objective { font-size: var(--hud-title); color: ${SILT_PALETTE.bone}; }
html[data-silt-look="inked"] #speed, html[data-silt-look="inked"] #altitude, html[data-silt-look="inked"] #distance, html[data-silt-look="inked"] #silt-tape-dist, html[data-silt-look="inked"] #done-stats .cell:not(.wide):not(:first-child) b { font-family: var(--font-metric); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
html[data-silt-look="inked"] #speed, html[data-silt-look="inked"] #altitude { font-size: 18px; line-height: 1.05; color: ${SILT_PALETTE.bone}; }
html[data-silt-look="inked"] #steps, html[data-silt-look="inked"] #mode { font-family: var(--font-ui); font-weight: 500; font-variant-numeric: tabular-nums; font-size: 13px; }
html[data-silt-look="inked"] .panel { border-radius: 10px; background: linear-gradient(180deg, rgba(36, 24, 17, 0.82), rgba(22, 15, 11, 0.86)); border: 1px solid rgba(218, 168, 106, 0.32); box-shadow: inset 0 1px 0 rgba(255, 232, 196, 0.12), 0 10px 28px rgba(8, 5, 3, 0.44); backdrop-filter: blur(14px) saturate(135%); -webkit-backdrop-filter: blur(14px) saturate(135%); }
html[data-silt-look="inked"] #objective-card { max-width: 344px; padding: 10px 14px; }
html[data-silt-look="inked"] #hint { color: ${SILT_PALETTE.jadeWhite}; font-weight: 500; }
html[data-silt-look="inked"] #hold { color: ${SILT_PALETTE.jadeWhite}; font-size: 14px; font-weight: 500; }
html[data-silt-look="inked"] #flight { bottom: calc(12px + var(--silt-bar-gap)); min-width: 208px; padding: 10px 14px; gap: 5px; }
html[data-silt-look="inked"] .meter { height: 6px; border-radius: 999px; background: rgba(244, 234, 213, 0.14); box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45); }
html[data-silt-look="inked"] .meter > i { background: linear-gradient(90deg, #2fae86, #7fe8c6); border-radius: 999px; box-shadow: 0 0 10px rgba(47, 174, 134, 0.45); transition: width 90ms linear; }
html[data-silt-look="inked"] #keys { bottom: calc(12px + var(--silt-bar-gap)); font-size: 13px; transition: opacity 420ms ease, transform 420ms ease; }
html[data-silt-look="inked"] #keys.silt-faded { opacity: 0; transform: translateY(6px); pointer-events: none; }
html[data-silt-look="inked"] #compass-wrap { width: 86px; height: 86px; border-radius: 50%; background: radial-gradient(circle, rgba(48, 34, 22, 0.92) 0 56%, rgba(120, 84, 42, 0.85) 57% 63%, rgba(26, 18, 13, 0.94) 64%); box-shadow: 0 0 0 2px #c89448, 0 0 0 5px rgba(30, 20, 14, 0.88), 0 8px 22px rgba(0, 0, 0, 0.48); }
html[data-silt-look="inked"] #compass { border-bottom-color: ${SILT_PALETTE.jade}; filter: drop-shadow(0 0 5px rgba(79, 214, 172, 0.68)); }
html[data-silt-look="inked"] #silt-horizon-tape { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 252px; padding: 7px 12px 8px; display: grid; gap: 4px; pointer-events: none; }
html[data-silt-look="inked"] .silt-tape-top, html[data-silt-look="inked"] .silt-tape-bot { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
html[data-silt-look="inked"] #silt-freq { font-family: var(--font-mono); font-size: 13px; font-weight: 400; color: ${SILT_PALETTE.jadeWhite}; opacity: 0.92; }
html[data-silt-look="inked"] .silt-tape-cardinal { font-family: var(--font-ui); font-size: 13px; font-weight: 500; font-variant-caps: all-small-caps; letter-spacing: 0.06em; color: var(--muted); }
html[data-silt-look="inked"] #silt-tape-dist { font-size: 14px; color: ${SILT_PALETTE.bone}; }
html[data-silt-look="inked"] .silt-tape-rail { position: relative; height: 8px; border-radius: 999px; background: rgba(244, 234, 213, 0.1); border: 1px solid rgba(218, 168, 106, 0.24); overflow: hidden; }
html[data-silt-look="inked"] .silt-tape-ticks { position: absolute; inset: 1px 6px; background: repeating-linear-gradient(90deg, rgba(218, 168, 106, 0.42) 0 1px, transparent 1px 14px); opacity: 0.75; }
html[data-silt-look="inked"] #silt-tape-pip { position: absolute; top: 0; bottom: 0; left: 50%; width: 10px; margin-left: -5px; border-radius: 999px; background: ${SILT_PALETTE.jadeWhite}; box-shadow: 0 0 8px ${SILT_PALETTE.jade}; transition: left 70ms linear; }
html[data-silt-look="inked"] .screen { background: radial-gradient(ellipse at 50% 42%, rgba(22, 14, 10, 0.08), rgba(14, 10, 8, 0.64)); }
html[data-silt-look="inked"] #title-screen .card { width: min(448px, 100%); gap: 10px; padding: 16px 18px; }
html[data-silt-look="inked"] .chapters { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 6px; }
html[data-silt-look="inked"] button { font-weight: 500; font-size: 13px; border-radius: 7px; background: rgba(244, 234, 213, 0.08); border-color: rgba(218, 168, 106, 0.34); transition: background 140ms ease, border-color 140ms ease; }
html[data-silt-look="inked"] button.primary { background: linear-gradient(180deg, #e8b36d, #cf9147); border-color: #ebc083; color: #22140b; font-weight: 600; }
html[data-silt-look="inked"] button.primary:hover, html[data-silt-look="inked"] button.primary:focus-visible { background: linear-gradient(180deg, #f1c282, #dca055); }
html[data-silt-look="inked"] .silt-controls-drawer { border-top: 1px solid rgba(218, 168, 106, 0.22); padding-top: 6px; }
html[data-silt-look="inked"] .silt-controls-drawer summary { cursor: pointer; font-size: 13px; font-weight: 500; color: ${SILT_PALETTE.sandstone}; list-style: none; display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
html[data-silt-look="inked"] .silt-controls-drawer summary::after { content: "+"; font-family: var(--font-mono); font-size: 14px; color: var(--muted); }
html[data-silt-look="inked"] .silt-controls-drawer[open] summary::after { content: "−"; }
html[data-silt-look="inked"] table.controls { font-size: 13px; margin-top: 6px; }
html[data-silt-look="inked"] #touch-hold { bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--silt-bar-gap)); }
html[data-silt-look="inked"] #touch-boost { bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--silt-bar-gap) + 8px); }
html[data-silt-look="inked"] #touch-pause { font-size: 13px; }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] { --hud-meta: 13px; --hud-title: 15px; } }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] button, html[data-silt-look="inked"] .chapters button, html[data-silt-look="inked"] .silt-controls-drawer summary { min-height: 44px; min-width: 44px; } }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] #touch-pause { min-width: 48px; min-height: 48px; width: 48px; height: 48px; font-size: 13px; top: calc(max(8px, env(safe-area-inset-top)) + 84px); } }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] #touch-boost { min-width: 60px; min-height: 60px; width: 60px; height: 60px; bottom: calc(max(10px, env(safe-area-inset-bottom)) + var(--silt-bar-gap) + 8px); } }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] #touch-hold { min-width: 76px; min-height: 76px; width: 76px; height: 76px; bottom: calc(max(10px, env(safe-area-inset-bottom)) + var(--silt-bar-gap)); } }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] #flight { left: 8px; bottom: calc(max(10px, env(safe-area-inset-bottom)) + var(--silt-bar-gap)); min-width: 168px; padding: 8px 11px; } }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] #silt-horizon-tape { top: calc(max(8px, env(safe-area-inset-top)) + 90px); left: 8px; transform: none; width: 204px; padding: 6px 10px; } }
@media (pointer: coarse), (max-width: 760px) { html[data-silt-look="inked"] #title-screen .card { max-height: calc(100vh - 28px - var(--silt-bar-gap)); overflow-y: auto; padding: 14px; } }
`;

/** Mount the inked HUD: scope attribute, stylesheet, compact controls drawer, horizon relay tape, and licensed faces. */
export async function mountSiltHud(doc: Document = document): Promise<readonly string[]> {
  doc.documentElement.dataset.siltLook = "inked";
  let style = doc.getElementById("silt-hud-look") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "silt-hud-look";
    doc.head.appendChild(style);
  }
  style.textContent = SILT_HUD_CSS;

  // Collapse the 9-row keyboard/gamepad reference table into an expandable drawer so the title card stays compact over the dunes
  const controlsTable = doc.querySelector?.("#title-screen table.controls");
  if (controlsTable && controlsTable.parentElement && !controlsTable.closest(".silt-controls-drawer")) {
    const drawer = doc.createElement("details");
    drawer.className = "silt-controls-drawer";
    const summary = doc.createElement("summary");
    summary.textContent = "Flight controls & inputs";
    drawer.appendChild(summary);
    controlsTable.parentElement.insertBefore(drawer, controlsTable);
    drawer.appendChild(controlsTable);
  }

  // Mount the top-center horizon signal-relay compass tape inside `#hud` without mutating `index.html`
  const hud = doc.getElementById("hud");
  if (hud && !doc.getElementById("silt-horizon-tape")) {
    const tape = doc.createElement("div");
    tape.id = "silt-horizon-tape";
    tape.className = "panel";
    tape.setAttribute("aria-label", "Signal relay bearing");
    tape.innerHTML = [
      `<div class="silt-tape-top"><span class="silt-tape-label">Signal relay</span><span id="silt-freq">142.1MHZ · R01</span></div>`,
      `<div class="silt-tape-rail"><i class="silt-tape-ticks"></i><i id="silt-tape-pip"></i></div>`,
      `<div class="silt-tape-bot"><span class="silt-tape-cardinal">W · N · E</span><span id="silt-tape-dist">0 m</span></div>`
    ].join("");
    hud.insertBefore(tape, doc.getElementById("compass-wrap") ?? hud.firstChild);
  }

  if (typeof FontFace === "undefined" || !doc.fonts) return [];
  const faces = [
    new FontFace(SILT_HUD_FAMILIES.body, `url(${FONT_URLS.whitney400}) format("woff2")`, { weight: "400", display: "swap" }),
    new FontFace(SILT_HUD_FAMILIES.body, `url(${FONT_URLS.whitney500}) format("woff2")`, { weight: "500", display: "swap" }),
    new FontFace(SILT_HUD_FAMILIES.display, `url(${FONT_URLS.whitney600}) format("woff2")`, { weight: "600", display: "swap" }),
    new FontFace(SILT_HUD_FAMILIES.metric, `url(${FONT_URLS.din400}) format("woff2")`, { weight: "400", display: "swap" }),
    new FontFace(SILT_HUD_FAMILIES.metric, `url(${FONT_URLS.din500}) format("woff2")`, { weight: "500", display: "swap" }),
    new FontFace(SILT_HUD_FAMILIES.mono, `url(${FONT_URLS.mono400}) format("woff2")`, { weight: "400", display: "swap" })
  ];
  const loaded: string[] = [];
  await Promise.all(faces.map(async (face) => {
    try {
      (doc.fonts as FontFaceSet & { add(face: FontFace): void }).add(await face.load());
      loaded.push(`${face.family} ${face.weight}`);
    } catch {
      /* keep the metric-matched fallback stack */
    }
  }));
  return loaded;
}
