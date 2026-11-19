// Metres, with +Y up. The glTF joint axes are Y, Z, Z, Y, Z, Y.
// The vertical-tool solution holds forearm roll at zero and compensates base yaw at the flange.
export type Point = [number, number, number];
export const pickDefault: Point = [-.45, .095, .48];
export const dropDefault: Point = [.55, .095, .38];
export const home: Point = [.60, .46, .14];
const shoulder = .31, upper = .55, lower = .42 + .09, tool = .08 + .15;
const lift = .32;
export function above(p: Point): Point { return [p[0], p[1] + lift, p[2]]; }
export function mix(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
}
export function solve(p: Point) {
  const radius = Math.hypot(p[0], p[2]), height = p[1] + tool - shoulder;
  const cosElbow = (radius*radius + height*height - upper*upper - lower*lower)/(2*upper*lower);
  if (Math.abs(cosElbow) > 1 || radius < .25) return null;
  const elbow = Math.acos(cosElbow);
  const pitch = Math.atan2(radius,height) - Math.atan2(lower*Math.sin(elbow), upper + lower*Math.cos(elbow));
  const yaw = Math.atan2(-p[2], p[0]);
  return [yaw,-pitch,-elbow,0,-Math.PI + pitch + elbow,yaw];
}
export function forward([yaw,s,e,,w]: number[]): Point {
  const radial = -upper*Math.sin(s) - lower*Math.sin(s+e) - tool*Math.sin(s+e+w);
  return [Math.cos(yaw)*radial, shoulder+upper*Math.cos(s)+lower*Math.cos(s+e)+tool*Math.cos(s+e+w), -Math.sin(yaw)*radial];
}
export function recipe(pick: Point, drop: Point) {
  const up = above(pick), over = above(drop);
  return [
    {phase:'Approach', from:home, to:up, duration:1.45, grip:[0,0]},
    {phase:'Descend', from:up, to:pick, duration:.95, grip:[0,0]},
    {phase:'Grip', from:pick, to:pick, duration:.65, grip:[0,1]},
    {phase:'Lift', from:pick, to:up, duration:.85, grip:[1,1]},
    {phase:'Transfer', from:up, to:over, duration:1.85, grip:[1,1]},
    {phase:'Place', from:over, to:drop, duration:.85, grip:[1,1]},
    {phase:'Release', from:drop, to:drop, duration:.65, grip:[1,0]},
    {phase:'Retract', from:drop, to:over, duration:.85, grip:[0,0]},
    {phase:'Home', from:over, to:home, duration:1.35, grip:[0,0]}
  ];
}
// Reach outside the two-link outer sphere is worst at a segment endpoint.
// The nearest point along each horizontal projection checks the inner pedestal keep-out.
export function validate(pick: Point, drop: Point) {
  if (Math.hypot(pick[0]-drop[0],pick[2]-drop[2]) < .16) return 'Separate the station centers by at least 160 mm.';
  for (const {from,to} of recipe(pick,drop)) {
    const dx=to[0]-from[0], dz=to[2]-from[2], distance=dx*dx+dz*dz;
    const u=distance ? Math.min(1,Math.max(0,-(from[0]*dx+from[2]*dz)/distance)) : 0;
    if (![from,to,mix(from,to,u)].every(p=>solve(p))) return 'Path outside reach. Move the station closer or clear the pedestal.';
  }
  return '';
}
export function poseAt(seconds: number, pick: Point, drop: Point) {
  const plan = recipe(pick,drop);
  let i=0, time=Math.max(0,seconds);
  while (i<plan.length-1 && time>=plan[i].duration-1e-9) time-=plan[i++].duration;
  const step=plan[i], t=Math.max(0,Math.min(1,time/step.duration)), blend=t*t*(3-2*t);
  const target=mix(step.from,step.to,blend), grip=step.grip[0]+(step.grip[1]-step.grip[0])*blend;
  const attached=i>=3 && i<6, placed=i>=6;
  const joints=solve(target);
  if (!joints) throw new Error('Requested tool path is unreachable.');
  const tcp=forward(joints);
  return {phase:step.phase, grip, attached, placed, joints, tcp, partPosition:attached ? tcp : placed ? drop : pick};
}
export const duration=recipe(pickDefault,dropDefault).reduce((s,p)=>s+p.duration,0);
