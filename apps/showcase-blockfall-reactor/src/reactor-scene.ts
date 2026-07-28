import {
  game,
  material,
  primitives,
  type AuraMaterialSpec,
  type AuraNodeInput
} from "@aura3d/engine";
import {
  BOARD_WIDTH,
  VISIBLE_HEIGHT,
  type PieceKind
} from "./rules";

export const CELL = 0.208;
export const BLOCK_SCALE = [0.138, 0.138, 0.12] as const;
export const HIDDEN_BLOCK_SCALE = [0.001, 0.001, 0.001] as const;
export const ACTIVE_BLOCK_SCALE = [0.158, 0.158, 0.13] as const;
export const GHOST_BLOCK_SCALE = [0.112, 0.112, 0.035] as const;
export const CLEAR_FLASH_SCALE = [1.03, 0.036, 0.016] as const;
export const BOARD_CENTER_Y = 2.24;
const BOARD_LEFT_X = -((BOARD_WIDTH - 1) * CELL) / 2;
const BOARD_BOTTOM_Y = BOARD_CENTER_Y - ((VISIBLE_HEIGHT - 1) * CELL) / 2;

export const pieceMaterials: Record<PieceKind, AuraMaterialSpec> = {
  I: material.neon({ name: "ion cyan tetromino", color: "#1fc7d4", emissive: "#39f6ff", emissiveIntensity: 0.9, roughness: 0.24 }),
  J: material.neon({ name: "cobalt J tetromino", color: "#3558ff", emissive: "#5c7dff", emissiveIntensity: 0.62, roughness: 0.28 }),
  L: material.neon({ name: "amber L tetromino", color: "#f49a2d", emissive: "#ffc04f", emissiveIntensity: 0.68, roughness: 0.32 }),
  O: material.neon({ name: "solar O tetromino", color: "#f2d94e", emissive: "#ffe866", emissiveIntensity: 0.7, roughness: 0.3 }),
  S: material.neon({ name: "reactor green S tetromino", color: "#42d96b", emissive: "#65ff88", emissiveIntensity: 0.72, roughness: 0.3 }),
  T: material.neon({ name: "magenta T tetromino", color: "#c858e9", emissive: "#e279ff", emissiveIntensity: 0.72, roughness: 0.25 }),
  Z: material.neon({ name: "warning red Z tetromino", color: "#ef4f5d", emissive: "#ff6c78", emissiveIntensity: 0.7, roughness: 0.3 })
};

const panelMaterial = material.emissive({ name: "readable graphite board backplate", color: "#17312e", emissive: "#255651", emissiveIntensity: 0.48, roughness: 0.68 });
const railMaterial = material.metal({ name: "brushed safety rail", color: "#a9b49d", roughness: 0.36, metallic: 0.62 });
const gridMaterial = material.emissive({ name: "readable board grid", color: "#5f7770", emissive: "#8fb5a9", emissiveIntensity: 0.22, roughness: 0.72 });
const ghostMaterial = material.glass({ name: "transparent ghost landing piece", color: "#dbe7d9", opacity: 0.26, transmission: 0.45, roughness: 0.12 });
const flashMaterial = material.emissive({ name: "line clear flash", color: "#fff4b8", emissive: "#fff4b8", emissiveIntensity: 1.8 });
const reactorMaterial = material.neon({ name: "reactor charge column", color: "#6dee8d", emissive: "#77ff96", emissiveIntensity: 1.1, roughness: 0.18 });
const reactorCapMaterial = material.neon({ name: "reactor critical cap", color: "#ffb35a", emissive: "#ffd05d", emissiveIntensity: 0.9, roughness: 0.2 });

export function createBoardShell(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    primitives.box({ name: "blockfall neutral evidence backdrop", material: material.emissive({ color: "#040608", emissive: "#040608", emissiveIntensity: 1 }) }).position(0, 2.18, -1.32).scale([12, 8, 0.025]),
    primitives.box({ name: "reactor board backplate", material: panelMaterial, receiveShadow: true }).position(0, BOARD_CENTER_Y, -0.035).scale([1.64, 4.42, 0.06]),
    primitives.box({ name: "arcade reactor recessed cabinet wall", material: material.emissive({ color: "#101712", emissive: "#286046", emissiveIntensity: 0.18 }) }).position(0, BOARD_CENTER_Y, -0.92).scale([2.05, 4.3, 0.03]),
    primitives.torus({ name: "arcade reactor playfield halo", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.16, opacity: 0.12 }) }).position(0, BOARD_CENTER_Y - 2.02, -0.04).rotate(1.5708, 0, 0).scale([0.78, 0.15, 0.018]),
    primitives.box({ name: "blockfall reactor marquee beam", material: material.neon({ color: "#ffe866", emissive: "#ffe866", emissiveIntensity: 0.72 }) }).position(0, BOARD_CENTER_Y + 2.08, 0.11).scale([1.46, 0.045, 0.045]),
    primitives.box({ name: "blockfall lower cabinet glow shelf", material: material.neon({ color: "#74ff91", emissive: "#74ff91", emissiveIntensity: 0.54 }) }).position(0, BOARD_CENTER_Y - 2.08, 0.11).scale([1.46, 0.04, 0.045]),
    primitives.box({ name: "left load-bearing board rail", material: railMaterial, castShadow: true }).position(-1.24, BOARD_CENTER_Y, 0.08).scale([0.05, 4.22, 0.11]),
    primitives.box({ name: "right load-bearing board rail", material: railMaterial, castShadow: true }).position(1.24, BOARD_CENTER_Y, 0.08).scale([0.05, 4.22, 0.11]),
    primitives.box({ name: "top board rail", material: railMaterial, castShadow: true }).position(0, BOARD_CENTER_Y + 2.13, 0.08).scale([1.48, 0.052, 0.11]),
    primitives.box({ name: "bottom board rail", material: railMaterial, castShadow: true }).position(0, BOARD_CENTER_Y - 2.13, 0.08).scale([1.48, 0.052, 0.11]),
    primitives.box({ name: "reactor cabinet floor", material: material.emissive({ color: "#05080a", emissive: "#05080a", emissiveIntensity: 0.8 }), receiveShadow: true }).position(0, -0.12, -0.32).scale([3.35, 0.045, 0.95]),
    primitives.box({ name: "left cyan arcade light column", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.6 }) }).position(-1.08, BOARD_CENTER_Y, 0.04).scale([0.018, 2.06, 0.022]),
    primitives.box({ name: "right magenta arcade light column", material: material.neon({ color: "#e279ff", emissive: "#e279ff", emissiveIntensity: 0.56 }) }).position(1.08, BOARD_CENTER_Y, 0.04).scale([0.018, 2.06, 0.022])
  ];
  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    const px = BOARD_LEFT_X - CELL / 2 + x * CELL;
    nodes.push(primitives.box({ name: `board vertical grid ${x}`, material: gridMaterial }).position(px, BOARD_CENTER_Y, 0.03).scale([0.008, VISIBLE_HEIGHT * CELL, 0.016]));
  }
  for (let y = 0; y <= VISIBLE_HEIGHT; y += 1) {
    const py = BOARD_BOTTOM_Y - CELL / 2 + y * CELL;
    nodes.push(primitives.box({ name: `board horizontal grid ${y}`, material: gridMaterial }).position(0, py, 0.03).scale([1.08, 0.008, 0.016]));
  }
  return nodes;
}

export function createLockedBlockNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (let y = 0; y < VISIBLE_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const position = cellPosition(x, y, 0.18);
      nodes.push(primitives.box({ name: `locked block cell ${x} ${y}`, material: pieceMaterials.I, castShadow: true, receiveShadow: true })
        .position(position[0], position[1], position[2])
        .scale(HIDDEN_BLOCK_SCALE)
        .runtime(game.runtimeNode(lockedNodeId(x, y), { tags: ["blockfall", "locked", "piece-material-runtime"] })));
    }
  }
  return nodes;
}

export function createActiveBlockNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    primitives.box({ name: `active block ${index}`, material: pieceMaterials.T, castShadow: true, receiveShadow: true })
      .position(0, 0, 0.28)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(activeNodeId(index), { tags: ["blockfall", "active", "piece-material-runtime"] }))
  );
}

export function createGhostNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    primitives.box({ name: `ghost landing block ${index}`, material: ghostMaterial })
      .position(0, 0, 0)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(ghostNodeId(index), { tags: ["blockfall", "ghost"] }))
  );
}

export function createClearFlashNodes(): AuraNodeInput[] {
  return Array.from({ length: VISIBLE_HEIGHT }, (_, row) => {
    const position = cellPosition(Math.floor(BOARD_WIDTH / 2), row, 0.18);
    return primitives.box({ name: `line clear flash row ${row}`, material: flashMaterial })
      .position(0, position[1], position[2])
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(clearFlashNodeId(row), { tags: ["blockfall", "line-clear-flash"] }));
  });
}

export function createReactorNodes(): AuraNodeInput[] {
  return [
    primitives.cylinder({ name: "reactor charge glass tube", material: material.glass({ color: "#e7f7e7", opacity: 0.34, transmission: 0.55, roughness: 0.08 }) }).position(1.52, 2, 0.16).scale([0.095, 0.68, 0.095]),
    primitives.cylinder({ name: "reactor fill", material: reactorMaterial }).position(1.52, 1.42, 0.2).scale([0.08, 0.18, 0.08]).runtime(game.runtimeNode("blockfall-reactor-fill", { tags: ["blockfall", "reactor", "meter"] })),
    primitives.sphere({ name: "reactor cap", material: reactorCapMaterial }).position(1.52, 3.1, 0.2).scale(HIDDEN_BLOCK_SCALE).runtime(game.runtimeNode("blockfall-reactor-cap", { tags: ["blockfall", "reactor", "critical"] })),
    primitives.box({ name: "left hold dock glow", material: material.emissive({ color: "#8b7a55", emissive: "#d3a23c", emissiveIntensity: 0.22 }) }).position(-1.45, 3.2, 0.02).scale([0.13, 0.025, 0.018]),
    primitives.box({ name: "right queue dock glow", material: material.emissive({ color: "#55725a", emissive: "#69dd83", emissiveIntensity: 0.2 }) }).position(1.45, 1.04, 0.02).scale([0.13, 0.025, 0.018])
  ];
}

export function cellPosition(x: number, visibleY: number, z: number): readonly [number, number, number] {
  return [BOARD_LEFT_X + x * CELL, BOARD_BOTTOM_Y + (VISIBLE_HEIGHT - 1 - visibleY) * CELL, z];
}

export function lockedNodeId(x: number, y: number): string {
  return `blockfall-locked-${x}-${y}`;
}

export function activeNodeId(index: number): string {
  return `blockfall-active-${index}`;
}

export function ghostNodeId(index: number): string {
  return `blockfall-ghost-${index}`;
}

export function clearFlashNodeId(row: number): string {
  return `blockfall-clear-flash-${row}`;
}

export function lockedNodeKey(x: number, y: number): string {
  return `${x}:${y}`;
}
