/* Tournament likenesses: cosmetic identities, independent of reused ability profiles. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TennisCharacters=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  // Stylized career-era looks, using the game's three skin tones and six kit colors.
  // Width changes affect the clothing silhouette only, never height or racket reach.
  const entries=[
    ['alcatraz','medium','sky','navy','ivory','crop','#291f19','none',1.07,1.04,.97,'stubble',true],
    ['featherer','light','ivory','ivory','ivory','swept','#493326','band',1.00,1.00,1.00,'none'],
    ['djokervic','medium','forest','ivory','ivory','crop','#211e1b','none',.95,.96,1.05,'none'],
    ['zinner','light','clay','ivory','ivory','curly','#b76832','cap',.92,.95,1.04,'none'],
    ['nada','medium','berry','ivory','clay','long','#4d3424','band',1.10,1.04,1.00,'none',true],
    ['samprass','medium','ivory','navy','ivory','curly','#282019','none',1.01,.98,1.04,'none'],
    ['agassio','medium','navy','ivory','navy','bald','#4b3325','none',1.08,1.07,.97,'goatee'],
    ['murrayo','light','navy','navy','ivory','curly','#684c32','none',1.00,.97,1.06,'stubble'],
    ['medveduck','light','sky','navy','sky','receding','#76583c','none',.91,.93,1.08,'stubble'],
    ['wawringo','light','clay','navy','clay','spiky','#483023','none',1.10,1.08,.96,'stubble'],
    ['borgo','light','ivory','ivory','forest','long','#bd904b','band',.96,.97,1.02,'none'],
    ['beckar','light','ivory','sky','ivory','crop','#c8813e','none',1.09,1.08,1.00,'none'],
    ['edbergio','light','ivory','navy','navy','swept','#b99150','none',.97,.94,1.06,'none'],
    ['mcenray','light','ivory','forest','ivory','curly','#785436','band',.96,1.02,.98,'none'],
    ['courrier','light','clay','ivory','navy','crop','#b36535','cap',1.06,1.05,1.00,'none'],
    ['roddicko','light','navy','ivory','ivory','crop','#67462c','backward',1.08,1.04,1.01,'stubble'],
    ['hewitto','light','forest','ivory','ivory','spiky','#b28b4c','backward',.97,.98,.98,'none'],
    ['del-portoro','medium','sky','navy','clay','crop','#382b23','band',1.06,1.00,1.08,'beard'],
    ['tsitsipass','light','sky','ivory','navy','long','#a47a44','band',.97,.96,1.07,'stubble'],
    ['rublevio','light','berry','navy','ivory','wavy','#b37a45','band',.95,.95,1.03,'none'],
    ['ruudolfo','light','forest','navy','ivory','swept','#947044','none',1.01,1.02,1.00,'none'],
    ['runeo','light','navy','ivory','sky','crop','#bd985a','backward',1.03,1.05,.97,'none'],
    ['fritzo','light','berry','ivory','ivory','swept','#493528','band',.96,.98,1.06,'none'],
    ['sheltonio','medium','ivory','navy','sky','curly','#3c2b20','none',1.10,1.06,1.00,'none',true],
    ['tiafoego','dark','berry','navy','berry','buzz','#201b19','band',1.10,1.06,.98,'beard',true],
    ['dimitrovo','medium','navy','forest','ivory','swept','#38291f','none',1.02,1.03,1.02,'beard'],
    ['nishikoriya','medium','clay','ivory','clay','spiky','#211d1c','band',.95,1.03,.96,'none'],
    ['cilicio','medium','forest','ivory','navy','crop','#34271f','none',.98,.95,1.08,'beard'],
    ['thiemmo','light','ivory','navy','clay','spiky','#745134','band',1.05,1.01,.99,'stubble'],
    ['ferrerio','medium','clay','navy','ivory','wavy','#4c3326','band',1.00,1.00,.98,'stubble'],
    ['gasqueto','light','sky','ivory','ivory','receding','#674931','none',1.00,1.05,1.00,'none'],
    ['hurkatzo','light','navy','sky','ivory','crop','#695038','cap',.96,.96,1.07,'none']
  ];
  const catalog=Object.freeze(entries.map(([id,skin,shirt,pants,shoes,hair,hairColor,headwear,build,faceWidth,faceLength,beard,sleeveless=false])=>Object.freeze({
    id,appearance:Object.freeze({skin,shirt,pants,shoes}),hair,hairColor,headwear,
    bandColor:id==='borgo'?'#214b3e':id==='mcenray'?'#db582f':'#f3f0dc',
    build,faceWidth,faceLength,beard,sleeveless
  })));
  const byId=new Map(catalog.map(character=>[character.id,character]));
  return Object.freeze({catalog,get:id=>byId.get(id)||null});
});
