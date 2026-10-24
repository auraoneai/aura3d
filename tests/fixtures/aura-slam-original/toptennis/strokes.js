/* Original stroke selection and pace profiles; normalized court coordinates. */
(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory(require('./physics.js'));
  else root.TennisStrokes=factory(root.TennisPhysics);
})(typeof window==='undefined'?globalThis:window,function(physics){
  const SMASH_MIN=.82,SMASH_MAX=1.12; // Approximately 1.79–2.44 m: head to extended racket.
  function select(actor,ball){
    const face=actor.side==='player'?1:-1;
    const localX=(ball.x-actor.x)*face,localY=(ball.y-actor.y)*face;
    const racketSide=Math.abs(localX)>.018?Math.sign(localX):(actor.racketSide||1);
    const hand=racketSide<0?'backhand':'forehand';
    // An overhead needs the ball above/in front of the shoulder, not far to
    // the side or behind the body. Near the net alone never implies a smash.
    const overhead=!ball.highDeepLob && ball.z>=SMASH_MIN && Math.abs(localX)<=.14 && localY>=-.18 && localY<=.10;
    const volley=ball.bounceCount===0 && !ball.isServe;
    const kind=overhead?'smash':volley?`${hand}-volley`:hand;
    return {kind,racketSide,reachable:ball.z>=physics.RADIUS && ball.z<=(overhead?SMASH_MAX:SMASH_MIN),
      reachScale:overhead?.78:1};
  }
  function prepare(actor,ball,delay,surface){
    const predicted={...ball};
    if(predicted.active)physics.advance(predicted,delay,surface,()=>{});
    return {...select(actor,predicted),height:predicted.z};
  }
  function proAttackOpportunity(actor,ball,kind,shotType,spatialQuality){
    if((kind!=='forehand' && kind!=='backhand') || ball.bounceCount!==1 ||
      ball.isServe || ball.shotType==='serve' || (shotType!=='neutral' && shotType!=='deep'))return 0;
    const face=actor.side==='player'?1:-1;
    // A floating return is an opportunity only at contact: inside the court,
    // above net height, in front, comfortably reached and prepared on time.
    // Horizontal arrival speed excludes the gravity of a descending high ball.
    const speed=Math.hypot(ball.vx*5.018,ball.vy*11.885);
    const slow=physics.clamp((18-speed)/8,0,1);
    const forward=physics.clamp((.80-Math.max(Math.abs(actor.y),Math.abs(ball.y)))/.25,0,1);
    const high=physics.clamp((ball.z-physics.NET_HEIGHT-.06)/.16,0,1);
    const comfortable=physics.clamp((spatialQuality-.45)/.25,0,1);
    const inFront=physics.clamp((.055-(ball.y-actor.y)*face)/.055,0,1);
    const onTime=physics.clamp((.24-actor.swingAge)/.04,0,1);
    const balanced=physics.clamp((1-Math.hypot(actor.vx,actor.vy))/.5,0,1);
    return slow*forward*high*comfortable*inFront*onTime*balanced;
  }
  function flightTime(kind,ball,targetX,targetY,groundTime,quality,shotType='neutral',proAttack=0){
    const meters=Math.hypot((targetX-ball.x)*5.018,(targetY-ball.y)*11.885);
    if(kind==='smash')return physics.clamp(meters/(25+9*quality),.30,1.05);
    if(kind.endsWith('-volley')){
      const punch=physics.clamp(meters/(13+6*quality),.38,.98);
      // A low volley is a controlled lift, not a drive through the net.
      return ball.z<physics.NET_HEIGHT+.08?Math.max(punch,groundTime*.86):punch;
    }
    // A clean groundstroke inside the court keeps attacking pace instead of
    // slowing down to fill the baseline travel time. Blend in the advantage
    // with court position, contact height and quality; low/stretched pickups
    // and intentional drops retain their controlled arc. The trajectory solver
    // still lengthens the flight whenever net clearance requires it.
    if(shotType==='short' || shotType==='lob')return groundTime;
    const forward=physics.clamp((.80-Math.abs(ball.y))/.35,0,1);
    const height=physics.clamp((ball.z-.22)/.30,0,1);
    const clean=physics.clamp((quality-.55)/.30,0,1);
    const attackTime=Math.min(groundTime,Math.max(.38,meters/(21+5*quality)));
    const normalTime=groundTime+(attackTime-groundTime)*forward*height*clean;
    // A prepared attack after a slow high bounce generates its own pace.
    // Keep the selected target; net clearance and profile pace still apply.
    // Power remains a separate optional boost in the match engine.
    const finishTime=Math.min(normalTime,Math.max(.34,meters/(26+3*quality)));
    return normalTime+(finishTime-normalTime)*physics.clamp(proAttack,0,1);
  }
  function defensiveLateness(swingAge,kind){
    if(kind==='smash')return 0;
    // Only late contact can float up; stretching and low pickups alone cannot.
    return physics.clamp((swingAge-.24)/.12,0,1);
  }
  function defensiveLobPlan(ball,targetX,side,pressure,depthDraw,heightDraw){
    const short=depthDraw<.5+.25*pressure;
    const targetY=(side==='player'?-1:1)*(short?.46+.10*heightDraw:.86+.08*heightDraw);
    const apex=Math.max(ball.z+.35,short?1.55+.20*heightDraw:2.10+.30*heightDraw);
    const vz=Math.sqrt(2*physics.GRAVITY*(apex-ball.z));
    // Choose the complete arc at impact. Gravity, net and bounce events then
    // use the ordinary ball simulation; there is no mid-flight assistance.
    return {targetX:physics.clamp(targetX*.72,-.66,.66),targetY,
      time:physics.timeToGround({...ball,vz}),short};
  }
  function highDeepLobPlan(ball,targetX,side){
    // Intentional lobs share one deep, generous arc. Timing and reach still
    // decide whether contact occurs; only lateral placement is player aimed.
    const apex=Math.max(ball.z+.35,2.1);
    return {targetX:physics.clamp(targetX*.75,-.6,.6),targetY:(side==='player'?-1:1)*.92,
      time:physics.timeToGround({...ball,vz:Math.sqrt(2*physics.GRAVITY*(apex-ball.z))})};
  }
  return {SMASH_MIN,SMASH_MAX,select,prepare,flightTime,proAttackOpportunity,defensiveLateness,defensiveLobPlan,highDeepLobPlan};
});
