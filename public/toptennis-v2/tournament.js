/* An isolated, serializable 32-player knockout draw. No match-engine rules change. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./player-roster.js'),require('./tour-catalog.js'));
  else root.TennisTournament=factory(root.TennisRoster,root.TennisTourCatalog);
})(typeof window==='undefined'?globalThis:window,function(Roster,Tour){
  'use strict';
  const freeze=value=>{
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      Object.values(value).forEach(freeze);Object.freeze(value);
    }
    return value;
  };
  const stages=freeze([
    {id:'r32',label:'Round of 32',shortLabel:'R32',matchCount:16},
    {id:'r16',label:'Round of 16',shortLabel:'R16',matchCount:8},
    {id:'qf',label:'Quarterfinal',shortLabel:'QF',matchCount:4},
    {id:'sf',label:'Semifinal',shortLabel:'SF',matchCount:2},
    {id:'final',label:'Final',shortLabel:'F',matchCount:1}
  ]);
  const profiles=new Map(Roster.profiles.map(profile=>[profile.id,profile]));
  const catalog=freeze([...Roster.profiles,...Roster.guestProfiles].map(profile=>({
    id:profile.id,name:profile.name,profileId:profile.id,
    strength:Object.values(profile.ratings).reduce((sum,value)=>sum+value,0)
  })));
  // Standard draw positions: seeds 1/2 cannot meet until the final, 1–4 until
  // the semifinals, and 1–8 until the quarterfinals. Unseeded slots are shuffled.
  const seedPositions=Object.freeze([0,31,16,15,8,23,24,7]);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function seedNumber(seed){
    if(typeof seed==='number'&&Number.isFinite(seed))return seed>>>0;
    if(typeof seed==='string'){
      let value=2166136261;
      for(let i=0;i<seed.length;i++)value=Math.imul(value^seed.charCodeAt(i),16777619);
      return value>>>0;
    }
    return (Date.now()^Math.floor(Math.random()*4294967296))>>>0;
  }
  function random(state){
    state.rngState=(Math.imul(state.rngState,1664525)+1013904223)>>>0;
    return state.rngState/4294967296;
  }
  function shuffle(items,state){
    for(let i=items.length-1;i>0;i--){
      const j=Math.floor(random(state)*(i+1));[items[i],items[j]]=[items[j],items[i]];
    }
    return items;
  }
  function create({playerId='alcatraz',customPlayer=null,venue='hard',difficulty='club',seed,eventId,runId,rulesVersion=Tour?.rulesVersion??1}={}){
    const event=eventId?Tour?.getEvent(eventId):null;
    if(eventId&&!event)throw new RangeError('Unknown tournament event.');
    if(event)venue=event.venue;
    // Normalize callers using the retired level name at the creation boundary.
    if(difficulty==='pro2')difficulty='pro';
    const ratings=Roster.ENABLED&&Roster.validateCustom(customPlayer?.ratings);
    const name=typeof customPlayer?.name==='string'?customPlayer.name.trim().replace(/\s+/g,' ').slice(0,20):'';
    const custom=ratings&&name?{id:'custom-player',name,profileId:'custom',ratings,strength:Object.values(ratings).reduce((sum,value)=>sum+value,0)}:null;
    // Replace one guest so the custom athlete joins a full 32-player draw.
    const entrants=custom?[...catalog.slice(0,-1),custom]:catalog;
    const drawSeed=seedNumber(seed);
    const state={version:1,seed:drawSeed,rngState:drawSeed,playerId:custom?custom.id:profiles.has(playerId)?playerId:'alcatraz',
      venue:['hard','grass','clay'].includes(venue)?venue:'hard',difficulty:['beginner','club','ace','pro','legend'].includes(difficulty)?difficulty:'club',
      round:0,wins:0,status:'active',awaitingNext:false,entrants:[],rounds:[]};
    if(event)Object.assign(state,{version:2,eventId:event.id,runId:runId||null,rulesVersion});
    const ranked=entrants.map((entry,index)=>({...entry,catalogIndex:index})).sort((a,b)=>b.strength-a.strength||a.catalogIndex-b.catalogIndex);
    const seeds=new Map(ranked.slice(0,8).map((entry,index)=>[entry.id,index+1]));
    state.entrants=entrants.map(entry=>({...entry,seed:seeds.get(entry.id)||null}));
    const slots=Array(32).fill(null),unseeded=shuffle(state.entrants.filter(entry=>!entry.seed).map(entry=>entry.id),state);
    for(const entry of state.entrants)if(entry.seed)slots[seedPositions[entry.seed-1]]=entry.id;
    for(let i=0;i<slots.length;i++)if(!slots[i])slots[i]=unseeded.pop();
    state.rounds=stages.map((stage,round)=>Array.from({length:stage.matchCount},(_,index)=>({
      id:`${stage.id}-${index+1}`,round,index,
      player1Id:round===0?slots[index*2]:null,player2Id:round===0?slots[index*2+1]:null,
      winnerId:null,score:null
    })));
    return freeze(state);
  }
  function entry(state,id){return state.entrants.find(entrant=>entrant.id===id)||null;}
  function currentMatch(state){
    const fixture=state.rounds[state.round]?.find(match=>match.player1Id===state.playerId||match.player2Id===state.playerId);
    if(!fixture)return null;
    const first=fixture.player1Id===state.playerId;
    return freeze({...fixture,player:entry(state,state.playerId),opponent:entry(state,first?fixture.player2Id:fixture.player1Id),
      completed:fixture.winnerId!==null,playerGames:fixture.score?.[first?'player1Games':'player2Games']??null,
      aiGames:fixture.score?.[first?'player2Games':'player1Games']??null});
  }
  function validScore(won,score){
    if(!score||!Number.isInteger(score.playerGames)||!Number.isInteger(score.aiGames))return false;
    const winner=won?score.playerGames:score.aiGames,loser=won?score.aiGames:score.playerGames;
    return (winner===3&&(loser===0||loser===1))||(winner===4&&(loser===2||loser===3));
  }
  function simulatedScore(state){return [[3,0],[3,1],[4,2],[4,3]][Math.floor(random(state)*4)];}
  function finishFixture(fixture,winnerId,winnerGames,loserGames){
    fixture.winnerId=winnerId;
    const first=fixture.player1Id===winnerId;
    fixture.score={player1Games:first?winnerGames:loserGames,player2Games:first?loserGames:winnerGames};
  }
  function recordResult(state,{won,score}={}){
    const human=currentMatch(state);
    if(state.status!=='active'||state.awaitingNext||!human||human.completed)return state;
    if(typeof won!=='boolean'||!validScore(won,score))throw new RangeError('A tournament result must contain a completed match: 3–0, 3–1, 4–2, or 4–3.');
    const updated=clone(state),matches=updated.rounds[updated.round];
    for(const fixture of matches){
      if(fixture.winnerId!==null)continue;
      if(fixture.id===human.id){
        finishFixture(fixture,won?updated.playerId:human.opponent.id,
          won?score.playerGames:score.aiGames,won?score.aiGames:score.playerGames);
      }else{
        const first=entry(updated,fixture.player1Id),second=entry(updated,fixture.player2Id);
        const baseChance=1/(1+Math.exp((second.strength-first.strength)/8));
        // Raise the stronger CPU's win probability by 20%; ties stay 50/50.
        const chance=first.strength===second.strength?baseChance:first.strength>second.strength
          ?Math.min(1,baseChance*1.2):1-Math.min(1,(1-baseChance)*1.2);
        const winner=random(updated)<chance?first:second;
        const [winnerGames,loserGames]=simulatedScore(updated);
        finishFixture(fixture,winner.id,winnerGames,loserGames);
      }
    }
    const upcoming=updated.rounds[updated.round+1];
    if(upcoming)for(let i=0;i<upcoming.length;i++){
      upcoming[i].player1Id=matches[i*2].winnerId;
      upcoming[i].player2Id=matches[i*2+1].winnerId;
    }
    if(won)updated.wins++;
    if(!won)updated.status='eliminated';
    else if(updated.round===stages.length-1)updated.status='champion';
    else updated.awaitingNext=true;
    return freeze(updated);
  }
  function next(state){
    if(state.status!=='active'||!state.awaitingNext||state.round>=stages.length-1)return state;
    return freeze({...state,round:state.round+1,awaitingNext:false});
  }
  function summary(state){
    if(!state)return null;
    const match=currentMatch(state);
    return {...(state.eventId?{eventId:state.eventId,runId:state.runId,rulesVersion:state.rulesVersion}:{}),status:state.status,round:state.round,stage:stages[state.round].label,wins:state.wins,awaitingNext:state.awaitingNext,
      seed:state.seed,venue:state.venue,difficulty:state.difficulty,entrants:state.entrants.length,
      completedMatches:state.rounds.flat().filter(fixture=>fixture.winnerId!==null).length,
      player:match?.player.name??null,playerId:state.playerId,opponent:match?.opponent?.name??null,opponentId:match?.opponent?.id??null,
      score:match?.completed?{playerGames:match.playerGames,aiGames:match.aiGames}:null};
  }
  return Object.freeze({create,currentMatch,recordResult,next,summary,stages,catalog,seedPositions});
});
