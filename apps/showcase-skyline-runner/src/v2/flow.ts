// Act flow: visibility, respawn, platformer event dispatch — extracted from
// boot.ts for 14-LOC. `ctx` holds the mutable act/collected state.
import type { GamePlatformerSnapshot } from "@aura3d/engine";
import { GAMEPLAY_ACTOR_DEPTH, collectibles, platformerScene } from "./scene/binding";
import type { skylineWorldNodes } from "./scene/world";
import type { createSkylineFeel } from "../legacy/feel";
import type { createSkylineAudio } from "../legacy/skyline-audio";
import type { wireSkylineFx } from "./scene/fx";
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { createSkylineCharacterWorld } from "../legacy/character-world";

export interface SkylineFlowCtx {
  currentAct: number;
  collectedSet: Set<string>;
}

export function createSkylineFlowCtx(initial: { act: number; collected: Iterable<string> }): SkylineFlowCtx {
  return { currentAct: initial.act, collectedSet: new Set<string>(initial.collected) };
}

export function wireSkylineFlow(ctx: SkylineFlowCtx, deps: {
  world: ReturnType<typeof skylineWorldNodes>;
  handle(id: string): AuraRuntimeNodeHandle | null;
  platformerState: { reset(checkpointId: string): GamePlatformerSnapshot };
  getState(): GamePlatformerSnapshot;
  setState(next: GamePlatformerSnapshot): void;
  characterWorld: ReturnType<typeof createSkylineCharacterWorld>;
  solverReset(x: number, y: number): void;
  scene: typeof platformerScene;
  collectibles: typeof collectibles;
  feel: ReturnType<typeof createSkylineFeel>;
  fx: ReturnType<typeof wireSkylineFx>;
  audio: ReturnType<typeof createSkylineAudio>;
}) {
  const { world, handle, platformerState, characterWorld, scene, feel, fx, audio } = deps;

  function applyActVisibility(actIndex: number) {
    for (const [act, ids] of Object.entries(world.actNodeIds) as [string, readonly string[]][]) {
      const visible = Number(act) === actIndex;
      for (const id of ids) handle(id)?.setVisible(visible);
    }
  }

  function respawnAt(checkpointId: string) {
    const next = platformerState.reset(checkpointId);
    deps.setState(next);
    characterWorld.place({ x: next.player.x, y: next.player.y }, next.time);
    deps.solverReset(next.player.x, next.player.y);
    ctx.collectedSet.clear();
    for (const id of next.collected) ctx.collectedSet.add(id);
  }

  function observeEvents(prev: GamePlatformerSnapshot, next: GamePlatformerSnapshot) {
    for (const event of next.events) {
      const [ex, ey] = scene.toScenePoint({ x: event.x, y: event.y });
      const point: readonly [number, number, number] = [ex, ey, GAMEPLAY_ACTOR_DEPTH];
      switch (event.type) {
        case "jump":
          feel.onJump(point);
          fx.jumpKick(point);
          void audio.cue("jump");
          break;
        case "land":
          feel.onLand(point);
          fx.landingPuff(point);
          void audio.cue("land-dust");
          break;
        case "dash":
          feel.onDash(point);
          fx.dashStreak(point);
          void audio.cue("dash");
          break;
        case "collect": {
          const collectible = deps.collectibles.find((item: (typeof collectibles)[number]) => item.id === event.id);
          const [sx, sy] = collectible
            ? scene.toScenePoint({ x: collectible.x, y: collectible.y })
            : [ex, ey];
          const cpoint: readonly [number, number, number] = [sx, sy, GAMEPLAY_ACTOR_DEPTH];
          ctx.collectedSet.add(String(event.id));
          if (String(event.id).includes("ember-charge")) {
            feel.onEmberPickup(cpoint);
            void audio.cue("ember-pickup");
          } else {
            feel.onCollect(cpoint);
            fx.pickupSparkle(cpoint);
            void audio.cue("coin-chime");
          }
          break;
        }
        case "checkpoint":
          feel.onCheckpoint("", point);
          fx.checkpointChime(point);
          void audio.cue("checkpoint");
          break;
        case "hazard":
        case "fall": {
          const visible = scene.toScenePlayer(next.player).position;
          feel.onHazard(visible);
          fx.hazardHit(visible);
          void audio.cue("death");
          break;
        }
        case "respawn":
          feel.onRespawn(point);
          fx.respawnBlink(point);
          void audio.cue("respawn");
          break;
        case "defeat":
        case "stomp":
          feel.onSentryDefeat(point, event.type === "stomp" ? 100 : 150);
          void audio.cue("sentry-defeat");
          break;
        case "complete":
          feel.onSummit(point);
          fx.summitFlare(point);
          void audio.cue("summit");
          break;
        case "reset":
          break;
      }
    }
  }

  return { applyActVisibility, respawnAt, observeEvents };
}
