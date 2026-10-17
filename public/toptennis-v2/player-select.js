/* Offline player type and roster menu, with independent custom abilities. */
(function () {
  'use strict';
  const roster = window.TennisRoster;
  const host = document.getElementById('roster-entry');
  if (!roster?.ENABLED || !host) return;
  const defaults = {player:'alcatraz', ai:'zinner'};
  const selected = {...defaults};
  let playerKind = 'roster';
  try { if(localStorage.getItem('baseline.offline-player-kind.v1')==='custom')playerKind='custom'; } catch {}
  const isCustom = () => mode==='tournament'||(playerKind==='custom'&&(mode==='single'||mode==='practice'));
  const existingId = (id, side) => roster.profiles.some(profile=>profile.id===id) ? id : defaults[side];
  const labels = {forehand:'Forehand',backhand:'Backhand',serve:'Serve',footwork:'Footwork',dropShot:'Drop shot'};
  const storedKey = 'baseline.roster.v1';
  try {
    const saved = JSON.parse(localStorage.getItem(storedKey) || '{}');
    for (const side of ['player','ai']) selected[side] = existingId(saved[side], side);
  } catch {}
  let editing = 'player', pending = selected.player, trigger = null, mode = 'single';
  host.innerHTML = `<section id="single-player-picker" aria-labelledby="single-player-heading" hidden inert>
    <div class="single-player-heading"><div><span class="option-label" id="single-player-heading">Choose your player</span><p>Ten pros. Ten playing styles.</p></div><button type="button" id="create-player" aria-pressed="false"><span aria-hidden="true">+</span> Create your player</button></div>
    <div class="roster-grid single-player-grid" role="group" aria-label="Choose your player"></div>
    <section id="single-player-profile" class="roster-profile" aria-live="polite" aria-atomic="true"><div class="roster-profile-copy"><p id="single-player-style"></p><h3 id="single-player-name"></h3><p id="single-player-description"></p></div><div class="roster-stats"></div></section>
  </section>
    <div id="roster-summary-heading" class="roster-entry-heading"><span>Choose players</span><span>10 playing styles</span></div>
    <div class="roster-entry-buttons"><button type="button" id="choose-player"><small>You</small><strong></strong><span>Change</span></button>
    <button type="button" id="choose-opponent"><small>Opponent</small><strong></strong><span>Change</span></button></div>`;
  const backdrop = document.createElement('div');
  backdrop.className = 'roster-overlay';
  backdrop.hidden = true;
  backdrop.innerHTML = `<section class="roster-dialog" role="dialog" aria-modal="true" aria-labelledby="roster-title" tabindex="-1">
    <header class="roster-header"><div><p class="roster-kicker">THE PLAYERS</p><h2 id="roster-title">Choose your player</h2></div><button type="button" id="roster-close" aria-label="Close player selection">×</button></header>
    <div class="roster-toolbar"><div class="roster-side" role="group" aria-label="Choose for"><button type="button" data-roster-side="player">You</button><button type="button" data-roster-side="ai">Opponent</button></div><span class="roster-fixed-note">10 players · fixed abilities</span></div>
    <div class="roster-grid" role="group" aria-label="Available players"></div>
    <section class="roster-profile" aria-live="polite" aria-atomic="true"><div class="roster-profile-copy"><p id="roster-style"></p><h3 id="roster-name"></h3><p id="roster-description"></p></div><div class="roster-stats"></div></section>
    <footer class="roster-footer"><p>Different strengths. Same controls.<span>Arcade ratings · players vary in overall ability</span></p><button type="button" id="roster-apply">Choose player</button></footer>
  </section>`;
  document.querySelector('.game-shell').appendChild(backdrop);
  const dialog = backdrop.querySelector('.roster-dialog');
  const grid = backdrop.querySelector('.roster-grid');
  const singlePicker = host.querySelector('#single-player-picker');
  const singleGrid = singlePicker.querySelector('.single-player-grid');
  const singleProfile = singlePicker.querySelector('#single-player-profile');
  const createPlayer = singlePicker.querySelector('#create-player');
  function playerCard(profile, index, attribute) {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute(attribute, profile.id);
    button.style.setProperty('--player-accent', profile.accent);
    button.innerHTML = `<span class="roster-number">${String(index+1).padStart(2,'0')}</span><strong></strong><small></small>`;
    button.querySelector('strong').textContent = profile.name;
    button.querySelector('small').textContent = profile.style;
    return button;
  }
  for (const [index, profile] of roster.profiles.entries()) {
    grid.appendChild(playerCard(profile, index, 'data-roster-id'));
    singleGrid.appendChild(playerCard(profile, index, 'data-single-player-id'));
  }
  function renderStats(target, profile) {
    target.replaceChildren();
    for (const [stat,label] of Object.entries(labels)) {
      const row = document.createElement('div'); row.className='roster-stat';
      const rating = profile.ratings[stat];
      row.innerHTML = `<span>${label}</span><span class="roster-stat-track" aria-hidden="true"><i style="width:${rating*10}%"></i></span><b>${rating}<small>/10</small></b>`;
      row.setAttribute('aria-label', `${label}: ${rating} out of 10`);
      target.appendChild(row);
    }
  }
  function updateSinglePicker() {
    const custom = isCustom(), profile = roster.get(selected.player);
    createPlayer.setAttribute('aria-pressed', String(custom));
    singleProfile.hidden = custom;
    singleProfile.inert = custom;
    for (const button of singleGrid.querySelectorAll('[data-single-player-id]')) button.setAttribute('aria-pressed', String(!custom && button.dataset.singlePlayerId === selected.player));
    singlePicker.querySelector('#single-player-name').textContent = profile.name;
    singlePicker.querySelector('#single-player-style').textContent = profile.style;
    singlePicker.querySelector('#single-player-description').textContent = profile.description;
    singleProfile.style.setProperty('--player-accent', profile.accent);
    renderStats(singleProfile.querySelector('.roster-stats'), profile);
  }
  function saveSelection() {
    try {
      localStorage.setItem(storedKey, JSON.stringify(selected));
      localStorage.setItem('baseline.offline-player-kind.v1', playerKind);
    } catch {}
  }
  function updateHome() {
    for (const [side,id] of [['player','choose-player'],['ai','choose-opponent']]) {
      const profile = roster.get(selected[side]), button = document.getElementById(id);
      button.querySelector('strong').textContent = profile.name;
      button.setAttribute('aria-label', `${side==='player'?'Your player':'Opponent'}: ${profile.name}. Change player`);
    }
  }
  function preview(id) {
    pending = existingId(id, editing);
    const profile = roster.get(pending);
    backdrop.querySelector('#roster-name').textContent = profile.name;
    backdrop.querySelector('#roster-style').textContent = profile.style;
    backdrop.querySelector('#roster-description').textContent = profile.description;
    backdrop.querySelector('.roster-profile').style.setProperty('--player-accent', profile.accent);
    renderStats(backdrop.querySelector('.roster-stats'), profile);
    for (const button of backdrop.querySelectorAll('[data-roster-id]')) button.setAttribute('aria-pressed',String(button.dataset.rosterId===pending));
    for (const button of backdrop.querySelectorAll('[data-roster-side]')) button.setAttribute('aria-pressed',String(button.dataset.rosterSide===editing));
    backdrop.querySelector('#roster-title').textContent = editing==='player' ? 'Choose your player' : 'Choose your opponent';
    backdrop.querySelector('#roster-apply').textContent = editing==='player' ? `Play as ${profile.name}` : `Face ${profile.name}`;
  }
  function open(side, button) {
    if(mode==='online'||((mode==='tournament'||mode==='practice')&&side==='ai')||(isCustom()&&side==='player'))return;
    editing = side; trigger = button;
    window.TennisLocal?.clearInput?.();
    preview(selected[editing]);
    backdrop.hidden = false;
    document.getElementById('menu').inert = true;
    backdrop.querySelector(`[data-roster-id="${pending}"]`).focus({preventScroll:true});
    dialog.scrollTop=0;
  }
  function close() {
    backdrop.hidden = true;
    document.getElementById('menu').inert = false;
    window.TennisLocal?.clearInput?.();
    trigger?.focus({preventScroll:true});
  }
  for (const [side,id] of [['player','choose-player'],['ai','choose-opponent']]) {
    const button = document.getElementById(id);
    button.addEventListener('click',()=>open(side,button));
  }
  backdrop.querySelector('#roster-close').addEventListener('click',close);
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)close();});
  for (const button of backdrop.querySelectorAll('[data-roster-id]')) button.addEventListener('click',()=>preview(button.dataset.rosterId));
  for (const button of backdrop.querySelectorAll('[data-roster-side]')) button.addEventListener('click',()=>{if(((mode==='tournament'||mode==='practice')&&button.dataset.rosterSide==='ai')||(isCustom()&&button.dataset.rosterSide==='player'))return;editing=button.dataset.rosterSide;preview(selected[editing]);});
  backdrop.querySelector('#roster-apply').addEventListener('click',()=>{
    selected[editing]=pending;
    saveSelection();
    updateHome(); updateSinglePicker(); close();
  });
  for (const button of singleGrid.querySelectorAll('[data-single-player-id]')) button.addEventListener('click',()=>{
    selected.player = button.dataset.singlePlayerId;
    playerKind = 'roster';
    saveSelection();
    updateHome(); setMode(mode);
  });
  createPlayer.addEventListener('click',()=>{
    playerKind = 'custom';
    saveSelection(); setMode(mode);
    window.TennisAppearanceSelect?.open();
  });
  // Keep keyboard navigation inside the chooser and out of the tennis inputs.
  document.addEventListener('keydown',event=>{
    if(backdrop.hidden)return;
    event.stopImmediatePropagation();
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){
      const buttons=[...dialog.querySelectorAll('button')].filter(button=>!button.hidden&&!button.disabled),first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
  document.addEventListener('keyup',event=>{if(!backdrop.hidden)event.stopImmediatePropagation();},true);
  function setMode(next) {
    mode=next;
    const onePlayer=mode==='tournament'||mode==='practice';
    document.getElementById('choose-opponent').hidden=onePlayer;
    backdrop.querySelector('[data-roster-side="ai"]').hidden=onePlayer;
    const custom=isCustom(),single=mode==='single'||mode==='practice';
    singlePicker.hidden=!single;singlePicker.inert=!single;
    const appearanceEntry=document.getElementById('appearance-entry');
    appearanceEntry.hidden=mode!=='online'&&!custom;
    appearanceEntry.inert=appearanceEntry.hidden;
    backdrop.querySelector('[data-roster-side="player"]').hidden=custom;
    const name=document.getElementById('player-entry'),build=document.getElementById('offline-build');
    name.hidden=!custom||mode==='tournament';name.inert=name.hidden;
    build.hidden=!custom;build.inert=!custom;
    host.hidden=mode==='online'||(custom&&mode==='tournament');
    host.inert=host.hidden;
    document.getElementById('choose-player').hidden=custom||single;
    host.querySelector('#roster-summary-heading span').textContent=single?'Choose your opponent':onePlayer?'Choose your player':'Choose players';
    host.querySelector('.roster-entry-buttons').classList.toggle('single-player',onePlayer||custom||single);
    updateSinglePicker();
  }
  window.TennisPlayerSelect = {
    selection:()=>({...selected,player:isCustom()?{id:'custom',ratings:window.TennisOfflineBuild.ratings()}:selected.player}),
    isCustom,isOpen:()=>!backdrop.hidden,setMode,
    applyPreferences(value){if(!value)return;if(mode!=='tournament'){selected.player=existingId(value.playerId,'player');playerKind=value.customPlayer?'custom':'roster';}if(value.customPlayer){window.TennisOfflineBuild?.apply(value.customPlayer.ratings);if(mode!=='tournament')document.getElementById('player-name').value=value.customPlayer.name||'';}if(value.appearance)window.TennisAppearanceSelect?.apply(value.appearance);setMode(mode);}
  };
  host.hidden=false; updateHome();
})();
