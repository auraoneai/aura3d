/**
 * holeCard.ts — the broadcast lower third of Aura Links 3D (GU47 WP-20
 * LINKS-14): the hole map drawn from the hole's own layout (tee at the
 * bottom, the line of play running up to the green), the hole title, and
 * the shot stats chip. Pure (strings and numbers only), so the map is unit
 * tested against the hole path and the accent contrast against the panel.
 */
import type { HoleSpec, HoleTerrain } from "./types";

/** HUD panel colour of the GU47 look (index.html `body[data-look="gu47"]`): rgb and opacity. */
export const HUD_PANEL = { rgb: [6, 11, 8] as const, alpha: 0.85 };
/** The lower third's own panel opacity (more opaque: it sits over the brightest part of the frame). */
export const HOLE_CARD_PANEL_ALPHA = 0.9;

/** The panel colour composited over a backdrop colour (#rrggbb). */
export function panelOver(backdrop: string, alpha = HUD_PANEL.alpha): string {
  const n = parseInt(backdrop.slice(1), 16);
  const bg = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `#${HUD_PANEL.rgb.map((v, i) => Math.round(v * alpha + bg[i]! * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

/** Map size (SVG user units): a portrait strip, the tee at the bottom. */
export const HOLE_MAP_SIZE = { w: 44, h: 100, pad: 7 } as const;

export interface HoleMap {
  /** the line of play, tee first, then the layout path points */
  readonly path: readonly (readonly [number, number])[];
  readonly tee: readonly [number, number];
  readonly cup: readonly [number, number];
  readonly greenR: number;
  readonly fairwayW: number;
  readonly bunkers: readonly { readonly x: number; readonly y: number; readonly r: number }[];
  readonly water: readonly { readonly x: number; readonly y: number; readonly r: number }[];
  /** map units per metre */
  readonly scale: number;
}

/**
 * Projects the hole into the map as the player sees it from the tee: the opening line runs up the map and the player's
 * right is the map's right. Yaw 0 looks down +Z and turning left (A) raises the yaw toward +X (aim.ts), so the
 * player's right is the yaw - 90 deg direction, (-cos yaw, sin yaw) in world x/z (+X is on the player's left).
 */
export function holeMap(hole: HoleSpec, terrain: HoleTerrain): HoleMap {
  const { w, h, pad } = HOLE_MAP_SIZE;
  const yaw = terrain.lineYaw;
  const f = [Math.sin(yaw), Math.cos(yaw)] as const;
  const r = [-Math.cos(yaw), Math.sin(yaw)] as const;
  const tx = terrain.tee[0], tz = terrain.tee[2];
  const along = (x: number, z: number) => (x - tx) * f[0] + (z - tz) * f[1];
  const side = (x: number, z: number) => (x - tx) * r[0] + (z - tz) * r[1];
  const pts: [number, number][] = [[tx, tz], ...hole.layout.path.map((p) => [p[0], p[1]] as [number, number]), [terrain.cup[0], terrain.cup[2]]];
  const maxA = Math.max(1, ...pts.map(([x, z]) => along(x, z))) + hole.layout.greenRadius;
  const maxS = Math.max(1, ...pts.map(([x, z]) => Math.abs(side(x, z)))) + hole.layout.fairwayWidth * 0.5;
  const scale = Math.min((h - 2 * pad) / maxA, (w * 0.5 - pad * 0.5) / maxS);
  const map = (x: number, z: number): [number, number] => [
    Number((w * 0.5 + side(x, z) * scale).toFixed(2)),
    Number((h - pad - along(x, z) * scale).toFixed(2))
  ];
  const disc = (c: readonly [number, number], radius: number) => {
    const [x, y] = map(c[0], c[1]);
    return { x, y, r: Number((radius * scale).toFixed(2)) };
  };
  return {
    path: [map(tx, tz), ...hole.layout.path.map((p) => map(p[0], p[1]))],
    tee: map(tx, tz),
    cup: map(terrain.cup[0], terrain.cup[2]),
    greenR: Number((hole.layout.greenRadius * scale).toFixed(2)),
    fairwayW: Number((hole.layout.fairwayWidth * scale).toFixed(2)),
    bunkers: hole.layout.bunkers.map((b) => disc(b.center, b.radius)),
    water: hole.layout.water.map((b) => disc(b.center, b.radius)),
    scale
  };
}

/** The map as SVG markup (viewBox `0 0 44 100`); colours come from CSS classes so the course accent applies. */
export function holeMapSvg(map: HoleMap): string {
  const line = map.path.map(([x, y]) => `${x},${y}`).join(" ");
  const circles = (list: HoleMap["bunkers"], cls: string) => list.map((c) => `<circle class="${cls}" cx="${c.x}" cy="${c.y}" r="${c.r}"/>`).join("");
  return [
    `<polyline class="hm-fairway" points="${line}" stroke-width="${map.fairwayW}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    circles(map.water, "hm-water"),
    circles(map.bunkers, "hm-bunker"),
    `<circle class="hm-green" cx="${map.cup[0]}" cy="${map.cup[1]}" r="${map.greenR}"/>`,
    `<polyline class="hm-line" points="${line}" fill="none"/>`,
    `<circle class="hm-tee" cx="${map.tee[0]}" cy="${map.tee[1]}" r="1.6"/>`,
    `<circle class="hm-pin" cx="${map.cup[0]}" cy="${map.cup[1]}" r="1.4"/>`
  ].join("");
}

/** Hole title in sentence case (the lower third never shouts). */
export function holeTitle(hole: HoleSpec): string {
  return `Hole ${hole.number} · ${hole.name}`;
}

/** The line under the title: par, length and the course. */
export function holeSubtitle(hole: HoleSpec, courseName: string): string {
  return `Par ${hole.par} · ${hole.lengthM} m · ${courseName}`;
}

/** The shot stats chip after a ball comes to rest. */
export function shotStatsLabel(o: { readonly club: string; readonly carry: number; readonly roll: number; readonly toPin: number }): string {
  const club = o.club.charAt(0).toUpperCase() + o.club.slice(1).toLowerCase();
  return `${club} · ${Math.round(o.carry)} m carry · ${Math.round(o.roll)} m roll · ${Math.round(o.toPin)} m to pin`;
}

/**
 * When the lower third is up (GU47 look only): at address (the hole flyover runs in that phase) and between shots,
 * in a round on a real hole. Hidden during the swing and the ball flight (the tracer owns the frame), in the Range and
 * Putting Labs (their rings and spots are not the hole), in the menu and on the closing card.
 */
export function holeCardVisible(o: { readonly look: "gu47" | "original"; readonly phase: string; readonly lab: boolean; readonly hasRound: boolean }): boolean {
  return o.look !== "original" && o.hasRound && !o.lab && (o.phase === "address" || o.phase === "between");
}

/** The lower third's CSS transition: a short fade and rise; reduced motion cuts it (PRD §6.3: no slide, no fade). */
export function holeCardTransition(reducedMotion: boolean): string {
  return reducedMotion ? "none" : "opacity 0.22s ease-out, transform 0.22s ease-out";
}
