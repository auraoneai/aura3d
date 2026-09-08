import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(), sha=b=>createHash('sha256').update(b).digest('hex');
const walk=d=>existsSync(d)?readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]):[];
const source=(await import(pathToFileURL(join(root,'tools/release/source-identity.mjs')))).sourceIdentity(root);
const [mode,...args]=process.argv.slice(2);
if(mode==='receipt'){
 const [gate,claim,out,minImages,...dirs]=args, paths=dirs.flatMap(walk).filter(p=>/\.(png|json|webm|mp4)$/.test(p)).sort();
 if(paths.filter(p=>/\.(png|webm|mp4)$/.test(p)).length<Number(minImages))throw Error(`${gate}: insufficient visual artifacts`);
 const artifacts=paths.map(path=>({path,sha256:sha(readFileSync(path))}));mkdirSync(dirname(out),{recursive:true});
 writeFileSync(out,JSON.stringify({schema:'muse3jsparity-producer/v1',runId:randomUUID(),gate,tasks:[],command:['github-actions',gate],cwd:root,exitCode:0,startedAt:new Date(Math.min(...paths.map(p=>statSync(p).birthtimeMs))).toISOString(),endedAt:new Date().toISOString(),source,claimSurface:claim,environment:{browser:'Chromium',backend:'production runtime',hardware:'GitHub Actions ubuntu-24.04'},artifacts,packages:[],tarballs:[]},null,2)+'\n');
} else if(mode==='aggregate'){
 const ref=path=>({path,sha256:sha(readFileSync(path))}), add=(id,approvalScope,producer,paths)=>({id,approvalScope,artifacts:paths.map(path=>({path,producerReceipt:ref(producer)}))});
 const sections=[
  add('flagship-routes','Smart City desktop/mobile command and flythrough compositions','tests/reports/muse301-gallery/routes/receipt.json',['tests/reports/smart-city-composition-301/desktop-command-visible.png','tests/reports/smart-city-composition-301/desktop-flythrough-visible.png','tests/reports/smart-city-composition-301/mobile-command-visible.png']),
  add('showcase-games','Turbo Drift and Skyline Runner input, progression and finish states','tests/reports/muse301-gallery/routes/receipt.json',['tests/reports/showcase-gameplay/showcase-turbo-drift-circuit-high-speed-chase.png','tests/reports/showcase-gameplay/showcase-turbo-drift-circuit-drift.png','tests/reports/showcase-gameplay/showcase-skyline-runner-traversal.png','tests/reports/showcase-gameplay/showcase-skyline-runner-finish.png']),
  add('aura-clash','Aura Clash landed-hit, special, KO/reset and mobile states','tests/reports/muse301-gallery/clash/receipt.json',['apps/aura-clash-showcase/launch-evidence/aura-clash-visual-special.png','apps/aura-clash-showcase/launch-evidence/aura-clash-visual-hit.png','apps/aura-clash-showcase/launch-evidence/aura-clash-visual-ko-reset.png','apps/aura-clash-showcase/launch-evidence/aura-clash-visual-mobile.png']),
  add('night-adoption','Architectural night lighting enabled, disabled and opponent controls','tests/reports/muse301-gallery/visual/receipt.json',['tests/reports/muse3jsparity/visual-301-night-lighting-aura-on.png','tests/reports/muse3jsparity/visual-301-night-lighting-aura-off.png','tests/reports/muse3jsparity/visual-301-night-lighting-three-on.png']),
  add('crowd-adoption','Smart City native instancing, individual and hidden controls','tests/reports/muse301-gallery/crowd/receipt.json',['tests/reports/crowd-instancing-adoption-301/smart-city/native.png','tests/reports/crowd-instancing-adoption-301/smart-city/individual.png','tests/reports/crowd-instancing-adoption-301/smart-city/hidden.png']),
  add('selected-threejs-comparison','Selected final Aura/Three paired workloads','tests/reports/muse301-gallery/visual/receipt.json',['tests/reports/muse3jsparity/visual-301-bloom-aura-on.png','tests/reports/muse3jsparity/visual-301-bloom-three-on.png','tests/reports/muse3jsparity/visual-301-water-reflections-aura-on.png','tests/reports/muse3jsparity/visual-301-water-reflections-three-on.png','tests/reports/muse3jsparity/visual-301-decals-aura-on.png','tests/reports/muse3jsparity/visual-301-decals-three-on.png','tests/reports/muse3jsparity/visual-301-particles-aura-on.png','tests/reports/muse3jsparity/visual-301-particles-three-on.png'])
 ];
 const out='release-artifacts/3.0.1-final-visual-review-input.json';mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({schema:'aura3d.final-visual-review-input/1.0',version:'3.0.1',source,sections},null,2)+'\n');
} else throw Error('usage: receipt|aggregate');
