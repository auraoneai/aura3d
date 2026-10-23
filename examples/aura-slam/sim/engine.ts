// Seeded by tools/aura-slam/port-sim.mjs from public/toptennis/match-engine.js (sha256 141f280b66cef798...), then maintained by hand.
// tests/unit/aura-slam/engine-differential.test.ts proves every step stays identical to the original script.
// @ts-nocheck: dense legacy closure; the rules/serve/scoring tables, the CPU opponent (ai.ts) and swipe control (swipe.ts) are typed sibling modules.
import { createAiModule } from "./ai";
import { PRO_POSITION, SERVE_CPU } from "./aiTables";
import { SHOT, SERVE, createServeModule, makeServeStats } from "./serve";
import { createSwipeModule } from "./swipe";
import { pointLabel, resolveScoreAfterPoint } from "./scoring";
export function engineModule(physics: any, strokes: any, roster: any, appearance: any): any {
'use strict';
const capabilities=Object.freeze({serveTargeting:1,serveWindup:1,serveStatistics:1,intentionalLobAllLevels:true,swipeControls:1});
const clone=value=>JSON.parse(JSON.stringify(value));
const other=side=>side==='player'?'ai':'player';
// Normalize previously saved difficulty IDs; there is only one active PRO mode.
const normalizeDifficulty=value=>value==='pro2'?'pro':value;
const profileSelection=actor=>actor.rosterId==='custom'?{id:'custom',ratings:actor.customRatings}:actor.rosterId;
function assignProfile(actor,selection){
  const custom=selection?.id==='custom'?roster?.customProfile(selection.ratings):null;
  if(custom?.id==='custom'){
    actor.rosterId=custom.id;actor.customRatings=custom.ratings;return;
  }
  delete actor.customRatings;
  const resolved=roster?.resolveId(selection)||'classic';
  if(resolved==='classic')delete actor.rosterId;
  else actor.rosterId=resolved;
}
const playerProfile=actor=>actor.rosterId==='custom'?roster?.customProfile(actor.customRatings):roster?.get(actor.rosterId);
const playerModifier=(actor,stat)=>playerProfile(actor)?.modifiers[stat]||1;
const dropShotSuccess=actor=>(actor.rosterId==='custom'?roster.customProfile(actor.customRatings):roster.get(actor.rosterId)).dropShotSuccess;
function create(options={}) {
  let initialized=false;
  let swipeAllowed=false;
  const online=!!options.online, TAU=Math.PI*2, GRAVITY=physics.GRAVITY, NET_HEIGHT=physics.NET_HEIGHT, SINGLES_X=.82;
  const inputs={player:emptyInput(),ai:emptyInput()};
  function emptyInput(){return {x:0,y:0,vertical:false,active:false,power:false};}
  function emit(type,data={}){if(initialized)options.onEvent?.({type,...data});}
  // Copy presentation data at contact, before the next simulation step moves it.
  const contactSound=(ball=state.ball)=>({x:ball.x,y:ball.y,speedKph:physics.speedKph(ball),
    verticalSpeed:Math.abs(ball.vz)*2.177,venue:state.venue,stroke:ball.stroke||state.lastStroke});
  const playTone=(...args)=>emit('tone',{args}),
    playHit=(...args)=>emit('hit',{args,contact:contactSound()}),
    playBounce=(ball=state.ball)=>emit('bounce',{contact:contactSound(ball)}),
    playPointSound=won=>emit('pointSound',{won});
  function currentVenue(){return {particle:{hard:'#6cc8ff',grass:'#a8c78e',clay:'#e88d63',desert:'#f2c08a',beach:'#91e7de',moon:'#cedbff'}[state.venue] || '#6cc8ff'};}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function lerp(a,b,t){return a+(b-a)*t;}
  function isHuman(side){return state[side].controller==='human';}
  function directionInput(side='player'){return options.readInput?.(side)||inputs[side];}
  function aimInput(side='player'){const d=directionInput(side);return (isPro()&&Number.isFinite(d.aimX)?clamp(d.aimX,-1,1):d.x)*.72;}
  function depthInput(side='player'){const d=directionInput(side);if(state[side].selectedShot==='lob')return 'lob';return d.vertical?(d.y<0?'deep':d.y>0?'short':'neutral'):state[side].selectedShot;}
  function selectShot(shot,side='player'){const changed=state[side].selectedShot!==shot;state[side].selectedShot=shot;if(shot==='lob')state[side].queuedPower=false;if(state[side].aimRemaining>0)state[side].queuedShot=depthInput(side);if(changed)emit('selection',{side,shot});}
  function finishMatch(){state.mode='gameover';state.phase='complete';state.winner=state.score.playerGames>state.score.aiGames?'player':'ai';emit('complete',{winner:state.winner});}
  const levels = {
    beginner: { speed: .95, delay: .22, error: .2, miscue: .13, reach: .215, maxHitZ: .68, humanReach: .28, paceRelief: .23 },
    club: { speed: 1.04, delay: .20, error: .12, miscue: .085, reach: .22, maxHitZ: .72, humanReach: .255, paceRelief: .10 },
    ace: { speed: 1.18, delay: .14, error: .065, miscue: .055, reach: .22, maxHitZ: .76, humanReach: .255, paceRelief: -.035 },
    pro: { speed: 1.26, delay: .14, error: .065, miscue: .055, reach: .22, maxHitZ: .76, humanReach: .255, paceRelief: -.035 },
    legend: { speed: 1.28, delay: .11, error: .040, miscue: .025, reach: .22, maxHitZ: .76, humanReach: .255, paceRelief: -.045 }
  };
  const level = () => levels[state.difficulty];
  const isLegend = () => state.difficulty === 'legend';
  const isPro = () => state.difficulty === 'pro' || isLegend();
  const preparedCPU = () => state.difficulty === 'ace' || isPro();
  const usesNetTactics = () => !online && (isPro() || state.difficulty === 'beginner' || state.difficulty === 'club');

  const palette = {
    lime: '#d9ff4f',
    teal: '#29dfbd',
    court: '#087d75',
    courtDark: '#075d59',
    line: '#eafbf2',
    coral: '#ff796c',
    white: '#f4f8f3',
    ink: '#07131f'
  };

  const state = {
    mode: 'menu',
    paused: false,
    difficulty: 'beginner',
    venue: 'hard',
    time: 0,
    rallyTime: 0,
    rallyHits: 0,
    stats: { pointsWon: 0, pointsLost: 0, longestRally: 0, fastestShot: 0, serve:makeServeStats() },
    serveAttempt:null,lastServe:null,serveHistory:[],serveSequence:0,
    tiebreak: false,
    tiebreakFirstServer: 'player',
    matchWon: false,
    phase: 'menu',
    pointDelay: 0,
    serveDelay: 0,
    serveNumber: 1,
    serveCourt: 'deuce',
    server: 'player',
    pointWinner: null,
    lastCall: '',
    outFeedback: null,
    lastShotType: 'none',
    lastStroke: 'none',
    lastShotSpeed: 0,
    lastTiming: '',
    lastShotPower: false,
    energy: SHOT.energyMax,
    energyRecoveryDelay: 0,
    powerDeniedUntil: 0,
    message: '',
    messageTimer: 0,
    screenShake: 0,
    score: { playerPoints: 0, aiPoints: 0, playerGames: 0, aiGames: 0 },
    player: makePlayer('player', 0, 0.77, palette.lime),
    ai: makePlayer('ai', 0, -0.77, palette.coral),
    ball: makeBall(),
    retiringBall: null,
    particles: [],
    marks: [],
  };
  // CPU opponent and swipe control live in sim/ai.ts and sim/swipe.ts; they read this closure through live getters.
  const aiEnv={get state(){return state;},get seeded(){return seeded;},get clamp(){return clamp;},get getServeGeometry(){return getServeGeometry;},get playerProfile(){return playerProfile;},get lerp(){return lerp;},get SERVE(){return SERVE;},get TAU(){return TAU;},get level(){return level;},get preparedCPU(){return preparedCPU;},get SHOT(){return SHOT;},get GRAVITY(){return GRAVITY;},get strokes(){return strokes;},get physics(){return physics;},get SINGLES_X(){return SINGLES_X;},get isPro(){return isPro;},get playerModifier(){return playerModifier;},get isServeLandingValid(){return isServeLandingValid;},get racketDistance(){return racketDistance;},get steerMovement(){return steerMovement;},get isLegend(){return isLegend;},get usesNetTactics(){return usesNetTactics;},get updateLocomotion(){return updateLocomotion;},get prepareStroke(){return prepareStroke;},get shotTrajectory(){return shotTrajectory;},get dropShotSuccess(){return dropShotSuccess;}};
  const aiModule=createAiModule(aiEnv);
  const {netPreference,cpuStyle,personalityWeight,makeAITactics,serveAnticipation,serveReceiverDepth,planCPUServe,overheadTarget,advanceReturnPrediction,canPrepareAceReturn,moveServeReceiver,moveAI,copyAIRunner,proBalanceLoad,proContactPressure,recordProContact,readProPattern,readLegendPattern,canReachAITarget,aceSwingContact,proBalancedContactAhead,proCanWaitForBalancedReturn,netVolleyTarget,contactTarget,scheduleAIRead,aiRecoveryTarget,updateAI,predictObservedServe,observeServe,updateServeReceiver,observedServeIntercept,chooseAIShot,canContinueNet,basicNetPlan,netReplyPlan,legendShotPlan,proShotPlan,aiServeReturnPlan,aiShotPlan,aiRallyShotPlan,basicPersonalityPlan,serveBalancedContactAhead}=aiModule;
  const swipeEnv={get swipeAllowed(){return swipeAllowed;},get online(){return online;},get state(){return state;},get isHuman(){return isHuman;},get cancelShotInput(){return cancelShotInput;},get inputs(){return inputs;},get emptyInput(){return emptyInput;},get physics(){return physics;},get SERVE(){return SERVE;},get clone(){return clone;},get clamp(){return clamp;},get getServeGeometry(){return getServeGeometry;},get lerp(){return lerp;},get setServeAim(){return setServeAim;},get beginServeToss(){return beginServeToss;},get GRAVITY(){return GRAVITY;},get playerModifier(){return playerModifier;},get steerMovement(){return steerMovement;},get advanceReturnPrediction(){return advanceReturnPrediction;},get strokes(){return strokes;},get level(){return level;},get racketDistance(){return racketDistance;},get SHOT(){return SHOT;},get updateLocomotion(){return updateLocomotion;},get prepareStroke(){return prepareStroke;}};
  const swipeModule=createSwipeModule(swipeEnv);
  const {makeSwipeState,swipeEligible,swipeActive,swipeBallKey,clearSwipeAttempt,swipeBoundary,setControlStyle,cancelSwipeShot,recordSwipeFlight,getSwipeState,queueSwipeShot,swipeMove,swipeIntercept,swipeContactAhead,updateSwipePlayer}=swipeModule;
  // Serve flow lives in sim/serve.ts (createServeModule), reading this closure through live getters.
  const serveEnv={get state(){return state;},get pointIndex(){return pointIndex;},get online(){return online;},get SINGLES_X(){return SINGLES_X;},get serveReceiverDepth(){return serveReceiverDepth;},get swipeBoundary(){return swipeBoundary;},get cancelShotInput(){return cancelShotInput;},get usesNetTactics(){return usesNetTactics;},get makeAITactics(){return makeAITactics;},get planCPUServe(){return planCPUServe;},get serveAnticipation(){return serveAnticipation;},get clamp(){return clamp;},get makeBall(){return makeBall;},get clone(){return clone;},get emit(){return emit;},get swipeActive(){return swipeActive;},get serveDepthOffset(){return serveDepthOffset;},get GRAVITY(){return GRAVITY;},get physics(){return physics;},get isHuman(){return isHuman;},get playTone(){return playTone;},get options(){return options;},get playerProfile(){return playerProfile;},get servePowerFraction(){return servePowerFraction;},get TAU(){return TAU;},get seeded(){return seeded;},get recordSwipeFlight(){return recordSwipeFlight;},get scheduleAIRead(){return scheduleAIRead;},get burstAt(){return burstAt;},get palette(){return palette;},get playHit(){return playHit;},get signalOut(){return signalOut;},get awardPoint(){return awardPoint;}};
  const serveModule=createServeModule(serveEnv);
  const {getServeGeometry,positionPlayersForServe,prepareServe,syncServeStats,serveEvent,serveQuality,setServeAim,getServeFeedback,beginServeToss,beginServeSwing,countServeAttempt,finishServeResult,strikeServe,registerServeFault,replayLet}=serveModule;



  function resetMatch(options = {}) {
    const selections={player:profileSelection(state.player),ai:profileSelection(state.ai),...options.roster};
    const outfits={player:state.player.appearance,ai:state.ai.appearance,...options.appearance};
    state.player=makePlayer('player',0,.77,palette.lime);state.ai=makePlayer('ai',0,-.77,palette.coral);
    for(const side of ['player','ai']){
      assignProfile(state[side],selections[side]);
      state[side].appearance=appearance.normalize(outfits[side],side);
    }
    inputs.player=emptyInput();inputs.ai=emptyInput();
    if(options.eventId)state.eventId=options.eventId;else delete state.eventId;
    swipeAllowed=options.allowSwipe===true&&!online;
    if(swipeAllowed&&!state.eventId)state.swipe=makeSwipeState(options.controlStyle);
    else delete state.swipe;
    state.mode = 'playing';
    state.paused = false;
    state.difficulty = normalizeDifficulty(options.difficulty) || 'beginner';
    state.venue = options.venue || 'hard';
    state.time = 0;
    state.retiringBall = null;
    state.rallyTime = 0;
    state.rallyHits = 0;
    state.stats = { pointsWon: 0, pointsLost: 0, longestRally: 0, fastestShot: 0, serve:makeServeStats() };
    state.serveAttempt=null;state.lastServe=null;state.serveHistory=[];state.serveSequence=0;
    state.tiebreak = false; state.matchWon = false;
    if(options.practice)state.practice={feeds:0,completed:0,smashes:0,perfect:0,misses:0,
      streak:0,bestStreak:0,bestSpeed:0,lastResult:'',currentSmash:false,currentContact:null};
    else delete state.practice;
    state.screenShake = 0;
    state.energy = SHOT.energyMax;
    state.energyRecoveryDelay = 0;
    state.powerDeniedUntil = 0;
    state.player.selectedShot=state.ai.selectedShot='neutral';
    state.score.playerPoints = 0;
    state.score.aiPoints = 0;
    state.score.playerGames = 0;
    state.score.aiGames = 0;
    state.firstServer=options.firstServer || 'player'; state.server=state.firstServer;
    state.tiebreakFirstServer=state.firstServer;
    state.serveNumber = 1;
    state.serveCourt = 'deuce';
    state.pointWinner = null;
    state.lastCall = '';
    state.marks.length = 0;
    state.particles.length = 0;
    resetPlayers();
    state.ball = makeBall();
    if(state.practice)preparePracticeFeed(1);
    else prepareServe();
    selectShot('neutral');
    state.tick=0; state.winner=null;
  }
  function makePlayer(side, x, y, color) {
    return {
      side, id:side==='player'?'p1':'p2', end:side==='player'?1:-1, controller:side==='player'||online?'human':'computer', appearance:appearance.defaults(side), energy:100, energyRecoveryDelay:0, powerDeniedUntil:0, selectedShot:'neutral', stats:{pointsWon:0,pointsLost:0,longestRally:0,fastestShot:0,serve:makeServeStats()}, x, y, color,
      vx: 0, vy: 0,
      swing: 0,
      swingAge: 0,
      serveMotion: 0,
      swingCooldown: 0,
      strokeConnected: false,
      contactFlash: 0,
      queuedShot: 'neutral',
      queuedAim: 0,
      queuedPower: false,
      aimRemaining: 0,
      swingPressAt: null,
      stroke: 'forehand',
      racketSide: 1,
      strokeContactAge: .17,
      strokeContactZ: .5,
      stride: side === 'player' ? 0 : Math.PI,
      moveBlend: 0,
      facing: side === 'player' ? 1 : -1,
      lean: 0,
      splitStep: 0,
      recovery: 0,
      reactionTimer: 0,
      trackingTimer: 0,
      readTarget: {x, y},
      readErrorX: 0,
      readErrorY: 0,
      targetX: x,
      targetY: y
    };
  }

  function makeBall() {
    return {
      x: 0, y: .68, z: .15,
      vx: 0, vy: 0, vz: 0,
      active: false,
      dead: false, settling: false, rolling: false,
      lastHit: null,
      bounceCount: 0,
      crossedNet: false,
      targetX: null,
      targetY: null,
      isServe: false,
      defensiveLob: false,
      highDeepLob: false,
      netTouched: false,
      speedKph: 0,
      trail: []
    };
  }

  function seeded(index) {
    const x = Math.sin(index * 9283.17 + 78.31) * 43758.5453;
    return x - Math.floor(x);
  }

  function makeProState(history=[]) {
    return {history,pressure:0,recoveryLeft:0,recoveryDuration:0,depthHold:0,depth:-.87,
      coverBias:0,anticipationX:0,expectShort:false,lobRetreat:false,turnLeft:0,
      balanceLeft:0,contactX:0,readPressure:0,responseLeft:0,shortChase:null};
  }

  function resetPlayers() {
    delete state.ai.runningSwing;
    state.ai.lobRepeats=0;
    delete state.ai.netShotHistory;
    cancelShotInput(); if(online)cancelShotInput('ai');
    Object.assign(state.player, { x: 0, y: .77, vx: 0, vy: 0, swing: 0, swingAge: 0, serveMotion: 0, swingCooldown: 0, contactFlash: 0, queuedShot: 'neutral', queuedAim: 0, moveBlend: 0, lean: 0, splitStep: 0, recovery: 0, reactionTimer: 0, readErrorX: 0, readErrorY: 0 });
    Object.assign(state.ai, { x: 0, y: -.77, vx: 0, vy: 0, swing: 0, swingAge: 0, serveMotion: 0, swingCooldown: 0, contactFlash: 0, queuedShot: 'neutral', queuedAim: 0, moveBlend: 0, lean: 0, splitStep: 0, recovery: 0, reactionTimer: 0, readErrorX: 0, readErrorY: 0 });
    if(isPro()&&!online)state.ai.pro=makeProState(state.ai.pro?.history);
    else delete state.ai.pro;
  }

  function pointIndex() {
    return state.score.playerPoints + state.score.aiPoints;
  }

  function preparePracticeFeed(delay=.72) {
    if(!state.practice)return;
    swipeBoundary(true);
    state.outFeedback=null;
    cancelShotInput();
    state.phase='practiceFeed';
    state.pointDelay=delay;
    state.rallyTime=0;
    state.rallyHits=0;
    state.practice.currentSmash=false;
    state.practice.currentContact=null;
    resetPlayers();
    Object.assign(state.player,{x:0,y:.66,vx:0,vy:0,targetX:0,targetY:.66});
    Object.assign(state.ai,{x:0,y:-.86,vx:0,vy:0,targetX:0,targetY:-.86,stroke:'forehand'});
    state.ball=makeBall();
    Object.assign(state.ball,{x:.035,y:-.79,z:.34});
    state.message=state.practice.feeds?'NEXT LOB · GET READY':'SMASH PRACTICE · GET READY';
    state.messageTimer=delay;
  }

  function launchPracticeFeed() {
    const drill=state.practice;
    if(!drill)return;
    const lanes=[-.22,.18,0,.27,-.15,.08];
    const depths=[.70,.59,.77,.64,.72,.56];
    const index=drill.feeds%lanes.length;
    const targetX=lanes[index],targetY=depths[index];
    const desiredTime=1.58+(index%3)*.08;
    const ball=makeBall();
    Object.assign(ball,{x:state.ai.x+.035,y:state.ai.y+.08,z:.42});
    const trajectory=physics.solveShot(ball,targetX,targetY,desiredTime,.12);
    Object.assign(ball,trajectory,{active:true,lastHit:'ai',bounceCount:0,crossedNet:false,isServe:false,
      defensiveLob:true,shotType:'lob',stroke:'forehand',targetX,targetY,speedKph:physics.speedKph(trajectory)});
    state.ball=ball;
    state.phase='rally';
    state.rallyHits=1;
    state.lastShotType='lob';
    state.lastStroke='forehand';
    state.lastShotSpeed=ball.speedKph;
    state.ai.swing=.34;state.ai.swingAge=0;state.ai.swingCooldown=.38;state.ai.strokeConnected=true;
    drill.feeds++;
    state.message=`LOB ${drill.feeds} · MOVE UNDER THE BALL`;
    state.messageTimer=.9;
    playHit(.82);
  }

  function finishPracticeAttempt(call='MISS',winner=null) {
    const drill=state.practice;
    if(!drill||state.phase==='practiceResult')return;
    clearSwipeAttempt();
    if(call==='OUT')signalOut();
    drill.completed++;
    const contact=drill.currentContact;
    if(drill.currentSmash&&contact&&winner==='player'){
      drill.smashes++;drill.streak++;drill.bestStreak=Math.max(drill.bestStreak,drill.streak);
      drill.bestSpeed=Math.max(drill.bestSpeed,contact.speedKph);
      if(contact.timing==='PERFECT')drill.perfect++;
      drill.lastResult=`${contact.timing} SMASH · ${contact.speedKph} KM/H`;
    }else{
      drill.misses++;drill.streak=0;
      drill.lastResult=!contact?'MISSED · TRACK THE LOB'
        :!drill.currentSmash?'NOT A SMASH · GET UNDER IT'
        :call==='OUT'?'SMASH OUT · AIM INSIDE THE LINES'
        :call==='NET'?'SMASH NET · CLEAR THE NET':'MISSED · TRY AGAIN';
    }
    state.phase='practiceResult';
    state.pointDelay=1.05;
    physics.releaseBall(state.ball);
    state.message=drill.lastResult || call;
    state.messageTimer=1.05;
  }

  function awardPoint(winner, call) {
    if (state.phase === 'point' || state.mode !== 'playing') return;
    if(state.practice){finishPracticeAttempt(call,winner);return;}
    clearSwipeAttempt();
    const serve=state.serveAttempt;
    if(serve&&!serve.pointCounted&&serve.counted){
      const stats=state[serve.server].stats.serve;serve.pointCounted=true;stats.pointsPlayed++;
      if(winner===serve.server)stats.pointsWon++;
      if(serve.legal&&!serve.result&&winner===serve.server){
        if(!serve.receiverTouched&&['WINNER','POINT — RIVAL'].includes(call)&&state.ball.lastHit===serve.server&&state.ball.bounceCount>=1){
          stats.aces++;stats.unreturned++;call='ACE';finishServeResult('ace');}
        else if(state.rallyHits===2){stats.returnErrors++;stats.unreturned++;finishServeResult('returnError');}
      }
      if(!serve.result)finishServeResult(winner===serve.server?'pointWon':'pointLost');
      state.lastServe=clone(serve);syncServeStats();
    }
    if (call === 'OUT') signalOut();
    state.phase = 'point';
    cancelShotInput(); if(online)cancelShotInput('ai');
    state.pointWinner = winner;
    state.lastCall = call;
    state.pointDelay = 1.65;
    physics.releaseBall(state.ball);
    state.message = call;
    state.messageTimer = 1.55;
    state.screenShake = .15;
    const s = state.score;
    state.stats[winner === 'player' ? 'pointsWon' : 'pointsLost']++;
    state[winner].stats.pointsWon++;state[other(winner)].stats.pointsLost++;
    emit('point',{winner,call});
    if (winner === 'player') s.playerPoints += 1;
    else s.aiPoints += 1;
    playPointSound(winner === 'player');

    resolveScoreAfterPoint(state, winner);
  }
  function servePowerFraction(attempt){return Number.isFinite(attempt?.swipeStrength)?attempt.swipeStrength:(attempt?.power?1:0);}
  function serveDepthOffset(attempt){return Number.isFinite(attempt?.swipeStrength)?0:servePowerFraction(attempt)*SERVE.powerDepthMetres/11.885;}

  function cancelShotInput(side = 'player') {
    const p=state[side];
    p.aimRemaining=0;p.swingPressAt=null;p.queuedPower=false;
  }

  function captureAim(side = 'player') {
    const p=state[side];
    p.queuedAim=aimInput(side);p.queuedShot=depthInput(side);
  }

  function requestPower(side = 'player') {
    if(state[side].queuedShot==='lob')return;
    if(state[side].energy+1e-9>=SHOT.powerCost){state[side].queuedPower=true;state[side].powerDeniedUntil=0;}
    else state[side].powerDeniedUntil=state.time+.8;
  }

  function requestSwing(side = 'player',eventTime=state.time,forcePower=false) {
    if(side==='player'&&swipeActive())return;
    if (state.mode === 'menu') {
      resetMatch();
      return;
    }
    if (state.mode === 'gameover') {
      resetMatch();
      return;
    }
    if (state.mode !== 'playing' || state.paused) return;
    if (state.phase === 'serve' && state.server === side) {
      beginServeToss(side,eventTime);
      return;
    }
    if (state.phase === 'serveToss' && state.server === side) {
      beginServeSwing(side,eventTime,forcePower||directionInput(side).power);
      return;
    }
    const p = state[side];
    // Upgrade the existing backswing, never restart it or change a ball that
    // has already left the racket. Key repeat is filtered at the input edge.
    if(state.phase==='rally' && p.swing>0 && !p.strokeConnected && p.swingPressAt!==null &&
      state.time-p.swingPressAt<=SHOT.doubleTapWindow+1e-9){
      requestPower(side);
      return;
    }
    if (state.phase === 'rally' && p.swingCooldown <= 0) {
      captureAim(side);
      p.queuedPower = false;
      p.swingPressAt = state.time;
      p.aimRemaining = SHOT.aimWindow;
      p.vx=0;p.vy=0;
      // Keep the previous Shift shortcut, subject to the same energy budget.
      if(directionInput(side).power)requestPower(side);
      // A press starts one swing now, even if the ball is too far away.
      // No queued contact, automatic preparation, or held-key repeat.
      p.swing = .4;
      p.swingAge = 0;
      p.swingCooldown = .42;
      p.strokeConnected = false;
      prepareStroke(p, SHOT.contactOpens);
    }
  }

  function prepareStroke(actor,delay) {
    const anticipated=strokes.prepare(actor,state.ball,delay,state.venue);
    actor.stroke=anticipated.kind;
    actor.racketSide=anticipated.racketSide;
    actor.strokeContactAge=delay;
    actor.strokeContactZ=anticipated.height;
  }

  function update(dt) {
    if(!Number.isFinite(dt)||dt<=0||state.paused)return;
    let remaining=dt;
    // Contact and CPU preparation are simulation events, not rounded frames.
    // This is also used by authoritative input replay at fractional timestamps.
    for(let parts=0;parts<8;parts++){
      const a=state.serveAttempt;
      const remote=options.suppressRemoteServePrediction&&a?.server!==(options.predictionSide||'player');
      if(state.phase==='serveToss'&&a&&!remote){
        if(!isHuman(a.server)&&a.swingAt===null&&a.cpuSwingAt<=state.time+1e-9)beginServeSwing(a.server,state.time,a.power);
        if(a.server==='player'&&swipeActive()&&state.swipe.committed?.kind==='serve'&&a.swingAt===null&&
          a.swipeSwingAt<=state.time+1e-9)beginServeSwing('player',state.time,a.swipeStrength>0);
        if(a.swingAt!==null&&a.contactAt<=state.time+1e-9)strikeServe(a.server);
      }
      if(remaining<=1e-9)break;
      let amount=remaining;
      if(swipeActive()&&state.phase==='rally'&&state.swipe.committed?.kind==='rally'){
        const contactAt=state.swipe.committed.contactAt;
        if(Number.isFinite(contactAt)&&contactAt>state.time+1e-9)amount=Math.min(amount,contactAt-state.time);
      }
      if(state.phase==='serveToss'&&a&&!remote){
        const deadline=a.swingAt!==null?a.contactAt:!isHuman(a.server)?a.cpuSwingAt:
          a.server==='player'&&swipeActive()&&state.swipe.committed?.kind==='serve'?a.swipeSwingAt:null;
        if(Number.isFinite(deadline)&&deadline>state.time+1e-9)amount=Math.min(amount,deadline-state.time);
      }
      advanceUpdate(amount);remaining-=amount;
    }
  }
  function advanceUpdate(dt) {
    if (state.mode === 'menu') state.outFeedback = null;
    if (state.paused) return;
    if (state.outFeedback) {
      state.outFeedback.remaining = Math.max(0, state.outFeedback.remaining - dt);
      if (state.outFeedback.remaining <= 0) state.outFeedback = null;
    }
    state.time += dt;
    if (state.retiringBall) {
      physics.advanceLoose(state.retiringBall, dt, state.venue);
      state.retiringBall.fade -= dt;
      if (state.retiringBall.fade <= 0) state.retiringBall = null;
    }
    if (state.ball.dead && !state.ball.active) {
      physics.advanceLoose(state.ball, dt, state.venue, playBounce);
      updateBallTrail(dt);
    }
    if (state.mode !== 'playing') return;
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    state.screenShake = Math.max(0, state.screenShake - dt);
    for (const actor of [state.player,state.ai]) {
      const recoveringTime=Math.max(0,dt-actor.energyRecoveryDelay);
      actor.energyRecoveryDelay=Math.max(0,actor.energyRecoveryDelay-dt);
      actor.energy=Math.min(SHOT.energyMax,actor.energy+recoveringTime*SHOT.recoveryPerSecond);
      if(actor.swing<=0){cancelShotInput(actor.side);delete actor.runningSwing;}
    }
    for (const player of [state.player, state.ai]) {
      if (player.swing > 0) player.swingAge += dt;
      player.swing = Math.max(0, player.swing - dt);
      player.splitStep = Math.max(0, player.splitStep - dt);
      player.recovery = Math.max(0, player.recovery - dt);
    }
    state.player.serveMotion = Math.max(0, state.player.serveMotion - dt);
    state.ai.serveMotion = Math.max(0, state.ai.serveMotion - dt);
    state.player.swingCooldown = Math.max(0, state.player.swingCooldown - dt);
    state.ai.swingCooldown = Math.max(0, state.ai.swingCooldown - dt);
    state.player.contactFlash = Math.max(0, state.player.contactFlash - dt);
    state.ai.contactFlash = Math.max(0, state.ai.contactFlash - dt);

    if(state.player.swing<=0)cancelShotInput();

    updatePlayer(dt);
    if(state.practice){
      updatePractice(dt);
      updateParticles(dt);
      for(const actor of [state.player,state.ai])actor.aimRemaining=Math.max(0,actor.aimRemaining-dt);
      return;
    }
    if (online) updatePlayer(dt,'ai'); else updateAI(dt);
    updateParticles(dt);

    if (state.phase === 'serve') {
      const server = state.server === 'player' ? state.player : state.ai;
      state.ball.x = server.x + (state.server === 'player' ? .035 : -.035);
      state.ball.y = server.y + (state.server === 'player' ? -.04 : .04);
      state.ball.z = .32 + Math.sin(state.time * 3) * .01;
      if (state.server === 'ai' && !online) {
        state.serveDelay -= dt;
        if (state.serveDelay <= 0) beginServeToss('ai');
      }
    } else if (state.phase === 'serveToss') {
      const server = state.server === 'player' ? state.player : state.ai;
      state.ball.x = server.x + (state.server === 'player' ? .035 : -.035);
      state.ball.y = server.y + (state.server === 'player' ? -.04 : .04);
      const attempt=state.serveAttempt,age=Math.max(0,state.time-(attempt?.tossAt??state.time));
      state.ball.z=SERVE.tossStartZ+SERVE.tossVelocity*age-GRAVITY*age*age/2;
      state.ball.vz=SERVE.tossVelocity-GRAVITY*age;
      if(attempt?.swingAt!==null){server.swingAge=Math.max(0,state.time-attempt.swingAt);}
      if (state.ball.z <= .16 && state.ball.vz < 0 && attempt?.swingAt===null &&
        !(options.suppressRemoteServePrediction&&state.server!==(options.predictionSide||'player'))) {
        prepareServe(true);
        state.message = state.server === 'player' ? 'TOSS AGAIN  •  SPACE' : 'RIVAL SERVES';
        state.messageTimer = .8;
      }
    } else if (state.phase === 'rally') {
      state.rallyTime += dt;
      updateBall(dt);
      attemptContact(state.player, dt);
      attemptContact(state.ai, dt);
    } else if (state.phase === 'serveFault') {
      state.serveDelay -= dt;
      if (state.serveDelay <= 0) prepareServe(true);
    } else if (state.phase === 'point') {
      state.pointDelay -= dt;
      if (state.pointDelay <= 0) {
        if (state.matchWon) finishMatch();
        else {
          resetPlayers();
          prepareServe();
        }
      }
    }
    for(const actor of [state.player,state.ai])actor.aimRemaining=Math.max(0,actor.aimRemaining-dt);
  }

  function updatePractice(dt) {
    if(state.phase==='practiceFeed'){
      state.pointDelay-=dt;
      state.ball.x=state.ai.x+.035;state.ball.y=state.ai.y+.08;state.ball.z=.34;
      if(state.pointDelay<=0)launchPracticeFeed();
      return;
    }
    if(state.phase==='rally'){
      state.rallyTime+=dt;
      updateBall(dt);
      attemptContact(state.player, dt);
      return;
    }
    if(state.phase==='practiceResult'){
      state.pointDelay-=dt;
      if(state.pointDelay<=0)preparePracticeFeed();
    }
  }

  function steerMovement(actor, vx, vy, maxSpeed, rate, dt) {
    const movement=playerProfile(actor)?.movement;
    const desiredSpeed=Math.hypot(vx,vy), currentSpeed=Math.hypot(actor.vx,actor.vy);
    const response=movement?(desiredSpeed>0?movement.acceleration:movement.braking):1;
    const blend=Math.min(1,dt*rate*response);
    let dx=(vx-actor.vx)*blend,dy=(vy-actor.vy)*blend;
    if(movement && currentSpeed>maxSpeed*.08 && desiredSpeed>1e-9){
      const opposition=Math.max(0,-(actor.vx*vx+actor.vy*vy)/(currentSpeed*desiredSpeed));
      if(opposition>0){
        // Limit braking into a sharp turn, not the input itself. Full-speed
        // reversals take longer than slow corrections; shallow turns and
        // starts retain ordinary acceleration. No timers or delayed inputs.
        const limit=maxSpeed*rate*.85*movement.braking*dt/opposition;
        const change=Math.hypot(dx,dy);
        if(change>limit){dx*=limit/change;dy*=limit/change;}
      }
    }
    actor.vx+=dx;actor.vy+=dy;
  }

  function updatePlayer(dt, side = 'player') {
    if(side==='player'&&swipeActive()){updateSwipePlayer(dt);return;}
    const p = state[side];
    const direction=directionInput(side),face=side==='player'?1:-1,mx=direction.x*face,my=direction.y*face;
    if(state.phase==='rally' && p.aimRemaining>1e-9 && !p.strokeConnected){
      if(direction.active)captureAim(side); // A brief tap retains its aim on release.
      p.vx=0;p.vy=0;
      updateLocomotion(p,dt);
      return;
    }
    const isServing = (state.phase === 'serve' || state.phase === 'serveToss') && state.server === side;
    if (isServing) {
      p.vx = 0; p.vy = 0;
      const a=state.serveAttempt;
      if(a?.aim&&a.swingAt===null){
        let x=Number.isFinite(direction.serveAimX)?direction.serveAimX:direction.x;
        let y=Number.isFinite(direction.serveAimY)?direction.serveAimY:direction.y;
        const length=Math.max(1,Math.hypot(x,y));
        const scale=direction.serveFine?.35:1;
        setServeAim(side,{x:a.aim.x+x/length*face*SERVE.aimSpeedMetres*dt*scale/5.018,
          y:a.aim.y+y/length*face*SERVE.aimSpeedMetres*dt*scale/11.885});
      }
      updateLocomotion(p, dt);
      return;
    }
    const length = Math.max(1, Math.hypot(mx, my));
    const speed = 1.3 * playerModifier(p,'footwork');
    steerMovement(p,mx/length*speed,my/length*speed,speed,mx||my?13:9,dt);
    p.x = clamp(p.x + p.vx * dt, -1.06, 1.06);
    p.y = side==='player'?clamp(p.y+p.vy*dt,.12,1.22):clamp(p.y+p.vy*dt,-1.22,-.12);
    updateLocomotion(p, dt);
  }

  function racketDistance(actor,ball) {
    if(actor.controller==='computer'&&ball.shotType==='serve')return Math.hypot((ball.x-actor.x)*5.018,(ball.y-actor.y)*11.885)/5.018;
    const depthScale=isPro()&&actor.controller==='computer'&&ball.shotType!=='serve'?1.65:1;
    return Math.hypot((ball.x-actor.x)*1.05,(ball.y-actor.y)*depthScale);
  }

  function updateLocomotion(player, dt) {
    const speed = Math.hypot(player.vx, player.vy);
    const targetBlend = clamp(speed / 1.05, 0, 1);
    player.moveBlend += (targetBlend - player.moveBlend) * Math.min(1, dt * (targetBlend > player.moveBlend ? 12 : 7));
    if (speed > .08) {
      player.stride += dt * (3.5 + speed * 8.4);
      if (Math.abs(player.vx) > .06) player.facing += (Math.sign(player.vx) - player.facing) * Math.min(1, dt * 13);
    }
    const targetLean = clamp(player.vx * .16, -.16, .16);
    player.lean += (targetLean - player.lean) * Math.min(1, dt * 9);
  }

  function attemptContact(player, dt = 1 / 60) {
    if (player.swing <= 0 || player.strokeConnected) return;
    const isHuman = player.controller === 'human';
    const serveReturn=state.ball.shotType==='serve'&&state.ball.lastHit!==player.side;
    const estimatedContact=serveReturn&&!isHuman&&Number.isFinite(player.serveContactAge)?player.serveContactAge:null;
    const contactOpens = estimatedContact!==null?Math.max(.035,estimatedContact-SERVE.returnContactHalfWindow):serveReturn&&!isHuman?SERVE_CPU[state.difficulty].block:isHuman||preparedCPU()?SHOT.contactOpens:.065;
    const contactCloses = estimatedContact!==null?estimatedContact+SERVE.returnContactHalfWindow:isHuman?.4:serveReturn?contactOpens+.14:.29;
    if (player.swingAge < contactOpens || player.swingAge > contactCloses || !state.ball.active) return;
    if (state.ball.lastHit === player.side) return;
    const expectedDirection = player.side === 'player' ? 1 : -1;
    if (Math.sign(state.ball.vy) !== expectedDirection || state.ball.y * expectedDirection <= .015) return;
    const stroke=strokes.select(player,state.ball);
    // A running preparation for a later groundstroke cannot turn into an
    // earlier full overhead while PRO is still retreating under a lob.
    if(!isHuman&&isPro()&&stroke.kind==='smash'&&player.pro?.lobRetreat&&
      (player.runningSwing||player.vy<-.15||Math.hypot(player.vx,player.vy)>.42))return;
    const extension=estimatedContact!==null?.92+.08*clamp(1-Math.abs(player.swingAge-estimatedContact)/SERVE.returnContactHalfWindow,0,1):1;
    const reach = (isHuman ? level().humanReach : serveReturn?SERVE.returnReachMetres/5.018:level().reach)*stroke.reachScale*extension;
    const dx = state.ball.x - player.x;
    const dy = state.ball.y - player.y;
    const contactDistance = racketDistance(player,state.ball);
    if (contactDistance > reach || !stroke.reachable) return;

    // Prefer a balanced PRO groundstroke only while that opportunity remains.
    // Never throw away a legal last-chance pickup just to wait until age .25.
    if (!isHuman && !serveReturn && isPro() && !stroke.kind.endsWith('-volley') &&
        stroke.kind !== 'smash' && player.swingAge < .25 && (contactDistance > reach * .84 || state.ball.z < .14) &&
        proBalancedContactAhead(player, dt)) return;
    const ball = state.ball;
    if (ball.isServe && ball.bounceCount === 0) {
      if(!isHuman)return;
      // A net-cord serve touching the receiver before bouncing is a let.
      if (ball.netTouched) replayLet();
      else awardPoint(state.server, 'SERVE VOLLEY');
      return;
    }
    const cfgError = level().error;
    const randomError = (seeded(Math.floor(state.time * 913)) - .5) * cfgError;
    const swipeShot=player.side==='player'&&swipeActive()&&state.swipe.committed?.kind==='rally'?state.swipe.committed:null;
    let targetX = isHuman
      ? clamp(clamp(player.queuedAim / .72, -1, 1) * .78 * (player.side==='player'?1:-1) + ball.x * .12, -.8, .8) : 0;
    if(swipeShot)targetX=swipeShot.targetX;
    let shotType = player.queuedShot;
    const spatialQuality = clamp(1 - contactDistance / reach, 0, 1);
    const idealContact=serveReturn&&!isHuman?SERVE_CPU[state.difficulty].block:.17;
    const swingQuality = clamp(1 - Math.abs(player.swingAge - idealContact) / .17, 0, 1);
    const quality = clamp(.12 + spatialQuality * .62 + swingQuality * .26, 0, 1);
    if(serveReturn&&!isHuman&&estimatedContact!==null&&serveBalancedContactAhead(player,dt,quality))return;
    if(serveReturn&&state.serveAttempt?.legal){
      state.serveAttempt.receiverTouched=true;state.serveAttempt.returnContactAt=state.time;
    }
    if(state.serveAttempt?.legal&&state.serveAttempt.receiverTouched&&!state.serveAttempt.result&&
      state.rallyHits===2&&player.side===state.serveAttempt.server){
      state[player.side].stats.serve.returnsMade++;finishServeResult('returned');
    }
    const aiPlan = isHuman ? null : aiShotPlan(quality);
    const deliberateLob=isHuman?shotType==='lob':aiPlan?.name==='lob';
    const contactPressure=!isHuman?proContactPressure(player,ball,quality):0;
    const pressure = strokes.defensiveLateness(player.swingAge,stroke.kind);
    // Manual human mishits and the easier CPUs retain their late-contact rule.
    // Swipe preparation keeps the direction selected at gesture release.
    // Strategic CPU recovery lobs instead come from the rally and real chase.
    const contactSeed = Math.floor(state.time*1223)+state.rallyHits*191+457;
    const defensiveLob = !swipeShot && !deliberateLob && (isHuman||!isPro()) && pressure>0 && seeded(contactSeed)<.05;
    if (aiPlan) {
      targetX = aiPlan.x + randomError;
      shotType = aiPlan.shot;
    }
    const fatigue = clamp((state.rallyHits - 4) / 16, 0, 2);
    let aiMiscue = false;
    // A PRO drop uses one skill roll; a second CPU miscue would lower its rate.
    // Online custom builds spend points on touch even under Club match rules.
    const ratedDrop = !swipeShot && (isPro() || online && player.rosterId === 'custom') && shotType === 'short' && !defensiveLob;
    if (!isHuman && !defensiveLob && !deliberateLob && !ratedDrop && state.rallyHits >= 4) {
      // PRO mistakes follow the difficulty of the save, not rally length.
      const errorChance = isLegend()?.006+.030*contactPressure
        :isPro()?.012+.040*contactPressure:level().miscue * (1 + fatigue + (1 - spatialQuality) * .4);
      if (seeded(Math.floor(state.time * 613) + state.rallyHits * 79) < errorChance) {
        aiMiscue = true;
        targetX += Math.sign(targetX) * (.06 + (1 - quality) * .10);
      }
    }
    const powerStrength=swipeShot&&!defensiveLob&&!deliberateLob
      ?Math.min(swipeShot.strength,player.energy/SHOT.powerCost):0;
    const powered = swipeShot?powerStrength>0:
      !defensiveLob && !deliberateLob && isHuman && player.queuedPower && player.energy+1e-9>=SHOT.powerCost;
    const depth = shotType === 'short'
      ? { target: .30, time: lerp(1.08, .98, quality) }
      : shotType === 'deep'
        ? { target: .90, time: lerp(1.17, .86, quality) }
        : { target: .69, time: lerp(1.10, .81, quality) };
    let targetY = (player.side==='player' ? -1 : 1) * depth.target;
    if(aiPlan?.depth!==undefined)targetY=aiPlan.depth;
    if(isPro()&&shotType==='short'&&!defensiveLob){
      // A clean touch lands tighter and dies sooner. Skill still determines
      // legality; a rushed drop gives the defender more time and court.
      targetY=(player.side==='player'?-1:1)*lerp(.31,.23,quality);
      depth.time=lerp(1.06,.88,quality);
    }
    if(swipeShot)targetY=-swipeShot.targetDepth;
    let lobPlan = defensiveLob ? strokes.defensiveLobPlan(ball,targetX,player.side,pressure,
      seeded(contactSeed+211),seeded(contactSeed+419)) : null;
    if(deliberateLob)lobPlan=strokes.highDeepLobPlan(ball,targetX,player.side);
    if (!defensiveLob && isPro() && aiPlan?.name === 'recovery-lob') {
      const strain=aiPlan.lobPressure;
      const apex = Math.max(ball.z + .5, strain===undefined?2.05:lerp(1.95,1.55,strain));
      lobPlan = {targetX, targetY: strain===undefined?.91:lerp(.91,.55,strain),
        time: physics.timeToGround({...ball, vz: Math.sqrt(2 * GRAVITY * (apex - ball.z))})};
    }
    if(lobPlan){targetX=lobPlan.targetX;targetY=lobPlan.targetY;shotType='lob';}
    // A successful drop is a legal ball, not a guaranteed point. Decide once
    // at contact, independently of court depth, for either player/controller.
    const distanceFromNet = Math.abs(player.y);
    const positionError = ratedDrop && seeded(contactSeed+619) >= dropShotSuccess(player) ? 'net'
      : !swipeShot && isPro() && !state.practice && shotType === 'deep' && distanceFromNet <= PRO_POSITION.deepOutWithin ? 'long' : null;
    if(positionError==='long')targetY=Math.sign(targetY)*PRO_POSITION.longTarget;
    if(powered&&!swipeShot){
      const powerTarget=physics.powerTarget(targetX,targetY,quality);
      targetX=powerTarget.x;
      targetY=powerTarget.y;
    }
    // Keep the stated drop success rate even with a wide powered selection.
    if(ratedDrop)targetX=clamp(targetX,-.8,.8);
    const aiPaceRelief = !isHuman ? level().paceRelief + aiPlan.pace : 0;
    const contactZ = ball.z;
    player.stroke=stroke.kind;
    player.racketSide=stroke.racketSide;
    player.strokeContactAge=player.swingAge;
    player.strokeContactZ=contactZ;
    const proAttack=isPro()
      ? strokes.proAttackOpportunity(player,ball,stroke.kind,shotType,spatialQuality) : 0;
    const strokeTime=strokes.flightTime(stroke.kind,ball,targetX,targetY,depth.time,quality,shotType,proAttack);
    player.queuedShot = shotType;
    const swipeClearance=swipeShot&&!lobPlan?lerp(stroke.kind==='smash'||stroke.kind.endsWith('-volley')?.045:.065,.02,powerStrength):undefined;
    launchBallToTarget(ball, targetX, targetY, lobPlan?lobPlan.time:aiPlan?.time??(strokeTime*(swipeShot?1-.22*powerStrength:powered?.78:1) + aiPaceRelief), player.side, false, powered,swipeClearance??aiPlan?.clearance);
    if(swipeShot)ball.swipeStrength=powerStrength;
    if(serveReturn&&!isHuman&&!deliberateLob){
      // Racket pitch has continuous execution uncertainty. This changes launch
      // velocity, never chooses a point outcome; net/line collisions decide it.
      const seed=Math.floor(state.time*619)+state.serveSequence*4099;
      const normal=clamp(Math.sqrt(-2*Math.log(Math.max(.000001,seeded(seed+13))))*Math.cos(TAU*seeded(seed+29)),-3,3);
      const pitch=SERVE_CPU[state.difficulty].returnPitch;
      const angle=normal*pitch*(.10+.35*(1-quality)+.90*(aiPlan?.servePressure||0))*Math.PI/180;
      const horizontal=Math.hypot(ball.vx*5.018,ball.vy*11.885);
      ball.vz+=horizontal*Math.tan(angle)/2.177;
      const actual=physics.landing(ball);ball.targetX=actual.x;ball.targetY=actual.y;
      ball.speedKph=physics.speedKph(ball);state.lastShotSpeed=ball.speedKph;
    }
    if(serveReturn&&state.serveAttempt?.legal){
      const a=state.serveAttempt;
      a.returnQuality=quality;a.returnSpeedKph=ball.speedKph;a.returnPressure=aiPlan?.servePressure??1-quality;
      a.weakReturn=a.returnPressure>=.42||quality<.48;
      state.lastServe=clone(a);syncServeStats();
    }
    if(isPro()&&shotType==='short'&&!defensiveLob)ball.proDrop=quality;
    else delete ball.proDrop;
    ball.defensiveLob=defensiveLob;
    ball.highDeepLob=deliberateLob;
    if (aiMiscue && !positionError) {
      // A mistimed contact can lose lift as well as placement. Let the actual
      // flight hit the net or land out; never award a point by a random roll.
      const netError = seeded(Math.floor(state.time * 997) + state.rallyHits) > .35;
      if (netError) ball.vz *= .60 + quality * .15;
      else ball.vx *= 1.25;
    }
    if (positionError === 'net') {
      // Remove lift after the safe-shot solver. Aim the arc into the mesh,
      // above the ground, so ordinary net collision decides the point later.
      const timeToNet = physics.timeToY(ball,0);
      const crossing = physics.sample(ball,timeToNet);
      ball.vz = (physics.netHeight(crossing.x)*.55-ball.z+GRAVITY*timeToNet*timeToNet/2)/timeToNet;
    }
    if ((aiMiscue && !positionError) || positionError === 'net') {
      const actual = physics.landing(ball);
      ball.targetX = actual.x; ball.targetY = actual.y;
      ball.speedKph = physics.speedKph(ball); state.lastShotSpeed = ball.speedKph;
    }
    if(powered){
      player.energy=Math.max(0,player.energy-SHOT.powerCost*(swipeShot?powerStrength:1));
      player.energyRecoveryDelay=SHOT.recoveryDelay;
    }
    // An older snapshot may predate basic-level tactics. Start its tactical
    // state only when it earns an approach; otherwise retain its replay state.
    if(aiPlan?.net && usesNetTactics() && !player.tactics)player.tactics=makeAITactics();
    if (aiPlan && usesNetTactics() && player.tactics) {
      const tactics = player.tactics;
      tactics.net = !!aiPlan.net && !lobPlan && !aiMiscue && !positionError;
      tactics.repeats = tactics.last === aiPlan.name ? tactics.repeats + 1 : 1;
      tactics.last = aiPlan.name;
      tactics.shots++;
    }
    if(!isHuman)player.lobRepeats=deliberateLob?(player.lobRepeats||0)+1:0;
    if(!isHuman&&!serveReturn&&(state.player.y<.60||player.netShotHistory)){
      const name=deliberateLob?'lob':['pass','feet'].includes(aiPlan?.name)?aiPlan.name:'other';
      player.netShotHistory=[...(player.netShotHistory||[]),name].slice(-5);
      if(player.netShotHistory.every(shot=>shot==='other'))delete player.netShotHistory;
    }
    if(!isHuman&&isPro()){
      recordProContact(contactPressure);
      readProPattern();
    }
    player.strokeConnected = true;
    if(swipeShot)state.swipe.committed=null;
    player.contactFlash = .16;
    player.queuedShot = 'neutral';
    player.queuedAim = 0;
    player.queuedPower = false;
    player.aimRemaining = 0;
    player.swingPressAt = null;
    player.recovery = .3;
    state.rallyHits++;
    if(swipeShot)recordSwipeFlight();
    state.stats.longestRally = Math.max(state.stats.longestRally, state.rallyHits);
    player.stats.fastestShot=Math.max(player.stats.fastestShot,ball.speedKph);
    for(const p of [state.player,state.ai])p.stats.longestRally=Math.max(p.stats.longestRally,state.rallyHits);
    if(player.side==='player')state.stats.fastestShot=player.stats.fastestShot;
    const receiver = player.side==='player' ? state.ai : state.player;
    receiver.splitStep = .22;
    if (isHuman) {
      if (!online) scheduleAIRead();
      selectShot('neutral', player.side);
    }
    state.lastShotType = shotType;
    state.lastStroke = stroke.kind;
    state.lastShotPower = powered;
    state.lastTiming = timingLabel(quality);
    if(state.practice&&isHuman){
      const drill=state.practice;
      drill.currentSmash=stroke.kind==='smash';
      // Contact quality is provisional: only a legal landing earns a smash.
      drill.currentContact={timing:state.lastTiming,speedKph:ball.speedKph};
    }
    if (isHuman) {
      const shotName = defensiveLob?'DEFENSIVE LOB':deliberateLob?'LOB':stroke.kind==='smash'?'SMASH':stroke.kind.endsWith('-volley')
        ? `${shotType==='short'?'DROP ':''}${stroke.racketSide<0?'BACKHAND ':''}VOLLEY`
        : shotType === 'short' ? 'DROP SHOT' : shotType === 'deep' ? 'DEEP BALL' : stroke.kind==='backhand'?'BACKHAND':'DRIVE';
      state.message = `${powered?'POWER · ':''}${shotName}  •  ${state.lastTiming}  ${state.lastShotSpeed} KM/H`;
      state.messageTimer = .55;
    }
    state.screenShake = .07;
    burstAt(ball.x, ball.y, ball.z, player.color, 10);
    playHit(clamp(.72 + state.lastShotSpeed / 220, .84, 1.28));
  }

  function timingLabel(quality) {
    if (quality > .8) return 'PERFECT';
    if (quality > .55) return 'CLEAN';
    if (quality > .32) return 'SAFE';
    return 'REACHING';
  }

  function shotTrajectory(ball, targetX, targetY, desiredTime, actor, isServe, powered=false,clearanceOverride) {
    const attacking=actor.stroke==='smash'||actor.stroke.endsWith('-volley');
    const clearance=clearanceOverride??(isServe ? .035 : powered ? .02 : attacking ? .045 : .065);
    let trajectory = physics.solveShot(ball, targetX, targetY, desiredTime, clearance);
    // Keep defensive safety arcs intact. Other shots ask the existing solver
    // for their profile's pace, retaining its normal net-clearance limits.
    if(isServe || actor.queuedShot!=='lob'){
      const stat=isServe||actor.stroke==='smash'?'serve':actor.stroke.startsWith('backhand')?'backhand':'forehand';
      const profile=playerProfile(actor);
      const ratedServe=isServe && profile && profile.id!=='classic';
      // Find a common safe ceiling first: boosting each rating directly into
      // the net-clearance limit otherwise erases the difference between them.
      const pace=ratedServe?1.1:playerModifier(actor,stat);
      if(pace!==1){
        const requested=Math.max(.28,trajectory.flightTime/pace);
        if(pace<1)trajectory=physics.solveShot(ball,targetX,targetY,requested,clearance);
        else {
          // Its coarse search can otherwise make a stronger shot slower.
          // Refine only the optional profile arc, always inside the original
          // safe flight time. Use a common safety floor for all ratings so
          // stronger profiles never lose pace to search rounding.
          let low=.28,high=trajectory.flightTime;
          for(let i=0;i<9;i++){
            const time=(low+high)/2;
            const candidate=physics.solveShot(ball,targetX,targetY,time,clearance);
            if(candidate.flightTime<=time+1e-9)high=time;
            else low=time;
          }
          trajectory=physics.solveShot(ball,targetX,targetY,Math.max(requested,high),clearance);
        }
      }
      if(ratedServe){
        // Rating 10 retains its existing fastest safe flight. Each point below
        // it adds 5% of that flight time, also for custom and tournament players.
        const flightTime=trajectory.flightTime*(1+.05*(10-profile.ratings.serve));
        trajectory=physics.solveShot(ball,targetX,targetY,flightTime,clearance);
      }
    }
    return trajectory;
  }

  function launchBallToTarget(ball, targetX, targetY, desiredTime, side, isServe, powered=false,clearanceOverride) {
    delete ball.swipeStrength;
    const actor=side==='player'?state.player:state.ai;
    const trajectory=shotTrajectory(ball,targetX,targetY,desiredTime,actor,isServe,powered,clearanceOverride);
    Object.assign(ball, { vx: trajectory.vx, vy: trajectory.vy, vz: trajectory.vz });
    ball.active = true;
    ball.dead = false;ball.settling = false;ball.rolling = false;
    ball.lastHit = side;
    ball.bounceCount = 0;
    ball.crossedNet = false;
    ball.isServe = isServe;
    ball.defensiveLob = false;
    ball.highDeepLob = false;
    ball.netTouched = false;
    ball.powered = powered;
    ball.stroke = isServe?'serve':actor.stroke;
    if(isServe)state.lastStroke='serve';
    ball.targetX = targetX;
    ball.targetY = targetY;
    ball.shotType = isServe ? 'serve' : (side === 'player' ? state.player : state.ai).queuedShot;
    ball.speedKph = physics.speedKph(ball);
    state.lastShotSpeed = ball.speedKph;
    return trajectory.flightTime;
  }

  function isServeLandingValid(ball) {
    return physics.inServiceBox(ball, state.server, ball.serveOriginX);
  }

  function updateBall(dt) {
    const ball = state.ball;
    if (!ball.active) return;
    physics.advance(ball, dt, state.venue, handleBallEvent);
    updateBallTrail(dt);

    if (ball.active && (Math.abs(ball.y) > 1.65 || Math.abs(ball.x) > 1.5)) {
      finishEscapedBall(ball);
    }
  }

  function finishEscapedBall(ball) {
    // A serve remains a service attempt until its first legal bounce. Leaving
    // the playing area or hitting a board must not skip the second serve.
    if (ball.isServe) registerServeFault('FAULT');
    else if (ball.bounceCount > 0) awardPoint(ball.lastHit, 'WINNER');
    else awardPoint(other(ball.lastHit), 'OUT');
  }

  function updateBallTrail(dt) {
    const ball = state.ball;
    for (const t of ball.trail) t.life -= dt;
    ball.trail = ball.trail.filter(t => t.life > 0);
    if (ball.active || ball.settling && !ball.rolling) ball.trail.push({ x: ball.x, y: ball.y, z: ball.z, life: .22 });
    if (ball.trail.length > 12) ball.trail.shift();
  }

  function signalOut() {
    // Keep the line call visible even when scoring replaces lastCall with GAME.
    state.outFeedback = { remaining: 1.3, duration: 1.3 };
  }

  function handleBallEvent(event, ball) {
    if(event==='board'){
      playTone(105,.07,'triangle',.025);
      finishEscapedBall(ball);
    } else if (event === 'net') {
      physics.deflectNet(ball);
      playTone(105, .075, 'triangle', .025);
      burstAt(ball.x, 0, ball.z, '#e8ffff', 7);
      if (ball.isServe) registerServeFault('FAULT — NET');
      else awardPoint(ball.lastHit === 'player' ? 'ai' : 'player', 'NET');
    } else if (event === 'tape') {
      burstAt(ball.x, 0, ball.z, '#e8ffff', 3);
    } else if (event === 'bounce') {
      const inBounds = physics.inSingles(ball, ball.lastHit);
      state.marks.push({ x: ball.x, y: ball.y, life: 4 });
      if (state.marks.length > 8) state.marks.shift();
      burstAt(ball.x, ball.y, 0, currentVenue().particle, state.venue === 'clay' ? 8 : 5);
      playBounce();
      if (ball.bounceCount === 1) {
        if (ball.isServe) {
          if(state.serveAttempt)state.serveAttempt.actual={x:ball.x,y:ball.y};
          if (!isServeLandingValid(ball)) {
            registerServeFault('FAULT');
            return;
          }
          if (ball.netTouched) {
            replayLet();
            return;
          }
          ball.isServe = false;
          const a=state.serveAttempt;
          if(a){a.legal=true;state[a.server].stats.serve[a.number===1?'firstIn':'secondIn']++;
            if(a.power)state[a.server].stats.serve.powerIn++;
            const stats=state[a.server].stats.serve;stats.speedTotal+=a.launchSpeedKph;stats.speedCount++;
            stats.fastest=Math.max(stats.fastest,a.launchSpeedKph);
            stats[a.number===1?'firstSpeedTotal':'secondSpeedTotal']+=a.launchSpeedKph;stats[a.number===1?'firstSpeedCount':'secondSpeedCount']++;
            state.lastServe=clone(a);syncServeStats();serveEvent('bounce');}
          state.message = `SERVE IN  •  ${ball.speedKph} KM/H`;
          state.messageTimer = .42;
        } else if (!inBounds) {
          awardPoint(ball.lastHit === 'player' ? 'ai' : 'player', 'OUT');
          return;
        } else if(state.serveAttempt?.legal&&state.serveAttempt.receiverTouched&&!state.serveAttempt.result&&
          ball.lastHit!==state.serveAttempt.server&&state.rallyHits===2){
          state[state.serveAttempt.server].stats.serve.returnsMade++;finishServeResult('returned');
        }
        if (state.practice && ball.lastHit === 'player') {
          finishPracticeAttempt('IN', 'player');
          return;
        }
      }
      if (ball.bounceCount >= 2) {
        awardPoint(ball.lastHit, ball.lastHit === 'player' ? 'WINNER' : 'POINT — RIVAL');
        return;
      }
    }

  }

  function burstAt(x, y, z, color, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x, y, z,
        vx: (seeded(i + state.time * 1000) - .5) * .55,
        vy: (seeded(i + 88 + state.time * 900) - .5) * .45,
        vz: .35 + seeded(i + 140) * .75,
        life: .28 + seeded(i + 260) * .26,
        maxLife: .54,
        color
      });
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= 1.8 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
    for (const mark of state.marks) mark.life -= dt;
    state.marks = state.marks.filter(mark => mark.life > 0);
  }

  // Legacy aliases keep the existing offline UI and test surface compatible.
  for(const key of ['energy','energyRecoveryDelay','powerDeniedUntil'])Object.defineProperty(state,key,{enumerable:true,configurable:true,get(){return state.player[key];},set(v){state.player[key]=v;}});
  function applyInput(side,input){
    if(!['player','ai'].includes(side))return;
    const axis=value=>Number.isFinite(value)?clamp(value,-1,1):0;
    inputs[side]={x:axis(input.x),y:axis(input.y),vertical:!!input.vertical,active:!!(input.x||input.y||input.vertical),power:!!input.power};
    if(Number.isFinite(input.serveAimX))inputs[side].serveAimX=axis(input.serveAimX);
    if(Number.isFinite(input.serveAimY))inputs[side].serveAimY=axis(input.serveAimY);
    inputs[side].serveFine=!!input.serveFine;
    if(isPro()&&Number.isFinite(input.aimX))inputs[side].aimX=clamp(input.aimX,-1,1);
    if(input.shot)selectShot(input.shot,side);
    if(input.swing)requestSwing(side,input.eventTime,!!input.forcePower);
  }
  function restore(snapshot){
    state.outFeedback = null;
    for(const [key,value] of Object.entries(clone(snapshot)))if(!['energy','energyRecoveryDelay','powerDeniedUntil'].includes(key))state[key]=value;
    state.difficulty=normalizeDifficulty(state.difficulty);
    state.serveHistory=state.serveHistory||[];state.serveSequence=state.serveSequence||0;
    if(!Object.hasOwn(snapshot,'serveAttempt'))state.serveAttempt=null;
    if(!Object.hasOwn(snapshot,'lastServe'))state.lastServe=null;
    if(!Object.hasOwn(snapshot,'eventId'))delete state.eventId;
    if(!swipeEligible()){
      delete state.swipe;
      for(const attempt of [state.serveAttempt,state.lastServe])if(attempt){delete attempt.swipeStrength;delete attempt.swipeSwingAt;}
    }
    else if(!snapshot.swipe)state.swipe=makeSwipeState('classic');
    // Preserve an in-flight saved match while upgrading its versioned names.
    // Old PRO saves without the strategic state start with balanced recovery.
    for(const actor of [state.player,state.ai]){
      if(isPro()&&!online&&actor.controller==='computer')actor.pro=actor.pro||actor.pro2||makeProState();
      else delete actor.pro;
      delete actor.pro2;
    }
    for(const ball of [state.ball,state.retiringBall])if(ball){
      if(isPro()&&ball.pro2Drop!==undefined)ball.proDrop=ball.pro2Drop;
      delete ball.pro2Drop;
    }
    for(const side of ['player','ai']){
      assignProfile(state[side],profileSelection(state[side]));
      // Old saved/online snapshots may contain the retired movement boost.
      const actor=state[side];
      actor.stats.serve={...makeServeStats(),...actor.stats.serve};
      if(actor.slideRemaining>0){
        const scale=Math.min(1,1.3*playerModifier(actor,'footwork')/Math.max(.001,Math.hypot(actor.vx,actor.vy)));
        actor.vx*=scale;actor.vy*=scale;
      }
      for(const key of ['slideRemaining','slideCooldown','slideX','slideY','slideSpeed','directionTap','directionTapTime'])delete actor[key];
      state[side].appearance=appearance.normalize(state[side].appearance,side);
    }
    inputs.player=emptyInput();inputs.ai=emptyInput();
    syncServeStats();
  }
  resetMatch(options); initialized=true;
  return {...(options.exposeInternals?{__fn:{...aiModule,...swipeModule},__aiEnv:aiEnv}:{}),state,SHOT,SERVE,capabilities,resetMatch,applyInput,selectShot,setServeAim,getServeFeedback,serveQuality,
setControlStyle,queueSwipeShot,cancelSwipeShot,getSwipeState,
snapshot:()=>clone(state),restore,step(dt=1/60){state.tick++;update(dt);},
level,makePlayer,makeBall,seeded,resetPlayers,pointIndex,getServeGeometry,positionPlayersForServe,prepareServe,preparePracticeFeed,launchPracticeFeed,finishPracticeAttempt,beginServeToss,strikeServe,registerServeFault,replayLet,pointLabel,awardPoint,cancelShotInput,captureAim,requestPower,requestSwing,prepareStroke,update,updatePractice,updatePlayer,contactTarget,scheduleAIRead,aiRecoveryTarget,updateAI,updateLocomotion,chooseAIShot,aiShotPlan,attemptContact,timingLabel,launchBallToTarget,isServeLandingValid,updateBall,updateBallTrail,handleBallEvent,burstAt,updateParticles,finishMatch};
}
return {create,SHOT,SERVE,SERVE_CPU,capabilities,other,view};

function view(snapshot,side){
  const s=clone(snapshot);
  for(const side of ['player','ai']){
    const actor=s[side];assignProfile(actor,profileSelection(actor));
    actor.appearance=appearance.normalize(actor.appearance,side);
  }
  if(side==='ai'){
    const swap=v=>v==='player'?'ai':v==='ai'?'player':v;
    const rotate=o=>{if(!o)return;for(const key of ['x','y','vx','vy','targetX','targetY','serveOriginX','facing','lean'])if(typeof o[key]==='number')o[key]=o[key]===0?0:-o[key];};
    [s.player,s.ai]=[s.ai,s.player];
    for(const p of [s.player,s.ai]){rotate(p);rotate(p.readTarget);p.side=swap(p.side);p.end*=-1;}
    for(const b of [s.ball,s.retiringBall]){rotate(b);if(b){b.lastHit=swap(b.lastHit);b.trail?.forEach(rotate);}}
    for(const attempt of [s.serveAttempt,s.lastServe])if(attempt){
      attempt.server=swap(attempt.server);if(attempt.pointWinner)attempt.pointWinner=swap(attempt.pointWinner);
      for(const key of ['aim','lockedAim','expected','actual'])rotate(attempt[key]);
    }
    for(const entry of s.serveHistory||[]){entry.server=swap(entry.server);rotate(entry.actual);}
    for(const actor of [s.player,s.ai])if(actor.serveRead){
      const read=actor.serveRead;rotate(read.previous);rotate(read.observed);rotate(read.intercept);
      for(const key of ['errorX','errorY'])if(typeof read[key]==='number')read[key]=read[key]===0?0:-read[key];
      if(read.observed)read.observed.lastHit=swap(read.observed.lastHit);
    }
    s.marks.forEach(rotate);s.particles.forEach(rotate);
    for(const key of ['server','firstServer','tiebreakFirstServer','pointWinner','winner'])s[key]=swap(s[key]);
    for(const key of ['message','lastCall'])s[key]=s[key].replace(/\b(YOUR|YOU|RIVAL)\b/g,word=>({YOUR:'RIVAL',YOU:'RIVAL',RIVAL:'YOU'}[word]));
    const q=s.score;s.score={playerGames:q.aiGames,aiGames:q.playerGames,playerPoints:q.aiPoints,aiPoints:q.playerPoints};

  }
  s.energy=s.player.energy;s.energyRecoveryDelay=s.player.energyRecoveryDelay;s.powerDeniedUntil=s.player.powerDeniedUntil;s.stats=clone(s.player.stats);
  return s;
}
}
