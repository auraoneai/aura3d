/* Swipe-shot module: touch-swipe control state and the swipe-driven player, transcribed from public/toptennis/match-engine.js
 * (functions listed in SWIPE_OWNED_NAMES). Free closure variables of the original factory are read from `env` (SwipeEnv). */
export const SWIPE_OWNED_NAMES: readonly string[] = ["makeSwipeState","swipeEligible","swipeActive","swipeBallKey","clearSwipeAttempt","swipeBoundary","setControlStyle","cancelSwipeShot","recordSwipeFlight","getSwipeState","queueSwipeShot","swipeMove","swipeIntercept","swipeContactAhead","updateSwipePlayer"];
export const SWIPE_ENV_NAMES: readonly string[] = ["swipeAllowed","online","state","isHuman","cancelShotInput","inputs","emptyInput","physics","SERVE","clone","clamp","getServeGeometry","lerp","setServeAim","beginServeToss","GRAVITY","playerModifier","steerMovement","advanceReturnPrediction","strokes","level","racketDistance","SHOT","updateLocomotion","prepareStroke"];
export const SWIPE_ENGINE_EXPORTS: readonly string[] = ["makeSwipeState","swipeEligible","swipeActive","clearSwipeAttempt","swipeBoundary","recordSwipeFlight","updateSwipePlayer"];

export interface SwipeEnv {
  readonly swipeAllowed: any;
  readonly online: any;
  readonly state: any;
  readonly isHuman: any;
  readonly cancelShotInput: any;
  readonly inputs: any;
  readonly emptyInput: any;
  readonly physics: any;
  readonly SERVE: any;
  readonly clone: any;
  readonly clamp: any;
  readonly getServeGeometry: any;
  readonly lerp: any;
  readonly setServeAim: any;
  readonly beginServeToss: any;
  readonly GRAVITY: any;
  readonly playerModifier: any;
  readonly steerMovement: any;
  readonly advanceReturnPrediction: any;
  readonly strokes: any;
  readonly level: any;
  readonly racketDistance: any;
  readonly SHOT: any;
  readonly updateLocomotion: any;
  readonly prepareStroke: any;
}

export function createSwipeModule(env: SwipeEnv) {
  // match-engine.js l.764
  function makeSwipeState(style: any){return {style:style==='swipe'?'swipe':'classic',pendingStyle:null,
      intent:null,committed:null,previewFlight:null,autoTarget:null,pointEpoch:0,pointStarted:false,attempt:0,readKey:null,nextRead:0,reactionUntil:0,plan:null};}

  // match-engine.js l.768
  function swipeEligible(){return env.swipeAllowed&&!env.online&&!env.state.eventId&&env.isHuman('player');}

  // match-engine.js l.769
  function swipeActive(){return swipeEligible()&&env.state.swipe?.style==='swipe';}

  // match-engine.js l.770
  function swipeBallKey(){return `${env.state.swipe?.pointEpoch||0}:${env.state.serveSequence}:${env.state.rallyHits}:${env.state.ball.lastHit}`;}

  // match-engine.js l.771
  function clearSwipeAttempt(){
      const q=env.state.swipe;if(!q)return;
      q.intent=null;q.committed=null;q.previewFlight=null;q.autoTarget=null;q.plan=null;q.readKey=null;q.nextRead=0;q.reactionUntil=0;
    }

  // match-engine.js l.775
  function swipeBoundary(newPoint: any){
      const q=env.state.swipe;if(!q)return;
      clearSwipeAttempt();q.attempt++;
      if(newPoint){q.pointEpoch++;q.pointStarted=false;if(q.pendingStyle){q.style=q.pendingStyle;q.pendingStyle=null;}}
    }

  // match-engine.js l.780
  function setControlStyle(style: any){
      if(!['classic','swipe'].includes(style)||!swipeEligible()||!env.state.swipe)return false;
      const q=env.state.swipe;
      if(style===q.style){q.pendingStyle=null;return true;}
      if(env.state.phase==='serve'&&env.state.serveAttempt?.tossAt===null&&!q.pointStarted||env.state.phase==='practiceFeed'){
        clearSwipeAttempt();env.cancelShotInput();env.inputs.player=env.emptyInput();q.style=style;q.pendingStyle=null;
      }else q.pendingStyle=style;
      return true;
    }

  // match-engine.js l.789
  function cancelSwipeShot(){if(env.state.swipe)env.state.swipe.intent=null;}

  // match-engine.js l.790
  function recordSwipeFlight(){
      const b=env.state.ball;
      env.state.swipe.previewFlight={origin:{x:b.x,y:b.y,z:b.z},vx:b.vx,vy:b.vy,vz:b.vz,
        flightTime:env.physics.timeToGround(b),launchedAt:env.state.time,target:{x:b.targetX,y:b.targetY},key:swipeBallKey()};
    }

  // match-engine.js l.795
  function getSwipeState(){
      const q=env.state.swipe,enabled=swipeActive();
      const intent=enabled&&q.intent&&q.intent.key===swipeBallKey()?q.intent:null;
      const committed=enabled?q.committed:null,shot=committed||intent;
      const previewFlight=enabled&&env.state.phase==='rally'&&env.state.ball.active&&env.state.ball.bounceCount===0&&env.state.ball.lastHit==='player'&&
        q.previewFlight?.key===swipeBallKey()?q.previewFlight:null;
      const serving=env.state.server==='player'&&['serve','serveToss'].includes(env.state.phase);
      const origin=serving?{x:env.state.player.x+.035,y:env.state.player.y-.04,z:env.SERVE.apexZ}
        :q?.plan?{x:q.plan.x,y:q.plan.y-.035,z:q.plan.z??.45}:{x:env.state.player.x,y:env.state.player.y,z:.5};
      return env.clone({effectiveStyle:enabled?'swipe':'classic',pendingStyle:swipeEligible()?q?.pendingStyle||null:null,
        intent,committed,autoTarget:enabled?q.autoTarget:null,pointEpoch:q?.pointEpoch||0,
        attemptKey:`${q?.pointEpoch||0}:${q?.attempt||0}:${env.state.serveSequence}:${env.state.phase}:${env.state.rallyHits}`,
        targetingOrigin:enabled?origin:null,previewFlight,
        previewTarget:shot?(shot.target||{x:shot.targetX,y:-shot.targetDepth}):previewFlight?.target||null});
    }

  // match-engine.js l.810
  function queueSwipeShot(shot: any){
      if(!swipeActive()||env.state.mode!=='playing'||env.state.paused||env.state.swipe.committed||
        !shot||!['targetX','targetDepth','strength'].every((key: any)=>Number.isFinite(shot[key])))return false;
      // Lock on release, before the automatic runner reaches its contact window.
      // Early gestures belong to this ball instead of expiring during a long lob.
      if(env.state.swipe.intent?.key===swipeBallKey())return false;
      const q=env.state.swipe,intent={targetX:env.clamp(shot.targetX,-.8,.8),targetDepth:env.clamp(shot.targetDepth,.23,.92),
        strength:env.clamp(shot.strength,0,1),createdAt:env.state.time,key:swipeBallKey()};
      if(env.state.phase==='serve'&&env.state.server==='player'){
        const geometry=env.getServeGeometry('player'),fraction=(intent.targetX+.8)/1.6;
        const target={x:env.lerp(geometry.minX+.025,geometry.maxX-.025,fraction),
          y:-env.lerp(.08,.50,(intent.targetDepth-.23)/.69)};
        env.setServeAim('player',target);q.intent=null;q.committed={...intent,kind:'serve',target};
        env.state.serveAttempt.swipeStrength=intent.strength;
        env.beginServeToss('player');
        env.state.serveAttempt.swipeSwingAt=env.state.serveAttempt.tossAt+env.SERVE.tossVelocity/env.GRAVITY-env.SERVE.windup;
        return true;
      }
      if(env.state.phase!=='rally'||!env.state.ball.active||env.state.ball.lastHit!=='ai'||env.state.ball.vy<=0)return false;
      q.intent=intent;return true;
    }

  // match-engine.js l.831
  function swipeMove(actor: any,target: any,dt: any,planted=false){
      if(planted){actor.vx=0;actor.vy=0;return;}
      const dx=target.x-actor.x,dy=target.y-actor.y,distance=Math.hypot(dx,dy);
      const maximum=1.3*env.playerModifier(actor,'footwork'),speed=Math.min(maximum,distance*8);
      env.steerMovement(actor,distance>1e-9?dx/distance*speed:0,distance>1e-9?dy/distance*speed:0,maximum,distance>.008?13:9,dt);
      actor.x=env.clamp(actor.x+actor.vx*dt,-1.06,1.06);actor.y=env.clamp(actor.y+actor.vy*dt,.12,1.22);
    }

  // match-engine.js l.838
  function swipeIntercept(){
      const actor=env.state.player,ball=env.state.ball,speed=1.3*env.playerModifier(actor,'footwork');
      const predicted={...ball},step=.025,delay=Math.max(0,env.state.swipe.reactionUntil-env.state.time);
      let ground=null,overhead=null,bestEffort=null,chase=null;
      // A bounded public-flight forecast stops at the ordinary terminal events.
      // It never reads the CPU's selected target or gives the runner extra reach.
      for(let time=step;time<=2.5;time+=step){
        env.advanceReturnPrediction(predicted,step);
        if(!predicted.active)break;
        if(predicted.y<=.015||predicted.vy<=0)continue;
        const target={x:env.clamp(predicted.x,-1.06,1.06),y:env.clamp(predicted.y+.035,.12,1.22)};
        const distance=Math.hypot(target.x-actor.x,target.y-actor.y);
        const stroke=env.strokes.select({...actor,...target},predicted);
        const reach=env.level().humanReach*stroke.reachScale;
        if(env.racketDistance({...actor,...target},predicted)>reach)continue;
        const candidate={...target,z:predicted.z,at:env.state.time+time,kind:stroke.kind};
        // Even when an ideal stroke is unavailable, keep following a public
        // flight point inside normal reach instead of braking in place.
        const chaseScore=distance-speed*Math.max(0,time-delay);
        if(!chase||chaseScore<chase.score)chase={...candidate,score:chaseScore};
        if(!stroke.reachable||predicted.isServe&&predicted.bounceCount===0)continue;
        const smash=stroke.kind==='smash';
        if(smash?(predicted.vz>=0||env.state.practice&&predicted.bounceCount!==0)
          :env.state.practice||predicted.bounceCount!==1&&target.y>=.60)continue;
        const reserve=delay+env.SHOT.contactOpens+.07;
        const shortfall=distance-speed*Math.max(0,time-reserve)-reach*.80;
        if(!bestEffort||shortfall<bestEffort.score)bestEffort={...candidate,score:shortfall};
        if(shortfall>0)continue;
        if(smash){
          const score=Math.abs(predicted.z-.98);
          if(!overhead||score<overhead.score)overhead={...candidate,score};
        }else if(!ground)ground=candidate;
      }
      return overhead||ground||bestEffort||chase;
    }

  // match-engine.js l.873
  function swipeContactAhead(dt: any){
      const actor=env.state.player,incoming={...env.state.ball};
      // updatePlayer runs before this frame's ball advance. Count that same
      // frame in the windup and split a later update at its exact contact time.
      const contactDelay=Math.max(env.SHOT.contactOpens,dt);
      env.advanceReturnPrediction(incoming,contactDelay);
      if(!incoming.active||incoming.lastHit!=='ai'||incoming.vy<=0||incoming.y<=.015||
        incoming.isServe&&incoming.bounceCount===0)return null;
      const stroke=env.strokes.select(actor,incoming);
      if(!stroke.reachable||env.state.practice&&(stroke.kind!=='smash'||incoming.vz>=0||incoming.bounceCount!==0))return null;
      // Choose overheads on descent and ordinary rally pickups after a bounce,
      // unless the player has actually reached a volleying position.
      if(stroke.kind==='smash'&&incoming.vz>=0||stroke.kind.endsWith('-volley')&&actor.y>=.60)return null;
      const reach=env.level().humanReach*stroke.reachScale;
      if(env.racketDistance(actor,incoming)>reach*.80)return null;
      return {...stroke,contactDelay};
    }

  // match-engine.js l.890
  function updateSwipePlayer(dt: any){
      const q=env.state.swipe,actor=env.state.player,ball=env.state.ball;
      if(q.intent&&q.intent.key!==swipeBallKey())q.intent=null;
      if(q.previewFlight&&(!ball.active||ball.bounceCount>0||q.previewFlight.key!==swipeBallKey()))q.previewFlight=null;
      if(q.committed?.kind==='rally'&&(actor.strokeConnected||actor.swing<=0))q.committed=null;
      if(q.committed?.kind==='rally'&&Number.isFinite(q.committed.contactAt)&&
        env.state.time>=q.committed.contactAt-1e-9)actor.swingAge=Math.max(env.SHOT.contactOpens,actor.swingAge);
      if(env.state.phase!=='rally'){
        actor.vx=0;actor.vy=0;q.autoTarget={x:actor.x,y:actor.y};env.updateLocomotion(actor,dt);return;
      }
      const incoming=ball.active&&ball.lastHit==='ai'&&ball.vy>0,key=swipeBallKey();
      let target={x:env.clamp(-(ball.targetX||0)*.30,-.24,.24),y:ball.lastHit==='player'&&Math.abs(ball.targetY)<.45?.68:.87};
      if(incoming){
        if(q.readKey!==key){q.readKey=key;q.reactionUntil=env.state.time-dt+.08;q.nextRead=0;q.plan=null;}
        if(env.state.time>=q.reactionUntil&&env.state.time>=q.nextRead&&!q.committed){q.plan=swipeIntercept();q.nextRead=env.state.time+.08;}
        if(q.plan)target=q.plan;
        else if(env.state.time>=q.reactionUntil)target={x:env.clamp(ball.x,-1.06,1.06),y:env.clamp(ball.y+.035,.12,1.22)};
        else target={x:actor.x,y:actor.y};
      }else{q.plan=null;q.readKey=null;q.intent=null;}
      q.autoTarget={x:target.x,y:target.y};
      swipeMove(actor,target,dt,!!q.committed);
      env.updateLocomotion(actor,dt);
      if(incoming&&q.intent&&!q.committed&&actor.swingCooldown<=0&&env.state.time>=q.reactionUntil){
        const stroke=swipeContactAhead(dt);
        if(stroke){
          q.committed={...q.intent,kind:'rally',contactAt:env.state.time-dt+stroke.contactDelay};q.intent=null;
          actor.queuedShot=env.state.practice||stroke.kind==='smash'?'neutral':q.committed.targetDepth<.50?'short':q.committed.targetDepth>=.80?'deep':'neutral';
          actor.queuedAim=q.committed.targetX;actor.queuedPower=false;actor.aimRemaining=0;
          actor.swingPressAt=env.state.time-dt;actor.vx=0;actor.vy=0;
          actor.swing=Math.max(0,.4-dt);actor.swingAge=dt;actor.swingCooldown=Math.max(0,.42-dt);actor.strokeConnected=false;
          env.prepareStroke(actor,stroke.contactDelay);
        }
      }
    }

  return { makeSwipeState, swipeEligible, swipeActive, swipeBallKey, clearSwipeAttempt, swipeBoundary, setControlStyle, cancelSwipeShot, recordSwipeFlight, getSwipeState, queueSwipeShot, swipeMove, swipeIntercept, swipeContactAhead, updateSwipePlayer };
}
export type SwipeModule = ReturnType<typeof createSwipeModule>;
