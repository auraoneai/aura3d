/* Shared strength editor; offline and multiplayer builds are saved independently. */
(() => {
  'use strict';
  const roster=window.TennisRoster;
  if(!roster?.ENABLED||!roster.customRules)return;
  function createEditor(hostId,storageKey,prefix,apiName){
    const host=document.getElementById(hostId);if(!host)return;
    const rules=roster.customRules,labels={forehand:'Forehand',backhand:'Backhand',serve:'Serve',footwork:'Footwork',dropShot:'Drop shot'};
    const initial=()=>Object.fromEntries(rules.stats.map(stat=>[stat,rules.min]));
    let ratings=initial(),offlineRatings=null;
    try{ratings=roster.validateCustom(JSON.parse(localStorage.getItem(storageKey)))||ratings;}catch{}
    host.innerHTML=`<div class="build-heading"><h3>Your strengths</h3><output id="${prefix}-remaining" aria-live="polite" aria-atomic="true"></output></div>
      <p class="build-help">Start at ${rules.min} in each strength. Add ${rules.extra} points, up to ${rules.max} each. Drop-shot skill improves your touch in Ace, Legend, and multiplayer.</p>
      <div class="build-stats" role="group" aria-label="Assign your strength points"></div>
      <div class="build-footer"><span>Choose the strengths that suit your game.</span><button id="${prefix}-reset" type="button">Reset points</button></div>`;
    for(const stat of rules.stats){
      const row=document.createElement('div');row.className='build-stat';
      row.innerHTML=`<span class="build-stat-label">${labels[stat]}</span><span class="build-track" aria-hidden="true">${Array.from({length:rules.max},()=>'<i></i>').join('')}</span>
        <div class="build-stepper"><button type="button" data-build-stat="${stat}" data-build-change="-1" aria-label="Decrease ${labels[stat].toLowerCase()}">−</button><output id="${prefix}-${stat}" aria-label="${labels[stat]} rating"></output><button type="button" data-build-stat="${stat}" data-build-change="1" aria-label="Increase ${labels[stat].toLowerCase()}">+</button></div>`;
      row.dataset.stat=stat;host.querySelector('.build-stats').appendChild(row);
    }
    const remaining=()=>rules.total-rules.stats.reduce((sum,stat)=>sum+ratings[stat],0);
    function render(){
      const left=remaining();
      host.querySelector(`#${prefix}-remaining`).textContent=left===0?'All points assigned':`${left} ${left===1?'point':'points'} left`;
      host.dataset.complete=String(left===0);
      for(const stat of rules.stats){
        const row=host.querySelector(`[data-stat="${stat}"]`);
        row.querySelector('output').textContent=ratings[stat];
        row.querySelector('output').setAttribute('aria-label',`${labels[stat]}: ${ratings[stat]} out of ${rules.max}`);
        row.querySelectorAll('.build-track i').forEach((bar,index)=>{bar.classList.toggle('filled',index<ratings[stat]);bar.classList.toggle('added',index>=rules.min&&index<ratings[stat]);});
        row.querySelector('[data-build-change="-1"]').disabled=ratings[stat]<=rules.min;
        row.querySelector('[data-build-change="1"]').disabled=ratings[stat]>=rules.max||left===0;
      }
      host.querySelector(`#${prefix}-reset`).disabled=left===rules.extra;
    }
    function save(){if(!offlineRatings)try{localStorage.setItem(storageKey,JSON.stringify(ratings));}catch{}render();}
    host.addEventListener('click',event=>{
      const button=event.target.closest('[data-build-change]');
      if(!button||button.disabled)return;
      const next={...ratings,[button.dataset.buildStat]:ratings[button.dataset.buildStat]+Number(button.dataset.buildChange)};
      const valid=roster.validateCustom(next);if(!valid)return;
      ratings=valid;save();
    });
    host.querySelector(`#${prefix}-reset`).addEventListener('click',()=>{ratings=initial();save();});
    window[apiName]={ratings:()=>({...ratings}),remaining,apply(value){const valid=roster.validateCustom(value);if(valid){ratings=valid;render();}},beginAccount(value){if(!offlineRatings)offlineRatings={...ratings};ratings=roster.validateCustom(value)||initial();render();},endAccount(){if(offlineRatings){ratings=offlineRatings;offlineRatings=null;render();}}};
    if(hostId==='multiplayer-build')host.hidden=false;render();
  }
  createEditor('multiplayer-build','baseline.multiplayer-build.v1','build','TennisMultiplayerBuild');
  createEditor('offline-build','baseline.offline-build.v1','offline-build','TennisOfflineBuild');
})();
