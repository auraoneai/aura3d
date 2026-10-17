/* Account-scoped tour transport. The server owns draws, revisions and rewards. */
(() => {
  'use strict';
  const catalog = window.TennisTourCatalog;
  const SAVE_GENERATION = 2;
  const clone = value => JSON.parse(JSON.stringify(value));
  const listeners = new Set();
  let user = null, profile = null, eligibility = null, majorAccess = null, active = null, stats = null, runs = [], enabled = false, impact = null;
  let pending = null, sending = null, error = null, saving = false, generation = 0, identityRequest=null, lastSavedAt=null;
  const MAX_BATCH_POINTS=64, MAX_BATCH_BYTES=400*1024;
  // Upload in the background during a match so the end-of-match save stays small.
  const AUTO_SAVE_POINTS=8, AUTO_SAVE_RETRY_MS=30_000;
  let autoSaveFailedAt=0;
  const key = id => `toptennis.tour.pending.v2.${id}`;
  const actionKey = id => `toptennis.tour.action.v2.${id}`;
  const writerKey = () => `toptennis.tour.writer.v2.${user?.id}.${active?.id}`;
  let saveGeneration = null;
  let actionRequest=null, actionSending=null, recoveryWarning=null, recoveryClaim=null, rememberedRecovery=null;
  const storageWarning='This browser cannot store recovery data. Keep this tab open and retry until your progress is saved to your account.';
  const id = () => window.TennisRandomId.randomUUID();
  const tabId=id();
  function removeStored(matches) {
    try {
      const keys=[];
      for(let index=0;index<localStorage.length;index++){const item=localStorage.key(index);if(item&&matches(item))keys.push(item);}
      for(const item of keys)try{localStorage.removeItem(item);}catch{}
    } catch {}
  }
  // The reset retires every old replay buffer, including other accounts and
  // archived/conflicting requests. Never inspect or submit their payloads.
  function removeLegacyRecovery() {removeStored(item=>item.startsWith('toptennis.tour.pending.v1.')||item.startsWith('toptennis.tour.action.v1.'));}
  removeLegacyRecovery();
  function resetRequired() {const failure=new Error('Tournament saves have been refreshed. Reload this page to continue.');failure.status=409;failure.code='tour_reset_required';return failure;}
  function requireSaveGeneration() {if(saveGeneration!==SAVE_GENERATION)throw resetRequired();}
  function invalidateSaves(failure,discard=false) {
    if(discard&&user){const pendingPrefix=key(user.id),actionPrefix=actionKey(user.id);removeStored(item=>item===pendingPrefix||item.startsWith(pendingPrefix+'.')||item===actionPrefix||item.startsWith(actionPrefix+'.'));}
    generation++;saveGeneration=null;enabled=false;active=null;stats=null;majorAccess=null;runs=[];pending=null;sending=null;saving=false;lastSavedAt=null;actionRequest=null;actionSending=null;recoveryWarning=null;impact=null;error=failure;emit();
  }
  const context = () => ({userId:user?.id,generation});
  function assertContext(token) {
    if(token.generation!==generation||token.userId!==user?.id){const failure=new Error('Your account changed. Reopen the tournament to continue.');failure.status=409;failure.code='session_changed';throw failure;}
  }
  function clearSession() {generation++;user=null;profile=null;eligibility=null;majorAccess=null;active=null;stats=null;runs=[];pending=null;sending=null;saving=false;lastSavedAt=null;error=null;impact=null;identityRequest=null;actionRequest=null;actionSending=null;recoveryWarning=null;recoveryClaim=null;rememberedRecovery=null;}
  function savedRecovery() {try{const value=JSON.parse(localStorage.getItem(key(user?.id)));return value?.userId===user?.id?value:null;}catch{return null;}}
  function recovery() {return saveGeneration===SAVE_GENERATION?(pending||savedRecovery()):null;}
  function restoreArchivedRecovery() {
    if(savedRecovery())return;
    const prefix=`${key(user.id)}.archived.`,candidates=new Set(runs.map(run=>prefix+run.id));
    // A terminal checkpoint may have committed before its response was lost,
    // so its run is no longer present in the active-run list.
    try{for(let index=0;index<localStorage.length;index++){const item=localStorage.key(index);if(item?.startsWith(prefix))candidates.add(item);}}catch{}
    for(const oldKey of candidates){
      try{const value=JSON.parse(localStorage.getItem(oldKey));
        if(value?.userId===user.id&&typeof value.runId==='string'&&oldKey===prefix+value.runId){localStorage.setItem(key(user.id),JSON.stringify(value));localStorage.removeItem(oldKey);return;}
      }catch{}
    }
  }
  function requirePlayable(difficulty) {
    if(catalog.isPlayableDifficulty(difficulty))return;
    const failure=new Error('This saved difficulty is archived. Your record is preserved; choose an available difficulty to play.');failure.status=409;failure.code='retired_difficulty';throw failure;
  }
  function emit() { for (const listener of listeners) listener(); }
  const points = snapshot => (snapshot?.stats?.pointsWon||0)+(snapshot?.stats?.pointsLost||0);
  function normalizeRecovery(item) {
    if(item===pending)return item;
    if(item?.version===3&&Array.isArray(item.checkpoints)&&item.checkpoints.length){
      // Claim this recovery with a fresh tab-owned token. The old tab must not
      // append to, or erase, a queue another tab is now recovering.
      const next={...clone(item),queueId:id()};
      recoveryClaim={queueId:next.queueId,previous:JSON.stringify(item)};
      return next;
    }
    // Keep the exact legacy body/request ID: it may already have committed.
    if(item?.body?.snapshot){const {fixtureId,sequence,snapshot,expectedRevision,writerEpoch}=item.body;
      const next={version:3,queueId:id(),userId:item.userId,runId:item.runId,expectedRevision,writerEpoch,
        checkpoints:[{fixtureId,sequence,snapshot}],inFlight:{body:item.body,count:1}};
      recoveryClaim={queueId:next.queueId,previous:JSON.stringify(item)};return next;
    }
    throw new Error('This browser’s recovery data could not be read. Keep this tab open and retry saving.');
  }
  function sameRecovery(stored,item) {
    return !!stored?.queueId&&stored.queueId===item?.queueId;
  }
  function writerConflict() {
    const failure=new Error('This tournament was opened in another tab. Reload to continue from its latest save.');
    failure.status=409;failure.code='local_writer_conflict';error=failure;
    // Keep this tab's branch of progress for recovery without replacing the
    // newer writer's queue. It must never be replayed over newer cloud progress.
    if(pending)try{localStorage.setItem(`${key(user.id)}.conflict.${pending.runId}.${pending.queueId}`,JSON.stringify(pending));}catch{recoveryWarning=storageWarning;}
  }
  function claimWriter() {
    try{localStorage.setItem(writerKey(),JSON.stringify({tabId,writerEpoch:active.writerEpoch}));}catch{}
  }
  function checkWriter() {
    try{const owner=JSON.parse(localStorage.getItem(writerKey()));if(owner&&owner.tabId!==tabId){writerConflict();return false;}}catch{}
    return true;
  }
  function remember() {
    if (!user) return;
    recoveryWarning=null;
    try {
      if (pending) {
        const raw=localStorage.getItem(key(user.id)),stored=raw?JSON.parse(raw):null;
        if(stored&&!sameRecovery(stored,pending)&&!(recoveryClaim?.queueId===pending.queueId&&raw===recoveryClaim.previous)){
          writerConflict();return false;
        }
        const value=JSON.stringify(pending);localStorage.setItem(key(user.id),value);rememberedRecovery=value;recoveryClaim=null;
      }
      return true;
    }
    catch {if(pending)recoveryWarning=storageWarning;}
    return false;
  }
  function forget(item) {
    // A response from this tab must never erase another tab’s newer recovery.
    try{const raw=localStorage.getItem(key(item.userId));if(raw===rememberedRecovery&&sameRecovery(raw?JSON.parse(raw):null,item))localStorage.removeItem(key(item.userId));}catch{}
  }
  function blocksPlay() {
    return !!recoveryWarning||!!(error?.status>=400&&error.status<500&&error.status!==429);
  }
  window.addEventListener?.('storage',event=>{
    if(!user||!active||![key(user.id),writerKey()].includes(event.key))return;
    if(!checkWriter()||(pending&&!sameRecovery(savedRecovery(),pending))){writerConflict();emit();}
  });
  window.addEventListener?.('beforeunload',event=>{
    if(recoveryWarning||error?.code==='local_writer_conflict'||sending||actionRequest||actionSending){event.preventDefault();event.returnValue='';}
  });
  async function request(path, options = {}) {
    const token=context();
    const runMutation=options.method==='POST'&&/^\/api\/tour\/runs(?:\/[^/]+\/(?:resume|checkpoints|advance|withdraw))?$/.test(path);
    if(runMutation)requireSaveGeneration();
    const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options,
      headers:{'Content-Type':'application/json', ...options.headers,...(runMutation?{'X-Tour-Save-Generation':String(SAVE_GENERATION)}:{})}});
    let data; try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const failure = new Error(data.error?.message || data.message || (typeof data.error === 'string' ? data.error : '') || (response.status === 401 ? 'Sign in again to save your progress.' : 'Your progress could not be saved. Please retry.'));
      failure.status = response.status; failure.code = data.error?.code || data.code;
      if(failure.code==='tour_reset_required'&&token.generation===generation&&token.userId===user?.id)invalidateSaves(failure,true);
      const reason={email_verification_required:'verification_required',username_taken:'username_unavailable',reserved_username:'username_unavailable',invalid_player:'invalid_character',profile_revision_conflict:'stale_profile_revision',active_run_exists:'existing_active_run',tour_not_enabled:'entry_disabled',authentication_required:'authentication_expired',unauthorized:'authentication_expired'}[failure.code]||failure.code||'service_unavailable';
      if(path==='/api/tour/runs'&&options.method==='POST')window.TennisSummary?.event('entry_failed',reason);
      throw failure;
    }
    return data;
  }
  const post = (path, body) => request(path, {method:'POST',body:JSON.stringify(body)});
  function restoreAction() {
    removeLegacyRecovery();
    if(actionRequest||!user)return;
    try{const item=JSON.parse(localStorage.getItem(actionKey(user.id)));
      if(item?.userId===user.id&&typeof item.body?.requestId==='string'&&/^\/api\/tour\/runs(?:\/[^/]+\/(?:resume|advance|withdraw))?$/.test(item.path))actionRequest=item;
    }catch{}
  }
  async function sendAction(path,body) {
    requireSaveGeneration();
    restoreAction();
    if(actionRequest&&(actionRequest.path!==path||(path==='/api/tour/runs'&&actionRequest.body.eventId!==body.eventId)))throw new Error('Retry the interrupted tournament action before starting another action. Reopen the tournament hub to recover it.');
    if(actionSending)return actionSending;
    const token=context(),item=actionRequest||{userId:user.id,path,body:clone(body)};
    actionRequest=item;
    try{localStorage.setItem(actionKey(user.id),JSON.stringify(item));}catch{recoveryWarning=storageWarning;}
    const clear=()=>{actionRequest=null;recoveryWarning=null;try{localStorage.removeItem(actionKey(item.userId));}catch{}};
    actionSending=(async()=>{
      try{const result=await post(item.path,item.body);assertContext(token);clear();return result;}
      catch(failure){if(token.generation===generation&&token.userId===user?.id){if(failure.status>=400&&failure.status<500&&failure.status!==401&&failure.status!==429)clear();if(recoveryWarning)failure.message+=` ${recoveryWarning}`;}throw failure;}
      finally{if(token.generation===generation&&token.userId===user?.id)actionSending=null;}
    })();
    return actionSending;
  }
  function signedIn() {
    if (!user) { const failure = new Error('Sign in to enter a tournament.'); failure.status = 401; throw failure; }
  }
  function authURL(eventId, page = 'sign-in') {
    return `/auth/${page}?event=${encodeURIComponent(catalog.getEvent(eventId)?.id || catalog.events[0].id)}`;
  }
  async function refresh() {
    removeLegacyRecovery();
    const token = generation;
    const events = await request('/api/tour/events');
    if(token!==generation)return snapshot();
    if(events.accountAvailable === false){enabled=false;saveGeneration=null;clearSession();emit();return snapshot();}
    if(events.saveGeneration!==SAVE_GENERATION){const failure=resetRequired();invalidateSaves(failure,Number.isInteger(events.saveGeneration)&&events.saveGeneration>SAVE_GENERATION);throw failure;}
    saveGeneration=events.saveGeneration;enabled = events.enabled !== false;
    if(error?.code==='tour_reset_required')error=null;
    try {
      const me = await request('/api/tour/me');
      if (token !== generation) return;
      if (user && user.id !== me.user.id) clearSession();
      user = me.user; profile = me.profile; eligibility = me.eligibility; majorAccess = me.majorAccess || null;
      const session=context();
      restoreAction();
      if(actionRequest){const recovered=await sendAction(actionRequest.path,actionRequest.body);assertContext(session);active=recovered.run;if(recovered.majorAccess)majorAccess=recovered.majorAccess;impact=recovered.impact||recovered.rankingImpact||active.rankingImpact||null;}
      const result = await request('/api/tour/me/stats');
      assertContext(session);
      stats = result.stats; runs = result.runs || []; if(result.majorAccess)majorAccess=result.majorAccess;
      restoreArchivedRecovery();
    } catch (failure) {
      if (failure.status !== 401) throw failure;
      clearSession();
    }
    emit();
    return snapshot();
  }
  function snapshot() {
    const latest=pending?.checkpoints?.at(-1)?.snapshot;
    return {user,profile,eligibility,majorAccess,active,stats,runs,enabled,impact,saving,pending:!!pending,
      unsavedPoints:latest?Math.max(0,points(latest)-points(active?.checkpoint?.snapshot)):0,lastSavedAt,locallySaved:!recoveryWarning&&!blocksPlay(),
      recoveryWarning,recoveryRunId:recovery()?.runId||null,error:error ? {message:[error.message,recoveryWarning].filter(Boolean).join(' '),status:error.status,code:error.code} : null};
  }
  async function saveProfile(preferences,expectedProfileRevision=profile?.profileRevision||0) {
    const wasComplete=!!profile?.completed;
    signedIn();
    const token=context();
    const result = await request('/api/tour/me/character',{method:'PUT',body:JSON.stringify({character:{ratings:preferences.customPlayer?.ratings,appearance:preferences.appearance},expectedProfileRevision})});
    assertContext(token);
    if(!wasComplete)window.TennisSummary?.event('character_saved');
    profile = result.profile; if(result.majorAccess)majorAccess=result.majorAccess; if(result.eligibility)eligibility=result.eligibility; emit(); return profile;
  }
  async function claimUsername(username) {
    signedIn();const token=context();
    if(!identityRequest||identityRequest.username!==username)identityRequest={requestId:id(),username,expectedProfileRevision:profile?.profileRevision||0};
    let result;try{result=await request('/api/tour/me/username',{method:'PATCH',body:JSON.stringify(identityRequest)});}catch(failure){if(failure.status&&failure.status<500)identityRequest=null;throw failure;}
    assertContext(token);window.TennisSummary?.event('username_claimed');identityRequest=null;user=result.user;profile=result.profile;eligibility=result.eligibility;if(result.majorAccess)majorAccess=result.majorAccess;emit();return result;
  }
  async function ranking(){signedIn();const token=context(),result=await request('/api/tour/me/ranking');assertContext(token);return result;}
  async function create(eventId, settings) {
    signedIn();
    requireSaveGeneration();
    requirePlayable(settings?.difficulty);
    if (!enabled) throw new Error('Tournament entries are not available yet.');
    if (pending || recovery()) throw new Error('Resume and save your interrupted tournament before entering another event.');
    const token=context();
    const result = await sendAction('/api/tour/runs',{requestId:id(),eventId,difficulty:settings.difficulty,expectedProfileRevision:settings.expectedProfileRevision??profile?.profileRevision??0});
    assertContext(token);
    active = result.run; lastSavedAt=null;if(result.majorAccess)majorAccess=result.majorAccess; impact=null;error = null; generation++;claimWriter();emit();
    window.TennisAnalytics?.tourEvent('tour_run_started',active);
    window.TennisSummary?.event('entry_committed',eventId);
    if(stats?.events?.some(event=>Object.values(event.bestByDifficulty||{}).some(Boolean)))window.TennisSummary?.event(stats.events.some(event=>event.eventId===eventId&&Object.values(event.bestByDifficulty||{}).some(Boolean))?'same_city_entry':'another_city_entry',eventId);
    return active;
  }
  async function resume(runId) {
    window.TennisSummary?.event('save_opened');
    signedIn();
    requireSaveGeneration();
    const token=context();
    if(sending)await sending;
    assertContext(token);
    const recovered=recovery();
    if(recovered&&recovered.runId!==runId)throw new Error('Resume and save your interrupted tournament before opening another event.');
    const result = await request(`/api/tour/runs/${encodeURIComponent(runId)}`);
    assertContext(token);
    active = result.run; lastSavedAt=active.checkpoint?active.updatedAt:null;if(result.majorAccess)majorAccess=result.majorAccess; impact=result.run.rankingImpact||null;generation++; error = null;claimWriter();
    const session=context();
    // Retry the original request before claiming a new writer generation. A lost
    // response may already have committed; the server returns its original receipt.
    if (recovered) {
      pending = normalizeRecovery(recovered); emit();
      try{await flush();}catch(failure){
        if(failure.status!==409||['tour_reset_required','local_writer_conflict'].includes(failure.code))throw failure;
        assertContext(session);
        // Never overwrite newer cloud progress. Retain the conflicting local
        // recovery separately, then explicitly claim the server's latest save.
        try{localStorage.setItem(`${key(user.id)}.conflict.${runId}`,JSON.stringify(recovered));}catch{recoveryWarning=storageWarning;throw failure;}
        forget(pending);pending=null;error=null;recoveryWarning=null;
      }
      const latest=await request(`/api/tour/runs/${encodeURIComponent(runId)}`);
      assertContext(session);active=latest.run;impact=active.rankingImpact||impact;
    }
    if(active.status !== 'active'){emit();return active;}
    const claimed = await sendAction(`/api/tour/runs/${encodeURIComponent(runId)}/resume`,{
      requestId:id(),expectedRevision:active.revision,writerEpoch:active.writerEpoch});
    assertContext(session);
    active = claimed.run; pending = null; recoveryWarning=null;claimWriter();emit();
    window.TennisAnalytics?.tourEvent('tour_run_resumed',active);
    return active;
  }
  function checkpoint(snapshot) {
    if(saveGeneration!==SAVE_GENERATION)return false;
    if (!active || !user || blocksPlay() || actionRequest || actionSending) return false;
    if(!checkWriter()){emit();return false;}
    const fixture = window.TennisTournament.currentMatch(active.draw);
    if (!fixture || fixture.completed || active.status !== 'active') return false;
    const previous=pending?.checkpoints?.at(-1)||(active.checkpoint?.fixtureId===fixture.id?active.checkpoint:null);
    if(previous&&points(snapshot)<=points(previous.snapshot))return false;
    if(!pending)pending={version:3,queueId:id(),userId:user.id,runId:active.id,expectedRevision:active.revision,
      writerEpoch:active.writerEpoch,checkpoints:[],inFlight:null};
    pending.checkpoints.push({fixtureId:fixture.id,sequence:previous?previous.sequence+1:0,snapshot:clone(snapshot)});
    remember(); emit();
    // Ordinary points never wait for the network. Match completion is an
    // account-save boundary; final results stay gated until the batch commits.
    if(snapshot.matchWon)flush().catch(() => {});
    else if(!sending&&pending.checkpoints.length>=AUTO_SAVE_POINTS&&Date.now()-autoSaveFailedAt>=AUTO_SAVE_RETRY_MS)
      flush().catch(()=>{autoSaveFailedAt=Date.now();});
    return true;
  }
  function batchFor(item) {
    if(item.inFlight)return item.inFlight;
    const checkpoints=[];
    let bytes=256;
    for(const point of item.checkpoints){
      const size=new TextEncoder().encode(JSON.stringify(point)).length+1;
      if(checkpoints.length&&(checkpoints.length>=MAX_BATCH_POINTS||bytes+size>MAX_BATCH_BYTES))break;
      checkpoints.push(point);bytes+=size;
    }
    return item.inFlight={count:checkpoints.length,body:{requestId:id(),expectedRevision:item.expectedRevision,writerEpoch:item.writerEpoch,checkpoints:clone(checkpoints)}};
  }
  async function sendCheckpoint(item,body) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20_000);
    try{return await request(`/api/tour/runs/${encodeURIComponent(item.runId)}/checkpoints`,{method:'POST',body:JSON.stringify(body),signal:controller.signal});}
    catch(failure){if(failure.name==='AbortError')throw new Error('Saving is taking too long. Your progress is kept on this browser. Retry saving.');throw failure;}
    finally{clearTimeout(timeout);}
  }
  async function flush() {
    if (sending) return sending;
    if (!pending) return active;
    signedIn();
    const item = pending, token = generation;
    const wasRetry=!!error;if(wasRetry)window.TennisSummary?.event('save_retry');
    if (item.userId !== user.id || item.runId !== active?.id) throw new Error('This save belongs to another session.');
    if(!remember()&&error?.code==='local_writer_conflict')throw error;
    saving = true; error = null; emit();
    sending = (async () => {
      try {
        while(pending===item&&item.checkpoints.length){
          const batch=batchFor(item);remember();
          if(error?.code==='local_writer_conflict')throw error;
          const result = await sendCheckpoint(item,batch.body);
          if (token !== generation || user?.id !== item.userId) return null;
          const previousMatches = active.matches?.length || 0;
          active = result.run;lastSavedAt=active.updatedAt;if(result.majorAccess)majorAccess=result.majorAccess;impact=result.impact||result.rankingImpact||active.rankingImpact||null;
          item.checkpoints.splice(0,batch.count);item.inFlight=null;item.expectedRevision=active.revision;item.writerEpoch=active.writerEpoch;
          if(item.checkpoints.length)remember();else{forget(item);pending=null;recoveryWarning=null;}
          if ((active.matches?.length || 0) > previousMatches) {window.TennisAnalytics?.tourEvent('tour_round_completed',active);window.TennisSummary?.event('round_completed');}
          if (active.status !== 'active') {window.TennisAnalytics?.tourEvent('tour_run_finished',active);window.TennisSummary?.event('run_finalized');}
        }
        if(wasRetry)window.TennisSummary?.event('save_recovered');
        return active;
      } catch (failure) {
        if (token === generation) {error = failure; window.TennisAnalytics?.tourEvent('tour_save_failed',active);window.TennisSummary?.event('save_failed','service_unavailable');}
        throw failure;
      } finally { if (token === generation) {saving = false; sending = null; emit();} }
    })();
    return sending;
  }
  async function mutate(action) {
    signedIn();requireSaveGeneration();const token=context();await flush();assertContext(token);
    if (!active) throw new Error('Choose a saved tournament first.');
    const analyticsFixture=window.TennisTournament.currentMatch(active.draw),analyticsKey=analyticsFixture?active.id+':'+analyticsFixture.id:null;
    const result = await sendAction(`/api/tour/runs/${encodeURIComponent(active.id)}/${action}`,{
      requestId:id(),expectedRevision:active.revision,writerEpoch:active.writerEpoch});
    assertContext(token);
    active = result.run; if(result.majorAccess)majorAccess=result.majorAccess; impact=result.impact||result.rankingImpact||active.rankingImpact||null;error = null; emit();
    if(action==='withdraw'){if(analyticsKey)window.TennisSummary?.outcome('withdrawn',{},analyticsKey);window.TennisSummary?.event('run_finalized');}
    return active;
  }
  async function withdraw(runId) {
    signedIn();
    requireSaveGeneration();
    if(runId&&runId!==active?.id){
      const token=context();await flush();assertContext(token);
      if(recovery())throw new Error('Resume and save your interrupted tournament before withdrawing from another event.');
      const result=await request(`/api/tour/runs/${encodeURIComponent(runId)}`);
      assertContext(token);active=result.run;generation++;error=null;
    }
    return mutate('withdraw');
  }
  function detach() {
    // Pending recovery remains scoped to the signed-in account on this browser.
    if (pending || sending) return false;
    active = null; lastSavedAt=null;error = null; emit(); return true;
  }
  function park() {
    // Leave a match while the account service is unavailable. Unsaved points stay
    // in this browser's recovery copy; resuming the run from the hub retries them.
    if (sending || !user) return false;
    if (pending) {
      if (!remember() || savedRecovery()?.queueId !== pending.queueId) return false;
      pending = null;
    }
    active = null; lastSavedAt = null; error = null; emit(); return true;
  }
  async function signOut() {
    const token=context();await flush();assertContext(token);
    restoreAction();if(actionRequest)await sendAction(actionRequest.path,actionRequest.body);assertContext(token);
    await post('/api/auth/sign-out',{});
    assertContext(token);clearSession();emit();
  }
  window.TennisTour = Object.freeze({refresh,snapshot,create,resume,checkpoint,flush,saveProfile,claimUsername,
    usernameAvailability:username=>request(`/api/tour/usernames/availability?username=${encodeURIComponent(username)}`),
    ranking,authURL,detach,park,signOut,
    advance:()=>mutate('advance'),withdraw,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    hasPending:()=>!!pending || !!sending,blocksPlay});
})();
