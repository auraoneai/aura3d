/**
 * GU47 WP-11 TT-M1 / TT-M2: hero surfaces and kit materials for the World Tour look.
 *
 * TT-M1: each venue's court reads as its surface: acrylic (hard, desert, beach) with a 0.35 clearcoat and a fine grain,
 * turf with a 0.6 sheen and mow stripes, clay at roughness 0.95, regolith on the Moon; lines #fbfbf5. The grain is the
 * engine's procedural normal (no download); the three CC0 sets (acrylic, turf, clay) the row names replace it when they
 * are admitted into the app folder (lane report, asset needs). The 8 stripe boxes become one vertex-coloured mesh (1 draw).
 * TT-M2: kits move to `material.fabric` (sheen 0.5), racket frames to `material.clearcoatPaint`, the ball to felt. Kit and
 * racket materials are upgraded where the rig hands them to the engine (`upgradeRigMaterial`), so the rig code and its
 * parity test are unchanged. Presentation only.
 */
import { game, geometry, material, type AuraCustomGeometrySpec, type AuraMaterialSpec } from "@aura3d/engine";
import { BASELINE_Z, DOUBLES_X } from "./constants";
import type { NodeInput } from "./rigPort";
import { VENUE_PALETTES, venueKey } from "./venues";

export type CourtPart = "court" | "alley" | "apron" | "ground";
export type SurfaceKind = "acrylic" | "turf" | "clay" | "regolith";

/** Surface family per venue (destination venues play as hard court, so they are acrylic too). */
export const VENUE_SURFACE: Readonly<Record<string, SurfaceKind>> = { hard: "acrylic", grass: "turf", clay: "clay", desert: "acrylic", beach: "acrylic", moon: "regolith" };

/** TT-M1: line paint. */
export const LINE_COLOR = "#fbfbf5";

/**
 * The surface's tangent-space grain normal. Phase 2: only `fabric-normal` is a normal map; `plastic-micro-scratch` and
 * `rubber-roughness` are grayscale roughness fields (rendering/ProceduralMaterialTextures.ts KIND_SLOT), and bound as a
 * normal they tilted the acrylic and regolith courts away from the sun (black speckle on acrylic, a black Moon court).
 * Every family now takes a fine fabric-normal grain (at the broadcast distance a roughness field would not read).
 */
const grain = (kind: SurfaceKind) => {
  switch (kind) {
    case "acrylic": return material.proceduralTexture("fabric-normal", { scale: 120, strength: 0.08, contrast: 0.5 });
    case "turf": return material.proceduralTexture("fabric-normal", { scale: 72, strength: 0.32, contrast: 0.6 });
    case "clay": return material.proceduralTexture("fabric-normal", { scale: 96, strength: 0.2, contrast: 0.55 });
    case "regolith": return material.proceduralTexture("fabric-normal", { scale: 64, strength: 0.14, contrast: 0.55 });
  }
};

/**
 * GU47 phase 3: World Tour colour overrides on top of the venue palette (the 4.6.2 `?look=original` keeps the palette). The
 * blind panel found the World Tour Moon grey, muddy and low in contrast (mid-grey court on a mid-grey plane), so the lunar
 * court is a cobalt acrylic inside a pale regolith apron on a darker charcoal plain: three clear value steps.
 */
export const WORLD_TOUR_PALETTE: Readonly<Record<string, Partial<Record<CourtPart, string>>>> = {
  moon: { court: "#2c5f96", alley: "#244e7c", apron: "#8e9297", ground: "#24272b" }
};

/** The material of one court part at a venue (colours from the venue palette, properties from its surface family). */
export function surfaceMaterial(venue: string | null | undefined, part: CourtPart): AuraMaterialSpec {
  const key = venueKey(venue);
  const pal = { ...VENUE_PALETTES[key]!, ...WORLD_TOUR_PALETTE[key] };
  const kind = VENUE_SURFACE[key] ?? "acrylic";
  const color = (part === "court" ? pal.court : part === "alley" ? pal.alley : part === "apron" ? pal.apron : pal.ground);
  // TT-E3: the lunar ground is the engine's moon planet material in the venue's regolith grey.
  // GU47 phase 3: the engine's moon planet preset keeps its own pale #cbd5e1 whatever colour it is given, which washed the lunar
  // plain out to a flat light grey; a plain PBR regolith in the palette charcoal keeps the court the brightest thing in frame.
  if (part === "ground") return kind === "regolith" ? material.pbr({ color, roughness: 0.98, normal: grain(kind) }) : material.pbr({ color, roughness: 0.94 });
  switch (kind) {
    case "acrylic":
      // GU47 phase 3 (rubric: no environment reflections): the floodlit New York acrylic gets a glossier clearcoat so the floods
      // and the night sky glint on the court; the day venues keep the panel-verified 0.35 / 0.35.
      return key === "hard"
        ? material.pbr({ color, roughness: part === "apron" ? 0.66 : 0.56, clearcoat: 0.6, clearcoatRoughness: 0.16, normal: grain(kind) })
        : material.pbr({ color, roughness: part === "apron" ? 0.7 : 0.62, clearcoat: 0.35, clearcoatRoughness: 0.35, normal: grain(kind) });
    case "turf":
      return material.pbr({ color, roughness: 0.9, sheen: 0.6, sheenRoughness: 0.65, sheenColor: "#c9e6a8", normal: grain(kind) });
    case "clay":
      return material.pbr({ color, roughness: 0.95, normal: grain(kind) });
    case "regolith":
      return material.pbr({ color, roughness: 0.97, normal: grain(kind) });
  }
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexLinear = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
};

/** Mow-stripe colours (the 4.6.1 stripe boxes' two greens). */
export const STRIPE_COLORS = ["#53945a", "#46804d"] as const;
export const GRASS_STRIPES_ID = "grass-stripes";
/** Phase 2: the darker half of the mow stripes (see buildGrassStripesNodes). */
export const GRASS_STRIPES_ALT_ID = "grass-stripes-alt";
/** Both stripe node ids, in STRIPE_COLORS order. */
export const GRASS_STRIPE_NODE_IDS = [GRASS_STRIPES_ID, GRASS_STRIPES_ALT_ID] as const;

/**
 * TT-M1: the 8 mow stripes as quads (top faces only, just above the court and below the line tops). `parity` keeps only
 * the stripes of one colour (0: STRIPE_COLORS[0], 1: STRIPE_COLORS[1]); omitted, all 8.
 */
export function grassStripesGeometry(parity?: 0 | 1): AuraCustomGeometrySpec {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const width = DOUBLES_X * 2 - 0.04;
  const depth = (BASELINE_Z * 2) / 8 - 0.02;
  const y = 0.0105;
  for (let i = 0; i < 8; i++) {
    if (parity !== undefined && i % 2 !== parity) continue;
    const zc = -BASELINE_Z + (i + 0.5) * ((BASELINE_Z * 2) / 8);
    const [r, g, b] = hexLinear(STRIPE_COLORS[i % 2]!);
    const base = positions.length / 3;
    for (const [x, z] of [[-width / 2, zc + depth / 2], [width / 2, zc + depth / 2], [width / 2, zc - depth / 2], [-width / 2, zc - depth / 2]] as const) {
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      colors.push(r, g, b, 1);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { kind: "aura-custom-geometry", positions, normals, colors, indices } as unknown as AuraCustomGeometrySpec;
}

/**
 * The stripe nodes (hidden until the grass venue shows them). Phase 2: two meshes, one per stripe colour, each coloured by
 * its material: the engine's mesh shading ignores vertex colours, so the single vertex-coloured mesh drew as a white slab
 * over the turf that hid the court lines (London frame). 2 draws instead of 1.
 */
export function buildGrassStripesNodes(): NodeInput[] {
  return GRASS_STRIPE_NODE_IDS.map((id, parity) =>
    geometry
      .custom(grassStripesGeometry(parity as 0 | 1), {
        name: id,
        material: material.pbr({ color: STRIPE_COLORS[parity]!, roughness: 0.9, sheen: 0.6, sheenRoughness: 0.65, sheenColor: "#c9e6a8", normal: grain("turf") }),
        castShadow: false
      })
      .runtime(game.runtimeNode(id)) as unknown as NodeInput
  );
}

/** TT-M2: the felt ball (sheen #f2ff7a; a 0.1 self-glow keeps it readable at the broadcast distance without counting as fill). */
export function feltBallMaterial(): AuraMaterialSpec {
  return material.felt({ color: "#d8ff3e", sheenColor: "#f2ff7a", roughness: 0.82, emissive: "#d8ff3e", emissiveIntensity: 0.1 });
}

/** Rig part suffixes whose material is the kit (fabric) or the racket frame (clearcoat paint). */
const KIT_PARTS = ["-torso", "-hips", "-left-upper-leg", "-right-upper-leg", "-left-upper-arm", "-right-upper-arm", "-collar"] as const;
const RACKET_PARTS = ["-racket-hoop", "-racket-throat-left", "-racket-throat-right", "-racket-handle"] as const;

export type RigMaterialRole = "kit" | "racket" | null;

/** Which TT-M2 upgrade a rig node id takes. */
export function rigMaterialRole(id: string): RigMaterialRole {
  if (KIT_PARTS.some((suffix) => id.endsWith(suffix))) return "kit";
  if (RACKET_PARTS.some((suffix) => id.endsWith(suffix))) return "racket";
  return null;
}

/** TT-M2: the World Tour version of a material the rig sets (colour kept; fabric sheen 0.5 or clearcoat paint). */
export function upgradeRigMaterial(role: RigMaterialRole, spec: AuraMaterialSpec): AuraMaterialSpec {
  const color = typeof spec.color === "string" ? spec.color : "#ffffff";
  if (role === "kit") return material.fabric({ color, roughness: 0.86, sheen: 0.5, sheenColor: color });
  if (role === "racket") return material.clearcoatPaint({ color, roughness: 0.32, metalness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.08 });
  return spec;
}
