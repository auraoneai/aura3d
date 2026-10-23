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

function hS(i,e){if(!i.profile)return i.r;let t=e-(i.base??i.bottom),n=i.profile[0],r=i.profile.at(-1);for(let s=1;s<i.profile.length;s++)if(t<=i.profile[s][0]){n=i.profile[s-1],r=i.profile[s];break}return n[1]+(r[1]-n[1])*Tm((t-n[0])/(r[0]-n[0]||1),0,1)}

function uS(i,e,t=1.8,n=1){if(e.disabled||i.y+n<e.bottom||i.y-n>e.top)return null;let r=i.x-e.x,s=i.z-e.z;if(e.halfX!==void 0){let l=Tm(r,-e.halfX,e.halfX),c=Tm(s,-e.halfZ,e.halfZ),h=r-l,u=s-c,d=Math.hypot(h,u);if(d>=t)return null;if(d>1e-5)return{x:h/d*(t-d+.002),z:u/d*(t-d+.002)};let f=e.halfX-Math.abs(r),p=e.halfZ-Math.abs(s);return f<p?{x:(Math.sign(r)||1)*(f+t+.002),z:0}:{x:0,z:(Math.sign(s)||1)*(p+t+.002)}}let o=Math.hypot(r,s),a=hS(e,i.y)+t;return o>=a?null:(o<1e-5&&(r=0,s=1),{x:r/(o||1)*(a-o+.002),z:s/(o||1)*(a-o+.002)})}

function ss(i,e,{radius:t=1.8,halfHeight:n=1,offsets:r=[0],yaw:s=0,passes:o=6}={}){let a=0;for(let l=0;l<o;l++){let c=!1;for(let h of r){let u={x:i.x+Math.sin(s)*h,y:i.y,z:i.z+Math.cos(s)*h};for(let d of e){let f=uS(u,d,t,n);f&&(i.x+=f.x,i.z+=f.z,u.x+=f.x,u.z+=f.z,c=!0,a++)}}if(!c)break}return a}

function Bx(i,e,t,n={}){let r=i.x-e.x,s=i.z-e.z,o=Math.max(1,Math.ceil(Math.hypot(r,s)/.8));i.x=e.x,i.z=e.z;let a=0;for(let l=0;l<o;l++)i.x+=r/o,i.z+=s/o,a+=ss(i,t,n);return a}

function rs(i,e){return i>-70&&i<225&&e>-365&&e<115}

function Mo(i,e){let t=Math.abs(i-Tt(e));return t<25?-3+3.6*(t/25)**8:.6}

function _i(i,e){return i<37||i>132||Math.abs(e+180)>10?null:.6+3.6*Math.sin(Math.PI*(i-37)/95)}

function rv(i,e,t=1/0){let n=-1/0;for(let r of Um){let s=r.b.x-r.a.x,o=r.b.z-r.a.z,a=Math.hypot(s,o),l=((i-r.a.x)*s+(e-r.a.z)*o)/(a*a),c=Math.abs((i-r.a.x)*o-(e-r.a.z)*s)/a;if(l>=0&&l<=1&&c<=r.w/2){let h=.6+(r.y-.6)*Math.ceil(l*48)/48;t>=h-2.5&&(n=Math.max(n,h))}}return n}

function sv(i,e,t=1/0){let n=-1/0;for(let r of[...km,...Bm])Math.abs(i-r.x)<r.w/2&&Math.abs(e-r.z)<r.d/2&&t>=r.y-2.5&&(n=Math.max(n,r.y));return n}

function T0(i,e,t,n=1/0){let r=-1/0;for(let s of Rc(i))Math.abs(t-s.z)<6.5*s.scale&&e>s.left-14&&e<s.right+14&&n>=s.deckY-2.5&&(r=Math.max(r,s.deckY));if(i===1)for(let s of Qd)Math.abs(t-s.z)<9&&Math.abs(e)<218&&n>=s.deckY-2.5&&(r=Math.max(r,s.deckY));return r}

function w0(i){return(i===0?oy:M0).map(e=>{let t=i===1?ms(e.z).x:0,n=42*e.scale,r=[t],s=i===1?205:172;for(let o of[-1,1])for(let a=1;o*(t+o*(a-1)*n)+22.5*e.scale<s;a++)r.push(t+o*a*n);return r.sort((o,a)=>o-a),{...e,axis:t,centres:r,deckY:e.y+36.05*e.scale,left:r[0]-22.5*e.scale,right:r.at(-1)+22.5*e.scale,purpose:i===0?"Town water conduit and cistern access":"Cliff service crossing and water conduit"}})}
