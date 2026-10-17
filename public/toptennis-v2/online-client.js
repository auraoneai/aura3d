/* Browser transport and prediction. Confirmed match outcomes always come from the server. */
(() => {
'use strict';
const $=id=>document.getElementById(id), panel=$('online-panel'), friendButtonLabel=$('play-friend').textContent,copyButtonLabel=$('online-copy').textContent;
const homeNote=$('online-home-note').textContent;
function invitationSetup(active){
  $('online-public-actions').hidden=active;
  $('online-invite-entry').hidden=active;
  $('play-friend').textContent=active?'Join invited match':friendButtonLabel;
}
const store={get(k,tab=false){try{return (tab?sessionStorage:localStorage).getItem(k);}catch{return null;}},set(k,v,tab=false){try{(tab?sessionStorage:localStorage).setItem(k,v);}catch{}}};
const client={active:false,room:null,rooms:[],confirmed:null,predictor:null,pending:[],seq:0,latency:0,socket:null,status:'idle',lastSend:0,lastSnapshot:0,selected:'neutral',rosterId:'classic',build:null,appearance:null,intent:null,retry:0,lastEvent:-1,sessionReady:false};
let confirmedView=null,confirmedStatus=null,acknowledgedInput={};
const SIDES=['player','ai'],MAX_LEAD=.25;
let renderOffset={player:{x:0,y:0},ai:{x:0,y:0}};
const receivedServeEvents=new Set();
let nickname=store.get('baseline.nickname')||'Guest '+Math.floor(1000+Math.random()*9000);
$('online-name').value=nickname;
const onlineConfig=window.TennisOnlineConfig||{provider:'node',url:''};
const socketUrl=onlineConfig.url||((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
const sessionKey='baseline.session:'+onlineConfig.provider+':'+socketUrl;
const activeKey=sessionKey+':active';
let resumeExpected=store.get(activeKey,true)==='true';
let sessionToken=store.get(sessionKey,true),reconnectTimer=null,connectionTimer=null,actionTimer=null,connectDeadline=0,onlineAvailable=true,lastBrowse=0;
let remainingUntil=0,optionMenu=false,desiredInvite=new URL(location.href).searchParams.get('invite');
const message=(text)=>{$('online-message').textContent=text;};
function send(type,data={}){if(client.socket?.readyState!==WebSocket.OPEN)return false;if(client.socket.bufferedAmount>65536){client.socket.close();return false;}client.socket.send(JSON.stringify({v:2,type,...data}));return true;}
function buildPayload(){return {...(client.build?{build:{...client.build}}:{}),...(client.appearance?{appearance:{...client.appearance}}:{})};}
const courtName=venue=>({hard:'New York · Hard',grass:'London · Grass',clay:'Paris · Clay'}[venue]||'Tennis court');
function showPanel(title,text){panel.classList.remove('hidden','match-results-panel');$('online-match-stats').hidden=true;$('online-title').textContent=title;if(text!==undefined)message(text);window.TennisLocal?.hideMenus();}
function renderMatchStats(){
  const r=client.room,finished=!!r&&['complete','interrupted'].includes(r.status),container=$('online-match-stats');
  panel.classList.toggle('match-results-panel',finished);
  // The room result arrives before its final snapshot. Wait for that snapshot
  // so the last point, both players' statistics and the final score agree.
  const available=finished&&confirmedView&&confirmedStatus===r.status;
  container.hidden=!available;
  if(!available){container.replaceChildren();return;}
  const self=r.side==='player'?0:1;
  window.TennisMatchResults?.render(container,confirmedView,{player:r.players[self]?.name||'PLAYER',ai:r.players[1-self]?.name||'OPPONENT'});
}
function hideActions(){for(const id of ['online-ready','online-copy','online-link','online-slow-label','online-rematch','online-another','online-surrender','online-browser','online-browse','online-retry'])$(id).hidden=true;}
function requestRooms(){if(client.sessionReady&&client.status==='browsing'){lastBrowse=performance.now();send('room_list');}}
function showBrowser(note){
  client.intent='browse';client.status='browsing';client.rooms=[];hideActions();
  showPanel('Join a game',note||'Choose an open court, or create a game for another player to join.');
  $('online-browser').hidden=false;$('online-empty').hidden=false;$('online-empty').textContent='Loading games…';$('online-room-list').replaceChildren();
  $('online-player-list').textContent='';$('online-court').textContent='';$('online-score').hidden=true;$('online-back').textContent='Back';requestRooms();
}
function renderRooms(rooms){
  if(client.status!=='browsing')return;
  client.rooms=rooms;const list=$('online-room-list'),focused=document.activeElement?.dataset?.roomId;
  list.replaceChildren();$('online-empty').hidden=rooms.length>0;$('online-empty').textContent='No open games right now. Create one for another player to join.';
  for(const room of rooms){
    const row=document.createElement('li'),info=document.createElement('div'),name=document.createElement('strong'),details=document.createElement('small'),join=document.createElement('button');
    row.className='online-room';info.className='online-room-info';name.textContent=room.host;
    details.textContent=courtName(room.venue)+' · 1 / 2 players';join.type='button';join.className='secondary-btn';join.textContent='Join';join.dataset.roomId=room.id;join.setAttribute('aria-label','Join '+room.host+' on '+courtName(room.venue));
    join.onclick=()=>{client.intent={id:room.id};client.status='joining';hideActions();showPanel('Joining game','Connecting to '+room.host+'…');send('room_join',{id:room.id,...buildPayload()});};
    info.append(name,details);row.append(info,join);list.append(row);if(focused===room.id)join.focus({preventScroll:true});
  }
}
function dispatchIntent(){
  const intent=client.intent;
  if(intent==='browse')showBrowser();
  else if(intent==='private'||intent==='open')send('room_create',{venue:window.TennisLocal.venue(),...(intent==='open'?{visibility:'public'}:{}),...buildPayload()});
  else if(intent)send('room_join',{...(typeof intent==='object'?intent:{invite:intent}),...buildPayload()});
}
function ready(){if(client.room?.status==='waiting')send('ready',{id:client.room.id,acceptSlow:$('online-slow').checked});}
function renderRoom(){
  const r=client.room;if(!r)return;
  $('online-score').hidden=!['complete','interrupted'].includes(r.status);
  hideActions();$('online-player-list').textContent=(r.side==='ai'?[...r.players].reverse():r.players).map(p=>p.name+(p.ready?' · ready':'')+(!p.connected?' · disconnected':'')).join('  /  ');
  $('online-court').textContent=courtName(r.venue);
  if(r.status==='waiting'){
    const privateRoom=r.kind==='private';
    showPanel(privateRoom?'Your private court':r.kind==='open'&&r.players.length===1?'Your open game':'Opponent found',r.slow&&!privateRoom?'Public games require both connections to be 180 ms or lower for responsive play. Waiting for the connection to improve…':r.players.length===1?(r.kind==='open'?'Your game is listed in Join a game. Waiting for another player…':'Share this link with your friend.'):r.slow?'This connection may delay shots. Both players must accept before playing.':'Both players must be ready to start.');
    if(r.invite){const link=location.origin+location.pathname+'?invite='+encodeURIComponent(r.invite);if($('online-link').value!==link)$('online-copy').textContent=copyButtonLabel;$('online-link').value=link;$('online-link').hidden=false;$('online-copy').hidden=false;}
    $('online-ready').hidden=r.players.length<2;$('online-ready').disabled=r.players.find((p,i)=>i===(r.side==='player'?0:1))?.ready||false;
    $('online-ready').textContent=$('online-ready').disabled?'Waiting for opponent…':'Ready to play';$('online-slow-label').hidden=!r.slow||!privateRoom;
  }else if(r.status==='countdown')showPanel('Get ready','Match starts in 3…');
  else if(r.status==='reconnecting')showPanel('Reconnecting opponent','The match is paused. An unfinished point will be replayed.');
  else if(r.status==='playing'){
    if(!optionMenu)panel.classList.add('hidden');else{showPanel('Match continues','Online play keeps running while this menu is open.');$('online-surrender').hidden=false;}
  }else{
    const win=r.result?.winner===r.side,reason=r.result?.reason;
    showPanel(r.status==='interrupted'?'Match interrupted':r.result?.winner?(win?'Victory':'Opponent wins'):'Match abandoned',reason==='service_restart'?'The server restarted. This match cannot be resumed.':reason==='completed'?'Exhibition complete.':reason==='surrender'?'Match ended by surrender.':reason==='serve_clock'?'Match ended after repeated serve-clock violations.':'Match ended after the reconnection window expired.');
    $('online-rematch').hidden=r.status!=='complete';$('online-rematch').disabled=r.rematch?.[r.side==='player'?0:1]||false;$('online-rematch').textContent=$('online-rematch').disabled?'Rematch requested…':'Rematch';$('online-another').hidden=false;
  }
  $('online-back').textContent=r.status==='playing'?'Back to match':'Menu';
  renderMatchStats();
}
function disconnect(){
  if(!client.active)return;
  if(client.sessionReady)connectDeadline=performance.now()+30000;
  clearTimeout(connectionTimer);clearTimeout(actionTimer);client.sessionReady=false;client.pending=[];
  showPanel(client.room?'Connection lost':'Connecting to multiplayer',client.room?'Trying to restore your match…':'Reconnecting to the multiplayer server…');hideActions();
  clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(4000,500*2**client.retry++)+Math.random()*200);
}
function connect(){
  if(!client.active)return;
  if(performance.now()>connectDeadline&&!client.room){showPanel('Connection unavailable','The multiplayer server could not be reached. Check your connection and try again.');hideActions();$('online-retry').hidden=false;return;}
  let ws;try{ws=new WebSocket(socketUrl);}catch{disconnect();return;}client.socket=ws;
  connectionTimer=setTimeout(()=>{if(ws===client.socket&&!client.sessionReady)ws.close();},10000);
  ws.onopen=()=>{if(ws!==client.socket)return;client.retry=0;send('hello',{token:sessionToken,name:nickname});};
  ws.onmessage=event=>{if(ws!==client.socket)return;let m;try{m=JSON.parse(event.data);}catch{return;}
    if(m.v!==2||m.type==='error'&&m.code==='version'){
      client.active=false;client.sessionReady=false;client.status='error';client.pending=[];
      clearTimeout(connectionTimer);clearTimeout(actionTimer);clearTimeout(reconnectTimer);
      hideActions();showPanel('Multiplayer update required','The game and multiplayer server use different versions. Please try again later.');
      $('online-back').textContent='Back';ws.close();return;
    }
    if(m.type==='ping'){send('pong',{nonce:m.nonce});return;}
    if(m.type==='session'){
      clearTimeout(connectionTimer);sessionToken=m.token;store.set(sessionKey,m.token,true);client.sessionReady=true;onlineAvailable=m.online;
      if(m.interrupted&&(client.room||resumeExpected)){window.TennisSummary?.outcome('technical');client.room=null;client.predictor=null;client.confirmed=null;client.status='interrupted';client.intent=null;showPanel('Match interrupted','The server restarted. This match cannot be resumed. Return to the menu to start another exhibition.');hideActions();return;}
      if(m.resumed&&m.roomId){client.intent=null;return;}
      if(client.room&&!m.roomId){client.room=null;client.predictor=null;client.confirmed=null;resumeExpected=false;store.set(activeKey,'false',true);showBrowser('Your previous game has closed. Choose another court or create a game.');return;}
      if(!onlineAvailable){showPanel('Online unavailable','Online play is temporarily unavailable. Single matches are still available.');return;}
      if(client.intent)dispatchIntent();else if(!client.room){resumeExpected=false;store.set(activeKey,'false',true);showBrowser();}return;
    }
    if(m.type==='room_list'){
      if(m.online===false){client.status='error';hideActions();showPanel('Online unavailable','Online play is temporarily unavailable. Try again later.');return;}
      renderRooms(m.rooms||[]);return;
    }
    // Older matches can requeue after a ready timeout; return to game discovery.
    if(m.type==='queued'){client.room=null;client.predictor=null;client.intent='browse';send('queue_cancel');return;}
    if(m.type==='idle'){
      client.room=null;client.confirmed=null;client.predictor=null;
      resumeExpected=false;store.set(activeKey,'false',true);if(client.intent==='browse')showBrowser(m.message);else deactivate(m.message);return;
    }
    if(m.type==='error'){
      if(m.code==='measuring'){
        clearTimeout(actionTimer);const roomId=client.room?.id,intent=client.intent;
        if(client.room)message('Checking both connections. Your ready request will retry automatically…');
        else message('Checking your connection before joining public play…');
        actionTimer=setTimeout(()=>{if(!client.active||!client.sessionReady)return;if(roomId&&client.room?.id===roomId)ready();else if(!client.room&&client.intent===intent&&(intent==='open'||typeof intent==='object'&&intent?.id))dispatchIntent();},1000);return;
      }
      if(client.room){renderRoom();if(m.code==='slow'&&client.room.kind==='private')$('online-slow-label').hidden=false;message(m.message);return;}
      if(typeof client.intent==='object'&&client.intent?.id&&['expired','closed','full','offline','host_latency'].includes(m.code)){showBrowser(m.message);return;}
      client.status='error';hideActions();showPanel(m.code==='capacity'?'All courts are busy':m.code==='latency'?'Connection too slow':'Unable to join',m.message);
      $('online-browse').hidden=!onlineAvailable||m.code==='latency';$('online-retry').hidden=m.code!=='latency';$('online-back').textContent='Back';
      if(m.code==='version'){client.active=false;ws.close();}return;
    }
    if(m.type==='room'){
      const old=client.room;client.room=m.room;client.intent=null;resumeExpected=true;store.set(activeKey,'true',true);client.status=m.room.status;remainingUntil=performance.now()+m.room.remaining*1000;
      if(m.room.players.length===2&&(old?.players.length||0)<2)window.TennisSummary?.event('queue_matched');
      if(m.room.status==='playing'&&old?.status!=='playing')window.TennisSummary?.start('online',{localKey:m.room.matchId||m.room.id,court:m.room.venue,difficulty:'club'});
      if(m.room.status==='complete'&&old?.status!=='complete')window.TennisSummary?.outcome(m.room.result?.reason==='completed'?'completed':m.room.result?.reason==='surrender'?'surrender':'technical',{won:m.room.result?.winner===m.room.side});
      if(m.room.status==='interrupted')window.TennisSummary?.outcome('technical');
      const self=m.room.players[m.room.side==='player'?0:1];
      client.rosterId=self?.rosterId||'classic';client.build=window.TennisRoster?.validateCustom(self?.ratings)||null;
      client.appearance=window.TennisAppearance?.normalize(self?.appearance)||null;
      if(old?.id!==m.room.id)$('online-slow').checked=false;
      if(old?.id!==m.room.id||m.room.status==='countdown'&&old?.status!=='countdown'){client.pending=[];client.seq=0;client.lastEvent=-1;client.selected='neutral';optionMenu=false;acknowledgedInput={};confirmedView=null;confirmedStatus=null;client.predictor=null;client.confirmed=null;receivedServeEvents.clear();renderOffset={player:{x:0,y:0},ai:{x:0,y:0}};}
      renderRoom();return;
    }
    if(m.type==='snapshot'){
      if(!client.room||m.id!==client.room.id)return;
      confirmedView=window.TennisEngine.view(m.state,client.room.side);
      confirmedStatus=m.status;
      window.TennisSummary?.tick(performance.now(),m.status==='playing',{score:confirmedView.score.playerGames+'-'+confirmedView.score.aiGames,points:confirmedView.stats?.pointsWon+confirmedView.stats?.pointsLost});
      client.latency=m.latency||0;client.confirmed=m.state;if(client.room){const score=confirmedView.score;$('online-score').textContent=score.playerGames+' — '+score.aiGames;}client.lastSnapshot=performance.now();client.serveRemaining=m.serveRemaining;client.status=m.status;
      if(['complete','interrupted'].includes(client.room.status))renderMatchStats();
      // Restore clears the engine's held controls. Keep the last acknowledged
      // movement, but never replay an acknowledged swing edge.
      for(const item of client.pending)if(item.seq<=m.ack)acknowledgedInput={...item.input,swing:false,forcePower:false,eventTime:undefined};
      client.seq=Math.max(client.seq,m.ack);client.pending=client.pending.filter(p=>p.seq>m.ack);
      const prior=client.predictor&&m.status==='playing'?client.predictor.state:null;
      const priorPos=prior&&SIDES.map(k=>({x:prior[k].x+renderOffset[k].x,y:prior[k].y+renderOffset[k].y}));
      // Keep the predicted timeline continuous: replay to the simulation time the
      // client was already showing, easing its lead toward one round trip (a
      // snapshot is one way old and new input lands one way later).
      const goal=Math.min(MAX_LEAD,(m.latency||0)/1000+1/60);let lead=prior?prior.time-m.state.time:goal;
      lead=lead>=0&&lead<=MAX_LEAD?lead+(goal-lead)*.1:goal;
      if(!client.predictor)client.predictor=window.TennisEngine.create({online:true,difficulty:'club',venue:m.state.venue,predictionSide:client.room.side,suppressRemoteServePrediction:true});
      client.predictor.restore(m.state);
      if(m.status==='playing'){
        client.predictor.applyInput(client.room.side,acknowledgedInput);
        // Replay unacknowledged inputs at the simulation time they were made.
        const end=m.state.time+lead;let simTime=m.state.time;
        const advance=to=>{while(simTime<to-1e-6){const dt=Math.min(1/60,to-simTime);client.predictor.step(dt);simTime+=dt;}};
        for(const item of client.pending){advance(Math.min(end,item.sim??simTime));client.predictor.applyInput(client.room.side,item.input);}
        advance(end);
      }
      // Blend small corrections out over a few frames instead of snapping; large ones are real jumps.
      for(const [i,k] of SIDES.entries()){
        const actor=client.predictor.state[k],dx=priorPos?priorPos[i].x-actor.x:0,dy=priorPos?priorPos[i].y-actor.y:0;
        renderOffset[k]=Math.hypot(dx,dy)<.25?{x:dx,y:dy}:{x:0,y:0};
      }
      if(m.status!=='playing'){client.pending=[];acknowledgedInput={};}
      client.tick(0);
      return;
    }
    if(m.type==='events'&&m.id===client.room?.id&&m.tick>client.lastEvent){client.lastEvent=m.tick;for(const e of m.events){if(e.type==='serve'){const id=`${e.id}:${e.stage}`;if(receivedServeEvents.has(id))continue;receivedServeEvents.add(id);}if(e.type==='selection'&&e.side===client.room.side)client.selected=e.shot;window.TennisLocal.sound(e,client.room.side);}return;}
    if(m.type==='opponent_left'){if(client.room){$('online-rematch').disabled=true;message('Your opponent has left. Browse games to find another player.');}return;}
  };
  ws.onerror=()=>{};ws.onclose=e=>{if(ws!==client.socket)return;if(e.code===4001){showPanel('Session opened elsewhere','This tab no longer controls the match.');client.status='interrupted';client.sessionReady=false;return;}disconnect();};
}
function begin(intent){
  if(intent)window.TennisSummary?.event('queue_started');
  nickname=$('online-name').value.trim().slice(0,20)||nickname;store.set('baseline.nickname',nickname);
  const ratings=window.TennisRoster?.ENABLED?window.TennisRoster.validateCustom(window.TennisMultiplayerBuild?.ratings()):null;
  if(window.TennisRoster?.ENABLED&&!ratings){$('online-home-note').textContent='Use 6–10 points per strength and no more than 40 points in total.';window.TennisMultiplayerBuild?.focus?.();return;}
  client.build=ratings;client.rosterId=ratings?'custom':'classic';
  client.appearance=window.TennisAppearance?.normalize(window.TennisAppearanceSelect?.selection())||null;
  clearTimeout(actionTimer);clearTimeout(reconnectTimer);clearTimeout(connectionTimer);const old=client.socket;client.socket=null;old?.close();client.sessionReady=false;
  client.active=true;client.intent=intent;client.room=null;client.confirmed=null;client.predictor=null;client.status='connecting';client.pending=[];client.seq=0;client.lastEvent=-1;client.retry=0;connectDeadline=performance.now()+30000;
  showPanel('Connecting to multiplayer','Connecting to the multiplayer server…');hideActions();$('online-score').hidden=true;$('online-player-list').textContent='';$('online-court').textContent='';$('online-back').textContent='Cancel';$('online-connection').classList.remove('hidden');connect();
}
function deactivate(note){
  if(client.status!=='complete'&&client.status!=='interrupted')window.TennisSummary?.event('queue_cancelled');
  clearTimeout(reconnectTimer);clearTimeout(connectionTimer);clearTimeout(actionTimer);client.active=false;client.sessionReady=false;resumeExpected=false;store.set(activeKey,'false',true);client.intent=null;client.room=null;client.confirmed=null;client.predictor=null;client.pending=[];client.status='idle';const ws=client.socket;client.socket=null;ws?.close();panel.classList.add('hidden');renderMatchStats();$('online-connection').classList.add('hidden');optionMenu=false;window.TennisLocal.menu();window.TennisMenu?.openOnline();if(note)$('online-home-note').textContent=note;
  if(desiredInvite){history.replaceState(null,'',location.pathname);desiredInvite=null;invitationSetup(false);if(!note)$('online-home-note').textContent=homeNote;}
}
function input(swing=false,options={}){
  if(!client.active||client.room?.status!=='playing'||!client.sessionReady)return;
  const i={...window.TennisLocal.input(),swing,shot:client.selected,forcePower:!!options.forcePower};
  if(swing)i.eventTime=Number.isFinite(options.eventTime)?options.eventTime:client.predictor?.state.time;
  delete i.active;
  const m={id:client.room.id,seq:++client.seq,t:performance.now(),input:i};
  if(send('input',m)){client.pending.push({...m,time:performance.now(),sim:client.predictor?.state.time});if(client.pending.length>90)client.pending.shift();client.predictor?.applyInput(client.room.side,i);client.lastSend=performance.now();}
}
client.swing=(options={})=>input(true,options);
client.select=shot=>{client.selected=shot;input();};
client.options=()=>{if(!client.room)return;optionMenu=!optionMenu;renderRoom();};
client.tick=dt=>{
  if(!client.active)return;
  const t=performance.now();
  if(client.status==='browsing'&&t-lastBrowse>=5000)requestRooms();
  if(client.room?.status==='playing'&&t-client.lastSend>=1000/30)input();
  if(client.predictor&&client.confirmed){
    if(client.room?.status==='playing'&&t-client.lastSnapshot<1000)client.predictor.step(dt);
    // view() already clones the state. Avoid two additional full-state clones
    // per simulation frame and reuse the authoritative view between packets.
    const s=window.TennisEngine.view(client.predictor.state,client.room.side),truth=confirmedView;
    const decay=Math.exp(-dt*12),flip=client.room.side==='ai'?-1:1;
    for(const k of SIDES){
      const o=renderOffset[k],actor=s[k===client.room.side?'player':'ai'];o.x*=decay;o.y*=decay;
      actor.x+=flip*o.x;actor.y+=flip*o.y;
    }
    // Prediction affects visuals and response, never the score, result, or announcements.
    for(const k of ['score','stats','matchWon','winner','mode','message','messageTimer','lastCall','outFeedback','tiebreak','server','firstServer','tiebreakFirstServer','serveNumber','lastServe'])s[k]=truth[k];
    for(const side of ['player','ai'])s[side].stats=truth[side].stats;
    if(s.serveAttempt){
      const confirmedAttempt=[truth.serveAttempt,truth.lastServe].find(attempt=>attempt?.id===s.serveAttempt.id);
      // Keep immediate windup, aim and launch feedback; only the server can
      // confirm a bounce, fault or ace and the statistics those outcomes earn.
      for(const key of ['actual','legal','result'])s.serveAttempt[key]=confirmedAttempt?.[key]??null;
    }
    s.mode=['complete','interrupted'].includes(client.room.status)?'gameover':'playing';s.paused=false;
    window.TennisLocal.present(s,client.room.players,client.room.side,client.selected);
  }
  if(client.room?.status==='countdown')message('Match starts in '+Math.max(1,Math.ceil((remainingUntil-t)/1000))+'…');
  if(client.room?.status==='reconnecting')message('Waiting for your opponent · '+Math.max(0,Math.ceil((remainingUntil-t)/1000))+' seconds remaining.');
  $('online-connection').textContent=client.room?.status==='playing'?(t-client.lastSnapshot>1000?'Connection delayed…':`ONLINE · ${client.latency} ms${['serve','serveToss'].includes(client.confirmed?.phase)?' · '+Math.ceil(client.serveRemaining||0)+'s serve':''}`):client.room?.status==='reconnecting'?'RECONNECTING':'ONLINE EXHIBITION';
};
$('play-friend').onclick=()=>begin(desiredInvite||'private');
$('create-game').onclick=()=>begin('open');$('browse-games').onclick=()=>begin('browse');
$('online-refresh').onclick=requestRooms;$('online-browse').onclick=()=>showBrowser();
$('online-create').onclick=()=>{client.intent='open';client.status='connecting';hideActions();showPanel('Creating game','Opening your court…');dispatchIntent();};
$('online-retry').onclick=()=>begin(client.intent||'browse');
$('join-invite').onclick=()=>{
  const value=$('online-invite-input').value.trim();let invite=value;
  if(value.includes('://')){try{invite=new URL(value).searchParams.get('invite')||'';}catch{invite='';}}
  if(!/^[a-f0-9]{48}$/.test(invite)){$('online-home-note').textContent='Paste a complete invitation link or its 48-character code.';return;}
  begin({invite});
};
$('online-ready').onclick=ready;
$('online-copy').onclick=async()=>{const link=$('online-link').value;try{await navigator.clipboard.writeText(link);if($('online-link').value===link)$('online-copy').textContent='Link copied';}catch{if($('online-link').value!==link)return;$('online-link').select();message('Copy the selected link and send it to your friend.');}};
$('online-rematch').onclick=()=>{window.TennisSummary?.event('rematch');send('rematch',{id:client.room.id});};
$('online-another').onclick=()=>{client.intent='browse';send('leave',{id:client.room.id});};
$('online-surrender').onclick=()=>{optionMenu=false;window.TennisSummary?.outcome('surrender');send('surrender',{id:client.room.id});};
$('online-back').onclick=()=>{if(client.room?.status==='playing'){optionMenu=false;renderRoom();return;}if(client.room)send('leave',{id:client.room.id});deactivate();};
window.TennisOnline=client;
if(resumeExpected)setTimeout(()=>begin(null),0);
else if(desiredInvite)setTimeout(()=>{
  window.TennisMenu?.openOnline();
  invitationSetup(true);
  $('online-home-note').textContent='Choose your name, strengths and appearance, then join your friend. Your friend has selected the court.';
},0);
})();
