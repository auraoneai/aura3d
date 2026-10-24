/* Shared tennis simulation. No DOM, clocks, network, or rendering dependencies. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./physics.js'),require('./strokes.js'),require('./player-roster.js'),require('./player-appearance.js'));
  else root.TennisEngine=factory(root.TennisPhysics,root.TennisStrokes,root.TennisRoster,root.TennisAppearance);
})(typeof window==='undefined'?globalThis:window,function(physics,strokes,roster,appearance){
'use strict';
const SHOT=Object.freeze({aimWindow:.18,contactOpens:.16,doubleTapWindow:.22,energyMax:100,powerCost:38,recoveryPerSecond:6,recoveryDelay:1});
// Original toss geometry; keep its exact apex tied to the physical constants.
const TOSS_START_Z=.32,TOSS_VELOCITY=2.6;
const TOSS_APEX_Z=TOSS_START_Z+TOSS_VELOCITY**2/(2*physics.GRAVITY);
const SERVE=Object.freeze({version:1,windup:.24,doubleTapWindow:.22,tossStartZ:TOSS_START_Z,apexZ:TOSS_APEX_Z,
  apexHeightMetres:TOSS_APEX_Z*2.177,tossVelocity:TOSS_VELOCITY,
  aimSpeedMetres:5,minimumDepth:0,defaultDepth:.46,powerDepthMetres:.50,powerKph:20,
  timingWindow:.25,secondPace:.88,firstClearanceMetres:.08,secondClearanceMetres:.16,
  errorWidthMetres:2.8,errorDepthMetres:4.5,returnReachMetres:.255*5.018,returnContactHalfWindow:.035});
const capabilities=Object.freeze({serveTargeting:1,serveWindup:1,serveStatistics:1,intentionalLobAllLevels:true,swipeControls:1});
const SERVE_CPU=Object.freeze({
  beginner:{runSpeedMetres:5.9,reaction:[.08,.14],observe:.10,error:.30,bias:0,history:0,block:.14,returnSD:.024,returnPitch:6,pace:.85,power:.10,margin:[.45,.70],secondMargin:1,firstSD:.095,secondSD:.065},
  club:{runSpeedMetres:6.1,reaction:[.08,.135],observe:.08,error:.20,bias:.15,history:0,block:.12,returnSD:.023,returnPitch:3,pace:.92,power:.25,margin:[.35,.60],secondMargin:.9,firstSD:.085,secondSD:.060},
  ace:{runSpeedMetres:6.3,reaction:[.075,.125],observe:.06,error:.12,bias:.30,history:4,block:.10,returnSD:.022,returnPitch:1.2,pace:.95,power:.45,margin:[.20,.45],secondMargin:.8,firstSD:.070,secondSD:.056},
  pro:{runSpeedMetres:6.3,reaction:[.075,.125],observe:.06,error:.12,bias:.30,history:4,block:.10,returnSD:.022,returnPitch:1.2,pace:.95,power:.45,margin:[.20,.45],secondMargin:.8,firstSD:.070,secondSD:.056},
  legend:{runSpeedMetres:6.4,reaction:[.07,.115],observe:.04,error:.08,bias:.45,history:10,block:.08,returnSD:.020,returnPitch:1.1,pace:.97,power:.60,margin:[.15,.40],secondMargin:.75,firstSD:.060,secondSD:.056}
});
const makeServeStats=()=>({attempts:0,firstAttempts:0,firstIn:0,secondAttempts:0,secondIn:0,faults:0,doubleFaults:0,
  lets:0,aces:0,unreturned:0,returnsMade:0,returnErrors:0,weakReturns:0,pointsPlayed:0,pointsWon:0,
  speedTotal:0,speedCount:0,fastest:0,powerAttempts:0,powerIn:0,
  firstSpeedTotal:0,firstSpeedCount:0,secondSpeedTotal:0,secondSpeedCount:0});
// Distance from net in court units (baseline = 1). Leave a safe middle zone.
const PRO_POSITION=Object.freeze({deepOutWithin:.40,longTarget:1.10});
const SERVE_RETURN={
  beginner:{width:.28,depth:.79,speed:16.5,clearance:.11,comfortKph:90,attackKph:105},
  club:{width:.34,depth:.82,speed:18.5,clearance:.095,comfortKph:100,attackKph:115},
  ace:{width:.43,depth:.85,speed:20,clearance:.085,comfortKph:108,attackKph:122},
  pro:{width:.46,depth:.86,speed:20.5,clearance:.08,comfortKph:110,attackKph:125},
  legend:{width:.50,depth:.89,speed:22,clearance:.075,comfortKph:115,attackKph:130}
};
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
// Preferences change choices among legal opportunities, never execution. An
// approach has no extra style multiplier: netPreference already owns that taste.
const CPU_STYLES=Object.freeze(Object.fromEntries(Object.entries({
  'baseline-pressure':{patterns:[.65,.85],crosscourt:1.10,'open-court':1.32,'wrong-foot':1.15,'change-pace':.82,drop:.62},
  'net-attacker':{patterns:[.20,.90],crosscourt:.82,'open-court':1.04,'change-pace':.90,drop:.60,'volley-finish':1.4},
  counterpuncher:{patterns:[.70,.85],crosscourt:1.60,'open-court':.72,'wrong-foot':.85,'change-pace':1.06,drop:.55},
  'all-court':{patterns:[.25,.65],crosscourt:.90,'open-court':.92,'change-pace':1.20,drop:1.10,'volley-finish':1.10}
}).map(([name,values])=>[name,Object.freeze({...values,patterns:Object.freeze(values.patterns)})])));
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
  const netPreference = () => playerProfile(state.ai)?.netPreference || 1;
  const cpuStyle = () => usesNetTactics() && state.ai.controller==='computer'
    ? CPU_STYLES[playerProfile(state.ai)?.cpuStyle] : undefined;

  function personalityWeight(name) {
    const style=cpuStyle();
    if(!style || name==='approach')return 1;
    let weight=style[name]||1;
    const t=state.ai.tactics,p=state.player;
    const exposed=Math.abs(p.x+p.vx*.16)>.40;
    // Patient construction gives way to a visible opening. Completed shots
    // supply continuity; no timer, pending human input or unsaved memory is used.
    if(style===CPU_STYLES.counterpuncher&&exposed&&['open-court','wrong-foot'].includes(name))
      weight=1.15;
    if(t?.last==='crosscourt'&&exposed&&name==='open-court')weight*=1.12;
    if(t?.last==='open-court'&&p.y>.90&&name==='drop')weight*=1.10;
    return weight;
  }

  function makeAITactics() {
    const point = state.stats.pointsWon + state.stats.pointsLost;
    const draw = seeded(point * 193 + Math.floor(state.time * 101) + 83);
    const style=cpuStyle();
    const index=style?(draw<style.patterns[0]?0:draw<style.patterns[1]?1:2):Math.floor(draw*3);
    return {pattern: ['pressure', 'all-court', 'change-up'][index],
      net: false, shots: 0, last: null, repeats: 0};
  }

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

  function getServeGeometry(side = state.server) {
    const courtSign = pointIndex() % 2 === 0 ? 1 : -1;
    const serverX = (side === 'player' ? 1 : -1) * courtSign * .38;
    const targetSign = -Math.sign(serverX);
    return {
      serverX,
      receiverX: targetSign * (!online&&state.server==='player'?.56:.50),
      targetSign,
      targetY: side === 'player' ? -SERVE.defaultDepth : SERVE.defaultDepth,
      minX: targetSign < 0 ? -SINGLES_X : 0,
      maxX: targetSign < 0 ? 0 : SINGLES_X
    };
  }

  function positionPlayersForServe() {
    const geometry = getServeGeometry();
    const server = state.server === 'player' ? state.player : state.ai;
    const receiver = state.server === 'player' ? state.ai : state.player;
    server.x = geometry.serverX;
    server.y = state.server === 'player' ? 1.035 : -1.035;
    receiver.x = geometry.receiverX;
    receiver.y = state.server === 'player' ? (online?-.86:-serveReceiverDepth()) : .86;
    for (const player of [state.player, state.ai]) {
      player.vx = 0;
      player.vy = 0;
      player.targetX = player.x;
      player.targetY = player.y;
    }
  }

  function prepareServe(keepServeNumber = false) {
    swipeBoundary(!keepServeNumber);
    state.outFeedback = null;
    if (state.ball.dead) state.retiringBall = { ...state.ball, fade: .7 };
    cancelShotInput(); if(online)cancelShotInput('ai');
    if (!keepServeNumber) {
      state.serveNumber = 1;
      state.ai.lobRepeats=0;
      delete state.ai.netShotHistory;
      if (usesNetTactics()) state.ai.tactics = makeAITactics();
      else delete state.ai.tactics;
    }
    state.serveCourt = pointIndex() % 2 === 0 ? 'deuce' : 'ad';
    state.phase = 'serve';
    state.rallyTime = 0;
    state.rallyHits = 0;
    for (const actor of [state.player, state.ai]) {
      actor.swing = 0; actor.swingAge = 0; actor.swingCooldown = 0; actor.strokeConnected = false;
    }
    state.pointDelay = 0;
    state.serveDelay = state.server === 'ai' ? .85 : 0;
    state.pointWinner = null;
    state.lastShotType = 'none';
    state.lastStroke = 'none';
    state.lastShotSpeed = 0;
    state.lastTiming = '';
    state.lastShotPower = false;
    positionPlayersForServe();
    const geometry=getServeGeometry();
    const previous=keepServeNumber&&state.serveAttempt?.server===state.server&&state.serveAttempt.number===state.serveNumber?state.serveAttempt.aim:null;
    const aim=previous?{...previous}:{x:geometry.targetSign*.41,y:geometry.targetY};
    state.serveAttempt={id:++state.serveSequence,server:state.server,number:state.serveNumber,aim,lockedAim:null,
      expected:null,actual:null,tossAt:null,swingAt:null,contactAt:null,power:false,quality:null,
      launchSpeedKph:0,legal:false,receiverTouched:false,result:null,errorSeed:state.serveSequence*104729+Math.floor(state.time*1000),
      counted:false,recorded:false};
    delete state.ai.serveRead;
    delete state.ai.serveContactAge;
    if(!online&&state.server==='ai')planCPUServe();
    if(!online&&state.server==='player'){
      const bias=serveAnticipation(geometry);
      state.ai.x=clamp(geometry.receiverX+bias,-.9,.9);
      state.ai.targetX=state.ai.x;state.ai.targetY=state.ai.y;
    }
    const serveLabel = state.serveNumber === 2 ? 'SECOND SERVE' : (state.server === 'player' ? 'YOUR SERVE' : 'RIVAL SERVES');
    state.message = serveLabel;
    state.messageTimer = 1.2;
    state.ball = makeBall();
    state.ball.x = state.server === 'player' ? state.player.x + .035 : state.ai.x - .035;
    state.ball.y = state.server === 'player' ? state.player.y - .04 : state.ai.y + .04;
    state.ball.z = .32;
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

  function syncServeStats(){state.stats.serve=clone(state.player.stats.serve);}
  function serveEvent(stage){
    const a=state.serveAttempt;if(a)emit('serve',{id:a.id,server:a.server,stage,attempt:clone(a)});
  }
  function serveQuality(ball=state.ball){
    const gap=Math.max(0,(SERVE.apexZ-ball.z)*2.177);
    if(gap<1e-10)return 1;
    return clamp(1-Math.sqrt(2*gap/9.81)/SERVE.timingWindow,0,1);
  }
  function setServeAim(side,point){
    const a=state.serveAttempt;
    if(side==='player'&&swipeActive()&&state.swipe.committed?.kind==='serve')return false;
    if(!a||a.server!==side||a.swingAt!==null||!['serve','serveToss'].includes(state.phase)||
      !Number.isFinite(point?.x)||!Number.isFinite(point?.y))return false;
    const geometry=getServeGeometry(side),end=side==='player'?-1:1;
    a.aim={x:clamp(point.x,geometry.minX,geometry.maxX),y:end*clamp(point.y*end,0,.52)};
    a.expected={x:a.aim.x,y:a.aim.y+end*serveDepthOffset(a)};
    return true;
  }
  function getServeFeedback(inputHorizon=0){
    const a=state.serveAttempt,b=state.ball;
    const point=a?.lockedAim||a?.aim;
    const canAim=!!a&&a.swingAt===null&&['serve','serveToss'].includes(state.phase);
    let swingCue=null,swingQuality=null;
    if(canAim&&state.phase==='serveToss'&&Number.isFinite(a.tossAt)){
      const contactOffset=state.time+SERVE.windup-a.tossAt-SERVE.tossVelocity/GRAVITY;
      swingQuality=clamp(1-Math.abs(contactOffset)/SERVE.timingWindow,0,1);
      // CLEAN is strictly above .60 at contact. Leave the exact boundary out
      // of READY too, so the cue cannot promise CLEAN and produce EARLY/LATE.
      const cleanOffset=SERVE.timingWindow*.40;
      // The renderer may still show this cue while a fractional-tick input
      // arrives. It supplies that frame's actual input-time horizon so the
      // final READY frame remains clean throughout its displayed interval.
      const horizon=Number.isFinite(inputHorizon)?clamp(inputHorizon,0,.05):0;
      swingCue=contactOffset+horizon>=cleanOffset-1e-9?'late':contactOffset<=-cleanOffset+1e-9?'wait':'ready';
    }
    const planning=!!point&&['serve','serveToss'].includes(state.phase);
    const expectedY=point?point.y+(a.server==='player'?-1:1)*serveDepthOffset(a):0;
    const netRisk=planning?physics.serveTargetNetRisk({...b,z:SERVE.apexZ},point.x,expectedY,
      a.number===2?SERVE.secondClearanceMetres:SERVE.firstClearanceMetres):!!a?.netRisk;
    // The input circle meets the rising ball when starting a swing will put
    // racket contact at the apex. Hide it after commitment or the last useful
    // input time, so its later descending crossing never invites another hit.
    const pressZ=SERVE.apexZ-GRAVITY*SERVE.windup**2/2;
    const showPressCue=swingCue==='wait'||swingCue==='ready';
    return {attempt:a,dotZ:SERVE.apexZ,leadZ:pressZ,pressZ,showPressCue,
      quality:state.phase==='serveToss'?serveQuality():a?.quality,
      canAim,swingCue,swingQuality,netRisk,
      powerLongRisk:!!point&&Math.abs(point.y)+(Number.isFinite(a.swipeStrength)?0:SERVE.powerDepthMetres/11.885)>physics.LINE_BOUNDS.serviceY};
  }
  function serveAnticipation(geometry){
    const cfg=SERVE_CPU[state.difficulty];
    if(!cfg||!cfg.bias)return 0;
    const recent=state.serveHistory.filter(h=>h.server==='player'&&h.court===state.serveCourt&&h.legal).slice(-cfg.history);
    if(cfg.history&&recent.length>=2){
      const wide=recent.filter(h=>Math.abs(h.actual.x)>.55).length/recent.length;
      const tee=recent.filter(h=>Math.abs(h.actual.x)<.25).length/recent.length;
      return geometry.targetSign*(wide>=.6?1:tee>=.6?-1:0)*cfg.bias/5.018;
    }
    // The visible server stance is the only pre-contact evidence at Club.
    return clamp((state.player.x-geometry.serverX)*.25,-cfg.bias/5.018,cfg.bias/5.018);
  }
  function serveReceiverDepth(){return .86;}
  function planCPUServe(){
    const a=state.serveAttempt,cfg=SERVE_CPU[state.difficulty],geometry=getServeGeometry('ai');
    const draw=k=>seeded(a.errorSeed+k),second=a.number===2;
    const rating=playerProfile(state.ai)?.ratings.serve||6;
    a.power=!second&&draw(13)<cfg.power*(.8+.05*(rating-6));
    const margin=second?cfg.secondMargin:lerp(cfg.margin[0],cfg.margin[1],draw(23));
    const receiver=state.player.x,center=geometry.targetSign*.41;
    const choice=draw(31),open=receiver>=center?-1:1;
    let x=choice<.28?clamp(receiver,geometry.minX+.12,geometry.maxX-.12)
      :choice<.82?(open<0?geometry.minX+margin/5.018:geometry.maxX-margin/5.018)
      :(open<0?geometry.maxX-margin/5.018:geometry.minX+margin/5.018);
    const expectedDepth=.52-margin/11.885;
    a.aim={x:clamp(x,geometry.minX,geometry.maxX),y:Math.max(0,expectedDepth-(a.power?SERVE.powerDepthMetres/11.885:0))};
    const gaussian=Math.sqrt(-2*Math.log(Math.max(.000001,draw(47))))*Math.cos(TAU*draw(59));
    const sd=(second?cfg.secondSD:cfg.firstSD*1.18)*(1+.06*(10-rating));
    a.cpuTimingOffset=clamp(gaussian*sd,-SERVE.timingWindow,SERVE.timingWindow);
    a.cpuPace=cfg.pace*(second?.95:1);
  }
  function beginServeToss(side,eventTime=state.time) {
    if(state.phase!=='serve'||side!==state.server)return;
    if(state.swipe)state.swipe.pointStarted=true;
    const ball=state.ball,actor=state[side],a=state.serveAttempt;
    if(a.number!==state.serveNumber){a.number=state.serveNumber;if(!isHuman(side))planCPUServe();}
    state.phase='serveToss';
    a.tossAt=Number.isFinite(eventTime)?clamp(eventTime,state.time,state.time+.05):state.time;
    ball.active=false;ball.x=actor.x+(side==='player'?.035:-.035);
    ball.y=actor.y+(side==='player'?-.04:.04);ball.z=SERVE.tossStartZ;
    ball.vx=0;ball.vy=0;ball.vz=SERVE.tossVelocity;
    if(!isHuman(side))a.cpuSwingAt=a.tossAt+SERVE.tossVelocity/GRAVITY+a.cpuTimingOffset-SERVE.windup;
    state.message=side==='player'?'TOSS · PRESS AS BALL RISES INTO CIRCLE':'RIVAL TOSS';state.messageTimer=1.3;
    serveEvent('toss');playTone(360,.05,'sine',.025);
  }
  function beginServeSwing(side,eventTime=state.time,forcePower=false){
    const a=state.serveAttempt;
    if(state.phase!=='serveToss'||!a||side!==a.server)return;
    const at=Number.isFinite(eventTime)?clamp(eventTime,state.time,state.time+.05):state.time;
    if(a.swingAt!==null){
      if(at>a.swingAt+1e-9&&at-a.swingAt<=SERVE.doubleTapWindow+1e-9&&at<a.contactAt&&!a.power){
        a.power=true;
        if(a.lockedAim)a.expected={x:a.lockedAim.x,y:a.lockedAim.y+(side==='player'?-1:1)*serveDepthOffset(a)};
        serveEvent('power');
      }
      return;
    }
    a.lockedAim=a.aim?{...a.aim}:null;a.swingAt=at;a.contactAt=at+SERVE.windup;a.power=!!(a.power||forcePower);
    if(a.lockedAim)a.expected={x:a.lockedAim.x,y:a.lockedAim.y+(side==='player'?-1:1)*serveDepthOffset(a)};
    const actor=state[side];actor.swing=SERVE.windup+.34;actor.swingAge=0;actor.stroke='serve';
    actor.strokeConnected=false;actor.strokeContactAge=SERVE.windup;actor.swingCooldown=SERVE.windup+.38;
    actor.vx=0;actor.vy=0;
    state.message=Number.isFinite(a.swipeStrength)?`${a.power?'POWER ':''}SERVE · TARGET LOCKED`
      :a.power?'POWER SERVE · +0.50 M DEPTH':'SWING · DOUBLE TAP FOR POWER';state.messageTimer=SERVE.windup;
    serveEvent('swing');
  }
  function countServeAttempt(a){
    if(a.counted)return;
    const stats=state[a.server].stats.serve;a.counted=true;stats.attempts++;
    stats[a.number===1?'firstAttempts':'secondAttempts']++;if(a.power)stats.powerAttempts++;
  }
  function finishServeResult(result){
    const a=state.serveAttempt;if(!a||a.result)return;
    // Count a pressured contact only after its return becomes legal. A block
    // into the net or out remains a return error instead of a weak return.
    if(result==='returned'&&a.weakReturn)state[a.server].stats.serve.weakReturns++;
    a.result=result;state.lastServe=clone(a);
    if(!a.recorded&&a.actual){
      state.serveHistory.push({id:a.id,server:a.server,court:state.serveCourt,actual:{...a.actual},legal:a.legal,result});
      if(state.serveHistory.length>24)state.serveHistory.shift();a.recorded=true;
    }
    syncServeStats();serveEvent('result');
  }
  function strikeServe(side) {
    if(state.phase!=='serveToss'||side!==state.server)return;
    const a=state.serveAttempt,ball=state.ball,actor=state[side];
    if(options.suppressRemoteServePrediction&&side!==(options.predictionSide||'player'))return;
    if(!a?.aim&&!a?.lockedAim)return;
    a.lockedAim=a.lockedAim||{...a.aim};
    a.contactAt=state.time;countServeAttempt(a);
    if(ball.z<1.8/2.177){
      a.quality=0;actor.strokeConnected=true;registerServeFault('FAULT — MISSED TOSS');return;
    }
    const quality=serveQuality(),end=side==='player'?-1:1;
    const rating=playerProfile(actor)?.ratings.serve||6;
    const powerStrength=servePowerFraction(a);
    const requested=(125+12.5*(rating-6))*(.80+.20*quality)*(a.number===2?SERVE.secondPace:1)*
      (isHuman(side)?1:a.cpuPace||1)+powerStrength*SERVE.powerKph;
    const expected={x:a.lockedAim.x,y:a.lockedAim.y+end*serveDepthOffset(a)};
    const angle=TAU*seeded(a.errorSeed+71),radius=Math.sqrt(seeded(a.errorSeed+97))*(1-quality)**2*(1+.05*(10-rating));
    const errorX=Math.cos(angle)*radius*SERVE.errorWidthMetres*(side==='player'?1:-1);
    const errorY=Math.sin(angle)*radius*SERVE.errorDepthMetres*end;
    const trajectory=physics.serveTrajectory(ball,expected.x,expected.y,requested,
      a.number===2?SERVE.secondClearanceMetres:SERVE.firstClearanceMetres,errorX,errorY);
    Object.assign(ball,{vx:trajectory.vx,vy:trajectory.vy,vz:trajectory.vz,targetX:trajectory.targetX,targetY:trajectory.targetY,
      active:true,dead:false,settling:false,rolling:false,lastHit:side,bounceCount:0,crossedNet:false,
      isServe:true,shotType:'serve',stroke:'serve',powered:a.power,defensiveLob:false,highDeepLob:false,netTouched:false,serveOriginX:actor.x,
      serveAttemptId:a.id});
    ball.speedKph=physics.speedKph(ball);
    Object.assign(a,{expected,quality,launchSpeedKph:ball.speedKph,netRisk:trajectory.netRisk,paceLimited:trajectory.paceLimited,
      timing:quality>.88?'PERFECT':quality>.60?'CLEAN':ball.vz>0?'EARLY':'LATE',timingErrorMetres:Math.hypot(errorX,errorY)});
    // Label early/late from the toss, not the new outgoing trajectory.
    if(quality<=.60)a.timing=state.time<(a.tossAt??state.time)+SERVE.tossVelocity/GRAVITY?'EARLY':'LATE';
    actor.swing=.34;actor.swingAge=SERVE.windup;actor.strokeConnected=true;actor.serveMotion=.42;actor.swingCooldown=.38;
    actor.strokeContactZ=ball.z;actor.strokeContactAge=SERVE.windup;
    state.phase='rally';state.rallyHits=1;state.lastShotType='serve';state.lastStroke='serve';
    if(Number.isFinite(a.swipeStrength)&&state.swipe){
      state.swipe.committed=null;ball.swipeStrength=a.swipeStrength;recordSwipeFlight();
    }
    state.lastShotSpeed=ball.speedKph;state.lastShotPower=a.power;state.lastTiming=a.timing;
    actor.stats.fastestShot=Math.max(actor.stats.fastestShot,ball.speedKph);if(side==='player')state.stats.fastestShot=actor.stats.fastestShot;
    state.lastServe=clone(a);syncServeStats();
    if(side==='player'&&!online)scheduleAIRead();
    state.message=`${a.power?'POWER · ':''}${a.timing} SERVE · ${ball.speedKph} KM/H`;state.messageTimer=.9;
    serveEvent('contact');burstAt(ball.x,ball.y,ball.z,side==='player'?palette.lime:palette.coral,8);playHit(side==='player'?1:.9);
  }

  function registerServeFault(call = 'FAULT') {
    const attempt=state.serveAttempt;
    if(attempt?.result)return;
    if(attempt){
      const b=state.ball,depth=(attempt.server==='player'?-1:1)*b.y;
      const wide=Math.abs(b.x)>physics.LINE_BOUNDS.singlesX||b.x*Math.sign(b.serveOriginX||state[attempt.server].x)>physics.LINE_BOUNDS.centerX;
      const long=depth>physics.LINE_BOUNDS.serviceY;
      attempt.faultReason=call.includes('NET')?'NET':call.includes('MISSED')?'MISSED TOSS':long&&wide?'LONG + WIDE':long?'LONG':wide?'WIDE':depth<0?'SHORT':'OUT';
      countServeAttempt(attempt);state[attempt.server].stats.serve.faults++;
      if(attempt.number===2)state[attempt.server].stats.serve.doubleFaults++;
      finishServeResult(attempt.number===2?'doubleFault':'fault');}
    // A plain fault is an invalid service-box landing; net faults stay distinct.
    if (call === 'FAULT') signalOut();
    if (state.serveNumber === 1) {
      state.phase = 'serveFault';
      state.serveNumber = 2;
      state.serveDelay = 1.05;
      physics.releaseBall(state.ball);
      state.lastCall = call;
      state.message = `${call==='FAULT'?`FAULT — ${attempt?.faultReason||'OUT'}`:call}  •  SECOND SERVE`;
      state.messageTimer = 1.05;
      playTone(165, .16, 'sine', .035);
    } else {
      const receiver = state.server === 'player' ? 'ai' : 'player';
      awardPoint(receiver, 'DOUBLE FAULT');
    }
  }

  function replayLet() {
    const a=state.serveAttempt;
    if(a?.result)return;
    if(a){
      const stats=state[a.server].stats.serve;stats.lets++;
      if(a.counted){stats.attempts--;stats[a.number===1?'firstAttempts':'secondAttempts']--;if(a.power)stats.powerAttempts--;}
      finishServeResult('let');
    }
    state.phase = 'serveFault';
    state.serveDelay = .9;
    physics.releaseBall(state.ball);
    state.lastCall = 'LET';
    state.message = `LET  •  ${state.serveNumber === 1 ? 'FIRST' : 'SECOND'} SERVE`;
    state.messageTimer = .9;
  }

  function pointLabel(a, b) {
    if (a >= 3 && b >= 3) {
      if (a === b) return '40';
      return a > b ? 'AD' : '40';
    }
    return ['0', '15', '30', '40'][Math.min(a, 3)];
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

    const a = winner === 'player' ? s.playerPoints : s.aiPoints;
    const b = winner === 'player' ? s.aiPoints : s.playerPoints;
    if (state.tiebreak) {
      if (a >= 7 && a - b >= 2) {
        s[winner === 'player' ? 'playerGames' : 'aiGames']++;
        state.matchWon = true;
        state.pointDelay = 2;
      } else {
        const turn = Math.floor((a + b + 1) / 2) % 2;
        state.server = turn === 0 ? state.tiebreakFirstServer : state.tiebreakFirstServer === 'player' ? 'ai' : 'player';
      }
      return;
    }
    if (a >= 4 && a - b >= 2) {
      if (winner === 'player') s.playerGames += 1;
      else s.aiGames += 1;
      s.playerPoints = 0;
      s.aiPoints = 0;
      state.lastCall = winner === 'player' ? 'GAME — YOU' : 'GAME — RIVAL';
      state.message = state.lastCall;
      state.messageTimer = 1.6;
      const totalGames = s.playerGames + s.aiGames;
      state.server = totalGames % 2 === 0 ? state.firstServer : other(state.firstServer);
      if ((s.playerGames >= 3 || s.aiGames >= 3) && Math.abs(s.playerGames - s.aiGames) >= 2) {
        state.matchWon = true;
        state.pointDelay = 2;
      } else if (s.playerGames === 3 && s.aiGames === 3) {
        state.tiebreak = true;
        state.tiebreakFirstServer = state.server;
        state.message = 'TIEBREAK · FIRST TO 7, WIN BY 2';
      }
    }
  }

  // Swipe assistance is an optional human controller. Contact and ball physics
  // stay shared, while a released gesture locks placement for the incoming ball.
  function makeSwipeState(style){return {style:style==='swipe'?'swipe':'classic',pendingStyle:null,
    intent:null,committed:null,previewFlight:null,autoTarget:null,pointEpoch:0,pointStarted:false,attempt:0,readKey:null,nextRead:0,reactionUntil:0,plan:null};}
  function servePowerFraction(attempt){return Number.isFinite(attempt?.swipeStrength)?attempt.swipeStrength:(attempt?.power?1:0);}
  function serveDepthOffset(attempt){return Number.isFinite(attempt?.swipeStrength)?0:servePowerFraction(attempt)*SERVE.powerDepthMetres/11.885;}
  function swipeEligible(){return swipeAllowed&&!online&&!state.eventId&&isHuman('player');}
  function swipeActive(){return swipeEligible()&&state.swipe?.style==='swipe';}
  function swipeBallKey(){return `${state.swipe?.pointEpoch||0}:${state.serveSequence}:${state.rallyHits}:${state.ball.lastHit}`;}
  function clearSwipeAttempt(){
    const q=state.swipe;if(!q)return;
    q.intent=null;q.committed=null;q.previewFlight=null;q.autoTarget=null;q.plan=null;q.readKey=null;q.nextRead=0;q.reactionUntil=0;
  }
  function swipeBoundary(newPoint){
    const q=state.swipe;if(!q)return;
    clearSwipeAttempt();q.attempt++;
    if(newPoint){q.pointEpoch++;q.pointStarted=false;if(q.pendingStyle){q.style=q.pendingStyle;q.pendingStyle=null;}}
  }
  function setControlStyle(style){
    if(!['classic','swipe'].includes(style)||!swipeEligible()||!state.swipe)return false;
    const q=state.swipe;
    if(style===q.style){q.pendingStyle=null;return true;}
    if(state.phase==='serve'&&state.serveAttempt?.tossAt===null&&!q.pointStarted||state.phase==='practiceFeed'){
      clearSwipeAttempt();cancelShotInput();inputs.player=emptyInput();q.style=style;q.pendingStyle=null;
    }else q.pendingStyle=style;
    return true;
  }
  function cancelSwipeShot(){if(state.swipe)state.swipe.intent=null;}
  function recordSwipeFlight(){
    const b=state.ball;
    state.swipe.previewFlight={origin:{x:b.x,y:b.y,z:b.z},vx:b.vx,vy:b.vy,vz:b.vz,
      flightTime:physics.timeToGround(b),launchedAt:state.time,target:{x:b.targetX,y:b.targetY},key:swipeBallKey()};
  }
  function getSwipeState(){
    const q=state.swipe,enabled=swipeActive();
    const intent=enabled&&q.intent&&q.intent.key===swipeBallKey()?q.intent:null;
    const committed=enabled?q.committed:null,shot=committed||intent;
    const previewFlight=enabled&&state.phase==='rally'&&state.ball.active&&state.ball.bounceCount===0&&state.ball.lastHit==='player'&&
      q.previewFlight?.key===swipeBallKey()?q.previewFlight:null;
    const serving=state.server==='player'&&['serve','serveToss'].includes(state.phase);
    const origin=serving?{x:state.player.x+.035,y:state.player.y-.04,z:SERVE.apexZ}
      :q?.plan?{x:q.plan.x,y:q.plan.y-.035,z:q.plan.z??.45}:{x:state.player.x,y:state.player.y,z:.5};
    return clone({effectiveStyle:enabled?'swipe':'classic',pendingStyle:swipeEligible()?q?.pendingStyle||null:null,
      intent,committed,autoTarget:enabled?q.autoTarget:null,pointEpoch:q?.pointEpoch||0,
      attemptKey:`${q?.pointEpoch||0}:${q?.attempt||0}:${state.serveSequence}:${state.phase}:${state.rallyHits}`,
      targetingOrigin:enabled?origin:null,previewFlight,
      previewTarget:shot?(shot.target||{x:shot.targetX,y:-shot.targetDepth}):previewFlight?.target||null});
  }
  function queueSwipeShot(shot){
    if(!swipeActive()||state.mode!=='playing'||state.paused||state.swipe.committed||
      !shot||!['targetX','targetDepth','strength'].every(key=>Number.isFinite(shot[key])))return false;
    // Lock on release, before the automatic runner reaches its contact window.
    // Early gestures belong to this ball instead of expiring during a long lob.
    if(state.swipe.intent?.key===swipeBallKey())return false;
    const q=state.swipe,intent={targetX:clamp(shot.targetX,-.8,.8),targetDepth:clamp(shot.targetDepth,.23,.92),
      strength:clamp(shot.strength,0,1),createdAt:state.time,key:swipeBallKey()};
    if(state.phase==='serve'&&state.server==='player'){
      const geometry=getServeGeometry('player'),fraction=(intent.targetX+.8)/1.6;
      const target={x:lerp(geometry.minX+.025,geometry.maxX-.025,fraction),
        y:-lerp(.08,.50,(intent.targetDepth-.23)/.69)};
      setServeAim('player',target);q.intent=null;q.committed={...intent,kind:'serve',target};
      state.serveAttempt.swipeStrength=intent.strength;
      beginServeToss('player');
      state.serveAttempt.swipeSwingAt=state.serveAttempt.tossAt+SERVE.tossVelocity/GRAVITY-SERVE.windup;
      return true;
    }
    if(state.phase!=='rally'||!state.ball.active||state.ball.lastHit!=='ai'||state.ball.vy<=0)return false;
    q.intent=intent;return true;
  }
  function swipeMove(actor,target,dt,planted=false){
    if(planted){actor.vx=0;actor.vy=0;return;}
    const dx=target.x-actor.x,dy=target.y-actor.y,distance=Math.hypot(dx,dy);
    const maximum=1.3*playerModifier(actor,'footwork'),speed=Math.min(maximum,distance*8);
    steerMovement(actor,distance>1e-9?dx/distance*speed:0,distance>1e-9?dy/distance*speed:0,maximum,distance>.008?13:9,dt);
    actor.x=clamp(actor.x+actor.vx*dt,-1.06,1.06);actor.y=clamp(actor.y+actor.vy*dt,.12,1.22);
  }
  function swipeIntercept(){
    const actor=state.player,ball=state.ball,speed=1.3*playerModifier(actor,'footwork');
    const predicted={...ball},step=.025,delay=Math.max(0,state.swipe.reactionUntil-state.time);
    let ground=null,overhead=null,bestEffort=null,chase=null;
    // A bounded public-flight forecast stops at the ordinary terminal events.
    // It never reads the CPU's selected target or gives the runner extra reach.
    for(let time=step;time<=2.5;time+=step){
      advanceReturnPrediction(predicted,step);
      if(!predicted.active)break;
      if(predicted.y<=.015||predicted.vy<=0)continue;
      const target={x:clamp(predicted.x,-1.06,1.06),y:clamp(predicted.y+.035,.12,1.22)};
      const distance=Math.hypot(target.x-actor.x,target.y-actor.y);
      const stroke=strokes.select({...actor,...target},predicted);
      const reach=level().humanReach*stroke.reachScale;
      if(racketDistance({...actor,...target},predicted)>reach)continue;
      const candidate={...target,z:predicted.z,at:state.time+time,kind:stroke.kind};
      // Even when an ideal stroke is unavailable, keep following a public
      // flight point inside normal reach instead of braking in place.
      const chaseScore=distance-speed*Math.max(0,time-delay);
      if(!chase||chaseScore<chase.score)chase={...candidate,score:chaseScore};
      if(!stroke.reachable||predicted.isServe&&predicted.bounceCount===0)continue;
      const smash=stroke.kind==='smash';
      if(smash?(predicted.vz>=0||state.practice&&predicted.bounceCount!==0)
        :state.practice||predicted.bounceCount!==1&&target.y>=.60)continue;
      const reserve=delay+SHOT.contactOpens+.07;
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
  function swipeContactAhead(dt){
    const actor=state.player,incoming={...state.ball};
    // updatePlayer runs before this frame's ball advance. Count that same
    // frame in the windup and split a later update at its exact contact time.
    const contactDelay=Math.max(SHOT.contactOpens,dt);
    advanceReturnPrediction(incoming,contactDelay);
    if(!incoming.active||incoming.lastHit!=='ai'||incoming.vy<=0||incoming.y<=.015||
      incoming.isServe&&incoming.bounceCount===0)return null;
    const stroke=strokes.select(actor,incoming);
    if(!stroke.reachable||state.practice&&(stroke.kind!=='smash'||incoming.vz>=0||incoming.bounceCount!==0))return null;
    // Choose overheads on descent and ordinary rally pickups after a bounce,
    // unless the player has actually reached a volleying position.
    if(stroke.kind==='smash'&&incoming.vz>=0||stroke.kind.endsWith('-volley')&&actor.y>=.60)return null;
    const reach=level().humanReach*stroke.reachScale;
    if(racketDistance(actor,incoming)>reach*.80)return null;
    return {...stroke,contactDelay};
  }
  function updateSwipePlayer(dt){
    const q=state.swipe,actor=state.player,ball=state.ball;
    if(q.intent&&q.intent.key!==swipeBallKey())q.intent=null;
    if(q.previewFlight&&(!ball.active||ball.bounceCount>0||q.previewFlight.key!==swipeBallKey()))q.previewFlight=null;
    if(q.committed?.kind==='rally'&&(actor.strokeConnected||actor.swing<=0))q.committed=null;
    if(q.committed?.kind==='rally'&&Number.isFinite(q.committed.contactAt)&&
      state.time>=q.committed.contactAt-1e-9)actor.swingAge=Math.max(SHOT.contactOpens,actor.swingAge);
    if(state.phase!=='rally'){
      actor.vx=0;actor.vy=0;q.autoTarget={x:actor.x,y:actor.y};updateLocomotion(actor,dt);return;
    }
    const incoming=ball.active&&ball.lastHit==='ai'&&ball.vy>0,key=swipeBallKey();
    let target={x:clamp(-(ball.targetX||0)*.30,-.24,.24),y:ball.lastHit==='player'&&Math.abs(ball.targetY)<.45?.68:.87};
    if(incoming){
      if(q.readKey!==key){q.readKey=key;q.reactionUntil=state.time-dt+.08;q.nextRead=0;q.plan=null;}
      if(state.time>=q.reactionUntil&&state.time>=q.nextRead&&!q.committed){q.plan=swipeIntercept();q.nextRead=state.time+.08;}
      if(q.plan)target=q.plan;
      else if(state.time>=q.reactionUntil)target={x:clamp(ball.x,-1.06,1.06),y:clamp(ball.y+.035,.12,1.22)};
      else target={x:actor.x,y:actor.y};
    }else{q.plan=null;q.readKey=null;q.intent=null;}
    q.autoTarget={x:target.x,y:target.y};
    swipeMove(actor,target,dt,!!q.committed);
    updateLocomotion(actor,dt);
    if(incoming&&q.intent&&!q.committed&&actor.swingCooldown<=0&&state.time>=q.reactionUntil){
      const stroke=swipeContactAhead(dt);
      if(stroke){
        q.committed={...q.intent,kind:'rally',contactAt:state.time-dt+stroke.contactDelay};q.intent=null;
        actor.queuedShot=state.practice||stroke.kind==='smash'?'neutral':q.committed.targetDepth<.50?'short':q.committed.targetDepth>=.80?'deep':'neutral';
        actor.queuedAim=q.committed.targetX;actor.queuedPower=false;actor.aimRemaining=0;
        actor.swingPressAt=state.time-dt;actor.vx=0;actor.vy=0;
        actor.swing=Math.max(0,.4-dt);actor.swingAge=dt;actor.swingCooldown=Math.max(0,.42-dt);actor.strokeConnected=false;
        prepareStroke(actor,stroke.contactDelay);
      }
    }
  }

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

  function overheadTarget(ball) {
    if (ball.highDeepLob || !ball.active || ball.vy >= 0 || ball.lastHit === 'ai' || ball.bounceCount !== 0 || ball.isServe) return null;
    const ai = state.ai, cfg = level();
    const windup = preparedCPU() ? SHOT.contactOpens : .075;
    const descendingTime = height => {
      const discriminant = ball.vz * ball.vz + 2 * GRAVITY * (ball.z - height);
      return discriminant < 0 ? Infinity : (ball.vz + Math.sqrt(discriminant)) / GRAVITY;
    };
    const lowest = descendingTime(strokes.SMASH_MIN + .04);
    if (!Number.isFinite(lowest)) return null;
    const highest = descendingTime(strokes.SMASH_MAX - .04);
    const end = Math.min(2.5, lowest);
    const start = Math.max(windup, Number.isFinite(highest) ? highest : Math.max(0, ball.vz / GRAVITY));
    if (start > end) return null;
    for (let time = start; time <= end + 1e-9; time += .02) {
      const intercept = physics.sample(ball, time);
      if (Math.abs(intercept.x) > SINGLES_X || intercept.y > -.12 || intercept.y < -1) continue;
      // Stand a little deeper than the ball so contact stays in front of
      // the shoulder. Reserve time for acceleration and swing preparation.
      const target = { x: intercept.x, y: Math.max(-1.18, intercept.y - .055) };
      const travel = Math.hypot(target.x - ai.x, target.y - ai.y);
      const movementTime = Math.max(0, time - windup - ai.reactionTimer - .12);
      if (isPro()||playerProfile(ai)?.movement ? canReachAITarget(target,time,windup,.045)
        : travel <= cfg.speed * playerModifier(ai,'footwork') * movementTime + .045) return target;
    }
    return null;
  }

  function advanceReturnPrediction(ball, dt) {
    physics.advance(ball, dt, state.venue, (event, predicted) => {
      if (event === 'net' || event === 'board' || event === 'bounce' &&
        (predicted.bounceCount >= 2 || !(predicted.isServe ? isServeLandingValid(predicted) : physics.inSingles(predicted, predicted.lastHit)))) {
        predicted.active = false;
      } else if (event === 'bounce') {
        // A legal serve may only be returned after its first bounce.
        if (predicted.isServe && predicted.netTouched) predicted.active = false;
        predicted.isServe = false;
      }
    });
    if (Math.abs(ball.x) > 1.5 || Math.abs(ball.y) > 1.65) ball.active = false;
  }

  function canPrepareAceReturn(actor, ball, defensive = false) {
    if (!ball.active || ball.lastHit === 'ai' || ball.vy >= 0 || ball.y >= -.015 || ball.isServe && ball.bounceCount === 0) return false;
    const stroke = strokes.select(actor, ball);
    if(isPro()&&stroke.kind==='smash'&&actor.pro?.lobRetreat&&
      (actor.vy<-.15||Math.hypot(actor.vx,actor.vy)>.42))return false;
    if (defensive && (stroke.kind === 'smash' || stroke.kind.endsWith('-volley'))) return false;
    const reach = level().reach * stroke.reachScale;
    const distance = racketDistance(actor,ball);
    // Keep a small placement margin. Preparation must never depend on
    // the extra reach used by the easier levels while they keep running.
    const balanced = isPro() && !defensive;
    if (!stroke.reachable || distance > (balanced ? reach * .82 : reach - .004)) return false;
    return stroke.kind === 'smash'
      ? ball.vz <= 0 && ball.y >= -1 && Math.abs(ball.x) <= SINGLES_X
      : ball.z > (balanced ? .16 : .04) && ball.z < level().maxHitZ;
  }

  function moveServeReceiver(actor,target,dt,planted){
    // A serve read and its speculative runners share one physical mover. The
    // court's depth unit is longer than its width unit; using those raw axes
    // gave forward chases more than twice the lateral running speed.
    const dx=(target.x-actor.x)*5.018,dy=(target.y-actor.y)*11.885,distance=Math.hypot(dx,dy);
    const runner={rosterId:actor.rosterId,customRatings:actor.customRatings,vx:actor.vx*5.018,vy:actor.vy*11.885};
    const maximum=SERVE_CPU[state.difficulty].runSpeedMetres*playerModifier(actor,'footwork');
    if(planted){runner.vx=0;runner.vy=0;}
    else if(distance>.06){
      const speed=Math.min(maximum,distance*7);
      steerMovement(runner,dx/distance*speed,dy/distance*speed,maximum,isLegend()?10.5:9,dt);
    }else{
      const braking=playerProfile(actor)?.movement?.braking??1;
      runner.vx*=Math.max(0,1-dt*10*braking);runner.vy*=Math.max(0,1-dt*10*braking);
    }
    actor.vx=runner.vx/5.018;actor.vy=runner.vy/11.885;
    actor.x=clamp(actor.x+actor.vx*dt,-1.06,1.06);
    actor.y=clamp(actor.y+actor.vy*dt,-1.22,-.14);
  }

  function moveAI(actor, target, dt, planted = false, serving = false) {
    if(actor.controller==='computer'&&state.phase==='rally'&&state.ball.shotType==='serve'&&state.ball.lastHit==='player'){
      moveServeReceiver(actor,target,dt,planted);return;
    }
    const strategy=isPro()?actor.pro:null;
    if(strategy){
      strategy.recoveryLeft=Math.max(0,strategy.recoveryLeft-dt);
      strategy.depthHold=Math.max(0,strategy.depthHold-dt);
      strategy.turnLeft=Math.max(0,(strategy.turnLeft||0)-dt);
      strategy.balanceLeft=Math.max(0,(strategy.balanceLeft||0)-dt);
      strategy.responseLeft=Math.max(0,(strategy.responseLeft||0)-dt);
    }
    const dx = target.x - actor.x, dy = target.y - actor.y, dist = Math.hypot(dx, dy);
    if (planted) {
      actor.vx = 0; actor.vy = 0;
    } else if (dist > .012) {
      const maxSpeed=level().speed*playerModifier(actor,'footwork');
      const speed = Math.min(maxSpeed, dist * 7);
      const rallyStrategy=strategy&&state.phase==='rally'&&state.ball.shotType!=='serve';
      const recovering=rallyStrategy?Math.max(strategy.pressure*strategy.recoveryLeft/Math.max(.001,strategy.recoveryDuration),
        .65*clamp(strategy.turnLeft/.30,0,1),
        .60*(strategy.readPressure||0)*clamp(strategy.responseLeft/.45,0,1)):0;
      // PRO keeps lateral sprint speed. Front/back travel has its own court
      // scale, and a difficult save costs initial balance rather than a freeze.
      const depthSpeed=rallyStrategy?(isLegend()
        ?(dy>0?.66:strategy.lobRetreat&&state.ball.shotType==='lob'?.56:.95)
        :(dy>0?.55:strategy.lobRetreat&&state.ball.shotType==='lob'?.46:.90)):1;
      steerMovement(actor,dx/dist*speed*(1-.22*recovering),dy/dist*speed*depthSpeed*(1-.30*recovering),maxSpeed,(isLegend()?10.5:9)*(1-.55*recovering),dt);
    } else {
      const braking=playerProfile(actor)?.movement?.braking??1;
      actor.vx *= Math.max(0, 1 - dt * 10*braking); actor.vy *= Math.max(0, 1 - dt * 10*braking);
    }
    actor.x = clamp(actor.x + actor.vx * dt, -1.06, 1.06);
    actor.y = clamp(actor.y + actor.vy * dt, -1.22, serving ? -.99 : -.14);
  }

  function racketDistance(actor,ball) {
    if(actor.controller==='computer'&&ball.shotType==='serve')return Math.hypot((ball.x-actor.x)*5.018,(ball.y-actor.y)*11.885)/5.018;
    const depthScale=isPro()&&actor.controller==='computer'&&ball.shotType!=='serve'?1.65:1;
    return Math.hypot((ball.x-actor.x)*1.05,(ball.y-actor.y)*depthScale);
  }

  function copyAIRunner(actor=state.ai) {
    return actor.pro?{...actor,pro:{...actor.pro}}:{...actor};
  }

  function proBalanceLoad(q=state.ai.pro) {
    if(isLegend())return q?clamp((q.pressure-.44)/.56,0,1)*clamp((q.balanceLeft||0)/.55,0,1):0;
    return q?clamp((q.pressure-.40)/.60,0,1)*clamp((q.balanceLeft||0)/.55,0,1):0;
  }

  function proContactPressure(actor,ball,quality) {
    if(!isPro()||ball.shotType==='serve')return 0;
    const reach=level().reach*strokes.select(actor,ball).reachScale;
    const stretch=clamp((racketDistance(actor,ball)/reach-.42)/.58,0,1);
    const retreat=clamp((-actor.y-.87)/.28,0,1);
    const late=clamp((actor.swingAge-.22)/.09,0,1);
    const pace=clamp((physics.speedKph(ball)-52)/60,0,1);
    const speed=Math.hypot(actor.vx,actor.vy);
    const turning=clamp((speed-.35)/.85,0,1)*stretch;
    const wide=clamp((Math.abs(actor.x)-.60)/.40,0,1);
    const overheadRetreat=actor.pro?.lobRetreat?clamp((-actor.vy-.10)/.45,0,1):0;
    return clamp(.34*stretch+.25*retreat+.16*late+.20*turning+.12*wide+
      .30*overheadRetreat+.24*pace*Math.max(stretch,retreat,.25*(1-quality)),0,1);
  }

  function recordProContact(pressure) {
    const ai=state.ai,q=ai.pro;
    if(!q)return;
    q.pressure=pressure;
    q.shortChase=null;
    q.lobRetreat=false;q.turnLeft=0;
    q.recoveryDuration=pressure>.16?.16+.64*pressure:0;
    q.recoveryLeft=q.recoveryDuration;
    // A difficult save leaves a recovery stance until the following exchange.
    // This is separate from the brief impact slowdown: floating a safe reply
    // must not erase every consequence before the human can play another ball.
    q.balanceLeft=pressure>.40?2.0+.6*pressure:0;
    q.contactX=ai.x;
    q.readPressure=0;q.responseLeft=0;
    const deep=clamp((-ai.y-.91)/.25,0,1);
    q.depthHold=deep>.12?1.45+deep*.9:0;
    q.depth=-.87-.23*deep;
    q.coverBias=(seeded(Math.floor(state.time*631)+state.rallyHits*37)-.5)*(.045+.16*pressure);
    if(isLegend()){
      q.recoveryDuration*=.75;q.recoveryLeft=q.recoveryDuration;
      q.balanceLeft=pressure>.46?1.65+.45*pressure:0;
      q.depthHold=deep>.12?.90+deep*.65:0;
      q.depth=-.87-.19*deep;q.coverBias*=.60;
    }
  }

  function readProPattern() {
    const q=state.ai.pro;
    if(!q)return;
    if(isLegend()){readLegendPattern(q);return;}
    // Only previously observed ball flights inform the commitment. Never use
    // queued input or reroll the recovery location during an exchange.
    const recent=q.history.slice(-4),lanes=recent.map(h=>h.lane);
    const lane=lanes.length>=2&&lanes.slice(-2).every(x=>x===lanes.at(-1))?lanes.at(-1):0;
    q.anticipationX=lane*.11;
    q.expectShort=recent.length>=3&&recent.filter(h=>h.shot==='short').length>=2;
  }

  function readLegendPattern(q) {
    // Learn transitions between completed shots, including deep → drop and
    // alternating corners. Commit to a prediction, so changing the pattern
    // can still catch the defender leaning the wrong way.
    const recent=q.history.slice(-12),last=recent.at(-1);
    if(!last){q.anticipationX=0;q.expectShort=false;q.expectLob=false;return;}
    const lanes=[],shots=[];
    for(let i=1;i<recent.length;i++){
      if(recent[i-1].lane===last.lane)lanes.push(recent[i].lane);
      if(recent[i-1].shot===last.shot)shots.push(recent[i].shot);
    }
    const predict=values=>{
      const counts=new Map();for(const value of values)counts.set(value,(counts.get(value)||0)+1);
      const best=[...counts].sort((a,b)=>b[1]-a[1])[0];
      return best&&best[1]>=2&&best[1]/values.length>=.65?best[0]:null;
    };
    const lane=predict(lanes);
    const repeated=recent.length>=2&&recent.at(-2).lane===last.lane?last.lane:0;
    q.anticipationX=(lane??repeated)*.13;
    q.expectShort=predict(shots)==='short'||recent.slice(-4).filter(h=>h.shot==='short').length>=2;
    q.expectLob=recent.slice(-6).filter(h=>h.shot==='lob').length>=2;
  }

  function canReachAITarget(target, time, windup, margin) {
    const ai=state.ai,travelTime=time-windup;
    if(travelTime<=0 || Math.hypot(target.x-ai.x,target.y-ai.y)>
      level().speed*playerModifier(ai,'footwork')*travelTime+margin)return false;
    const runner=copyAIRunner(ai),recovery=aiRecoveryTarget();
    // Use the real mover, including current momentum and recovery during
    // the read delay. Overheads/volleys reserve a planted preparation.
    for(let elapsed=0;elapsed<travelTime;){
      const dt=Math.min(1/60,travelTime-elapsed);
      const waiting=elapsed+dt<ai.reactionTimer;
      const destination=waiting?(state.ball.isServe?{x:ai.x,y:ai.y}:recovery):target;
      moveAI(runner,destination,dt);
      elapsed+=dt;
    }
    return Math.hypot(target.x-runner.x,target.y-runner.y)<=margin;
  }

  function aceSwingContact(dt, running, allowSmash, defensive = false) {
    const step = dt || 1 / 60, incoming = {...state.ball}, runner = copyAIRunner();
    const target = {x: state.ai.targetX, y: state.ai.targetY};
    // The current frame has already moved the runner. Try a planted swing
    // first, then a groundstroke prepared while chasing a wide ball. Both
    // keep the normal wind-up, movement limits and racket contact window.
    for (let frame = 0; frame * step <= .29 + 1e-9; frame++) {
      const age = frame * step;
      if (frame > 0) moveAI(runner, target, step, !running && age < SHOT.contactOpens);
      advanceReturnPrediction(incoming, step);
      if (!incoming.active) return null;
      if (age >= SHOT.contactOpens && canPrepareAceReturn(runner, incoming, defensive) &&
        (strokes.select(runner, incoming).kind !== 'smash' || !running && allowSmash)) return (frame + 1) * step;
    }
    return null;
  }

  function proBalancedContactAhead(actor, dt) {
    const step = dt || 1 / 60, incoming = {...state.ball}, runner = copyAIRunner(actor);
    const target = {x: actor.targetX, y: actor.targetY};
    // The live contact is already legal. Wait only if the committed movement
    // can still produce a balanced shot before this swing's contact window ends.
    for (let age = actor.swingAge + step; age <= .29 + 1e-9; age += step) {
      moveAI(runner, target, step);
      advanceReturnPrediction(incoming, step);
      if (!incoming.active) return false;
      if (canPrepareAceReturn(runner, incoming)) return true;
    }
    return false;
  }

  function proCanWaitForBalancedReturn(dt) {
    const step = dt || 1 / 60, incoming = {...state.ball}, runner = copyAIRunner();
    const target = {x: runner.targetX, y: runner.targetY};
    // A fallback must not start early just because a better contact falls
    // beyond a swing started now. Continue the same pursuit and leave enough
    // time to prepare that later running groundstroke normally.
    for (let frame = 0; frame * step <= .9; frame++) {
      if (frame > 0) moveAI(runner, target, step);
      advanceReturnPrediction(incoming, step);
      if (!incoming.active) return false;
      if (frame * step > .29 && canPrepareAceReturn(runner, incoming) &&
          ['forehand', 'backhand'].includes(strokes.select(runner, incoming).kind)) return true;
    }
    return false;
  }

  function netVolleyTarget(ball) {
    if (!usesNetTactics() || !state.ai.tactics?.net || ball.isServe ||
        ball.lastHit !== 'player' || ball.vy >= 0 || ball.bounceCount !== 0) return null;
    const ai = state.ai, predicted = {...ball}, step = 1 / 60;
    const windup = preparedCPU() ? SHOT.contactOpens : .075;
    // Look for an actually reachable interception before the bounce. Use the
    // same speed, reaction delay, wind-up and contact height as ordinary play.
    for (let time = step; time <= .9; time += step) {
      advanceReturnPrediction(predicted, step);
      if (!predicted.active || predicted.bounceCount) return null;
      if (time < windup + ai.reactionTimer + .08 || predicted.y > -.16 ||
          predicted.y < -.68 || predicted.z < .12 || predicted.z > level().maxHitZ || Math.abs(predicted.x) > SINGLES_X) continue;
      const target = {x: predicted.x, y: clamp(predicted.y - .04, -.72, -.18)};
      if (canReachAITarget(target,time,windup,.06)) return target;
    }
    return null;
  }

  function contactTarget(ball, side) {
    if (side === 'ai') {
      const overhead = overheadTarget(ball);
      if (overhead) return overhead;
      const volley = netVolleyTarget(ball);
      if (volley) return volley;
    }
    let target;
    // Ace needs room behind the bounce for its full swing preparation.
    const ace = side === 'ai' && preparedCPU();
    const early = side === 'ai' && !ace && ball.shotType !== 'serve';
    if (ball.bounceCount === 0) {
      const bounce = { ...physics.landing(ball), shotType: ball.shotType, bounceCount: 0,
        ...(ball.proDrop?{proDrop:ball.proDrop}:{}) };
      physics.rebound(bounce, state.venue);
      target = physics.sample(bounce, Math.min(early ? .085 : .17, physics.timeToGround(bounce) * .38));
    } else {
      target = physics.sample(ball, Math.min(ace ? .16 : early ? .065 : .10, physics.timeToGround(ball) * .35));
    }
    return { x: clamp(target.x, -1.02, 1.02), y: side === 'player' ? clamp(target.y, .17, 1.18) : clamp(target.y, -1.18, -.17) };
  }

  function scheduleAIRead() {
    const ai = state.ai, cfg = level();
    if(state.ball.shotType==='serve'&&state.ball.lastHit==='player'){
      const serve=SERVE_CPU[state.difficulty],seed=Math.floor(state.time*100000)+state.serveSequence*8191+71;
      ai.reactionTimer=lerp(serve.reaction[0],serve.reaction[1],seeded(seed+211));
      ai.serveRead={at:state.time,nextAt:state.time+serve.observe,previous:{x:state.ball.x,y:state.ball.y,z:state.ball.z,
        bounceCount:0,time:state.time},observed:null,observedAt:state.time,
        errorX:(seeded(seed+223)*2-1)*serve.error/5.018,
        errorY:(seeded(seed+227)*2-1)*serve.error/11.885,
        speedError:(seeded(seed+229)*2-1)*serve.error*.12};
      ai.readTarget={x:ai.x,y:ai.y};ai.trackingTimer=serve.observe;
      if(ai.pro)ai.pro.shortChase=null;
      return;
    }
    delete ai.serveRead;
    ai.reactionTimer = cfg.delay;
    if(ai.pro)ai.pro.shortChase=null;
    if(isPro()&&ai.pro&&state.ball.shotType!=='serve'){
      readProPattern();
      const q=ai.pro;
      q.lobRetreat=state.ball.shotType==='lob'&&ai.y>-.62;
      q.turnLeft=q.lobRetreat?.16+clamp(ai.vy,0,1)*.18:0;
      const load=proBalanceLoad(q),dx=state.ball.targetX-ai.x;
      const wrongFoot=dx*ai.vx<-.035?clamp((Math.abs(ai.vx)-.18)/.75,0,1):0;
      const wrongLane=q.anticipationX*dx<-.025?1:0;
      const wrongDepth=q.expectShort&&state.ball.shotType==='deep'&&ai.y>-.82?1:0;
      // Only a completed shot can expose a bad commitment. Routine reads keep
      // PRO's speed; stretched saves and wrong guesses cost the next first step.
      ai.reactionTimer+=isLegend()
        ?.038*load+.045*Math.max(wrongLane,wrongDepth)+.050*wrongFoot
        :.050*load+.055*Math.max(wrongLane,wrongDepth)+.060*wrongFoot;
      q.readPressure=Math.max(load,.75*wrongFoot,.55*Math.max(wrongLane,wrongDepth));
      q.responseLeft=q.readPressure>0?.45+.30*q.readPressure:0;
      q.turnLeft=Math.max(q.turnLeft,wrongFoot>.1?.22+.22*wrongFoot:0);
      if(state.ball.shotType==='short'){
        // Measure the chase from the completed shot, before the CPU moves.
        // The same drop is routine into a covered lane and demanding after
        // a corner-to-corner exchange. Use the real bounce and movement scale;
        // this estimate influences the reply, never grants reach or a miss.
        const b=state.ball,bounce={...physics.landing(b),shotType:'short',
          proDrop:b.proDrop,bounceCount:0};
        physics.rebound(bounce,state.venue);
        const bounceTime=physics.timeToGround(bounce);
        const target=physics.sample(bounce,bounceTime*.38);
        const dx=target.x-ai.x,dy=target.y-ai.y;
        const depthSpeed=dy>0?(isLegend()?.66:.55):(isLegend()?.95:.90);
        const speed=cfg.speed*playerModifier(ai,'footwork');
        const distance=Math.hypot(dx,dy/depthSpeed);
        const opposition=clamp(-(dx*ai.vx+dy*ai.vy)/Math.max(.001,Math.hypot(dx,dy)*speed),0,1);
        const requiredTime=Math.max(0,distance-.13)/speed+.09+
          opposition*.18+load*.12;
        const availableTime=Math.max(.05,physics.timeToGround(b)+bounceTime*.80-ai.reactionTimer);
        q.shortChase={x:ai.x,y:ai.y,requiredTime,availableTime,
          pressure:clamp((requiredTime/availableTime-.75)/.35,0,1)};
      }
      q.history.push({lane:Math.abs(state.ball.targetX)>.24?Math.sign(state.ball.targetX):0,shot:state.ball.shotType});
      if(q.history.length>(isLegend()?12:6))q.history.shift();
    }
    ai.trackingTimer = 0;
    if (usesNetTactics() && ai.tactics?.net) {
      const b = state.ball, landing = physics.landing(b);
      const apex = b.z + Math.max(0, b.vz) ** 2 / (2 * GRAVITY);
      // A deep lob beats the approach: turn and chase instead of camping at net.
      if (apex > 1.15 && landing.y < -.65) ai.tactics.net = false;
    }
    ai.readErrorX = (seeded(Math.floor(state.time * 1291) + 31) - .5) * cfg.error;
    ai.readErrorY = (seeded(Math.floor(state.time * 887) + 71) - .5) * cfg.error * .55;
  }

  function aiRecoveryTarget() {
    // Cover both baseline corners until the opponent hits. Sending the ball
    // wide must not automatically commit us to the opposite, cross-court lane.
    // Stay deeper behind a deep shot, step inside after a short one.
    const b = state.ball;
    if (usesNetTactics() && state.ai.tactics?.net) {
      const lane = b.lastHit === 'ai' && b.targetX !== null ? b.targetX : state.player.x;
      return {x: clamp(lane * .42, -.32, .32), y: isPro() ? -.26 : state.difficulty === 'club' ? -.30 : -.34};
    }
    const x = b.lastHit === 'ai' && b.targetX !== null ? b.targetX : state.player.x;
    const depth = b.lastHit === 'ai' && b.targetY !== null ? b.targetY : .75;
    const target={ x: 0, y: depth < .45 ? -.61 : -.87 };
    // A slight cross-court lean is useful, but the old 30% commitment left
    // the line open even after a complete recovery. Keep the base position
    // close to centre; pressure and observed patterns can still displace it.
    target.x=clamp(-x*.10,-.08,.08);
    const q=isPro()?state.ai.pro:null;
    if(q){
      // The recovering player shades the side of a demanding contact instead
      // of always completing an ideal centre recovery behind a slow reply.
      target.x=clamp(target.x+q.coverBias+q.anticipationX+(q.contactX||0)*(isLegend()?.22:.30)*proBalanceLoad(q),-.46,.46);
      if(q.depthHold>0)target.y=Math.min(target.y,lerp(-.87,q.depth,clamp(q.depthHold/.65,0,1)));
      if(q.expectShort)target.y=Math.max(target.y,-.70);
    }
    return target;
  }

  function updateAI(dt) {
    const ai = state.ai;
    const cfg = level();

    if(state.phase==='rally'&&state.ball.shotType==='serve'&&state.ball.lastHit==='player'){
      updateServeReceiver(dt);return;
    }

    const recovery = aiRecoveryTarget();
    let tx = recovery.x;
    let ty = recovery.y;
    if (state.phase === 'rally' && state.ball.vy < 0) {
      ai.reactionTimer = Math.max(0, ai.reactionTimer - dt);
      if (ai.reactionTimer > 0) {
        // Await the serve from the receiving stance. Rally recovery would
        // pull the receiver toward the centre before it can read a wide serve.
        tx = state.ball.isServe ? ai.x : recovery.x;
        ty = state.ball.isServe ? ai.y : recovery.y;
      } else {
        // Ace commits to a read briefly instead of correcting its intercept
        // every frame. A change of depth or direction can leave an opening.
        ai.trackingTimer = Math.max(0, (ai.trackingTimer || 0) - dt);
        if (!preparedCPU() || ai.trackingTimer <= 0 && !(ai.swing > 0 && !ai.strokeConnected)) {
          const landing = contactTarget(state.ball, 'ai');
          ai.readTarget = {x: clamp(landing.x + ai.readErrorX, -1.02, 1.02),
            y: clamp(landing.y + ai.readErrorY, -1.18, -.18)};
          ai.trackingTimer = isLegend()?.11:.14;
        }
        tx = ai.readTarget.x;
        ty = ai.readTarget.y;
      }
    } else if (state.phase === 'serve' || state.phase === 'serveToss' || state.phase === 'serveFault') {
      const geometry = getServeGeometry(state.server);
      if (state.server === 'ai') {
        tx = geometry.serverX;
        ty = -1.035;
      } else {
        tx = geometry.receiverX+serveAnticipation(geometry);
        ty = -serveReceiverDepth();
      }
    }
    // The read timer already models reaction. Smoothing the target as well
    // added a second delay and made the same wide return an automatic winner.
    // Acceleration below still limits every step of the actual player.
    ai.targetX = tx;
    ai.targetY = ty;
    const planted = preparedCPU() && !ai.runningSwing && ai.swing > 0 && !ai.strokeConnected && ai.swingAge < SHOT.contactOpens;
    const aiServing = (state.phase === 'serve' || state.phase === 'serveToss') && state.server === 'ai';
    moveAI(ai, {x: tx, y: ty}, dt, planted, aiServing);
    updateLocomotion(ai, dt);

    if (state.phase === 'rally' && state.ball.vy < 0 && ai.swingCooldown <= 0 && ai.reactionTimer <= 0 && !(state.ball.isServe && state.ball.bounceCount === 0)) {
      const reach = cfg.reach;
      const incoming = {...state.ball};
      const ace = preparedCPU();
      const d = Math.hypot((incoming.x - ai.x) * 1.06, incoming.y - ai.y);
      const windup = preparedCPU() ? SHOT.contactOpens : .075;
      const highBall = { ...state.ball, ...physics.sample(state.ball, windup) };
      const overhead = strokes.select(ai, highBall);
      const overheadDistance = Math.hypot((highBall.x - ai.x) * 1.05, highBall.y - ai.y);
      const canSmash = highBall.vz <= 0 && highBall.y < -.015 && highBall.y >= -1 && Math.abs(highBall.x) <= SINGLES_X &&
        overhead.kind === 'smash' && overhead.reachable && overheadDistance <= reach * overhead.reachScale;
      const canReturn = d < reach + .07 && incoming.z < cfg.maxHitZ && incoming.z > .04;
      let plantedContact = ace ? aceSwingContact(dt, false, canSmash) : null;
      let runningContact = ace && plantedContact === null ? aceSwingContact(dt, true, false) : null;
      if (isPro() && plantedContact === null && runningContact === null) {
        // Prefer a balanced swing, but use Ace's legal defensive pickup when
        // neither planted nor running preparation can reach a comfortable ball.
        plantedContact = aceSwingContact(dt, false, canSmash, true);
        runningContact = plantedContact === null ? aceSwingContact(dt, true, false, true) : null;
        if ((plantedContact !== null || runningContact !== null) && proCanWaitForBalancedReturn(dt)) {
          plantedContact = null;
          runningContact = null;
        }
      }
      // Do not stop a forward chase just because a planted last-chance scoop
      // is possible. A legal running preparation can meet the drop sooner.
      // Balanced shots and overheads retain their ordinary planted preference.
      if(isPro()&&incoming.shotType==='short'&&plantedContact!==null&&
          !canSmash&&ai.vy>.15&&ty>ai.y+.04&&plantedContact>.24){
        const movingContact=aceSwingContact(dt,true,false,true);
        if(movingContact!==null&&movingContact<=plantedContact){
          plantedContact=null;runningContact=movingContact;
        }
      }
      const contactTime = plantedContact ?? runningContact;
      if (ace ? contactTime !== null : canSmash || canReturn) {
        if (ace) ai.runningSwing = runningContact !== null;
        ai.swing = .42;
        ai.swingAge = 0;
        ai.strokeConnected = false;
        ai.swingCooldown = .46;
        ai.queuedShot = chooseAIShot();
        prepareStroke(ai, contactTime ?? windup);
      }
    }
  }

  function predictObservedServe(read,time){
    if(!read.observed)return null;
    const ball={...read.observed};
    physics.advance(ball,Math.max(0,time-read.observedAt),state.venue,(kind,b)=>{
      if(kind==='net'||kind==='board'||kind==='bounce'&&b.bounceCount>=2)b.active=false;
      if(kind==='bounce')b.isServe=false;
    });
    return ball;
  }
  function observeServe(read,time){
    const b=state.ball,previous=read.previous,elapsed=time-previous.time;
    if(elapsed<=1e-9)return;
    // Velocity is estimated from successive visible positions. A sample that
    // straddles a bounce continues the last observed arc until the next sample;
    // no target coordinates, input, error seed or future true ball is consulted.
    let vx,vy,vz;
    if(previous.bounceCount===b.bounceCount){
      const factor=-Math.expm1(-.09*elapsed)/.09,decay=Math.exp(-.09*elapsed);
      vx=(b.x-previous.x)/factor*decay;vy=(b.y-previous.y)/factor*decay;
      vz=(b.z-previous.z)/elapsed-GRAVITY*elapsed/2;
    }else{
      const projected=predictObservedServe(read,time);
      if(projected){vx=projected.vx;vy=projected.vy;vz=projected.vz;}
    }
    read.previous={x:b.x,y:b.y,z:b.z,bounceCount:b.bounceCount,time};
    if(!Number.isFinite(vx))return;
    read.observed={x:b.x+read.errorX,y:b.y+read.errorY,z:b.z,
      vx:vx*(1+read.speedError),vy:vy*(1+read.speedError),vz,
      bounceCount:b.bounceCount,active:true,crossedNet:b.crossedNet,isServe:b.isServe,
      shotType:'serve',lastHit:'player',serveOriginX:b.serveOriginX};
    read.observedAt=time;
  }
  function updateServeReceiver(dt){
    const ai=state.ai,cfg=SERVE_CPU[state.difficulty];
    if(!ai.serveRead)scheduleAIRead();
    const read=ai.serveRead,time=state.time,sampleTime=state.time-dt;
    ai.reactionTimer=Math.max(0,ai.reactionTimer-dt);
    if(sampleTime+1e-9>=read.nextAt){observeServe(read,sampleTime);read.nextAt=sampleTime+cfg.observe;}
    const observed=predictObservedServe(read,time);
    if(ai.reactionTimer>0||!observed){moveAI(ai,{x:ai.x,y:ai.y},dt,true);updateLocomotion(ai,dt);return;}
    // Commit the running block to the last read while the racket is moving.
    // Fresh observations can inform a later attempt, not redirect this swing.
    if(observed.active&&!(ai.swing>0&&!ai.strokeConnected)){
      if(!read.intercept||read.planAt!==read.observedAt){
        read.intercept=observedServeIntercept(read,time);read.planAt=read.observedAt;
      }
      const target=read.intercept||contactTarget(observed,'ai');
      ai.readTarget={x:target.x,y:target.y};ai.targetX=target.x;ai.targetY=target.y;
    }
    moveAI(ai,ai.readTarget,dt);updateLocomotion(ai,dt);
    if(ai.swingCooldown>0||!observed.active)return;
    const incoming=predictObservedServe(read,time+cfg.block),runner=copyAIRunner(ai);
    for(let t=0;t<cfg.block-1e-9;t+=1/60)moveAI(runner,ai.readTarget,Math.min(1/60,cfg.block-t));
    if(!incoming?.active||incoming.bounceCount!==1||incoming.y>=-.015)return;
    const stroke=strokes.select(runner,incoming);
    const distance=Math.hypot((incoming.x-runner.x)*5.018,(incoming.y-runner.y)*11.885);
    if(!stroke.reachable||distance>SERVE.returnReachMetres*.94||incoming.z<.04||incoming.z>level().maxHitZ)return;
    ai.runningSwing=true;ai.swing=.34;ai.swingAge=0;ai.strokeConnected=false;ai.swingCooldown=.40;
    const seed=Math.floor(time*971)+state.serveSequence*7919;
    const gaussian=clamp(Math.sqrt(-2*Math.log(Math.max(.000001,seeded(seed+31))))*Math.cos(TAU*seeded(seed+67)),-2.5,2.5);
    ai.serveContactAge=Math.max(.04,cfg.block+gaussian*cfg.returnSD);
    ai.queuedShot='neutral';ai.stroke=stroke.kind;ai.racketSide=stroke.racketSide;
    ai.strokeContactAge=ai.serveContactAge;ai.strokeContactZ=incoming.z;
  }
  function observedServeIntercept(read,time){
    let best=null,score=Infinity;
    // Search the uncertain, previously observed arc. A wide serve must be met
    // before it runs into the alley; a fixed point behind every bounce cannot
    // represent that choice. Every candidate uses the normal accelerated mover.
    const swinging=state.ai.swing>0&&!state.ai.strokeConnected;
    const block=SERVE_CPU[state.difficulty].block;
    const contactAge=state.ai.serveContactAge||block;
    const firstLead=swinging?Math.max(.001,contactAge-state.ai.swingAge):block;
    for(let lead=firstLead;lead<=(swinging?contactAge+SERVE.returnContactHalfWindow-state.ai.swingAge:.72)+1e-9;lead+=.025){
      const ball=predictObservedServe(read,time+lead);
      if(!ball?.active)break;
      if(ball.bounceCount!==1||ball.z<.04||ball.z>level().maxHitZ)continue;
      const target={x:clamp(ball.x,-1.06,1.06),y:clamp(ball.y,-1.18,-.17)},runner=copyAIRunner();
      for(let t=0;t<lead;t+=1/60)moveAI(runner,target,Math.min(1/60,lead-t));
      const distance=Math.hypot((ball.x-runner.x)*5.018,(ball.y-runner.y)*11.885);
      if(distance<SERVE.returnReachMetres*.90)return target;
      const cost=distance+lead*.10;
      if(cost<score){score=cost;best=target;}
    }
    return best;
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

  function chooseAIShot() {
    const b = state.ball, p = state.player;
    const draw = seeded(Math.floor(state.time * 733));
    // Use a drop only from a ball we can attack, against a deep receiver.
    if (state.rallyHits >= 4 && b.y > -.92 && b.z > .12 && p.y > .74 && draw > .48) return 'short';
    if (p.y < .65 || b.y < -.92) return 'deep';
    return draw > .48 ? 'deep' : 'neutral';
  }

  function canContinueNet(quality, plan) {
    const ai=state.ai,b=state.ball;
    // A first volley often happens before the established-net depth cutoff.
    // Carry a real approach through that transition, but abandon a pressured
    // save or retreat. Shot direction alone is not a reason to go back.
    return usesNetTactics() && !!ai.tactics?.net && plan.shot!=='lob' &&
      !['reset','pressure-reset','recovery-lob'].includes(plan.name) &&
      quality>.32 && b.z>.12 && ai.y>-.78 && b.y>-.78 &&
      Math.abs(ai.x)<.84 && (ai.vy>-.18 || ai.y>-.46 && b.y>-.55) &&
      proContactPressure(ai,b,quality)<(isLegend()?.60:.40);
  }

  function basicNetPlan(quality, receiverX, side) {
    const ai=state.ai,b=state.ball,p=state.player;
    if (!usesNetTactics() || isPro()) return null;
    const easy=state.difficulty==='beginner';
    if(canContinueNet(quality,{shot:'neutral'}))
      return {name:'net-drive',shot:'neutral',x:side*(easy?.43:.57),pace:easy?.06:.02,net:true};
    // Lower levels see only obvious short-ball openings, and still miss some.
    // The choice is made once at contact; no extra pace or reach is granted.
    if(ai.tactics?.net || quality<(easy?.40:.36) || b.z<.18 ||
        b.y<(easy?-.62:-.72) || Math.abs(ai.x)>.58 || ai.vy<-.15 ||
        p.y<.70 || p.vy<-.20 || !(p.y>.92 || Math.abs(receiverX)>.35)) return null;
    const seed=Math.floor(state.time*733)+state.rallyHits*197+(ai.tactics?.shots||0)*89;
    if(seeded(seed+359)>=(easy?.14:.34)*netPreference()) return null;
    return {name:'approach',shot:'deep',x:side*(easy?.46:.62),pace:easy?.02:-.04,net:true};
  }

  function netReplyPlan(quality) {
    const b=state.ball,p=state.player,ai=state.ai;
    if(p.y>=.60)return null;
    const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
    const seed=Math.floor(state.time*733)+state.rallyHits*197+(ai.tactics?.shots||0)*89;
    const receiverX=clamp(p.x+p.vx*.18,-.95,.95);
    // Placement has its own draw: choosing a rare shot must not fix its lane.
    const open=Math.abs(receiverX)>.10?-Math.sign(receiverX):(seeded(seed+127)<.5?-1:1);
    const width=state.difficulty==='beginner'?.48:state.difficulty==='club'?.68:.75;
    const drive=isPro()&&Math.abs(ai.y)<=PRO_POSITION.deepOutWithin?'neutral':'deep';
    const stroke=strokes.select(ai,b);
    const pressure=proContactPressure(ai,b,quality);
    const holdNet=isPro()&&ai.y>-.46&&b.y>-.55&&quality>.48&&pressure<.30&&
      (stroke.kind.endsWith('-volley')||stroke.kind==='smash');
    const pass={name:'pass',shot:drive,x:open*width,pace:state.difficulty==='beginner'?-.06:-.10,net:holdNet};
    const depth=drive==='deep'?.90:.69;
    const groundTime=drive==='deep'?lerp(1.17,.86,quality):lerp(1.10,.81,quality);
    const flight=strokes.flightTime(stroke.kind,b,pass.x,depth,groundTime,quality,drive);
    const trajectory=shotTrajectory(b,pass.x,depth,flight+level().paceRelief+pass.pace,
      {...ai,stroke:stroke.kind,queuedShot:drive},false);
    const interceptTime=physics.timeToY(trajectory,p.y);
    const intercept=physics.sample(trajectory,interceptTime);
    // Estimate the available passing lane at the receiver, not at the bounce.
    // This is a coarse visible-motion read, not a prediction of their controls.
    const coverX=clamp(p.x+p.vx*Math.min(.25,interceptTime),-1.06,1.06);
    const coverMetres=level().humanReach*5.018+3.4*playerModifier(p,'footwork')*Math.max(0,interceptTime-.20);
    const covered=clamp(1-Math.abs(intercept.x-coverX)*5.018/coverMetres,0,1);
    const near=smooth((.60-p.y)/.42);
    const forward=clamp(-p.vy/.8,-1,1);
    const lift=smooth((quality-.40)/.32)*smooth((b.z-.08)/.16)*
      smooth((ai.y+1.08)/.25)*smooth((.92-Math.abs(ai.x))/.30)*(1-.7*pressure);
    const lobTime=strokes.highDeepLobPlan(b,open*.48,'ai').time;
    const chaseTime=Math.max(0,.92-p.y)*11.885/(5.5*playerModifier(p,'footwork'))+Math.max(0,-p.vy)*.20;
    const chaseLoad=clamp(chaseTime/lobTime,0,1.25);
    const recognition={beginner:.14,club:.20,ace:.24,pro:.30,legend:.34}[state.difficulty];
    // Remember several completed contacts. A pass between lobs does not erase
    // the recent lob, and repeated passes never force a lob in compensation.
    const history=ai.netShotHistory;
    const recentLobs=history?history.reduce((sum,name,i)=>sum+(name==='lob'?.72**(history.length-1-i):0),0)
      :Math.max(ai.lobRepeats||0,ai.tactics?.last==='lob'?ai.tactics.repeats:0);
    const variety=1/(1+1.8*recentLobs);
    const lobChance=stroke.kind==='smash'?0:Math.min(.48,recognition*near*(1+.65*forward)*
      lift*(.8+.6*covered)*(.65+.35*chaseLoad)*variety);
    const draw=seeded(seed+31);
    if(draw<lobChance)return {name:'lob',shot:'lob',x:open*.48,pace:0,net:false};

    // A covered lane sometimes calls for a dipping ball and another volley.
    // Only offer it when the ordinary solver actually produces a low arrival.
    if(stroke.kind!=='smash'&&quality>.48&&b.z>.16){
      const targetY=clamp(p.y+.035,.18,.62),targetX=clamp(receiverX,-.64,.64);
      const time=Math.hypot((targetX-b.x)*5.018,(targetY-b.y)*11.885)/(16+4*quality);
      const feet=shotTrajectory(b,targetX,targetY,time,{...ai,stroke:stroke.kind,queuedShot:'neutral'},false);
      const arrival=physics.sample(feet,physics.timeToY(feet,p.y));
      const feetChance=recognition*.65*near*covered;
      if(arrival.z>physics.RADIUS&&arrival.z<.38&&draw<lobChance+feetChance)
        return {name:'feet',shot:'neutral',x:targetX,depth:targetY,time,pace:0,net:holdNet};
    }
    return pass;
  }

  function legendShotPlan(quality) {
    const b=state.ball,p=state.player,ai=state.ai,q=ai.pro;
    const tactics=ai.tactics||{shots:0};
    const style=cpuStyle();
    const seed=Math.floor(state.time*733)+state.rallyHits*197+tactics.shots*89;
    const receiverX=clamp(p.x+p.vx*.18,-.95,.95);
    const open=Math.abs(receiverX)>.08?-Math.sign(receiverX):(seeded(seed+127)<.5?-1:1);
    const cross=Math.abs(b.x)>.12?-Math.sign(b.x):open;
    const pressure=proContactPressure(ai,b,quality);
    const drive=Math.abs(ai.y)<=PRO_POSITION.deepOutWithin?'neutral':'deep';
    const atNet=ai.y>-.46&&b.y>-.55;
    if(b.shotType==='short'&&b.bounceCount>0&&b.y>-.65){
      // A covered low ball can be controlled. Counterdrop only when the human
      // stays deep; forced recovery lobs are selected from the actual chase.
      if(p.y>.90&&p.vy>=0&&quality>.36&&pressure<.68&&
          tactics.last!=='counter-drop'&&seeded(seed+431)<.28)
        return {name:'counter-drop',shot:'short',x:open*.55,pace:.03,net:false};
    }
    if(pressure>.60||q?.lobRetreat&&(ai.runningSwing||ai.vy<-.15)){
      return {name:'pressure-reset',shot:pressure>.80?'neutral':drive,
        depth:lerp(.96,.85,clamp((pressure-.60)/.38,0,1)),
        x:open*(.60-.10*pressure),pace:-.02+.08*pressure,net:false};
    }
    // Depth alone is not a loss of balance. A clean baseline contact can
    // counterdrive; reserve a soft reset for genuinely awkward pickups.
    if(quality<.26||b.y<-1.19||Math.abs(ai.x)>.98||b.z<.075)
      return {name:'reset',shot:drive,x:open*.54,depth:.94,pace:.055,net:false};
    const netReply=netReplyPlan(quality);
    if(netReply)return netReply;

    // Score only visible geometry, movement and known player attributes. The
    // receiver's pending controls and the eventual point outcome are unknown.
    const ratings=playerProfile(p)?.ratings;
    const weaker=ratings?Math.sign(ratings.backhand-ratings.forehand):0;
    const wingGap=ratings?Math.abs(ratings.backhand-ratings.forehand):0;
    const centralPattern=q?.history.slice(-3).filter(h=>h.lane===0&&h.shot!=='short'&&h.shot!=='lob').length===3;
    const candidates=[];
    const add=(name,shot,x,pace,base,net=false)=>{
      const y=shot==='short'?.27:shot==='lob'?.92:shot==='neutral'?.69:drive==='deep'?.93:.69;
      const travel=Math.hypot(x-receiverX,(y-p.y)*1.5);
      const weakWing=shot!=='short'&&shot!=='lob'&&Math.sign(x-receiverX)===weaker?wingGap*.12:0;
      const repetition=tactics.last===name?(tactics.repeats>=2?.22:.08):0;
      candidates.push({name,shot:shot==='deep'?drive:shot,x,pace,net,
        ...(shot==='deep'&&drive==='deep'?{depth:.93}:{}),
        value:base+travel*.8+weakWing-repetition});
    };
    {
      const attackable=quality>.48&&b.y>-.92&&b.z>.16;
      const pace=attackable?-.13:-.06;
      add('open-court','deep',open*.76,pace,1.45,atNet);
      // The construction ball has visible margin inside the sideline. Merely
      // naming a second almost-identical wide drive "crosscourt" hides style.
      add('crosscourt','deep',cross*(style?.56:.70),pace+.035,style?1.38:1.2,atNet);
      if(weaker&&wingGap>=1)
        add('weaker-wing','deep',clamp(receiverX+weaker*.40,-.73,.73),pace+.02,1.18);
      if(Math.abs(p.vx)>.3&&p.x*p.vx<-.04)
        add('wrong-foot','deep',Math.sign(p.x)*.70,pace,1.75+Math.abs(p.vx)*.25,atNet);
      // A drop or net rush has to exploit an actual positional advantage.
      // Repeated lobs discourage approaching until a much shorter ball arrives.
      // Repeated central drives offer a safe change of depth. Recognize the
      // completed pattern instead of waiting for a rally-length error lottery.
      const changeDepth=centralPattern&&quality>.40&&b.y>-.92&&b.z>.10;
      // Ordinary prepared contacts often occur around z=.15. Touch and a
      // controlled approach need balance, not the height of an attacking drive.
      // Pressure already measures racket stretch, turning, pace and retreat.
      const extension=racketDistance(ai,b)/(level().reach*strokes.select(ai,b).reachScale);
      const balanced=style&&quality>.33&&pressure<.50&&b.z>.115&&b.y>-.94&&
        extension<.90&&Math.abs(ai.x)<.86&&ai.vy>-.12&&!q?.lobRetreat;
      const touch=balanced&&p.y>.76&&p.vy>-.12&&state.rallyHits>=5&&
        (Math.abs(receiverX)>.16||tactics.shots>=2);
      if(balanced&&!atNet&&p.y>.65)
        add('change-pace','neutral',open*.55,.055,.96);
      if(((attackable||changeDepth)&&p.y>(centralPattern?.72:.91)&&p.vy>-.15&&state.rallyHits>=3)||touch)
        add('drop','short',open*.59,.01,.55+dropShotSuccess(ai)*.55,Math.abs(ai.x)<.60);
      const buildApproach=balanced&&quality>.38&&pressure<.46&&!atNet&&b.y>-.90&&
        p.y>.72&&p.vy>-.20&&state.rallyHits>=3&&
        (Math.abs(receiverX)>.20||tactics.pattern==='all-court'&&Math.abs(open*.73-receiverX)>.58);
      const shortApproach=quality>.40&&b.z>.12&&!atNet&&Math.abs(ai.x)<.58&&
          (attackable&&b.y>-.70&&(Math.abs(receiverX)>.40||p.y>1.03)||
           centralPattern&&b.y>-.82&&p.y>.78)&&(!q?.expectLob||b.y>-.48);
      if(shortApproach||buildApproach&&(!q?.expectLob||b.y>-.48))
        add('approach','deep',open*.73,pace,shortApproach?1.65:1.10,true);
      if(atNet&&attackable)add('volley-finish',p.y>.82?'short':'deep',open*.73,-.10,1.95,true);
    }
    // Prefer the best opportunities without becoming a fixed left/right bot.
    // Modest variation also leaves patterns a human can learn and disrupt.
    const best=Math.max(...candidates.map(c=>c.value));
    for(const c of candidates){
      let preference=c.name==='approach'?netPreference():centralPattern?1:personalityWeight(c.name);
      if(style){
        // Patterns bias the next useful action, not a compulsory sequence. Keep
        // learned central counterplay while retaining each opponent's taste.
        const taste=c.name==='approach'?1:personalityWeight(c.name)**2;
        const construction=tactics.pattern==='all-court'
          ? (c.name==='approach'?2.6:1)
          :tactics.pattern==='change-up'
            ? (c.name==='drop'?1.9:c.name==='change-pace'?2:1)
            : (c.name==='drop'?.65:c.name==='approach'?.60:1);
        preference=(c.name==='approach'?netPreference():taste)*construction;
        if(centralPattern&&c.name==='drop')preference=Math.max(1.35,preference);
      }
      c.weight=Math.exp((c.value-best)*4)*preference;
    }
    let ticket=seeded(seed+31)*candidates.reduce((sum,c)=>sum+c.weight,0);
    for(const c of candidates){ticket-=c.weight;if(ticket<=0)return c;}
    return candidates.at(-1);
  }

  function proShotPlan(quality) {
    if(isLegend())return legendShotPlan(quality);
    const b = state.ball, p = state.player, ai = state.ai;
    const tactics = ai.tactics || {pattern: 'all-court', shots: 0};
    const seed = Math.floor(state.time * 733) + state.rallyHits * 197 + tactics.shots * 89;
    const draw = seeded(seed + 31), laneDraw = seeded(seed + 127);
    const receiverX = clamp(p.x + p.vx * .16, -.95, .95);
    const open = Math.abs(receiverX) > .1 ? -Math.sign(receiverX) : (laneDraw < .5 ? -1 : 1);
    const cross = Math.abs(b.x) > .12 ? -Math.sign(b.x) : open;
    const defending = quality < .30 || b.y < -1.02 || Math.abs(ai.x) > .88 || b.z < .12;
    const attackable = !defending && quality > .40 && b.y > -.92 && b.z > .14;
    const atNet = ai.y > -.46 && b.y > -.55;
    const drive = Math.abs(ai.y) <= PRO_POSITION.deepOutWithin ? 'neutral' : 'deep';
    const contactPressure=proContactPressure(ai,b,quality);
    if(isPro()&&(contactPressure>.40||ai.pro?.lobRetreat&&(ai.runningSwing||ai.vy<-.15))){
      // Saving a difficult ball leaves a playable opening. Severe pressure
      // gives a shorter reply; an ordinary retreat can still reset deep.
      return {name:'pressure-reset',shot:contactPressure>.70?'neutral':drive,
        depth:lerp(.90,.76,clamp((contactPressure-.48)/.40,0,1)),
        x:open*(.46-.10*contactPressure),pace:.06+.12*contactPressure,net:false};
    }
    const candidates = [];
    const add = (name, weight, shot, x, pace, net = false) => {
      if(name==='approach')weight*=netPreference();
      else weight*=personalityWeight(name);
      // Variety is chosen once per contact, never rerolled during ball flight.
      if (tactics.last === name) weight *= tactics.repeats >= 2 ? .12 : .5;
      // Near the net, use a controlled drive; an intentional lob keeps its arc.
      candidates.push({name, weight, shot:shot==='deep' && name!=='lob'?drive:shot, x, pace, net});
    };
    if (defending) return {name: 'reset', shot: drive, x: open * .43, pace: .20, net: false};
    const netReply=netReplyPlan(quality);
    if(netReply)return netReply;
    {
      add('crosscourt', tactics.pattern === 'pressure' ? 3 : 1.8, 'deep', cross * .64, .03, atNet);
      add('open-court', Math.abs(receiverX) > .32 ? 3.5 : 1.5, 'deep', open * .74, -.10, atNet);
      add('change-pace', tactics.pattern === 'change-up' ? 2 : .8, 'neutral', open * .55, .12, atNet);
      // Catch a recovering runner behind their momentum; avoid feeding someone
      // who is stationary or already running out toward that side.
      if (Math.abs(p.vx) > .3 && p.x * p.vx < -.04)
        add('wrong-foot', 2.5, 'deep', Math.sign(p.x) * .65, -.08, atNet);
      if (attackable && p.y > .78 && p.vy > -.3 && state.rallyHits >= 3)
        add('drop', (tactics.pattern === 'change-up' ? 3.4 : 2) * dropShotSuccess(ai),
          'short', open * .56, .02, Math.abs(ai.x) < .7);
      // Approach behind a shorter ball and an exposed receiver, rather than
      // abandoning baseline coverage just because the human is standing deep.
      if (attackable && !atNet && Math.abs(ai.x) < .65 && b.y > -.78 &&
          (p.y > .92 || Math.abs(receiverX) > .35))
        add('approach', tactics.pattern === 'all-court' ? 4 : 2.2, 'deep', open * .68, -.06, true);
    }
    if (atNet && attackable) add('volley-finish', 5, p.y > .7 ? 'short' : 'deep', open * .70, -.08, true);
    let ticket = draw * candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    for (const candidate of candidates) {
      ticket -= candidate.weight;
      if (ticket <= 0) return candidate;
    }
    return candidates[candidates.length - 1];
  }

  function aiServeReturnPlan(quality) {
    const b=state.ball, p=state.player, ai=state.ai, cfg=SERVE_RETURN[state.difficulty];
    // Judge the ball arriving at the racket, after the serve's bounce. A serve
    // number alone says nothing about its actual pace or how stretched we are.
    const speed=physics.speedKph(b);
    const stretch=clamp(Math.hypot((b.x-ai.x)*5.018,(b.y-ai.y)*11.885)/SERVE.returnReachMetres,0,1);
    const paceLoad=clamp((speed-cfg.comfortKph)/55,0,1);
    const extension=clamp((stretch-.45)/.55,0,1);
    const low=clamp((.22-b.z)/.20,0,1);
    const jam=clamp((.22-Math.abs((b.x-ai.x)*5.018))/.22,0,1)*clamp((speed-85)/45,0,1);
    const pressure=clamp(.28*paceLoad+.38*extension+.18*(1-quality)+.16*low+.08*jam,0,1);
    // A compact swing can attack a manageable serve. Arrival height, spacing
    // and preparation must support it; a second-serve label is not a bonus.
    const attack=clamp((cfg.attackKph-speed)/45,0,1)*clamp((quality-.55)/.35,0,1)*
      clamp((.78-stretch)/.45,0,1)*clamp((b.z-.08)/.20,0,1);
    const receiverX=clamp(p.x+p.vx*.16,-.95,.95);
    const draw=seeded(Math.floor(state.time*733));
    const side=Math.abs(receiverX)>.10?-Math.sign(receiverX):(draw>.5?1:-1);
    const deep=attack>.25 && !(isPro() && Math.abs(ai.y)<=PRO_POSITION.deepOutWithin);
    // Ordinary pressure reduces angle and ambition while retaining useful
    // depth. Only a genuinely compromised block collapses into a short reply.
    const emergency=clamp((pressure-.40)/.60,0,1);
    const depth=deep?lerp(.87,.93,attack):cfg.depth-.18*pressure-.44*emergency**1.3;
    const x=side*(cfg.width-.18*pressure+.06*attack);
    // Redirect some incoming pace instead of stretching every block to a
    // fixed groundstroke flight time. The normal solver still clears the net.
    const metres=Math.hypot((x-b.x)*5.018,(depth-b.y)*11.885);
    const pace=cfg.speed+2*clamp((speed-80)/60,0,1)+4*attack-6*pressure;
    return {name:deep?'return-attack':pressure>.55?'return-defense':'return-block',shot:deep?'deep':'neutral',
      x,depth,time:metres/pace,clearance:cfg.clearance+.045*pressure,pace:0,net:false,servePressure:pressure};
  }

  function aiShotPlan(quality) {
    // A legal service bounce clears isServe; shotType survives until contact.
    // Keep this separate from rally attacks, without changing human returns.
    if(state.ball.shotType==='serve' && state.ball.lastHit==='player' && state.ball.bounceCount===1)
      return aiServeReturnPlan(quality);
    const plan=aiRallyShotPlan(quality);
    // Recovery intent belongs to the continuing attack, not just a shot name.
    // Defensive lobs/resets and failed contacts still release it normally.
    return usesNetTactics() && state.ai.tactics?.net
      ? {...plan,net:!!plan.net || canContinueNet(quality,plan)} : plan;
  }

  function aiRallyShotPlan(quality) {
    if (isPro()) {
      const b=state.ball,ai=state.ai,chase=ai.pro?.shortChase;
      const pressure=proContactPressure(ai,b,quality);
      if(b.shotType==='short'&&chase?.pressure>.50&&b.z<.30&&
          (quality<.46||pressure>.52)){
        // An earned, barely reached save floats up. No fixed lob lottery:
        // distance, time, wrong-footing and the actual contact determine it.
        const strain=clamp((chase.pressure-.50)*1.30+pressure*.35,0,1);
        const receiverX=state.player.x+state.player.vx*.18;
        const open=Math.abs(receiverX)>.08?-Math.sign(receiverX):(b.x>=0?-1:1);
        return {name:'recovery-lob',shot:'lob',x:open*lerp(.52,.32,strain),
          lobPressure:strain,pace:0,net:false};
      }
      return proShotPlan(quality);
    }
    const b = state.ball, p = state.player;
    const attacking = b.y > -.88 && b.z > .16 && quality > .38;
    const defending = quality < .30 || b.y < -1.03;
    const draw = seeded(Math.floor(state.time * 733));
    // Read visible position and momentum, never the human's queued aim.
    const receiverX = clamp(p.x + p.vx * .16, -.95, .95);
    const side = Math.abs(receiverX) > .10 ? -Math.sign(receiverX) : (draw > .5 ? 1 : -1);
    const netReply=!defending?netReplyPlan(quality):null;
    if(netReply)return netReply;
    const netPlan=!defending?basicNetPlan(quality,receiverX,side):null;
    if(netPlan)return netPlan;
    const width = state.difficulty === 'beginner' ? .48 : state.difficulty === 'club' ? .68 : .77;
    // Keep unstyled opponents on the existing
    // path. Basic personalities use the same reads, widths and pace as before;
    // only a clean rally contact offers a choice of construction.
    if(cpuStyle()&&!defending&&b.y>=-.92&&b.z>.12&&Math.abs(state.ai.x)<.88)
      return basicPersonalityPlan(quality,side,width,attacking);
    const shot = defending ? 'deep' : chooseAIShot();
    return { shot, x: side * width * (defending ? .55 : attacking ? 1 : .82),
      pace: defending ? .16 : attacking ? (state.difficulty === 'beginner' ? -.06 : -.15) : 0 };
  }

  function basicPersonalityPlan(quality,side,width,attacking) {
    const b=state.ball,p=state.player,t=state.ai.tactics;
    const seed=Math.floor(state.time*733)+state.rallyHits*197+(t?.shots||0)*89;
    const cross=Math.abs(b.x)>.12?-Math.sign(b.x):side;
    const x=width*(attacking?1:.82);
    const pace=attacking?(state.difficulty==='beginner'?-.06:-.15):0;
    const canDrop=attacking&&state.rallyHits>=4&&p.y>.74&&p.vy>=-.3;
    const candidates=[];
    const add=(name,shot,lane,weight)=>{
      weight*=personalityWeight(name);
      if(t?.last===name)weight*=t.repeats>=2?.12:.5;
      candidates.push({name,shot,x:lane,pace,weight});
    };
    // Crosscourt stays inside the existing ordinary drive width. A point plan
    // affects which rally ball sets up the opening, not its execution envelope.
    add('crosscourt','deep',cross*x*.82,(canDrop?.30:.45)*(t?.pattern==='pressure'?1.15:1));
    add('open-court','deep',side*x,canDrop?.30:.63);
    add('change-pace','neutral',side*x,canDrop?.50:1);
    if(canDrop)add('drop','short',side*x,.90*(t?.pattern==='change-up'?1.15:1));
    let ticket=seeded(seed+31)*candidates.reduce((sum,c)=>sum+c.weight,0);
    for(const c of candidates){ticket-=c.weight;if(ticket<=0)return c;}
    return candidates.at(-1);
  }

  function serveBalancedContactAhead(player,dt,quality) {
    const read=player.serveRead,step=dt||1/60,age=player.swingAge+step;
    if(!player.runningSwing||!read?.observed||!player.readTarget||!Number.isFinite(player.serveContactAge)||
        age>player.serveContactAge+SERVE.returnContactHalfWindow-1e-9)return false;
    // Consider only the next frame of the same committed swing. Use the
    // receiver's uncertain observation, never the true future ball velocity.
    const now=predictObservedServe(read,state.time),incoming=predictObservedServe(read,state.time+step);
    if(!now?.active||!incoming?.active||incoming.bounceCount!==1||incoming.y>=-.015||incoming.vy>=0||
        incoming.z<.04||incoming.z>level().maxHitZ)return false;
    const runner=copyAIRunner(player);moveAI(runner,player.readTarget,step);
    const stroke=strokes.select(runner,incoming);
    const extension=.92+.08*clamp(1-Math.abs(age-player.serveContactAge)/SERVE.returnContactHalfWindow,0,1);
    const reach=SERVE.returnReachMetres/5.018*stroke.reachScale*extension;
    const distance=racketDistance(runner,incoming);
    const error=Math.hypot((now.x-state.ball.x)*5.018,(now.y-state.ball.y)*11.885)/5.018;
    const projected=.12+clamp(1-distance/reach,0,1)*.62+
      clamp(1-Math.abs(age-SERVE_CPU[state.difficulty].block)/.17,0,1)*.26;
    // Forecast disagreement consumes the safety margin. If a clearly better,
    // comfortable contact is not available, keep the current emergency pickup.
    return stroke.reachable&&distance<reach*.86&&distance+error+.08/5.018<reach&&projected>quality+.04;
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
  return {state,SHOT,SERVE,capabilities,resetMatch,applyInput,selectShot,setServeAim,getServeFeedback,serveQuality,
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
});
