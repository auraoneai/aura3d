/* Shared, deterministic ball physics. Court units: x=5.018m, y=11.885m, z=2.177m. */
(function (root, factory) {
  const physics = factory();
  if (typeof module === 'object' && module.exports) module.exports = physics;
  else root.TennisPhysics = physics;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const GRAVITY = 9.81 / 2.177;
  const RADIUS = .0335 / 2.177;
  // Line calls follow the visible court and enlarged gameplay ball. Keep this
  // shared with the renderer: the physical ball radius still governs flight,
  // ground impact and net collision, whose scales are deliberately different.
  const COURT = Object.freeze({singlesX:.82,baselineY:1,serviceY:.52,
    renderX:5.5,renderY:8,lineWidth:.055,baselineWidth:.075,ballRadius:.072});
  const LINE_BOUNDS = Object.freeze({
    singlesX:COURT.singlesX+(COURT.lineWidth/2+COURT.ballRadius)/COURT.renderX,
    baselineY:COURT.baselineY+(COURT.baselineWidth/2+COURT.ballRadius)/COURT.renderY,
    serviceY:COURT.serviceY+(COURT.lineWidth/2+COURT.ballRadius)/COURT.renderY,
    centerX:(COURT.lineWidth/2+COURT.ballRadius)/COURT.renderX
  });
  const NET_HEIGHT = .914 / 2.177;
  const NET_POST = 1.07 / 2.177;
  const NET_X = 1.08;
  const DRAG = .09;
  const SERVE_MAX_RISE_METRES = .50;
  const HARD_COURT = Object.freeze({ rebound: .65, retention: .79 });
  const SURFACES = Object.freeze({
    hard: HARD_COURT,
    // Every destination has a regulation hard playing surface and Earth gravity.
    desert:HARD_COURT, beach:HARD_COURT, moon:HARD_COURT,
    grass: { rebound: .59, retention: .86 },
    clay: { rebound: .70, retention: .72 }
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const netHeight = x => NET_HEIGHT + (NET_POST - NET_HEIGHT) * Math.min(1, (x / NET_X) ** 2);
  const travelFactor = t => -Math.expm1(-DRAG * t) / DRAG;
  function sample(ball, t) {
    const factor = travelFactor(t);
    const decay = Math.exp(-DRAG * t);
    return { x: ball.x + ball.vx * factor, y: ball.y + ball.vy * factor,
      z: ball.z + ball.vz * t - GRAVITY * t * t / 2,
      vx: ball.vx * decay, vy: ball.vy * decay, vz: ball.vz - GRAVITY * t };
  }
  function timeToGround(ball) {
    return Math.max(0, (ball.vz + Math.sqrt(ball.vz ** 2 + 2 * GRAVITY * Math.max(0, ball.z - RADIUS))) / GRAVITY);
  }
  function timeToY(ball, y) {
    if (Math.abs(ball.vy) < 1e-9) return Infinity;
    const q = (y - ball.y) / ball.vy;
    return q >= 0 && q * DRAG < 1 ? -Math.log1p(-q * DRAG) / DRAG : Infinity;
  }
  function landing(ball) {
    const time = timeToGround(ball);
    return { ...sample(ball, time), z: RADIUS, time };
  }
  function speedKph(ball) {
    return Math.round(Math.hypot(ball.vx * 5.018, ball.vy * 11.885, ball.vz * 2.177) * 3.6);
  }
  function solveShot(ball, targetX, targetY, desiredTime, clearance = .065) {
    let time = Math.max(.28, desiredTime);
    let solution;
    for (let i = 0; i < 140; i++, time += .025) {
      solution = { ...ball, vx: (targetX - ball.x) / travelFactor(time),
        vy: (targetY - ball.y) / travelFactor(time),
        vz: (RADIUS - ball.z + GRAVITY * time * time / 2) / time };
      const crossingTime = timeToY(solution, 0);
      if (crossingTime >= time) return { ...solution, flightTime: time };
      const crossing = sample(solution, crossingTime);
      if (crossing.z - RADIUS >= netHeight(crossing.x) + clearance) return { ...solution, flightTime: time };
    }
    throw new Error('Unable to construct a playable trajectory');
  }
  function serveFlight(ball, targetX, targetY, time) {
    return {vx:(targetX-ball.x)/travelFactor(time),vy:(targetY-ball.y)/travelFactor(time),
      vz:(RADIUS-ball.z+GRAVITY*time*time/2)/time,flightTime:time};
  }
  function serveFlightLimit(ball) {
    return timeToGround({z:ball.z,vz:Math.sqrt(2*GRAVITY*SERVE_MAX_RISE_METRES/2.177)});
  }
  function serveClearance(ball, targetX, targetY, time) {
    const shot={...ball,...serveFlight(ball,targetX,targetY,time)},crossingTime=timeToY(shot,0);
    if(!Number.isFinite(crossingTime)||crossingTime>=time-1e-9)return -Infinity;
    const crossing=sample(shot,crossingTime);
    return (crossing.z-RADIUS-netHeight(crossing.x))*2.177;
  }
  // A cheap preview uses the same highest permitted arc as the launch solver.
  function serveTargetNetRisk(ball, targetX, targetY, clearanceMetres=.08) {
    return serveClearance(ball,targetX,targetY,serveFlightLimit(ball))<clearanceMetres;
  }
  // Serves ask for a measured launch speed. Find the fastest trajectory that
  // respects both that request and the net, without changing the selected point.
  // Unreachable points at the net remain visible net risks, never solver errors.
  function serveTrajectory(ball, targetX, targetY, requestedKph, clearanceMetres=.08, errorXMetres=0, errorYMetres=0) {
    const at = time => serveFlight(ball,targetX,targetY,time);
    const speed = shot => Math.hypot(shot.vx*5.018,shot.vy*11.885,shot.vz*2.177)*3.6;
    const maximumTime=serveFlightLimit(ball);
    let low=.08,high=Math.min(1.2,maximumTime);
    for(let i=0;i<36;i++){const t=(low+high)/2;if(speed(at(t))>requestedKph)low=t;else high=t;}
    const requestedTime=high;
    const clearance = time => serveClearance(ball,targetX,targetY,time);
    let time=requestedTime,netRisk=false;
    if(clearance(time)<clearanceMetres){
      // As a target approaches the net, settle on the bounded arc instead of
      // switching back to a fast net fault or constructing a very high lob.
      if(clearance(maximumTime)<clearanceMetres){time=maximumTime;netRisk=true;}
      else {
        low=time;high=maximumTime;
        for(let i=0;i<36;i++){const t=(low+high)/2;if(clearance(t)<clearanceMetres)low=t;else high=t;}
        time=high;
      }
    }
    const shot=at(time);
    // Timing changes the physical trajectory after selecting its safe base arc.
    // Keeping flight time makes dispersion monotonic, and does not rescue a
    // short error from the net or a long/wide error from the service lines.
    targetX+=errorXMetres/5.018;targetY+=errorYMetres/11.885;
    shot.vx=(targetX-ball.x)/travelFactor(time);shot.vy=(targetY-ball.y)/travelFactor(time);
    return {...shot,targetX,targetY,netRisk,paceLimited:speed(shot)<requestedKph-1};
  }
  function rebound(ball, surface) {
    const material = SURFACES[surface] || SURFACES.hard;
    const slice = ball.shotType === 'short';
    const topspin = ball.shotType === 'deep';
    ball.z = RADIUS;
    ball.vz = Math.abs(ball.vz) * material.rebound * (slice ? .72 : topspin ? 1.03 : 1);
    ball.vx *= material.retention * (slice ? .87 : 1);
    ball.vy *= material.retention * (slice ? .87 : 1);
    // PRO's clean touch loses more energy on the first bounce. The explicit
    // shot marker keeps every legacy trajectory exactly unchanged.
    if(slice&&ball.proDrop>0){
      const touch=clamp(ball.proDrop,0,1);
      ball.vz*=1-.44*touch;
      ball.vx*=1-.30*touch;ball.vy*=1-.30*touch;
    }
    ball.bounceCount++;
  }
  // Power amplifies imperfect contact toward the selected boundary. This is a
  // continuous placement error, not a random out roll: the resulting launch
  // still obeys the same gravity, drag, net events and line-inclusive bounce.
  function powerTarget(x,y,quality) {
    const strain=1-clamp(quality,0,1);
    const lateralRisk=(Math.abs(x)/.82)**4;
    const depthRisk=(Math.abs(y)/.90)**4;
    return {x:x+Math.sign(x)*(.012+.16*strain**1.5)*lateralRisk,
      y:y+Math.sign(y)*(.016+.20*strain**1.5)*depthRisk};
  }
  // A dead ball still has momentum; scoring and visible motion are separate.
  function releaseBall(ball) {
    ball.active = false;
    ball.dead = true;
    ball.settling = true;
    ball.rolling = false;
  }
  function deflectNet(ball) {
    const incoming = Math.sign(ball.vy) || (ball.y > 0 ? -1 : 1);
    ball.y = -incoming * .01;
    ball.vx *= .35;
    ball.vy = -incoming * Math.min(.45, Math.abs(ball.vy) * .16);
    ball.vz = Math.min(0, ball.vz * .25);
    ball.netTouched = true;
  }
  // Collision faces match the rear sponsor panels and padded wall in scene units.
  // Convert only at the boundary: the simulation uses different court scales.
  const REAR_BOARDS=[-1,1].map(side=>({x:side*5.2,y:-9.30,halfWidth:.75,height:.96,angle:-side*.16}));
  REAR_BOARDS.push({x:0,y:-10.80,halfWidth:7.2,height:.765,angle:0});
  function boardImpact(ball,timeFromFactor=q=>q>=0&&q*DRAG<1?-Math.log1p(-q*DRAG)/DRAG:Infinity){
    let hit={time:Infinity};
    for(const board of REAR_BOARDS){
      const nx=Math.sin(board.angle),ny=Math.cos(board.angle);
      const distance=(ball.x*5.5-board.x)*nx+(ball.y*8-board.y)*ny-.072;
      const velocity=ball.vx*5.5*nx+ball.vy*8*ny;
      if(distance< -1e-7||velocity>=-1e-9)continue;
      const q=Math.max(0,-distance/velocity),time=timeFromFactor(q);
      if(!Number.isFinite(time)||time>=hit.time)continue;
      const x=ball.x*5.5+ball.vx*5.5*q-board.x,y=ball.y*8+ball.vy*8*q-board.y;
      const z=ball.rolling?RADIUS:ball.z+ball.vz*time-GRAVITY*time*time/2;
      if(Math.abs(x*ny-y*nx)>board.halfWidth+.072||z*2.177<-.072||z*2.177>board.height+.072)continue;
      hit={time,nx,ny};
    }
    return hit;
  }
  function deflectBoard(ball,hit){
    let vx=ball.vx*5.5,vy=ball.vy*8;
    const normal=vx*hit.nx+vy*hit.ny;
    vx-=1.55*normal*hit.nx;vy-=1.55*normal*hit.ny;
    ball.vx=vx/5.5;ball.vy=vy/8;
    ball.x+=hit.nx*1e-6/5.5;ball.y+=hit.ny*1e-6/8;
  }
  function advanceLoose(ball, dt, surface, onBounce = () => {}) {
    let remaining = dt;
    const material = SURFACES[surface] || SURFACES.hard;
    while (ball.settling && remaining > 1e-9) {
      if (ball.rolling) {
        // Constant rolling resistance in metres, not differently scaled x/y
        // court units. Integrate the exact stopping time without jitter.
        const speed = Math.hypot(ball.vx * 5.018, ball.vy * 11.885);
        const resistance = surface === 'clay' ? 2.4 : surface === 'grass' ? 1.8 : 1.4;
        const distanceToNet = Math.abs(ball.vy) > 1e-9 ? -ball.y / ball.vy * speed : -1;
        const netTime = distanceToNet > 0 && distanceToNet <= speed * speed / (2 * resistance)
          ? (speed - Math.sqrt(Math.max(0, speed * speed - 2 * resistance * distanceToNet))) / resistance : Infinity;
        const board=boardImpact(ball,q=>q*speed<=speed*speed/(2*resistance)
          ?(speed-Math.sqrt(Math.max(0,speed*speed-2*resistance*q*speed)))/resistance:Infinity);
        const time = Math.min(remaining, speed / resistance, netTime,board.time);
        const distanceFactor = speed > 1e-9 ? time - resistance * time * time / (2 * speed) : 0;
        ball.x += ball.vx * distanceFactor;ball.y += ball.vy * distanceFactor;
        const fraction = speed > 1e-9 ? Math.max(0, 1 - resistance * time / speed) : 0;
        ball.vx *= fraction;ball.vy *= fraction;ball.z = RADIUS;ball.vz = 0;
        remaining -= time;
        if (fraction < 1e-9) { ball.vx = 0;ball.vy = 0;ball.settling = false; }
        if(board.time<=time+1e-9&&ball.settling){deflectBoard(ball,board);continue;}
        if (netTime <= time + 1e-9 && ball.settling) {
          if (Math.abs(ball.x) <= NET_X) deflectNet(ball);
          else ball.y = Math.sign(ball.vy) * 1e-8;
          continue;
        }
        return;
      }
      const ground = timeToGround(ball);
      const net = Math.abs(ball.y) > 1e-8 ? timeToY(ball, 0) : Infinity;
      const board=boardImpact(ball);
      const elapsed = Math.min(remaining, ground, net,board.time);
      Object.assign(ball, sample(ball, elapsed));remaining -= elapsed;
      if(board.time<=elapsed+1e-9){deflectBoard(ball,board);}
      else if (net <= ground + 1e-9 && net <= elapsed + 1e-9) {
        if (Math.abs(ball.x) <= NET_X && ball.z - RADIUS <= netHeight(ball.x)) deflectNet(ball);
        else ball.y = Math.sign(ball.vy) * 1e-8;
      } else if (ground <= elapsed + 1e-9) {
        const impact = Math.abs(ball.vz);
        ball.z = RADIUS;ball.vz = impact * material.rebound;
        ball.vx *= material.retention;ball.vy *= material.retention;
        if (impact > .35) onBounce(ball);
        if (ball.vz < .22) { ball.vz = 0;ball.rolling = true; }
      }
    }
  }
  // Resolve impacts at their exact time, then integrate the remainder of the frame.
  function advance(ball, dt, surface, onEvent) {
    let remaining = dt;
    for (let events = 0; ball.active && remaining > 1e-9 && events < 8; events++) {
      const ground = timeToGround(ball);
      const net = ball.crossedNet ? Infinity : timeToY(ball, 0);
      const board=boardImpact(ball);
      const elapsed = Math.min(remaining, ground, net,board.time);
      Object.assign(ball, sample(ball, elapsed));
      remaining -= elapsed;
      if(board.time<=elapsed+1e-9){deflectBoard(ball,board);onEvent('board',ball);}
      else if (net <= ground + 1e-9 && net <= elapsed + 1e-9) {
        ball.crossedNet = true;
        if (Math.abs(ball.x) <= NET_X + .007) {
          const clearance = ball.z - RADIUS - netHeight(ball.x);
          if (clearance < -.012) { onEvent('net', ball); }
          else if (clearance <= .012) {
            ball.netTouched = true;
            ball.vx *= .92;
            ball.vy *= .92;
            ball.vz = Math.max(.13, ball.vz * .75);
            onEvent('tape', ball);
          }
        }
      } else if (ground <= elapsed + 1e-9) {
        rebound(ball, surface);
        onEvent('bounce', ball);
      }
    }
    if (!ball.active && ball.settling && remaining > 1e-9) advanceLoose(ball, remaining, surface);
  }
  function inSingles(ball, side) {
    return Math.abs(ball.x) <= LINE_BOUNDS.singlesX &&
      (side === 'player' ? ball.y <= 0 && ball.y >= -LINE_BOUNDS.baselineY : ball.y >= 0 && ball.y <= LINE_BOUNDS.baselineY);
  }
  function inServiceBox(ball, side, serverX) {
    // There is no painted service-box boundary at the net. Retain the physical
    // crossing allowance there rather than extending it by a line width.
    const yTolerance = .0335 / 11.885;
    return Math.abs(ball.x) <= LINE_BOUNDS.singlesX && ball.x * Math.sign(serverX) <= LINE_BOUNDS.centerX &&
      (side === 'player' ? ball.y <= yTolerance && ball.y >= -LINE_BOUNDS.serviceY : ball.y >= -yTolerance && ball.y <= LINE_BOUNDS.serviceY);
  }
  return { GRAVITY, RADIUS, COURT, LINE_BOUNDS, NET_HEIGHT, NET_POST, NET_X, SERVE_MAX_RISE_METRES, SURFACES, netHeight, sample, timeToGround, timeToY, landing, speedKph, solveShot, serveTrajectory, serveTargetNetRisk, powerTarget, rebound, releaseBall, deflectNet, advanceLoose, advance, inSingles, inServiceBox, clamp };
});
