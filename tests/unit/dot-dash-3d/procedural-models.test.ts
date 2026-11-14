import { describe, expect, it } from "vitest";
import {
  BONUS_RELIC_KINDS,
  POOL_CAPS,
  POOL_GEOMETRIES,
  getPoolBounds,
  type PoolKey
} from "../../../apps/showcase-dot-dash-3d/src/art/proceduralModels";
import { buildScene } from "../../../apps/showcase-dot-dash-3d/src/game/world";

interface FlatNode {
  readonly kind: string;
  readonly name?: string;
  readonly runtime?: { readonly id?: string };
  readonly primitive?: string;
  readonly castShadow?: boolean;
  readonly instances?: readonly unknown[];
  readonly material?: {
    readonly opacity?: number;
    readonly ior?: number;
    readonly clearcoat?: number;
    readonly sheen?: number;
    readonly emissiveIntensity?: number;
    readonly practical?: boolean;
  };
  readonly children?: readonly FlatNode[];
}

function collectNodes(): FlatNode[] {
  const { nodes } = buildScene() as { nodes: readonly FlatNode[] };
  const out: FlatNode[] = [];
  const walk = (list: readonly FlatNode[]): void => {
    for (const n of list) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

describe("dot-dash-3d procedural multi-material overhaul (WP-12)", () => {
  it("normalizes all 24 pool-${k} geometries strictly inside [-0.5 .. +0.5]^3 unit bounds", () => {
    const keys = Object.keys(POOL_CAPS) as PoolKey[];
    expect(keys).toHaveLength(24);

    for (const key of keys) {
      const spec = POOL_GEOMETRIES[key];
      const positions = spec.positions as Float32Array;
      const indices = spec.indices as Uint16Array | Uint32Array;
      expect(positions.length, `pool-${key} must have vertices`).toBeGreaterThanOrEqual(24);
      expect(indices.length, `pool-${key} must have indexed triangles`).toBeGreaterThanOrEqual(12);

      const bounds = getPoolBounds(key);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(bounds.min[axis], `pool-${key} min[${axis}] >= -0.5`).toBeGreaterThanOrEqual(-0.5);
        expect(bounds.max[axis], `pool-${key} max[${axis}] <= 0.5`).toBeLessThanOrEqual(0.5);
      }
      for (let i = 0; i < positions.length; i += 1) {
        const v = positions[i]!;
        expect(Number.isFinite(v), `pool-${key} finite coordinate`).toBe(true);
        expect(v, `pool-${key} vertex >= -0.5`).toBeGreaterThanOrEqual(-0.5);
        expect(v, `pool-${key} vertex <= 0.5`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("sculpts 4 distinct Hunter/Ghost automaton silhouettes (shC, shB, shT, shY)", () => {
    const counts = (["shC", "shB", "shT", "shY"] as const).map((k) => {
      const pos = POOL_GEOMETRIES[k].positions as Float32Array;
      const idx = POOL_GEOMETRIES[k].indices as Uint16Array | Uint32Array;
      expect(pos.length / 3, `${k} sculpted vertex count`).toBeGreaterThan(120);
      return `${pos.length / 3}:${idx.length / 3}`;
    });
    expect(new Set(counts).size).toBe(4);
  });

  it("mounts zero static GLB model nodes and wires courier, warp arches, bonus relics, and desk lamp", () => {
    const all = collectNodes();
    expect(all.filter((n) => n.kind === "model")).toHaveLength(0);

    const byId = new Map(all.filter((n) => n.runtime?.id).map((n) => [n.runtime!.id!, n]));
    for (const key of Object.keys(POOL_CAPS) as PoolKey[]) {
      const poolNode = byId.get(`pool-${key}`);
      expect(poolNode, `pool-${key} mounted`).toBeDefined();
      expect(poolNode!.primitive).toBe("custom");
    }

    expect(byId.get("courier-pod")?.kind).toBe("group");
    expect(byId.get("courier-pod-echo")?.kind).toBe("group");
    expect(byId.get("byte")?.primitive).toBe("custom");
    expect(byId.get("desk-lamp-rig")?.kind).toBe("group");

    for (let i = 0; i < 4; i += 1) {
      expect(byId.get(`warp-arch-${i}`)?.kind).toBe("group");
    }
    for (const kind of BONUS_RELIC_KINDS) {
      expect(byId.get(`bonus-relic-${kind}`)?.kind).toBe("group");
    }
  });

  it("enforces clearcoat: 0, sheen: 0 on >16 instance batches and castShadow: false on glass shells", () => {
    const all = collectNodes();
    const largeBatches = all.filter((n) => Array.isArray(n.instances) && n.instances.length > 16);
    expect(largeBatches.length).toBeGreaterThanOrEqual(11);
    for (const batch of largeBatches) {
      expect(batch.material?.clearcoat ?? 0, `${batch.name} clearcoat === 0`).toBe(0);
      expect(batch.material?.sheen ?? 0, `${batch.name} sheen === 0`).toBe(0);
    }

    for (const glassName of ["courier-pod-visor-dome", "bonus-relic-star-canopy", "prisms", "nixie-tubes"]) {
      const gNode = all.find((n) => n.name === glassName);
      expect(gNode, `${glassName} exists`).toBeDefined();
      expect(gNode!.castShadow).toBe(false);
      expect(gNode!.material?.ior).toBe(1.52);
      expect(gNode!.material?.opacity).toBe(0.44);
    }
  });

  it("sculpts ultra-smooth SDF/Taubin hero chomper mascot and multi-part directional ghost eyes/skirts (WP-3)", () => {
    const countDistinctRgb = (colors: Float32Array | readonly number[] | undefined): number => {
      if (!colors) return 0;
      const seen = new Set<string>();
      const stride = colors.length % 4 === 0 ? 4 : 3;
      for (let i = 0; i + 2 < colors.length; i += stride) {
        seen.add(`${colors[i]!.toFixed(2)},${colors[i + 1]!.toFixed(2)},${colors[i + 2]!.toFixed(2)}`);
      }
      return seen.size;
    };

    for (const ghostKey of ["shC", "shB", "shT", "shY"] as const) {
      const spec = POOL_GEOMETRIES[ghostKey];
      const pos = spec.positions as Float32Array;
      const norm = spec.normals as Float32Array;
      expect(pos.length / 3, `${ghostKey} smooth domed-to-scalloped vertex count`).toBeGreaterThan(800);
      expect(norm.length).toBe(pos.length);
      for (let i = 0; i < norm.length; i += 3) {
        const len = Math.hypot(norm[i]!, norm[i + 1]!, norm[i + 2]!);
        expect(len).toBeCloseTo(1, 3);
      }
    }

    // Multi-part directional ghost eyes & brows (white sclera + cobalt iris + dark pupil + brows)
    expect(countDistinctRgb(POOL_GEOMETRIES.visor.colors as Float32Array)).toBeGreaterThanOrEqual(3);
    expect(countDistinctRgb(POOL_GEOMETRIES.eyes.colors as Float32Array)).toBeGreaterThanOrEqual(4);

    // Hero chomper-courier multi-material chassis (glossy sclera, iris, coral tongue, SDF gloves & dash boots)
    type MeshNode = FlatNode & {
      readonly customGeometry?: { readonly positions?: Float32Array | readonly number[] };
      readonly geometry?: { readonly positions?: Float32Array | readonly number[] };
      readonly materials?: readonly unknown[];
    };
    const all = collectNodes() as MeshNode[];
    const chassis = all.find((n) => n.name === "courier-pod-chassis");
    expect(chassis).toBeDefined();
    const chassisMeshes = chassis!.children && chassis!.children.length > 0 ? (chassis!.children as MeshNode[]) : [chassis!];
    const materialSlotCount =
      chassis!.children && chassis!.children.length > 0
        ? chassis!.children.length
        : (chassis!.materials ?? []).length;
    expect(materialSlotCount).toBeGreaterThanOrEqual(8);
    const totalVerts = chassisMeshes.reduce((acc, m) => {
      const pos = m.customGeometry?.positions ?? m.geometry?.positions;
      return acc + (pos ? pos.length / 3 : 0);
    }, 0);
    expect(totalVerts).toBeGreaterThan(1500);
  });
});
