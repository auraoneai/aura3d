// Daylit metrology lab. Saffron castings, dark graphite milling table, teal glazing.
// The upright frame and the front bed rail give the robot a real work envelope.
import {camera, effects, environments, group, instances, lights, material, model, primitives, scene,
  type AuraNodeInput, type AuraVec3} from '@aura3d/engine';
import {assets} from './aura-assets';
import {above, home, mix, solve, type Point, pickDefault, dropDefault} from './kinematics';

export const cameraTarget:Point=[.05,.35,.10];
export const fov=33;
export function cameraEye(aspect:number):Point {
  const distance=Math.max(2.60,2.56/Math.max(.5,aspect));
  return [cameraTarget[0]+distance*.20,cameraTarget[1]+distance*.36,cameraTarget[2]+distance*.91];
}
const enamel=material.pbr({color:'#c6d6d6',roughness:.44,metalness:.30});
const steel=material.pbr({color:'#829a9e',roughness:.36,metalness:.68});
const frame=material.pbr({color:'#293e43',roughness:.37,metalness:.54});
const slot=material.pbr({color:'#193337',roughness:.65,metalness:.12});
const teal=material.pbr({color:'#26ada1',roughness:.34,metalness:.32});
const ink=material.pbr({color:'#f0b854',roughness:.4,metalness:.25});
const pathMat=material.pbr({color:'#50ebca',emissive:'#29b894',emissiveIntensity:.33,roughness:.41});
function box(name:string,position:Point,size:Point,mat=frame) {
  return primitives.box({name,position,size,material:mat,receiveShadow:true,castShadow:true});
}
const mut=(id:string)=>({id,mutable:true});
const joints=['j1','j2','j3','j4','j5','j6'] as const;
export {joints};
export function rotation(i:number,angle:number):Point {return i===0 || i===3 || i===5 ? [0,angle,0] : [0,0,angle];}
function robot() {
  const pose=solve(home)!;
  const offsets=[.12,.19,.55,.42,.09,.08];
  function mesh(key:keyof Omit<typeof assets,'studio'>) {
    return model(assets[key],{name:'Relay '+key,scaleMode:'world',castShadow:true,receiveShadow:true});
  }
  let children:AuraNodeInput[]=(['jawL','jawR'] as const).map((key,i)=>
    group(key,[mesh(key)],{position:[(i?-1:1)*.047,.07,0]}).runtime(mut(key)));
  for(let i=5;i>=0;i--) {
    const key=joints[i];
    children=[group(key,[mesh(key),...children],{position:[0,offsets[i],0],rotation:rotation(i,pose[i])}).runtime(mut(key))];
  }
  return group('Relay six-axis manipulator',[mesh('base'),...children]);
}
function nest(id:string,p:Point) {
  const mat=id==='pick'?teal:ink;
  return group(id,[
    box('Fixture base',[0,.018,0],[.18,.036,.18],frame),
    box('Machined top',[0,.046,0],[.148,.020,.148],steel),
    box('Datum insert',[0,.059,0],[.082,.006,.09],slot),
    ...[-1,1].map(x=>box('Position strip',[x*.063,.057,0],[.01,.004,.096],mat)),
    box('Station marker',[0,.026,.091],[.125,.010,.002],mat)
  ],{position:[p[0],0,p[2]]}).runtime(mut(id));
}
export const pathPoints=(p:Point,d:Point)=>{
  const u=above(p),v=above(d);
  return [[p,u,6],[u,v,17],[v,d,6]].flatMap(entry=>{
    const [a,b,n]=entry as [Point,Point,number];
    return Array.from({length:n},(_,i)=>mix(a,b,i/n));
  }).concat([d]);
};
export function buildWorkcell(eye:Point) {
  const world=scene().background('#99b1b4').camera(camera.perspective({position:eye,target:cameraTarget,fov,near:.03,far:35}))
    .add(environments.hdri({name:'Workshop daylight',texture:assets.studio,intensity:.85,rotation:.76,background:false}))
    .add(lights.key({name:'High left softbox',position:[-2.2,3.8,2.6],target:[0,.35,0],intensity:2.0,color:'#fff2de'}))
    .add(lights.directional({name:'Window rim',position:[1.7,2,-2],target:[0,.5,0],color:'#b7f4ee',intensity:1.65}))
    .add(lights.rectArea({name:'Tooling face fill',position:[1,1.6,1.5],target:[0,.25,0],width:2,height:.7,intensity:1.6,color:'#ecf5f5'}))
    .add(box('Architectural floor',[0,-.86,0],[14,.1,12],enamel))
    .add(box('Back wall',[0,1.7,-2.35],[10,5,.12],enamel))
    .add(box('Ribbed bed casting',[0,-.115,.10],[2.72,.21,1.85],frame))
    .add(box('Machined fixture plate',[0,-.013,.1],[2.70,.026,1.83],steel))
    .add(box('Front edge extrusion',[0,-.07,1.027],[2.72,.028,.022],steel))
    .add(box('Lower cabinet',[0,-.50,.1],[2.57,.62,1.72],enamel));
  for(const x of [-.87,0,.87]) {
    world.add(box('Cabinet divider',[x-.42,-.49,.967],[.012,.56,.014],frame));
    world.add(box('Recessed drawer pull',[x,-.31,.975],[.32,.027,.025],slot));
  }
  world.add(instances.box({name:'T-slot grooves',size:[2.7,.003,.008],
    transforms:Array.from({length:17},(_,i)=>({position:[0,.001,-.72+i*.1] as AuraVec3})),material:slot}));
  world.add(instances.cylinder({name:'Fixture fasteners',size:[.016,.004,.016],material:frame,
    transforms:Array.from({length:54},(_,i)=>({position:[-1.2+(i%9)*.30,.002,-.56+Math.floor(i/9)*.30] as AuraVec3}))}));
  for (const x of [-2.7,-1.35,0,1.35,2.7]) {
    world.add(box('Anodized mullion',[x,.9,-1.52],[.045,2.7,.08],steel));
    world.add(box('Glazed lab screen',[x+.68,.81,-1.56],[1.30,1.48,.025],material.pbr({color:'#579c99',metalness:.35,roughness:.22})));
    world.add(box('Glazing sill',[x+.68,.06,-1.52],[1.34,.045,.07],frame));
    world.add(box('Glass horizon etching',[x+.68,.66,-1.53],[1.28,.009,.01],enamel));
    world.add(box('Glazing header',[x+.68,1.57,-1.52],[1.34,.06,.07],frame));
    world.add(box('Clerestory light',[x+.68,1.65,-1.70],[1.18,.035,.06],material.pbr({color:'#f3f6ea',emissive:'#d8efe6',emissiveIntensity:.7})));
  }
  world.add(robot()).add(nest('pick',pickDefault)).add(nest('drop',dropDefault));
  world.add(group('Machined transfer blank',[
    box('Aluminum body',[0,0,0],[.048,.066,.067],enamel),
    box('Amber crown',[0,.027,0],[.050,.010,.069],ink),
    box('Datum bore',[0,.0335,0],[.018,.002,.020],slot)
  ],{position:pickDefault}).runtime(mut('part')));
  pathPoints(pickDefault,dropDefault).forEach((position,i)=>world.add(primitives.sphere({
    name:'Programmed trajectory',position,size:.012,material:pathMat}).runtime(mut('path-'+i))));
  return world.add(effects.antiAlias({mode:'fxaa'}));
}
