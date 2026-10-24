/* Shared cosmetic palette. IDs are validated before entering a match. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TennisAppearance=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const options=entries=>Object.freeze(entries.map(([id,label,color])=>Object.freeze({id,label,color})));
  const skin=options([['light','Light','#e4b995'],['medium','Medium','#c9926d'],['dark','Dark','#805039']]);
  const clothing=options([['ivory','Ivory','#f3f0dc'],['forest','Forest','#214b3e'],['clay','Clay','#db582f'],['navy','Navy','#25364d'],['sky','Sky','#70b5d3'],['berry','Berry','#933d63']]);
  const racket=options([['graphite','Graphite','#1d2927'],['ivory','Ivory','#f3f0dc'],['clay','Clay','#db582f'],['navy','Navy','#25364d'],['sky','Sky','#70b5d3'],['berry','Berry','#933d63']]);
  const groups=Object.freeze({skin,shirt:clothing,pants:clothing,shoes:clothing,racket});
  const parts=Object.freeze(Object.keys(groups));
  function defaults(side='player'){
    return side==='ai'||side==='rival'
      ?{skin:'dark',shirt:'clay',pants:'navy',shoes:'ivory',racket:'graphite'}
      :{skin:'medium',shirt:'ivory',pants:'forest',shoes:'ivory',racket:'graphite'};
  }
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const selection={};
    for(const part of parts){
      // Saved players from before racket customization retain their entire kit.
      if(part==='racket'&&!Object.hasOwn(value,part)){selection.racket='graphite';continue;}
      if(!Object.hasOwn(value,part)||!groups[part].some(option=>option.id===value[part]))return null;
      selection[part]=value[part];
    }
    return selection;
  }
  const normalize=(value,side='player')=>validate(value)||defaults(side);
  function resolve(value,side='player'){
    const selection=normalize(value,side);
    return Object.fromEntries(parts.map(part=>[part,groups[part].find(option=>option.id===selection[part]).color]));
  }
  return Object.freeze({groups,parts,defaults,validate,normalize,resolve});
});
