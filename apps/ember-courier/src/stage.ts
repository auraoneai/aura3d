import {
  camera, effects, environments, game, instances, lights, material, model, primitives, scene, sky,
  type AuraTransformSpec, type AuraVec3
} from "@aura3d/engine";
import { assets } from "./aura-assets";

// Shift change at a coastal freight terminal, just before dawn.
// Sodium-lit gantries and enamel safety markings against petrol-blue steel.
// The courier holds still for a portrait before the relay deck opens into view.
export const relays = [-6, -15, -24] as const;
export const portraitEye: AuraVec3 = [1.98, 1.40, 3.35];
export const portraitAim: AuraVec3 = [0, 0.98, 0];
const steel = (color: string, roughness = 0.53) => material.pbr({ color, roughness, metalness: 0.46 });
const glow = (color: string, intensity = 1.4) => material.emissive({ color, emissive: color, emissiveIntensity: intensity });
const surfaces = {
  frame: steel("#152e38"), floor: steel("#233a46", 0.43), ledge: steel("#364d56"), black: steel("#0d1d26"),
  crane: steel("#72412f"), stripe: steel("#996531"), roof: steel("#223a43"),
  sodium: glow("#ffab56"), ice: glow("#94dfec", 0.94), darkWindow: glow("#426979", 0.20),
  red: glow("#ef5d3d"), distant: material.pbr({color:"#112431",roughness:0.94,metalness:0.05})
};

export function buildStage() {
  const stage = scene().background("#10202c")
    .add(sky.gradient({name:"blue hour over the terminal",zenith:"#07121f",horizon:"#213848",ground:"#0e1921",captureEnvironment:false,affectsFog:false}))
    .camera(camera.perspective({ position: portraitEye, target: portraitAim, near: 0.09, far: 170, fov: 40 }))
    .add(environments.hdri({ name: "dockside steel reflections", texture: assets.studio, background: false, rotation: 1.2, intensity: 0.40 }))
    .add(lights.key({ position: [-3.5, 5, 4], target: [0, 1, -2], color: "#bfdef6", intensity: 1.12 }))
    .add(lights.directional({ position: [4, 3.5, -4], target: [0, 1, 0], color: "#ff9d5c", intensity: 1.54 }))
    .add(lights.point({ name:"dispatch booth key",position:[-1.65,2.65,2.2],color:"#b4e1ff",intensity:2.4,distance:5.5 }))
    .add(lights.point({name:"courier shoulder kicker",position:[1.65,2.2,-0.9],color:"#ff9451",intensity:2.7,distance:4.5}))
    .add(effects.fog({ name: "salt haze", mode: "linear", color: "#1a303e", near: 13, far: 88, maxOpacity: 0.72, affectsBackground: false }))
    .add(effects.cinematicBloom({ name: "halation on port signals", intensity: 0.11, threshold: 1.15, radius: 2 }))
    .add(effects.antiAlias({ mode: "fxaa" }))
    .add(model(assets.courier, { name: "Ember Courier", scaleMode: "world", castShadow: true, receiveShadow: true })
      .scale(1.92).runtime(game.runtimeNode("courier", { tags: ["player"] })));

  const batches = new Map<keyof typeof surfaces, AuraTransformSpec[]>();
  function plate(surface: keyof typeof surfaces, x: number, y: number, z: number, w: number, h: number, d: number, roll = 0, yaw = 0) {
    const batch = batches.get(surface) ?? [];
    if (!batches.has(surface)) batches.set(surface, batch);
    batch.push({ position: [x,y,z], scale: [w,h,d], rotation: [0,yaw,roll] });
  }
  // Deck plates have bevel-like shadow gaps, inspection strips, edge lamps and inset expansion joints.
  plate("black", 0,-0.22,-12, 8.5,0.36,42);
  for (let i = 0; i < 21; i++) {
    const z = 7 - i * 2;
    for (const side of [-1, 1]) {
      plate("floor",side*1.06,-0.05,z,2.09,0.1,1.98);
      plate("frame",side*3.12,-0.055,z,1.98,0.11,1.98);
      plate("stripe",side*2.28,0.007,z,0.064,0.014,1.91);
      plate("black",side*2.77,0.005,z,0.22,0.013,1.74);
      for (let j=0; j<7; j++) plate("ledge",side*2.77,0.015,z-0.72+j*0.24,0.21,0.013,0.065);
      plate("black",side*4.11,0.52,z,0.09,1.13,0.12);
      plate("ledge",side*4.11,1.07,z,0.09,0.08,2);
      plate("frame",side*4.11,0.46,z,0.055,0.045,2);
      if (i%2===0) plate("ice",side*3.75,0.017,z,0.12,0.02,0.58);
    }
  }
  // Tubular refinery stacks with flanged bands and pairs of riveted storage silos.
  for (let i=0; i<16; i++) {
    const side = i%2 ? 1 : -1;
    const x = side*(10+(i*7)%12);
    const z = 5 - Math.floor(i/2)*6.5;
    const radius = 1.15+(i%3)*0.5;
    const top = 1.5+(i*3)%7;
    stage.add(primitives.cylinder({ name: 'pressure vessel '+i, size:[radius*2,top+6,radius*2],params:{radialSegments:24},material:surfaces.roof }).position(x,(top-6)/2,z));
    for(let j=0;j<4;j++) {
      stage.add(primitives.cylinder({ name:'vessel collar '+i+'-'+j,size:[radius*2+0.09,0.12,radius*2+0.09],params:{radialSegments:24},material:surfaces.frame }).position(x,top-j*1.55,z));
    }
    plate("red",x,top+0.14,z,0.10,0.22,0.10);
    plate("black",x-radius-0.13,(top-6)/2,z,0.08,top+6,0.46);
    for(let j=0;j<Math.ceil(top+5);j++) plate("ledge",x-radius-0.19,top-j,z,0.12,0.06,0.58);
  }
  // Ship-to-shore gantries flank the lane, with triangular bracing and suspended spreaders.
  for (const [x,z] of [[-19,-8],[18,-19],[-25,-33],[22,-44]]) {
    const s = Math.sign(x);
    for (const dz of [-2.3,2.3]) {
      for(const ox of [-2,2]) plate("crane",x+ox,3.4,z+dz,0.36,13,0.4,-ox*0.05);
      plate("crane",x,9.7,z+dz,5,0.5,0.48);
      plate("frame",x,5.5,z+dz,0.18,6.4,0.22,0.64);
      plate("frame",x,5.5,z+dz,0.18,6.4,0.22,-0.64);
    }
    plate("crane",x,10,z,4.7,0.38,5.25);
    plate("black",x,10.9,z,1.5,1.6,2.3);
    plate("ice",x-s*0.78,11,z,0.06,0.74,1.95);
    plate("crane",x-s*3.2,11.2,z,9.5,0.34,0.6,-s*0.19);
    plate("frame",x-s*5.5,8.1,z,0.055,5.3,0.055);
    plate("stripe",x-s*5.5,5.45,z,1.4,0.13,0.38);
  }
  for(let i=0;i<49;i++){
    const flank = i<16 ? -1 : i<32 ? 1 : 0;
    const x = flank ? flank*(27+(i*5)%23) : (i-40)*4.5;
    const z = flank ? 21-(i%16)*4.8 : -63-(i%4)*2.5;
    const h=5+(i*17)%23, w=2.8+(i%4)*0.7;
    plate("distant",x,h/2-5,z,w,h,4.2);
    const towerTop=h-5;
    plate("distant",x+w*0.1,towerTop+0.53,z,w*0.65,1.06,2.9);
    if(i%3===0){
      plate("black",x,towerTop+1.75,z,0.11,3.35,0.11);
      plate("red",x,towerTop+3.45,z,0.10,0.16,0.10);
    }
    for(let row=0;row<Math.floor(h/1.9)-1;row++){
      for(let col=0;col<3;col++) if((i+row*7+col*11)%5<3)
        plate((row+i)%6===0?"sodium":"darkWindow",x+(col-1)*w/3,h-6.4-row*1.9,z+2.12,w*0.19,0.26,0.04);
    }
  }
  // Caged sodium dock lights give the return lane small pools of local colour.
  for(const z of [3,-9,-21,-30]){
    for(const side of [-1,1]){
      plate("black",side*3.97,0.8,z,0.21,0.33,0.36);
      plate("sodium",side*3.85,0.8,z,0.046,0.14,0.22);
    }
  }
  for (const [index,z] of relays.entries()) {
    for(const side of [-1,1]) {
      plate("black",side*1.94,0.16,z,0.68,0.32,1.03);
      plate("stripe",side*1.94,0.34,z,0.52,0.09,0.88);
      plate("frame",side*1.94,1.56,z,0.26,2.39,0.41);
      plate("sodium",side*1.78,1.55,z,0.065,2.11,0.43);
      plate("crane",side*1.62,2.95,z,0.23,1,0.4,-side*-0.71);
      plate("sodium",side*1.5,2.94,z+0.21,0.085,0.88,0.025,-side*-0.71);
    }
    plate("frame",0,3.28,z,2.78,0.25,0.42);
    for(let j=0;j<=index;j++) plate("sodium",(j-index/2)*0.23,3.28,z+0.225,0.11,0.14,0.035);
    for(let j=0;j<7;j++) plate("stripe",(j-3)*0.49,0.02,z,0.29,0.018,0.18,0,0.43);
    stage.add(primitives.box({ name: "relay confirmation "+index,size:[1.86,0.065,0.43],material:surfaces.ice })
      .position(0,3.11,z).runtime(game.runtimeNode("confirmed-"+index)));
  }
  for(const [key,transforms] of batches)
    stage.add(instances.box({ name:"terminal "+key, material:surfaces[key], transforms, castShadow:key==="crane"||key==="frame",receiveShadow:true }));
  stage.add(primitives.cylinder({name:"boot contact shadow",size:[0.73,0.008,0.45],params:{radialSegments:40},material:material.pbr({color:"#1e3035",metalness:0,roughness:0.97}),castShadow:false})
    .position(0,0.015,0).runtime(game.runtimeNode("contact")));
  return stage;
}
