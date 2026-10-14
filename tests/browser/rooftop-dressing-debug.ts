import { camera, createAuraApp, effects, lights, model, scene } from '@aura3d/engine';
import { assets } from '../../src/aura-assets';
import { createRooftopDressing } from '../../apps/showcase-rooftop-buckets/src/environment';

const mode = new URLSearchParams(location.search).get('mode') ?? 'dressing';
const nodes = mode === 'dressing' || mode === 'dressing-shooter' || mode === 'full' ? createRooftopDressing({ reviewCapture: true }) : [];
if (mode === 'dressing-shooter' || mode === 'full') nodes.push(model(assets.rooftopLayupScorer, { name:'shooter' }).position(-2.8,0,4.2));
if (mode === 'full') nodes.push(model(assets.rooftopCourt, { name:'court', scaleMode:'world' }).position(0,-0.1,4));
const app = createAuraApp('#stage', {
  pixelRatio:1, resize:false,
  renderer:{mode:'production',qualityProfile:'production',fallback:'safe-basic'},
  scene: scene().background('#20183f').camera(camera.perspective({ position:[5.55,3.62,7.55], target:[-0.52,2.24,1.32], fov:41 })).addMany([effects.fog({ name:'dusk haze', density:0.005, color:'#24173f', intensity:0.14 }), effects.neonBloom({ intensity:0.34 }), ...nodes, lights.ambient({color:'#8098c8',intensity:1.32}), lights.directional({color:'#fff3d6',intensity:3.6}).position(8,20,10)])
});
await app.ready(); app.step(1/60); await new Promise(r=>setTimeout(r,300));
const canvas=document.querySelector('canvas') as HTMLCanvasElement; const png=canvas.toDataURL(); document.body.dataset.result=JSON.stringify({mode,diag:app.diagnostics(),png});
