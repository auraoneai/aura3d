/**
 * GU47 DG-H1: the poster HUD for the inked look. Graphik body and Canela titles (licensed, Commercial Type; copied
 * byte-identical from packages/game/src/fonts, see its NOTICE.txt), a brass compass with a jade needle (no #19e6ff),
 * labels at 13 px or more, and the jade signal accent for hints and the energy meter. Injected as a stylesheet scoped to
 * `html[data-silt-look="inked"]`, so both index.html copies stay identical and `?look=original` keeps today's HUD.
 * The flight panel and touch buttons keep their `--credit-gap` lift clear of the credit badge (C13).
 */
import { SILT_PALETTE } from "./art/look";

const FONT_URLS = {
  canela: new URL("./fonts/canela-400.woff2", import.meta.url).href,
  graphik400: new URL("./fonts/graphik-400.woff2", import.meta.url).href,
  graphik500: new URL("./fonts/graphik-500.woff2", import.meta.url).href
} as const;

/** The families the inked HUD registers (checked by the unit test and by the phase-2 `document.fonts.check`). */
export const SILT_HUD_FAMILIES = { body: "Silt Graphik", display: "Silt Canela" } as const;

/** No cyan anywhere in the inked HUD (DG-H1 acceptance "no #19e6ff"). */
export const SILT_HUD_CSS = `
html[data-silt-look="inked"] { --ink: ${SILT_PALETTE.bone}; --muted: #d4c4a6; --panel: rgba(42, 30, 24, 0.74); --line: rgba(214, 164, 103, 0.34); --warm: ${SILT_PALETTE.sandstone}; --jade: ${SILT_PALETTE.jade}; --hud-meta: 13px; --hud-title: 18px; }
html[data-silt-look="inked"] body, html[data-silt-look="inked"] button { font-family: "${SILT_HUD_FAMILIES.body}", "Graphik Web", sans-serif; }
html[data-silt-look="inked"] h1, html[data-silt-look="inked"] h2, html[data-silt-look="inked"] #objective, html[data-silt-look="inked"] #chapter { font-family: "${SILT_HUD_FAMILIES.display}", "${SILT_HUD_FAMILIES.body}", serif; font-weight: 400; }
html[data-silt-look="inked"] #chapter { font-size: 14px; letter-spacing: 0.08em; color: ${SILT_PALETTE.sandstone}; }
html[data-silt-look="inked"] #objective { font-size: var(--hud-title); }
html[data-silt-look="inked"] .panel { border-radius: 4px; box-shadow: 0 0 0 1px rgba(90, 58, 34, 0.6) inset; }
html[data-silt-look="inked"] #hint { color: ${SILT_PALETTE.jadeWhite}; }
html[data-silt-look="inked"] .meter > i { background: ${SILT_PALETTE.jade}; }
html[data-silt-look="inked"] #compass-wrap { background: radial-gradient(circle, #3a2a1c 0 58%, #6b4a26 59% 64%, #2a1f16 65%); box-shadow: 0 0 0 3px #b8893f, 0 0 0 5px rgba(42, 30, 24, 0.85), 0 2px 10px rgba(0, 0, 0, 0.45); }
html[data-silt-look="inked"] #compass { border-bottom-color: ${SILT_PALETTE.jade}; filter: drop-shadow(0 0 3px rgba(47, 174, 134, 0.6)); }
html[data-silt-look="inked"] #hold { color: ${SILT_PALETTE.jadeWhite}; font-size: 14px; }
html[data-silt-look="inked"] button.primary { background: ${SILT_PALETTE.sandstone}; border-color: ${SILT_PALETTE.sandstone}; color: #2a1c10; }
@media (max-width: 560px) { html[data-silt-look="inked"] { --hud-meta: 13px; --hud-title: 16px; } }
`;

/** Mount the poster HUD: scope attribute, stylesheet, and the three licensed faces. Resolves with the loaded families. */
export async function mountSiltHud(doc: Document = document): Promise<readonly string[]> {
  doc.documentElement.dataset.siltLook = "inked";
  const style = doc.createElement("style");
  style.id = "silt-hud-look";
  style.textContent = SILT_HUD_CSS;
  doc.head.appendChild(style);
  if (typeof FontFace === "undefined" || !doc.fonts) return [];
  const faces = [
    new FontFace(SILT_HUD_FAMILIES.display, `url(${FONT_URLS.canela}) format("woff2")`, { weight: "400", display: "swap" }),
    new FontFace(SILT_HUD_FAMILIES.body, `url(${FONT_URLS.graphik400}) format("woff2")`, { weight: "400", display: "swap" }),
    new FontFace(SILT_HUD_FAMILIES.body, `url(${FONT_URLS.graphik500}) format("woff2")`, { weight: "500 900", display: "swap" })
  ];
  const loaded: string[] = [];
  await Promise.all(faces.map(async (face) => {
    try { (doc.fonts as FontFaceSet & { add(face: FontFace): void }).add(await face.load()); loaded.push(`${face.family} ${face.weight}`); } catch { /* keep the fallback stack */ }
  }));
  return loaded;
}
