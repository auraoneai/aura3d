// apps/showcase-blockfall-reactor/src/v2/scene/world.ts — one union scene.
// Everything mounts once at boot: the typed cabinet (the certified companion
// framing the live well), the authored arena backdrop, the arcade-room set
// dressing, the board shell + scoreboard + beat nodes + clear-fx shards from
// the keep modules, the two instanced board pools (the only tile layer — the
// per-cell node massacre from §6.9.16 stays deleted), the ghost cells, the
// drop guide, the active focus reticle, and the reactor meter. Scene swaps
// are impossible because there is exactly one scene; runtime nodes re-pose
// and re-hide per frame instead (§7.2.1 loading.sceneSwaps === 0).
import { game as engineGame, geometry, model, primitives } from "@aura3d/engine";
import type { AuraNodeInput } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import {
  createArcadeRoomNodes,
  createBeatNodes,
  createBoardShell,
  createClearFlashNodes,
  createGhostNodes,
  createReactorNodes,
  createLockedStackPools,
  createActivePiecePool,
  type InstancedBoardPool
} from "../../gameplay/reactor-scene";
import {
  buildWallWord,
  createScoreboardNodes,
  LOCKED_POOL_CAPACITY_PER_KIND
} from "../../gameplay/board-view";
import { createClearFxNodes, clearFxShardNodeId, CLEAR_FX_SHARD_COUNT } from "../../legacy/clear-fx";
import { LIVE_PLATE, LIVE_PLATE_ACCENT, ROOM_BG } from "./materials";

export interface BlockfallWorldNodes {
  readonly nodes: readonly AuraNodeInput[];
  readonly lockedPools: readonly InstancedBoardPool[];
  readonly activePool: InstancedBoardPool;
  readonly shardNodeIds: readonly string[];
}

const cabinetLiveWord = buildWallWord("LIVE", 0.32);

function cabinetLiveMarqueeNodes(): AuraNodeInput[] {
  // Thin physical fascia over the catalog cabinet's baked "GAME OVER /
  // RESTART?" marquee: the body, screen, controls, and vents stay visible.
  return [
    primitives.box({ name: "cabinet live-session marquee plate", material: LIVE_PLATE, castShadow: false, receiveShadow: false })
      .position(-2.8, 3.2, -0.98)
      .scale([1.72, 1.56, 0.035]),
    primitives.box({ name: "cabinet live-session marquee accent", material: LIVE_PLATE_ACCENT, castShadow: false, receiveShadow: false })
      .position(-2.8, 3.7, -0.935)
      .scale([1.18, 0.032, 0.018]),
    geometry.custom(
      { kind: "aura-custom-geometry", positions: cabinetLiveWord.positions, indices: cabinetLiveWord.indices },
      { name: "cabinet live-session marquee word", material: LIVE_PLATE_ACCENT }
    ).position(-2.8 - cabinetLiveWord.width / 2, 3.46, -0.96)
  ];
}

export function blockfallWorldNodes(): BlockfallWorldNodes {
  const lockedPools = createLockedStackPools(LOCKED_POOL_CAPACITY_PER_KIND);
  const activePool = createActivePiecePool();
  const clearFxNodes = createClearFxNodes();
  const nodes: AuraNodeInput[] = [
    model(assets.blockfallReactorArenaBackdrop, {
      name: "blockfall-reactor-arena-backdrop",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 9.4
    })
      .position(0, 1.82, -3.52)
      .runtime(engineGame.runtimeNode("blockfall-reactor-arena-backdrop", {
        tags: ["typed-supporting-asset", "review-background", "release-probed", "non-gameplay-set-dressing"]
      })),
    model(assets.showcaseBlockfallCabinet, {
      name: "blockfall-reactor-cabinet",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 4.2
    })
      .position(-2.8, 0.42, -2.15)
      .rotate(0, -Math.PI / 2, 0)
      .runtime(engineGame.runtimeNode("blockfall-reactor-cabinet", {
        tags: ["typed-primary-asset", "arcade-cabinet", "release-probed"]
      })),
    ...cabinetLiveMarqueeNodes(),
    ...createArcadeRoomNodes(),
    ...createBoardShell(false),
    ...createGhostNodes(),
    ...createBeatNodes(),
    ...createReactorNodes(),
    ...createScoreboardNodes(false),
    ...clearFxNodes,
    ...createClearFlashNodes(),
    ...lockedPools.map((pool) => pool.node),
    activePool.node
  ];
  return {
    nodes,
    lockedPools,
    activePool,
    shardNodeIds: Array.from({ length: CLEAR_FX_SHARD_COUNT }, (_, index) => clearFxShardNodeId(index))
  };
}

export { ROOM_BG };
