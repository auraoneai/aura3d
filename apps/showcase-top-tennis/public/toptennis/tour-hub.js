/* Nine events, one persistent personal tour. All dynamic account text uses textContent. */
(() => {
  'use strict';
  const catalog = window.TennisTourCatalog, tour = window.TennisTour;
  const trophyIcon = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M15 8h18v12c0 7-4 11-9 11s-9-4-9-11V8Z"/><path d="M15 12H8v5c0 6 4 9 9 9m16-14h7v5c0 6-4 9-9 9M24 31v9m-9 1h18M19 36h10"/></svg>';
  const host = document.createElement('section');
  host.id = 'tour-hub'; host.className = 'tour-hub'; host.hidden = true; host.inert = true;
  host.setAttribute('aria-labelledby','tour-title');
  host.innerHTML = `<div class="tour-nav"><button type="button" class="text-button" id="tour-back">All modes</button><div><a href="/rankings">Rankings</a><a href="/account/" id="tour-account">My career</a><button type="button" class="text-button" id="tour-sign-out" hidden>Sign out</button></div></div>
    <div class="tour-heading"><div><p class="menu-kicker">THE TOP TENNIS TOUR</p><h2 id="tour-title" tabindex="-1">NINE TOURNAMENTS.<br><em>YOUR LEGACY.</em></h2><p class="tour-description">Choose your court. Build your record. Earn your place in the Majors.</p></div><div class="tour-totals" id="tour-totals"><div><strong id="tour-total">—</strong><span>PERSONAL TOUR POINTS · 90 DAYS</span></div><div><strong id="tour-titles">0 / 9</strong><span>TOURNAMENTS WON</span></div></div></div>
    <p class="tour-notice" id="tour-notice" role="status">Sign in to save your tournaments and start your career.</p>
    <section id="tour-onboarding" class="tour-onboarding" hidden aria-labelledby="tour-onboarding-title"><p class="menu-kicker">YOUR PUBLIC TOUR IDENTITY</p><h3 id="tour-onboarding-title">Choose your username</h3><p>Your username, Tour Points, rank and eligible city results appear in the public community rankings. Your email, Google name and authentication details stay private. Results are reported by players’ browsers and reviewed for abuse.</p><form id="tour-username-form"><label for="tour-username">Public username</label><input id="tour-username" name="username" autocomplete="nickname" minlength="3" maxlength="20" pattern="[A-Za-z0-9][A-Za-z0-9_]{2,19}" required aria-describedby="tour-username-help tour-username-status"/><small id="tour-username-help">3–20 letters, numbers or underscores. Start with a letter or number. Names are unique regardless of case. Game characters and official roles are reserved. You can rename once every 30 days; your previous names stay reserved to your account.</small><p id="tour-username-status" role="status"></p><button class="tour-enter" type="submit">Claim username</button></form></section>
    <button type="button" class="tour-enter tour-character-action" id="tour-character" hidden>Create your character</button>
    <button type="button" class="text-button" id="tour-legacy" hidden>View old browser career</button>
    <div class="tour-finalization" id="tour-finalization" hidden><p id="tour-finalization-message" role="status"></p><button class="text-button" type="button" id="tour-finalization-retry" hidden>Retry ranking update</button></div>
    <button type="button" class="tour-enter tour-recover" id="tour-recover" hidden>Recover saved progress</button>
    <section class="tour-qualification" id="tour-qualification" aria-labelledby="tour-qualification-title">
      <div class="tour-qualification-icon">${trophyIcon}</div>
      <div class="tour-qualification-copy"><p class="tour-tier-kicker" id="tour-qualification-kicker">YOUR ROAD TO THE MAJORS</p><h3 id="tour-qualification-title">Earn your place on the big stage.</h3><p class="tour-major-access" id="tour-major-access" role="status"></p><button type="button" class="text-button" id="tour-major-retry" hidden>Retry qualification check</button></div>
      <div class="tour-qualification-progress"><div class="tour-progress-label"><strong id="tour-major-milestone"></strong><span id="tour-major-target"></span></div><progress id="tour-major-progress" max="750" value="0" aria-label="Public Tour Points toward Major qualification"></progress><p id="tour-major-progress-note"></p><a class="tour-major-link" href="#tour-majors-title">Explore Major Opens</a></div>
    </section>
    <div id="tour-cards" class="tour-tiers">
      <section class="tour-regular-section" aria-labelledby="tour-regular-title"><div class="tour-section-heading"><div><p class="tour-tier-kicker">THE CLIMB · 5 TOURNAMENTS</p><h3 id="tour-regular-title">Tour tournaments</h3><p>Build your ranking. Collect titles. Make your way to the Majors.</p></div><span class="tour-section-points">250–750 <small>BASE TITLE PTS</small></span></div><div class="tour-cards tour-regular-cards" id="tour-regular-cards"></div></section>
      <section class="tour-majors-section" id="tour-majors" aria-labelledby="tour-majors-title"><div class="tour-section-heading"><div><p class="tour-tier-kicker">THE PINNACLE · 4 CHAMPIONSHIPS</p><h3 id="tour-majors-title" tabindex="-1">Major Opens</h3><p>Four iconic cities. Five wins from a Major title. How far will you go?</p></div><span class="tour-section-points">1,000 <small>BASE TITLE PTS EACH</small></span></div><div class="tour-cards tour-major-cards" id="tour-major-cards"></div><p class="tour-majors-footnote">Earn your invitation once. Chase all four titles forever.</p></section>
    </div>
    <div class="tour-bottom"><p id="tour-recommendation">Nine tournaments. Five wins to a title. Your next chapter starts here.</p><details><summary>How Tour Points work</summary><p>Your best finalized result in each city during the last 90 days contributes to Tour Points, up to 12,500. Repeats do not add together: better results replace a city’s contribution, equal results renew their expiry, and lower results cannot increase it. Active runs do not count. When a best result expires, a lower eligible result may take its place.</p><p>Every finalized run also earns permanent Career Points, including completed wins when you withdraw. Equal totals share a rank. More attempts offer more chances to improve your best.</p><p>Base title points: Dubai and Los Angeles 250 · Monaco and Roma 500 · Turin Finals 750 · Majors 1,000. Completed wins award 0%, 6%, 18%, 36%, 60%, or 100% of the title points before the difficulty multiplier; the final award is rounded to the nearest whole point.</p><p>Easy ×0.25 · Club ×0.5 · Ace ×1.5 · Legend ×2. Abilities and difficulty stay fixed throughout a run. Reach 750 public ranking points once to unlock New York, Paris, London and Sydney permanently. Legacy results remain in your personal career; public rankings count eligible account-character runs only.</p></details></div>`;
  document.getElementById('menu-setup').before(host);
  const $ = id => document.getElementById(id);
  let callbacks = {}, busy = false, loadError = '',accountId=null,availabilitySequence=0,availabilityTimer,editingUsername=new URLSearchParams(location.search).get('onboarding')==='username',pendingEvent=catalog.getEvent(new URLSearchParams(location.search).get('event')),finalRun=null,finalizationSequence=0;
  const needsIdentity=state=>!!state.user&&!state.user.username;
  const surfaces = {hard:'HARD COURT',clay:'CLAY COURT',grass:'GRASS COURT'};
  const finish = wins => ['Round of 32','Round of 16','Quarterfinal','Semifinal','Runner-up','Champion'][wins || 0];
  let exposureObservers=[];
  async function action(fn) {
    if (busy) return;
    busy = true; loadError = ''; render();
    try { await fn(); } catch (failure) { loadError = failure.message; }
    finally { busy = false; render(); }
  }
  function render() {
    exposureObservers.forEach(observer=>observer.disconnect());exposureObservers=[];
    const focused=document.activeElement,focusedCard=focused?.closest?.('.tour-card'),focusedAction=['tour-enter','tour-withdraw','tour-card-title-link','tour-details-link'].find(className=>focused?.classList?.contains(className));
    const state = tour.snapshot();
    if(accountId!==state.user?.id){accountId=state.user?.id;availabilitySequence++;finalizationSequence++;finalRun=null;$('tour-finalization').hidden=true;$('tour-username').value=state.user?.username||'';$('tour-username-status').textContent='';}
    $('tour-total').textContent = state.stats?(state.stats.tourPoints||0).toLocaleString():'—';
    const conquered = state.stats?.events?.filter(event=>event.titles > 0).length || 0;
    $('tour-titles').textContent = `${conquered} / ${catalog.events.length}`;
    $('tour-totals').hidden = !state.user&&!state.guest;
    $('tour-sign-out').hidden = !state.user;
    $('tour-back').disabled=busy;
    $('tour-sign-out').disabled=busy;
    $('tour-account').textContent = state.user ? 'My career' : 'Sign in';
    $('tour-account').href = state.user ? '/account/' : tour.authURL(catalog.events[0].id);
    $('tour-notice').textContent = loadError || (state.guest ? 'Your old browser career. Finish saved runs with their original settings. These records stay on this browser and never enter public rankings.' : !state.enabled ? 'Tournament entries open when the account service is ready. Explore the nine tournaments below.' : state.user ? !state.user.emailVerified ? 'Verify your email before setting up your Tour identity.' : state.user.username ? `Welcome, ${state.user.username}. Your career is saved to your account.` : 'Choose a public username, then create your character to enter the Tour.' : 'Sign in and verify your account to build your career and join the public Tour rankings.');
    const notice = $('tour-notice');
    if (/^Sign in\b/.test(notice.textContent)) {
      const link = document.createElement('a'); link.href = tour.authURL(catalog.events[0].id); link.textContent = 'Sign in';
      notice.replaceChildren(link, document.createTextNode(notice.textContent.slice(7)));
    }
    $('tour-onboarding').hidden=!state.user?.emailVerified||(!needsIdentity(state)&&!editingUsername);
    $('tour-onboarding-title').textContent=state.user?.username?'Change your username':'Choose your username';
    $('tour-username-form').querySelector('button').disabled=busy;
    $('tour-character').hidden=!state.user?.emailVerified||needsIdentity(state)||!!state.profile?.completed;
    $('tour-character').disabled=busy;
    $('tour-legacy').hidden=!state.legacyAvailable&&!state.guest;
    $('tour-legacy').textContent=state.guest?'Back to account Tour':'View old browser career';
    $('tour-legacy').disabled=busy;
    $('tour-notice').classList.toggle('is-error',!!loadError);
    $('tour-recover').hidden=!state.recoveryRunId;
    $('tour-recover').disabled=busy;
    const access=state.majorAccess,required=access?.requiredPoints||catalog.majorRequiredPoints;
    const unlocked=!state.guest&&!!access?.unlocked,knownPoints=!state.guest&&!!state.user&&!!access;
    const rankingPoints=knownPoints?Math.max(0,access.rankingPoints||0):0,remaining=Math.max(0,required-rankingPoints);
    $('tour-qualification').classList.toggle('is-unlocked',unlocked);
    $('tour-majors').classList.toggle('is-unlocked',unlocked);
    $('tour-qualification-kicker').textContent=state.guest?'YOUR BROWSER CAREER':unlocked?'YOUR NEXT CHAPTER':'YOUR ROAD TO THE MAJORS';
    $('tour-qualification-title').textContent=state.guest?'Your saved tournaments await.':unlocked?'You’ve earned the big stage.':'Earn your place on the big stage.';
    $('tour-major-access').textContent=state.guest?'Saved browser tournaments remain available to resume. New entries and Major qualification require an account.':unlocked?'MAJORS UNLOCKED · All four Opens are yours to enter, permanently.':`Reach ${required.toLocaleString()} public Tour Points to unlock all four Major Opens for good.${state.user?` You have ${knownPoints?rankingPoints.toLocaleString():'—'} / ${required.toLocaleString()} points.`:''}`;
    $('tour-major-milestone').textContent=state.guest?'Continue your career':unlocked?'4 / 4 unlocked':knownPoints?`${rankingPoints.toLocaleString()} / ${required.toLocaleString()}`:state.user?'Qualification unavailable':`${required.toLocaleString()} points`;
    $('tour-major-target').textContent=state.guest?'':unlocked?'PERMANENT ACCESS':knownPoints?'PUBLIC TOUR PTS':state.user?'':'TO UNLOCK';
    const progress=$('tour-major-progress');progress.max=required;progress.value=unlocked?required:Math.min(rankingPoints,required);progress.hidden=!!state.guest||(!knownPoints&&!!state.user);
    progress.setAttribute('aria-valuetext',unlocked?'All four Major Opens permanently unlocked':knownPoints?`${rankingPoints} of ${required} public Tour Points`:`Reach ${required} public Tour Points to qualify`);
    $('tour-major-progress-note').textContent=state.guest?'Legacy results stay in this browser.':unlocked?'Your invitation never expires.':knownPoints?remaining?`${remaining.toLocaleString()} more points. Four new stages.`:'Your qualification has not yet been confirmed.':state.user?'Retry to check your qualification.':'Start with the Tour tournaments below.';
    $('tour-major-retry').hidden=!state.user||!!access||!!state.guest;$('tour-major-retry').disabled=busy;
    const container = $('tour-cards'),regularCards=$('tour-regular-cards'),majorCards=$('tour-major-cards');regularCards.replaceChildren();majorCards.replaceChildren();
    for (const [index,event] of catalog.events.entries()) {
      const record = state.stats?.events?.find(item=>item.eventId === event.id);
      const run = state.runs.find(item=>item.eventId === event.id);
      const card = document.createElement('article');card.className = `tour-card${event.isMajor?' tour-card-major':''}`; card.dataset.event = event.id;
      card.innerHTML = `<div class="tour-card-art" aria-hidden="true"><span class="tour-city-index">${event.isMajor?'MAJOR OPEN':`TOUR / 0${index+1}`}</span><span class="tour-art-sun"></span><span class="tour-art-court"></span><span class="tour-card-trophy">${trophyIcon}</span></div><div class="tour-card-copy"><div class="tour-card-meta"><p class="tour-surface"></p><span class="tour-major-badge" hidden>MAJOR</span></div><h4><a class="tour-card-title-link"></a></h4><p class="tour-base-points"></p><div class="tour-record"><span></span><strong></strong></div><p class="tour-expiry" hidden></p><p class="tour-entry-requirement" hidden></p><a class="tour-details-link">Details &amp; points <span aria-hidden="true">→</span></a><button class="tour-enter" type="button"></button><button class="tour-withdraw text-button" type="button" hidden>Withdraw from saved run</button></div>`;
      card.querySelector('.tour-surface').textContent = surfaces[event.venue];
      card.querySelector('.tour-card-title-link').textContent = event.name;
      for(const link of card.querySelectorAll('.tour-card-title-link,.tour-details-link'))link.href=`/tournament/${encodeURIComponent(event.id)}/?from=tour`;
      card.querySelector('.tour-details-link').setAttribute('aria-label',`${event.name}: details and points`);
      card.querySelector('.tour-major-badge').hidden=!event.isMajor;
      card.querySelector('.tour-base-points').textContent=`${event.baseTitlePoints.toLocaleString()} BASE TITLE PTS`;
      const ready=state.user?.emailVerified&&!needsIdentity(state)&&state.profile?.completed;
      const locked=!!event.isMajor&&!run&&!state.guest&&!!ready&&!access?.unlocked;
      card.classList.toggle('is-locked',locked);
      const requiresQualification=!!event.isMajor&&!run&&!state.guest&&!unlocked;
      const requirement=card.querySelector('.tour-entry-requirement');requirement.id=`${event.id}-requirement`;requirement.hidden=!requiresQualification;requirement.textContent=`Unlocks at ${required.toLocaleString()} public Tour Points`;
      const hasRecord=Object.values(record?.bestByDifficulty||{}).some(Boolean);
      const hasStats=!!(hasRecord||record?.titles||record?.tourPoints);
      card.querySelector('.tour-record').hidden=!run&&!hasStats;
      card.querySelector('.tour-record span').textContent = run ? `${window.TennisTournament.stages[run.draw.round].label} · ${catalog.difficultyLabel(run.difficulty)}` : record?.titles ? `${record.titles} ${record.titles === 1 ? 'title' : 'titles'} · ${finish(record.bestWins)}` : hasRecord ? `Best: ${finish(record.bestWins)}` : '';
      card.querySelector('.tour-record strong').hidden=!state.stats||!hasStats;
      card.querySelector('.tour-record strong').textContent = `${record?.tourPoints || 0} PERSONAL PTS`;
      card.querySelector('.tour-card-trophy').hidden = !record?.titles;
      card.querySelector('.tour-expiry').hidden=!record?.expiresAt;
      card.querySelector('.tour-expiry').textContent = record?.expiresAt ? `Until ${new Date(record.expiresAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}` : '';
      const enter = card.querySelector('.tour-enter');enter.dataset.tourEvent = event.id;
      enter.textContent = run ? 'Resume tournament' : state.guest ? 'Account required for new entry' : locked ? 'Awaiting qualification' : event.isMajor ? unlocked?'Enter Major Open':!state.user?'Start your Major journey':'Continue to qualify' : 'Enter tournament';
      if(requiresQualification)enter.setAttribute('aria-describedby',requirement.id);
      enter.disabled = busy || locked || (state.guest&&!run) || (!state.enabled && !run);
      enter.addEventListener('click',()=>action(async()=>{
        window.TennisAnalytics?.tourEvent('tour_event_selected',{eventId:event.id});
        window.TennisSummary?.event('city_entry_attempted',event.id);
        if (!run&&!state.user) {location.assign(tour.authURL(event.id,'sign-up'));return;}
        if (!run&&!state.user.emailVerified) {location.assign(`/auth/verify-email?event=${encodeURIComponent(event.id)}`);return;}
        if(!run&&state.eligibility?.reasons?.includes('ranking_suspended'))throw new Error('Your public Tour participation is suspended. Contact support from your account page for help.');
        if(!run&&needsIdentity(state)){pendingEvent=event;$('tour-onboarding').scrollIntoView({block:'center'});$('tour-username').focus();return;}
        if(!run&&!state.profile?.completed){callbacks.onCharacter?.(event);return;}
        if(!run&&event.isMajor&&!tour.snapshot().majorAccess?.unlocked)throw new Error(`Reach ${required} public Tour Points to unlock the Majors permanently.`);
        await (run ? callbacks.onResume?.(run) : callbacks.onSelect?.(event));
      }));
      if (run) {
        const withdraw = card.querySelector('.tour-withdraw');withdraw.hidden = false;withdraw.disabled = busy;
        withdraw.addEventListener('click',()=>{
          if (!confirm(`Withdraw from ${event.name}? Your completed wins still earn points. The unfinished match will end.`)) return;
          action(async()=>{const result=await tour.withdraw(run.id);await tour.refresh();await showFinalization(result);});
        });
      }
      (event.isMajor?majorCards:regularCards).appendChild(card);
      if(locked&&!host.hidden&&typeof IntersectionObserver!=='undefined'){
        const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&!document.hidden){window.TennisSummary?.event('major_locked_shown',event.id,true);observer.disconnect();}});
        observer.observe(requirement);
        exposureObservers.push(observer);
      }
    }
    const suggested=state.stats?.recommendation;
    const next=suggested&&(!catalog.getEvent(suggested.eventId)?.isMajor||access?.unlocked||state.runs.some(run=>run.eventId===suggested.eventId))?suggested:state.guest?null:{eventId:catalog.events.find(event=>!event.isMajor)?.id,reason:'unplayed_city'};
    const reasons={unplayed_city:'Start your first run here.',first_title:'Your first title here is waiting.',unfinished_title:'Your first title here is waiting.',higher_difficulty:'Take on the next difficulty.',resume:'Pick up where you left off.',improve_best:'Take on the next difficulty.',improve_difficulty:'Take on the next difficulty.'};
    if(focusedCard&&focusedAction&&!focused.isConnected){const target=container.querySelector(`[data-event="${focusedCard.dataset.event}"] .${focusedAction}`);if(target&&!target.disabled)target.focus({preventScroll:true});}
    $('tour-recommendation').textContent = state.stats?.fourCityChampion ? 'FOUR-MAJOR CHAMPION · New York, Paris, London and Sydney trophies are yours. Keep building your collection.' : next ? `Your next challenge: ${catalog.getEvent(next.eventId)?.name || 'another city'}. ${reasons[next.reason] || 'Improve your personal best.'}` : 'Nine tournaments. Five wins to a title. Your next chapter starts here.';
  }
  async function showFinalization(run){
    window.TennisSummary?.event('result_shown',tour.snapshot().impact?.reason||run.rankingImpact?.reason||'ineligible');
    finalRun=run;const sequence=++finalizationSequence,state=tour.snapshot(),impact=state.impact||run.rankingImpact;
    let message=`Tournament finalized. ${run.award?.points||0} Career Points earned from completed wins. `;
    if(state.guest){$('tour-finalization').hidden=false;$('tour-finalization-message').textContent=message+'This result remains in your browser career.';return;}
    message+=impact?.reason==='improved'?`Public Tour Points improved by ${impact.delta} (${impact.beforePoints} → ${impact.afterPoints}). `:impact?.reason==='renewed'?'Your city result matched its best and renewed its 90-day expiry. ':!run.rankingPolicyVersion?'This legacy result does not contribute to public rankings. ':impact?.reason==='ineligible'?'This result is saved to your personal career and is currently excluded from public rankings. ':'Your public Tour contribution is unchanged. ';
    $('tour-finalization').hidden=false;$('tour-finalization-retry').hidden=true;$('tour-finalization-message').textContent=message+'Updating your position…';
    try{const result=await tour.ranking();if(sequence!==finalizationSequence)return;$('tour-finalization-message').textContent=message+(result.player?.rank?`Your position: #${result.player.rank} · ${result.player.tourPoints} Tour Points. Equal totals share a rank.`:'You have no current ranked position. Earn points in an eligible tournament to join the rankings.');}
    catch{if(sequence!==finalizationSequence)return;$('tour-finalization-message').textContent=message+'Your result is saved. Your current position could not be loaded.';$('tour-finalization-retry').hidden=false;}
  }
  let refreshing=false;
  async function refreshVisible(){if(host.hidden||busy||refreshing||document.hidden||tour.hasPending())return;refreshing=true;try{await tour.refresh();loadError='';}catch(failure){loadError=failure.message;}finally{refreshing=false;render();}}
  window.addEventListener('focus',refreshVisible);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshVisible();});
  $('tour-major-retry').addEventListener('click',refreshVisible);
  $('tour-back').addEventListener('click',()=>callbacks.onBack?.());
  $('tour-character').addEventListener('click',()=>callbacks.onCharacter?.(pendingEvent));
  $('tour-legacy').addEventListener('click',()=>action(()=>tour.snapshot().guest?tour.closeLegacy():tour.openLegacy()));
  $('tour-username').addEventListener('input',()=>{
    clearTimeout(availabilityTimer);const sequence=++availabilitySequence,input=$('tour-username');
    $('tour-username-status').textContent='';
    if(!input.checkValidity())return;
    availabilityTimer=setTimeout(async()=>{try{const result=await tour.usernameAvailability(input.value);if(sequence===availabilitySequence)$('tour-username-status').textContent=result.available?'Username available.':result.reason==='username_taken'?'This username is already claimed.':'This username is unavailable. Choose another.';}catch{if(sequence===availabilitySequence)$('tour-username-status').textContent='Availability could not be checked. Try claiming to check again.';}},300);
  });
  $('tour-username-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{await tour.claimUsername($('tour-username').value.trim());editingUsername=false;const query=new URLSearchParams(location.search);query.delete('onboarding');history.replaceState(null,'',location.pathname+'?'+query);if(!tour.snapshot().profile?.completed){$('tour-username-status').textContent='Username saved. Select Create your character to continue.';$('tour-character').hidden=false;$('tour-character').disabled=false;$('tour-character').focus();}});});
  $('tour-finalization-retry').addEventListener('click',()=>{if(finalRun)showFinalization(finalRun);});
  $('tour-recover').addEventListener('click',()=>action(()=>callbacks.onResume?.({id:tour.snapshot().recoveryRunId})));
  $('tour-sign-out').addEventListener('click',()=>action(()=>tour.signOut()));
  tour.subscribe(()=>{if (!host.hidden) render();});
  window.addEventListener('tennis-analytics-ready',()=>{if(!host.hidden){window.TennisSummary?.event('tour_viewed','none',true);render();}});
  window.TennisTourHub = Object.freeze({
    async open(options) {callbacks=options;host.hidden=false;host.inert=false;window.TennisSummary?.route('/tour-hub');window.TennisSummary?.event('tour_viewed','none',true);render();$('tour-title').focus({preventScroll:true});try{await tour.refresh();loadError='';}catch(failure){loadError=failure.message;}render();},
    close(){host.hidden=true;host.inert=true;exposureObservers.forEach(observer=>observer.disconnect());exposureObservers=[];window.TennisSummary?.route('/play/');},
    showError(message){loadError=message;render();},render
  });
})();
