#!/usr/bin/env node
// Writes tools/release/visual-compare-5.0/plan.json: the 4.7.10 -> 5.0 visual comparison view list, with every baseline
// frame verified on disk and pinned by sha256. Source only: reads files, launches nothing.
//
//   node tools/release/visual-compare-5.0/build-plan.mjs            # rewrite plan.json
//   node tools/release/visual-compare-5.0/build-plan.mjs --check    # exit 1 when plan.json is stale or a baseline is missing/changed
//
// Baselines are existing frames of record (evidence/game-upgrades-47/<slug>/{f48,f49,f50,p7-*,p9-*}/.../frames/<run>/);
// nothing here re-captures a baseline. JPEG frames are canvas-only 1280x720 screenshots (quality 0.7) from
// tests/browser/game-luma-capture.spec.ts on the software-WebGL2 ACR runner.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
export const PLAN_PATH = join(here, 'plan.json');
const EVID = 'evidence/game-upgrades-47';

/**
 * Roots a baseline path may be relative to, tried in order. JPEG frames are gitignored (`*.jpg`), so 20 of the 28 pinned
 * frames (f48/f49/f50 rounds) are untracked working-tree files: they were restored on 2026-11-03 by decoding the retained
 * ACR consoles (/private/tmp/gu47-f4x-*, evidence/audit-fix/e5/decode-luma.mjs) after the aura3d-gu47 worktree that held the
 * only copy was deleted; every restored file matched its original sha256. See docs/release/5.0-visual-comparison.md.
 */
export const BASELINE_ROOTS = { repo: '.' };

// capture round of each frames dir family (STATE.md of aura3d-gu47): what code produced the baseline frame.
const ROUND = {
  f48: 'f48-6e8a461 (frozen 6e8a46152, 4.7.9 candidate; ACR software WebGL2)',
  f49: 'f49-c24731c (c24731c8d after reverts; ACR software WebGL2)',
  f50: 'f50 (4.7.9 Thermal Drift fix 319641cb9; ACR software WebGL2)',
  p7: 'phase 7 (2026-11-01, about 4.7.6/4.7.7; ACR software WebGL2)',
  p9: 'phase 9 (2026-11-01, about 4.7.8; ACR software WebGL2)',
  p9c: 'phase 9c (2026-11-01, about 4.7.8; ACR software WebGL2)'
};

/** Games whose 4.7.10 release changed their scene (STATE.md 2026-11-02 17:35): the baseline predates the swap. */
const CHANGED_4710 = {
  heatsink: 'two Meshy towers added',
  'aura-links-3d': 'Meshy gorse added',
  teleoperator: 'Victorian facade added',
  'splat-rush-port': 'palette island added'
};

/** [id, game-luma target name, frames dir under EVID, categories, motion, note] */
const VIEWS = [
  ['orbit-neutral', 'strange-orbit-port--neutral-env', 'strange-orbit-port/p9c/strange-orbit-port/frames/g15p9c-3', ['neutral-env-pbr', 'glass'], 'light', 'hover-bike PBR under ?env=neutral (the one neutral-environment-lit view with a 4.7 baseline)'],
  ['orbit-glass', 'strange-orbit-port--default', 'strange-orbit-port/f48/strange-orbit-port/frames/f48-strange-orbit-default', ['glass', 'night-indoor'], 'light', 'canopy transmission/glass plus lit water'],
  ['wind-day', 'where-the-wind-wanders-port--default', 'where-the-wind-wanders-port/p7-r1/where-the-wind-wanders-port/frames/g23p7-r1-default', ['sky-daylight', 'outdoor'], 'light', 'daylight meadow, foliage sway only'],
  ['links-day', 'aura-links-3d--stAuroras', 'aura-links-3d/f48/aura-links-3d/frames/f48-aura-links-1', ['sky-daylight', 'outdoor', 'skinned'], 'light', 'golfer on the tee under a clear sky'],
  ['tele-noon', 'teleoperator--noon', 'teleoperator/f48/teleoperator/frames/f48-teleoperator-1', ['sky-daylight', 'outdoor'], 'animated', 'city street at noon (traffic is time-driven)'],
  ['tele-night', 'teleoperator--night', 'teleoperator/f48/teleoperator/frames/f48-teleoperator-2', ['night', 'emissive', 'transparent'], 'animated', 'night street with headlights and window glow'],
  ['rush-sunset', 'roadster-rush--default', 'roadster-rush/f48/roadster-rush/frames/f48-roadster-rush-default', ['sky-daylight', 'emissive'], 'animated', 'sunset highway (seed=42 traffic is time-driven)'],
  ['bunker-indoor', 'bunker-zero--default', 'bunker-zero/p7-r1/bunker-zero/frames/g11p7-r1-default', ['indoor', 'night-indoor'], 'light', 'concrete corridor lit by fixtures, first-person weapon'],
  ['silt-ring', 'silt-and-signal-port--default', 'silt-and-signal-port/f48/silt-and-signal-port/frames/f48-silt-and-signal-default', ['transparent', 'outdoor'], 'light', 'translucent in-canvas ring, haze and rock arches'],
  ['drift-vfx', 'heatsink--default', 'heatsink/f50/heatsink/frames/f50-heatsink-default', ['particles-vfx', 'emissive', 'night-indoor'], 'animated', 'Thermal Drift sunset circuit: sparks, bloom, lit traffic'],
  ['chroma-vfx', 'splat-rush-port--default', 'splat-rush-port/f48/splat-rush-port/frames/f48-splat-rush-default', ['particles-vfx', 'sky-daylight'], 'animated', 'Chroma Roll: cloud sea, particles and an emissive ball'],
  ['tennis-text', 'top-tennis--default', 'top-tennis/p7/top-tennis/frames/g01p7-1', ['text-ui', 'outdoor'], 'light', 'in-canvas 3D scoreboard text and banners (DOM HUD is hidden by the canvas-only capture)'],
  ['crown-skinned', 'iron-crown--colosseum-ruins', 'iron-crown/p9-r1/iron-crown/frames/g05p9-r1-4', ['skinned', 'outdoor'], 'light', 'two skinned fighters in idle pose'],
  ['ninja-skinned', 'ninja-runner-port--village', 'ninja-runner-port/p7-r1/ninja-runner-port/frames/g20p7-r1-3', ['skinned', 'outdoor'], 'animated', 'runner and crowd on a cobbled road; animation phase differs per capture'],
  ['dotdash-static', 'dot-dash-3d--default', 'dot-dash-3d/f48/dot-dash-3d/frames/f48-dot-dash-default', ['indoor', 'emissive', 'text-ui'], 'light', 'maze board under point lights; mostly static'],
  ['serpent-sky', 'serpentine-sky-run-port--default', 'serpentine-sky-run-port/f49/serpentine-sky-run-port/frames/f49-serpentine-sky-run-1', ['sky-daylight', 'skinned'], 'animated', 'dusk cloud sea and runner']
];

/** Desired views that cannot be listed because no 4.7.10-era frame exists on disk. */
const MISSING = [
  { want: 'neutral-environment-lit PBR product viewer (template)', candidates: ['apps/product-studio', 'apps/flagship-viewer', 'apps/material-lab'], why: 'no 4.7.x capture of any viewer or product app exists under evidence/ or tests/reports/; the closest 4.7 frame is orbit-neutral (a game under ?env=neutral)' },
  { want: 'transmission / glass material lab', candidates: ['apps/materials-transmission', 'apps/showcase-material-asset-inspector'], why: 'no 4.7.x frame; orbit-glass covers a canopy only' },
  { want: 'skinned character viewer', candidates: ['apps/character-viewer', 'apps/animation-walk'], why: 'no 4.7.x frame; crown-skinned / ninja-skinned are in-game poses' },
  { want: 'create-aura3d templates (mini-game, racing-starter, falling-blocks-starter, character-controller)', candidates: ['packages/create-aura3d/templates/*'], why: 'templates were never captured at 4.7.x; evidence/live-4xx frames are 4.1-4.2 production hero shots (older, JPEG, other viewport)' },
  { want: 'dedicated particle/VFX showcase', candidates: ['apps/showcase-blockfall-reactor', 'examples/effects-*'], why: 'no 4.7.x frame; drift-vfx and chroma-vfx are in-game particles' },
  { want: 'the released 4.7.10 frames of the four changed games', candidates: ['heatsink', 'aura-links-3d', 'teleoperator', 'splat-rush-port'], why: 'the wave-1 after capture (tag w1c-11022359) kept only decoded luma rows (/tmp/gu47-lanes/state81/w1c/*.decode.txt), not frames; the listed baselines are the live frames of record before the 4.7.10 model swaps, so those four views carry an expectedDelta' },
  { want: 'real-GPU baseline', candidates: [], why: 'every 4.7.x frame is software WebGL2 (SwiftShader); no physical-GPU frame of the same views exists' }
];


/**
 * 5.0-only views. NO extra capture: each frame is harvested from output the acceptance batches already produce
 * (tests/browser/native-examples-catalog.spec.ts screenshots at 1280x720, and PNG attachments of native-*.spec.ts in the
 * Playwright JSON report), so the one visual-compare run is not enlarged. `fallback` names the closest same-scene or
 * same-family frame emitted by the same run, or null when none exists (then the sheet shows the showcase panel alone).
 * `enable` names the real public API (checked against examples/native-capabilities/index.ts, packages/create-aura3d/templates
 * and CHANGELOG 5.0.0).
 */
const SHOWCASE = [
  { id: 'sc-product-neutral', title: 'Premium product viewer (independent studio look)', capability: 'neutral-environment PBR lighting with independent sky, physical material lobes', enable: 'scene().add(looks.preset("product-studio")) in templates/premium-product-viewer (createAuraApp); physical lobes via material.pbr clearcoat/sheen/anisotropy', source: { type: 'examples-catalog', item: 'template:premium-product-viewer' }, fallback: { type: 'examples-catalog', item: 'template:product-viewer', note: 'sibling template without the premium look; not the same scene' } },
  { id: 'sc-character-viewer', title: 'Character viewer template (skinned rig)', capability: 'skinned character in the packed 5.0 template', enable: 'npm create aura3d@latest -- --template character-viewer', source: { type: 'examples-catalog', item: 'template:character-viewer' }, fallback: null },
  { id: 'sc-custom-shader', title: 'material.custom on the shader-graph runtime', capability: 'authored GLSL/WGSL custom material lowered by @aura3d/engine/shader-graph-runtime', enable: 'material.custom({ ... }) from @aura3d/engine; examples/native-capabilities scenario "custom-shader"', source: { type: 'examples-catalog', item: 'capability-example:custom-shader' }, fallback: { type: 'examples-catalog', item: 'capability-example:typed-model', note: 'same typed model with the stock material (no custom shader)' } },
  { id: 'sc-world-text', title: 'World text (extruded text3D)', capability: 'native world text: extruded glyph geometry, ligature/kern and script fallback', enable: 'text3D("AURA3D", { size, depth, material }) from @aura3d/engine', source: { type: 'examples-catalog', item: 'capability-example:world-text' }, fallback: { type: 'examples-catalog', item: 'capability-example:typed-model', note: 'same typed model without the text node' } },
  { id: 'sc-worker-render', title: 'Worker-owned rendering (opt-in)', capability: 'the same typed scene rendered by a dedicated render worker', enable: 'createAuraApp(target, { worker: { createWorker: createWorkerRendererWorker, fallback: "error" } }) with createWorkerRendererWorker from @aura3d/engine/worker', source: { type: 'examples-catalog', item: 'capability-example:worker-render' }, fallback: { type: 'examples-catalog', item: 'capability-example:typed-model', note: 'identical typed scene rendered on the main thread (4.7.10-equivalent default path)' } },
  { id: 'sc-postprocess', title: 'Root color-grade post effect', capability: 'v2 display-stage post effects over the typed scene', enable: 'effects.* builders (for example the color grade used by examples/native-capabilities "postprocess")', source: { type: 'examples-catalog', item: 'capability-example:postprocess' }, fallback: { type: 'examples-catalog', item: 'capability-example:typed-model', note: 'same typed model without the effect' } },
  { id: 'sc-shader-graph', title: 'Shader graph materials on WebGL2', capability: 'shader-graph material variants (baseline vs normal-map graph)', enable: 'shader-graph material lowered through @aura3d/rendering/shader-graph (see tests/browser/native-shader-graph.spec.ts)', source: { type: 'spec-attachment', spec: 'native-shader-graph', names: ['webgl2-graph-normal.png'] }, fallback: { type: 'spec-attachment', spec: 'native-shader-graph', names: ['webgl2-graph-baseline.png'], note: 'the same graph without the normal path' } },
  { id: 'sc-alt-outputs', title: 'Alternative outputs (addons)', capability: 'vector (SVG), outline and stereo outputs of one scene from @aura3d/addons', enable: 'import the spatial/vector/outline/stereo outputs from @aura3d/addons (tests/browser/native-alternative-outputs.spec.ts)', source: { type: 'spec-attachment', spec: 'native-alternative-outputs', names: ['vector-output.png', 'outline-output.png', 'stereo-output.png'] }, fallback: null },
  { id: 'sc-geometry-tools', title: 'Procedural geometry tools (addons)', capability: 'surface/loft/teapot generators and a deformation interaction', enable: '@aura3d/engine/geometry-tools and @aura3d/addons generators (tests/browser/native-geometry-tools.spec.ts)', source: { type: 'spec-attachment', spec: 'native-geometry-tools', names: ['surface.png', 'loft.png', 'teapot.png', 'deformed.png'] }, fallback: null }
];

/** Features that cannot be shown by this run, with the reason. */
const SHOWCASE_NOT_SHOWN = [
  { feature: 'WebGPU backend opt-in (renderer.backend "webgpu" / qualityProfile "experimental-webgpu")', why: 'ACR containers have no GPU adapter; native-gpu-render-compute (webgpu-before / webgpu-after) reports unsupported or software no-data, and a WebGPU frame would equal the WebGL2 frame anyway. If native-gpu emits the two PNG attachments they can be added as a spec-attachment view.' },
  { feature: 'reversed / logarithmic camera depth', why: 'visible only in a far-plane z-fighting scene; native-camera-depth checks numbers, not a presentable frame, and no existing scene shows the difference.' },
  { feature: 'weighted order-independent transparency, clipping planes, per-view velocity/temporal reconstruction', why: 'native-transparency, native-clipping and native-temporal-reconstruction evaluate fixtures on 32x32-class canvases and attach no frames.' },
  { feature: 'Gaussian splats and scalar volumes (experimental)', why: 'native-splats-volume builds numeric fixtures and attaches no frame; there is no example scene.' },
  { feature: 'clustered lights, IES photometric lights, probe grids, voxel GI (experimental)', why: 'native-advanced-lighting only retains a Lambertian calibration card, not a showcase scene.' },
  { feature: 'wide-gamut (display-p3) output', why: 'an sRGB headless capture cannot show it; native-color-output asserts numbers.' },
  { feature: 'selective bloom', why: 'inert on the software-WebGL2 runner (generated-programs-unavailable), unchanged since 4.7.10 and no shipping game requests it.' }
];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function resolveFrame(rel) {
  for (const [name, root] of Object.entries(BASELINE_ROOTS)) {
    const abs = resolve(repo, root, rel);
    if (existsSync(abs)) return { rootName: name, abs, rootDir: resolve(repo, root) };
  }
  return null;
}

function tracked(rootDir, rel) {
  try { execFileSync('git', ['-C', rootDir, 'ls-files', '--error-unmatch', rel], { stdio: 'ignore' }); return true; } catch { return false; }
}

function roundOf(dir) {
  const m = /\/(f48|f49|f50|p7|p9c|p9)(?:-[a-z0-9]+)?\//.exec(`/${dir}/`);
  return m ? ROUND[m[1]] : null;
}

export function buildPlan() {
  const problems = [];
  const views = VIEWS.map(([id, target, dir, categories, motion, note]) => {
    const slug = target.split('--')[0], variant = target.split('--').slice(1).join('--');
    const baselines = {};
    for (const shot of ['settle-25s', 'settle-60s']) {
      const rel = `${EVID}/${dir}/${target}--${shot}.jpg`;
      const hit = resolveFrame(rel);
      if (!hit) { baselines[shot] = null; continue; } // phase 7/9 frames were shot at 60 s only
      baselines[shot] = { root: hit.rootName, path: rel, sha256: sha256(hit.abs), bytes: statSync(hit.abs).size, trackedInGit: tracked(hit.rootDir, rel) };
    }
    const shotsAvailable = Object.keys(baselines).filter((k) => baselines[k]);
    if (!shotsAvailable.length) problems.push(`${id}: no baseline frame under ${EVID}/${dir} (roots: ${Object.keys(BASELINE_ROOTS).join(', ')})`);
    return {
      kind: 'paired', id, target, slug, variant, template: null, categories, motion,
      route: null, query: null, // filled from tests/browser/game-luma-targets.ts by the spec; recorded below for review
      changedIn4710: Object.hasOwn(CHANGED_4710, slug) ? CHANGED_4710[slug] : null,
      expectedDelta: Object.hasOwn(CHANGED_4710, slug) ? `localized change from 4.7.10 content (${CHANGED_4710[slug]}) is expected; the baseline predates it` : 'none from 4.7.10 content',
      note,
      viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
      settle: { ready: 'READY (data-aura3d-ready or LIVE_APPS drawCalls > 0) then target.prepare(page)', shots: shotsAvailable, defaultShots: [baselines['settle-25s'] ? 'settle-25s' : 'settle-60s'], waitSeconds: { 'settle-25s': 25, 'settle-60s': 60 } },
      baselineCapture: roundOf(dir),
      baselineFramesDir: `${EVID}/${dir}`,
      baselines,
      capture: { spec: 'tests/browser/visual-compare-5.0.spec.ts', grep: `@vc:${id}$`, output: `tests/reports/visual-compare-5.0/<run>/frames/${id}.png`, outputShots: baselines['settle-25s'] ? { 'settle-25s': `frames/${id}.png`, 'settle-60s': `frames/${id}--settle-60s.png` } : { 'settle-60s': `frames/${id}.png`, 'settle-25s': `frames/${id}--settle-25s.png` }, primaryShot: baselines['settle-25s'] ? 'settle-25s' : 'settle-60s' }
    };
  });
  return { problems, views };
}

/** route/query come from the single target list, so the plan cannot drift from what the baseline loaded. */
function routesFromTargets() {
  const text = readFileSync(join(repo, 'tests/browser/game-luma-targets.ts'), 'utf8');
  const out = new Map();
  // t("slug", "variant", `/apps/...`) rows, plus each()/map() rows resolved below for the few variants used here.
  for (const m of text.matchAll(/\bt\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g)) out.set(`${m[1]}--${m[2]}`, m[3]);
  return out;
}

const TARGET_URL = {
  'teleoperator--noon': '/apps/showcase-teleoperator/?sky=noon&intro=0',
  'teleoperator--night': '/apps/showcase-teleoperator/?sky=night&intro=0',
  'iron-crown--colosseum-ruins': '/apps/showcase-iron-crown/',
  'aura-links-3d--stAuroras': '/apps/showcase-aura-links-3d/index.html?course=stAuroras',
  'ninja-runner-port--village': '/apps/showcase-ninja-runner-port/?at=100'
};

export function render() {
  const { problems, views } = buildPlan();
  const direct = routesFromTargets();
  for (const v of views) {
    const url = direct.get(v.target) ?? TARGET_URL[v.target];
    if (!url) { problems.push(`${v.id}: no URL for target ${v.target}`); continue; }
    const [route, query = ''] = url.split('?');
    v.route = route; v.query = query ? `?${query}` : '';
  }
  const plan = {
    schema: 'aura3d.visual-compare-plan/1',
    purpose: 'Compare one 5.0 acceptance capture against existing 4.7.x frames of record (4.7.10 was released 2026-11-02). Baselines are never re-captured.',
    from: { release: '4.7.10 (frames of record, see baselineCapture per view)', environment: 'ACR software WebGL2 (SwiftShader), headless Chromium, 1280x720, DPR 1, canvas-only screenshot re-encoded as JPEG quality 0.7 (tests/browser/game-luma-capture.spec.ts, legacy-chromium project of the 4.x ACR path)' },
    to: { release: '5.0.0', environment: 'recorded at capture time in tests/reports/visual-compare-5.0/<run>/environment.json (browser, WebGL renderer, project, candidate commit)' },
    baselineRoots: BASELINE_ROOTS,
    shotNote: 'settle-25s is the default (about 3.5 min per view on the runner); settle-60s is taken 300-700 s after ready on software GL, so animated scenes drift: enable it with VC_SHOTS=25,60 only for static views.',
    views,
    missingBaselines: MISSING,
    showcase: SHOWCASE.map((v) => ({ kind: 'showcase', ...v })),
    showcaseNotShown: SHOWCASE_NOT_SHOWN,
    problems
  };
  return plan;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const plan = render();
  const text = `${JSON.stringify(plan, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const current = existsSync(PLAN_PATH) ? readFileSync(PLAN_PATH, 'utf8') : '';
    if (plan.problems.length || current !== text) {
      for (const p of plan.problems) console.error(`plan problem: ${p}`);
      if (current !== text) console.error('plan.json is stale: rerun build-plan.mjs');
      process.exit(1);
    }
    console.log(`plan.json OK: ${plan.views.length} views, ${plan.views.reduce((n, v) => n + Object.values(v.baselines).filter(Boolean).length, 0)} baseline frames verified`);
  } else {
    writeFileSync(PLAN_PATH, text);
    for (const p of plan.problems) console.error(`plan problem: ${p}`);
    console.log(`wrote ${PLAN_PATH}: ${plan.views.length} views, ${plan.problems.length} problems`);
    if (plan.problems.length) process.exit(1);
  }
}
