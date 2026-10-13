// Travel facing for the side-scrolling hero. The kit reports `facing` as the
// sign of travel along +x; the rendered rig must yaw to face that travel
// direction in the play plane — never toward the camera (yaw 0). Same
// convention as the mini-game template and AuraClash's fighter yaw: a model
// whose forward is +z faces +x at yaw +PI/2 and -x at yaw -PI/2.
export function playerYawForFacing(facing: 1 | -1): number {
  return facing * (Math.PI / 2);
}
