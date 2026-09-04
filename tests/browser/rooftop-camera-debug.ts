import { camera, createAuraApp, lights, model, primitives, scene } from '@aura3d/engine';
import { assets } from '../../src/aura-assets';

const mode = new URLSearchParams(location.search).get('mode') ?? 'shooter';
const nodes = [] as any[];
if (mode === 'shooter' || mode === 'both') nodes.push(model(assets.rooftopLayupScorer, { name:'shooter', scaleMode:'normalized' }).position(-2.8,0,4.2));
if (mode === 'court' || mode === 'both') nodes.push(model(assets.rooftopCourt, { name:'court', scaleMode:'world' }).position(0,-0.1,4));
if (mode === 'primitive') nodes.push(primitives.box({ name:'box' }).position(0,0,4).scale([3,1,3]));
const app = createAuraApp('#stage', {
  pixelRatio:1, resize:false,
  renderer:{mode:'production',qualityProfile:'production',fallback:'safe-basic'},
  scene: scene().background('#04070c').camera(camera.perspective({ position:[5.55,3.62,7.55], target:[-0.52,2.24,1.32], fov:41 })).addMany(nodes).add(lights.ambient({color:'#8098c8',intensity:1.32})).add(lights.directional({color:'#fff3d6',intensity:3.6}).position(8,20,10))
});
await app.ready(); app.step(1/60); await new Promise(r=>setTimeout(r,300));
const canvas=document.querySelector('canvas') as HTMLCanvasElement;
const png=canvas.toDataURL(); const ctx=canvas.getContext('2d'); const p=ctx?.getImageData(0,0,canvas.width,canvas.height).data ?? new Uint8ClampedArray(); let non=0,minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;
for(let y=0;y<canvas.height;y+=1)for(let x=0;x<canvas.width;x+=1){const i=(y*canvas.width+x)*4;const diff=Math.abs(p[i]!-4)+Math.abs(p[i+1]!-7)+Math.abs(p[i+2]!-12);if(diff>24){non++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
document.body.dataset.result=JSON.stringify({mode,diag:app.diagnostics(),bounds:{non,x:minX,y:minY,w:maxX>=minX?maxX-minX+1:0,h:maxY>=minY?maxY-minY+1:0},png});
