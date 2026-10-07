/**
 * PRD-10 §7.1.8 / T5.5 — `world.room`: procedural interior assembled from the
 * interior kit (default `world.kits.interior`). Walls are emitted as box
 * primitives split around openings (lintel/jamb boxes per opening — no CSG);
 * floors/ceilings are kit `floor-tile` fills; dressing is a seeded `kit.fill`
 * over the interior footprint. Piece sockets carrying `lights` emit real
 * `light` nodes (the PRD's "practical lights").
 */
import type { AuraMaterialSpec, AuraSceneNode, AuraVec3 } from "../index.js";
import { material, primitives } from "../index.js";
import type { AuraWorldShape } from "./terrain.js";
import type { AuraBiomeId } from "../../contracts/world.js";
import type { AuraKit, AuraKitPlacement } from "./kits.js";
import { worldKits } from "./kits.js";

export interface AuraRoomOpening {
  readonly wall: "north" | "south" | "east" | "west";
  /** Centre offset along the wall in metres from the wall midpoint. */
  readonly offset?: number;
  readonly width: number;
  readonly height?: number; // default wall height (door to ceiling = no lintel)
}

export interface AuraRoomOptions {
  /** Interior clear size [w, h, d] in metres (walls sit on the boundary). */
  readonly size: readonly [number, number, number];
  /** Kit supplying wall/floor/dressing pieces; default world.kits.interior. */
  readonly kit?: AuraKit;
  readonly walls?: { readonly material?: AuraMaterialSpec } | false;
  readonly floor?: { readonly material?: AuraMaterialSpec } | false;
  readonly ceiling?: { readonly material?: AuraMaterialSpec } | false;
  readonly openings?: readonly AuraRoomOpening[];
  readonly dressing?: { readonly density?: number; readonly pieces?: Readonly<Record<string, number>>; readonly seed?: number } | false;
  /** Biome key — selects the default dressing palette seed. */
  readonly biome?: AuraBiomeId;
  readonly name?: string;
  readonly origin?: AuraVec3;
}

const wallMaterial = (spec: AuraMaterialSpec | undefined): AuraMaterialSpec =>
  spec ?? material.pbr({ color: "#8d8579", roughness: 0.9 });

export function worldRoom(options: AuraRoomOptions): readonly AuraSceneNode[] {
  const [w, h, d] = options.size;
  if (!(w > 0) || !(h > 0) || !(d > 0)) throw new Error("world.room: size must be positive [w, h, d] metres");
  const kit = options.kit ?? worldKits.interior;
  const [ox, oy, oz] = options.origin ?? [0, 0, 0];
  const name = options.name ?? "room";
  const nodes: AuraSceneNode[] = [];
  const T = 0.2; // wall/floor thickness

  // ---------------- walls, split around openings ----------------
  if (options.walls !== false) {
    const mat = wallMaterial(typeof options.walls === "object" ? options.walls.material : undefined);
    // walls along each side; x-walls run along x (north/south), z-walls along z
    const sides: { id: "north" | "south" | "east" | "west"; axis: "x" | "z"; sign: 1 | -1; len: number }[] = [
      { id: "north", axis: "x", sign: -1, len: w },
      { id: "south", axis: "x", sign: 1, len: w },
      { id: "east", axis: "z", sign: 1, len: d },
      { id: "west", axis: "z", sign: -1, len: d }
    ];
    for (const side of sides) {
      const openings = (options.openings ?? [])
        .filter((o) => o.wall === side.id && o.width > 0)
        .map((o) => ({ at: o.offset ?? 0, width: o.width, height: Math.min(h, o.height ?? h) }))
        .sort((a, b) => a.at - b.at);
      // wall runs from -len/2..len/2 along the axis; openings carve spans
      const spans: { a: number; b: number; lintel?: { a: number; b: number; top: number } }[] = [];
      let cursor = -side.len / 2;
      for (const o of openings) {
        const a = o.at - o.width / 2, b = o.at + o.width / 2;
        if (a > cursor) spans.push({ a: cursor, b: a });
        if (o.height < h) spans.push({ a, b, lintel: { a, b, top: o.height } });
        cursor = Math.max(cursor, b);
      }
      if (cursor < side.len / 2) spans.push({ a: cursor, b: side.len / 2 });
      let idx = 0;
      for (const span of spans) {
        if (span.lintel) continue; // lintel entries are drawn by the lintel loop
        const mid = (span.a + span.b) / 2;
        const lenSpan = span.b - span.a;
        if (lenSpan <= 0) continue;
        const pos: AuraVec3 = side.axis === "x"
          ? [ox + mid, oy + h / 2, oz + side.sign * (d / 2 + T / 2)]
          : [ox + side.sign * (w / 2 + T / 2), oy + h / 2, oz + mid];
        nodes.push(
          primitives.box({ name: `${name}-${side.id}-wall-${idx++}`, material: mat })
            .position(pos[0], pos[1], pos[2])
            .scale(side.axis === "x" ? [lenSpan, h, T] : [T, h, lenSpan])
            .toJSON()
        );
      }
      // lintels above openings
      for (const span of spans) {
        if (!span.lintel) continue;
        const mid = (span.lintel.a + span.lintel.b) / 2;
        const lenSpan = span.lintel.b - span.lintel.a;
        const lintelH = h - span.lintel.top;
        const pos: AuraVec3 = side.axis === "x"
          ? [ox + mid, oy + span.lintel.top + lintelH / 2, oz + side.sign * (d / 2 + T / 2)]
          : [ox + side.sign * (w / 2 + T / 2), oy + span.lintel.top + lintelH / 2, oz + mid];
        nodes.push(
          primitives.box({ name: `${name}-${side.id}-lintel-${idx++}`, material: mat })
            .position(pos[0], pos[1], pos[2])
            .scale(side.axis === "x" ? [lenSpan, lintelH, T] : [T, lintelH, lenSpan])
            .toJSON()
        );
      }
      // door pieces sit at floor-level openings
      for (const o of openings) {
        if (o.height >= h * 0.5) {
          const pos: AuraVec3 = side.axis === "x"
            ? [ox + o.at, oy, oz + side.sign * (d / 2)]
            : [ox + side.sign * (w / 2), oy, oz + o.at];
          const rot = side.axis === "x" ? 0 : 1; // quarter-turn to face along z
          nodes.push(...kit.place([{ piece: "door", position: pos, rotationSteps: rot }]).nodes);
        }
      }
    }
  }

  // ---------------- floor + ceiling ----------------
  const dressingOpts = typeof options.dressing === "object" ? options.dressing : undefined;
  if (options.floor !== false) {
    const floorMat = typeof options.floor === "object" ? options.floor.material : undefined;
    if (floorMat) {
      // explicit floor material → one slab instead of kit floor tiles
      nodes.push(
        primitives.box({ name: `${name}-floor`, material: floorMat })
          .position(ox, oy - T / 2, oz)
          .scale([w + T * 2, T, d + T * 2])
          .toJSON()
      );
    } else {
      nodes.push(...kit.fill(
        { shape: { kind: "polygon", points: [[ox - w / 2, oz - d / 2], [ox + w / 2, oz - d / 2], [ox + w / 2, oz + d / 2], [ox - w / 2, oz + d / 2]] } },
        { density: 1, seed: dressingOpts?.seed ?? 17, pieces: { "floor-tile": 1 }, rotationSteps: 0 }
      ).nodes);
    }
  }
  if (options.ceiling !== false) {
    const mat = wallMaterial(typeof options.ceiling === "object" ? options.ceiling.material : undefined);
    nodes.push(
      primitives.box({ name: `${name}-ceiling`, material: mat })
        .position(ox, oy + h + T / 2, oz)
        .scale([w + T * 2, T, d + T * 2])
        .toJSON()
    );
  }

  // ---------------- dressing + practical lights ----------------
  const dressing = options.dressing === false ? undefined : (options.dressing ?? { density: 0.25 });
  if (dressing) {
    const margin = 1.2;
    const shape: AuraWorldShape = {
      kind: "polygon",
      points: [
        [ox - w / 2 + margin, oz - d / 2 + margin],
        [ox + w / 2 - margin, oz - d / 2 + margin],
        [ox + w / 2 - margin, oz + d / 2 - margin],
        [ox - w / 2 + margin, oz + d / 2 - margin]
      ]
    };
    // biome → deterministic dressing seed (name hash so custom kits stay stable)
    const biomeSeed = options.biome ? [...options.biome].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) : 29;
    const seed = dressingOpts?.seed ?? biomeSeed;
    nodes.push(
      ...kit.fill({ shape }, {
        density: dressingOpts?.density ?? 0.25,
        seed,
        pieces: dressingOpts?.pieces,
        rotationSteps: "random"
      }).nodes
    );
  }
  // ceiling lamps — interior kit pieces with practical lights
  const lampCount = Math.max(1, Math.floor((w * d) / 16));
  const lampPlacements: AuraKitPlacement[] = [];
  for (let i = 0; i < lampCount; i += 1) {
    const fx = lampCount === 1 ? 0 : -w / 2 + (w * (i + 0.5)) / lampCount;
    lampPlacements.push({ piece: "ceiling-lamp", position: [ox + fx, oy + h - 0.1, oz] });
  }
  try {
    nodes.push(...kit.place(lampPlacements).nodes);
  } catch {
    // custom kits without a ceiling-lamp piece skip practicals silently
  }
  // §6.3 default rule: a world.room scene resolves to the interior-neutral
  // biome. Emit an environment-scope `biome` node (T6.3 scope semantics) so the
  // resolver sees the signal regardless of `options.name`.
  nodes.push({
    kind: "biome",
    id: `${name}-environment`,
    name: `${name}-environment`,
    biome: options.biome ?? "interior-neutral",
    scope: "environment"
  } as unknown as AuraSceneNode);
  return nodes;
}
