// UNTRUSTED third-party excerpts (minified identifiers) from the Silt & Signal game bundle. Read as text only.
function Eo(){return{speed:0,turn:0,bank:0,vertical:0,energy:1,boosting:!1,boostLocked:!1,boostMode:"Cruise",thrust:0,liftInput:0,impacts:0,collisionCooldown:0}}

function e0(i,e,t,n,r){n=Math.min(n,.05);let s=jn(t.throttle||0,-1,1),o=jn(t.steer||0,-1,1),a=t.lift||0;!t.boost&&e.energy>=.18&&(e.boostLocked=!1);let l=!!t.boost&&!t.brake&&s>0,c=e.energy>(e.boosting?.025:.18);l&&!c&&(e.boostLocked=!0),e.boosting=l&&!e.boostLocked&&c,e.energy=jn(e.energy+n*(e.boosting?-.14:.09),0,1);let h=wo(i);h.reserve&&!e.boosting&&(e.energy=jn(e.energy+n*.02,0,1));let u=e.boosting?76:42,d=t.brake?0:s>0?u*s:13*s;t.brake&&(e.speed*=Math.exp(-n*6)),e.speed+=(d-e.speed)*(1-Math.exp(-n*(s?1:1.9))),e.turn+=(o-e.turn)*(1-Math.exp(-n*5));let f=.65/(1+Math.abs(e.speed)*.008);i.yaw-=e.turn*f*n*(e.speed<-.5?-1:1),e.bank+=(-e.turn*Math.min(.68,.2+Math.abs(e.speed)*.014)-e.bank)*(1-Math.exp(-n*5)),e.vertical+=(a*(h.wind?27:22)-e.vertical)*(1-Math.exp(-n*3.4));let p=i.x,x=i.z;i.x-=Math.sin(i.yaw)*e.speed*n,i.z-=Math.cos(i.yaw)*e.speed*n,i.y=jn(i.y+e.vertical*n,r.floor(i.x,i.z,i.y)+2.4,r.ceiling||205),i.x=jn(i.x,-640,640),i.z=jn(i.z,-r.length-50,150),e.collisionCooldown=Math.max(0,e.collisionCooldown-n);let m=!1;return Bx(i,{x:p,z:x},[...r.colliders,...r.creatureColliders||[]],{radius:1.85,halfHeight:1,offsets:[-2.2,0,2.7,5.4],yaw:i.yaw})&&(e.collisionCooldown===0&&Math.abs(e.speed)>4&&(m=!0,e.impacts++,e.collisionCooldown=.7),e.speed*=.82),e.thrust=Math.abs(s),e.liftInput=a,e.boostMode=e.boosting?"Turbo":"Cruise",m}

function Mx(i,e,t,n,r,{neriDistance:s=0}={}){if(i.scene||i.completed)return null;let o=zn(i),a=zi(i),l=Math.hypot(i.x-a.x,i.z-a.z)<o.radius&&Math.abs(i.y-a.y)<(o.kind==="climb"||i.chapter===4?19:11),c=i.point===o.points.length-1,h=l;o.kind==="timed"&&(h&&=_o(r,o)),o.kind==="stealth"&&(h&&=i.y<(o.maxY||19)),o.kind==="wake"&&(h&&=Math.abs(e.speed)>o.minSpeed&&i.y<o.maxY),o.kind==="pollen"&&(h&&=e.speed>5),o.kind==="herd"&&(h&&=s<42),["care","resonate","relay"].includes(o.kind)&&(h&&=Math.abs(e.speed)<5&&n.interact),o.kind==="lift"&&(h&&=Math.abs(e.speed)<6&&n.lift>0),o.kind==="tow"&&!i.towing&&(h&&=Math.abs(e.speed)<5&&n.interact),o.kind==="portal"&&c&&(h&&=Math.abs(e.speed)<12&&n.interact);let u=["care","resonate","relay","lift"].includes(o.kind)||o.kind==="tow"&&!i.towing||o.kind==="portal"&&c;return h?u&&(i.hold+=t,i.hold<(o.hold||1.2))?null:o.kind==="tow"&&!i.towing?(i.towing=!0,i.point=1,i.hold=0,{type:"attach"}):c?{type:"complete",objective:$T(i)}:(i.point++,i.hold=0,{type:"point"}):(i.hold=0,null)}

function zn(i){return Mt[i.chapter].objectives[i.objective]}

function zi(i){return zn(i).points[i.point]}

function $T(i){let e=zn(i);return i.restored=[...new Set([...i.restored,e.id])],i.hold=0,i.point=0,i.towing=!1,e.scene&&(i.scene=e.scene,i.line=0),e.kind==="portal"?i.pendingChapter=i.chapter+1:e.kind==="finish"?(i.completed=!0,i.scene=null):i.objective=Math.min(i.objective+1,Mt[i.chapter].objectives.length-1),e}

function uc(i,e){i.chapter=jn(e,0,6),i.objective=0,i.point=0,i.hold=0,i.x=0,i.z=45,i.y=e===4?26:e===2?22:6,i.yaw=0,e===0&&Object.assign(i,yo),e===6&&Object.assign(i,ym),e===3?i.visualVariant="pearl":delete i.visualVariant,i.homecomingRevision=Xu,i.scene=Mt[e].opening,i.line=0,i.recovering=!1,delete i.pendingChapter,delete i.careAnchor}

function _o(i,e){return i%(e.period||11)<(e.open||7)}

/* jn: not a function declaration */

function wo(i){let e=ju(i.fieldNotes).length;return{count:e,reserve:e>=3,wind:e>=7,aurora:e>=14,complete:e===21,pigments:["Original",...e>=3?["Tideglass"]:[],...e>=7?["Saffron"]:[],...e>=14?["Aurora"]:[]]}}

function E0(i,e){return i.chapter!==1||i.exploring||i.restored.includes("watergate")||i.z>=Rn.z-14?!1:(i.x=Rn.station.x,i.z=Rn.station.z+24,i.y=Rn.station.y+4,i.yaw=0,i.hold=0,i.recoveries=(i.recoveries||0)+1,e.speed=0,e.vertical=0,e.turn=0,e.bank=0,e.boosting=!1,e.energy=Math.max(0,e.energy-.25),!0)}
