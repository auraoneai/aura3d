// Per-frame node + HUD + feel presentation sync — extracted from boot.ts for
// 14-LOC. lastHudKey lives in the closure as before.
import type { AuraRuntimeNodeHandle, GamePlatformerSnapshot } from "@aura3d/engine";
import { platformerScene, GAMEPLAY_ACTOR_DEPTH } from "./scene/binding";
import { HERO_NODE_ID, LIFT_CARD_NODE_IDS } from "./scene/world";
import { skylineLiftOffset, type SkylineLiftSpec } from "../legacy/character-world";
import { SKYLINE_MOVING_PLATFORMS } from "../gameplay/level";

export const SKYLINE_LIFT_SPECS: readonly SkylineLiftSpec[] = SKYLINE_MOVING_PLATFORMS.map(
  (platform): SkylineLiftSpec => ({
    id: platform.id,
    x: platform.x,
    y: platform.y,
    width: platform.width,
    height: platform.height,
    axis: platform.axis,
    amplitude: platform.amplitude,
    periodSeconds: platform.period,
    phase: platform.phase ?? 0
  })
);
import type { createSkylineFeel } from "../legacy/feel";
import type { Prd09Game } from "@aura3d/game";

export function wireSkylineSync(deps: {
  handle(id: string): AuraRuntimeNodeHandle | null;
  game: Prd09Game<string, string>;
  feel: ReturnType<typeof createSkylineFeel>;
  input: { held(action: string): boolean };
  getState(): GamePlatformerSnapshot;
  getPlayerFacing(): number;
  getCurrentAct(): number;
  getCollectedSize(): number;
  getChallengeFlow(): number;
  getRunEnded(): boolean;
  getEmberStock(): number;
}) {
  const { handle, game, feel, input } = deps;

  function syncHero() {
    const hero = handle(HERO_NODE_ID);
    if (!hero) return;
    const pose = platformerScene.toScenePlayer(deps.getState().player);
    hero.setPosition(pose.position[0], pose.position[1], pose.position[2]);
    hero.setRotation(0, deps.getPlayerFacing() < 0 ? Math.PI : 0, 0);
  }

  function syncLiftCards() {
    const state = deps.getState();
    SKYLINE_LIFT_SPECS.forEach((lift, index) => {
      const liftNode = handle(LIFT_CARD_NODE_IDS[index]!);
      if (!liftNode) return;
      const offset = skylineLiftOffset(lift, state.time);
      const rect = platformerScene.surfaceToSceneRect({
        id: lift.id,
        x: lift.x + (lift.axis === "x" ? offset : 0),
        y: lift.y + (lift.axis === "y" ? offset : 0),
        width: lift.width,
        height: lift.height
      });
      liftNode.setPosition(rect.center[0], rect.center[1], GAMEPLAY_ACTOR_DEPTH - 0.08);
    });
  }

  let lastHudKey = "";
  function syncHud() {
    const state = deps.getState();
    const currentAct = deps.getCurrentAct();
    const actTitle = `Act ${currentAct + 1}`;
    const key = JSON.stringify([currentAct, state.score, state.lives, deps.getCollectedSize(), deps.getChallengeFlow(), deps.getRunEnded(), game.session.paused]);
    if (key === lastHudKey) return;
    lastHudKey = key;
    game.hud.set("act", actTitle);
    game.hud.set("score", String(state.score).padStart(6, "0"));
    game.hud.set("lives", String(Math.max(0, state.lives)));
    game.hud.set("shards", String(deps.getCollectedSize()));
    game.hud.set("flow", `${Math.round(deps.getChallengeFlow() * 100)}%`);
    game.hud.set("state", deps.getRunEnded() ? "RUN ENDED" : game.session.paused ? "PAUSED" : "");
  }

  function syncFeelPresentation(dt: number) {
    const state = deps.getState();
    feel.updatePresentation(dt, {
      simTime: state.time,
      playerX: state.player.x,
      playerY: state.player.y,
      playerFacing: deps.getPlayerFacing(),
      sceneBinding: platformerScene,
      defeatedHazardIds: state.defeatedHazards,
      sentryNodes: {},
      sentryAccentNodes: {},
      emberVolleys: [],
      emberVolleyNodes: [],
      firePressed: input.held("fire"),
      emberStock: deps.getEmberStock(),
      scoreElement: null
    });
  }

  return { syncHero, syncLiftCards, syncHud, syncFeelPresentation };
}
