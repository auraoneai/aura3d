// Floor runtime construction + transitions — extracted from boot.ts for 14-LOC.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  FLOOR_LAYOUTS, createFloorWorld, layoutCircles, layoutRects
} from "../gameplay/floor";
import { GuardAgent } from "../gameplay/guard";
import { ThiefPlayer } from "../gameplay/thief";
import type { HeistAudioCue } from "../legacy/heist-audio";
import type { wireGalleryFx } from "./scene/fx";
import { exhibitNodeId, pedestalNodeId, type galleryWorldNodes } from "./scene/world";
import type { Game } from "@aura3d/game";
import type { FloorRuntime, GalleryCtx } from "./state";
import type { Vec2 } from "../gameplay/floor";

type NodeHandle = AuraRuntimeNodeHandle | null;

export function buildFloorRuntime(index: number): FloorRuntime {
  const layout = FLOOR_LAYOUTS[index] ?? FLOOR_LAYOUTS[0]!;
  const floorWorld = createFloorWorld(layout);
  const thief = new ThiefPlayer(layout, layoutRects(layout), layoutCircles(layout), floorWorld.thiefBody, layout.thiefSpawn);
  const guards = layout.guards.map((spawn) => new GuardAgent(spawn));
  return {
    layout,
    world: floorWorld,
    thief,
    guards,
    liftedIds: [],
    detection: { value: 0, secondsSinceSeen: 0 },
    ghostRun: true,
    timeInFloor: 0,
    laserAlertRemaining: 0,
    laserAlertPoint: null,
    floorScore: 0,
    lastSeen: null
  };
}
export function wireGalleryFloors(ctx: GalleryCtx, deps: {
  game: Game;
  handle(id: string): NodeHandle;
  pushCue(cue: HeistAudioCue): void;
  fx: ReturnType<typeof wireGalleryFx>;
  world: ReturnType<typeof galleryWorldNodes>;
  thiefHandle(): NodeHandle;
  guardHandle(id: string): NodeHandle;
  syncCharacterVisuals: () => void;
}) {
  const { game, handle, pushCue, fx, world, thiefHandle, guardHandle, syncCharacterVisuals } = deps;
  
  ctx.runtime = buildFloorRuntime(0);
  
  function setBucketVisible(ids: readonly string[], visible: boolean): void {
    for (const id of ids) handle(id)?.setVisible(visible);
  }
  
  function syncFloorVisuals(): void {
    const layout = ctx.runtime.layout;
    setBucketVisible(world.floor1NodeIds, layout.id === 1);
    setBucketVisible(world.floor2NodeIds, layout.id === 2);
    layout.pedestals.forEach((pedestal, slot) => {
      handle(pedestalNodeId(slot))?.setPosition(pedestal.x, 0, pedestal.z);
      for (const variant of ["A", "B", "C"] as const) {
        const node = handle(exhibitNodeId(slot, variant));
        if (!node) continue;
        const matches = variant === pedestal.exhibit.slice(-1).toUpperCase() && !ctx.runtime.liftedIds.includes(pedestal.id);
        node.setVisible(matches);
        node.setPosition(pedestal.x, 1.08, pedestal.z);
      }
    });
    thiefHandle()?.setPosition(layout.thiefSpawn.x, 0, layout.thiefSpawn.z);
    for (const guard of layout.guards) {
      guardHandle(guard.id)?.setPosition(guard.x, 0, guard.z);
    }
    syncCharacterVisuals();
    syncAlarmVisuals();
  }
  
  function syncAlarmVisuals(): void {
    handle("alarm-beacon")?.setVisible(ctx.alarmActive);
  }
  
  function restartFloor(): void {
    ctx.runtime = buildFloorRuntime(ctx.floorIndex);
    ctx.alarmActive = false;
    ctx.alarmGraceRemaining = 0;
    ctx.lastCameraSamples = [];
    ctx.phase = "playing";
    syncFloorVisuals();
    pushCue("floor-clear");
  }
  
  function resetMission(): void {
    ctx.floorIndex = 0;
    ctx.completedBeforeFloor = 0;
    ctx.totalScore = 0;
    ctx.alarmActive = false;
    ctx.alarmGraceRemaining = 0;
    ctx.runtime = buildFloorRuntime(0);
    ctx.lastCameraSamples = [];
    ctx.phase = "playing";
    ctx.paused = false;
    syncFloorVisuals();
  }
  
  function floorClearAdvance(): void {
    const cleared = ctx.runtime;
    const timeBonus = Math.max(0, Math.round(1500 - 6 * cleared.timeInFloor));
    const ghostBonus = cleared.ghostRun ? 1500 : 0;
    ctx.totalScore += cleared.floorScore + timeBonus + ghostBonus;
    if (ctx.floorIndex >= FLOOR_LAYOUTS.length - 1) {
      ctx.phase = "won";
      pushCue("exit-win");
      fx.floorClear([layoutExit().x, 0.4, layoutExit().z]);
    } else {
      pushCue("floor-clear");
      ctx.completedBeforeFloor += cleared.liftedIds.length;
      ctx.floorIndex += 1;
      ctx.runtime = buildFloorRuntime(ctx.floorIndex);
      ctx.lastCameraSamples = [];
      ctx.phase = "playing";
      syncFloorVisuals();
    }
  }
  
  function layoutExit(): Vec2 {
    return ctx.runtime.layout.exit;
  }

  return { setBucketVisible, syncFloorVisuals, syncAlarmVisuals,
           restartFloor, resetMission, floorClearAdvance, layoutExit };
}
