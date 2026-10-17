/* Shared event identity and versioned personal Tour Points rules. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TennisTourCatalog=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const events=freeze([
    {id:'dubai-open',name:'Dubai',city:'Dubai',venue:'hard',theme:'dubai',tagline:'Rise above the heat.',surface:'Hard court',baseTitlePoints:250,isMajor:false},
    {id:'los-angeles-open',name:'Los Angeles',city:'Los Angeles',venue:'hard',theme:'los-angeles',tagline:'Find your spotlight.',surface:'Hard court',baseTitlePoints:250,isMajor:false},
    {id:'monaco-open',name:'Monaco',city:'Monaco',venue:'clay',theme:'monaco',tagline:'Master the red clay.',surface:'Clay court',baseTitlePoints:500,isMajor:false},
    {id:'roma-open',name:'Roma',city:'Roma',venue:'clay',theme:'roma',tagline:'Make every rally count.',surface:'Clay court',baseTitlePoints:500,isMajor:false},
    {id:'turin-finals',name:'Turin Finals',city:'Turin',venue:'hard',theme:'turin',tagline:'Finish in style.',surface:'Hard court',baseTitlePoints:750,isMajor:false},
    {id:'new-york-open',name:'New York Open',city:'New York',venue:'hard',theme:'new-york',tagline:'Own the night.',surface:'Hard court',baseTitlePoints:1000,isMajor:true},
    {id:'paris-open',name:'Paris Open',city:'Paris',venue:'clay',theme:'paris',tagline:'Build every point.',surface:'Clay court',baseTitlePoints:1000,isMajor:true},
    {id:'london-open',name:'London Open',city:'London',venue:'grass',theme:'london',tagline:'Make the first strike.',surface:'Grass court',baseTitlePoints:1000,isMajor:true},
    {id:'sydney-open',name:'Sydney Open',city:'Sydney',venue:'hard',theme:'sydney',tagline:'Start something great.',surface:'Hard court',baseTitlePoints:1000,isMajor:true}
  ]);
  const multipliers=freeze({beginner:.25,club:.5,ace:1,pro:1.5,legend:2});
  // Keep the retired Ace ID and its awards for historical records. The existing
  // Pro preset keeps its stable ID and behavior and is now presented as Ace.
  const historicalDifficulties=freeze(Object.keys(multipliers));
  const difficulties=freeze(['beginner','club','pro','legend']);
  const labels=freeze({beginner:'Easy',club:'Club',pro:'Ace',legend:'Legend',ace:'Archived'});
  const difficultyLabel=id=>labels[id]||'Archived';
  const isPlayableDifficulty=id=>difficulties.includes(id);
  const basePoints=freeze([0,60,180,360,600,1000]);
  const roundFractions=freeze([0,.06,.18,.36,.6,1]);
  const getEvent=id=>events.find(event=>event.id===id)||null;
  function pointsFor(wins,difficulty,eventId){
    const event=getEvent(eventId);
    if(!event||!Number.isInteger(wins)||wins<0||wins>5||!Object.hasOwn(multipliers,difficulty))throw new RangeError('Invalid tournament result, difficulty or event.');
    return Math.round(event.baseTitlePoints*roundFractions[wins]*multipliers[difficulty]);
  }
  return freeze({events,difficulties,historicalDifficulties,difficultyLabel,isPlayableDifficulty,multipliers,basePoints,roundFractions,getEvent,pointsFor,majorRequiredPoints:750,rulesVersion:2,engineVersion:'tour-17',windowDays:90});
});
