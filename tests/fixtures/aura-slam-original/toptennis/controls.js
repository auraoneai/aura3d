/* Device bindings stay outside match rules and the online input protocol. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {
    let storage;
    try { storage=root.localStorage; } catch {}
    root.TennisControls=api.create({storage});
  }
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const STORAGE_KEY='baseline.controls.v1';
  const VERSION=1;
  const definitions=Object.freeze({
    keyboard:Object.freeze([
      ['left','Move / aim left','Move left and aim shots left.'],
      ['right','Move / aim right','Move right and aim shots right.'],
      ['up','Move forward / aim deep','Move forward and aim deeper shots.'],
      ['down','Move back / aim short','Move back and aim shorter shots.'],
      ['hit','Toss / hit','Press to toss or swing. Press twice quickly for power.'],
      ['power','Power modifier','Hold while pressing hit to add power.'],
      ['short','Prepare short shot','Toggle the short-shot preset.'],
      ['deep','Prepare deep shot','Toggle the deep-shot preset.'],
      ['lob','Lob swing','Start a lob swing immediately when available.'],
      ['placement','Controlled placement','Hold while aiming a normal or deep shot in supported offline difficulties.']
    ].map(([id,label,description])=>Object.freeze({id,label,description}))),
    controller:Object.freeze([
      ['hit','Toss / hit','Press to toss or swing. Press twice quickly for power.'],
      ['power','Power modifier','Hold while pressing hit to add power.'],
      ['short','Prepare short shot','Toggle the short-shot preset.'],
      ['deep','Prepare deep shot','Toggle the deep-shot preset.'],
      ['lob','Prepare / cancel lob','Toggle a prepared lob, then press hit to swing.']
    ].map(([id,label,description])=>Object.freeze({id,label,description})))
  });
  const defaultProfiles=Object.freeze({
    keyboard:Object.freeze(Object.fromEntries(Object.entries({
      left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],
      up:['ArrowUp','KeyW'],down:['ArrowDown','KeyS'],
      hit:['Space',null],power:['ShiftLeft','ShiftRight'],
      short:['KeyQ',null],deep:['KeyE',null],lob:['KeyR',null],placement:['KeyC',null]
    }).map(([action,slots])=>[action,Object.freeze(slots)]))),
    controller:Object.freeze({hit:0,power:7,short:2,deep:1,lob:3})
  });
  const keyNames=Object.freeze({ArrowLeft:'Left arrow',ArrowRight:'Right arrow',ArrowUp:'Up arrow',ArrowDown:'Down arrow',Space:'Space',ShiftLeft:'Left Shift',ShiftRight:'Right Shift'});
  const xboxNames=Object.freeze(['A','B','X','Y','LB','RB','LT','RT','View / Back','Menu / Start','Left stick click','Right stick click','D-pad up','D-pad down','D-pad left','D-pad right','Home']);
  const playStationNames=Object.freeze(['Cross','Circle','Square','Triangle','L1','R1','L2','R2','Share','Options','L3','R3','D-pad up','D-pad down','D-pad left','D-pad right','PS']);
  const knownDevice=device=>Object.hasOwn(definitions,device);
  const cloneProfile=(device,profile)=>Object.fromEntries(definitions[device].map(({id})=>[id,device==='keyboard'?[...profile[id]]:profile[id]]));
  const allowedKey=code=>typeof code==='string'&&code!=='KeyP'&&code!=='KeyF'&&(/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)||Object.hasOwn(keyNames,code));
  const allowedButton=index=>Number.isInteger(index)&&((index>=0&&index<=7)||index===10||index===11);

  function labelInput(input,device='keyboard',options={}){
    if(input===null||input===undefined)return 'Unassigned';
    if(device==='controller')return (options.playStation?playStationNames:xboxNames)[input]||`Button ${input}`;
    if(typeof input!=='string')return String(input);
    if(Object.hasOwn(keyNames,input))return keyNames[input];
    if(/^Key[A-Z]$/.test(input))return input.slice(3);
    if(/^Digit[0-9]$/.test(input))return input.slice(5);
    if(/^Numpad[0-9]$/.test(input))return `Numpad ${input.slice(6)}`;
    return input;
  }

  function validateBindings(device,profile){
    const errors=[];
    const fail=(action,input,message)=>errors.push({action,input,message});
    if(!knownDevice(device))return {valid:false,errors:[{action:null,input:null,message:'Unknown control device.'}]};
    if(!profile||typeof profile!=='object'||Array.isArray(profile))return {valid:false,errors:[{action:null,input:null,message:'The control profile must contain every action.'}]};
    const ids=new Set(definitions[device].map(({id})=>id));
    for(const id of Object.keys(profile))if(!ids.has(id))fail(id,null,'Unknown control action.');
    const used=new Map();
    for(const {id,label} of definitions[device]){
      if(!Object.hasOwn(profile,id)){fail(id,null,`${label} requires a binding.`);continue;}
      const value=profile[id];
      if(device==='keyboard'&&(!Array.isArray(value)||value.length!==2)){
        fail(id,null,`${label} needs a primary key and an optional alternate key.`);continue;
      }
      const inputs=device==='keyboard'?value:[value];
      for(let slot=0;slot<inputs.length;slot++){
        const input=inputs[slot];
        if(device==='keyboard'&&slot===1&&input===null)continue;
        if(input===null||input===undefined||input===''){
          fail(id,input??null,slot===0?`${label} requires a primary ${device==='keyboard'?'key':'button'}.`:'Use a key or leave the alternate unassigned.');continue;
        }
        if(!(device==='keyboard'?allowedKey(input):allowedButton(input))){
          const reserved=device==='keyboard'?(input==='KeyP'?'P is reserved for pause / options.':input==='KeyF'?'F is reserved for fullscreen.':null):null;
          fail(id,input,reserved||`${labelInput(input,device)} cannot be assigned. This input is reserved or unsupported.`);continue;
        }
        const previous=used.get(input);
        if(previous)fail(id,input,`${labelInput(input,device)} is already assigned to ${previous.label}.`);
        else used.set(input,{id,label});
      }
    }
    return {valid:errors.length===0,errors};
  }

  function create({storage}={}){
    const profiles={keyboard:cloneProfile('keyboard',defaultProfiles.keyboard),controller:cloneProfile('controller',defaultProfiles.controller)};
    const listeners=new Set();
    try {
      const stored=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');
      if(stored&&stored.version===VERSION){
        for(const device of ['keyboard','controller']){
          if(validateBindings(device,stored[device]).valid)profiles[device]=cloneProfile(device,stored[device]);
        }
      }
    } catch {}
    function getBindings(device){return knownDevice(device)?cloneProfile(device,profiles[device]):null;}
    function applyBindings(device,profile){
      const validation=validateBindings(device,profile);
      if(!validation.valid)return {ok:false,saved:false,errors:validation.errors};
      profiles[device]=cloneProfile(device,profile);
      let saved=false;
      try {
        if(typeof storage?.setItem==='function'){
          storage.setItem(STORAGE_KEY,JSON.stringify({version:VERSION,keyboard:profiles.keyboard,controller:profiles.controller}));
          saved=true;
        }
      } catch {}
      for(const listener of listeners){
        try { listener({device,bindings:getBindings(device),saved}); } catch {}
      }
      return {ok:true,saved,errors:[]};
    }
    function actionForKey(code){
      if(typeof code!=='string')return null;
      return definitions.keyboard.find(({id})=>profiles.keyboard[id].includes(code))?.id||null;
    }
    function isDown(action,keys){
      return Object.hasOwn(profiles.keyboard,action)&&profiles.keyboard[action].some(code=>code!==null&&Boolean(keys?.[code]));
    }
    function buttonFor(action){return Object.hasOwn(profiles.controller,action)?profiles.controller[action]:null;}
    function labelFor(action,device='keyboard',options={}){
      if(!knownDevice(device)||!Object.hasOwn(profiles[device],action))return 'Unassigned';
      const inputs=device==='keyboard'?profiles[device][action].filter(input=>input!==null):[profiles[device][action]];
      return (options.all?inputs:inputs.slice(0,1)).map(input=>labelInput(input,device,options)).join(' / ');
    }
    return Object.freeze({
      actions:device=>knownDevice(device)?definitions[device].map(action=>({...action})):[],
      defaults:device=>knownDevice(device)?cloneProfile(device,defaultProfiles[device]):null,
      getBindings,validateBindings,applyBindings,actionForKey,isDown,buttonFor,labelFor,labelInput,
      subscribe(listener){if(typeof listener!=='function')return ()=>{};listeners.add(listener);return ()=>listeners.delete(listener);}
    });
  }
  return Object.freeze({create,validateBindings,labelInput});
});
