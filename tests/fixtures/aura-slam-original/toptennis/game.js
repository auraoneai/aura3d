(() => {
  'use strict';

  // Keep Swipe implemented, but unavailable to players until re-enabled here.
  const MOBILE_SWIPE_ENABLED = false;

  const canvas = document.getElementById('game');
  let sceneRenderer = null;
  // Stadium stage is renderer metadata, never part of the engine or its saves.
  let tournamentPresentation = null;
  if (window.TennisScene) {
    try { sceneRenderer = window.TennisScene.createRenderer(canvas); }
    catch (error) { window.TennisAnalytics?.loadFailure('webgl_unavailable'); document.getElementById('render-error').hidden = false; console.error(error); }
  }
  if (!sceneRenderer) window.TennisAnalytics?.loadFailure('renderer_unavailable');
  canvas.addEventListener('webglcontextlost', () => window.TennisAnalytics?.loadFailure('webgl_context_lost'));
  const menu = document.getElementById('menu');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('result-title');
  const resultScore = document.getElementById('result-score');
  const playerNameInput = document.getElementById('player-name');
  let playerName = '';
  try { playerName = (localStorage.getItem('baseline.playerName') || '').trim().slice(0,20); } catch {}
  playerNameInput.value = playerName;
  const startButton = document.getElementById('start-btn');
  const rematchButton = document.getElementById('rematch-btn');
  const soundButton = document.getElementById('sound-btn');
  const fullscreenButton = document.getElementById('fullscreen-btn');
  const venueEyebrow = document.getElementById('venue-eyebrow');

  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 60;
  const physics = window.TennisPhysics;
  const strokes = window.TennisStrokes;
  const NET_HEIGHT = physics.NET_HEIGHT;
  const GRAVITY = physics.GRAVITY;
  const SINGLES_X = .82;
  const SHOT = Object.freeze({ aimWindow: .18, contactOpens: .16, doubleTapWindow: .22,
    energyMax: 100, powerCost: 38, recoveryPerSecond: 6, recoveryDelay: 1 });
  const keys = Object.create(null);
  const controls = window.TennisControls;
  const physicalKeys = new Set(), blockedKeys = new Set();
  const controller = {index:null, id:null, hitLabel:'A', x:0, y:0, power:false, buttons:[], blocked:true};

  function controlsOpen() { return Boolean(window.TennisControlSettings?.isOpen()); }
  function inputOverlayOpen() {
    return controlsOpen() || Boolean(window.TennisPlayerSelect?.isOpen() || window.TennisAppearanceSelect?.isOpen() || window.TennisTournamentView?.isOpen());
  }
  function tourBlocksPlay() {
    const tour=window.TennisTour;
    return !!state.eventId && !!(tour?.blocksPlay ? tour.blocksPlay() : tour?.hasPending());
  }
  function trackPhysicalKeyDown(event) {
    physicalKeys.add(event.code);
    // Observe releases even when a dialog consumes the bubbling event.
    if(event.ctrlKey || event.altKey || event.metaKey || event.isComposing){
      for(const code of physicalKeys){blockedKeys.add(code);keys[code]=false;}
    }
  }
  function trackPhysicalKeyUp(event) {
    physicalKeys.delete(event.code);blockedKeys.delete(event.code);keys[event.code]=false;
  }
  function keyLabel(action,all=false) { return controls.labelFor(action,'keyboard',{all}); }
  function movementLabel() {
    const bindings=controls.getBindings('keyboard');
    return ['up','left','down','right'].every((id,index)=>bindings[id][0]===['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'][index] && bindings[id][1]===['KeyW','KeyA','KeyS','KeyD'][index])
      ? 'arrows/WASD' : ['up','left','down','right'].map(id=>keyLabel(id,true)).join(' · ');
  }

  function controlText(text) {
    const labels={'Space':keyLabel('hit'),'SPACE':keyLabel('hit').toUpperCase(),'Shift':keyLabel('power',true),
      'Q/E':keyLabel('short')+'/'+keyLabel('deep'),'Q':keyLabel('short'),'E':keyLabel('deep'),'R':keyLabel('lob'),'C':keyLabel('placement'),
      'arrows/WASD':movementLabel(),'Arrows/WASD':movementLabel()};
    return text.replace(/\b(?:arrows\/WASD|Arrows\/WASD|SPACE|Space|Shift|Q\/E|Q|E|R|C)\b/g,token=>labels[token]);
  }

  function pollController() {
    let pads=[];
    try { pads=Array.from(navigator.getGamepads?.() || []); } catch {}
    const pad=pads.find(p=>p?.connected && p.mapping==='standard' && p.index===controller.index)
      || pads.find(p=>p?.connected && p.mapping==='standard');
    const previousIndex=controller.index;
    const previousId=controller.id;
    controller.index=pad?.index ?? null;
    controller.id=pad?.id ?? null;
    const playStation=pad && /054c|dualshock|dualsense|playstation|sony|wireless controller/i.test(pad.id) && !/xbox|xinput|045e/i.test(pad.id);
    controller.hitLabel=controls.labelFor('hit','controller',{playStation}).toUpperCase();
    controller.x=controller.y=0;controller.power=false;
    const help=document.getElementById('controller-status');
    const status=pad?`Controller connected. ${controls.labelFor('hit','controller',{playStation})}: hit. Use the mouse to select a match.`:pads.some(p=>p?.connected)
      ?'Controller layout not recognized. Try a USB connection in Chrome or Edge.'
      :'Connect your controller, then press a controller button.';
    if(help && help.textContent!==status)help.textContent=status;
    window.TennisControlSettings?.pollController(pad || null);
    if(!pad){
      controller.buttons=[];controller.blocked=true;
      if(previousIndex!==null){
        clearInputs();
        if(state.mode==='playing' && !state.paused && !window.TennisOnline?.active)togglePause();
      }
      return;
    }
    const buttons=pad.buttons.map(b=>b.pressed || b.value>.5);
    const pressed=i=>buttons[i] && !controller.buttons[i];
    if(previousIndex!==pad.index || previousId!==pad.id)controller.blocked=true;
    if(document.hidden || !document.hasFocus() || workMode || inputOverlayOpen() || document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){
      controller.blocked=true;controller.buttons=buttons;return;
    }
    // Require neutral input after focus, connection, pause or a menu change.
    // This prevents a held button from starting a shot on return to play.
    if(controller.blocked){
      controller.blocked=buttons.some(Boolean) || Math.abs(pad.axes[0]||0)>.18 || Math.abs(pad.axes[1]||0)>.18;
      controller.buttons=buttons;return;
    }
    const pause=pressed(9);
    if(pause){controller.buttons=buttons;togglePause();return;}
    if(touchPlayEnabled() && !swipeActive()){
      const axis=value=>Math.abs(value||0)<=.18?0:Math.sign(value)*Math.min(1,(Math.abs(value)-.18)/.82);
      controller.x=buttons[14]||buttons[15]?Number(!!buttons[15])-Number(!!buttons[14]):axis(pad.axes[0]);
      controller.y=buttons[12]||buttons[13]?Number(!!buttons[13])-Number(!!buttons[12]):axis(pad.axes[1]);
      controller.power=!!buttons[controls.buttonFor('power')];
      if(pressed(controls.buttonFor('short')))selectShot(selectedShot==='short'?'neutral':'short');
      if(pressed(controls.buttonFor('deep')))selectShot(selectedShot==='deep'?'neutral':'deep');
      if(pressed(controls.buttonFor('lob')) && intentionalLobEnabled())selectShot(selectedShot==='lob'?'neutral':'lob');
      if(pressed(controls.buttonFor('hit'))){initAudio();requestSwing(undefined,controller.power);}
    }
    controller.buttons=buttons;
  }
  const touchControls = document.getElementById('touch-controls');
  const touchJoystick = document.getElementById('touch-joystick');
  const touchThumb = document.getElementById('touch-stick-thumb');
  const touchHit = document.getElementById('touch-hit');
  const touchLob = document.getElementById('touch-lob');
  const touchPowerServe = document.getElementById('touch-power-serve');
  const swipeOverlay = document.getElementById('swipe-controls');
  const swipePad = document.getElementById('swipe-pad');
  const swipeGesture = window.TennisSwipe?.createGesture() || null;
  let swipePointerTarget=null, swipeBoundary='', swipeEffectiveStyle='classic', swipeNotice='', swipeNoticeUntil=0;
  let swipeAimOrigin=null,swipeVisual={state:'idle',target:null,trajectoryPoints:0};
  let hitPointerId = null;
  let lobPointerId = null;
  // The visible stick and existing court gestures share the same analog input.
  const touchStick = {pointerId:null, originX:0, originY:0, x:0, y:0, dragged:false, usedSecondFinger:false, startedAt:0, target:null, radius:48};
  const TOUCH_DEAD_ZONE = 10;
  const TOUCH_RADIUS = 48;
  const TOUCH_TAP_MS = 280;

  let selectedDifficulty = 'beginner';
  let selectedVenue = 'hard';
  let lastTime = performance.now();
  let accumulator = 0;
  let manualStepping = false;
  const audio = window.TennisAudio?.create();
  let soundEnabled = document.documentElement.dataset.embed !== 'true';
  if(!soundEnabled)audio?.setEnabled(false);
  let workMode = false, workWasPaused = false, workTitle = '';
  const workSheet = document.getElementById('work-sheet');
  let selectedShot = 'neutral';
  let scoreboardNames = offlineNames();
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

  const venues = {
    hard: {
      name: 'New York', surface: 'Hard court', short: 'NY HARD', session: 'NIGHT SESSION',
      accent: '#d9ff4f', line: '#f7fbff',
      skyTop: '#031226', skyMid: '#174a78', skyBottom: '#f1756c', glow: 'rgba(255,172,103,.64)',
      bowl: '#09192c', bowlInner: '#142f4e', crowd: '#99aec0', crowdAccent: '#dcff52',
      outerTop: '#154e91', outerBottom: '#092d62', court: '#2389c4', courtAlt: '#1c77b8',
      netPost: '#173858', netTrim: '#d8e8ed', mark: '#c9ecff', particle: '#6cc8ff'
    },
    grass: {
      name: 'London', surface: 'Grass court', short: 'LDN GRASS', session: 'CENTRE COURT',
      accent: '#f1dc7a', line: '#fffdf2',
      skyTop: '#9ab6c1', skyMid: '#cbd9d7', skyBottom: '#eef0db', glow: 'rgba(255,247,196,.5)',
      bowl: '#17382c', bowlInner: '#315542', crowd: '#d7d7ca', crowdAccent: '#f0df91',
      outerTop: '#183f2b', outerBottom: '#102b20', court: '#3f8050', courtAlt: '#4a8c59',
      netPost: '#294238', netTrim: '#f1eee1', mark: '#c9d7b5', particle: '#a8c78e'
    },
    clay: {
      name: 'Paris', surface: 'Clay court', short: 'PARIS CLAY', session: 'EVENING SESSION',
      accent: '#8de7f1', line: '#fff8ec',
      skyTop: '#39536c', skyMid: '#ef9b77', skyBottom: '#ffd6a7', glow: 'rgba(255,207,133,.7)',
      bowl: '#172841', bowlInner: '#304761', crowd: '#c8c8bf', crowdAccent: '#78dce8',
      outerTop: '#873824', outerBottom: '#572318', court: '#c96343', courtAlt: '#b9573b',
      netPost: '#173c58', netTrim: '#edf3ee', mark: '#f1ae86', particle: '#e88d63'
    }
  };


  // Destination arenas are regulation hard courts; the setting changes the
  // scenery and outfit, while bounce, gravity and player abilities stay familiar.
  for (const [id,name,short,session,accent] of [
    ['desert','Dubai Desert','DUBAI DESERT','DUNE COURT','#f2c08a'],
    ['beach','Tropical Beach','TROPICAL BEACH','OCEANSIDE COURT','#91e7de'],
    ['moon','The Moon','THE MOON','EARTH GRAVITY · APOLLO SUITS','#cedbff']
  ]) venues[id]={...venues.hard,name,short,session,accent,surface:'Hard court',destination:true};

  const engineOptions={allowSwipe:MOBILE_SWIPE_ENABLED,readInput:side=>side==='player'?{...directionInput(),power:actionDown('power')}:null,
    onEvent:event=>{
      if(event.type==='tone')playTone(...event.args);
      if(event.type==='hit')playHit(event.args?.[0],event.contact);
      if(event.type==='bounce')playBounce(event.contact);
      if(event.type==='pointSound')playPointSound(event.won);
      if(event.type==='selection'&&event.side==='player')selectShotUI(event.shot);
      if(event.type==='complete')finishMatch();
    }};
  let engineFactory=window.TennisEngine,engine=engineFactory.create(engineOptions);
  let state=engine.state; state.mode='menu';state.phase='menu';
  if(window.TennisAppearanceSelect)state.player.appearance=window.TennisAppearanceSelect.selection();
  const {makePlayer,makeBall,seeded,resetPlayers,pointIndex,getServeGeometry,positionPlayersForServe,prepareServe,beginServeToss,strikeServe,registerServeFault,replayLet,pointLabel,awardPoint,cancelShotInput,requestPower,prepareStroke,update:offlineUpdate,updatePlayer,contactTarget,scheduleAIRead,aiRecoveryTarget,updateAI,updateLocomotion,chooseAIShot,aiShotPlan,attemptContact,timingLabel,launchBallToTarget,isServeLandingValid,updateBall,updateBallTrail,handleBallEvent,burstAt,updateParticles}=new Proxy({}, {get:(_,name)=>(...args)=>engine[name](...args)});
  const level=(...args)=>engine.level(...args);
  function mobileTouchAvailable(){
    return (navigator.maxTouchPoints||0)>0 || Boolean(window.matchMedia?.('(any-pointer: coarse)').matches);
  }
  function swipeActive(){
    return MOBILE_SWIPE_ENABLED && state.mode==='playing' && !window.TennisOnline?.active && !state.eventId && engine.getSwipeState?.().effectiveStyle==='swipe';
  }
  function mobileControls(){
    const mode=window.TennisMenu?.debug?.().mode;
    const online=Boolean(window.TennisOnline?.active || state.mode==='menu'&&mode==='online');
    const tournament=state.mode==='playing'?Boolean(state.eventId):mode==='tournament';
    const supported=Boolean((state.mode==='playing'?engineFactory:window.TennisEngine).capabilities?.swipeControls);
    const available=MOBILE_SWIPE_ENABLED && mobileTouchAvailable() && supported && !online && !tournament;
    const current=engine.getSwipeState?.();
    const reason=!MOBILE_SWIPE_ENABLED?'Swipe controls are currently disabled. Use Classic controls.':online?'Online uses Classic controls.':tournament?'Tournament uses Classic controls.':!mobileTouchAvailable()?'Swipe gameplay needs a touchscreen.':!supported?'This saved engine uses Classic controls.':'';
    return {enabled:MOBILE_SWIPE_ENABLED,preferred:MOBILE_SWIPE_ENABLED?window.TennisSwipe?.getPreference()||'classic':'classic',effective:available&&current?.effectiveStyle==='swipe'?'swipe':'classic',
      pending:available?current?.pendingStyle||null:null,available,reason};
  }
  function applyMobilePreference(){
    clearInputs();
    if(state.mode==='playing' && mobileControls().available)engine.setControlStyle?.(window.TennisSwipe.getPreference());
    swipeBoundary='';render();
  }
  function clearSwipeGesture(cancelIntent=true){
    const pointerId=swipeGesture?.snapshot().pointerId;
    swipeGesture?.cancel();
    swipeAimOrigin=null;
    const target=swipePointerTarget;swipePointerTarget=null;
    if(pointerId!=null && target?.hasPointerCapture?.(pointerId))target.releasePointerCapture(pointerId);
    if(cancelIntent)engine.cancelSwipeShot?.();
    swipeNotice='';swipeNoticeUntil=0;
  }
  function syncSwipeBoundary(){
    const swipe=engine.getSwipeState?.();
    const effective=swipe?.effectiveStyle||'classic';
    if(effective!==swipeEffectiveStyle){
      swipeEffectiveStyle=effective;
      clearInputs(); // Require fresh physical input after either control policy changes.
    }
    const key=[swipe?.effectiveStyle,swipe?.pointEpoch,swipe?.attemptKey,state.rallyHits,state.mode].join(':');
    if(key!==swipeBoundary){clearSwipeGesture(false);swipeBoundary=key;}
  }
  function captureAim(){engine.captureAim();}
  function modernServeEnabled(){return Boolean(engineFactory.capabilities?.serveTargeting);}
  function serveFeedback(){const feedback=modernServeEnabled()?engine.getServeFeedback(manualStepping?0:Math.min(.05,accumulator+FIXED_DT)):null;return feedback&&swipeActive()?{...feedback,showPressCue:false,swipe:true}:feedback;}
  function inputEventTime(event){
    if(manualStepping || !Number.isFinite(event?.timeStamp))return state.time;
    const elapsed=clamp((event.timeStamp-lastTime)/1000,0,FIXED_DT);
    return state.time+clamp(accumulator+elapsed,0,.05);
  }
  function requestSwing(event,forcePower=false){
    if(inputOverlayOpen() || swipeActive())return;
    const eventTime=inputEventTime(event);
    if(window.TennisOnline?.active){window.TennisOnline.swing({eventTime,forcePower});return;}
    if(state.mode==='menu'){if(window.TennisMenu)window.TennisMenu.launch();else resetMatch();}
    else if(state.mode==='gameover'){if(window.TennisMenu)window.TennisMenu.replay();else resetMatch();}
    else if(!tourBlocksPlay())engine.requestSwing('player',eventTime,forcePower);
  }

  let recordedTourPoints = -1;

  function update(dt){
    window.TennisMenu?.tick(dt);
    if(window.TennisOnline?.active)window.TennisOnline.tick(dt);
    else {
      // Locally buffered points do not interrupt play. Stop only when the
      // recovery copy or ownership of the tournament needs attention.
      if(state.mode==='playing'&&tourBlocksPlay()&&state.phase!=='point')return;
      offlineUpdate(dt);
      syncSwipeBoundary();
      if(state.eventId&&state.mode==='playing'){
        const count=state.stats.pointsWon+state.stats.pointsLost;
        if(count>recordedTourPoints&&window.TennisTour.checkpoint(engine.snapshot()))recordedTourPoints=count;
      }
    }
  }

  function offlineNames() {
    if (!window.TennisRoster?.ENABLED) return {player:playerName || 'PLAYER',ai:'CPU'};
    const tournamentMatch = window.TennisMenu?.matchConfig?.();
    if (tournamentMatch) return {...tournamentMatch.names};
    const selected = window.TennisPlayerSelect?.selection();
    return selected ? {player:selected.player?.id==='custom'?(playerName||'PLAYER'):window.TennisRoster.get(selected.player).name,ai:window.TennisRoster.get(selected.ai).name} : {player:'PLAYER',ai:'OPPONENT'};
  }

  function acceptPlayerName() {
    if (window.TennisRoster?.ENABLED && !window.TennisPlayerSelect?.isCustom?.()) {
      playerNameInput.setCustomValidity('');
      scoreboardNames = offlineNames();
      return true;
    }
    const name = playerNameInput.value.trim().replace(/\s+/g, ' ').slice(0,20);
    playerNameInput.setCustomValidity(name ? '' : 'Enter your name to play.');
    if (!playerNameInput.reportValidity()) { playerNameInput.focus(); return false; }
    playerName = name;
    playerNameInput.value = name;
    try { localStorage.setItem('baseline.playerName', name); } catch {}
    scoreboardNames = offlineNames();
    return true;
  }

  function resetMatch() {
    if(state.mode==='playing'&&!state.eventId)window.TennisSummary?.outcome('restart');
    if(window.TennisOnline?.active)return;
    const config=window.TennisMenu?.matchConfig?.();
    if(!config?.eventId&&!acceptPlayerName())return;
    if(!config?.eventId&&engineFactory!==window.TennisEngine){engineFactory=window.TennisEngine;engine=engineFactory.create(engineOptions);state=engine.state;}
    const roster = config?.roster || window.TennisPlayerSelect?.selection() || {player:'classic',ai:'classic'};
    clearInputs();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const appearance={player:config?.appearance?.player || window.TennisAppearanceSelect?.selection(),ai:window.TennisAppearance?.defaults('ai')};
    const activeMode=window.TennisMenu?.debug().mode;
    const characters=activeMode==='tournament'?config?.characters:window.TennisRoster?.ENABLED?{
      player:typeof roster.player==='string'?roster.player:null,
      ai:activeMode==='practice'?null:typeof roster.ai==='string'?roster.ai:null
    }:null;
    for(const side of ['player','ai']){
      const character=window.TennisCharacters?.get(characters?.[side]);
      if(character)appearance[side]={...character.appearance};
    }
    engine.resetMatch({difficulty:config?.difficulty||selectedDifficulty,venue:selectedVenue,roster,appearance,
      practice:activeMode==='practice',eventId:config?.eventId||null,
      allowSwipe:MOBILE_SWIPE_ENABLED && mobileTouchAvailable() && activeMode!=='tournament' && !config?.eventId,
      controlStyle:mobileControls().preferred});
    // Entrant IDs select appearances independently of gameplay profiles.
    // Custom players keep their saved personal appearance; the practice coach stays neutral.
    for(const side of ['player','ai']){
      const character=window.TennisCharacters?.get(characters?.[side]);
      if(character)state[side].characterId=character.id;
    }
    if(config?.resumeSnapshot)engine.restore(config.resumeSnapshot);
    state.eventId=config?.eventId||null;
    tournamentPresentation=config?.eventId?{eventId:config.eventId,tournamentRound:config.tournamentRound}:null;
    swipeBoundary='';syncSwipeBoundary();
    state.paused=false;
    recordedTourPoints=config?.resumeSnapshot?state.stats.pointsWon+state.stats.pointsLost:-1;
    if(state.eventId&&recordedTourPoints<0&&window.TennisTour.checkpoint(engine.snapshot()))recordedTourPoints=0;
    scoreboardNames=offlineNames();
    selectShotUI(state.player.selectedShot || 'neutral');
    window.TennisMenu?.started();
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
    menu.inert = true;
    result.classList.add('hidden');
    result.setAttribute('aria-hidden', 'true');
    result.inert = true;
    document.getElementById('match-stats').innerHTML = '';
    document.getElementById('pause-btn').classList.remove('hidden');
    syncPauseMenu();
    initAudio();
    playTone(310, .06, 'sine', .05);
    if (sceneRenderer) {
      window.TennisAnalytics?.startMatch(activeMode || 'single');
      const run=window.TennisTour?.snapshot().active;
      const fixture=run&&window.TennisTournament?.currentMatch(run.draw);
      window.TennisSummary?.start(activeMode||'single',{city:state.eventId,difficulty:state.difficulty,court:state.venue,engine:run?.engineVersion,scoring:run?.rulesVersion,policy:run?.rankingPolicyVersion,round:run?run.draw.round+1:0,resumed:!!config?.resumeSnapshot,localKey:state.eventId&&run&&fixture?run.id+':'+fixture.id:undefined});
      window.TennisGamesPlayed?.start(activeMode || 'single');
    }
  }












  function finishMatch() {
    window.TennisGamesPlayed?.complete();
    clearInputs();
    state.mode = 'gameover';
    state.phase = 'complete';
    const won = state.winner === 'player';
    window.TennisAnalytics?.completeMatch(won);
    window.TennisSummary?.outcome('completed',{won,score:state.score.playerGames+'-'+state.score.aiGames});
    resultTitle.textContent = won ? 'VICTORY' : `${scoreboardNames.ai.toUpperCase()} WINS`;
    resultScore.textContent = `${state.score.playerGames} — ${state.score.aiGames} GAMES`;
    document.getElementById('result-matchup').textContent = `${scoreboardNames.player} vs ${scoreboardNames.ai}`;
    document.getElementById('result-stats').textContent = '';
    window.TennisMatchResults?.render(document.getElementById('match-stats'),state,scoreboardNames);
    result.classList.remove('hidden');
    result.setAttribute('aria-hidden', 'false');
    result.inert = false;
    document.getElementById('pause-btn').classList.add('hidden');
    window.TennisMenu?.complete(won);
    rematchButton.focus({ preventScroll: true });
    result.scrollTop = 0;
  }

  function isStrategicDifficulty(difficulty=state.difficulty) {
    return difficulty==='pro' || difficulty==='legend';
  }

  function actionDown(action) {
    if(swipeActive() || inputOverlayOpen() || window.TennisOnline?.active && !touchPlayEnabled())return false;
    return controls.isDown(action,keys) || action==='power' && controller.power;
  }

  function aimInput() {
    const direction=directionInput();
    return (direction.aimX??direction.x) * .72;
  }

  function directionInput() {
    if(swipeActive() || inputOverlayOpen() || window.TennisOnline?.active && !touchPlayEnabled())return {x:0,y:0,vertical:false,active:false};
    const left=actionDown('left'),right=actionDown('right');
    const up=actionDown('up'),down=actionDown('down');
    const x=Math.max(-1,Math.min(1,Number(right)-Number(left)+touchStick.x+controller.x));
    const y=Math.max(-1,Math.min(1,Number(down)-Number(up)+touchStick.y+controller.y));
    const direction={x,y,vertical:up||down||Math.abs(touchStick.y)>.2||Math.abs(controller.y)>.2,active:left||right||up||down||Boolean(touchStick.x||touchStick.y||controller.x||controller.y)};
    if(modernServeEnabled() && state.server==='player' && ['serve','serveToss'].includes(state.phase)){
      const length=Math.max(1,Math.hypot(x,y));
      direction.serveAimX=x/length;direction.serveAimY=y/length;
    }
    if(isStrategicDifficulty() && state.phase==='rally' && !state.practice && !window.TennisOnline?.active &&
      touchStick.pointerId===null && (left||right)){
      const selected=state.player.selectedShot;
      const shot=selected==='lob'?'lob':direction.vertical?(y<0?'deep':y>0?'short':'neutral'):selected;
      // C adds placement margin without changing the direction's movement
      // speed. Analog touch, serves, drops and lobs keep their usual range.
      if(shot!=='short' && shot!=='lob' && actionDown('placement'))direction.aimX=x*.64/.72;
    }
    return direction;
  }

  function depthInput() {
    const direction=directionInput();
    if(direction.vertical)return direction.y<0?'deep':direction.y>0?'short':'neutral';
    return selectedShot;
  }
























  function currentVenue() { const venue=venues[state.venue]||venues.hard,event=window.TennisTourCatalog?.getEvent(state.eventId);return event?{...venue,name:event.name,short:event.city.toUpperCase(),surface:event.surface}:venue; }

  const hudValues = new Map();
  function hudText(id,value) {
    const text=String(value);
    if(hudValues.get(id)!==text){document.getElementById(id).textContent=text;hudValues.set(id,text);}
  }
  function smashAvailable(){
    const b=state.ball,p=state.player;
    if(state.phase!=='rally'||state.paused||!b.active||b.lastHit!=='ai'||b.isServe||p.swingCooldown>0)return false;
    const incoming=physics.sample(b,.28),stroke=strokes.select(p,{...b,...incoming});
    return incoming.y>.015 && incoming.vz<0 && stroke.kind==='smash' && stroke.reachable &&
      Math.hypot((incoming.x-p.x)*1.05,incoming.y-p.y)<=level().humanReach*stroke.reachScale;
  }
  function scoreboardState() {
    const s = state.score;
    const onlineRoom = window.TennisOnline?.active ? window.TennisOnline.room : null;
    const ended = state.matchWon || state.mode === 'gameover';
    const matchComplete = ended && (!onlineRoom || onlineRoom.result?.reason === 'completed' || state.matchWon);
    const game = s.playerGames + s.aiGames + (ended ? 0 : 1);
    let winner = ended ? (state.winner || (state.matchWon ? (s.playerGames > s.aiGames ? 'player' : 'ai') : null)) : null;
    if (ended && onlineRoom?.result?.winner) winner = onlineRoom.result.winner === onlineRoom.side ? 'player' : 'ai';
    let status = 'IN PLAY';
    if (ended) status = matchComplete ? 'MATCH COMPLETE' : 'MATCH ENDED';
    else if (state.paused) status = 'PAUSED';
    else if (state.phase === 'point') status = state.tiebreak ? 'TIEBREAK' : state.lastCall.startsWith('GAME') ? 'GAME WON' : 'POINT';
    else {
      const leader = s.playerPoints > s.aiPoints ? 'player' : s.aiPoints > s.playerPoints ? 'ai' : null;
      const a = Math.max(s.playerPoints, s.aiPoints), b = Math.min(s.playerPoints, s.aiPoints);
      const gamePoint = a >= 3 && a > b;
      const leaderGames = leader === 'player' ? s.playerGames : s.aiGames;
      const otherGames = leader === 'player' ? s.aiGames : s.playerGames;
      if (state.tiebreak && a >= 6 && a > b || !state.tiebreak && gamePoint && leaderGames + 1 >= 3 && leaderGames + 1 - otherGames >= 2) {
        status = 'MATCH POINT';
      } else if (state.tiebreak) status = 'TIEBREAK';
      else if (s.playerPoints >= 3 && s.playerPoints === s.aiPoints) status = 'DEUCE';
      else if (gamePoint && leader !== state.server) status = 'BREAK POINT';
      else if (s.playerPoints >= 3 && s.aiPoints >= 3 && leader) status = 'ADVANTAGE';
      else if (state.phase === 'serve' || state.phase === 'serveToss') status = state.serveNumber === 2 ? '2ND SERVE' : '1ST SERVE';
    }
    return {
      format: 'first-to-three-games', game, status,
      names: {...scoreboardNames},
      server: ended ? null : state.server, winner,
      complete: Boolean(ended), pointsHeading: 'POINTS',
      gameLabel: ended ? status : state.tiebreak ? 'TIEBREAK' : `GAME ${game}`,
      formatLabel: ended ? 'GAMES WON' : state.tiebreak ? 'FIRST TO 7 POINTS · WIN BY 2' : 'FIRST TO 3 GAMES · WIN BY 2',
      points: {
        player: ended && !state.tiebreak ? '–' : state.tiebreak ? String(s.playerPoints) : pointLabel(s.playerPoints, s.aiPoints),
        ai: ended && !state.tiebreak ? '–' : state.tiebreak ? String(s.aiPoints) : pointLabel(s.aiPoints, s.playerPoints)
      }
    };
  }
  function renderScoreboard() {
    const board = scoreboardState();
    const el = document.getElementById('scoreboard');
    el.classList.toggle('complete', board.complete);
    hudText('hud-game-label', board.gameLabel);
    hudText('hud-points-heading', board.pointsHeading);
    hudText('hud-score-status', board.status);
    hudText('hud-score-format', board.formatLabel);
    for (const [side, id] of [['player', 'you'], ['ai', 'cpu']]) {
      hudText(`hud-${id}-label`, scoreboardNames[side]);
      document.getElementById(`hud-${id}-label`).title = scoreboardNames[side];
      hudText(`hud-${id}-games`, state.score[side === 'player' ? 'playerGames' : 'aiGames']);
      hudText(`hud-${id}-points`, board.points[side]);
      const row = document.getElementById(`hud-${id}-row`);
      row.classList.toggle('serving', board.server === side);
      row.classList.toggle('winner', board.winner === side);
      document.getElementById(`hud-${id}-serve`).hidden = board.server !== side;
    }
    const serving = board.server ? ` ${scoreboardNames[board.server]} serving.` : '';
    const winner = board.winner ? ` ${scoreboardNames[board.winner]} wins.` : '';
    hudText('hud-score-announcement', `${board.gameLabel}. ${scoreboardNames.player}: ${state.score.playerGames} games, ${board.points.player} points. ${scoreboardNames.ai}: ${state.score.aiGames} games, ${board.points.ai} points. ${board.status}.${serving}${winner}`);
  }
  function renderPracticeHud(){
    const drill=state.practice,el=document.getElementById('practice-hud');
    el.classList.toggle('hidden',!drill||state.mode==='menu');
    document.getElementById('scoreboard').classList.toggle('hidden',Boolean(drill)&&state.mode!=='menu');
    if(!drill)return;
    hudText('practice-streak',`STREAK ${drill.streak}`);
    hudText('practice-smashes',`${drill.smashes} / ${drill.completed}`);
    hudText('practice-perfect',drill.perfect);
    hudText('practice-speed',drill.bestSpeed?`${drill.bestSpeed} km/h`:'—');
    hudText('practice-result',drill.lastResult||controlText('Move under the lob and press Space before contact.'));
  }
  function ballSpeedState() {
    const moving = state.ball.active || state.ball.settling || state.phase === 'serveToss';
    return { speedKph: moving ? physics.speedKph(state.ball) : 0,
      lastShotSpeedKph: state.lastShotSpeed, maxKph: 250 };
  }
  function renderSpeedometer() {
    const speed = ballSpeedState();
    const fraction = clamp(speed.speedKph / speed.maxKph, 0, 1);
    hudText('hud-speed', speed.speedKph);
    hudText('hud-last-speed', speed.lastShotSpeedKph > 0 ? speed.lastShotSpeedKph + ' km/h' : '—');
    document.getElementById('speed-arc').setAttribute('stroke-dasharray', `${fraction * 100} 100`);
    document.getElementById('speed-needle').setAttribute('transform', `rotate(${fraction * 180} 64 64)`);
    document.getElementById('speed-live').classList.toggle('moving', speed.speedKph > 0);
    document.getElementById('speedometer').setAttribute('aria-label', `Ball speed ${speed.speedKph} kilometers per hour. Last shot ${speed.lastShotSpeedKph} kilometers per hour.`);
  }
  function serveStatsText(side){
    const stats=state[side].stats?.serve;
    if(!stats)return '';
    const rate=(made,total)=>total?Math.round(100*made/total)+'%':'—';
    const average=stats.speedCount?Math.round(stats.speedTotal/stats.speedCount)+' km/h':'—';
    const firstAverage=stats.firstSpeedCount?Math.round(stats.firstSpeedTotal/stats.firstSpeedCount)+' km/h':'—';
    const secondAverage=stats.secondSpeedCount?Math.round(stats.secondSpeedTotal/stats.secondSpeedCount)+' km/h':'—';
    return `${scoreboardNames[side]} · ${stats.aces} aces · ${stats.doubleFaults} double faults · 1st in ${rate(stats.firstIn,stats.firstAttempts)} · 2nd in ${rate(stats.secondIn,stats.secondAttempts)} · ${stats.unreturned} unreturned · serve points ${rate(stats.pointsWon,stats.pointsPlayed)} · power in ${rate(stats.powerIn,stats.powerAttempts)} · average ${average} (1st ${firstAverage}, 2nd ${secondAverage}) · fastest ${stats.fastest||'—'} km/h`;
  }
  function serveTimingText(attempt){return attempt?.timing==='PERFECT'?'CENTERED':attempt?.timing||'';}
  function serveFaultText(attempt){
    return [serveTimingText(attempt),attempt.power?'POWER +0.5 m':'',
      `${attempt.result==='doubleFault'?'DOUBLE FAULT':'FAULT'} — ${attempt.faultReason}`].filter(Boolean).join(' · ');
  }
  function withServeFaultTiming(call){
    const attempt=state.serveAttempt;
    if(!call || !modernServeEnabled() || !attempt?.faultReason)return call;
    if(state.phase==='serveFault' && attempt.result==='fault')return `${serveFaultText(attempt)} • SECOND SERVE`;
    if(state.phase==='point' && attempt.result==='doubleFault'){
      const fault=serveFaultText(attempt);
      return call.includes('DOUBLE FAULT')?call.replace('DOUBLE FAULT',fault):`${call} · ${fault}`;
    }
    return call;
  }
  function renderServeFeedback(feedback){
    const card=document.getElementById('serve-feedback');
    if(!card)return;
    card.hidden=!modernServeEnabled() || Boolean(state.practice) || state.mode==='menu';
    if(card.hidden)return;
    const serving=state.server==='player' && ['serve','serveToss','serveSwing'].includes(state.phase);
    const attempt=state.serveAttempt;
    const recent=attempt?.launchSpeedKph>0||attempt?.faultReason?attempt:state.lastServe;
    const speed=recent?.launchSpeedKph||state.lastServe?.launchSpeedKph;
    hudText('serve-launch-speed',speed>0?`${Math.round(speed)} km/h`:'—');
    hudText('serve-launch-label',recent?.server?`${scoreboardNames[recent.server]} · SERVE`:'SERVE LAUNCH');
    let hint='SERVE';
    if(serving){
      const locked=attempt?.lockedAim;
      hint=locked?(attempt.power?'POWER · +0.5 m depth':'AIM LOCKED · 240 ms swing'):'MOVE TARGET · WIDE / BODY / T';
      if(feedback?.netRisk)hint='NET RISK · MOVE TARGET DEEPER';
      else if(attempt?.power && feedback?.powerLongRisk)hint='POWER · +0.5 m · LONG RISK';
    }else if(recent?.result==='ace')hint=`ACE · ${scoreboardNames[recent.server]}`;
    else if(recent?.result==='let')hint=`LET · REPLAY ${recent.number===2?'SECOND':'FIRST'} SERVE`;
    else if(recent?.faultReason)hint=serveFaultText(recent);
    else if(recent?.quality!=null)hint=`${serveTimingText(recent)||'OFF-CENTER'}${recent.power?' · POWER +0.5 m':''} · ${recent.actual?(recent.legal===false?'FAULT':'IN'):/fault/i.test(recent.result||'')?'FAULT':'IN FLIGHT'}`;
    hudText('serve-hint',hint);
    card.classList.toggle('powered',Boolean(serving?attempt?.power:recent?.power));
    card.classList.toggle('warning',Boolean(serving && (feedback?.netRisk || attempt?.power&&feedback?.powerLongRisk)));
    for(const side of ['player','ai'])hudText(`serve-stats-${side}`,serveStatsText(side));
  }
  function renderServeInstructions(){
    const modern=modernServeEnabled();
    const lobHelp=engineFactory.capabilities?.intentionalLobAllLevels?' In rallies, press LOB once to swing a high shot near the opposite baseline. Hold left/right to aim.':isStrategicDifficulty()?' In Ace and Legend rallies, press LOB once to swing a lob. Hold left/right to aim.':'';
    hudText('serve-keyboard-help',controlText(modern?'Move the service target with arrows/WASD. Space tosses. Press Space as the rising ball reaches the overhead circle to start a 240 ms swing and lock aim.':'Tap to toss your serve. Tap again near the top to strike.'));
    hudText('serve-power-help',controlText(modern?'On serve, press Space twice within 0.22 seconds during the swing for power and +0.5 m depth. No energy cost. Rally power still needs 38 energy.':'During a rally, press twice within 0.22 seconds before contact, or Shift + Space. Needs 38 power.'));
    hudText('serve-touch-help',(modern?'Drag the joystick or court to move; during serve setup and toss, drag moves only the target. HIT tosses; press HIT as the rising ball reaches the overhead circle to start the swing and lock aim. Double HIT within 0.22 seconds adds power, or use POWER HIT. Releasing a drag never swings.':'Drag the joystick to move and aim. HIT tosses; tap again near the top to serve. Double HIT during a rally swing adds power.')+lobHelp);
    hudText('lob-keyboard-help',controlText(engineFactory.capabilities?.intentionalLobAllLevels?'In a rally, press R to swing a high, deep lob. Hold left/right to aim; depth is automatic and power is ignored.':'In Ace and Legend rallies, press R to swing a lob. Hold left/right to aim.'));
    hudText('serve-intro-help',controlText(modern?'AIM · TOSS · PRESS AS THE RISING BALL REACHES THE CIRCLE':'SPACE TO TOSS · SPACE AGAIN AT THE TOP TO SERVE'));
    if(swipeActive()){
      hudText('serve-touch-help','Swipe in the direction you want to hit. A longer upward swipe lands deeper; a faster swipe adds power. The target locks when you lift your finger. Movement and contact timing are automatic. Swipe once for each shot, including your serve.');
      hudText('serve-intro-help','SWIPE TO AIM AND SERVE');
    }
  }
  function swipeServing(){return state.server==='player'&&['serve','serveToss','serveSwing'].includes(state.phase);}
  function swipeOrigin(swipe=engine.getSwipeState()){
    const point=swipe.targetingOrigin||swipe.autoTarget||state.player;
    return {x:point.x,y:point.y,z:point.z??(swipeServing()?1.04:state.practice?.currentSmash?1:.5)};
  }
  function resolveSwipeDirection(shot){
    if(!shot)return null;
    const serving=swipeServing(),geometry=serving?engine.getServeGeometry('player'):null;
    const minX=serving?geometry.minX+.025:-.8,maxX=serving?geometry.maxX-.025:.8;
    const y=serving?-lerp(.08,.50,(shot.targetDepth-.23)/.69):-shot.targetDepth;
    const origin=swipeAimOrigin||swipeOrigin();
    const x=window.TennisSwipe.directionalTarget(shot,{origin:sceneRenderer.projectCourt(origin.x,origin.y),
      left:sceneRenderer.projectCourt(minX,y),right:sceneRenderer.projectCourt(maxX,y),minX,maxX});
    if(x===null)return null;
    return {...shot,targetX:serving?(x-minX)/(maxX-minX)*1.6-.8:x};
  }
  function renderSwipeControls(touchEnabled){
    if(!swipeOverlay)return;
    const active=swipeActive();
    document.querySelector('.game-shell').dataset.mobileStyle=active?'swipe':'classic';
    swipeOverlay.hidden=!active || !touchEnabled;
    if(!active || !touchEnabled){swipeVisual={state:'idle',target:null,trajectoryPoints:0};return;}
    const swipe=engine.getSwipeState(),gesture=swipeGesture?.snapshot();
    const locked=swipe.committed||swipe.intent;
    const preview=!locked&&gesture?.active?resolveSwipeDirection(window.TennisSwipe.classifyGesture({...gesture,endX:gesture.x,endY:gesture.y,endTime:gesture.time})):null;
    const intent=locked||preview;
    const serving=swipeServing();
    let hint=serving?'Swipe toward your target to serve':state.practice?'Swipe as the high ball approaches':'Swipe toward your target';
    if(state.phase==='point'||state.phase==='practiceResult')hint=state.practice?state.practice.lastResult:'Get ready for the next point';
    else if(locked)hint=serving?'Serve locked':'Shot locked';
    else if(preview)hint='Release to lock your shot';
    else if(swipe.previewFlight)hint='Shot in flight';
    else if(state.time<swipeNoticeUntil)hint=swipeNotice;
    if(swipe.pendingStyle)hint+=(state.practice?' · Next feed: ':' · Next point: ')+(swipe.pendingStyle==='swipe'?'Swipe':'Classic');
    hudText('swipe-hint',hint);
    const strength=clamp(Number(intent?.strength)||0,0,serving?1:Math.min(1,state.energy/SHOT.powerCost));
    const fill=document.getElementById('swipe-strength');
    if(fill)fill.style.transform=`scaleX(${strength})`;
    const strengthLabel=document.getElementById('swipe-strength-value');
    if(strengthLabel)strengthLabel.textContent=`${Math.round(strength*100)}% boost`;
    const line=document.getElementById('swipe-trail-path');
    line?.setAttribute('points',!locked&&gesture?.active?gesture.points.map(point=>`${point.x},${point.y}`).join(' '):'');
    const marker=document.getElementById('swipe-target');
    if(!marker)return;
    let target=null;
    if(intent && Number.isFinite(intent.targetX) && Number.isFinite(intent.targetDepth)){
      target={x:intent.targetX,y:-intent.targetDepth};
      if(serving){
        const geometry=engine.getServeGeometry('player');
        target={x:lerp(geometry.minX+.025,geometry.maxX-.025,(intent.targetX+.8)/1.6),
          y:-lerp(.08,.50,(intent.targetDepth-.23)/.69)};
      }
    }
    if(!preview && swipe.previewTarget)target={...swipe.previewTarget};
    const visualState=locked?'locked':preview?'aiming':swipe.previewFlight?'flight':'idle';
    swipeOverlay.dataset.shotState=visualState;
    const path=document.getElementById('swipe-trajectory-path'),shadow=document.getElementById('swipe-trajectory-ground');
    let points=[];
    if(target){
      const origin=swipe.previewFlight?.origin||swipeAimOrigin||swipeOrigin(swipe);
      const flight=swipe.previewFlight||{...window.TennisPhysics.solveShot(origin,target.x,target.y,serving?.65:.82,.10),origin};
      const duration=flight.flightTime??window.TennisPhysics.timeToGround({...origin,...flight});
      for(let i=0;i<=32;i++){
        const sample=window.TennisPhysics.sample({...origin,...flight},duration*i/32);
        const projected=sceneRenderer.projectCourt(sample.x,sample.y,sample.z);
        points.push(`${(canvas.offsetLeft+projected.x).toFixed(1)},${(canvas.offsetTop+projected.y).toFixed(1)}`);
      }
      const start=sceneRenderer.projectCourt(origin.x,origin.y),end=sceneRenderer.projectCourt(target.x,target.y);
      shadow?.setAttribute('points',`${canvas.offsetLeft+start.x},${canvas.offsetTop+start.y} ${canvas.offsetLeft+end.x},${canvas.offsetTop+end.y}`);
    }else shadow?.setAttribute('points','');
    path?.setAttribute('points',points.join(' '));
    swipeVisual={state:visualState,target,trajectoryPoints:points.length};
    const projected=target?sceneRenderer?.projectCourt?.(target.x,target.y):null;
    marker.hidden=!projected?.visible;
    if(projected?.visible){
      marker.style.left=`${canvas.offsetLeft+projected.x}px`;
      marker.style.top=`${canvas.offsetTop+projected.y}px`;
    }
  }
  function outFeedbackState() {
    const feedback = state.outFeedback;
    const visible = state.mode === 'playing' && !state.paused && Boolean(feedback?.remaining > 0);
    const age = feedback ? feedback.duration - feedback.remaining : 0;
    // Two soft pulses follow simulation time, so pauses and replay stay exact.
    const pulse = age < 1.1 ? Math.sin(Math.PI * (age % .55) / .55) ** 2 : 0;
    const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    return { visible, remainingMs: Math.round((feedback?.remaining || 0) * 1000),
      pulse: visible ? +(reducedMotion ? .35 : pulse).toFixed(3) : 0, reducedMotion };
  }
  function renderOutFeedback() {
    const feedback = outFeedbackState();
    const el = document.getElementById('out-feedback');
    el.classList.toggle('hidden', !feedback.visible);
    el.style.setProperty('--out-pulse', feedback.pulse);
    el.style.opacity = String(Math.min(1, feedback.remainingMs / 180));
    hudText('out-announcement', feedback.visible ? 'Out' : '');
    return feedback;
  }
  function render() {
    if(!sceneRenderer)return;
    const feedback=serveFeedback();
    sceneRenderer.render(state,feedback,tournamentPresentation);
    if (!canvas.dataset.ready) canvas.dataset.ready = "true";
    document.querySelector('.game-shell').dataset.mode=state.mode;
    document.getElementById('match-hud').classList.toggle('hidden',state.mode==='menu');
    renderScoreboard();
    renderPracticeHud();
    const outFeedback = renderOutFeedback();
    const touch=document.documentElement.dataset.embed === 'true' || Boolean(window.matchMedia?.('(pointer: coarse), (max-width: 760px)').matches);
    const touchEnabled=touchPlayEnabled();
    touchControls.hidden=!touch || !touchEnabled || swipeActive();
    renderSwipeControls(touchEnabled);
    const powerServeVisible=modernServeEnabled() && state.server==='player' && ['serveToss','serveSwing'].includes(state.phase);
    touchLob.hidden=!intentionalLobEnabled() || powerServeVisible;
    touchLob.disabled=!touchEnabled || state.phase!=='rally';
    if(touchPowerServe)touchPowerServe.hidden=!powerServeVisible;
    if(!touchEnabled){clearTouchStick();clearTouchHit();clearTouchLob();}
    const p=state.player,aiming=p.aimRemaining>1e-9;
    const direction=p.queuedShot==='deep'?(p.queuedAim<0?'↖':p.queuedAim>0?'↗':'↑'):p.queuedShot==='short'?(p.queuedAim<0?'↙':p.queuedAim>0?'↘':'↓'):(p.queuedAim<0?'←':p.queuedAim>0?'→':'·');
    const powerHud=document.getElementById('power-hud');
    powerHud.classList.toggle('low',state.energy<SHOT.powerCost);
    powerHud.classList.toggle('armed',p.queuedPower);
    powerHud.classList.toggle('aiming',aiming);
    powerHud.classList.toggle('denied',state.time<state.powerDeniedUntil);
    hudText('power-label',state.time<state.powerDeniedUntil?'RECOVERING':aiming?(p.queuedPower?'POWER ':'AIM ')+direction:'POWER');
    hudText('power-value',Math.floor(state.energy));
    document.getElementById('power-fill').style.transform=`scaleX(${state.energy/SHOT.energyMax})`;
    document.getElementById('power-meter').setAttribute('aria-valuenow',String(Math.floor(state.energy)));
    const key=controller.index!==null?controller.hitLabel:touch?'HIT':keyLabel('hit').toUpperCase();
    let call=state.messageTimer>0?state.message:'';
    if(call==='TOSS AGAIN  •  SPACE')call='TOSS AGAIN  •  '+key;
    call = call.replace(/\bYOU\b/g, () => scoreboardNames.player).replace(/\bRIVAL\b/g, () => scoreboardNames.ai);
    if (call && state.phase==='point' && state.pointWinner && !state.lastCall.startsWith('GAME')) {
      const reason=state.lastCall==='WINNER'||state.lastCall.startsWith('POINT —')?'':` · ${state.lastCall}`;
      call=`${scoreboardNames[state.pointWinner]} WINS POINT${reason}`;
    }
    if(state.phase==='rally'&&state.ball.active&&state.ball.lastHit==='ai'&&!p.swing){
      if(state.ball.defensiveLob&&state.ball.bounceCount===0)call='HIGH BALL · GET READY';
      if(smashAvailable())call='SMASH · '+key;
    }
    if(state.practice&&state.phase==='practiceFeed')call=state.message;
    if(state.practice&&state.phase==='practiceResult')call=state.practice.lastResult;
    if(state.phase==='serve'&&state.server==='player')call=(state.serveNumber===2?'SECOND SERVE':'YOUR SERVE')+(modernServeEnabled()?' · AIM THEN ':' · ')+key+' TO TOSS';
    if(state.phase==='serveToss'&&state.server==='player'){
      if(!modernServeEnabled())call=Math.abs(state.ball.vz)<.75?key+' · HIT NOW':'WAIT FOR THE TOP OF THE TOSS';
      else if(state.serveAttempt?.swingAt!=null)call=state.serveAttempt.power?'POWER SERVE · +0.5 m':'SWINGING · DOUBLE '+key+' FOR POWER';
      else call=feedback.swingCue==='late'?'LATE · LET TOSS DROP TO RETRY':feedback.swingCue==='ready'?'START SWING · '+key+' AS BALL REACHES CIRCLE':'PRESS '+key+' AS BALL RISES INTO CIRCLE';
    }
    if(state.phase==='point' && (state.lastCall==='ACE'||state.lastServe?.result==='ace'))call=`ACE · ${scoreboardNames[state.pointWinner]}${state.lastCall.startsWith('GAME')?' · GAME':''}`;
    call=withServeFaultTiming(call);
    hudText('hud-call',call);
    document.getElementById('hud-call').classList.toggle('hidden',!call||state.paused||(outFeedback.visible&&call==='OUT'));
    renderSpeedometer();
    renderServeFeedback(feedback);
    renderServeInstructions();
    hudText('hud-venue',currentVenue().name+' / '+currentVenue().surface);
  }

  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function lerp(a,b,t){return a+(b-a)*t;}

  function initAudio() { if (soundEnabled && !workMode) audio?.init(); }
  function playTone(...args) { audio?.tone(...args); }
  function playHit(pitch = 1, contact) { audio?.hit(pitch, contact); }
  function playBounce(contact) { audio?.bounce(contact); }

  function playPointSound(won) {
    if (won) {
      playTone(410, .12, 'triangle', .045);
      playTone(620, .18, 'triangle', .04, .09);
    } else {
      playTone(240, .18, 'sine', .035);
      playTone(170, .22, 'sine', .03, .1);
    }
  }

  function togglePause() {
    if (workMode || inputOverlayOpen()) return;
    initAudio();
    if(window.TennisOnline?.active){clearInputs();window.TennisOnline.options();return;}
    if (state.mode !== 'playing') return;
    if(state.paused&&(tourSaveExiting||tourBlocksPlay()))return;
    state.paused = !state.paused;
    if(state.paused)window.TennisSummary?.outcome(document.hidden?'hidden':'paused',{score:state.score.playerGames+'-'+state.score.aiGames});
    clearInputs();
    syncPauseMenu();
  }

  function clearInputs() {
    const keepSwing=swipeActive() && Boolean(engine.getSwipeState?.().committed);
    controller.x=controller.y=0;controller.power=false;controller.blocked=true;
    for(const code of physicalKeys)blockedKeys.add(code);
    for(const code of Object.keys(keys))if(keys[code])blockedKeys.add(code);
    Object.keys(keys).forEach(key => { keys[key] = false; });
    clearTouchStick();
    clearTouchHit();
    clearTouchLob();
    // Releasing the finger already committed the target. Focus/pause cleanup
    // cancels only an unfinished gesture; match boundaries own accepted shots.
    clearSwipeGesture(false);
    if(!keepSwing){
      cancelShotInput();
      if(!state.player.strokeConnected){state.player.swing=0;state.player.swingCooldown=0;}
    }
  }

  function syncPauseMenu() {
    const panel = document.getElementById('pause-menu');
    panel.classList.toggle('hidden', !state.paused);
    panel.setAttribute('aria-hidden', String(!state.paused));
    panel.inert = !state.paused;
    renderPauseSave();

    if (state.paused) document.getElementById('resume-btn').focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  let tourSaveBusy=false, tourSaveExiting=false, pauseSaveError=null;
  // After a failed upload that is not the player's to fix (outage, timeout, network),
  // leaving must not be blocked: the unsaved points stay in this browser's recovery
  // copy and the tournament hub offers to resume and save them.
  function canParkTournament(status=window.TennisTour?.snapshot()) {
    const code=status?.error?.status;
    return !!window.TennisTour?.park&&!!status?.pending&&!status.saving&&!tourSaveBusy&&!status.recoveryWarning&&
      !!(pauseSaveError||status.error)&&!(code>=400&&code<500&&code!==429);
  }
  function renderPauseSave() {
    const panel=document.getElementById('pause-tour-save');
    const saveButton=document.getElementById('pause-save-btn');
    const exitButton=document.getElementById('menu-btn');
    if(!panel||!saveButton)return;
    const tournament=!!state.eventId&&!window.TennisOnline?.active,status=window.TennisTour?.snapshot();
    panel.hidden=!tournament;saveButton.hidden=!tournament;
    const parkable=tournament&&canParkTournament(status);
    exitButton.textContent=tournament?(parkable?'Exit · keep points on this device':'Save & exit'):'New match / players / court';
    exitButton.disabled=tournament&&(tourSaveBusy||!!status?.saving);
    document.getElementById('resume-btn').disabled=tournament&&(tourSaveExiting||tourBlocksPlay());
    if(!tournament)return;
    const failure=pauseSaveError||status.error?.message||status.recoveryWarning;
    const saving=tourSaveBusy||status.saving;
    const unsaved=Math.max(0,status.unsavedPoints||0);
    const savedAt=status.lastSavedAt?new Date(status.lastSavedAt):null;
    const time=savedAt&&Number.isFinite(savedAt.getTime())?savedAt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):null;
    const message=saving?'Saving your completed points…':failure||
      (status.guest?'Your completed points are saved on this browser.':unsaved?
        `${unsaved} completed ${unsaved===1?'point is':'points are'} not yet saved to your account.${time?` Last saved at ${time}.`:''}`:
        status.pending?'Save this match to your account.':`Saved to your account${time?` at ${time}`:''}.`);
    document.getElementById('pause-save-status').textContent=message;
    panel.classList.toggle('is-error',!!failure&&!saving);
    document.getElementById('pause-save-help').textContent=tourBlocksPlay()&&!saving?
      'Resolve the save issue before continuing. Keep this tab open to protect your completed points.':status.guest?
      'Saving keeps your completed points on this browser. If you leave during a rally, you restart that point.':parkable?
      'Retry now, or exit and keep your completed points on this browser. Resume this tournament from the Tour hub to finish saving them.':
      'Save your completed points now, or keep playing. Points save automatically as you play and when the match finishes. If you leave during a rally, you restart that point.';
    saveButton.textContent=saving?'Saving…':failure?'Retry save':'Save game';
    saveButton.disabled=saving||[401,409].includes(status.error?.status);
    const signin=document.getElementById('pause-save-signin');
    signin.hidden=status.error?.status!==401;
    signin.href=window.TennisTour.authURL(status.active?.eventId);
    document.getElementById('pause-save-reload').hidden=status.error?.status!==409;
  }
  async function saveTournament(exitAfter=false) {
    if(tourSaveBusy)return false;
    const tour=window.TennisTour,owner=tour.snapshot().user?.id,runId=tour.snapshot().active?.id,matchState=state;
    if(state.mode==='playing'&&!state.paused){state.paused=true;clearInputs();syncPauseMenu();}
    tourSaveBusy=true;tourSaveExiting=exitAfter;pauseSaveError=null;renderPauseSave();
    try {
      await tour.flush();
      if(state!==matchState||tour.snapshot().user?.id!==owner||tour.snapshot().active?.id!==runId)return false;
      if(exitAfter)finishReturnToMenu();
      return true;
    } catch(failure) {
      if(state===matchState&&tour.snapshot().user?.id===owner)pauseSaveError=failure.message;
      return false;
    } finally {tourSaveBusy=false;tourSaveExiting=false;renderPauseSave();}
  }
  window.TennisTour?.subscribe(()=>{
    const status=window.TennisTour.snapshot();
    if(state.eventId&&state.mode==='playing'&&(status.error||status.recoveryWarning)&&tourBlocksPlay()&&!state.paused){
      state.paused=true;clearInputs();syncPauseMenu();
    }
    renderPauseSave();
  });
  function returnToMenu() {
    if(state.eventId&&!window.TennisOnline?.active){
      if(canParkTournament()&&window.TennisTour.park()){pauseSaveError=null;finishReturnToMenu();return true;}
      return saveTournament(true);
    }
    finishReturnToMenu();
  }
  function finishReturnToMenu() {
    window.TennisSummary?.outcome(state.eventId?'saved':'quit',{score:state.score.playerGames+'-'+state.score.aiGames});
    window.TennisGamesPlayed?.stop();
    clearInputs();
    state.mode = 'menu'; state.phase = 'menu'; state.paused = false;
    state.outFeedback = null;
    delete state.practice;
    state.ball = makeBall(); state.retiringBall = null; state.particles.length = 0; state.marks.length = 0;
    resetPlayers();
    delete state.player.characterId;delete state.ai.characterId;
    if(window.TennisAppearanceSelect)state.player.appearance=window.TennisAppearanceSelect.selection();
    if(window.TennisAppearance)state.ai.appearance=window.TennisAppearance.defaults('ai');
    menu.classList.remove('hidden'); menu.inert = false; menu.setAttribute('aria-hidden', 'false');
    result.classList.add('hidden'); result.inert = true; result.setAttribute('aria-hidden', 'true');
    document.getElementById('pause-btn').classList.add('hidden');

    syncPauseMenu();
    if(window.TennisMenu)window.TennisMenu.home();else startButton.focus({ preventScroll: true });
    render();
  }

  function intentionalLobEnabled(){return state.mode==='playing' && !swipeActive() && !state.practice && (engineFactory.capabilities?.intentionalLobAllLevels || isStrategicDifficulty() && !window.TennisOnline?.active);}
  function requestLobSwing(event){
    if(!touchPlayEnabled() || !intentionalLobEnabled() || state.phase!=='rally' || state.player.swing>0 || state.player.swingCooldown>0)return;
    if(!window.TennisOnline?.active && tourBlocksPlay())return;
    selectShot('lob');requestSwing(event);
  }
  function selectShot(shot){if(swipeActive() || inputOverlayOpen() || shot==='lob'&&(!intentionalLobEnabled()||state.paused))return;selectShotUI(shot);if(window.TennisOnline?.active)window.TennisOnline.select(shot);else engine.selectShot(shot);}
  function selectShotUI(shot) {
    selectedShot = shot;
    document.querySelectorAll('[data-shot]').forEach(button => {
      button.classList.toggle('active', button.dataset.shot === shot);
      button.setAttribute('aria-pressed', String(button.dataset.shot === shot));
    });
  }

  function toggleFullscreen() {
    const shell = document.querySelector('.game-shell');
    const request = !document.fullscreenElement ? shell.requestFullscreen?.() : document.exitFullscreen?.();
    if (state.mode === 'playing' && !state.paused && document.activeElement === fullscreenButton) {
      canvas.focus({ preventScroll: true });
    }
    request?.catch(() => { state.message = 'Fullscreen unavailable in this browser'; state.messageTimer = 2; });
  }

  function toggleWorkMode() {
    if (!workMode && (window.TennisOnline?.active || state.mode !== 'playing')) return;
    if (workMode) {
      workMode = false;
      workSheet.close();
      document.title = workTitle;
      state.paused = workWasPaused;
      clearInputs();
      audio?.setEnabled(soundEnabled);
      syncPauseMenu();
      if (!state.paused) canvas.focus({preventScroll:true});
    } else {
      workWasPaused = state.paused;
      workTitle = document.title;
      workMode = true;
      state.paused = true;
      clearInputs();
      audio?.setEnabled(false);
      document.title = 'Monthly Report';
      workSheet.showModal();
      workSheet.querySelector('.work-selected input')?.focus({preventScroll:true});
    }
  }
  // Keep edits in the page while players switch between the sheet and court.
  const workRows = workSheet.querySelector('tbody');
  for (let row = 9; row <= 40; row++) {
    const tr = document.createElement('tr');
    const heading = document.createElement('th');
    heading.textContent = row;
    tr.append(heading);
    for (let column = 0; column < 8; column++) tr.append(document.createElement('td'));
    workRows.append(tr);
  }
  const workCells = [];
  const workAddress = workSheet.querySelector('.work-formula span:first-child');
  const workValue = workSheet.querySelector('.work-formula span:last-child');
  [...workRows.rows].forEach((row, rowIndex) => {
    let column = 0;
    const cells = [];
    [...row.querySelectorAll('td')].forEach(cell => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = cell.textContent;
      input.autocomplete = 'off';
      input.spellcheck = false;
      const address = `${String.fromCharCode(65 + column)}${rowIndex + 1}`;
      input.setAttribute('aria-label', address);
      input.dataset.address = address;
      const cellColumn = column;
      column += cell.colSpan;
      cell.replaceChildren(input);
      cells.push({input, column:cellColumn, span:cell.colSpan});
      const updateFormula = () => {
        workAddress.textContent = address;
        workValue.textContent = input.value;
      };
      input.addEventListener('focus', () => {
        workSheet.querySelector('.work-selected')?.classList.remove('work-selected');
        cell.classList.add('work-selected');
        updateFormula();
        input.select();
      });
      input.addEventListener('input', updateFormula);
      input.addEventListener('keydown', event => {
        if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
        let target;
        const index = cells.findIndex(entry => entry.input === input);
        if (event.key === 'Tab' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const direction = event.key === 'ArrowLeft' || event.key === 'Tab' && event.shiftKey ? -1 : 1;
          target = cells[index + direction];
          if (!target && event.key === 'Tab') {
            const nextRow = workCells[rowIndex + direction];
            target = direction > 0 ? nextRow?.[0] : nextRow?.at(-1);
          }
        } else if (event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const direction = event.key === 'ArrowUp' || event.key === 'Enter' && event.shiftKey ? -1 : 1;
          target = workCells[rowIndex + direction]?.find(entry => cellColumn >= entry.column && cellColumn < entry.column + entry.span);
        } else return;
        event.preventDefault();
        target?.input.focus();
      });
    });
    workCells.push(cells);
  });
  workSheet.addEventListener('cancel', event => event.preventDefault());

  function handleKeyDown(event) {
    trackPhysicalKeyDown(event);
    if(inputOverlayOpen() || event.ctrlKey || event.altKey || event.metaKey || event.isComposing)return;
    if(blockedKeys.has(event.code)){
      if(touchPlayEnabled() && controls.actionForKey(event.code) && !['INPUT','SELECT','TEXTAREA','BUTTON','A','SUMMARY'].includes(event.target?.tagName) && !event.target?.isContentEditable)event.preventDefault();
      return;
    }
    const workKey = event.code === 'Backquote' || event.key === '~' || event.key === '`';
    if (workMode) {
      if (workKey && !event.repeat) {event.preventDefault();toggleWorkMode();}
      return;
    }
    // Native controls and external forms keep their own input semantics.
    if (event.target?.closest && event.target !== document.body && !event.target.closest('.game-shell')) return;
    if (window.TennisMenu?.handleKey(event)) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName) || event.target?.isContentEditable) return;
    if (workKey && !window.TennisOnline?.active && state.mode === 'playing') {
      event.preventDefault();
      if (!event.repeat) toggleWorkMode();
      return;
    }
    if (event.code === 'Space' && ['BUTTON','A','SUMMARY'].includes(event.target?.tagName)) return;
    const action=controls.actionForKey(event.code);
    if(action && touchPlayEnabled())event.preventDefault();
    const actionWasDown=action && controls.isDown(action,keys);
    const wasDown=keys[event.code];
    if(event.repeat || wasDown)return;
    if(document.hidden || document.hasFocus && !document.hasFocus())return;
    initAudio();
    keys[event.code]=true;
    if (event.code === 'KeyP' || event.code === 'Escape' && !document.fullscreenElement) {togglePause();return;}
    if (event.code === 'KeyF') {toggleFullscreen();return;}
    // Replay/menu activation is a fixed UI context, separate from gameplay R.
    if(state.mode==='gameover' || state.mode==='menu'){
      if(event.code==='Space' || event.code==='KeyR' && state.mode==='gameover'){event.preventDefault();requestSwing(event);}
      return;
    }
    if(!touchPlayEnabled() || swipeActive() || !action)return;
    event.preventDefault();
    // Alternate keys are one logical button: release both before a second hit.
    if(actionWasDown)return;
    if(action==='hit')requestSwing(event);
    if(action==='lob')requestLobSwing(event);
    if(action==='short')selectShot(selectedShot==='short'?'neutral':'short');
    if(action==='deep')selectShot(selectedShot==='deep'?'neutral':'deep');
  }

  function handleKeyUp(event) { trackPhysicalKeyUp(event); }


  function loop(now) {
    if(!manualStepping)pollController();
    const activePlay=!manualStepping && state.mode === 'playing' && !state.paused && !state.practice && !window.TennisOnline?.active && !tourBlocksPlay();
    window.TennisGamesPlayed?.tick(now,activePlay);
    window.TennisAnalytics?.trackTourPlay(now,activePlay&&!!state.eventId,{eventId:state.eventId,difficulty:state.difficulty});
    if(!window.TennisOnline?.active)window.TennisSummary?.tick(now,!manualStepping&&state.mode==='playing'&&!state.paused&&!tourBlocksPlay(),{paused:state.paused,score:state.score.playerGames+'-'+state.score.aiGames,points:state.stats.pointsWon+state.stats.pointsLost});
    const frame = Math.min(.05, (now - lastTime) / 1000);
    lastTime = now;
    if (!manualStepping) {
      accumulator += frame;
      while (accumulator >= FIXED_DT) {
        update(FIXED_DT);
        accumulator -= FIXED_DT;
      }
    }
    if (!manualStepping) render();
    window.__TOP_TENNIS_CONTROL__ = { getState: () => state, getEngine: () => engine, startOffline: () => window.TennisLocal?.startOffline?.(), togglePause };
  requestAnimationFrame(loop);
  }

  function renderGameToText() {
    const ball = state.ball;
    const tourStatus=state.eventId?window.TennisTour?.snapshot():null;
    return JSON.stringify({
      coordinateSystem: 'World court coordinates: origin at net center; x increases right; y increases toward player/bottom; z is height. Court x=-1..1, y=-1..1.',
      netHeight: NET_HEIGHT,
      mode: state.mode,
      matchResults: !result.classList.contains('hidden') ? window.TennisMatchResults?.read(document.getElementById('match-stats'))
        : state.mode==='gameover' ? window.TennisMatchResults?.summarize(state,scoreboardNames) : null,
      menu: window.TennisMenu?.debug() || null,
      tour: state.eventId ? {eventId:state.eventId,saving:tourStatus?.saving,pending:tourStatus?.pending,unsavedPoints:tourStatus?.unsavedPoints||0,lastSavedAt:tourStatus?.lastSavedAt||null,locallySaved:tourStatus?.locallySaved,blocksPlay:tourBlocksPlay(),error:tourStatus?.error?.code||null} : null,
      paused: state.paused,
      tiebreak: state.tiebreak,
      phase: state.phase,
      difficulty: state.difficulty,
      cpuTactics: state.ai.controller === 'computer' ? state.ai.tactics || null : null,
      roster: {enabled:!!window.TennisRoster?.ENABLED,selection:window.TennisPlayerSelect?.selection()||{player:'classic',ai:'classic'},
        player:state.player.rosterId||'classic',rival:state.ai.rosterId||'classic',
        customRatings:{player:state.player.customRatings||null,rival:state.ai.customRatings||null},chooserOpen:!!window.TennisPlayerSelect?.isOpen()},
      offlineBuild:window.TennisOfflineBuild?{ratings:window.TennisOfflineBuild.ratings(),remaining:window.TennisOfflineBuild.remaining(),active:!!window.TennisPlayerSelect?.isCustom?.()}:null,
      multiplayerBuild:window.TennisMultiplayerBuild?{ratings:window.TennisMultiplayerBuild.ratings(),remaining:window.TennisMultiplayerBuild.remaining()}:null,
      characters:{player:state.player.characterId||null,rival:state.ai.characterId||null},
      appearance:{selection:window.TennisAppearanceSelect?.selection()||null,player:state.player.appearance||null,rival:state.ai.appearance||null,chooserOpen:!!window.TennisAppearanceSelect?.isOpen()},
      assistance: swipeActive(),
      controlMode: swipeActive()?'swipe':'manual',
      mobileControls: mobileControls(),
      swipe: {...(engine.getSwipeState?.()||{}),gesture:swipeGesture?.snapshot()||{active:false},visual:swipeVisual},
      bindings:{keyboard:controls.getBindings('keyboard'),controller:controls.getBindings('controller'),settingsOpen:controlsOpen()},
      touchInput: {active:touchStick.pointerId!==null,dragging:touchStick.dragged,x:+touchStick.x.toFixed(3),y:+touchStick.y.toFixed(3)},
      inputMode: modernServeEnabled()&&state.server==='player'&&['serve','serveToss'].includes(state.phase)?(state.serveAttempt?.lockedAim?'serve-locked':'serve-aim'):state.player.aimRemaining>1e-9?'aim':'move',
      shotControl: { aimWindowMs:SHOT.aimWindow*1000, doubleTapWindowMs:SHOT.doubleTapWindow*1000,
        aimRemainingMs:Math.round(state.player.aimRemaining*1000), contactOpensMs:SHOT.contactOpens*1000,
        direction: {x:Math.round(state.player.queuedAim/.72),depth:state.player.queuedShot},powerArmed:state.player.queuedPower,
        ...(isStrategicDifficulty()?{aimMagnitude:+Math.abs(state.player.queuedAim).toFixed(3),controlledPlacement:actionDown('placement')}:{}),
        canDoubleTap:state.phase==='rally' && state.player.swing>0 && !state.player.strokeConnected && state.player.swingPressAt!==null && state.time-state.player.swingPressAt<=SHOT.doubleTapWindow },
      power: {energy:+state.energy.toFixed(2),max:SHOT.energyMax,cost:SHOT.powerCost,recoveryPerSecond:SHOT.recoveryPerSecond,available:state.energy+1e-9>=SHOT.powerCost},
      graphics: sceneRenderer?.debug() || { type: 'headless-simulation' },
      rallyHits: state.rallyHits,
      stats: state.stats,
      practice: state.practice ? {...state.practice} : null,
      preparedShot: selectedShot,
      shotReady: state.player.swing > 0 && !state.player.strokeConnected,
      smashAvailable: smashAvailable(),
      venue: { id: state.venue, name: currentVenue().name, surface: currentVenue().surface, destination:!!currentVenue().destination, gravity:'Earth', gravityMps2:GRAVITY*2.177, outfit:state.venue==='moon'?'apollo':'tennis' },
      server: state.server,
      serve: { number: state.serveNumber, court: state.serveCourt,
        ...(modernServeEnabled()?{modern:true,windupMs:engineFactory.SERVE.windup*1000,doubleTapWindowMs:engineFactory.SERVE.doubleTapWindow*1000,
          feedback:state.server==='player'?serveFeedback():null,last:state.lastServe||null,
          statistics:{player:state.player.stats.serve,ai:state.ai.stats.serve}}:{modern:false}) },
      message: state.messageTimer > 0 || state.phase === 'serve' || state.phase === 'serveToss' ? state.message : '',
      lastShotType: state.lastShotType,
      lastStroke: state.lastStroke,
      lastShotSpeedKph: state.lastShotSpeed,
      speedometer: ballSpeedState(),
      outFeedback: outFeedbackState(),
      playerName:scoreboardNames.player,
      lastTiming: state.lastTiming,
      lastShotPower: state.lastShotPower,
      score: {
        games: { player: state.score.playerGames, rival: state.score.aiGames },
        points: { player: state.tiebreak ? String(state.score.playerPoints) : pointLabel(state.score.playerPoints, state.score.aiPoints), rival: state.tiebreak ? String(state.score.aiPoints) : pointLabel(state.score.aiPoints, state.score.playerPoints) }
      },
      scoreboard: scoreboardState(),
      player: { x: +state.player.x.toFixed(3), y: +state.player.y.toFixed(3), vx: +state.player.vx.toFixed(3), vy: +state.player.vy.toFixed(3), locomotion: state.player.moveBlend > .55 ? 'running' : state.player.moveBlend > .1 ? 'shuffling' : 'ready', swinging: state.player.swing > 0, stroke:state.player.stroke, contactHeight:+state.player.strokeContactZ.toFixed(3), contactAge:+state.player.strokeContactAge.toFixed(3) },
      rival: { x: +state.ai.x.toFixed(3), y: +state.ai.y.toFixed(3), locomotion: state.ai.moveBlend > .55 ? 'running' : state.ai.moveBlend > .1 ? 'shuffling' : 'ready', swinging: state.ai.swing > 0, stroke:state.ai.stroke, contactHeight:+state.ai.strokeContactZ.toFixed(3) },
      ball: { x: +ball.x.toFixed(3), y: +ball.y.toFixed(3), z: +ball.z.toFixed(3), vx: +ball.vx.toFixed(3), vy: +ball.vy.toFixed(3), vz: +ball.vz.toFixed(3), speedKph: ball.speedKph, active: ball.active, motion: ball.active ? 'flight' : ball.dead ? (ball.settling ? (ball.rolling ? 'rolling' : 'settling') : 'resting') : 'held', isServe: ball.isServe, defensiveLob:!!ball.defensiveLob, highDeepLob:!!ball.highDeepLob, shotType:ball.shotType, netTouched: ball.netTouched, lastHit: ball.lastHit, bounces: ball.bounceCount, intendedLanding: ball.targetY == null ? null : { x: +ball.targetX.toFixed(3), y: +ball.targetY.toFixed(3) } },
      retiringBall: state.retiringBall ? {x:+state.retiringBall.x.toFixed(3),y:+state.retiringBall.y.toFixed(3),z:+state.retiringBall.z.toFixed(3),opacity:+(state.retiringBall.fade/.7).toFixed(2)} : null,
      online:window.TennisOnline?.active?{status:window.TennisOnline.status,matchId:window.TennisOnline.room?.id,side:window.TennisOnline.room?.side,serverTick:window.TennisOnline.confirmed?.tick,confirmedScore:window.TennisOnline.confirmed?.score,...(window.TennisOnline.status==='browsing'?{availableGames:window.TennisOnline.rooms}: {})}:null,
      controls: swipeActive()?'Swipe: automatic movement. Swipe toward the target from your player’s lane; forward length sets depth, speed adds power. Release locks the target and shows the flight arc. One swipe serves. Swipe once per return; no swipe means no hit. Settings changes apply next point or Practice feed.':controlText('Mobile: slide and hold anywhere to move; return to the starting point to stop. Tap anywhere to hit, including a second finger while moving; double tap for power. Arrows/WASD move. Space starts one swing immediately: during its brief planted wind-up arrows aim, including diagonals (left/right placement, up deep, down short). Movement resumes at contact or after 180ms. Stroke adapts to contact: left-side backhand, unbounced volley, high overhead smash within reach. No automatic movement or swing. Quick double Space before contact adds power (38 energy); energy recovers at 6/s after 1s. Q/E retain short/deep presets; Shift+Space uses the same power budget. '+(modernServeEnabled()?'Serve: arrows/WASD or drag move the target; Space/HIT tosses, then starts a 240 ms swing and locks aim. Double strike within 220 ms, or POWER HIT, adds power and 0.5 m depth without energy cost. Press as the rising ball reaches the overhead circle; the circle disappears when the swing starts. The hollow aiming ring disappears at contact.':'Classic serve: Space toss, Space strike at apex; return only after bounce.')+' P pauses, F fullscreen.'.replace('P pauses',window.TennisOnline?.active?'P opens options; the match continues':'P pauses') + (isStrategicDifficulty()?' Ace / Legend: hold C while aiming a normal or deep drive for safer placement inside the lines, especially with power. Release C for the full angle. Movement speed, drops, lobs and analog touch keep their usual range.':'') + (intentionalLobEnabled()?' R starts one lob swing immediately; hold left/right to aim. Mobile: press LOB once to swing immediately; hold left/right to aim. Vertical input retains the lob, and power is ignored.'+(engineFactory.capabilities?.intentionalLobAllLevels?' Its high arc lands near the opposite baseline and cannot be smashed.':''):''))
    });
  }

  window.TennisLocal={
    mobileControls,
    setMobileControlStyle(style){
      if(window.TennisOnline?.active || style==='swipe'&&!MOBILE_SWIPE_ENABLED)return {ok:false,saved:false};
      return window.TennisSwipe?.setPreference(style)||{ok:false,saved:false};
    },
    async useTourEngine(version){const factory=await window.TennisTourEngines.load(version);if(factory!==engineFactory){clearInputs();engineFactory=factory;engine=factory.create(engineOptions);state=engine.state;state.mode='menu';state.phase='menu';}},
    setEvent(eventId){state.eventId=window.TennisTourCatalog?.getEvent(eventId)?.id||null;},
    settings:()=>({venue:selectedVenue,difficulty:selectedDifficulty}),selectVenue,startOffline:resetMatch,
    openControlSettings(){
      if(workMode || inputOverlayOpen())return false;
      if(!window.TennisOnline?.active && state.mode==='playing' && !state.paused)togglePause();
      else clearInputs();
      return true;
    },
    matchScore:()=>({playerGames:state.score.playerGames,aiGames:state.score.aiGames}),
    playerName:()=>offlineNames().player,names:offlineNames,validatePlayerName:acceptPlayerName,
    refreshTournamentNames(){if(state.eventId){scoreboardNames=offlineNames();renderScoreboard();}},
    prepareIntro(){scoreboardNames=offlineNames();clearInputs();state.mode='menu';state.phase='menu';state.paused=false;pauseSaveError=null;syncPauseMenu();document.getElementById('pause-btn').classList.add('hidden');},
    roster:()=>window.TennisPlayerSelect?.selection()||{player:'classic',ai:'classic'},clearInput:clearInputs,
    // Online rooms use the existing eight-direction wire protocol.
    input:()=>{const d=directionInput();return {...d,x:Math.sign(d.x),y:Math.sign(d.y),power:actionDown('power')};}, venue:()=>selectedVenue,
    hideMenus(){if(window.TennisOnline?.active&&engineFactory!==window.TennisEngine){clearInputs();engineFactory=window.TennisEngine;engine=engineFactory.create(engineOptions);state=engine.state;}window.TennisMenu?.hide();manualStepping=false;clearInputs();for(const el of [menu,result,document.getElementById('pause-menu')]){el.classList.add('hidden');el.inert=true;}},
    menu(){scoreboardNames=offlineNames();returnToMenu();},
    present(view,players,side,shot){Object.assign(state,view);if(selectedShot!==shot)selectShotUI(shot);scoreboardNames={player:players[side==='player'?0:1]?.name||playerName||'PLAYER',ai:players[side==='player'?1:0]?.name||'OPPONENT'};document.getElementById('pause-btn').classList.remove('hidden');},
    sound(event,side){
      initAudio();
      // The far player's camera rotates the court by 180 degrees.
      const contact=event.contact&&side==='ai'?{...event.contact,x:-event.contact.x,y:-event.contact.y}:event.contact;
      if(event.type==='hit')playHit(event.args?.[0],contact);
      if(event.type==='bounce')playBounce(contact);
      if(event.type==='tone')playTone(...event.args);
      if(event.type==='point')playPointSound(event.winner===side);
    }
  };
  window.render_game_to_text = renderGameToText;
  document.addEventListener('tennisappearancechange',()=>{
    if(state.mode==='menu'&&!window.TennisOnline?.active){
      state.player.appearance=window.TennisAppearanceSelect.selection();
      render();
    }
  });
  window.advanceTime = ms => {
    pollController();
    if(window.TennisOnline?.active){render();return;}
    manualStepping = true;
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) update(FIXED_DT);
    render();
  };

  playerNameInput.addEventListener('input', () => {
    playerNameInput.setCustomValidity('');
    try { localStorage.setItem('baseline.playerName',playerNameInput.value.trim().replace(/\s+/g,' ').slice(0,20)); } catch {}
  });
  playerNameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); if(window.TennisMenu)window.TennisMenu.launch();else resetMatch(); }
  });
  startButton.addEventListener('click', () => window.TennisMenu ? window.TennisMenu.launch() : resetMatch());
  rematchButton.addEventListener('click', () => window.TennisMenu ? window.TennisMenu.replay() : resetMatch());
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    audio?.setEnabled(soundEnabled);
    soundButton.classList.toggle('muted', !soundEnabled);
    soundButton.textContent = soundEnabled ? '♪' : '×';
    soundButton.setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound');
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    if (soundEnabled) initAudio();
  });
  fullscreenButton.addEventListener('click', toggleFullscreen);
  document.getElementById('pause-btn').addEventListener('click', togglePause);
  document.getElementById('resume-btn').addEventListener('click', togglePause);
  document.getElementById('pause-save-btn')?.addEventListener('click',()=>saveTournament());
  document.getElementById('pause-save-reload')?.addEventListener('click',()=>location.reload());
  document.getElementById('menu-btn').addEventListener('click', returnToMenu);
  document.getElementById('result-menu-btn').addEventListener('click', returnToMenu);
  document.querySelectorAll('[data-shot]').forEach(button => button.addEventListener('click', () => selectShot(selectedShot === button.dataset.shot ? 'neutral' : button.dataset.shot)));
  document.querySelectorAll('.difficulty-btn').forEach(button => {
    button.addEventListener('click', () => {
      selectedDifficulty = button.dataset.difficulty;
      state.difficulty = selectedDifficulty;
      document.getElementById('pro-hint').hidden=!isStrategicDifficulty(selectedDifficulty);
      document.getElementById('pro-hint').textContent=(selectedDifficulty==='legend'?'Elite opponents close openings faster and punish repeated patterns.':'Use depth and angles to create an opening.');
      document.querySelectorAll('.difficulty-btn').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    });
  });
  function selectVenue(id) {
    if (!venues[id] || window.TennisMenu?.allowsVenue?.(id) === false) return;
    selectedVenue = id;
    state.venue = id;
    const theme = currentVenue();
    document.documentElement.style.setProperty('--venue-accent', theme.accent);
    venueEyebrow.textContent = `${theme.name} · ${theme.surface}`;
    document.querySelectorAll('.venue-btn').forEach(button => { button.classList.toggle('active', button.dataset.venue === id); button.setAttribute('aria-pressed', String(button.dataset.venue === id)); });
    render();
  }
  function resizeGame() {
    clearTouchStick();
    clearTouchHit();
    clearTouchLob();
    clearSwipeGesture(false);
    const box = canvas.getBoundingClientRect();
    sceneRenderer?.resize(box.width,box.height);
    render();
  }
  document.querySelectorAll('.venue-btn').forEach(button => {
    button.addEventListener('click', () => selectVenue(button.dataset.venue));
  });
  selectVenue(selectedVenue);
  function clearTouchStick() {
    const pointerId=touchStick.pointerId,target=touchStick.target;
    touchStick.pointerId=null;
    touchStick.target=null;
    touchStick.x=0;touchStick.y=0;touchStick.dragged=false;touchStick.usedSecondFinger=false;
    touchThumb.style.transform='translate(0px, 0px)';
    touchJoystick.classList.remove('active');
    if(pointerId!==null && target?.hasPointerCapture?.(pointerId))target.releasePointerCapture(pointerId);
  }
  function touchPlayEnabled() {
    return state.mode==='playing' && !state.paused && !inputOverlayOpen() &&
      (!window.TennisOnline?.active || document.getElementById('online-panel').classList.contains('hidden'));
  }
  function swipePoint(event){
    const box=document.querySelector('.game-shell').getBoundingClientRect();
    return {pointerId:event.pointerId,x:event.clientX-box.left,y:event.clientY-box.top,
      time:event.timeStamp,width:box.width,height:box.height};
  }
  function beginSwipe(event){
    if(!swipeActive() || !touchPlayEnabled() || event.pointerType!=='touch' || event.button!==0)return;
    event.preventDefault();
    syncSwipeBoundary();
    const swipe=engine.getSwipeState();
    if(swipe.intent||swipe.committed||!(state.phase==='serve'&&state.server==='player'||state.phase==='rally'&&state.ball.active&&state.ball.lastHit==='ai'&&state.ball.vy>0))return;
    if(!swipeGesture?.begin(swipePoint(event)))return;
    swipeAimOrigin=swipeOrigin(swipe);
    swipePointerTarget=event.currentTarget;
    swipePointerTarget.setPointerCapture?.(event.pointerId);
    initAudio();render();
  }
  function moveSwipe(event){
    if(event.pointerId!==swipeGesture?.snapshot().pointerId)return;
    if(!swipeActive() || !touchPlayEnabled()){clearSwipeGesture();return;}
    event.preventDefault();swipeGesture.move(swipePoint(event));render();
  }
  function finishSwipe(event){
    if(event.pointerId!==swipeGesture?.snapshot().pointerId)return;
    event.preventDefault();
    const intent=resolveSwipeDirection(swipeGesture.end(swipePoint(event)));
    swipeAimOrigin=null;
    const target=swipePointerTarget;swipePointerTarget=null;
    if(target?.hasPointerCapture?.(event.pointerId))target.releasePointerCapture(event.pointerId);
    if(swipeActive() && touchPlayEnabled() && intent){
      const accepted=engine.queueSwipeShot(intent);
      swipeNotice=accepted?'Shot locked':'Swipe as the ball approaches';swipeNoticeUntil=state.time+1.2;
    }
    render();
  }
  for(const surface of [canvas,swipePad].filter(Boolean)){
    surface.addEventListener('pointerdown',beginSwipe,{passive:false});
    surface.addEventListener('pointermove',moveSwipe,{passive:false});
    surface.addEventListener('pointerup',finishSwipe,{passive:false});
    for(const type of ['pointercancel','lostpointercapture'])surface.addEventListener(type,event=>{
      if(event.pointerId===swipeGesture?.snapshot().pointerId){clearSwipeGesture();render();}
    });
  }
  function moveTouchStick(event) {
    if(event.pointerId!==touchStick.pointerId)return;
    if(!touchPlayEnabled()){clearTouchStick();return;}
    event.preventDefault();
    const dx=event.clientX-touchStick.originX,dy=event.clientY-touchStick.originY;
    const distance=Math.hypot(dx,dy);
    if(distance>TOUCH_DEAD_ZONE)touchStick.dragged=true;
    // Keep the origin fixed so holding an offset continues running. Returning
    // to the origin stops; the same finger can reverse direction indefinitely.
    const strength=Math.min(1,Math.max(0,(distance-TOUCH_DEAD_ZONE)/(touchStick.radius-TOUCH_DEAD_ZONE)));
    touchStick.x=distance?dx/distance*strength:0;
    touchStick.y=distance?dy/distance*strength:0;
    if(touchStick.target===touchJoystick){
      const scale=distance?Math.min(distance,touchStick.radius)/distance:0;
      touchThumb.style.transform=`translate(${dx*scale}px, ${dy*scale}px)`;
    }
  }
  canvas.addEventListener('pointerdown', event => {
    if(inputOverlayOpen() || swipeActive())return;
    initAudio();
    if(event.pointerType!=='touch'){
      if(state.mode==='playing')requestSwing(event);
      return;
    }
    if(!touchPlayEnabled())return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    if(touchStick.pointerId!==null){
      // Strike immediately with the second finger, preserving the held stick.
      touchStick.usedSecondFinger=true;
      requestSwing(event);
      return;
    }
    Object.assign(touchStick,{pointerId:event.pointerId,originX:event.clientX,originY:event.clientY,
      x:0,y:0,dragged:false,usedSecondFinger:false,startedAt:performance.now(),target:canvas,radius:TOUCH_RADIUS});
  },{passive:false});
  canvas.addEventListener('pointermove',moveTouchStick,{passive:false});
  canvas.addEventListener('pointerup',event=>{
    if(event.pointerId!==touchStick.pointerId)return;
    moveTouchStick(event);
    const tap=!touchStick.dragged && !touchStick.usedSecondFinger && performance.now()-touchStick.startedAt<=TOUCH_TAP_MS && touchPlayEnabled();
    clearTouchStick();
    if(tap)requestSwing(event);
  },{passive:false});
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{
    if(event.pointerId===touchStick.pointerId)clearTouchStick();
  });
  touchJoystick.addEventListener('pointerdown',event=>{
    if(swipeActive() || !touchPlayEnabled() || touchStick.pointerId!==null || event.button!==0)return;
    event.preventDefault();
    const box=touchJoystick.getBoundingClientRect();
    Object.assign(touchStick,{pointerId:event.pointerId,originX:box.left+box.width/2,originY:box.top+box.height/2,
      x:0,y:0,dragged:false,usedSecondFinger:false,target:touchJoystick,
      radius:(box.width-touchThumb.offsetWidth)/2-4});
    touchJoystick.setPointerCapture(event.pointerId);
    touchJoystick.classList.add('active');
    moveTouchStick(event);
  },{passive:false});
  touchJoystick.addEventListener('pointermove',moveTouchStick,{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])touchJoystick.addEventListener(type,event=>{
    if(event.pointerId===touchStick.pointerId)clearTouchStick();
  });
  function clearTouchHit(){
    const pointerId=hitPointerId;
    hitPointerId=null;
    touchHit.classList.remove('pressed');
    if(pointerId!==null && touchHit.hasPointerCapture(pointerId))touchHit.releasePointerCapture(pointerId);
  }
  touchHit.addEventListener('pointerdown',event=>{
    if(!touchPlayEnabled() || hitPointerId!==null || event.button!==0)return;
    event.preventDefault();
    hitPointerId=event.pointerId;
    touchHit.setPointerCapture(event.pointerId);
    touchHit.classList.add('pressed');
    if(touchStick.pointerId!==null)touchStick.usedSecondFinger=true;
    requestSwing(event);
  },{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])touchHit.addEventListener(type,event=>{
    if(event.pointerId===hitPointerId)clearTouchHit();
  });
  // Keyboard/assistive activation has no pointerdown; pointer clicks already hit.
  touchHit.addEventListener('click',event=>{
    if(event.detail===0 && touchPlayEnabled())requestSwing(event);
  });
  function clearTouchLob(){
    const pointerId=lobPointerId;
    lobPointerId=null;
    touchLob.classList.remove('pressed');
    if(pointerId!==null && touchLob.hasPointerCapture(pointerId))touchLob.releasePointerCapture(pointerId);
  }
  touchLob.addEventListener('pointerdown',event=>{
    if(!touchPlayEnabled() || !intentionalLobEnabled() || state.phase!=='rally' || lobPointerId!==null || event.button!==0)return;
    event.preventDefault();
    lobPointerId=event.pointerId;
    touchLob.setPointerCapture(event.pointerId);
    touchLob.classList.add('pressed');
    if(touchStick.pointerId!==null)touchStick.usedSecondFinger=true;
    requestLobSwing(event);
  },{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])touchLob.addEventListener(type,event=>{
    if(event.pointerId===lobPointerId)clearTouchLob();
  });
  touchLob.addEventListener('click',event=>{
    if(event.detail===0)requestLobSwing(event);
  });
  touchPowerServe?.addEventListener('pointerdown',event=>{
    if(!touchPlayEnabled() || !modernServeEnabled() || event.button!==0)return;
    event.preventDefault();initAudio();
    if(touchStick.pointerId!==null)touchStick.usedSecondFinger=true;
    requestSwing(event,true);
  });
  touchPowerServe?.addEventListener('click',event=>{
    if(event.detail===0 && touchPlayEnabled() && modernServeEnabled())requestSwing(event,true);
  });
  // Unlock on menu/online buttons too, and recover after browser interruption.
  document.addEventListener('pointerdown', initAudio, {passive:true});
  document.addEventListener('click', event => {
    if (!event.target?.closest?.('#feedback-widget-button')) return;
    clearInputs();
    if (!window.TennisOnline?.active && state.mode === 'playing' && !state.paused) togglePause();
  }, {capture:true});
  controls.subscribe(()=>{clearInputs();window.TennisControlSettings?.refreshLabels();render();});
  window.TennisSwipe?.subscribe(applyMobilePreference);
  window.addEventListener('keydown', trackPhysicalKeyDown, true);
  window.addEventListener('keyup', trackPhysicalKeyUp, true);
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', resizeGame);
  window.addEventListener('blur', () => { clearInputs(); });
  document.addEventListener('visibilitychange', () => {
    if(document.hidden)clearInputs();
    if (!window.TennisOnline?.active && document.hidden && state.mode === 'playing' && !state.paused) togglePause();
  });

  resizeGame();
  requestAnimationFrame(loop);
})();
