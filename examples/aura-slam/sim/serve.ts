import { GRAVITY } from "../contract/units";

/** Shot-input windows and the power meter (match-engine.js `SHOT`). */
export const SHOT = Object.freeze({ aimWindow: 0.18, contactOpens: 0.16, doubleTapWindow: 0.22, energyMax: 100, powerCost: 38, recoveryPerSecond: 6, recoveryDelay: 1 });

/** Original toss geometry; its apex is tied to the physical constants. */
export const TOSS_START_Z = 0.32;
export const TOSS_VELOCITY = 2.6;
export const TOSS_APEX_Z = TOSS_START_Z + TOSS_VELOCITY ** 2 / (2 * GRAVITY);

/** Serve geometry, timing windows and error model (match-engine.js `SERVE`). */
export const SERVE = Object.freeze({
  version: 1, windup: 0.24, doubleTapWindow: 0.22, tossStartZ: TOSS_START_Z, apexZ: TOSS_APEX_Z,
  apexHeightMetres: TOSS_APEX_Z * 2.177, tossVelocity: TOSS_VELOCITY,
  aimSpeedMetres: 5, minimumDepth: 0, defaultDepth: 0.46, powerDepthMetres: 0.5, powerKph: 20,
  timingWindow: 0.25, secondPace: 0.88, firstClearanceMetres: 0.08, secondClearanceMetres: 0.16,
  errorWidthMetres: 2.8, errorDepthMetres: 4.5, returnReachMetres: 0.255 * 5.018, returnContactHalfWindow: 0.035,
});

export interface ServeStats {
  attempts: number; firstAttempts: number; firstIn: number; secondAttempts: number; secondIn: number; faults: number; doubleFaults: number;
  lets: number; aces: number; unreturned: number; returnsMade: number; returnErrors: number; weakReturns: number; pointsPlayed: number; pointsWon: number;
  speedTotal: number; speedCount: number; fastest: number; powerAttempts: number; powerIn: number;
  firstSpeedTotal: number; firstSpeedCount: number; secondSpeedTotal: number; secondSpeedCount: number;
}
export const makeServeStats = (): ServeStats => ({
  attempts: 0, firstAttempts: 0, firstIn: 0, secondAttempts: 0, secondIn: 0, faults: 0, doubleFaults: 0,
  lets: 0, aces: 0, unreturned: 0, returnsMade: 0, returnErrors: 0, weakReturns: 0, pointsPlayed: 0, pointsWon: 0,
  speedTotal: 0, speedCount: 0, fastest: 0, powerAttempts: 0, powerIn: 0,
  firstSpeedTotal: 0, firstSpeedCount: 0, secondSpeedTotal: 0, secondSpeedCount: 0,
});

export const SINGLES_X = 0.82;


/* Serve module: serve geometry, toss/swing/contact, faults and lets, transcribed from public/toptennis/match-engine.js (the closure
 * functions listed in SERVE_OWNED_NAMES). Bodies and constants are unchanged; free closure variables of the original factory are read
 * from `env` (ServeEnv), which the match engine builds from its own closure with live getters. */
export const SERVE_OWNED_NAMES: readonly string[] = ["getServeGeometry","positionPlayersForServe","prepareServe","syncServeStats","serveEvent","serveQuality","setServeAim","getServeFeedback","beginServeToss","beginServeSwing","countServeAttempt","finishServeResult","strikeServe","registerServeFault","replayLet"];
export const SERVE_ENV_NAMES: readonly string[] = ["state","pointIndex","online","SINGLES_X","serveReceiverDepth","swipeBoundary","cancelShotInput","usesNetTactics","makeAITactics","planCPUServe","serveAnticipation","clamp","makeBall","clone","emit","swipeActive","serveDepthOffset","GRAVITY","physics","isHuman","playTone","options","playerProfile","servePowerFraction","TAU","seeded","recordSwipeFlight","scheduleAIRead","burstAt","palette","playHit","signalOut","awardPoint"];

export interface ServeEnv {
  readonly state: any;
  readonly pointIndex: any;
  readonly online: any;
  readonly SINGLES_X: any;
  readonly serveReceiverDepth: any;
  readonly swipeBoundary: any;
  readonly cancelShotInput: any;
  readonly usesNetTactics: any;
  readonly makeAITactics: any;
  readonly planCPUServe: any;
  readonly serveAnticipation: any;
  readonly clamp: any;
  readonly makeBall: any;
  readonly clone: any;
  readonly emit: any;
  readonly swipeActive: any;
  readonly serveDepthOffset: any;
  readonly GRAVITY: any;
  readonly physics: any;
  readonly isHuman: any;
  readonly playTone: any;
  readonly options: any;
  readonly playerProfile: any;
  readonly servePowerFraction: any;
  readonly TAU: any;
  readonly seeded: any;
  readonly recordSwipeFlight: any;
  readonly scheduleAIRead: any;
  readonly burstAt: any;
  readonly palette: any;
  readonly playHit: any;
  readonly signalOut: any;
  readonly awardPoint: any;
}

export function createServeModule(env: ServeEnv) {
  // match-engine.js l.311
  function getServeGeometry(side = env.state.server) {
      const courtSign = env.pointIndex() % 2 === 0 ? 1 : -1;
      const serverX = (side === 'player' ? 1 : -1) * courtSign * .38;
      const targetSign = -Math.sign(serverX);
      return {
        serverX,
        receiverX: targetSign * (!env.online&&env.state.server==='player'?.56:.50),
        targetSign,
        targetY: side === 'player' ? -SERVE.defaultDepth : SERVE.defaultDepth,
        minX: targetSign < 0 ? -env.SINGLES_X : 0,
        maxX: targetSign < 0 ? 0 : env.SINGLES_X
      };
    }

  // match-engine.js l.325
  function positionPlayersForServe() {
      const geometry = getServeGeometry();
      const server = env.state.server === 'player' ? env.state.player : env.state.ai;
      const receiver = env.state.server === 'player' ? env.state.ai : env.state.player;
      server.x = geometry.serverX;
      server.y = env.state.server === 'player' ? 1.035 : -1.035;
      receiver.x = geometry.receiverX;
      receiver.y = env.state.server === 'player' ? (env.online?-.86:-env.serveReceiverDepth()) : .86;
      for (const player of [env.state.player, env.state.ai]) {
        player.vx = 0;
        player.vy = 0;
        player.targetX = player.x;
        player.targetY = player.y;
      }
    }

  // match-engine.js l.341
  function prepareServe(keepServeNumber = false) {
      env.swipeBoundary(!keepServeNumber);
      env.state.outFeedback = null;
      if (env.state.ball.dead) env.state.retiringBall = { ...env.state.ball, fade: .7 };
      env.cancelShotInput(); if(env.online)env.cancelShotInput('ai');
      if (!keepServeNumber) {
        env.state.serveNumber = 1;
        env.state.ai.lobRepeats=0;
        delete env.state.ai.netShotHistory;
        if (env.usesNetTactics()) env.state.ai.tactics = env.makeAITactics();
        else delete env.state.ai.tactics;
      }
      env.state.serveCourt = env.pointIndex() % 2 === 0 ? 'deuce' : 'ad';
      env.state.phase = 'serve';
      env.state.rallyTime = 0;
      env.state.rallyHits = 0;
      for (const actor of [env.state.player, env.state.ai]) {
        actor.swing = 0; actor.swingAge = 0; actor.swingCooldown = 0; actor.strokeConnected = false;
      }
      env.state.pointDelay = 0;
      env.state.serveDelay = env.state.server === 'ai' ? .85 : 0;
      env.state.pointWinner = null;
      env.state.lastShotType = 'none';
      env.state.lastStroke = 'none';
      env.state.lastShotSpeed = 0;
      env.state.lastTiming = '';
      env.state.lastShotPower = false;
      positionPlayersForServe();
      const geometry=getServeGeometry();
      const previous=keepServeNumber&&env.state.serveAttempt?.server===env.state.server&&env.state.serveAttempt.number===env.state.serveNumber?env.state.serveAttempt.aim:null;
      const aim=previous?{...previous}:{x:geometry.targetSign*.41,y:geometry.targetY};
      env.state.serveAttempt={id:++env.state.serveSequence,server:env.state.server,number:env.state.serveNumber,aim,lockedAim:null,
        expected:null,actual:null,tossAt:null,swingAt:null,contactAt:null,power:false,quality:null,
        launchSpeedKph:0,legal:false,receiverTouched:false,result:null,errorSeed:env.state.serveSequence*104729+Math.floor(env.state.time*1000),
        counted:false,recorded:false};
      delete env.state.ai.serveRead;
      delete env.state.ai.serveContactAge;
      if(!env.online&&env.state.server==='ai')env.planCPUServe();
      if(!env.online&&env.state.server==='player'){
        const bias=env.serveAnticipation(geometry);
        env.state.ai.x=env.clamp(geometry.receiverX+bias,-.9,.9);
        env.state.ai.targetX=env.state.ai.x;env.state.ai.targetY=env.state.ai.y;
      }
      const serveLabel = env.state.serveNumber === 2 ? 'SECOND SERVE' : (env.state.server === 'player' ? 'YOUR SERVE' : 'RIVAL SERVES');
      env.state.message = serveLabel;
      env.state.messageTimer = 1.2;
      env.state.ball = env.makeBall();
      env.state.ball.x = env.state.server === 'player' ? env.state.player.x + .035 : env.state.ai.x - .035;
      env.state.ball.y = env.state.server === 'player' ? env.state.player.y - .04 : env.state.ai.y + .04;
      env.state.ball.z = .32;
    }

  // match-engine.js l.465
  function syncServeStats(){env.state.stats.serve=env.clone(env.state.player.stats.serve);}

  // match-engine.js l.466
  function serveEvent(stage: any){
      const a=env.state.serveAttempt;if(a)env.emit('serve',{id:a.id,server:a.server,stage,attempt:env.clone(a)});
    }

  // match-engine.js l.469
  function serveQuality(ball=env.state.ball){
      const gap=Math.max(0,(SERVE.apexZ-ball.z)*2.177);
      if(gap<1e-10)return 1;
      return env.clamp(1-Math.sqrt(2*gap/9.81)/SERVE.timingWindow,0,1);
    }

  // match-engine.js l.474
  function setServeAim(side: any,point: any){
      const a=env.state.serveAttempt;
      if(side==='player'&&env.swipeActive()&&env.state.swipe.committed?.kind==='serve')return false;
      if(!a||a.server!==side||a.swingAt!==null||!['serve','serveToss'].includes(env.state.phase)||
        !Number.isFinite(point?.x)||!Number.isFinite(point?.y))return false;
      const geometry=getServeGeometry(side),end=side==='player'?-1:1;
      a.aim={x:env.clamp(point.x,geometry.minX,geometry.maxX),y:end*env.clamp(point.y*end,0,.52)};
      a.expected={x:a.aim.x,y:a.aim.y+end*env.serveDepthOffset(a)};
      return true;
    }

  // match-engine.js l.484
  function getServeFeedback(inputHorizon=0){
      const a=env.state.serveAttempt,b=env.state.ball;
      const point=a?.lockedAim||a?.aim;
      const canAim=!!a&&a.swingAt===null&&['serve','serveToss'].includes(env.state.phase);
      let swingCue=null,swingQuality=null;
      if(canAim&&env.state.phase==='serveToss'&&Number.isFinite(a.tossAt)){
        const contactOffset=env.state.time+SERVE.windup-a.tossAt-SERVE.tossVelocity/env.GRAVITY;
        swingQuality=env.clamp(1-Math.abs(contactOffset)/SERVE.timingWindow,0,1);
        // CLEAN is strictly above .60 at contact. Leave the exact boundary out
        // of READY too, so the cue cannot promise CLEAN and produce EARLY/LATE.
        const cleanOffset=SERVE.timingWindow*.40;
        // The renderer may still show this cue while a fractional-tick input
        // arrives. It supplies that frame's actual input-time horizon so the
        // final READY frame remains clean throughout its displayed interval.
        const horizon=Number.isFinite(inputHorizon)?env.clamp(inputHorizon,0,.05):0;
        swingCue=contactOffset+horizon>=cleanOffset-1e-9?'late':contactOffset<=-cleanOffset+1e-9?'wait':'ready';
      }
      const planning=!!point&&['serve','serveToss'].includes(env.state.phase);
      const expectedY=point?point.y+(a.server==='player'?-1:1)*env.serveDepthOffset(a):0;
      const netRisk=planning?env.physics.serveTargetNetRisk({...b,z:SERVE.apexZ},point.x,expectedY,
        a.number===2?SERVE.secondClearanceMetres:SERVE.firstClearanceMetres):!!a?.netRisk;
      // The input circle meets the rising ball when starting a swing will put
      // racket contact at the apex. Hide it after commitment or the last useful
      // input time, so its later descending crossing never invites another hit.
      const pressZ=SERVE.apexZ-env.GRAVITY*SERVE.windup**2/2;
      const showPressCue=swingCue==='wait'||swingCue==='ready';
      return {attempt:a,dotZ:SERVE.apexZ,leadZ:pressZ,pressZ,showPressCue,
        quality:env.state.phase==='serveToss'?serveQuality():a?.quality,
        canAim,swingCue,swingQuality,netRisk,
        powerLongRisk:!!point&&Math.abs(point.y)+(Number.isFinite(a.swipeStrength)?0:SERVE.powerDepthMetres/11.885)>env.physics.LINE_BOUNDS.serviceY};
    }

  // match-engine.js l.546
  function beginServeToss(side: any,eventTime=env.state.time) {
      if(env.state.phase!=='serve'||side!==env.state.server)return;
      if(env.state.swipe)env.state.swipe.pointStarted=true;
      const ball=env.state.ball,actor=env.state[side],a=env.state.serveAttempt;
      if(a.number!==env.state.serveNumber){a.number=env.state.serveNumber;if(!env.isHuman(side))env.planCPUServe();}
      env.state.phase='serveToss';
      a.tossAt=Number.isFinite(eventTime)?env.clamp(eventTime,env.state.time,env.state.time+.05):env.state.time;
      ball.active=false;ball.x=actor.x+(side==='player'?.035:-.035);
      ball.y=actor.y+(side==='player'?-.04:.04);ball.z=SERVE.tossStartZ;
      ball.vx=0;ball.vy=0;ball.vz=SERVE.tossVelocity;
      if(!env.isHuman(side))a.cpuSwingAt=a.tossAt+SERVE.tossVelocity/env.GRAVITY+a.cpuTimingOffset-SERVE.windup;
      env.state.message=side==='player'?'TOSS · PRESS AS BALL RISES INTO CIRCLE':'RIVAL TOSS';env.state.messageTimer=1.3;
      serveEvent('toss');env.playTone(360,.05,'sine',.025);
    }

  // match-engine.js l.560
  function beginServeSwing(side: any,eventTime=env.state.time,forcePower=false){
      const a=env.state.serveAttempt;
      if(env.state.phase!=='serveToss'||!a||side!==a.server)return;
      const at=Number.isFinite(eventTime)?env.clamp(eventTime,env.state.time,env.state.time+.05):env.state.time;
      if(a.swingAt!==null){
        if(at>a.swingAt+1e-9&&at-a.swingAt<=SERVE.doubleTapWindow+1e-9&&at<a.contactAt&&!a.power){
          a.power=true;
          if(a.lockedAim)a.expected={x:a.lockedAim.x,y:a.lockedAim.y+(side==='player'?-1:1)*env.serveDepthOffset(a)};
          serveEvent('power');
        }
        return;
      }
      a.lockedAim=a.aim?{...a.aim}:null;a.swingAt=at;a.contactAt=at+SERVE.windup;a.power=!!(a.power||forcePower);
      if(a.lockedAim)a.expected={x:a.lockedAim.x,y:a.lockedAim.y+(side==='player'?-1:1)*env.serveDepthOffset(a)};
      const actor=env.state[side];actor.swing=SERVE.windup+.34;actor.swingAge=0;actor.stroke='serve';
      actor.strokeConnected=false;actor.strokeContactAge=SERVE.windup;actor.swingCooldown=SERVE.windup+.38;
      actor.vx=0;actor.vy=0;
      env.state.message=Number.isFinite(a.swipeStrength)?`${a.power?'POWER ':''}SERVE · TARGET LOCKED`
        :a.power?'POWER SERVE · +0.50 M DEPTH':'SWING · DOUBLE TAP FOR POWER';env.state.messageTimer=SERVE.windup;
      serveEvent('swing');
    }

  // match-engine.js l.581
  function countServeAttempt(a: any){
      if(a.counted)return;
      const stats=env.state[a.server].stats.serve;a.counted=true;stats.attempts++;
      stats[a.number===1?'firstAttempts':'secondAttempts']++;if(a.power)stats.powerAttempts++;
    }

  // match-engine.js l.586
  function finishServeResult(result: any){
      const a=env.state.serveAttempt;if(!a||a.result)return;
      // Count a pressured contact only after its return becomes legal. A block
      // into the net or out remains a return error instead of a weak return.
      if(result==='returned'&&a.weakReturn)env.state[a.server].stats.serve.weakReturns++;
      a.result=result;env.state.lastServe=env.clone(a);
      if(!a.recorded&&a.actual){
        env.state.serveHistory.push({id:a.id,server:a.server,court:env.state.serveCourt,actual:{...a.actual},legal:a.legal,result});
        if(env.state.serveHistory.length>24)env.state.serveHistory.shift();a.recorded=true;
      }
      syncServeStats();serveEvent('result');
    }

  // match-engine.js l.598
  function strikeServe(side: any) {
      if(env.state.phase!=='serveToss'||side!==env.state.server)return;
      const a=env.state.serveAttempt,ball=env.state.ball,actor=env.state[side];
      if(env.options.suppressRemoteServePrediction&&side!==(env.options.predictionSide||'player'))return;
      if(!a?.aim&&!a?.lockedAim)return;
      a.lockedAim=a.lockedAim||{...a.aim};
      a.contactAt=env.state.time;countServeAttempt(a);
      if(ball.z<1.8/2.177){
        a.quality=0;actor.strokeConnected=true;registerServeFault('FAULT — MISSED TOSS');return;
      }
      const quality=serveQuality(),end=side==='player'?-1:1;
      const rating=env.playerProfile(actor)?.ratings.serve||6;
      const powerStrength=env.servePowerFraction(a);
      const requested=(125+12.5*(rating-6))*(.80+.20*quality)*(a.number===2?SERVE.secondPace:1)*
        (env.isHuman(side)?1:a.cpuPace||1)+powerStrength*SERVE.powerKph;
      const expected={x:a.lockedAim.x,y:a.lockedAim.y+end*env.serveDepthOffset(a)};
      const angle=env.TAU*env.seeded(a.errorSeed+71),radius=Math.sqrt(env.seeded(a.errorSeed+97))*(1-quality)**2*(1+.05*(10-rating));
      const errorX=Math.cos(angle)*radius*SERVE.errorWidthMetres*(side==='player'?1:-1);
      const errorY=Math.sin(angle)*radius*SERVE.errorDepthMetres*end;
      const trajectory=env.physics.serveTrajectory(ball,expected.x,expected.y,requested,
        a.number===2?SERVE.secondClearanceMetres:SERVE.firstClearanceMetres,errorX,errorY);
      Object.assign(ball,{vx:trajectory.vx,vy:trajectory.vy,vz:trajectory.vz,targetX:trajectory.targetX,targetY:trajectory.targetY,
        active:true,dead:false,settling:false,rolling:false,lastHit:side,bounceCount:0,crossedNet:false,
        isServe:true,shotType:'serve',stroke:'serve',powered:a.power,defensiveLob:false,highDeepLob:false,netTouched:false,serveOriginX:actor.x,
        serveAttemptId:a.id});
      ball.speedKph=env.physics.speedKph(ball);
      Object.assign(a,{expected,quality,launchSpeedKph:ball.speedKph,netRisk:trajectory.netRisk,paceLimited:trajectory.paceLimited,
        timing:quality>.88?'PERFECT':quality>.60?'CLEAN':ball.vz>0?'EARLY':'LATE',timingErrorMetres:Math.hypot(errorX,errorY)});
      // Label early/late from the toss, not the new outgoing trajectory.
      if(quality<=.60)a.timing=env.state.time<(a.tossAt??env.state.time)+SERVE.tossVelocity/env.GRAVITY?'EARLY':'LATE';
      actor.swing=.34;actor.swingAge=SERVE.windup;actor.strokeConnected=true;actor.serveMotion=.42;actor.swingCooldown=.38;
      actor.strokeContactZ=ball.z;actor.strokeContactAge=SERVE.windup;
      env.state.phase='rally';env.state.rallyHits=1;env.state.lastShotType='serve';env.state.lastStroke='serve';
      if(Number.isFinite(a.swipeStrength)&&env.state.swipe){
        env.state.swipe.committed=null;ball.swipeStrength=a.swipeStrength;env.recordSwipeFlight();
      }
      env.state.lastShotSpeed=ball.speedKph;env.state.lastShotPower=a.power;env.state.lastTiming=a.timing;
      actor.stats.fastestShot=Math.max(actor.stats.fastestShot,ball.speedKph);if(side==='player')env.state.stats.fastestShot=actor.stats.fastestShot;
      env.state.lastServe=env.clone(a);syncServeStats();
      if(side==='player'&&!env.online)env.scheduleAIRead();
      env.state.message=`${a.power?'POWER · ':''}${a.timing} SERVE · ${ball.speedKph} KM/H`;env.state.messageTimer=.9;
      serveEvent('contact');env.burstAt(ball.x,ball.y,ball.z,side==='player'?env.palette.lime:env.palette.coral,8);env.playHit(side==='player'?1:.9);
    }

  // match-engine.js l.642
  function registerServeFault(call = 'FAULT') {
      const attempt=env.state.serveAttempt;
      if(attempt?.result)return;
      if(attempt){
        const b=env.state.ball,depth=(attempt.server==='player'?-1:1)*b.y;
        const wide=Math.abs(b.x)>env.physics.LINE_BOUNDS.singlesX||b.x*Math.sign(b.serveOriginX||env.state[attempt.server].x)>env.physics.LINE_BOUNDS.centerX;
        const long=depth>env.physics.LINE_BOUNDS.serviceY;
        attempt.faultReason=call.includes('NET')?'NET':call.includes('MISSED')?'MISSED TOSS':long&&wide?'LONG + WIDE':long?'LONG':wide?'WIDE':depth<0?'SHORT':'OUT';
        countServeAttempt(attempt);env.state[attempt.server].stats.serve.faults++;
        if(attempt.number===2)env.state[attempt.server].stats.serve.doubleFaults++;
        finishServeResult(attempt.number===2?'doubleFault':'fault');}
      // A plain fault is an invalid service-box landing; net faults stay distinct.
      if (call === 'FAULT') env.signalOut();
      if (env.state.serveNumber === 1) {
        env.state.phase = 'serveFault';
        env.state.serveNumber = 2;
        env.state.serveDelay = 1.05;
        env.physics.releaseBall(env.state.ball);
        env.state.lastCall = call;
        env.state.message = `${call==='FAULT'?`FAULT — ${attempt?.faultReason||'OUT'}`:call}  •  SECOND SERVE`;
        env.state.messageTimer = 1.05;
        env.playTone(165, .16, 'sine', .035);
      } else {
        const receiver = env.state.server === 'player' ? 'ai' : 'player';
        env.awardPoint(receiver, 'DOUBLE FAULT');
      }
    }

  // match-engine.js l.670
  function replayLet() {
      const a=env.state.serveAttempt;
      if(a?.result)return;
      if(a){
        const stats=env.state[a.server].stats.serve;stats.lets++;
        if(a.counted){stats.attempts--;stats[a.number===1?'firstAttempts':'secondAttempts']--;if(a.power)stats.powerAttempts--;}
        finishServeResult('let');
      }
      env.state.phase = 'serveFault';
      env.state.serveDelay = .9;
      env.physics.releaseBall(env.state.ball);
      env.state.lastCall = 'LET';
      env.state.message = `LET  •  ${env.state.serveNumber === 1 ? 'FIRST' : 'SECOND'} SERVE`;
      env.state.messageTimer = .9;
    }

  return { getServeGeometry, positionPlayersForServe, prepareServe, syncServeStats, serveEvent, serveQuality, setServeAim, getServeFeedback, beginServeToss, beginServeSwing, countServeAttempt, finishServeResult, strikeServe, registerServeFault, replayLet };
}
export type ServeModule = ReturnType<typeof createServeModule>;
