/**
 * Per-court set-pieces and 360° streetball perimeter enclosures (new look; `?look=original` keeps the 4.6 venue).
 * Presentation only: nothing collides, every piece stands outside the playable court and camera obstacle cylinders,
 * and instanced draws keep per-court draw-call budgets tight.
 */
import {
  instances,
  material,
  model,
  primitives,
  type AuraAssetRef,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraVec3
} from "@aura3d/engine";
import type { CourtId } from "./courtRigs";
import { dualChainLinkFenceSpec } from "./hoopsShaders";

export interface SetPieceAssets {
  readonly mural: AuraAssetRef<"model">;
  readonly lifeguardTower: AuraAssetRef<"model">;
  readonly corrugatedRoof: AuraAssetRef<"model">;
  readonly container: AuraAssetRef<"model">;
  readonly bleacher: AuraAssetRef<"model">;
}

/** The centre of the court the pieces face. */
const COURT_CENTRE: readonly [number, number] = [0, 4];
const facing = (x: number, z: number): number => Math.atan2(COURT_CENTRE[0] - x, COURT_CENTRE[1] - z);

export interface SetPiecePlacement {
  readonly name: string;
  readonly position: AuraVec3;
  readonly yaw: number;
}

/** Where each court's pieces stand (x, z on the ground; yaw so the model front faces the court). Exported for tests. */
export const SET_PIECE_PLACEMENTS: Readonly<Record<string, readonly SetPiecePlacement[]>> = {
  rucker: [
    { name: "mural-wall", position: [0, 0, -24], yaw: 0 },
    // the covered bleachers flank the 10 m far stand (x -5..5) and stand behind the far light poles (+-11, -7)
    ...[-1, 1].map((s) => ({ name: `covered-bleacher-${s < 0 ? "w" : "e"}`, position: [s * 10.5, 0, -16.5] as AuraVec3, yaw: facing(s * 10.5, -16.5) }))
  ],
  venice: [{ name: "lifeguard-tower", position: [-15, 0, -13], yaw: facing(-15, -13) }],
  manila: [-1, 1].map((s) => ({ name: `corrugated-roof-${s < 0 ? "w" : "e"}`, position: [s * 24, 0, -10] as AuraVec3, yaw: facing(s * 24, -10) })),
  shanghai: [-1, 1].map((s) => ({ name: `dock-container-${s < 0 ? "w" : "e"}`, position: [s * 15, 0, -12] as AuraVec3, yaw: facing(s * 15, -12) }))
};

export function courtSetPieceNodes(courtId: string, refs: SetPieceAssets): AuraNodeBuilder<AuraSceneNode>[] {
  const at = SET_PIECE_PLACEMENTS[courtId] ?? [];
  if (at.length === 0) return [];
  const common = { castShadow: false, receiveShadow: true, role: "setDressing" } as const;
  switch (courtId) {
    case "rucker":
      return [
        ...at.filter((p) => p.name === "mural-wall").map((p) => model(refs.mural, { name: p.name, targetMaxDimension: 11, scaleMode: "fit", ...common }).position(...p.position).rotate(0, p.yaw, 0) as unknown as AuraNodeBuilder<AuraSceneNode>),
        instances.model(refs.bleacher, { name: "covered-bleachers", targetMaxDimension: 8, scaleMode: "fit", ...common, transforms: at.filter((p) => p.name.startsWith("covered-bleacher")).map((p) => ({ position: p.position, rotation: [0, p.yaw, 0] as AuraVec3 })) }) as unknown as AuraNodeBuilder<AuraSceneNode>
      ];
    case "venice":
      return at.map((p) => model(refs.lifeguardTower, { name: p.name, targetHeight: 4.4, scaleMode: "fit", ...common }).position(...p.position).rotate(0, p.yaw, 0) as unknown as AuraNodeBuilder<AuraSceneNode>);
    case "manila":
      return [instances.model(refs.corrugatedRoof, { name: "corrugated-roofs", targetHeight: 6.5, scaleMode: "fit", ...common, transforms: at.map((p) => ({ position: p.position, rotation: [0, p.yaw, 0] as AuraVec3 })) }) as unknown as AuraNodeBuilder<AuraSceneNode>];
    case "shanghai":
      return [instances.model(refs.container, { name: "dock-containers", targetMaxDimension: 5, scaleMode: "fit", ...common, transforms: at.map((p) => ({ position: p.position, rotation: [0, p.yaw, 0] as AuraVec3 })) }) as unknown as AuraNodeBuilder<AuraSceneNode>];
    default:
      return [];
  }
}

/** Crisp white shooter's square + outer border frame + brushed-steel breakaway rim collar on the tempered glass backboard. */
export function backboardTrimNodes(boardZ: number, rimY: number): AuraNodeBuilder<AuraSceneNode>[] {
  const z = boardZ + 0.052;
  const bars: { position: AuraVec3; scale: AuraVec3 }[] = [
    // Inner white shooter's square (0.61 m x 0.46 m above the rim)
    { position: [0, rimY + 0.48, z], scale: [0.61, 0.036, 0.014] },
    { position: [0, rimY + 0.05, z], scale: [0.61, 0.036, 0.014] },
    { position: [-0.287, rimY + 0.265, z], scale: [0.036, 0.466, 0.014] },
    { position: [0.287, rimY + 0.265, z], scale: [0.036, 0.466, 0.014] },
    // Outer tempered-glass border tape (1.80 m x 1.06 m)
    { position: [0, 3.88, z], scale: [1.8, 0.04, 0.016] },
    { position: [0, 2.84, z], scale: [1.8, 0.04, 0.016] },
    { position: [-0.88, 3.36, z], scale: [0.04, 1.08, 0.016] },
    { position: [0.88, 3.36, z], scale: [0.04, 1.08, 0.016] }
  ];
  return [
    instances.box({
      name: "backboard-shooter-square",
      transforms: bars,
      castShadow: false,
      material: material.lacquer({ color: "#f6f8fb", roughness: 0.18 })
    }) as AuraNodeBuilder<AuraSceneNode>,
    primitives.box({
      name: "rim-steel-collar",
      size: [0.18, 0.13, 0.14],
      material: material.brushedMetal({ color: "#b6bec7", roughness: 0.28 })
    }).position(0, rimY - 0.03, boardZ + 0.11) as unknown as AuraNodeBuilder<AuraSceneNode>
  ];
}

/** Grounded scorer's table (under the championship trophy at `[9.2, 0.78, -3.4]`) + courtside team benches. */
export function courtsideTableNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const tx = 9.2;
  const tz = -3.4;
  const tableYaw = -0.8;
  const cy = Math.cos(tableYaw);
  const sy = Math.sin(tableYaw);
  const local = (lx: number, ly: number, lz: number): AuraVec3 => [
    tx + lx * cy + lz * sy,
    ly,
    tz - lx * sy + lz * cy
  ];
  const steelParts: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [
    // 4 scorer's table steel legs
    { position: local(-0.78, 0.38, -0.38), rotation: [0, tableYaw, 0], scale: [0.06, 0.76, 0.06] },
    { position: local(0.78, 0.38, -0.38), rotation: [0, tableYaw, 0], scale: [0.06, 0.76, 0.06] },
    { position: local(-0.78, 0.38, 0.38), rotation: [0, tableYaw, 0], scale: [0.06, 0.76, 0.06] },
    { position: local(0.78, 0.38, 0.38), rotation: [0, tableYaw, 0], scale: [0.06, 0.76, 0.06] },
    // Sideline bench steel legs (west & east sidelines, well outside court bounds)
    { position: [-10.4, 0.22, 2.2], rotation: [0, 0, 0], scale: [0.08, 0.44, 0.38] },
    { position: [-10.4, 0.22, 5.4], rotation: [0, 0, 0], scale: [0.08, 0.44, 0.38] },
    { position: [10.4, 0.22, 2.2], rotation: [0, 0, 0], scale: [0.08, 0.44, 0.38] },
    { position: [10.4, 0.22, 5.4], rotation: [0, 0, 0], scale: [0.08, 0.44, 0.38] }
  ];
  const woodParts: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [
    // Scorer's table lacquered hardwood top (top sits at y = 0.78 m)
    { position: [tx, 0.75, tz], rotation: [0, tableYaw, 0], scale: [1.85, 0.06, 0.96] },
    // Scorer's table front modesty banner
    { position: local(0, 0.44, 0.42), rotation: [0, tableYaw, 0], scale: [1.72, 0.56, 0.04] },
    // Courtside hardwood benches
    { position: [-10.4, 0.46, 3.8], rotation: [0, 0, 0], scale: [0.46, 0.06, 3.8] },
    { position: [10.4, 0.46, 3.8], rotation: [0, 0, 0], scale: [0.46, 0.06, 3.8] }
  ];
  return [
    instances.box({
      name: "courtside-steel-frames",
      transforms: steelParts,
      castShadow: true,
      receiveShadow: true,
      material: material.brushedMetal({ color: "#767e88", roughness: 0.34 })
    }) as AuraNodeBuilder<AuraSceneNode>,
    instances.box({
      name: "courtside-wood-tops",
      transforms: woodParts,
      castShadow: true,
      receiveShadow: true,
      material: material.lacquer({ color: "#3d2618", roughness: 0.28 })
    }) as AuraNodeBuilder<AuraSceneNode>
  ];
}

/** 360° perimeter enclosures per court: chain-link cages, park trees, rooftop parapets, riverside rails & skylines. */
export function courtEnclosureNodes(courtId: CourtId): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [];

  if (courtId === "rucker") {
    const fenceMat = material.custom(dualChainLinkFenceSpec("#8a9199"));
    const fencePosts: { position: AuraVec3; scale: AuraVec3 }[] = [];
    for (const x of [-21, -14, -7, 0, 7, 14, 21]) {
      fencePosts.push({ position: [x, 2.05, -21.2], scale: [0.09, 4.1, 0.09] });
    }
    for (const z of [-18, -10, -2, 6, 14, 21]) {
      fencePosts.push({ position: [-22.4, 2.05, z], scale: [0.09, 4.1, 0.09] });
      fencePosts.push({ position: [22.4, 2.05, z], scale: [0.09, 4.1, 0.09] });
    }
    out.push(
      primitives.plane({ name: "rucker-fence-north", size: [44.8, 1, 4.1], material: fenceMat }).position(0, 2.05, -21.2).rotate(Math.PI / 2, 0, 0) as unknown as AuraNodeBuilder<AuraSceneNode>,
      primitives.plane({ name: "rucker-fence-west", size: [42.2, 1, 4.1], material: fenceMat }).position(-22.4, 2.05, -0.1).rotate(Math.PI / 2, 0, Math.PI / 2) as unknown as AuraNodeBuilder<AuraSceneNode>,
      primitives.plane({ name: "rucker-fence-east", size: [42.2, 1, 4.1], material: fenceMat }).position(22.4, 2.05, -0.1).rotate(Math.PI / 2, 0, -Math.PI / 2) as unknown as AuraNodeBuilder<AuraSceneNode>,
      instances.cylinder({
        name: "rucker-fence-posts",
        transforms: fencePosts,
        castShadow: false,
        material: material.brushedMetal({ color: "#8a9199", roughness: 0.36 })
      }) as AuraNodeBuilder<AuraSceneNode>
    );
    // Harlem park sycamore trunks + evening canopy crowns between the cage and brownstones
    const treeSpots: readonly [number, number, number][] = [
      [-28, -26, 1.05], [-16, -30, 1.18], [16, -30, 1.12], [28, -25, 1.0],
      [-31, -6, 1.15], [31, -5, 1.08], [-29, 18, 1.04], [29, 19, 1.14]
    ];
    const trunks = treeSpots.map(([x, z, s]) => ({ position: [x, 2.3 * s, z] as AuraVec3, scale: [0.42 * s, 4.6 * s, 0.42 * s] as AuraVec3 }));
    const crowns = treeSpots.map(([x, z, s]) => ({ position: [x, 6.2 * s, z] as AuraVec3, scale: [5.4 * s, 4.2 * s, 5.4 * s] as AuraVec3 }));
    out.push(
      instances.cylinder({ name: "rucker-tree-trunks", transforms: trunks, castShadow: false, material: material.physical({ color: "#3d2c22", roughness: 0.92 }) }) as AuraNodeBuilder<AuraSceneNode>,
      instances.sphere({ name: "rucker-tree-crowns", transforms: crowns, castShadow: false, material: material.physical({ color: "#273828", roughness: 0.86, sheen: 0.14 }) }) as AuraNodeBuilder<AuraSceneNode>
    );
    return out;
  }

  if (courtId === "venice") {
    // Coastal boardwalk sea-wall & distant Pacific headland silhouettes
    const wallSegs: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [
      { position: [0, 0.38, -16.4], rotation: [0, 0, 0], scale: [86, 0.76, 0.55] },
      { position: [-26, 0.34, 4], rotation: [0, Math.PI / 2, 0], scale: [40, 0.68, 0.45] },
      { position: [26, 0.34, 4], rotation: [0, Math.PI / 2, 0], scale: [40, 0.68, 0.45] }
    ];
    const headlands: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [
      { position: [-68, 5.5, -86], rotation: [0, 0.25, 0], scale: [54, 11, 22] },
      { position: [74, 4.2, -92], rotation: [0, -0.2, 0], scale: [48, 8.4, 20] },
      { position: [0, 3.2, 88], rotation: [0, 0, 0], scale: [120, 6.4, 18] }
    ];
    out.push(
      instances.box({ name: "venice-boardwalk-wall", transforms: wallSegs, castShadow: false, material: material.physical({ color: "#d6cab2", roughness: 0.82 }) }) as AuraNodeBuilder<AuraSceneNode>,
      instances.box({ name: "venice-coastal-horizon", transforms: headlands, castShadow: false, material: material.physical({ color: "#6d5952", roughness: 0.95 }) }) as AuraNodeBuilder<AuraSceneNode>
    );
    return out;
  }

  if (courtId === "athens") {
    // Whitewashed rooftop parapet wall + terracotta coping enclosing the terrace
    const walls: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [
      { position: [0, 0.58, -21.5], rotation: [0, 0, 0], scale: [45, 1.16, 0.48] },
      { position: [-22.5, 0.58, 2.5], rotation: [0, Math.PI / 2, 0], scale: [48, 1.16, 0.48] },
      { position: [22.5, 0.58, 2.5], rotation: [0, Math.PI / 2, 0], scale: [48, 1.16, 0.48] },
      { position: [0, 0.58, 26.5], rotation: [0, 0, 0], scale: [45, 1.16, 0.48] }
    ];
    const coping = walls.map((w) => ({ position: [w.position[0], 1.2, w.position[2]] as AuraVec3, rotation: w.rotation, scale: [w.scale[0] + 0.16, 0.1, 0.62] as AuraVec3 }));
    out.push(
      instances.box({ name: "athens-parapet-walls", transforms: walls, castShadow: true, receiveShadow: true, material: material.physical({ color: "#ece6da", roughness: 0.85 }) }) as AuraNodeBuilder<AuraSceneNode>,
      instances.box({ name: "athens-parapet-coping", transforms: coping, castShadow: false, material: material.lacquer({ color: "#b66543", roughness: 0.42 }) }) as AuraNodeBuilder<AuraSceneNode>
    );
    return out;
  }

  if (courtId === "manila") {
    // Covered court steel canopy columns + surrounding Barangay townhome silhouettes
    const cols: { position: AuraVec3; scale: AuraVec3 }[] = [];
    for (const x of [-16.2, 16.2]) {
      for (const z of [-13, -1, 10, 20]) {
        cols.push({ position: [x, 4.6, z], scale: [0.34, 9.2, 0.34] });
      }
    }
    const blocks: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 52 + (i % 3) * 6;
      const h = 8 + (i % 4) * 3.2;
      blocks.push({ position: [Math.sin(a) * r, h / 2, 4 + Math.cos(a) * r], rotation: [0, a, 0], scale: [14, h, 12] });
    }
    out.push(
      instances.box({ name: "manila-canopy-columns", transforms: cols, castShadow: true, material: material.brushedMetal({ color: "#5e656d", roughness: 0.42 }) }) as AuraNodeBuilder<AuraSceneNode>,
      instances.box({ name: "manila-alley-blocks", transforms: blocks, castShadow: false, material: material.physical({ color: "#342d26", roughness: 0.9 }) }) as AuraNodeBuilder<AuraSceneNode>
    );
    return out;
  }

  if (courtId === "shanghai") {
    // Riverside Bund guardrail + chain-link baseline cage + 360° high-rise towers
    const fenceMat = material.custom(dualChainLinkFenceSpec("#6e849c"));
    const railPosts: { position: AuraVec3; scale: AuraVec3 }[] = [];
    for (let x = -28; x <= 28; x += 4) {
      railPosts.push({ position: [x, 0.55, 13.6], scale: [0.1, 1.1, 0.1] });
    }
    railPosts.push({ position: [0, 1.08, 13.6], scale: [56.4, 0.08, 0.12] });
    const towers: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [];
    const neonBands: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 82 + (i % 4) * 8;
      const h = 22 + (i % 5) * 9;
      const w = 11 + (i % 3) * 3;
      const px = Math.sin(a) * r;
      const pz = 4 + Math.cos(a) * r;
      towers.push({ position: [px, h / 2, pz], rotation: [0, a, 0], scale: [w, h, w] });
      neonBands.push({ position: [px, h - 1.2, pz], rotation: [0, a, 0], scale: [w + 0.25, 0.45, w + 0.25] });
    }
    out.push(
      primitives.plane({ name: "shanghai-fence-north", size: [36, 1, 3.8], material: fenceMat }).position(0, 1.9, -20.2).rotate(Math.PI / 2, 0, 0) as unknown as AuraNodeBuilder<AuraSceneNode>,
      instances.box({ name: "shanghai-river-rail", transforms: railPosts, castShadow: false, material: material.brushedMetal({ color: "#8ba0b8", roughness: 0.26 }) }) as AuraNodeBuilder<AuraSceneNode>,
      instances.box({ name: "shanghai-horizon-towers", transforms: towers, castShadow: false, material: material.physical({ color: "#121a2b", roughness: 0.28, metalness: 0.45 }) }) as AuraNodeBuilder<AuraSceneNode>,
      instances.box({ name: "shanghai-tower-crowns", transforms: neonBands, castShadow: false, material: material.emissive({ color: "#10283b", emissive: "#39d7ff", emissiveIntensity: 1.3 }) }) as AuraNodeBuilder<AuraSceneNode>
    );
    return out;
  }

  // Orbit Court: station deck perimeter stanchions + illuminated safety ring at r = 29.2 m
  const stanchions: { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 }[] = [];
  const trimBeacons: { position: AuraVec3; scale: AuraVec3 }[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const px = Math.sin(a) * 29.2;
    const pz = 4 + Math.cos(a) * 29.2;
    stanchions.push({ position: [px, 0.58, pz], rotation: [0, a, 0], scale: [0.18, 1.16, 0.28] });
    trimBeacons.push({ position: [px, 1.18, pz], scale: [0.22, 0.08, 0.22] });
  }
  out.push(
    instances.box({ name: "orbit-deck-stanchions", transforms: stanchions, castShadow: false, material: material.brushedMetal({ color: "#76859e", roughness: 0.28 }) }) as AuraNodeBuilder<AuraSceneNode>,
    instances.box({ name: "orbit-deck-beacons", transforms: trimBeacons, castShadow: false, material: material.emissive({ color: "#0b1c2c", emissive: "#7dfcff", emissiveIntensity: 1.5 }) }) as AuraNodeBuilder<AuraSceneNode>
  );
  return out;
}
