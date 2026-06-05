import { FighterStateMachine } from "./FighterStateMachine";
import { KinematicBody } from "./KinematicBody";
import type { AuraClashInputSnapshot } from "./InputController";
import type { AuraClashAnimationName } from "./types";

export interface AuraClashFighterRuntime {
  id: string;
  body: KinematicBody;
  state: FighterStateMachine;
  health: number;
  guard: number;
  meter: number;
  combo: number;
}

export function createFighterRuntime(id: string, x: number, facing: -1 | 1): AuraClashFighterRuntime {
  const body = new KinematicBody({
    id,
    position: { x, y: 0 },
    bounds: { minX: -3.2, maxX: 3.2 },
  });
  body.facing = facing;

  return {
    id,
    body,
    state: new FighterStateMachine(),
    health: 100,
    guard: 100,
    meter: 35,
    combo: 0,
  };
}

export function updateFighterRuntime(fighter: AuraClashFighterRuntime, input: AuraClashInputSnapshot, dt: number, atMs: number): AuraClashAnimationName {
  const animation = fighter.state.applyAction(input.action, atMs);
  fighter.body.move(
    {
      axisX: input.axisX,
      jump: input.jump,
      crouch: input.crouch,
      dash: input.dash,
    },
    dt,
  );
  return animation;
}
