import {createAuraApp} from '@aura3d/engine';
import marketing from '../../../marketing/package.json';
import {assets} from './aura-assets';
import {buildWorkcell,cameraEye,cameraTarget,fov,joints,pathPoints,rotation} from './stage';
import {dropDefault,duration,home,pickDefault,poseAt,validate,type Point} from './kinematics';

type Station='pick'|'drop';
type Cycle='ready'|'running'|'paused'|'complete'|'blocked';
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=byId<HTMLCanvasElement>('viewport');
const run=byId<HTMLButtonElement>('run'), reset=byId<HTMLButtonElement>('reset');
const statusLine=byId('status');
const state={
  appId:'relay-workcell', enginePackage:'@aura3d/engine',engineVersion:marketing.dependencies['@aura3d/engine'],
  status:'loading',error:'',renderer:'',frameCount:0,drawCalls:0,triangles:0,
  assetUrl:'/models/relay-workcell/robot.glb',assetHash:'sha256-27d03b294131e1245226ee34130731056ec044ddf4edb5acdad8b6b923609308',
  cycleState:'ready' as Cycle,phase:'Ready',cycleCount:0,cycleTime:0,reachable:true,
  pick:[...pickDefault] as Point, drop:[...dropDefault] as Point,tcp:[...home] as Point,
  partPosition:[...pickDefault] as Point, joints:[] as number[],grip:0,attached:false,placed:false
};
Object.assign(window,{__auraShowcase:state});
if(new URLSearchParams(location.search).get('chrome')==='hidden')document.documentElement.dataset.chrome='hidden';
const stationIds=['pick','drop'] as const;
const fields=Array.from(document.querySelectorAll<HTMLInputElement>('.coords input'));
const canEdit=()=>state.status==='running' && ['ready','complete','blocked'].includes(state.cycleState);
function syncControls() {
  const labels:Record<Cycle,string>={ready:'Run cycle',running:'Pause',paused:'Resume',complete:'Replay cycle',blocked:'Run cycle'};
  run.textContent=labels[state.cycleState];
  run.disabled=state.status!=='running'||!state.reachable;
  reset.disabled=state.status!=='running';
  fields.forEach(field=>field.disabled=!canEdit());
  document.body.toggleAttribute('data-blocked',!state.reachable);
  byId('phase').textContent=state.cycleState==='paused'?'Paused':state.phase;
  byId('time').textContent=state.cycleTime.toFixed(2)+' s';
  byId('count').textContent=String(state.cycleCount);
  function values(label:string[],data:number[],el:HTMLElement) {
    if (!el.children.length) label.forEach(key=>{
      const cell=document.createElement('span'), title=document.createElement('b');
      title.textContent=key; cell.append(title,document.createTextNode('')); el.append(cell);
    });
    data.forEach((value,i)=>{el.children[i].lastChild!.textContent=String(Math.round(value));});
  }
  values(['X','Y','Z'],state.tcp.map(v=>v*1000),byId('tcp'));
  values(['J1','J2','J3','J4','J5','J6'],state.joints,byId('joints'));
}
function syncInputs() {
  for(const station of stationIds) for(const [axis,i] of [['x',0],['z',2]] as const)
    byId<HTMLInputElement>(station+'-'+axis).value=String(Math.round(state[station][i]*1000));
}
function fail(error:unknown) {
  state.status='error';state.error=String(error);delete document.body.dataset.sceneReady;
  statusLine.textContent='Interactive graphics unavailable. The workcell preview is displayed.';syncControls();
}
async function start(){
  let eye=cameraEye(canvas.clientWidth/Math.max(1,canvas.clientHeight));
  const app=createAuraApp(canvas,{scene:buildWorkcell(eye),renderer:{backend:'webgl2'},pixelRatio:{max:1.65},
    output:{toneMapping:'aces',exposure:.94,dither:true},diagnostics:false});
  const resize=new ResizeObserver(()=>{
    eye=cameraEye(canvas.clientWidth/Math.max(1,canvas.clientHeight));
    app.camera?.setPose({position:eye,target:cameraTarget,fov});
  });
  resize.observe(canvas);
  const node=(id:string)=>app.nodes.require(id);
  function applyPose(){
    const pose=poseAt(state.cycleTime,state.pick,state.drop);
    state.tcp=pose.tcp;state.joints=pose.joints.map(v=>v*180/Math.PI);
    state.partPosition=[...pose.partPosition];state.grip=pose.grip;state.attached=pose.attached;state.placed=pose.placed;
    state.phase=state.cycleState==='ready'?'Ready':state.cycleState==='blocked'?'Outside reach':state.cycleState==='complete'?'Complete':pose.phase;
    joints.forEach((id,i)=>node(id).setRotation(...rotation(i,pose.joints[i])));
    // The jaw faces lie 6 mm inboard of their mesh origins. Closed faces contact the 48 mm blank.
    const gap=.047-.017*pose.grip;
    node('jawL').setPosition(gap,.07,0);node('jawR').setPosition(-gap,.07,0);
    node('part').setPosition(...pose.partPosition);
  }
  function editRecipe(){
    const issue=validate(state.pick,state.drop);
    state.reachable=!issue;state.cycleState=issue?'blocked':'ready';state.cycleTime=0;
    statusLine.textContent=issue || 'Path reachable. Ready to run.';
    for(const id of stationIds)node(id).setPosition(state[id][0],0,state[id][2]);
    pathPoints(state.pick,state.drop).forEach((p,i)=>node('path-'+i).setPosition(...p));
    applyPose();syncControls();
  }
  fields.forEach(field=>{
    const change=()=>{
      const value=field.valueAsNumber;
      if(!Number.isFinite(value)){syncInputs();return;}
      const [station,axis]=field.id.split('-') as [Station,'x'|'z'];
      state[station][axis==='x'?0:2]=Math.round(value)/1000;
      editRecipe();
    };
    field.addEventListener('change',change);
    field.addEventListener('keydown',event=>{if(event.key==='Enter')field.blur();});
  });
  // Each run is anchored to monotonic wall time. Sparse frames can skip poses
  // without stretching the programmed cycle or accumulating integration error.
  let cycleOriginMs=0;
  function sampleRun(now:number){
    state.cycleTime=Math.min(duration,Math.max(0,(now-cycleOriginMs)/1000));
    if(state.cycleTime>=duration){
      state.cycleState='complete';state.cycleCount++;
      statusLine.textContent='Transfer complete. Replay to load a new blank.';
    }
    applyPose();
  }
  function pauseRun(message:string){
    if(state.cycleState!=='running')return;
    sampleRun(performance.now());
    if(state.cycleTime<duration){state.cycleState='paused';statusLine.textContent=message;}
    syncControls();
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)pauseRun('Cycle paused while the workcell was hidden.');
  });
  run.addEventListener('click',()=>{
    if(state.cycleState==='running')pauseRun('Cycle paused.');
    else if(state.reachable){
      if(state.cycleState==='complete')state.cycleTime=0;
      cycleOriginMs=performance.now()-state.cycleTime*1000;
      state.cycleState='running';statusLine.textContent='Executing programmed trajectory.';applyPose();
    }
    syncControls();
  });
  reset.addEventListener('click',()=>{
    state.pick=[...pickDefault];state.drop=[...dropDefault];state.cycleCount=0;
    syncInputs();editRecipe();
  });
  // Intersect the camera ray with the fixture plane. Hit-testing and dragging
  // share the same unprojection, so the selected station tracks the pointer after resize.
  const normalize=(p:Point):Point=>{const n=Math.hypot(...p);return [p[0]/n,p[1]/n,p[2]/n];};
  function floorPoint(event:PointerEvent):Point|null {
    const r=canvas.getBoundingClientRect();
    const forward=normalize([cameraTarget[0]-eye[0],cameraTarget[1]-eye[1],cameraTarget[2]-eye[2]]);
    const right=normalize([-forward[2],0,forward[0]]);
    const up:Point=[-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]];
    const scale=Math.tan(fov*Math.PI/360),x=(2*(event.clientX-r.left)/r.width-1)*scale*r.width/r.height;
    const y=(1-2*(event.clientY-r.top)/r.height)*scale;
    const ray=forward.map((v,i)=>v+x*right[i]+y*up[i]) as Point;
    const t=(.052-eye[1])/ray[1];return t>0?[eye[0]+t*ray[0],.052,eye[2]+t*ray[2]]:null;
  }
  let drag:{station:Station,dx:number,dz:number}|null=null;
  canvas.addEventListener('pointerdown',event=>{
    if(!canEdit()||event.button!==0||drag)return;
    const p=floorPoint(event);if(!p)return;
    const station=stationIds.find(id=>Math.hypot(state[id][0]-p[0],state[id][2]-p[2])<.15);
    if(station){drag={station,dx:state[station][0]-p[0],dz:state[station][2]-p[2]};canvas.setPointerCapture(event.pointerId);}
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return;const p=floorPoint(event);if(!p)return;
    const station=state[drag.station];
    station[0]=Math.round(Math.max(-1.25,Math.min(1.25,p[0]+drag.dx))*1000)/1000;
    station[2]=Math.round(Math.max(-.68,Math.min(.93,p[2]+drag.dz))*1000)/1000;
    syncInputs();editRecipe();
  });
  canvas.addEventListener('lostpointercapture',()=>drag=null);
  let ready=false,nextSample=0;
  app.onFrame(({frame})=>{
    state.frameCount=frame;
    if(!ready||state.status==='error')return;
    const now=performance.now();
    if(state.cycleState==='running')sampleRun(now);
    if(now<nextSample)return;
    nextSample=now+90;
    const d=app.diagnostics();
    if(d.errors.length){fail(d.errors.join(' · '));return;}
    state.drawCalls=d.drawCalls;state.triangles=d.triangles??0;state.renderer=d.backend;
    if(state.status==='loading'&&d.drawCalls>0&&Object.values(assets).filter(a=>a.type==='model').every(a=>d.assets.some(loaded=>loaded.url===a.url && loaded.status==='ready'))){
      state.status='running';document.body.dataset.sceneReady='true';editRecipe();
    }
    syncControls();
  });
  app.onDeviceLost(()=>fail('Graphics device lost.'));
  app.onDeviceRestored(()=>{state.status='loading';state.error='';state.cycleTime=0;state.cycleState='ready';});
  window.addEventListener('pagehide',e=>{if(!e.persisted){resize.disconnect();app.dispose();}});
  await app.readyStrict({stage:'first-frame'});ready=true;
}
void start().catch(fail);
