// Runtime locomotion composition for the preview route. Uses the public @aura3d/animation
// locomotion kit (BlendTree1D + locomotion state graph) built from the typed character.
import { createLocomotionKit, type LocomotionKit } from "@aura3d/animation";
import { heroCharacter, type AnimationStudioCharacter } from "./character.js";

export function buildLocomotionKit(character: AnimationStudioCharacter = heroCharacter): LocomotionKit {
  return createLocomotionKit({
    idleClip: character.clipMap.idle,
    walkClip: character.clipMap.walk,
    runClip: character.clipMap.run,
    walkSpeed: character.walkSpeed,
    runSpeed: character.runSpeed
  });
}
