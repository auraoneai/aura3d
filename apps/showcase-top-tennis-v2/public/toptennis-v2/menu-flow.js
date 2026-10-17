/* A mode-first front door around the existing local and online match engines. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const courts = [
    {venue:'hard', city:'NEW YORK', surface:'HARD COURT / NIGHT SESSION', difficulty:'beginner', level:'EASY'},
    {venue:'grass', city:'LONDON', surface:'GRASS COURT / CENTRE COURT', difficulty:'club', level:'CLUB'},
    {venue:'clay', city:'PARIS', surface:'CLAY COURT / EVENING SESSION', difficulty:'pro', level:'ACE'},
    {venue:'desert', city:'DUBAI DESERT', surface:'HARD COURT / AMONG THE DUNES', destination:true},
    {venue:'beach', city:'TROPICAL BEACH', surface:'HARD COURT / OCEANFRONT', destination:true},
    {venue:'moon', city:'THE MOON', surface:'LUNAR COURT / LUNAR LANDSCAPE', destination:true}
  ];
  const regularVenues = new Set(courts.filter(court => !court.destination).map(court => court.venue));
  let screen = 'home', mode = 'single', tournament = null, introRemaining = 0;
  let singleStep = 'player', setupGeneration = 0;
  let introDuration = 2.6, helpOpen = false, helpFocus = null;
  let singleChoices = {venue:'hard', difficulty:'beginner'};
  let practiceChoices = {venue:'hard', difficulty:'beginner'};
  let tournamentChoices = {venue:'hard', difficulty:'beginner'};
  let onlineChoices = {venue:'hard', difficulty:'beginner'};
  let tournamentAppearance = null;
  let selectedEvent = null, tourBusy = false, tourActionError = null, completionPending = false, characterEditing=false,characterReturnEvent=null,rankingGeneration=0,setupAccountId=null,setupProfileRevision=0,tournamentAccountId=null;
  const tour = window.TennisTour, catalog = window.TennisTourCatalog;
  // The invitation describes Tour benefits only; casual matches remain open.
  const careerInvite = $('career-invite');
  const setupInvite = $('setup-signin-invite');
  const inviteMarkup = careerInvite?.innerHTML;
  let inviteGuest;
  const showInvites = show => {
    if (setupInvite) setupInvite.hidden = !show;
    if (!careerInvite) return;
    if (inviteGuest !== show) {
      careerInvite.innerHTML = inviteMarkup;
      if (!show) {
        careerInvite.querySelector('h2').textContent = 'YOUR TENNIS CAREER.';
        careerInvite.querySelector('h2 + p').textContent = 'Your Tour progress is saved to your account.';
        const link = careerInvite.querySelector('.career-invite-actions a');
        link.href = '/account/'; link.textContent = 'Open your career ↗';
      }
      inviteGuest = show;
    }
    careerInvite.hidden = false;
    careerInvite.removeAttribute('data-loading');
    careerInvite.setAttribute('aria-busy','false');
  };
  const guestName = $('player-name')?.value || '';
  function applyAccountIdentity(user) {
    const input = $('player-name'), help = $('player-name-help');
    if (!input || !help) return;
    if (user?.username) input.value = user.username;
    else if (input.readOnly) input.value = guestName;
    input.readOnly = !!user?.username;
    $('player-entry').querySelector('label').textContent = user?.username ? 'Playing as' : 'What’s your name?';
    help.replaceChildren(document.createTextNode(user?.username ? 'Your account username. ' : 'Your name for this match. '));
    if (user) { const link=document.createElement('a');link.href='/account/#profile';link.textContent=user.username?'Edit your profile':'Choose your public username';help.append(link); }
  }
  let inviteSessionRevision = 0;
  if (careerInvite) {
    tour.subscribe(() => { inviteSessionRevision++; showInvites(!tour.snapshot().user); applyAccountIdentity(tour.snapshot().user); });
    const revision = inviteSessionRevision;
    fetch('/api/tour/me', {credentials:'same-origin',cache:'no-store'})
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(session => { if (revision === inviteSessionRevision) { showInvites(!session?.user); applyAccountIdentity(session?.user); } })
      .catch(() => { if (revision === inviteSessionRevision) showInvites(true); });
  }
  const draw = window.TennisTournament;
  const visible = (el, show) => {el.hidden = !show; el.inert = !show;};
  const focus = id => $(id)?.focus({preventScroll:true});
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const regularChoices = choices => ({...choices, venue:regularVenues.has(choices.venue) ? choices.venue : 'hard'});
  const allowsVenue = venue => courts.some(court => court.venue === venue) && (regularVenues.has(venue) || (!window.TennisOnline?.active && (screen === 'home' || mode === 'single' || mode === 'practice')));
  function rememberChoices() {
    // The home background previews the last single court, regardless of the
    // mode just played. It must never overwrite another mode's saved choices.
    if (screen === 'home') return;
    if (mode === 'single') singleChoices = window.TennisLocal.settings();
    if (mode === 'practice') practiceChoices = window.TennisLocal.settings();
    if (mode === 'tournament') tournamentChoices = regularChoices(window.TennisLocal.settings());
    if (mode === 'online') onlineChoices = regularChoices(window.TennisLocal.settings());
  }
  function setChoices(venue, difficulty) {
    window.TennisLocal.selectVenue(venue);
    if (difficulty) {
      const playable = catalog.isPlayableDifficulty(difficulty) ? difficulty : 'beginner';
      document.querySelector(`[data-difficulty="${playable}"]`).click();
    }
  }
  function setScreen(next) {
    screen = next;
    if(['home','setup','tour'].includes(next))tourActionError=null;
    if (next !== 'tour') window.TennisTourHub?.close();
    if (next !== 'draw') window.TennisTournamentView?.close();
    visible($('menu-home'), next === 'home');
    visible($('menu-setup'), next === 'setup');
    visible($('match-intro'), next === 'intro');
    const onMenu = next === 'home' || next === 'setup' || next === 'tour';
    $('menu').classList.toggle('hidden', !onMenu);
    $('menu').inert = !onMenu;
    $('menu').setAttribute('aria-hidden', String(!onMenu));
    $('menu').scrollTop = 0;
    renderTourSave();
  }
  function renderTourSave(status=tour.snapshot()) {
    // Keep recovery controls in the scrolling result, where they cannot cover stats.
    const save=$('tour-save'),host=screen==='result'?$('result-stats').parentElement:$('menu').parentElement;
    if(save.parentElement!==host){
      if(screen==='result')host.insertBefore(save,$('result-stats'));
      else host.append(save);
    }
    const failure=tourActionError||status.error;
    const transient=status.error&&!(status.error.status>=400&&status.error.status<500&&status.error.status!==429);
    const message=failure?.message?failure.message+(transient&&status.pending&&!status.recoveryWarning&&!status.saving?' You can leave now: your completed points stay on this browser, and resuming this tournament from the Tour hub saves them.':''):status.recoveryWarning||'';
    // Successful point buffering is silent. Save errors during play are shown
    // in the pause menu; results and the draw retain their recovery actions.
    const visible=mode==='tournament'&&['result','draw'].includes(screen)&&!!status.active&&!!message;
    $('tour-save').hidden=!visible;
    $('tour-save').classList.toggle('is-error',!!message);
    $('tour-save-message').textContent=visible?message:'';
    $('tour-save-retry').hidden=!visible||!status.error||[401,409].includes(status.error.status);
    $('tour-save-retry').disabled=!!status.saving;
    $('tour-save-signin').hidden=!visible||failure?.status!==401;
    $('tour-save-signin').href=tour.authURL(status.active?.eventId);
    $('tour-save-reload').hidden=!visible||failure?.status!==409;
    const waiting=mode==='tournament'&&(tourBusy||completionPending||status.pending||status.saving);
    $('rematch-btn').disabled=!!waiting;
    for(const id of ['tour-another-city','tour-harder','tournament-draw-result'])$(id).disabled=!!waiting;
    for(const link of $('tour-result-next').querySelectorAll('a')){
      if(waiting){link.setAttribute('aria-disabled','true');link.tabIndex=-1;}
      else{link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');}
    }
  }
  function setSingleStep(step, restoreFocus = true) {
    singleStep = step;
    const player = step === 'player';
    $('menu-setup').dataset.singleStep = step;
    visible($('setup-personalize'), player);
    visible($('venue-block'), !player);
    visible($('setup-next'), player);
    visible($('start-btn'), !player);
    visible($('local-format'), !player);
    $('setup-title').textContent = player ? 'CHOOSE YOUR PLAYER.' : 'CHOOSE YOUR COURT.';
    $('setup-description').textContent = player ? 'Pick a pro or create your own player, then choose your opponent and level.' : 'Find your favorite surface or take the match somewhere new.';
    $('setup-back').textContent = player ? 'All modes' : 'Back to players';
    $('start-btn').querySelector('span').textContent = 'PLAY';
    $('difficulty-block').querySelector('.option-label').textContent = 'Choose your level';
    $('court-option-label').textContent = 'Choose your court';
    for (const label of document.querySelectorAll('[data-single-step-label]')) {
      const active = label.dataset.singleStepLabel === step;
      label.classList.toggle('current-step', active);
      if (active) label.setAttribute('aria-current', 'step');
      else label.removeAttribute('aria-current');
    }
    $('menu').scrollTop = 0;
    if (restoreFocus) focus('setup-title');
  }
  function nextSingleStep() {
    if (screen !== 'setup' || mode !== 'single' || singleStep !== 'player') return;
    if (!window.TennisLocal.validatePlayerName()) return;
    rememberChoices();
    setSingleStep('court');
  }
  function backFromSetup() {
    if (mode === 'single' && singleStep === 'court') setSingleStep('player');
    else if (mode === 'tournament') openTour();
    else home();
  }
  function returnToSetup() {
    if (mode === 'tournament') openDraw(tournament.wins ? 'result' : 'setup');
    else setup(mode, null, false, mode === 'single' ? 'court' : 'player');
  }
  function setup(nextMode = mode, event = null, editCharacter = false, step = 'player') {
    if (nextMode === 'tournament' && !event) {openTour();return;}
    if(nextMode==='tournament'&&!editCharacter&&event.isMajor&&!tour.snapshot().majorAccess?.unlocked){openTour(event.id);return;}
    setupGeneration++;
    const selectingMode = screen === 'home' || mode !== nextMode;
    rememberChoices();
    closeHelp();
    introRemaining = 0;
    mode = nextMode;
    characterEditing=editCharacter;
    if (selectingMode) window.TennisAnalytics?.selectMode(mode);
    tournament = null;
    completionPending = false;
    selectedEvent = nextMode === 'tournament' ? event : null;
    window.TennisLocal.prepareIntro();
    $('result').classList.add('hidden');$('result').inert=true;$('result').setAttribute('aria-hidden','true');
    $('tour-save').hidden=true;
    setScreen('setup');
    const single = mode === 'single', practice = mode === 'practice', cup = mode === 'tournament';
    visible($('setup-personalize'), true);
    visible($('setup-next'), false);
    visible($('start-btn'), true);
    visible($('local-format'), true);
    visible($('single-setup-progress'), single);
    visible($('standard-setup-progress'), !single);
    delete $('menu-setup').dataset.singleStep;
    $('difficulty-block').querySelector('.option-label').textContent = '01 / Choose your challenge';
    $('setup-kicker').textContent = single ? 'SINGLE GAME' : practice ? 'PRACTICE / SMASH LAB' : cup ? 'TOURNAMENT / WORLD COURT CUP' : 'PLAY ONLINE';
    $('setup-title').textContent = single ? 'MAKE IT YOUR GAME.' : practice ? 'OWN THE OVERHEAD.' : cup ? 'EARN YOUR MOMENT.' : 'MEET YOUR MATCH.';
    $('setup-description').textContent = single ? 'Create your player or choose a pro, then pick your opponent and court.' : practice ? 'Choose your player and court. A coach feeds varied high lobs so you can train movement, timing and power.' : cup ? 'Create your player or choose a pro. Win five matches to take the title; the draw decides your opponents. Pre-made players wear their signature looks.' : 'Choose your name and strengths, then create a game, join an open court, or invite a friend. First to 3 games, win by 2. Tiebreak at 3–3.';
    $('menu').dataset.selectedMode = mode;
    const namedPlayers = Boolean(window.TennisRoster?.ENABLED);
    visible($('player-entry'), (single || practice || cup) && !namedPlayers);
    visible($('roster-entry'), (single || practice || cup) && namedPlayers);
    window.TennisPlayerSelect?.setMode(mode);
    window.TennisAppearanceSelect?.configure();
    if(cup){const status=tour.snapshot(),preferences=status.profile?.preferences;setupAccountId=status.user?.id;setupProfileRevision=status.profile?.profileRevision||0;window.TennisOfflineBuild?.beginAccount(preferences?.customPlayer?.ratings);window.TennisAppearanceSelect?.beginAccount(preferences?.appearance);}
    else{window.TennisOfflineBuild?.endAccount();window.TennisAppearanceSelect?.endAccount();}
    visible($('difficulty-block'), single || cup);
    visible($('venue-block'), !cup);
    visible($('destination-arenas'), single || practice);
    document.querySelectorAll('#destination-arenas .venue-btn').forEach(button => {button.disabled = !(single || practice);});
    visible($('regular-courts-label'), single || practice);
    visible($('tournament-path'), cup&&!editCharacter);
    visible($('tour-character-summary'),cup&&!editCharacter);
    visible($('local-start'), single || practice || cup);
    visible($('online-entry'), mode === 'online');
    $('court-option-label').textContent = single || practice ? '02 / Choose your court' : cup ? '02 / Tournament court' : 'Court for games you create';
    $('start-btn').querySelector('span').textContent = cup ? 'CREATE THE DRAW' : practice ? 'START SMASH DRILL' : 'STEP ON COURT';
    $('local-format').textContent = cup ? 'Win 5 matches · first to 3 games, win by 2 · tiebreak at 3–3' : practice ? 'Endless high lobs · manual movement and timing · pause to exit' : 'First to 3 games · win by 2 · tiebreak at 3–3';
    const choices = single ? singleChoices : practice ? practiceChoices : cup ? tournamentChoices : onlineChoices;
    setChoices(cup ? event.venue : choices.venue, mode === 'online' ? null : choices.difficulty);
    visible($('tour-setup-event'), cup);
    $('tour-setup-error').hidden = true;
    if (cup) {
      $('setup-kicker').textContent = 'TOP TENNIS TOUR / ' + event.name.toUpperCase();
      $('setup-title').textContent = event.name.toUpperCase();
      $('setup-description').textContent = 'Compete as your account character. Your abilities, appearance and difficulty stay fixed for this run. Save from the pause menu, or finish a match to save automatically.';
      $('setup-back').textContent = 'All tournaments';
      $('tour-setup-event').querySelector('strong').textContent = event.surface + ' · 32 players';
      updateTourPotential();
      const preferences = tour.snapshot().profile?.preferences;
      if (preferences&&catalog.difficulties.includes(preferences.difficulty))setChoices(event.venue,preferences.difficulty);
      $('tour-character-summary').querySelector('strong').textContent=tour.snapshot().user?.username||'Your character';
      $('tour-character-summary').querySelector('p').textContent='40 ability points · Your saved playing style';
      visible($('appearance-entry'),editCharacter);visible($('offline-build'),editCharacter);
      if(editCharacter){$('setup-title').textContent='CREATE YOUR CHARACTER.';$('setup-description').textContent='Choose your look and assign all 40 ability points. Everyone gets the same budget, and career progress never increases it. Changes apply to your next tournament.';$('start-btn').querySelector('span').textContent='SAVE CHARACTER';visible($('difficulty-block'),false);visible($('tour-setup-event'),false);$('local-format').textContent='5 strengths · 6–10 each · exactly 40 total';}
      window.TennisLocal.setEvent(event.id);
    } else {$('setup-back').textContent='All modes';window.TennisLocal.setEvent(null);}
    if (single) setSingleStep(step, false);
    focus(mode !== 'online' && !namedPlayers && !$('player-name').value.trim() ? 'player-name' : 'setup-title');
  }
  function home(restoreFocus = true) {
    if(tourBusy)return;
    window.TennisAnalytics?.abandonMatch();
    rememberChoices();
    closeHelp();
    introRemaining = 0;
    tournament = null;
    selectedEvent = null;
    characterEditing=false;window.TennisOfflineBuild?.endAccount();window.TennisAppearanceSelect?.endAccount();
    window.TennisLocal.prepareIntro();
    window.TennisLocal.setEvent(null);
    $('tour-save').hidden = true;
    setScreen('home');
    setChoices(singleChoices.venue, singleChoices.difficulty);
    if (restoreFocus) focus('mode-' + mode);
  }
  async function launch() {
    if (screen === 'home') { setup('single'); return; }
    if (screen === 'intro') { play(); return; }
    if (screen !== 'setup' || mode === 'online') return;
    if (mode === 'single' && singleStep === 'player') {nextSingleStep();return;}
    if (mode!=='tournament'&&!window.TennisLocal.validatePlayerName()) return;
    rememberChoices();
    if (mode === 'tournament') {
      if (tourBusy) return;
      if(characterEditing){await tourAction(async()=>{
        if(tour.snapshot().user?.id!==setupAccountId)throw new Error('Your account changed. Reopen character setup before saving.');
        if(window.TennisOfflineBuild.remaining()!==0)throw new Error('Assign all 40 ability points before saving your character.');
        await tour.saveProfile({playerId:'custom',customPlayer:{ratings:window.TennisOfflineBuild.ratings()},appearance:window.TennisAppearanceSelect.selection()},setupProfileRevision);
        await tour.refresh();characterEditing=false;
      });if(!characterEditing)openTour(characterReturnEvent?.id);return;}
      await tourAction(async()=>{await createTournament();openDraw('setup');});
    }
    else introduce();
  }
  async function createTournament() {
    const eventId=selectedEvent.id;
    const settings = window.TennisLocal.settings();
    const status=tour.snapshot();
    if(status.user?.id!==setupAccountId)throw new Error('Your account changed. Reopen tournament setup before entering.');
    if(status.eligibility?.reasons?.includes('ranking_suspended'))throw new Error('New tournament entry is suspended for your account. Saved tournaments remain available.');
    if(!status.user?.emailVerified||!status.user.username||!status.profile?.completed||status.eligibility?.eligible===false)throw new Error('Complete your verified account, public username and character before entering.');
    if(selectedEvent.isMajor&&!status.majorAccess?.unlocked)throw new Error('Reach 750 public Tour Points to unlock the Majors permanently.');
    const run=await tour.create(eventId,{difficulty:settings.difficulty,expectedProfileRevision:setupProfileRevision});
    await window.TennisLocal.useTourEngine(run.engineVersion);
    applyRun(run);
  }
  function applyRun(run) {tournament=JSON.parse(JSON.stringify(run.draw));tournamentAccountId=tour.snapshot().guest?null:run.userId;if(run.rankingPolicyVersion&&tour.snapshot().user?.username){const player=tournament.entrants.find(entrant=>entrant.id===tournament.playerId);if(player)player.name=tour.snapshot().user.username;}tournamentAppearance=run.appearance;selectedEvent=catalog.getEvent(run.eventId);window.TennisTournamentView?.updateIdentity(tournament);window.TennisLocal.refreshTournamentNames?.();const match=draw.currentMatch(tournament);if(match&&screen==='result')$('result-matchup').textContent=`${match.player.name} vs ${match.opponent.name}`;if(match&&screen==='intro')$('intro-player').textContent=match.player.name;}
  function updateTourPotential() {
    if(!selectedEvent)return;
    const difficulty=window.TennisLocal.settings().difficulty;
    $('tour-setup-event').querySelector('span').textContent=`${catalog.multipliers[difficulty]}× points · Champion earns ${catalog.pointsFor(5,difficulty,selectedEvent.id).toLocaleString()} points · Saves at match end or from the pause menu`;
  }
  async function tourAction(fn) {
    if(tourBusy)return;
    tourBusy=true;tourActionError=null;$('start-btn').disabled=true;$('rematch-btn').disabled=true;$('setup-back').disabled=true;
    try {await fn();}
    catch(failure){tourActionError=failure;$('tour-setup-error').textContent=failure.message;$('tour-setup-error').hidden=false;window.TennisTourHub?.showError(failure.message);}
    finally{tourBusy=false;$('start-btn').disabled=false;$('setup-back').disabled=false;renderTourSave();}
  }
  async function resumeTournament(run) {
    const resumed=await tour.resume(run.id);applyRun(resumed);completionPending=false;
    await window.TennisLocal.useTourEngine(resumed.engineVersion);
    setChoices(tournament.venue,tournament.difficulty);window.TennisLocal.setEvent(resumed.eventId);
    if(resumed.status!=='active'){
      setScreen('result');$('result').classList.remove('hidden');$('result').inert=false;$('result').setAttribute('aria-hidden','false');
      complete(tournament.status==='champion');focus('rematch-btn');return;
    }
    if(tournament.awaitingNext){await tour.advance();applyRun(tour.snapshot().active);}
    openDraw('setup');
  }
  function openTour(returnEventId = null, returnDifficulty = null) {
    if(tourBusy)return;
    rememberChoices();closeHelp();introRemaining=0;mode='tournament';tournament=null;selectedEvent=null;
    characterEditing=false;window.TennisOfflineBuild?.endAccount();window.TennisAppearanceSelect?.endAccount();
    window.TennisLocal.prepareIntro();
    window.TennisLocal.setEvent(null);$('result').classList.add('hidden');$('result').inert=true;
    $('menu').dataset.selectedMode='tournament';setScreen('tour');
    window.TennisTourHub.open({onBack:home,onSelect:event=>setup('tournament',event),onCharacter:editCharacter,onResume:run=>tourAction(()=>resumeTournament(run))}).then(async()=>{
      const requested=catalog.getEvent(returnEventId),status=tour.snapshot();
      if(requested&&screen==='tour'&&(status.guest||status.user?.emailVerified)){
        if(status.recoveryRunId){await tourAction(()=>resumeTournament({id:status.recoveryRunId}));return;}
        const saved=status.runs.find(run=>run.eventId===requested.id);
        if(saved)await tourAction(()=>resumeTournament(saved));else if(status.enabled&&status.user?.username&&status.profile?.completed&&status.eligibility?.eligible!==false){if(requested.isMajor&&!status.majorAccess?.unlocked){window.TennisTourHub.showError('Reach 750 public Tour Points to unlock this Major permanently.');return;}setup('tournament',requested);if(catalog.difficulties.includes(returnDifficulty))setChoices(requested.venue,returnDifficulty);}
      }
      if(new URLSearchParams(location.search).get('onboarding')==='character'&&screen==='tour'&&status.user?.emailVerified&&status.user?.username){history.replaceState(null,'',location.pathname+'?mode=tournament');editCharacter(requested);}
    });
  }
  function editCharacter(event=null){
    const status=tour.snapshot();if(!status.user?.emailVerified||!status.user.username)return;
    characterReturnEvent=event;setup('tournament',event||catalog.events[0],true);
    const editorAccountId=setupAccountId,editorRevision=setupProfileRevision,editorGeneration=setupGeneration,returnEventId=event?.id;
    window.TennisAppearanceSelect?.configure({onSave:async (draft,editor)=>{
      if(tour.snapshot().user?.id!==editorAccountId)throw new Error('Your account changed. Reopen character setup.');
      if(Object.values(draft.ratings).reduce((sum,n)=>sum+n,0)!==40)throw new Error('Assign all 40 strength points.');
      await tour.saveProfile({playerId:'custom',customPlayer:{ratings:draft.ratings},appearance:draft.appearance},editorRevision);
      await tour.refresh();if(editor.isCurrent()&&screen==='setup'&&characterEditing&&setupGeneration===editorGeneration&&setupAccountId===editorAccountId&&setupProfileRevision===editorRevision){characterEditing=false;openTour(returnEventId);}
    }});
    window.TennisAppearanceSelect?.open();
  }
  function matchConfig() {
    if(mode==='practice'){
      const selected=window.TennisPlayerSelect?.selection()||{player:'classic',ai:'classic'};
      const name=selected.player?.id==='custom'?($('player-name').value.trim()||'PLAYER'):window.TennisRoster?.ENABLED?window.TennisRoster.get(selected.player).name:($('player-name').value.trim()||'PLAYER');
      return {roster:selected,names:{player:name,ai:'COACH'}};
    }
    if (mode !== 'tournament' || !tournament) return null;
    const match = draw.currentMatch(tournament);
    return match ? {difficulty:tournament.difficulty,roster:{player:match.player.profileId==='custom'?{id:'custom',ratings:match.player.ratings}:match.player.profileId,ai:match.opponent.profileId},characters:{player:match.player.id,ai:match.opponent.id},names:{player:match.player.name,ai:match.opponent.name},appearance:{player:tournamentAppearance},eventId:selectedEvent?.id,tournamentRound:tournament.round,resumeSnapshot:tour.snapshot().active?.checkpoint?.fixtureId===match.id?tour.snapshot().active.checkpoint.snapshot:null} : null;
  }
  function openDraw(returnScreen, readOnly = false) {
    if (!tournament) return;
    closeHelp();
    setScreen('draw');
    $('result').inert = true;
    window.TennisLocal.clearInput();
    window.TennisTournamentView.open(tournament,{
      playLabel:!readOnly && tournament.status==='active' ? `PLAY ${draw.stages[tournament.round].label.toUpperCase()}` : null,
      onPlay:!readOnly && tournament.status==='active' ? introduce : undefined,
      closeLabel:returnScreen==='result' ? 'Back to result' : 'Back to setup',
      onClose(){
        window.TennisLocal.clearInput();
        if(returnScreen==='result') {setScreen('result');$('result').inert=false;focus('tournament-draw-result');}
        else setup('tournament');
      }
    });
  }
  function introduce() {
    closeHelp();
    if (mode === 'tournament') {
      setChoices(tournament.venue, tournament.difficulty);
    }
    const choices = window.TennisLocal.settings();
    const court = courts.find(r => r.venue === choices.venue) || courts[0];
    $('match-intro').dataset.arena = court.venue;
    $('match-intro').dataset.destination = String(Boolean(court.destination));
    $('intro-round').textContent = mode === 'tournament' ? `${selectedEvent.name.toUpperCase()} / ${draw.stages[tournament.round].label.toUpperCase()}` : mode === 'practice' ? 'PRACTICE / SMASH LAB' : 'SINGLE GAME / YOUR COURT AWAITS';
    $('intro-title').textContent = mode==='tournament'?selectedEvent.city.toUpperCase():court.city;
    $('intro-surface').textContent = mode==='tournament'?selectedEvent.surface.toUpperCase()+' / TOP TENNIS TOUR':court.surface;
    $('match-intro').querySelector('.intro-topline>span').textContent=mode==='tournament'?'TOP TENNIS / '+selectedEvent.name.toUpperCase():'TOP TENNIS';
    const names = window.TennisLocal.names();
    $('intro-player').textContent = names.player;
    $('intro-opponent').textContent = names.ai;
    $('intro-stakes').textContent = mode === 'tournament' ? tournament.round===4 ? 'One match from the title. Win this match to become champion.' : `Win this match to reach the ${draw.stages[tournament.round+1].label.toLowerCase()}. ${5-tournament.wins} wins from the title.` : mode === 'practice' ? `Move under each lob, then press ${window.TennisControls?.labelFor('hit') || 'Space'} just before the ball reaches your racket. Build a perfect-smash streak.` : court.venue === 'moon' ? 'Apollo-era suits. Earth gravity. First to 3 games, win by 2. Tiebreak at 3–3.' : 'First to 3 games, win by 2. Tiebreak at 3–3.';
    introDuration = reducedMotion() ? 1 : 2.6;
    introRemaining = introDuration;
    $('intro-progress-fill').style.transform = 'scaleX(0)';
    $('result').classList.add('hidden'); $('result').inert = true; $('result').setAttribute('aria-hidden','true');
    window.TennisLocal.prepareIntro();
    setScreen('intro');
    focus('intro-skip');
  }
  function play() {
    if (screen !== 'intro' || window.TennisOnline?.active) return;
    introRemaining = 0;
    setScreen('playing');
    window.TennisLocal.startOffline();
  }
  function tick(dt) {
    if (screen !== 'intro') return;
    if (window.TennisOnline?.active) {hide(); return;}
    // Don't consume the introduction while the player is looking at another tab.
    if (document.hidden) return;
    introRemaining = Math.max(0, introRemaining - dt);
    $('intro-progress-fill').style.transform = `scaleX(${1 - introRemaining / introDuration})`;
    if (introRemaining <= 1e-9) play();
  }
  function complete(won) {
    screen = 'result';
    const eyebrow = $('result').querySelector('.eyebrow');
    $('rematch-btn').querySelector('b').textContent = 'R';
    $('result-menu-btn').textContent = 'Back to all modes';
    $('tournament-draw-result').hidden = mode !== 'tournament';
    $('tour-result-next').hidden = mode !== 'tournament';
    for(const link of $('tour-result-next').querySelectorAll('a'))link.hidden=!!tour.snapshot().guest;
    $('tour-ranking-result').hidden=true;$('tour-ranking-retry').hidden=true;rankingGeneration++;
    if (mode === 'tournament' && tournament) {
      const saved=tour.snapshot().active;
      if(saved)applyRun(saved);
      if(!draw.currentMatch(tournament).completed){completionPending=true;$('tour-result-next').hidden=true;$('rematch-btn').querySelector('span').textContent='Saving result…';$('result-stats').textContent+=' · Saving your result…';renderTourSave();return;}
      completionPending=false;
      const completedMatch=saved.matches?.at(-1),fixture=draw.currentMatch(tournament);
      if(completedMatch)$('result-score').textContent=`${completedMatch.score.playerGames} — ${completedMatch.score.aiGames} GAMES`;
      $('result-matchup').textContent=`${fixture.player.name} vs ${fixture.opponent.name}`;
      // The final checkpoint retains both actors, including when reopening a finished run.
      const snapshot=saved.checkpoint?.fixtureId===fixture.id?saved.checkpoint.snapshot:null;
      window.TennisMatchResults?.render($('match-stats'),snapshot||{stats:completedMatch?.stats},
        {player:fixture.player.name,ai:fixture.opponent.name});
      won = draw.currentMatch(tournament).winnerId === tournament.playerId;
      const champion = tournament.status === 'champion';
      eyebrow.textContent = `${selectedEvent.name.toUpperCase()} / ${champion?'CHAMPION':draw.stages[tournament.round].label.toUpperCase()}`;
      $('result-title').textContent = won ? champion ? 'TOUR CHAMPION' : 'ROUND WON' : 'RUN ENDED';
      $('result-stats').textContent = won ? champion ? 'Five matches won. The title is yours.' : `Through to the ${draw.stages[tournament.round + 1].label.toLowerCase()}.` : `Eliminated in the ${draw.stages[tournament.round].label.toLowerCase()}. ${tournament.wins} of 5 matches won.`;
      const value=catalog.pointsFor(tournament.wins,tournament.difficulty,tournament.eventId||selectedEvent.id);
      $('result-stats').textContent+=saved.award?` · ${saved.award.points} Career Points earned.`:` · Run value: ${value} points. Next win: ${catalog.pointsFor(tournament.wins+1,tournament.difficulty,tournament.eventId||selectedEvent.id)}.`;
      if(saved.award){
        if(!tour.snapshot().guest)showRankingResult();
        tour.refresh().catch(()=>{});
      }
      $('rematch-btn').querySelector('span').textContent = won && !champion ? 'CONTINUE TOURNAMENT' : tour.snapshot().guest?'BACK TO BROWSER CAREER':'ENTER AGAIN';
      $('tour-harder').hidden=!!tour.snapshot().guest||!champion||tournament.difficulty==='legend';
    } else {
      eyebrow.textContent = 'MATCH COMPLETE';
      $('rematch-btn').querySelector('span').textContent = 'PLAY AGAIN';
    }
    renderTourSave();
  }
  async function showRankingResult(){
    const generation=++rankingGeneration,run=tour.snapshot().active,impact=tour.snapshot().impact||run?.rankingImpact;
    const node=$('tour-ranking-result');node.hidden=false;$('tour-ranking-retry').hidden=true;
    let message=impact?.reason==='improved'?`Tour Points improved by ${impact.delta}: ${impact.beforePoints} → ${impact.afterPoints}. `:impact?.reason==='renewed'?'You matched your city result and renewed its 90-day eligibility. ':impact?.reason==='unchanged'?'Your city contribution stays unchanged. ':!run?.rankingPolicyVersion?'This legacy run remains in your personal career and does not enter the public ranking. ':impact?.reason==='ineligible'?'This result is saved to your personal career and is currently excluded from public rankings. ':'';
    node.textContent=message+'Updating your position…';
    try{const result=await tour.ranking();if(generation!==rankingGeneration)return;
      const player=result.player;node.textContent=message+(player?.rank?`Your position: #${player.rank} · ${player.tourPoints.toLocaleString()} Tour Points. Equal totals share a rank.`:result.reason==='expired'?'Your eligible results have expired. Finish a new tournament to return to the rankings.':result.reason==='zero_points'?'You have no positive Tour Points yet. Complete a win in a new tournament to enter the rankings.':result.reason==='suspended'?'Your public ranking is currently unavailable.':'Finish an eligible tournament with points to join the public rankings.');
    }catch{if(generation!==rankingGeneration)return;node.textContent=message+'Your career result is saved. We could not load your current position.';$('tour-ranking-retry').hidden=false;}
  }
  async function replay() {
    if (screen !== 'result') return;
    if (mode === 'tournament' && tournament) {
      if(completionPending||tour.hasPending())return;
      await tourAction(async()=>{
        if (tournament.status === 'active') {if(tournament.awaitingNext)applyRun(await tour.advance());openDraw('result');}
        else if(tour.snapshot().guest){setTimeout(()=>openTour(),0);}
        else {const event=selectedEvent;setup('tournament',event);}
      });
      return;
    }
    introduce();
  }
  function hide() {
    introRemaining = 0;
    closeHelp();
    visible($('match-intro'), false);
    if (window.TennisOnline?.active) {screen = 'online'; tournament = null;}
  }
  function closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;
    visible($('how-to-play'), false);
    $('how-to-play-toggle').setAttribute('aria-expanded','false');
    for (const id of ['menu-home','menu-setup','tour-hub']) $(id).inert = $(id).hidden;
    helpFocus?.focus({preventScroll:true});
  }
  function openHelp() {
    window.TennisControlSettings?.refreshLabels();
    helpFocus = document.activeElement;
    helpOpen = true;
    visible($('how-to-play'),true);
    $('how-to-play-toggle').setAttribute('aria-expanded','true');
    $('menu-home').inert = true; $('menu-setup').inert = true; $('tour-hub').inert = true;
    focus('controls-close');
  }
  function handleKey(event) {
    if(tourBusy){if(event.code==='Escape')event.preventDefault();return true;}
    if (screen === 'draw') return true;
    if (!['home','setup','intro','tour'].includes(screen)) return false;
    if (helpOpen) {
      if (event.code === 'Escape') {event.preventDefault();closeHelp();}
      if (event.code === 'Tab') {event.preventDefault();focus('controls-close');}
      return true;
    }
    if (event.code === 'Escape') {
      event.preventDefault();
      if (screen === 'intro') returnToSetup();
      else if (screen === 'setup') backFromSetup();
      else if(screen==='tour')home();
      return true;
    }
    const native = event.target?.closest?.('button,input,a,summary');
    if (event.code === 'Space' && !native) {
      event.preventDefault();
      if (!event.repeat) launch();
      return true;
    }
    if (event.code === 'KeyF') return false;
    return true;
  }
  window.TennisMenu = {started(){introRemaining=0;setScreen('playing');},openOnline:()=>setup('online'),openTour,launch, replay, tick, complete, hide, home, handleKey,matchConfig,allowsVenue,
    tournamentState:()=>tournament?JSON.parse(JSON.stringify(tournament)):null,
    debug:() => ({screen,mode,setupStep:screen==='setup'&&mode==='single'?singleStep:null,tournament:tournament ? draw.summary(tournament):null,introRemaining:+introRemaining.toFixed(2)})};
  document.querySelectorAll('.mode-choice').forEach(button => button.addEventListener('click', () => setup(button.dataset.mode)));
  $('setup-back').addEventListener('click',backFromSetup);
  $('setup-next').addEventListener('click',nextSingleStep);
  $('intro-skip').addEventListener('click',play);
  $('intro-back').addEventListener('click',returnToSetup);
  $('tournament-draw-result').addEventListener('click',()=>openDraw('result',true));
  $('how-to-play-toggle').addEventListener('click',openHelp);
  $('controls-close').addEventListener('click',closeHelp);
  $('tour-another-city').addEventListener('click',()=>openTour());
  $('tour-harder').addEventListener('click',()=>{const next=catalog.difficulties[catalog.difficulties.indexOf(tournament.difficulty)+1],event=selectedEvent;setup('tournament',event);setChoices(event.venue,next);updateTourPotential();});
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.addEventListener('click',updateTourPotential));
  $('tour-save-retry').addEventListener('click',()=>tour.flush().catch(()=>{}));
  $('tour-save-reload').addEventListener('click',()=>location.reload());
  $('tour-result-next').addEventListener('click',event=>{if(event.target.closest('a[aria-disabled="true"]'))event.preventDefault();});
  $('tour-ranking-retry').addEventListener('click',showRankingResult);
  tour.subscribe(()=>{
    const status=tour.snapshot();
    const owner=tournament?tournamentAccountId:screen==='setup'?setupAccountId:null;
    if(mode==='tournament'&&owner&&status.user?.id!==owner&&!status.guest){
      tournament=null;selectedEvent=null;characterEditing=false;completionPending=false;rankingGeneration++;
      window.TennisOfflineBuild?.endAccount();window.TennisAppearanceSelect?.endAccount();window.TennisLocal.prepareIntro();window.TennisLocal.setEvent(null);
      $('result').classList.add('hidden');$('result').inert=true;setScreen('tour');
      window.TennisTourHub.open({onBack:home,onSelect:event=>setup('tournament',event),onCharacter:editCharacter,onResume:run=>tourAction(()=>resumeTournament(run))}).then(()=>window.TennisTourHub.showError('Your account changed. Choose a tournament to continue.'));return;
    }
    renderTourSave(status);
    if(status.active&&tournament&&status.active.id===tournament.runId)applyRun(status.active);
    if(completionPending&&!status.pending&&!status.saving&&tournament)complete(draw.currentMatch(tournament).winnerId===tournament.playerId);
  });
  home(false);
  // Landing and guide links open the selected setup without starting a match.
  const linkedMode = new URLSearchParams(window.location.search).get('mode');
  if(linkedMode==='tournament')openTour(new URLSearchParams(window.location.search).get('event'),new URLSearchParams(window.location.search).get('difficulty'));
  else if (['single', 'practice', 'online'].includes(linkedMode)) setup(linkedMode);
})();
