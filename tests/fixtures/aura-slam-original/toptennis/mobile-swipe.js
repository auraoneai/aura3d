/* Touch gestures describe shots; the match engine owns movement and contact. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {
    let storage;
    try { storage=root.localStorage; } catch {}
    root.TennisSwipe=api.create({storage});
  }
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const STORAGE_KEY='baseline.mobileGameplay.v1';
  const VERSION=1;
  const validStyle=style=>style==='classic'||style==='swipe';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const finite=value=>typeof value==='number'&&Number.isFinite(value);

  function classifyGesture(gesture){
    if(!gesture)return null;
    const {startX,startY,endX,endY,startTime,endTime,width,height}=gesture;
    if(![startX,startY,endX,endY,startTime,endTime,width,height].every(finite)||width<=0||height<=0||endTime<=startTime)return null;
    const scale=Math.min(width,height),dx=endX-startX,forward=startY-endY;
    const distance=Math.hypot(dx,forward)/scale;
    // A tap, downward drag or mostly sideways movement cannot fire a shot.
    if(distance<.055||forward/scale<.035||forward/Math.hypot(dx,forward)<.3)return null;
    const angle=Math.atan2(dx,forward);
    const duration=Math.max(30,endTime-startTime)/1000;
    return {
      targetX:clamp(angle/(Math.PI/3),-1,1)*.8,
      targetDepth:.23+clamp((forward/scale-.055)/.495,0,1)*.69,
      directionX:dx/Math.hypot(dx,forward),directionY:forward/Math.hypot(dx,forward),
      strength:clamp((distance/duration-.35)/2.15,0,1)
    };
  }

  // Intersect the swipe's screen-space ray with the projected landing-depth
  // line. This keeps an upward swipe in the player's lane even near a sideline.
  function directionalTarget(shot,{origin,left,right,minX=-.8,maxX=.8}={}){
    if(!shot||!origin||!left||!right||!finite(shot.directionX)||!finite(shot.directionY)||shot.directionY<=0)return null;
    if(![origin.x,origin.y,left.x,left.y,right.x,right.y,minX,maxX].every(finite)||maxX<=minX)return null;
    const slope=shot.directionX/shot.directionY;
    const denominator=right.x-left.x+slope*(right.y-left.y);
    if(Math.abs(denominator)<1e-8)return null;
    const fraction=clamp((origin.x+slope*(origin.y-left.y)-left.x)/denominator,0,1);
    return minX+(maxX-minX)*fraction;
  }

  function createGesture(){
    let current=null;
    function begin({pointerId,x,y,time,width,height}={}){
      if(current||!Number.isInteger(pointerId)||![x,y,time,width,height].every(finite)||width<=0||height<=0)return false;
      current={pointerId,startX:x,startY:y,x,y,startTime:time,time,width,height,points:[{x,y}]};
      return true;
    }
    function move({pointerId,x,y,time}={}){
      if(!current||pointerId!==current.pointerId||![x,y,time].every(finite)||time<current.time)return false;
      current.x=x;current.y=y;current.time=time;
      current.points.push({x,y});
      if(current.points.length>24)current.points.splice(1,1);
      return true;
    }
    function end(point={}){
      if(!current||point.pointerId!==current.pointerId)return null;
      const valid=move(point),done=current;current=null;
      return valid?classifyGesture({...done,endX:done.x,endY:done.y,endTime:done.time}):null;
    }
    function cancel(pointerId){
      if(!current||pointerId!==undefined&&pointerId!==current.pointerId)return false;
      current=null;return true;
    }
    function snapshot(){return current?{active:true,...current,points:current.points.map(point=>({...point}))}:{active:false,pointerId:null,points:[]};}
    return Object.freeze({begin,move,end,cancel,snapshot});
  }

  function create({storage}={}){
    let preference='classic';
    const listeners=new Set();
    try {
      const stored=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');
      if(stored?.version===VERSION&&validStyle(stored.style))preference=stored.style;
    } catch {}
    function setPreference(style){
      if(!validStyle(style))return {ok:false,saved:false};
      preference=style;
      let saved=false;
      try {
        if(typeof storage?.setItem==='function'){
          storage.setItem(STORAGE_KEY,JSON.stringify({version:VERSION,style}));saved=true;
        }
      } catch {}
      for(const listener of listeners){try {listener({style,saved});} catch {}}
      return {ok:true,saved};
    }
    return Object.freeze({getPreference:()=>preference,setPreference,classifyGesture,directionalTarget,createGesture,
      subscribe(listener){if(typeof listener!=='function')return ()=>{};listeners.add(listener);return ()=>listeners.delete(listener);}});
  }
  return Object.freeze({create,classifyGesture,directionalTarget,createGesture,STORAGE_KEY});
});
