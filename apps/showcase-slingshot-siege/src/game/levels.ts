/**
 * Slingshot Siege — six chapters, thirty levels.
 *
 * Fortresses are procedurally assembled from material pieces over a handful of
 * recipes (towers, walls, arches, pyramids, keeps, perches). Deterministic:
 * every recipe is a pure function of level index, so demo runs and captures
 * see identical layouts.
 *
 * Layout frame: the slingshot sits at x ≈ -7.4; the fortress occupies
 * x ∈ [4.5, 11]; gulls perch on or inside the structures. Gravity is Earth
 * normal except Moon Roost (chapter 5 → low-g + ambient slow-mo).
 */
import type { AmmoId } from "./ammo";
import type { SiegeMaterialId } from "./materials";

export interface PieceSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Half extents. */
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  readonly material: SiegeMaterialId;
  /** Yaw for angled walls/planks. */
  readonly yaw?: number;
  /** Visual style — primitive block, or a typed GLB prop that also collides. */
  readonly visual?: "block" | "crate" | "barrel" | "plank";
  /** Fixed-joint this piece to the piece at this index (snaps over jointStrength). */
  readonly jointTo?: number;
}

export interface GullSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** "perched" sits on structure, "tucked" starts inside a pocket. */
  readonly perch: "perched" | "tucked";
}

export interface WindmillSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly bladeLength: number;
  readonly motorSpeed: number;
}

/** A chapter's name and map chip. Its look (sky, sun, fog, grade, island palette) is the GU47 look table in look.ts. */
export interface ChapterDef {
  readonly id: number;
  readonly name: string;
  readonly tagline: string;
  readonly chipColor: string;
}

export interface LevelSpec {
  readonly id: number;
  readonly chapter: number;
  readonly slot: number;
  readonly name: string;
  readonly ammo: readonly AmmoId[];
  readonly pieces: readonly PieceSpec[];
  readonly gulls: readonly GullSpec[];
  readonly windmills: readonly WindmillSpec[];
  readonly stars: readonly [number, number, number];
  readonly gravity?: readonly [number, number, number];
  /** Ambient slow-motion factor (Moon Roost). */
  readonly timeScale?: number;
  readonly par?: number;
}

// ---------------------------------------------------------------- helpers --

type V3 = readonly [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function tower(
  cx: number, cz: number,
  cols: number, rows: number,
  block: { w: number; h: number; d: number },
  mat: SiegeMaterialId,
  out: PieceSpec[] = []
): PieceSpec[] {
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = cx + (c - (cols - 1) / 2) * (block.w + 0.015);
      out.push({
        x, y: block.h / 2 + r * (block.h + 0.015), z: cz,
        hx: block.w / 2, hy: block.h / 2, hz: block.d / 2,
        material: mat
      });
    }
  }
  return out;
}

function wall(
  cx: number, cz: number, length: number, rows: number,
  mat: SiegeMaterialId, yaw = 0,
  out: PieceSpec[] = []
): PieceSpec[] {
  const seg = 0.62;
  const n = Math.max(2, Math.round(length / seg));
  for (let r = 0; r < rows; r += 1) {
    for (let i = 0; i < n; i += 1) {
      const lx = (i - (n - 1) / 2) * seg + (r % 2 === 1 ? seg / 2 : 0);
      out.push({
        x: cx + Math.cos(yaw) * lx,
        y: 0.14 + r * 0.3,
        z: cz + Math.sin(yaw) * lx,
        hx: seg / 2 + 0.01, hy: 0.14, hz: 0.16,
        material: mat, yaw
      });
    }
  }
  return out;
}

function lintel(
  cx: number, cy: number, cz: number, length: number, mat: SiegeMaterialId,
  yaw = 0, out: PieceSpec[] = []
): PieceSpec[] {
  out.push({
    x: cx, y: cy, z: cz,
    hx: length / 2, hy: 0.11, hz: 0.24,
    material: mat, yaw, visual: "plank"
  });
  return out;
}

function pyramid(cx: number, cz: number, base: number, mat: SiegeMaterialId, out: PieceSpec[] = []): PieceSpec[] {
  const block = { w: 0.7, h: 0.34, d: 0.7 };
  for (let r = 0; r < base; r += 1) {
    const n = base - r;
    for (let i = 0; i < n; i += 1) {
      out.push({
        x: cx + (i - (n - 1) / 2) * (block.w + 0.02),
        y: block.h / 2 + r * (block.h + 0.02),
        z: cz,
        hx: block.w / 2, hy: block.h / 2, hz: block.d / 2,
        material: mat
      });
    }
  }
  return out;
}

function crateAt(x: number, z: number, mat: SiegeMaterialId = "wood", out: PieceSpec[] = []): PieceSpec[] {
  out.push({ x, y: 0.3, z, hx: 0.3, hy: 0.3, hz: 0.3, material: mat, visual: "crate" });
  return out;
}

function barrelAt(x: number, z: number, out: PieceSpec[] = []): PieceSpec[] {
  out.push({ x, y: 0.34, z, hx: 0.24, hy: 0.34, hz: 0.24, material: "wood", visual: "barrel" });
  return out;
}

/** Tall keep: two legs + a lintel, optionally a flag pole socket. */
function keep(cx: number, cz: number, height: number, mat: SiegeMaterialId, out: PieceSpec[] = []): PieceSpec[] {
  const legTop = height;
  tower(cx - 0.55, cz, 1, Math.ceil(legTop / 0.46), { w: 0.5, h: 0.46, d: 0.5 }, mat, out);
  tower(cx + 0.55, cz, 1, Math.ceil(legTop / 0.46), { w: 0.5, h: 0.46, d: 0.5 }, mat, out);
  out.push({
    x: cx, y: legTop + 0.12, z: cz,
    hx: 0.95, hy: 0.12, hz: 0.5, material: mat, visual: "plank"
  });
  return out;
}

// ---------------------------------------------------------------- chapters --

export const CHAPTERS: readonly ChapterDef[] = [
  {
    id: 0, name: "Driftwood Cove", tagline: "Splinter the driftwood forts",
    chipColor: "#ffb35c"
  },
  {
    id: 1, name: "Quarry Rise", tagline: "Crack the quarry stacks",
    chipColor: "#9fb2c8"
  },
  {
    id: 2, name: "Greenhouse Perch", tagline: "Shatter the glass roosts",
    chipColor: "#8fe0b0"
  },
  {
    id: 3, name: "Windmill Gap", tagline: "Dodge the turning blades",
    chipColor: "#ffd166"
  },
  {
    id: 4, name: "Gull Keep", tagline: "Siege the gull king's castle",
    chipColor: "#ff8c69"
  },
  {
    id: 5, name: "Moon Roost", tagline: "Low-gravity lunar siege",
    chipColor: "#b0a8ff"
  }
];

// ------------------------------------------------------------------ levels --

interface LevelDraft {
  name: string;
  ammo: readonly AmmoId[];
  pieces: PieceSpec[];
  gulls: GullSpec[];
  windmills?: WindmillSpec[];
  stars?: [number, number, number];
  par?: number;
}

function finalize(chapter: number, slot: number, draft: LevelDraft): LevelSpec {
  const gullScore = draft.gulls.length * 1000;
  const pieceScore = draft.pieces.reduce((sum, p) => {
    const values: Record<SiegeMaterialId, number> = { wood: 40, stone: 90, glass: 60, ice: 80, obsidian: 140 };
    return sum + values[p.material];
  }, 0);
  const stars: [number, number, number] = draft.stars ?? [
    Math.round(gullScore * 0.4 + pieceScore * 0.08),
    Math.round(gullScore + pieceScore * 0.22),
    Math.round(gullScore + pieceScore * 0.5)
  ];
  return {
    id: chapter * 5 + slot,
    chapter, slot,
    name: draft.name,
    ammo: draft.ammo,
    pieces: draft.pieces,
    gulls: draft.gulls,
    windmills: draft.windmills ?? [],
    stars,
    par: draft.par ?? draft.ammo.length,
    ...(chapter === 5 ? { gravity: [0, -3.4, 0] as const, timeScale: 0.85 } : {})
  };
}

const F = 7.2; // fortress center x

function buildLevels(): readonly LevelSpec[] {
  const L: LevelSpec[] = [];

  // -------------------------------------------------- ch0 Driftwood Cove --
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 2, 3, { w: 0.7, h: 0.34, d: 0.7 }, "wood", pieces);
    pieces.push({ x: F, y: 1.13, z: 0, hx: 0.85, hy: 0.1, hz: 0.8, material: "wood", visual: "plank" });
    L.push(finalize(0, 0, {
      name: "First Splinter",
      ammo: ["pebble", "pebble", "pebble"],
      pieces,
      gulls: [{ x: F, y: 1.5, z: 0, perch: "perched" }],
      par: 1
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1, 0, 2, 3, { w: 0.7, h: 0.34, d: 0.7 }, "wood", pieces);
    tower(F + 1, 0, 2, 3, { w: 0.7, h: 0.34, d: 0.7 }, "wood", pieces);
    lintel(F, 1.2, 0, 2.6, "wood", 0, pieces);
    L.push(finalize(0, 1, {
      name: "Twin Posts",
      ammo: ["pebble", "pebble", "triple"],
      pieces,
      gulls: [
        { x: F - 1, y: 1.32, z: 0, perch: "perched" },
        { x: F + 0.9, y: 0.35, z: 0.9, perch: "tucked" }
      ],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F, -1.1, 3.2, 3, "wood", 0, pieces);
    tower(F + 1.8, 0.4, 2, 3, { w: 0.66, h: 0.34, d: 0.66 }, "wood", pieces);
    crateAt(F - 0.6, 0.9, "wood", pieces);
    L.push(finalize(0, 2, {
      name: "Crate Shelter",
      ammo: ["pebble", "triple", "stone"],
      pieces,
      gulls: [
        { x: F, y: 1.05, z: -1.1, perch: "perched" },
        { x: F + 1.8, y: 1.2, z: 0.4, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    pyramid(F, -0.6, 4, "wood", pieces);
    tower(F + 2.4, 0.9, 2, 4, { w: 0.6, h: 0.34, d: 0.6 }, "wood", pieces);
    barrelAt(F - 2, 1.2, pieces);
    L.push(finalize(0, 3, {
      name: "Driftwood Pyramid",
      ammo: ["pebble", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 1.55, z: -0.6, perch: "perched" },
        { x: F - 0.7, y: 0.75, z: -0.6, perch: "tucked" },
        { x: F + 2.4, y: 1.55, z: 0.9, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.4, -0.4, 1.7, "wood", pieces);
    keep(F + 1.4, 0.5, 1.4, "wood", pieces);
    wall(F, 1.8, 2.4, 2, "wood", 0, pieces);
    crateAt(F, -0.4, "wood", pieces);
    L.push(finalize(0, 4, {
      name: "Cove Keep",
      ammo: ["stone", "pebble", "triple", "squid"],
      pieces,
      gulls: [
        { x: F - 1.4, y: 2.15, z: -0.4, perch: "perched" },
        { x: F + 1.4, y: 1.75, z: 0.5, perch: "perched" },
        { x: F, y: 0.75, z: -0.4, perch: "tucked" }
      ]
    }));
  }

  // --------------------------------------------------- ch1 Quarry Rise ----
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 2, 4, { w: 0.72, h: 0.36, d: 0.72 }, "stone", pieces);
    lintel(F, 1.58, 0, 1.9, "wood", 0, pieces);
    L.push(finalize(1, 0, {
      name: "Bedrock",
      ammo: ["stone", "pebble", "stone"],
      pieces,
      gulls: [{ x: F, y: 1.92, z: 0, perch: "perched" }, { x: F - 0.8, y: 0.4, z: 0.8, perch: "tucked" }],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.3, 0, 2, 4, { w: 0.7, h: 0.36, d: 0.7 }, "stone", pieces);
    tower(F + 1.3, 0, 2, 3, { w: 0.7, h: 0.36, d: 0.7 }, "wood", pieces);
    lintel(F, 1.55, 0, 3.4, "stone", 0, pieces);
    L.push(finalize(1, 1, {
      name: "Quarry Gate",
      ammo: ["stone", "squid", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.3, y: 1.62, z: 0, perch: "perched" },
        { x: F, y: 0.8, z: 0, perch: "tucked" },
        { x: F + 1.3, y: 1.25, z: 0, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 0.8, -0.9, 3.4, 4, "stone", 0.18, pieces);
    wall(F + 1.2, 0.9, 2.6, 3, "stone", -0.3, pieces);
    crateAt(F - 0.4, 0.6, "wood", pieces);
    barrelAt(F + 0.2, -0.2, pieces);
    L.push(finalize(1, 2, {
      name: "Cross Walls",
      ammo: ["stone", "triple", "stone", "squid"],
      pieces,
      gulls: [
        { x: F - 0.8, y: 1.35, z: -0.9, perch: "perched" },
        { x: F + 1.2, y: 1.05, z: 0.9, perch: "perched" },
        { x: F + 0.2, y: 0.45, z: -0.2, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.6, -0.8, 2, 5, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    tower(F + 1.6, 0.8, 2, 4, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    pyramid(F, 0.1, 3, "wood", pieces);
    L.push(finalize(1, 3, {
      name: "Split Quarry",
      ammo: ["squid", "stone", "triple", "stone"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 1.95, z: -0.8, perch: "perched" },
        { x: F + 1.6, y: 1.6, z: 0.8, perch: "perched" },
        { x: F, y: 0.5, z: 0.1, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.8, -0.9, 2.2, "stone", pieces);
    keep(F + 1.8, 0.9, 1.9, "stone", pieces);
    wall(F, 0, 4.6, 3, "stone", Math.PI / 2, pieces);
    barrelAt(F, 1.8, pieces);
    crateAt(F, -1.8, "wood", pieces);
    L.push(finalize(1, 4, {
      name: "Quarry Keep",
      ammo: ["stone", "squid", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.8, y: 2.6, z: -0.9, perch: "perched" },
        { x: F + 1.8, y: 2.3, z: 0.9, perch: "perched" },
        { x: F, y: 1.0, z: 0, perch: "tucked" },
        { x: F, y: 0.75, z: 1.8, perch: "perched" }
      ]
    }));
  }

  // ----------------------------------------------- ch2 Greenhouse Perch ---
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 3, 3, { w: 0.6, h: 0.3, d: 0.6 }, "glass", pieces);
    lintel(F, 1.0, 0, 2.2, "wood", 0, pieces);
    L.push(finalize(2, 0, {
      name: "Glasshouse",
      ammo: ["pebble", "ember", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 1.3, z: 0, perch: "perched" },
        { x: F - 0.6, y: 0.45, z: 0, perch: "tucked" }
      ],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1, 0, 2.6, 4, "glass", 0, pieces);
    wall(F + 1, 0, 2.6, 4, "glass", 0, pieces);
    lintel(F, 1.3, 0, 2.8, "wood", 0, pieces);
    crateAt(F, 0.8, "wood", pieces);
    L.push(finalize(2, 1, {
      name: "Twin Panes",
      ammo: ["ember", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1, y: 1.35, z: 0, perch: "perched" },
        { x: F + 1, y: 1.35, z: 0, perch: "perched" },
        { x: F, y: 0.5, z: 0.8, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    pyramid(F - 0.6, -0.4, 4, "glass", pieces);
    tower(F + 1.9, 0.7, 2, 4, { w: 0.6, h: 0.32, d: 0.6 }, "glass", pieces);
    barrelAt(F - 2.1, 1.1, pieces);
    L.push(finalize(2, 2, {
      name: "Crystal Pyramid",
      ammo: ["ember", "triple", "stone", "pebble"],
      pieces,
      gulls: [
        { x: F - 0.6, y: 1.5, z: -0.4, perch: "perched" },
        { x: F - 0.95, y: 0.75, z: -0.4, perch: "tucked" },
        { x: F + 1.9, y: 1.45, z: 0.7, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.4, -0.6, 1.9, "glass", pieces);
    keep(F + 1.4, 0.6, 1.6, "wood", pieces);
    wall(F, 1.7, 2.8, 2, "glass", 0, pieces);
    L.push(finalize(2, 3, {
      name: "Perch Palace",
      ammo: ["ember", "squid", "triple", "stone"],
      pieces,
      gulls: [
        { x: F - 1.4, y: 2.3, z: -0.6, perch: "perched" },
        { x: F + 1.4, y: 2.0, z: 0.6, perch: "perched" },
        { x: F, y: 0.7, z: 1.7, perch: "perched" },
        { x: F - 1.4, y: 0.7, z: -0.6, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1.6, -1, 3.4, 4, "glass", 0.25, pieces);
    wall(F + 1.4, 0.8, 3, 4, "glass", -0.35, pieces);
    pyramid(F, 0, 3, "glass", pieces);
    crateAt(F, 1.6, "wood", pieces);
    L.push(finalize(2, 4, {
      name: "Grand Conservatory",
      ammo: ["ember", "stone", "squid", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 1.35, z: -1, perch: "perched" },
        { x: F + 1.4, y: 1.35, z: 0.8, perch: "perched" },
        { x: F, y: 1.25, z: 0, perch: "perched" },
        { x: F, y: 0.45, z: 1.6, perch: "tucked" }
      ]
    }));
  }

  // ---------------------------------------------------- ch3 Windmill Gap --
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 2, 4, { w: 0.7, h: 0.36, d: 0.7 }, "wood", pieces);
    L.push(finalize(3, 0, {
      name: "First Spin",
      ammo: ["pebble", "stone", "squid"],
      pieces,
      gulls: [{ x: F, y: 1.6, z: 0, perch: "perched" }, { x: F + 1.5, y: 0.4, z: 0.7, perch: "tucked" }],
      windmills: [{ x: F, y: 2.1, z: 0, bladeLength: 1.1, motorSpeed: 1.4 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.5, -0.7, 2, 4, { w: 0.66, h: 0.35, d: 0.66 }, "wood", pieces);
    tower(F + 1.5, 0.7, 2, 3, { w: 0.66, h: 0.35, d: 0.66 }, "stone", pieces);
    crateAt(F, 0, "wood", pieces);
    L.push(finalize(3, 1, {
      name: "Mill Crossing",
      ammo: ["squid", "pebble", "triple"],
      pieces,
      gulls: [
        { x: F - 1.5, y: 1.55, z: -0.7, perch: "perched" },
        { x: F + 1.5, y: 1.2, z: 0.7, perch: "perched" },
        { x: F, y: 0.75, z: 0, perch: "tucked" }
      ],
      windmills: [{ x: F, y: 1.9, z: 0, bladeLength: 1.35, motorSpeed: 1.8 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1.2, -0.8, 3, 3, "stone", 0.2, pieces);
    wall(F + 1.4, 0.9, 2.8, 3, "wood", -0.3, pieces);
    pyramid(F + 0.2, 0, 3, "glass", pieces);
    L.push(finalize(3, 2, {
      name: "Blade Alley",
      ammo: ["ember", "stone", "triple", "squid"],
      pieces,
      gulls: [
        { x: F + 0.2, y: 1.2, z: 0, perch: "perched" },
        { x: F - 1.2, y: 1.1, z: -0.8, perch: "perched" },
        { x: F + 1.4, y: 1.05, z: 0.9, perch: "perched" }
      ],
      windmills: [{ x: F - 0.5, y: 1.8, z: 0.1, bladeLength: 1.5, motorSpeed: 2.3 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.6, -0.6, 2.0, "wood", pieces);
    keep(F + 1.6, 0.7, 1.7, "stone", pieces);
    barrelAt(F, -1.2, pieces);
    L.push(finalize(3, 3, {
      name: "Twin Mills",
      ammo: ["squid", "ember", "stone", "triple"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 2.4, z: -0.6, perch: "perched" },
        { x: F + 1.6, y: 2.1, z: 0.7, perch: "perched" },
        { x: F, y: 0.5, z: -1.2, perch: "tucked" },
        { x: F + 0.2, y: 0.4, z: 0.6, perch: "tucked" }
      ],
      windmills: [
        { x: F - 1.6, y: 2.75, z: -0.6, bladeLength: 1.2, motorSpeed: 1.6 },
        { x: F + 1.6, y: 2.4, z: 0.7, bladeLength: 1.2, motorSpeed: -1.9 }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 2, -1, 2, 5, { w: 0.64, h: 0.35, d: 0.64 }, "stone", pieces);
    tower(F + 2, 1, 2, 5, { w: 0.64, h: 0.35, d: 0.64 }, "wood", pieces);
    pyramid(F, 0, 4, "wood", pieces);
    crateAt(F - 0.5, 1.4, "wood", pieces);
    L.push(finalize(3, 4, {
      name: "Windmill Gap",
      ammo: ["ember", "squid", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 2, y: 1.95, z: -1, perch: "perched" },
        { x: F + 2, y: 1.95, z: 1, perch: "perched" },
        { x: F, y: 1.5, z: 0, perch: "perched" },
        { x: F - 0.7, y: 0.75, z: 0, perch: "tucked" },
        { x: F - 0.5, y: 0.75, z: 1.4, perch: "tucked" }
      ],
      windmills: [
        { x: F - 1, y: 2.4, z: 0.4, bladeLength: 1.6, motorSpeed: 2.1 },
        { x: F + 1, y: 2.4, z: -0.4, bladeLength: 1.6, motorSpeed: -1.7 }
      ]
    }));
  }

  // -------------------------------------------------------- ch4 Gull Keep --
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.5, -0.8, 2.1, "stone", pieces);
    keep(F + 1.5, 0.8, 2.1, "stone", pieces);
    wall(F, 0, 3.4, 2, "wood", 0, pieces);
    L.push(finalize(4, 0, {
      name: "Outer Bailey",
      ammo: ["stone", "squid", "ember", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.5, y: 2.5, z: -0.8, perch: "perched" },
        { x: F + 1.5, y: 2.5, z: 0.8, perch: "perched" },
        { x: F, y: 0.75, z: 0, perch: "tucked" },
        { x: F, y: 0.75, z: 0.4, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.9, -1, 2, 5, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    tower(F + 1.9, 1, 2, 5, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    lintel(F, 1.9, 0, 4.4, "stone", Math.PI / 2, pieces);
    pyramid(F, 0, 3, "glass", pieces);
    crateAt(F - 0.9, 0.6, "wood", pieces);
    L.push(finalize(4, 1, {
      name: "Keep Bridge",
      ammo: ["squid", "stone", "ember", "triple"],
      pieces,
      gulls: [
        { x: F - 1.9, y: 2.0, z: -1, perch: "perched" },
        { x: F + 1.9, y: 2.0, z: 1, perch: "perched" },
        { x: F, y: 1.3, z: 0, perch: "tucked" },
        { x: F - 0.9, y: 0.75, z: 0.6, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F, -1.3, 4.4, 3, "stone", 0, pieces);
    wall(F, 1.3, 4.4, 3, "stone", 0, pieces);
    tower(F - 1.6, 0, 2, 4, { w: 0.64, h: 0.35, d: 0.64 }, "glass", pieces);
    tower(F + 1.6, 0, 2, 4, { w: 0.64, h: 0.35, d: 0.64 }, "glass", pieces);
    barrelAt(F, 0, pieces);
    L.push(finalize(4, 2, {
      name: "Castle Yard",
      ammo: ["ember", "squid", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 1.55, z: 0, perch: "perched" },
        { x: F + 1.6, y: 1.55, z: 0, perch: "perched" },
        { x: F - 1, y: 1.1, z: -1.3, perch: "perched" },
        { x: F + 1, y: 1.1, z: 1.3, perch: "perched" },
        { x: F, y: 0.5, z: 0, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 2, -1, 2.4, "stone", pieces);
    keep(F + 2, 1, 2.4, "stone", pieces);
    keep(F, 0, 1.8, "wood", pieces);
    pyramid(F - 0.9, 1.2, 3, "glass", pieces);
    pyramid(F + 0.9, -1.2, 3, "glass", pieces);
    L.push(finalize(4, 3, {
      name: "Triple Crown",
      ammo: ["squid", "ember", "stone", "triple", "stone"],
      pieces,
      gulls: [
        { x: F - 2, y: 2.85, z: -1, perch: "perched" },
        { x: F + 2, y: 2.85, z: 1, perch: "perched" },
        { x: F, y: 2.2, z: 0, perch: "perched" },
        { x: F - 0.9, y: 1.3, z: 1.2, perch: "perched" },
        { x: F + 0.9, y: 1.3, z: -1.2, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    // Boss fortress: ring of walls, central keep, gull king on top.
    wall(F - 1.8, -1.4, 4.2, 4, "stone", 0.15, pieces);
    wall(F + 1.8, 1.4, 4.2, 4, "stone", -0.15, pieces);
    keep(F, 0, 2.6, "stone", pieces);
    pyramid(F - 0.8, 1.5, 3, "glass", pieces);
    pyramid(F + 0.8, -1.5, 3, "glass", pieces);
    crateAt(F, 2, "wood", pieces);
    barrelAt(F, -2, pieces);
    L.push(finalize(4, 4, {
      name: "Gull Keep",
      ammo: ["squid", "ember", "stone", "triple", "stone", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 3.05, z: 0, perch: "perched" },
        { x: F - 1.8, y: 1.4, z: -1.4, perch: "perched" },
        { x: F + 1.8, y: 1.4, z: 1.4, perch: "perched" },
        { x: F - 0.8, y: 1.3, z: 1.5, perch: "perched" },
        { x: F + 0.8, y: 1.3, z: -1.5, perch: "perched" },
        { x: F, y: 0.8, z: 0, perch: "tucked" }
      ],
      windmills: [{ x: F, y: 3.4, z: 0, bladeLength: 1.5, motorSpeed: 1.5 }]
    }));
  }

  // ------------------------------------------------------- ch5 Moon Roost --
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 3, 4, { w: 0.62, h: 0.32, d: 0.62 }, "ice", pieces);
    lintel(F, 1.4, 0, 2.2, "ice", 0, pieces);
    L.push(finalize(5, 0, {
      name: "Moonrise",
      ammo: ["ember", "pebble", "triple"],
      pieces,
      gulls: [
        { x: F, y: 1.7, z: 0, perch: "perched" },
        { x: F - 0.6, y: 0.5, z: 0, perch: "tucked" }
      ],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.2, -0.6, 2, 4, { w: 0.62, h: 0.33, d: 0.62 }, "obsidian", pieces);
    tower(F + 1.2, 0.6, 2, 4, { w: 0.62, h: 0.33, d: 0.62 }, "ice", pieces);
    lintel(F, 1.45, 0, 3.0, "ice", 0, pieces);
    L.push(finalize(5, 1, {
      name: "Obsidian Twins",
      ammo: ["stone", "ember", "squid"],
      pieces,
      gulls: [
        { x: F - 1.2, y: 1.5, z: -0.6, perch: "perched" },
        { x: F + 1.2, y: 1.5, z: 0.6, perch: "perched" },
        { x: F, y: 0.6, z: 0, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    pyramid(F - 0.7, -0.5, 4, "ice", pieces);
    pyramid(F + 1.5, 0.8, 3, "obsidian", pieces);
    crateAt(F + 0.4, 1.6, "wood", pieces);
    L.push(finalize(5, 2, {
      name: "Crater Rim",
      ammo: ["ember", "triple", "squid", "stone"],
      pieces,
      gulls: [
        { x: F - 0.7, y: 1.5, z: -0.5, perch: "perched" },
        { x: F + 1.5, y: 1.2, z: 0.8, perch: "perched" },
        { x: F - 0.35, y: 0.8, z: -0.5, perch: "tucked" },
        { x: F + 0.4, y: 0.75, z: 1.6, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.6, -0.8, 2.2, "obsidian", pieces);
    keep(F + 1.6, 0.8, 2.0, "ice", pieces);
    wall(F, 0, 3.6, 2, "ice", Math.PI / 2, pieces);
    barrelAt(F, 1.8, pieces);
    L.push(finalize(5, 3, {
      name: "Lunar Keep",
      ammo: ["squid", "ember", "stone", "triple"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 2.65, z: -0.8, perch: "perched" },
        { x: F + 1.6, y: 2.45, z: 0.8, perch: "perched" },
        { x: F, y: 0.7, z: 0, perch: "tucked" },
        { x: F, y: 0.75, z: 1.8, perch: "perched" }
      ],
      windmills: [{ x: F, y: 2.9, z: 0, bladeLength: 1.4, motorSpeed: 1.2 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1.7, -1.2, 4, 4, "obsidian", 0.2, pieces);
    wall(F + 1.7, 1.2, 4, 4, "ice", -0.2, pieces);
    keep(F, 0, 2.4, "obsidian", pieces);
    pyramid(F, 1.7, 3, "ice", pieces);
    crateAt(F - 0.6, -1.7, "wood", pieces);
    L.push(finalize(5, 4, {
      name: "Moon Roost",
      ammo: ["squid", "ember", "stone", "triple", "ember", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 2.85, z: 0, perch: "perched" },
        { x: F - 1.7, y: 1.4, z: -1.2, perch: "perched" },
        { x: F + 1.7, y: 1.4, z: 1.2, perch: "perched" },
        { x: F, y: 1.25, z: 1.7, perch: "perched" },
        { x: F - 0.6, y: 0.75, z: -1.7, perch: "tucked" },
        { x: F, y: 0.7, z: 0, perch: "tucked" }
      ],
      windmills: [{ x: F, y: 3.2, z: 0, bladeLength: 1.7, motorSpeed: 1.1 }]
    }));
  }

  return L;
}

export const LEVELS: readonly LevelSpec[] = buildLevels();

export function levelById(id: number): LevelSpec {
  return LEVELS[Math.min(Math.max(0, id), LEVELS.length - 1)]!;
}

/** Star-gating: level unlocks when cumulative stars reach its gate. */
export const STAR_GATES: readonly number[] = LEVELS.map((_, i) => {
  const chapter = Math.floor(i / 5);
  const slot = i % 5;
  return chapter * 8 + Math.max(0, slot - 1) * 2;
});

/** Campaign stars only: ids outside the campaign (the Trajectory Range sandbox is 99) never count toward unlocks. */
export function totalStars(stars: Readonly<Record<number, number>>): number {
  let sum = 0;
  for (const key of Object.keys(stars)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id < 0 || id >= LEVELS.length) continue;
    sum += stars[id] ?? 0;
  }
  return sum;
}

export function isLevelUnlocked(id: number, stars: Readonly<Record<number, number>>): boolean {
  return id === 0 || totalStars(stars) >= (STAR_GATES[id] ?? 0);
}
