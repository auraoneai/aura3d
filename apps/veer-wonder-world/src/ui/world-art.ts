// Decorative layered storybook world diorama SVG helper (WP-7).
// Lives in `src/ui/` so `src/portrait-assets.ts` remains strictly same-origin URL literals (`no-child-data.test.ts`).

import type { CharacterId, WorldId } from "../types.js";

/** Canonical display order of the six toy-island worlds in the menu filter strip. */
export const WORLD_ORDER: readonly WorldId[] = [
  "meadow",
  "music-garden",
  "peekaboo-barn",
  "station",
  "learning-cloud",
  "home-nook"
];

/** Default home world for each recurring host character when a synthetic test item omits `world`. */
export const HOST_HOME_WORLD: Readonly<Record<CharacterId, WorldId>> = {
  momo: "meadow",
  lulu: "music-garden",
  peeko: "peekaboo-barn",
  gogo: "station",
  lumi: "learning-cloud",
  sheru: "meadow"
};

export interface WorldSceneTheme {
  readonly id: WorldId;
  readonly label: string;
  readonly shortLabel: string;
  readonly host: CharacterId;
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly hillBack: string;
  readonly hillFront: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly pillBg: string;
}

export const WORLD_THEMES: Readonly<Record<WorldId, WorldSceneTheme>> = {
  meadow: {
    id: "meadow",
    label: "Momo Meadow",
    shortLabel: "Meadow",
    host: "momo",
    skyTop: "#a4cfef",
    skyBottom: "#dff1fb",
    hillBack: "#92ce7c",
    hillFront: "#a9dc8f",
    accent: "#f2848e",
    accentSoft: "#ebd9ba",
    pillBg: "#eaf6e4"
  },
  "music-garden": {
    id: "music-garden",
    label: "Music Garden",
    shortLabel: "Music Garden",
    host: "lulu",
    skyTop: "#a8d2ec",
    skyBottom: "#e4f4f8",
    hillBack: "#95d4b4",
    hillFront: "#b5e4cc",
    accent: "#f2c96b",
    accentSoft: "#fcf9f2",
    pillBg: "#e4f5ec"
  },
  "peekaboo-barn": {
    id: "peekaboo-barn",
    label: "Peekaboo Barn",
    shortLabel: "Peekaboo Barn",
    host: "peeko",
    skyTop: "#bbd6ec",
    skyBottom: "#fcecd2",
    hillBack: "#bad88d",
    hillFront: "#cfe5a6",
    accent: "#c94a3e",
    accentSoft: "#faf3e3",
    pillBg: "#f9eedc"
  },
  station: {
    id: "station",
    label: "GoGo Station",
    shortLabel: "GoGo Station",
    host: "gogo",
    skyTop: "#a8cceb",
    skyBottom: "#e9eff5",
    hillBack: "#9fc690",
    hillFront: "#b8d6a8",
    accent: "#4e8be6",
    accentSoft: "#dde7f5",
    pillBg: "#e4eef9"
  },
  "learning-cloud": {
    id: "learning-cloud",
    label: "Learning Cloud",
    shortLabel: "Learning Cloud",
    host: "lumi",
    skyTop: "#b8cef9",
    skyBottom: "#f5e3f2",
    hillBack: "#d9e3fd",
    hillFront: "#eaeefe",
    accent: "#8d6ee6",
    accentSoft: "#fff3c8",
    pillBg: "#eee9fc"
  },
  "home-nook": {
    id: "home-nook",
    label: "Home Nook",
    shortLabel: "Home Nook",
    host: "momo",
    skyTop: "#f7e6ce",
    skyBottom: "#fbf2e3",
    hillBack: "#ecd3b2",
    hillFront: "#e2be96",
    accent: "#d9825b",
    accentSoft: "#fff3cc",
    pillBg: "#f8ead8"
  }
};

interface SvgShape {
  readonly tag: "path" | "circle" | "rect" | "ellipse";
  readonly attrs: Readonly<Record<string, string>>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgNode(doc: Document, shape: SvgShape): SVGElement {
  const node = doc.createElementNS(SVG_NS, shape.tag);
  for (const [name, value] of Object.entries(shape.attrs)) node.setAttribute(name, value);
  return node;
}

function worldMotifShapes(world: WorldId, theme: WorldSceneTheme): readonly SvgShape[] {
  switch (world) {
    case "meadow":
      return [
        { tag: "circle", attrs: { cx: "276", cy: "22", r: "15", fill: "#fff2be", opacity: "0.92" } },
        { tag: "ellipse", attrs: { cx: "66", cy: "22", rx: "22", ry: "8", fill: "#ffffff", opacity: "0.82" } },
        { tag: "circle", attrs: { cx: "58", cy: "18", r: "9", fill: "#ffffff", opacity: "0.85" } },
        { tag: "path", attrs: { d: "M0 64 Q88 38 176 56 T320 48 L320 88 L0 88 Z", fill: theme.hillBack } },
        { tag: "path", attrs: { d: "M0 72 Q108 50 220 66 T320 60 L320 88 L0 88 Z", fill: theme.hillFront } },
        { tag: "path", attrs: { d: "M132 88 Q154 70 184 64 Q206 60 218 53 L232 55 Q218 65 196 70 Q170 76 158 88 Z", fill: theme.accentSoft, opacity: "0.94" } },
        { tag: "rect", attrs: { x: "247", y: "42", width: "7", height: "18", rx: "3", fill: "#b98b63" } },
        { tag: "circle", attrs: { cx: "250", cy: "34", r: "14", fill: "#79be68" } },
        { tag: "circle", attrs: { cx: "240", cy: "38", r: "10", fill: "#88cc76" } },
        { tag: "circle", attrs: { cx: "260", cy: "38", r: "10", fill: "#88cc76" } },
        { tag: "circle", attrs: { cx: "96", cy: "72", r: "4", fill: theme.accent } },
        { tag: "circle", attrs: { cx: "114", cy: "76", r: "3.2", fill: "#fff7da" } },
        { tag: "circle", attrs: { cx: "278", cy: "71", r: "3.8", fill: theme.accent } }
      ];
    case "music-garden":
      return [
        { tag: "circle", attrs: { cx: "54", cy: "22", r: "14", fill: "#fff0bf", opacity: "0.9" } },
        { tag: "path", attrs: { d: "M0 64 Q96 40 198 56 T320 46 L320 88 L0 88 Z", fill: theme.hillBack } },
        { tag: "path", attrs: { d: "M0 73 Q116 54 228 67 T320 61 L320 88 L0 88 Z", fill: theme.hillFront } },
        { tag: "rect", attrs: { x: "136", y: "62", width: "86", height: "14", rx: "5", fill: theme.accentSoft } },
        { tag: "rect", attrs: { x: "150", y: "62", width: "5", height: "8", rx: "1.5", fill: "#3b3748" } },
        { tag: "rect", attrs: { x: "164", y: "62", width: "5", height: "8", rx: "1.5", fill: "#3b3748" } },
        { tag: "rect", attrs: { x: "184", y: "62", width: "5", height: "8", rx: "1.5", fill: "#3b3748" } },
        { tag: "rect", attrs: { x: "198", y: "62", width: "5", height: "8", rx: "1.5", fill: "#3b3748" } },
        { tag: "path", attrs: { d: "M244 62 V32 Q262 22 280 32 V62", fill: "none", stroke: "#d9b489", "stroke-width": "4", "stroke-linecap": "round" } },
        { tag: "rect", attrs: { x: "253", y: "31", width: "3", height: "15", rx: "1.5", fill: theme.accent } },
        { tag: "rect", attrs: { x: "261", y: "30", width: "3", height: "19", rx: "1.5", fill: theme.accent } },
        { tag: "rect", attrs: { x: "269", y: "31", width: "3", height: "14", rx: "1.5", fill: theme.accent } },
        { tag: "ellipse", attrs: { cx: "98", cy: "75", rx: "10", ry: "4.5", fill: "#d4b5f5" } },
        { tag: "ellipse", attrs: { cx: "120", cy: "79", rx: "9", ry: "4", fill: "#f59ca9" } }
      ];
    case "peekaboo-barn":
      return [
        { tag: "circle", attrs: { cx: "272", cy: "26", r: "16", fill: "#ffe29a", opacity: "0.92" } },
        { tag: "path", attrs: { d: "M0 62 Q94 40 192 55 T320 48 L320 88 L0 88 Z", fill: theme.hillBack } },
        { tag: "path", attrs: { d: "M0 72 Q122 54 236 68 T320 62 L320 88 L0 88 Z", fill: theme.hillFront } },
        { tag: "ellipse", attrs: { cx: "96", cy: "75", rx: "28", ry: "7", fill: "#8ccae8" } },
        { tag: "path", attrs: { d: "M206 64 L206 42 L220 27 L244 27 L258 42 L258 64 Z", fill: theme.accent } },
        { tag: "path", attrs: { d: "M203 43 L220 25 L244 25 L261 43", fill: "none", stroke: theme.accentSoft, "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round" } },
        { tag: "rect", attrs: { x: "221", y: "45", width: "22", height: "19", rx: "2", fill: theme.accentSoft } },
        { tag: "path", attrs: { d: "M232 45 V64 M222 46 L242 63 M242 46 L222 63", stroke: theme.accent, "stroke-width": "1.8" } },
        { tag: "rect", attrs: { x: "268", y: "54", width: "18", height: "11", rx: "4", fill: "#eccb6e" } },
        { tag: "path", attrs: { d: "M150 61 H196 M150 66 H196 M158 57 V69 M184 57 V69", stroke: "#e5cca2", "stroke-width": "2.4", "stroke-linecap": "round" } }
      ];
    case "station":
      return [
        { tag: "ellipse", attrs: { cx: "76", cy: "20", rx: "20", ry: "7", fill: "#ffffff", opacity: "0.86" } },
        { tag: "path", attrs: { d: "M0 60 Q100 38 206 54 T320 44 L320 88 L0 88 Z", fill: theme.hillBack } },
        { tag: "path", attrs: { d: "M0 71 Q124 56 244 66 T320 60 L320 88 L0 88 Z", fill: theme.hillFront } },
        { tag: "path", attrs: { d: "M0 76 Q160 66 320 74 L320 83 Q160 75 0 84 Z", fill: theme.accentSoft } },
        { tag: "path", attrs: { d: "M0 78 Q160 68 320 76", fill: "none", stroke: "#7f8da3", "stroke-width": "2.2" } },
        { tag: "rect", attrs: { x: "208", y: "40", width: "48", height: "24", rx: "3", fill: "#f6ebd9" } },
        { tag: "path", attrs: { d: "M202 42 L232 26 L262 42 Z", fill: theme.accent } },
        { tag: "circle", attrs: { cx: "232", cy: "36", r: "4.5", fill: "#ffffff" } },
        { tag: "rect", attrs: { x: "226", y: "48", width: "12", height: "16", rx: "2", fill: "#c2966b" } },
        { tag: "path", attrs: { d: "M176 66 V36", stroke: "#6f7a8c", "stroke-width": "3", "stroke-linecap": "round" } },
        { tag: "rect", attrs: { x: "176", y: "37", width: "14", height: "5", rx: "2.5", fill: theme.accent } }
      ];
    case "learning-cloud":
      return [
        { tag: "path", attrs: { d: "M124 74 A72 56 0 0 1 268 74", fill: "none", stroke: "#f58eb6", "stroke-width": "5", "stroke-linecap": "round" } },
        { tag: "path", attrs: { d: "M130 74 A66 50 0 0 1 262 74", fill: "none", stroke: "#fad06c", "stroke-width": "5", "stroke-linecap": "round" } },
        { tag: "path", attrs: { d: "M136 74 A60 44 0 0 1 256 74", fill: "none", stroke: "#9be0b4", "stroke-width": "5", "stroke-linecap": "round" } },
        { tag: "path", attrs: { d: "M142 74 A54 38 0 0 1 250 74", fill: "none", stroke: "#88c4f4", "stroke-width": "5", "stroke-linecap": "round" } },
        { tag: "path", attrs: { d: "M148 74 A48 32 0 0 1 244 74", fill: "none", stroke: "#c3a6f4", "stroke-width": "5", "stroke-linecap": "round" } },
        { tag: "path", attrs: { d: "M0 68 Q52 50 106 64 Q160 48 216 64 Q270 50 320 64 L320 88 L0 88 Z", fill: theme.hillBack } },
        { tag: "circle", attrs: { cx: "118", cy: "69", r: "16", fill: theme.hillFront } },
        { tag: "circle", attrs: { cx: "144", cy: "67", r: "19", fill: "#f4f6ff" } },
        { tag: "circle", attrs: { cx: "252", cy: "68", r: "18", fill: "#f4f6ff" } },
        { tag: "circle", attrs: { cx: "276", cy: "71", r: "14", fill: theme.hillFront } },
        { tag: "circle", attrs: { cx: "82", cy: "26", r: "3.5", fill: "#ffe999" } },
        { tag: "circle", attrs: { cx: "288", cy: "22", r: "4", fill: "#ffe999" } }
      ];
    case "home-nook":
      return [
        { tag: "rect", attrs: { x: "0", y: "58", width: "320", height: "30", fill: theme.hillBack } },
        { tag: "rect", attrs: { x: "0", y: "68", width: "320", height: "20", fill: theme.hillFront } },
        { tag: "ellipse", attrs: { cx: "196", cy: "79", rx: "66", ry: "8", fill: theme.accent } },
        { tag: "path", attrs: { d: "M176 54 V28 A20 18 0 0 1 216 28 V54 Z", fill: "#cde8f6" } },
        { tag: "path", attrs: { d: "M176 54 Q196 42 216 54 Z", fill: "#a5da8e" } },
        { tag: "rect", attrs: { x: "171", y: "22", width: "8", height: "34", rx: "4", fill: "#bdd1b6" } },
        { tag: "rect", attrs: { x: "213", y: "22", width: "8", height: "34", rx: "4", fill: "#bdd1b6" } },
        { tag: "circle", attrs: { cx: "266", cy: "34", r: "18", fill: theme.accentSoft, opacity: "0.55" } },
        { tag: "path", attrs: { d: "M266 38 V68 M258 68 H274", stroke: "#9c744f", "stroke-width": "3", "stroke-linecap": "round" } },
        { tag: "path", attrs: { d: "M256 39 L260 25 H272 L276 39 Z", fill: "#ffe3a8" } }
      ];
  }
}

let gradientSeed = 0;

/**
 * Builds a decorative (`aria-hidden="true"`) layered storybook diorama SVG for `world`
 * using `createElementNS` DOM nodes exclusively.
 */
export function createWorldSceneSvg(doc: Document, world: WorldId): SVGSVGElement {
  const theme = WORLD_THEMES[world];
  gradientSeed += 1;
  const gradId = `ww-sky-${world}-${gradientSeed}`;

  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 320 88");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "ww-card-scene-svg");

  const defs = doc.createElementNS(SVG_NS, "defs");
  const grad = doc.createElementNS(SVG_NS, "linearGradient");
  grad.setAttribute("id", gradId);
  grad.setAttribute("x1", "0");
  grad.setAttribute("y1", "0");
  grad.setAttribute("x2", "0");
  grad.setAttribute("y2", "1");

  const stopTop = doc.createElementNS(SVG_NS, "stop");
  stopTop.setAttribute("offset", "0%");
  stopTop.setAttribute("stop-color", theme.skyTop);
  const stopBottom = doc.createElementNS(SVG_NS, "stop");
  stopBottom.setAttribute("offset", "100%");
  stopBottom.setAttribute("stop-color", theme.skyBottom);
  grad.append(stopTop, stopBottom);
  defs.appendChild(grad);
  svg.appendChild(defs);

  const sky = doc.createElementNS(SVG_NS, "rect");
  sky.setAttribute("width", "320");
  sky.setAttribute("height", "88");
  sky.setAttribute("fill", `url(#${gradId})`);
  svg.appendChild(sky);

  for (const shape of worldMotifShapes(world, theme)) {
    svg.appendChild(svgNode(doc, shape));
  }
  return svg;
}
