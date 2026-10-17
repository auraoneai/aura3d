/* Presentation shared by local, saved tournament and authoritative online results. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TennisMatchResults=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const presentations=new WeakMap();
  const valid=value=>Number.isFinite(value)&&value>=0;
  const count=value=>valid(value)?String(Math.round(value)):'—';
  const speed=value=>valid(value)&&value>0?`${Math.round(value)} km/h`:'—';
  const ratio=(won,total)=>valid(won)&&valid(total)&&total>0?`${Math.round(100*won/total)}% (${won}/${total})`:'—';
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function summarize(state,names={}){
    const personal=state.stats||{};
    const player=state.player?.stats||personal;
    const ai=state.ai?.stats||{pointsWon:personal.pointsLost};
    const players=[player,ai],serves=players.map(stats=>stats.serve);
    const rows=[];
    const add=(key,label,values)=>rows.push({key,label,player:values[0],ai:values[1]});
    add('pointsWon','Points won',players.map(stats=>count(stats.pointsWon)));
    if(serves.some(Boolean)){
      add('aces','Aces',serves.map(stats=>count(stats?.aces)));
      add('doubleFaults','Double faults',serves.map(stats=>count(stats?.doubleFaults)));
      add('firstServeIn','First serves in',serves.map(stats=>ratio(stats?.firstIn,stats?.firstAttempts)));
      add('servePointsWon','Service points won',serves.map(stats=>ratio(stats?.pointsWon,stats?.pointsPlayed)));
      add('returnPointsWon','Return points won',[serves[1],serves[0]].map(stats=>stats?ratio(stats.pointsPlayed-stats.pointsWon,stats.pointsPlayed):'—'));
      add('fastestServe','Fastest serve',serves.map(stats=>speed(stats?.fastest)));
      add('averageServe','Average serve',serves.map(stats=>speed(stats?.speedCount>0?stats.speedTotal/stats.speedCount:null)));
    }
    add('fastestShot','Fastest shot',players.map(stats=>speed(stats.fastestShot)));
    const rally=Math.max(...[personal.longestRally,player.longestRally,ai.longestRally].filter(valid),0);
    return {names:{player:names.player||'Player',ai:names.ai||'Opponent'},rows,summary:`Longest rally · ${rally} ${rally===1?'shot':'shots'}`};
  }

  function render(container,state,names){
    if(!container)return null;
    const model=summarize(state,names);
    presentations.set(container,model);
    container.innerHTML=`<table class="match-stats-table"><caption class="sr-only">Match statistics for both players</caption><thead><tr><th scope="col">${escape(model.names.player)}</th><th scope="col">Match stats</th><th scope="col">${escape(model.names.ai)}</th></tr></thead><tbody>${model.rows.map(row=>`<tr data-stat="${row.key}"><td>${escape(row.player)}</td><th scope="row">${row.label}</th><td>${escape(row.ai)}</td></tr>`).join('')}</tbody></table><p class="match-result-summary">${model.summary}</p>`;
    container.hidden=false;
    return model;
  }
  return Object.freeze({summarize,render,read:container=>presentations.get(container)||null});
});
