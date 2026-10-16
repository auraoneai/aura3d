/* Mirrored draw presentation; tournament rules and match controls stay separate. */
(function () {
  'use strict';
  const stageNames = ['Round of 32','Round of 16','Quarterfinals','Semifinals','Final'];
  const venues = {hard:'New York · Hard court',grass:'London · Grass court',clay:'Paris · Clay court'};
  const geometry = {width:1256,height:586,cardWidth:120,cardHeight:60,startY:64,pitch:68};
  const columns = [16,152,288,424,560,712,848,984,1120];
  let overlay, dialog, tournament, options = {}, activeRound = 0, trigger, inertStates = [];
  let scale = 1, drag = null;
  const heldKeys = new Set();
  const $ = selector => overlay.querySelector(selector);
  const element = (tag,className,content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const entrant = id => tournament.entrants.find(player => player.id === id);
  const matches = round => tournament.rounds[round] || [];
  const eventInfo = () => tournament.eventId ? window.TennisTourCatalog?.getEvent?.(tournament.eventId) : null;
  const matchNumber = fixture => String(33 - 2 ** (5 - fixture.round) + fixture.index).padStart(2,'0');
  function pathIndex(round) {
    const first = matches(0).findIndex(match => match.player1Id === tournament.playerId || match.player2Id === tournament.playerId);
    return first < 0 ? -1 : Math.floor(first / 2 ** round);
  }
  function isPlayerPath(fixture) {
    return fixture.index === pathIndex(fixture.round) && (tournament.status !== 'eliminated' || fixture.round <= tournament.round);
  }
  function scoreFor(fixture,side) {
    const score = fixture.score;
    if (!score) return '';
    if (Array.isArray(score)) return score[side] ?? '';
    if (Array.isArray(score.games)) return score.games[side] ?? '';
    return score[side === 0 ? 'player1' : 'player2'] ?? score[side === 0 ? 'player1Games' : 'player2Games'] ?? '';
  }
  function position(fixture) {
    if (fixture.round === 4) return {x:columns[4],y:302,width:136,center:332};
    const halfCount = 8 / 2 ** fixture.round, right = fixture.index >= halfCount;
    const index = fixture.index % halfCount;
    const center = geometry.startY + ((index + .5) * 2 ** fixture.round - .5) * geometry.pitch;
    return {x:columns[right ? 8 - fixture.round : fixture.round],y:center - geometry.cardHeight / 2,center,width:geometry.cardWidth,right};
  }
  const trophy = `<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M30 20h40v25c0 16-10 27-20 27S30 61 30 45V20Z" stroke="currentColor" stroke-width="2.5"/><path d="M30 28H18v12c0 13 8 20 19 21m33-33h12v12c0 13-8 20-19 21M50 72v13m-17 5h34M38 85h24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="m50 33 3 8 9 .4-7 5.4 2.2 8.5L50 50l-7.2 5.3 2.2-8.5-7-5.4 9-.4 3-8Z" fill="currentColor"/></svg>`;
  function ensureView() {
    if (overlay) return;
    overlay = element('div','tournament-draw-overlay'); overlay.hidden = true;
    overlay.innerHTML = `<section class="tournament-draw-dialog" role="dialog" aria-modal="true" aria-labelledby="tournament-draw-title" tabindex="-1">
      <header class="draw-header"><div><p class="draw-eyebrow" id="draw-event-heading">TOP TENNIS / WORLD COURT CUP</p><h2 id="tournament-draw-title">Road to the title<span aria-hidden="true">.</span></h2></div><div class="draw-event"><span>32 PLAYERS <i>·</i> ONE CHAMPION</span><p id="draw-conditions"></p></div><button type="button" id="tournament-draw-close" aria-label="Back from tournament draw"><span class="draw-close-label">Back</span></button></header>
      <div class="draw-board-frame"><div id="draw-round-panel" role="region" tabindex="0" aria-label="Full tournament bracket. Scroll to explore."><div class="draw-board-size"><div class="draw-board"><svg class="draw-connectors" viewBox="0 0 1256 586" aria-hidden="true"></svg><div class="draw-column-labels" aria-hidden="true"></div><div class="draw-centerpiece">${trophy}<p class="draw-eyebrow">WORLD COURT CUP</p><h3 id="draw-champion-name">One trophy.<br>One champion.</h3><span id="draw-champion-caption">THE FINAL</span></div><div class="draw-fixtures"></div></div></div></div></div>
      <footer class="draw-footer"><section class="draw-match-summary" aria-labelledby="draw-summary-title"><div><p class="draw-eyebrow" id="draw-summary-kicker"></p><h3 id="draw-summary-title"></h3></div><p id="draw-summary-opponent"></p><p id="draw-summary-note"></p></section><button type="button" id="tournament-draw-play">Play match</button></footer>
    </section>`;
    (document.querySelector('.game-shell') || document.body).appendChild(overlay);
    dialog = $('.tournament-draw-dialog');
    $('#tournament-draw-close').addEventListener('click',leave);
    $('#tournament-draw-play').addEventListener('click',() => {const callback = options.onPlay; close(); callback?.();});
    const panel = $('#draw-round-panel');
    panel.addEventListener('pointerdown',event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !panel.classList.contains('is-scrollable')) return;
      drag = {x:event.clientX,y:event.clientY,left:panel.scrollLeft,top:panel.scrollTop};
      panel.setPointerCapture(event.pointerId); panel.classList.add('is-dragging'); event.preventDefault(); panel.focus({preventScroll:true});
    });
    panel.addEventListener('pointermove',event => {
      if (drag) {panel.scrollLeft = drag.left + drag.x - event.clientX; panel.scrollTop = drag.top + drag.y - event.clientY;}
    });
    const stopDrag = () => {drag = null; panel.classList.remove('is-dragging');};
    panel.addEventListener('pointerup',stopDrag); panel.addEventListener('pointercancel',stopDrag); panel.addEventListener('lostpointercapture',stopDrag);
    new ResizeObserver(() => {if (isOpen()) resizeBoard();}).observe(panel);
    document.addEventListener('keydown',event => {
      if (!isOpen()) return;
      heldKeys.add(event.code || event.key); event.stopImmediatePropagation();
      if (event.key === 'Escape') {event.preventDefault(); leave(); return;}
      const active = document.activeElement;
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button:not([hidden]),[tabindex="0"]')].filter(node => !node.disabled && node.tabIndex >= 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (active === first || !dialog.contains(active))) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && (active === last || !dialog.contains(active))) {event.preventDefault(); first?.focus();}
      }
    },true);
    document.addEventListener('keyup',event => {
      const key = event.code || event.key;
      if (isOpen() || heldKeys.has(key)) event.stopImmediatePropagation(); heldKeys.delete(key);
    },true);
    window.addEventListener('blur',() => heldKeys.clear());
  }
  function leave() {const callback = options.onClose; close(); callback?.();}
  function renderEntrant(fixture,side) {
    const id = side === 0 ? fixture.player1Id : fixture.player2Id, player = entrant(id);
    const row = element('div','draw-entrant');
    if (player) row.dataset.entrantId = player.id;
    if (!player) row.classList.add('is-unresolved');
    if (id === tournament.playerId) row.classList.add('is-you');
    if (fixture.winnerId) row.classList.add(fixture.winnerId === id ? 'is-winner' : 'is-loser');
    const seed = element('span','draw-seed',player?.seed ? String(player.seed) : player ? '·' : '—');
    if (player?.seed) seed.setAttribute('aria-label',`Seed ${player.seed}`);
    const previous = fixture.round ? matches(fixture.round - 1)[fixture.index * 2 + side] : null;
    const name = player?.name || (previous ? `Winner M${matchNumber(previous)}` : 'To be confirmed');
    row.append(seed,element('span','draw-entrant-name',name)); row.title = player?.name || `Winner of match ${previous ? matchNumber(previous) : 'to be confirmed'}`;
    if (id === tournament.playerId) row.setAttribute('aria-label',`${name}, your player`);
    const score = scoreFor(fixture,side);
    if (score !== '') row.append(element('b','draw-score',String(score)));
    else if (fixture.winnerId && fixture.winnerId === id) {const tick = element('span','draw-winner-mark','✓'); tick.setAttribute('aria-label','Winner'); row.append(tick);}
    return row;
  }
  function renderBracket() {
    const grid = $('.draw-fixtures'), wires = $('.draw-connectors'), labels = $('.draw-column-labels');
    grid.replaceChildren(); wires.replaceChildren(); labels.replaceChildren();
    for (let column = 0; column < 9; column++) {
      if (column === 4) continue;
      const round = column < 4 ? column : 8 - column;
      const label = element('div','draw-column-label'); label.style.left = `${columns[column]}px`;
      label.append(element('b','',stageNames[round])); labels.append(label);
    }
    for (const fixtures of tournament.rounds) for (const fixture of fixtures) {
      const pos = position(fixture), card = element('article','draw-fixture');
      card.dataset.drawMatch = fixture.id; card.dataset.bracketRound = fixture.round;
      card.style.cssText = `left:${pos.x}px;top:${pos.y}px;width:${pos.width}px`;
      card.setAttribute('aria-label',`${stageNames[fixture.round]}, match ${matchNumber(fixture)}`);
      if (isPlayerPath(fixture)) card.classList.add('is-player-match');
      if (fixture.winnerId) card.classList.add('is-complete');
      if (fixture.round === 4) card.classList.add('is-title-match');
      const isUser = fixture.player1Id === tournament.playerId || fixture.player2Id === tournament.playerId;
      const info = element('div','draw-fixture-info');
      info.append(element('span','',`M${matchNumber(fixture)}`),element('span','',fixture.winnerId ? 'FINISHED' : isUser ? 'YOUR MATCH' : ''));
      card.append(info,renderEntrant(fixture,0),renderEntrant(fixture,1)); grid.append(card);
      if (fixture.round === 4) continue;
      const next = matches(fixture.round + 1)[Math.floor(fixture.index / 2)], dest = position(next);
      const x1 = pos.right ? pos.x : pos.x + pos.width, x2 = pos.right ? dest.x + dest.width : dest.x;
      const y2 = fixture.round === 3 ? dest.center + (pos.right ? 10 : -10) : dest.center;
      const middle = (x1 + x2) / 2, wire = document.createElementNS('http://www.w3.org/2000/svg','path');
      wire.setAttribute('d',`M${x1} ${pos.center} H${middle} V${y2} H${x2}`);
      wire.dataset.fromMatch = fixture.id; wire.dataset.toMatch = next.id;
      if (isPlayerPath(fixture) && (!fixture.winnerId || fixture.winnerId === tournament.playerId)) wire.classList.add('is-player-path');
      if (fixture.winnerId) wire.classList.add('is-complete'); wires.append(wire);
    }
    const final = matches(4)[0], champion = entrant(final.winnerId);
    $('.draw-centerpiece').classList.toggle('has-champion',Boolean(champion));
    $('#draw-champion-name').textContent = champion ? champion.name : 'One trophy.\nOne champion.';
    $('#draw-champion-caption').textContent = champion ? (eventInfo() ? 'OPEN CHAMPION' : 'WORLD COURT CHAMPION') : 'THE FINAL';
    for (const card of overlay.querySelectorAll('[data-bracket-round]')) card.classList.toggle('is-selected-round',+card.dataset.bracketRound === activeRound);
  }
  function focusFixture() {
    const fixture = matches(activeRound)[pathIndex(activeRound)] || matches(activeRound)[0];
    if (!fixture) return;
    const pos = position(fixture), panel = $('#draw-round-panel');
    panel.scrollLeft = Math.max(0,(pos.x + pos.width / 2) * scale - panel.clientWidth / 2);
    panel.scrollTop = Math.max(0,pos.center * scale - panel.clientHeight / 2);
  }
  function resizeBoard() {
    const panel = $('#draw-round-panel');
    const fit = window.innerWidth >= 1000 && window.innerHeight >= 600;
    scale = fit ? Math.max(.9,Math.min(1.6,(panel.clientWidth - 4) / geometry.width,(panel.clientHeight - 4) / geometry.height)) : 1;
    $('.draw-board-size').style.width = `${geometry.width * scale}px`;
    $('.draw-board-size').style.height = `${geometry.height * scale}px`;
    $('.draw-board').style.transform = `scale(${scale})`;
    const overflow = geometry.width * scale > panel.clientWidth + 1 || geometry.height * scale > panel.clientHeight + 1;
    panel.classList.toggle('is-scrollable',overflow);
    if (overflow) focusFixture();
  }
  function renderSummary() {
    const event=eventInfo();
    const name=event?.name||event?.title||'World Court Cup';
    $('#draw-event-heading').textContent='TOP TENNIS / '+name.toUpperCase();
    $('.draw-centerpiece .draw-eyebrow').textContent=name.toUpperCase();
    overlay.dataset.eventId=event?.id||'';
    const own = entrant(tournament.playerId), fixture = matches(Math.min(4,tournament.round))[pathIndex(Math.min(4,tournament.round))];
    const opponent = entrant(fixture && (fixture.player1Id === tournament.playerId ? fixture.player2Id : fixture.player1Id));
    const terminal = ['champion','eliminated'].includes(tournament.status), winner = tournament.status === 'champion';
    $('#draw-summary-kicker').textContent = winner ? 'THE CHAMPION' : terminal ? 'YOUR TOURNAMENT' : tournament.awaitingNext ? 'THROUGH TO THE NEXT ROUND' : `UP NEXT / ${stageNames[tournament.round].toUpperCase()}`;
    $('#draw-summary-title').textContent = own?.name || 'Your player';
    $('#draw-summary-opponent').textContent = winner ? 'The title is yours.' : terminal ? `Eliminated in the ${stageNames[tournament.round].toLowerCase()}.` : tournament.awaitingNext ? `${tournament.wins} wins. Keep going.` : opponent ? `vs ${opponent.name}` : 'Opponent to be decided';
    $('#draw-summary-note').textContent = `${tournament.wins} / 5 WINS`;
    $('.draw-match-summary').classList.toggle('is-champion',winner);
    const conditions=event?`${event.city} · ${{hard:'Hard court',clay:'Clay court',grass:'Grass court'}[tournament.venue]||'Championship court'}`:(venues[tournament.venue]||'Championship court');
    $('#draw-conditions').textContent = `${conditions} · ${window.TennisTourCatalog.difficultyLabel(tournament.difficulty)}`;
  }
  function open(state,config = {}) {
    ensureView();
    if (!isOpen()) {
      trigger = document.activeElement;
      inertStates = [...overlay.parentElement.children].filter(node => node !== overlay).map(node => [node,node.inert]);
      for (const [node] of inertStates) node.inert = true;
    }
    tournament = state; options = config; activeRound = Math.max(0,Math.min(4,state.round || 0));
    window.TennisLocal?.clearInput?.(); renderSummary(); renderBracket();
    const play = $('#tournament-draw-play'); play.hidden = typeof options.onPlay !== 'function';
    play.textContent = options.playLabel || 'Play match';
    $('.draw-close-label').textContent = options.closeLabel || 'Back';
    $('#tournament-draw-close').setAttribute('aria-label',options.closeLabel || 'Back from tournament draw');
    overlay.hidden = false;
    resizeBoard();
    (play.hidden ? $('#tournament-draw-close') : play).focus({preventScroll:true});
  }
  function close() {
    if (!isOpen()) return;
    overlay.hidden = true; drag = null;
    for (const [node,wasInert] of inertStates) node.inert = wasInert;
    inertStates = []; window.TennisLocal?.clearInput?.();
    if (trigger?.isConnected && !trigger.closest('[hidden],[inert]')) trigger.focus({preventScroll:true});
  }
  function isOpen() {return !!overlay && !overlay.hidden;}
  function updateIdentity(state){
    if(!isOpen()||state.runId!==tournament.runId)return;
    const previous=tournament.entrants.find(player=>player.id===tournament.playerId)?.name;
    const next=state.entrants.find(player=>player.id===state.playerId)?.name;
    if(previous===next)return;
    tournament=state;renderSummary();renderBracket();
  }
  window.TennisTournamentView = Object.freeze({open,close,isOpen,updateIdentity});
})();
