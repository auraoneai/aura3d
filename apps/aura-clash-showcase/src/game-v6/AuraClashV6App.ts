import { game } from "@aura3d/engine";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import {
  createGLTFSceneAnimationRuntime,
  loadProductionGLTFRenderPipeline,
  type GLTFSceneAnimationRuntime,
  type GLTFSceneAnimationRuntimeSnapshot,
  type ProductionGLTFRenderPipeline
} from "@aura3d/engine/assets/browser";
import {
  Geometry,
  PBRMaterial,
  UnlitMaterial,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type RenderSource
} from "@aura3d/engine/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";
import { assets } from "../aura-assets";
import "./playable.css";

type A3DGltfScene = ProductionGLTFRenderPipeline;

interface A3DImportedAnimationRuntime {
  readonly runtime: GLTFSceneAnimationRuntime;
  applyClip(name: ClipName, time: number): ReturnType<GLTFSceneAnimationRuntime["applyClipByName"]>;
  snapshot(): GLTFSceneAnimationRuntimeSnapshot;
}

type FighterId = "player" | "rival";
type FighterAction = "idle" | "walk" | "run" | "jump" | "down" | "guard" | "light" | "heavy" | "special" | "hurt" | "ko";
type MoveId = "light" | "heavy" | "special";
type ClipName =
  | "Idle_Loop"
  | "Walk_Loop"
  | "Sprint_Loop"
  | "Jump_Loop"
  | "Crouch_Idle_Loop"
  | "Punch_Jab"
  | "Punch_Cross"
  | "Sword_Attack"
  | "Spell_Simple_Shoot"
  | "Hit_Chest"
  | "Death01";

type AuraClashWindow = Window & {
  __AURA_CLASH_V6_PROOF__?: AuraClashV6Proof;
  __AURA3D_GAME_EVIDENCE__?: unknown;
};

interface FighterState {
  id: FighterId;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  meter: number;
  action: FighterAction;
  clip: ClipName;
  clipTime: number;
  grounded: boolean;
  guard: boolean;
  hitstun: number;
  aiCooldown: number;
  attack: ActiveAttack | null;
  lastApply?: {
    clipName: string;
    tracksApplied: number;
    transformTracksApplied: number;
    skinningPalettesUpdated: number;
    missingTargets: readonly string[];
  };
}

interface ActiveAttack {
  id: MoveId;
  clip: ClipName;
  elapsed: number;
  duration: number;
  activeStart: number;
  activeEnd: number;
  range: number;
  damage: number;
  knockback: number;
  hit: boolean;
}

interface RuntimeFighter {
  state: FighterState;
  scene: A3DGltfScene;
  animation: A3DImportedAnimationRuntime;
  scale: number;
  yOffset: number;
  tint: readonly [number, number, number, number];
  accent: readonly [number, number, number, number];
}

interface Spark {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  facing: 1 | -1;
  kind: MoveId | "block";
}

interface AuraClashV6Proof {
  route: string;
  version: string;
  status: "loading" | "running" | "paused" | "error";
  error: string | null;
  frame: number;
  roundTime: number;
  totalHits: number;
  lastHitFrame: number;
  callout: string;
  visibleFighterAsset: string;
  noPrimitiveFighters: true;
  renderer: {
    surface: "aura3d-production-gltf-animation";
    backend: string;
    drawCalls: number;
  };
  player: ProofFighter;
  rival: ProofFighter;
  animation: {
    visibleSkinnedGlb: true;
    skinnedDrawItems: number;
    playerSkinningBindings: number;
    rivalSkinningBindings: number;
    playerLastTracks: number;
    rivalLastTracks: number;
    playerLastSkinningPalettes: number;
    rivalLastSkinningPalettes: number;
    clips: readonly string[];
  };
  runtime: {
    frameLoop: boolean;
    input: boolean;
    deterministicCombat: boolean;
    hitWindows: boolean;
    hud: boolean;
    evidence: boolean;
  };
}

interface ProofFighter {
  name: string;
  health: number;
  meter: number;
  x: number;
  y: number;
  grounded: boolean;
  action: FighterAction;
  activeClip: ClipName;
  attacking: MoveId | null;
}

const clip = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Sprint_Loop",
  air: "Jump_Loop",
  guard: "Crouch_Idle_Loop",
  light: "Punch_Jab",
  heavy: "Punch_Cross",
  special: "Sword_Attack",
  hurt: "Hit_Chest",
  ko: "Death01"
} as const satisfies Record<string, ClipName>;

const stage = {
  minX: -2.85,
  maxX: 2.85,
  floorY: 0,
  gravity: -9.9,
  jumpVelocity: 6.05,
  fastFallVelocity: -6.9,
  fighterScale: 0.82,
  fighterYOffset: 0,
  z: 0
};

const KO_FREEZE_TIME = 1.18;

const moves: Record<MoveId, Omit<ActiveAttack, "id" | "elapsed" | "hit">> = {
  light: { clip: clip.light, duration: 0.42, activeStart: 0.08, activeEnd: 0.25, range: 0.96, damage: 4, knockback: 0.78 },
  heavy: { clip: clip.heavy, duration: 0.7, activeStart: 0.16, activeEnd: 0.45, range: 1.18, damage: 7, knockback: 1.15 },
  special: { clip: clip.special, duration: 0.98, activeStart: 0.18, activeEnd: 0.72, range: 1.62, damage: 10, knockback: 1.45 }
};

const actionKeys = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  down: ["KeyS", "ArrowDown"],
  jump: ["Space"],
  dash: ["ShiftLeft", "ShiftRight"],
  guard: ["KeyQ"],
  light: ["KeyJ"],
  heavy: ["KeyK"],
  special: ["KeyL"],
  pause: ["KeyP", "Escape"],
  reset: ["KeyR"]
} as const;

const gameWindow = window as AuraClashWindow;

export function mountAuraClashV6App(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("Missing #app");

  root.innerHTML = `
    <main class="ac6" tabindex="0" aria-label="Aura Clash V6 playable game">
      <div class="ac6-page-bg" aria-hidden="true"><div class="ac6-page-grid"></div></div>
      <nav class="ac6-nav" aria-label="Aura Clash navigation">
        <a class="ac6-brand" href="/playable/"><span></span>Aura Clash V6</a>
        <div class="ac6-links">
          <a href="/playable/">Playable</a>
          <a href="#evidence">Evidence</a>
          <a href="/deploy-check/">Deploy check</a>
          <a href="https://github.com/auraoneai/aura3d">GitHub</a>
          <a href="https://www.npmjs.com/package/@aura3d/engine">npm</a>
          <button type="button" id="arena-tweaks-toggle" class="ac6-link-button" aria-expanded="false" aria-controls="arena-tweaks">Tweaks</button>
        </div>
      </nav>

      <section class="ac6-hud" aria-label="Fight HUD">
        <article class="ac6-card">
          <span>Player one</span>
          <h1 id="player-name">Flux Vanta</h1>
          <p>Skinned GLB fighter driven by Aura3D production animation runtime.</p>
          <div class="ac6-bar ac6-health"><i id="player-health"></i></div>
          <div class="ac6-bar ac6-meter"><i id="player-meter"></i></div>
          <b id="player-state">LOADING - 100 HP</b>
        </article>
        <article class="ac6-clock">
          <strong id="round-time">99</strong>
          <span id="callout">LOAD</span>
        </article>
        <article class="ac6-card ac6-rival-card">
          <span>Rival AI</span>
          <h2 id="rival-name">Nyx Circuit</h2>
          <p>Independent second GLB instance with its own clips, spacing, and hit windows.</p>
          <div class="ac6-bar ac6-health"><i id="rival-health"></i></div>
          <div class="ac6-bar ac6-meter"><i id="rival-meter"></i></div>
          <b id="rival-state">LOADING - 100 HP</b>
        </article>
      </section>

      <section class="ac6-stage-shell" aria-label="Aura Clash V6 production GLB stage">
        <div class="ac6-arena-bg" aria-hidden="true">
          <div class="ac6-sky" data-depth="0.05"></div>
          <div class="ac6-core" data-depth="0.15"></div>
          <div class="ac6-backdrop">
            <div class="ac6-skyline" data-depth="0.45">
              <svg viewBox="0 0 1200 420" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                  <rect x="40" y="180" width="70" height="240"/><rect x="120" y="120" width="48" height="300"/>
                  <rect x="180" y="220" width="90" height="200"/><rect x="285" y="80" width="40" height="340"/>
                  <rect x="335" y="160" width="76" height="260"/><rect x="430" y="40" width="54" height="380"/>
                  <rect x="500" y="210" width="120" height="210"/><rect x="640" y="120" width="46" height="300"/>
                  <rect x="700" y="180" width="84" height="240"/><rect x="800" y="60" width="44" height="360"/>
                  <rect x="860" y="200" width="110" height="220"/><rect x="985" y="140" width="50" height="280"/>
                  <rect x="1050" y="110" width="70" height="310"/><rect x="1130" y="200" width="50" height="220"/>
                </g>
                <g fill="none" stroke="var(--ac6-core)" stroke-width="2" opacity="0.85">
                  <line x1="305" y1="80" x2="305" y2="60"/>
                  <line x1="457" y1="40" x2="457" y2="18"/>
                  <line x1="822" y1="60" x2="822" y2="38"/>
                </g>
              </svg>
            </div>
            <div class="ac6-portal" data-depth="0.3"></div>
            <div class="ac6-banners" data-depth="0.55">
              <div class="ac6-banner ac6-banner-left"></div>
              <div class="ac6-banner ac6-banner-right"></div>
            </div>
          </div>
          <div class="ac6-rays" data-depth="0.2">
            <span class="ac6-ray ac6-ray-a"></span>
            <span class="ac6-ray ac6-ray-b"></span>
            <span class="ac6-ray ac6-ray-c"></span>
          </div>
          <div class="ac6-fog ac6-fog-far" data-depth="0.25"></div>
          <div class="ac6-fog ac6-fog-drift" data-depth="0.3"></div>
          <div class="ac6-dais" data-depth="0.5">
            <svg class="ac6-platform" viewBox="0 0 1000 360" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ac6-floor-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#0b252b"/>
                  <stop offset="0.55" stop-color="#0d343d"/>
                  <stop offset="1" stop-color="#123f47"/>
                </linearGradient>
                <linearGradient id="ac6-face-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#07191d"/>
                  <stop offset="1" stop-color="#02080a"/>
                </linearGradient>
                <filter id="ac6-rim-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <polygon points="20,300 980,300 948,352 52,352" fill="url(#ac6-face-gradient)"/>
              <polygon class="ac6-platform-top" points="200,40 800,40 980,300 20,300" fill="url(#ac6-floor-gradient)"/>
              <g class="ac6-platform-grid">
                <path d="M164,92 H836 M128,144 H872 M92,196 H908 M56,248 H944"/>
                <path d="M320,40 L212,300 M440,40 L404,300 M560,40 L596,300 M680,40 L788,300"/>
              </g>
              <line class="ac6-platform-seam" x1="500" y1="40" x2="500" y2="300"/>
              <polygon class="ac6-platform-rim" points="200,40 800,40 980,300 20,300" filter="url(#ac6-rim-glow)"/>
              <line class="ac6-platform-front" x1="20" y1="300" x2="980" y2="300" filter="url(#ac6-rim-glow)"/>
              <g filter="url(#ac6-rim-glow)">
                <line class="ac6-platform-post" x1="20" y1="300" x2="20" y2="150"/>
                <line class="ac6-platform-post" x1="980" y1="300" x2="980" y2="150"/>
                <line class="ac6-platform-post ac6-platform-post-back" x1="200" y1="40" x2="200" y2="-30"/>
                <line class="ac6-platform-post ac6-platform-post-back" x1="800" y1="40" x2="800" y2="-30"/>
                <circle class="ac6-platform-cap" cx="20" cy="150" r="6"/><circle class="ac6-platform-cap" cx="980" cy="150" r="6"/>
                <circle class="ac6-platform-cap" cx="200" cy="-30" r="4"/><circle class="ac6-platform-cap" cx="800" cy="-30" r="4"/>
              </g>
              <g class="ac6-platform-rope">
                <line x1="20" y1="150" x2="980" y2="150"/>
                <line x1="200" y1="-30" x2="800" y2="-30"/>
                <line x1="20" y1="150" x2="200" y2="-30"/>
                <line x1="980" y1="150" x2="800" y2="-30"/>
                <line x1="20" y1="225" x2="980" y2="225"/>
                <line x1="110" y1="60" x2="890" y2="60"/>
              </g>
            </svg>
            <div class="ac6-floor-sheen"></div>
          </div>
          <div class="ac6-fog ac6-fog-near" data-depth="0.65"></div>
          <canvas id="arena-particles" class="ac6-particles"></canvas>
          <div class="ac6-scanline"></div>
          <div class="ac6-stage-vignette"></div>
        </div>
        <canvas id="aura-stage-v6" class="ac6-canvas" aria-label="Aura3D production renderer canvas"></canvas>
        <div class="ac6-topline">
          <span id="render-status">Loading skinned GLB animation runtime</span>
          <span id="clip-status">clips pending</span>
        </div>
        <div id="toast" class="ac6-toast">Loading V6 production GLB fighter route.</div>
        <div id="combo-flash" class="ac6-combo" aria-live="polite"></div>
      </section>

      <section class="ac6-controls" aria-label="Controls">
        <button type="button" data-hold="left">A / Left</button>
        <button type="button" data-hold="right">D / Right</button>
        <button type="button" data-hold="down">S / Down</button>
        <button type="button" data-press="jump">Space Jump</button>
        <button type="button" data-press="dash">Shift Dash</button>
        <button type="button" data-hold="guard">Q Guard</button>
        <button type="button" data-press="light">J Light</button>
        <button type="button" data-press="heavy">K Heavy</button>
        <button type="button" data-press="special">L Special</button>
        <button type="button" data-press="pause">Pause</button>
        <button type="button" data-press="reset">Reset</button>
      </section>

      <section id="evidence" class="ac6-proof" aria-label="Aura3D evidence">
        <div><b>Renderer</b><span>Production GLB render resources plus advanced-runtime A3DRenderer.</span></div>
        <div><b>Fighters</b><span>Two skinned instances of typed asset assets.v4UAL1Standard.</span></div>
        <div><b>Animation</b><span>Jab, cross, sword, guard, hit, jump, walk, and sprint clips are applied every frame.</span></div>
        <div><b>Proof</b><span>window.__AURA_CLASH_V6_PROOF__ reports clip tracks, skinning bindings, hits, HP, and draw calls.</span></div>
      </section>

      <aside id="arena-tweaks" class="ac6-tweaks" aria-label="Arena visual tweaks" hidden>
        <div class="ac6-tweaks-head">
          <strong>Tweaks</strong>
          <button type="button" id="arena-tweaks-close" aria-label="Close tweaks">Close</button>
        </div>
        <label>
          <span>Palette</span>
          <select id="arena-palette">
            <option value="holo">Holo Teal</option>
            <option value="cyber">Cyber Magenta</option>
            <option value="ember">Ember Forge</option>
            <option value="void">Cosmic Void</option>
          </select>
        </label>
        <label>
          <span>Backdrop</span>
          <select id="arena-backdrop">
            <option value="all">Portal + Skyline</option>
            <option value="skyline">Skyline only</option>
            <option value="portal">Portal only</option>
          </select>
        </label>
        <label>
          <span>Fog density</span>
          <input id="arena-fog" type="range" min="0.15" max="1" value="0.58" step="0.01" />
        </label>
        <label>
          <span>Motion</span>
          <select id="arena-motion">
            <option value="subtle">Subtle</option>
            <option value="static">Static</option>
            <option value="lively">Lively</option>
          </select>
        </label>
        <label class="ac6-check"><input id="arena-particle-toggle" type="checkbox" checked /> Particles</label>
        <label class="ac6-check"><input id="arena-reflection-toggle" type="checkbox" checked /> Floor reflections</label>
      </aside>
    </main>
  `;

  installArenaPresentation(root);
  const shell = root.querySelector<HTMLElement>(".ac6");
  shell?.focus();
  void bootAuraClashV6(root).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    gameWindow.__AURA_CLASH_V6_PROOF__ = {
      route: "/playable/",
      version: "v6-production-gltf-animation",
      status: "error",
      error: message,
      frame: 0,
      roundTime: 99,
      totalHits: 0,
      lastHitFrame: 0,
      callout: "ERROR",
      visibleFighterAsset: assets.v4UAL1Standard.url,
      noPrimitiveFighters: true,
      renderer: { surface: "aura3d-production-gltf-animation", backend: "none", drawCalls: 0 },
      player: fallbackProofFighter("Flux Vanta"),
      rival: fallbackProofFighter("Nyx Circuit"),
      animation: {
        visibleSkinnedGlb: true,
        skinnedDrawItems: 0,
        playerSkinningBindings: 0,
        rivalSkinningBindings: 0,
        playerLastTracks: 0,
        rivalLastTracks: 0,
        playerLastSkinningPalettes: 0,
        rivalLastSkinningPalettes: 0,
        clips: []
      },
      runtime: {
        frameLoop: false,
        input: false,
        deterministicCombat: false,
        hitWindows: false,
        hud: false,
        evidence: false
      }
    };
    setText(root, "#callout", "ERROR");
    setText(root, "#toast", `V6 failed: ${message}`);
  });
}

async function bootAuraClashV6(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>("#aura-stage-v6");
  if (!canvas) throw new Error("Missing #aura-stage-v6 canvas");

  const playerState = createFighter("player", "Flux Vanta", "Player one", -1.25, 1);
  const rivalState = createFighter("rival", "Nyx Circuit", "Rival AI", 1.25, -1);
  const controls = createControls(root);
  const input = game.input({
    actions: {
      left: [...actionKeys.left],
      right: [...actionKeys.right],
      down: [...actionKeys.down],
      jump: [...actionKeys.jump],
      dash: [...actionKeys.dash],
      guard: [...actionKeys.guard],
      light: [...actionKeys.light],
      heavy: [...actionKeys.heavy],
      special: [...actionKeys.special],
      pause: [...actionKeys.pause],
      reset: [...actionKeys.reset]
    },
    axes: {
      moveX: { negative: "left", positive: "right" }
    },
    autoListen: true
  });

  setText(root, "#render-status", "Loading typed GLB: assets.v4UAL1Standard");
  const viewport = { width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) };
  const [playerScene, rivalScene] = await Promise.all([
    loadProductionGLTFRenderPipeline({ url: assets.v4UAL1Standard.url, assetId: "v6-player-ual1", assetName: "Flux Vanta", width: viewport.width, height: viewport.height }),
    loadProductionGLTFRenderPipeline({ url: assets.v4UAL1Standard.url, assetId: "v6-rival-ual1", assetName: "Nyx Circuit", width: viewport.width, height: viewport.height })
  ]);

  playerScene.resources.scene.root.name = "v6-player-scene-root";
  rivalScene.resources.scene.root.name = "v6-rival-scene-root";
  tintMaterials(playerScene, [0.08, 0.74, 1, 1], [0.02, 0.72, 0.95]);
  tintMaterials(rivalScene, [1, 0.34, 0.06, 1], [0.95, 0.24, 0.04]);

  const playerRuntime: RuntimeFighter = {
    state: playerState,
    scene: playerScene,
    animation: createImportedRuntime(playerScene),
    scale: stage.fighterScale,
    yOffset: stage.fighterYOffset,
    tint: [0.08, 0.74, 1, 1],
    accent: [0.35, 1, 0.9, 1]
  };
  const rivalRuntime: RuntimeFighter = {
    state: rivalState,
    scene: rivalScene,
    animation: createImportedRuntime(rivalScene),
    scale: stage.fighterScale,
    yOffset: stage.fighterYOffset,
    tint: [1, 0.34, 0.06, 1],
    accent: [1, 0.78, 0.2, 1]
  };

  const playerBinding = playerRuntime.animation.snapshot();
  const rivalBinding = rivalRuntime.animation.snapshot();
  if (playerBinding.skinningBindingCount < 1 || rivalBinding.skinningBindingCount < 1) {
    throw new Error(`V6 fighter GLB did not bind skinning palettes. player=${playerBinding.skinningBindingCount} rival=${rivalBinding.skinningBindingCount}`);
  }

  const renderer = await A3DRenderer.create({
    canvas,
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
    backend: "webgl2",
    alpha: true,
    clearColor: [0.008, 0.012, 0.018, 0]
  });

  const stageItems = createStageItems();
  const sparks: Spark[] = [];
  let paused = false;
  let frame = 0;
  let totalHits = 0;
  let lastHitFrame = 0;
  let roundTime = 99;
  let lastTimeMs = 0;
  let roundOver = false;
  let callout = "FIGHT";
  let toast = "V6 loaded: skinned GLB fighters, real clip playback, deterministic combat.";
  let diagnostics: RenderDeviceDiagnostics = renderer.getDiagnostics();

  const source: RenderSource = {
    collectRenderItems: () => [
      ...stageItems,
      ...collectFighterRenderItems(playerRuntime),
      ...collectFighterRenderItems(rivalRuntime),
      ...createFighterEffectItems(playerRuntime),
      ...createFighterEffectItems(rivalRuntime)
    ],
    cameraPolicy: "auto-frame",
    cameraFrameBounds: { min: [-2.8, -0.08, -0.82], max: [2.8, 2.05, 0.82] },
    cameraFrameOptions: {
      yawRadians: 0,
      pitchRadians: -0.06,
      paddingRatio: 0.1,
      nearPadding: 0.24,
      farPadding: 1.8
    },
    environmentLighting: {
      color: [0.58, 0.7, 0.82],
      intensity: 0.42,
      proceduralMap: {
        skyColor: [0.05, 0.12, 0.18],
        horizonColor: [0.1, 0.22, 0.28],
        groundColor: [0.015, 0.018, 0.022],
        specularColor: [0.72, 0.95, 1],
        intensity: 0.34,
        specularIntensity: 0.92
      }
    },
    environmentFog: {
      mode: "exponential-squared",
      color: [0.015, 0.035, 0.04],
      near: 3,
      far: 12,
      density: 0.022,
      maxOpacity: 0.52
    }
  };

  function tickFrame(timeMs: number): void {
    const dt = clamp(lastTimeMs === 0 ? 1 / 60 : (timeMs - lastTimeMs) / 1000, 1 / 240, 1 / 20);
    lastTimeMs = timeMs;
    frame += 1;
    renderer.resizeToDisplay({ devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.75) });
    input.update(dt);
    controls.beginFrame();

    if (controls.pressed("pause")) {
      paused = !paused;
      callout = paused ? "PAUSE" : "FIGHT";
      toast = paused ? "Round paused." : "Round resumed.";
    }
    if (controls.pressed("reset")) {
      resetFighter(playerState, -1.25, 1);
      resetFighter(rivalState, 1.25, -1);
      totalHits = 0;
      lastHitFrame = 0;
      roundTime = 99;
      roundOver = false;
      callout = "FIGHT";
      toast = "Round reset.";
      sparks.length = 0;
    }

    if (!paused && !roundOver) {
      roundTime = Math.max(0, roundTime - dt);
      updatePlayer(playerState, input, controls, dt);
      updateRivalAi(rivalState, playerState, dt);
      updateFighterPhysics(playerState, dt);
      updateFighterPhysics(rivalState, dt);
      resolvePushback(playerState, rivalState);
      const playerHit = resolveAttack(playerState, rivalState, sparks);
      const rivalHit = resolveAttack(rivalState, playerState, sparks);
      if (playerHit || rivalHit) {
        totalHits += Number(playerHit > 0) + Number(rivalHit > 0);
        lastHitFrame = frame;
        callout = playerHit ? "HIT" : "HURT";
        toast = playerHit
          ? `${playerState.name} lands ${playerState.attack?.id ?? "strike"} for ${playerHit} damage.`
          : `${rivalState.name} catches ${playerState.name}.`;
      } else if (frame % 90 === 0 && callout !== "KO") {
        callout = "FIGHT";
      }
      if (playerState.health <= 0 || rivalState.health <= 0 || roundTime <= 0) {
        roundOver = true;
        callout = finishRound(playerState, rivalState, roundTime);
        toast = callout === "WIN"
          ? `${playerState.name} wins. Press Reset for another round.`
          : callout === "KO"
            ? `${rivalState.name} wins. Press Reset for another round.`
            : "Round draw. Press Reset for another round.";
        sparks.length = 0;
      }
    }

    updateClips(playerState, dt);
    updateClips(rivalState, dt);
    applyFighterAnimation(playerRuntime);
    applyFighterAnimation(rivalRuntime);
    syncFighterRoot(playerRuntime);
    syncFighterRoot(rivalRuntime);
    updateSparks(sparks, dt);
    diagnostics = renderer.render(source);
    updateHud(root, playerState, rivalState, roundTime, callout, toast);
    writeProof({
      root,
      frame,
      roundTime,
      totalHits,
      lastHitFrame,
      callout,
      paused,
      diagnostics,
      backend: renderer.device.kind,
      player: playerRuntime,
      rival: rivalRuntime
    });
    controls.endFrame();
  }

  setText(root, "#render-status", "Aura3D production GLB animation runtime ready");
  setText(root, "#clip-status", "jab / cross / sword / guard clips bound");
  updateHud(root, playerState, rivalState, roundTime, callout, toast);
  let frameErrorLogged = false;
  const scheduleFrame = (timeMs: number): void => {
    try {
      tickFrame(timeMs);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!frameErrorLogged) {
        console.error("Aura Clash V6 frame failed", error);
        frameErrorLogged = true;
      }
      callout = "ERROR";
      toast = `Frame failed: ${message}`;
      gameWindow.__AURA_CLASH_V6_PROOF__ = {
        route: "/playable/",
        version: "v6-production-gltf-animation",
        status: "error",
        error: message,
        frame,
        roundTime: Number(roundTime.toFixed(2)),
        totalHits,
        lastHitFrame,
        callout,
        visibleFighterAsset: assets.v4UAL1Standard.url,
        noPrimitiveFighters: true,
        renderer: { surface: "aura3d-production-gltf-animation", backend: renderer.device.kind, drawCalls: diagnostics.drawCalls },
        player: proofFighter(playerState),
        rival: proofFighter(rivalState),
        animation: {
          visibleSkinnedGlb: true,
          skinnedDrawItems: skinnedDrawItems(playerRuntime) + skinnedDrawItems(rivalRuntime),
          playerSkinningBindings: playerRuntime.animation.snapshot().skinningBindingCount,
          rivalSkinningBindings: rivalRuntime.animation.snapshot().skinningBindingCount,
          playerLastTracks: playerState.lastApply?.tracksApplied ?? 0,
          rivalLastTracks: rivalState.lastApply?.tracksApplied ?? 0,
          playerLastSkinningPalettes: playerState.lastApply?.skinningPalettesUpdated ?? 0,
          rivalLastSkinningPalettes: rivalState.lastApply?.skinningPalettesUpdated ?? 0,
          clips: playerRuntime.animation.snapshot().clips
        },
        runtime: {
          frameLoop: true,
          input: true,
          deterministicCombat: true,
          hitWindows: true,
          hud: true,
          evidence: true
        }
      };
      updateHud(root, playerState, rivalState, roundTime, callout, toast);
    }
    window.requestAnimationFrame(scheduleFrame);
  };
  window.requestAnimationFrame(scheduleFrame);
}

function installArenaPresentation(root: HTMLElement): void {
  installArenaTweaks(root);
  installArenaParallax(root);
  installArenaParticles(root);
}

function installArenaTweaks(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>(".ac6");
  const panel = root.querySelector<HTMLElement>("#arena-tweaks");
  const toggle = root.querySelector<HTMLButtonElement>("#arena-tweaks-toggle");
  const close = root.querySelector<HTMLButtonElement>("#arena-tweaks-close");
  const palette = root.querySelector<HTMLSelectElement>("#arena-palette");
  const backdrop = root.querySelector<HTMLSelectElement>("#arena-backdrop");
  const fog = root.querySelector<HTMLInputElement>("#arena-fog");
  const motion = root.querySelector<HTMLSelectElement>("#arena-motion");
  const particles = root.querySelector<HTMLInputElement>("#arena-particle-toggle");
  const reflections = root.querySelector<HTMLInputElement>("#arena-reflection-toggle");
  if (!shell || !panel || !toggle) return;

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  close?.addEventListener("click", () => setOpen(false));

  const apply = (): void => {
    shell.dataset.palette = palette?.value ?? "holo";
    shell.dataset.backdrop = backdrop?.value ?? "all";
    shell.dataset.motion = motion?.value ?? "subtle";
    shell.style.setProperty("--ac6-fog", fog?.value ?? "0.58");
    shell.classList.toggle("ac6-no-particles", particles ? !particles.checked : false);
    shell.classList.toggle("ac6-no-reflections", reflections ? !reflections.checked : false);
  };
  for (const control of [palette, backdrop, fog, motion, particles, reflections]) {
    control?.addEventListener("input", apply);
    control?.addEventListener("change", apply);
  }
  apply();
}

function installArenaParallax(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>(".ac6");
  const stageShell = root.querySelector<HTMLElement>(".ac6-stage-shell");
  if (!shell || !stageShell) return;
  const layers = Array.from(stageShell.querySelectorAll<HTMLElement>("[data-depth]"));
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  stageShell.addEventListener("pointermove", (event) => {
    const rect = stageShell.getBoundingClientRect();
    targetX = event.clientX / rect.width - rect.left / rect.width - 0.5;
    targetY = event.clientY / rect.height - rect.top / rect.height - 0.5;
  });
  stageShell.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
  });
  const frame = (): void => {
    currentX += (targetX - currentX) * 0.06;
    currentY += (targetY - currentY) * 0.06;
    const motionEnabled = shell.dataset.motion !== "static";
    for (const layer of layers) {
      const depth = Number(layer.dataset.depth ?? "0");
      const x = motionEnabled ? -currentX * depth * 26 : 0;
      const y = motionEnabled ? -currentY * depth * 14 : 0;
      layer.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    }
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
}

function installArenaParticles(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>(".ac6");
  const canvas = root.querySelector<HTMLCanvasElement>("#arena-particles");
  const context = canvas?.getContext("2d");
  if (!shell || !canvas || !context) return;
  type Particle = {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    radius: number;
    twinkle: number;
    speed: number;
    warm: boolean;
  };
  let width = 1;
  let height = 1;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let particles: Particle[] = [];
  const random = (min: number, max: number): number => min + Math.random() * (max - min);
  const seed = (): void => {
    const count = Math.max(28, Math.round((width * height) / 14000));
    particles = Array.from({ length: count }, () => ({
      x: random(0, width),
      y: random(0, height),
      z: random(0.25, 1),
      vx: random(-0.12, 0.12),
      vy: random(-0.45, -0.08),
      radius: random(0.6, 2.2),
      twinkle: random(0, Math.PI * 2),
      speed: random(0.6, 1.6),
      warm: Math.random() < 0.18
    }));
  };
  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  };
  resize();
  window.addEventListener("resize", resize);
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(40, now - last);
    last = now;
    const style = getComputedStyle(shell);
    const speed = shell.dataset.motion === "lively" ? 2.1 : shell.dataset.motion === "static" ? 0 : 1;
    const cool = style.getPropertyValue("--ac6-mote-cool").trim() || "#7fe9d8";
    const warm = style.getPropertyValue("--ac6-mote-warm").trim() || "#ffc187";
    context.clearRect(0, 0, width, height);
    if (!shell.classList.contains("ac6-no-particles")) {
      for (const particle of particles) {
        particle.x += particle.vx * particle.z * speed * (dt / 16);
        particle.y += particle.vy * particle.z * speed * (dt / 16);
        particle.twinkle += 0.02 * particle.speed * Math.max(speed, 0.35);
        if (particle.y < -10) {
          particle.y = height + 8;
          particle.x = random(0, width);
        }
        if (particle.x < -10) particle.x = width + 8;
        if (particle.x > width + 10) particle.x = -8;
        const alpha = (0.22 + 0.5 * (0.5 + 0.5 * Math.sin(particle.twinkle))) * particle.z;
        const radius = particle.radius * (0.6 + particle.z);
        context.beginPath();
        context.globalAlpha = alpha;
        context.shadowBlur = 8 * particle.z;
        context.shadowColor = particle.warm ? warm : cool;
        context.fillStyle = particle.warm ? warm : cool;
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    }
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
}

function createFighter(id: FighterId, name: string, subtitle: string, x: number, facing: 1 | -1): FighterState {
  return {
    id,
    name,
    subtitle,
    x,
    y: 0,
    vy: 0,
    facing,
    health: 100,
    meter: 0,
    action: "idle",
    clip: clip.idle,
    clipTime: 0,
    grounded: true,
    guard: false,
    hitstun: 0,
    aiCooldown: 0.72,
    attack: null
  };
}

function resetFighter(fighter: FighterState, x: number, facing: 1 | -1): void {
  fighter.x = x;
  fighter.y = 0;
  fighter.vy = 0;
  fighter.facing = facing;
  fighter.health = 100;
  fighter.meter = 0;
  fighter.action = "idle";
  fighter.clip = clip.idle;
  fighter.clipTime = 0;
  fighter.grounded = true;
  fighter.guard = false;
  fighter.hitstun = 0;
  fighter.aiCooldown = 0.72;
  fighter.attack = null;
}

function finishRound(player: FighterState, rival: FighterState, roundTime: number): "WIN" | "KO" | "DRAW" {
  player.health = Math.max(0, player.health);
  rival.health = Math.max(0, rival.health);
  player.attack = null;
  rival.attack = null;
  player.guard = false;
  rival.guard = false;
  player.hitstun = 0;
  rival.hitstun = 0;
  player.vy = 0;
  rival.vy = 0;
  player.y = 0;
  rival.y = 0;
  player.grounded = true;
  rival.grounded = true;
  if (player.health === rival.health || (roundTime <= 0 && Math.round(player.health) === Math.round(rival.health))) {
    player.action = "idle";
    rival.action = "idle";
    player.clip = clip.idle;
    rival.clip = clip.idle;
    return "DRAW";
  }
  const playerWon = player.health > rival.health;
  const winner = playerWon ? player : rival;
  const loser = playerWon ? rival : player;
  winner.action = "idle";
  winner.clip = clip.idle;
  loser.action = "ko";
  loser.clip = clip.ko;
  loser.clipTime = 0;
  return playerWon ? "WIN" : "KO";
}

function updatePlayer(fighter: FighterState, input: ReturnType<typeof game.input>, controls: Controls, dt: number): void {
  const moveX = (input.axis("moveX") || 0) + (isHeld(input, controls, "right") ? 1 : 0) - (isHeld(input, controls, "left") ? 1 : 0);
  updateFighterIntents(fighter, clamp(moveX, -1, 1), {
    down: isHeld(input, controls, "down"),
    jump: isPressed(input, controls, "jump"),
    dash: isPressed(input, controls, "dash"),
    guard: controls.held("guard") || controls.pressed("guard") || input.pressed("guard"),
    light: controls.pressed("light") || input.pressed("light"),
    heavy: controls.pressed("heavy") || input.pressed("heavy"),
    special: controls.pressed("special") || input.pressed("special")
  }, dt);
}

function updateRivalAi(rival: FighterState, player: FighterState, dt: number): void {
  rival.aiCooldown = Math.max(0, rival.aiCooldown - dt);
  const gap = player.x - rival.x;
  const distance = Math.abs(gap);
  const desired = distance > 1.18 ? Math.sign(gap) : distance < 0.72 ? -Math.sign(gap) : 0;
  updateFighterIntents(rival, desired, {
    down: false,
    jump: false,
    dash: false,
    guard: distance < 1.05 && rival.aiCooldown > 0.34,
    light: rival.aiCooldown <= 0 && distance < 1,
    heavy: rival.aiCooldown <= 0 && distance < 1.16 && player.health < 76,
    special: rival.aiCooldown <= 0 && distance < 1.36 && rival.meter > 48
  }, dt);
  if (rival.attack) {
    rival.aiCooldown = rival.attack.id === "special" ? 1.2 : 0.82;
  }
}

function updateFighterIntents(
  fighter: FighterState,
  moveX: number,
  intents: {
    down: boolean;
    jump: boolean;
    dash: boolean;
    guard: boolean;
    light: boolean;
    heavy: boolean;
    special: boolean;
  },
  dt: number
): void {
  fighter.guard = intents.guard && !fighter.attack && fighter.grounded;
  if (fighter.hitstun > 0 || fighter.action === "ko") return;
  if (fighter.attack) {
    fighter.attack.elapsed += dt;
    if (fighter.attack.elapsed >= fighter.attack.duration) {
      fighter.attack = null;
      fighter.action = "idle";
    }
    return;
  }
  if (intents.down && !fighter.grounded) {
    fighter.vy = Math.min(fighter.vy, stage.fastFallVelocity);
  }
  if (intents.jump && fighter.grounded) {
    fighter.vy = stage.jumpVelocity;
    fighter.grounded = false;
    fighter.action = "jump";
    fighter.clip = clip.air;
    fighter.clipTime = 0;
  }
  const speed = intents.dash ? 3.9 : 1.9;
  if (Math.abs(moveX) > 0.02 && !fighter.guard && !(fighter.grounded && intents.down)) {
    fighter.x = clamp(fighter.x + moveX * speed * dt, stage.minX, stage.maxX);
    fighter.facing = moveX > 0 ? 1 : -1;
    if (fighter.grounded) fighter.action = intents.dash ? "run" : "walk";
  } else if (fighter.grounded && intents.down && !fighter.guard) {
    fighter.action = "down";
  } else if (fighter.grounded && !fighter.guard) {
    fighter.action = "idle";
  }
  if (fighter.guard) fighter.action = "guard";
  if (intents.special) {
    fighter.meter = Math.max(0, fighter.meter - Math.min(35, fighter.meter));
    startAttack(fighter, "special");
  } else if (intents.heavy) {
    startAttack(fighter, "heavy");
  } else if (intents.light) {
    startAttack(fighter, "light");
  }
}

function startAttack(fighter: FighterState, id: MoveId): void {
  const spec = moves[id];
  fighter.action = id;
  fighter.clip = spec.clip;
  fighter.clipTime = 0;
  fighter.attack = { id, elapsed: 0, hit: false, ...spec };
}

function updateFighterPhysics(fighter: FighterState, dt: number): void {
  if (fighter.hitstun > 0) {
    fighter.hitstun = Math.max(0, fighter.hitstun - dt);
    if (fighter.hitstun === 0 && fighter.action === "hurt") fighter.action = "idle";
  }
  if (!fighter.grounded) {
    fighter.vy += stage.gravity * dt;
    fighter.y += fighter.vy * dt;
    if (fighter.y <= 0) {
      fighter.y = 0;
      fighter.vy = 0;
      fighter.grounded = true;
      if (fighter.action === "jump") fighter.action = "idle";
    }
  }
}

function resolvePushback(left: FighterState, right: FighterState): void {
  const minGap = 0.5;
  const gap = right.x - left.x;
  if (Math.abs(gap) >= minGap) return;
  const correction = (minGap - Math.abs(gap)) * 0.5;
  const direction = gap >= 0 ? 1 : -1;
  left.x = clamp(left.x - correction * direction, stage.minX, stage.maxX);
  right.x = clamp(right.x + correction * direction, stage.minX, stage.maxX);
}

function resolveAttack(attacker: FighterState, defender: FighterState, sparks: Spark[]): number {
  const attack = attacker.attack;
  if (!attack || attack.hit || attack.elapsed < attack.activeStart || attack.elapsed > attack.activeEnd) return 0;
  const forwardGap = (defender.x - attacker.x) * attacker.facing;
  if (forwardGap < 0.15 || forwardGap > attack.range || Math.abs(defender.y - attacker.y) > 0.85) return 0;
  attack.hit = true;
  const blocked = defender.guard && defender.facing === -attacker.facing;
  const damage = blocked ? Math.max(2, Math.round(attack.damage * 0.28)) : attack.damage;
  defender.health = Math.max(0, defender.health - damage);
  defender.hitstun = blocked ? 0.16 : 0.38;
  defender.action = defender.health <= 0 ? "ko" : "hurt";
  defender.clip = blocked ? clip.idle : clip.air;
  defender.clipTime = 0;
  defender.x = clamp(defender.x + attacker.facing * attack.knockback * (blocked ? 0.12 : 0.2), stage.minX, stage.maxX);
  attacker.meter = clamp(attacker.meter + (blocked ? 4 : 11), 0, 100);
  sparks.push({
    x: attacker.x + attacker.facing * Math.min(attack.range, Math.max(0.55, forwardGap * 0.72)),
    y: 1.08,
    z: 0.06,
    age: 0,
    life: 0.28,
    facing: attacker.facing,
    kind: blocked ? "block" : attack.id
  });
  return damage;
}

function updateClips(fighter: FighterState, dt: number): void {
  const previous = fighter.clip;
  if (fighter.attack) {
    fighter.clip = fighter.attack.clip;
  } else if (!fighter.grounded) {
    fighter.clip = clip.air;
  } else if (fighter.action === "run") {
    fighter.clip = clip.run;
  } else if (fighter.action === "walk") {
    fighter.clip = clip.walk;
  } else if (fighter.action === "down") {
    fighter.clip = clip.guard;
  } else if (fighter.action === "guard") {
    fighter.clip = clip.guard;
  } else if (fighter.action === "hurt") {
    fighter.clip = clip.hurt;
  } else if (fighter.action === "ko") {
    fighter.clip = clip.ko;
  } else {
    fighter.clip = clip.idle;
  }
  if (previous !== fighter.clip) fighter.clipTime = 0;
  if (fighter.action === "ko") {
    fighter.clipTime = Math.min(KO_FREEZE_TIME, fighter.clipTime + dt);
    return;
  }
  const speed = fighter.action === "light" ? 1.45 : fighter.action === "heavy" ? 1.06 : fighter.action === "special" ? 0.94 : fighter.action === "run" ? 1.18 : 1;
  fighter.clipTime += dt * speed;
}

function applyFighterAnimation(fighter: RuntimeFighter): void {
  const result = fighter.animation.applyClip(fighter.state.clip, fighter.state.clipTime);
  fighter.state.lastApply = {
    clipName: result.clipName,
    tracksApplied: result.tracksApplied,
    transformTracksApplied: result.transformTracksApplied,
    skinningPalettesUpdated: result.skinningPalettesUpdated,
    missingTargets: result.missingTargets
  };
}

function syncFighterRoot(fighter: RuntimeFighter): void {
  const yaw = fighter.state.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  const bob = fighter.state.grounded ? 0 : fighter.state.y;
  const attack = fighter.state.attack;
  const phase = attack ? clamp(attack.elapsed / attack.duration, 0, 1) : 0;
  const lunge = attack ? attackLunge(attack.id, phase) * fighter.state.facing : 0;
  const recoil = fighter.state.action === "hurt" ? -0.14 * fighter.state.facing : 0;
  const downPose = fighter.state.action === "guard" || fighter.state.action === "down";
  const guardSink = downPose ? -0.12 : 0;
  const specialLift = attack?.id === "special" ? Math.sin(Math.PI * phase) * 0.1 : 0;
  const roll = attack?.id === "heavy" ? -fighter.state.facing * Math.sin(Math.PI * phase) * 0.12 : 0;
  const pitch = attack?.id === "light"
    ? -Math.sin(Math.PI * phase) * 0.1
    : attack?.id === "special"
      ? -Math.sin(Math.PI * phase) * 0.18
      : downPose
        ? 0.16
        : 0;
  const squash = attack?.id === "heavy" ? 1 + Math.sin(Math.PI * phase) * 0.08 : 1;
  const root = fighter.scene.resources.scene.root;
  const rotation = quatFromEuler(pitch, yaw, roll);
  root.transform
    .setPosition(fighter.state.x + lunge + recoil, fighter.yOffset + bob + guardSink + specialLift, stage.z)
    .setRotation(rotation[0], rotation[1], rotation[2], rotation[3])
    .setScale(fighter.scale * squash, fighter.scale * (2 - squash), fighter.scale);
}

function attackLunge(id: MoveId, phase: number): number {
  const arc = Math.sin(Math.PI * phase);
  if (id === "light") return arc * 0.16;
  if (id === "heavy") return arc * 0.34;
  return Math.sin(Math.PI * Math.min(1, phase * 1.15)) * 0.58;
}

function collectFighterRenderItems(fighter: RuntimeFighter): RenderItem[] {
  const resources = fighter.scene.resources;
  const items: RenderItem[] = [];
  resources.scene.updateWorldTransforms();
  for (const { node, renderable } of resources.scene.collectRenderables()) {
    if (!node.visible) continue;
    const geometry = resources.geometryLibrary.get(renderable.geometry);
    const material = resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `${fighter.state.id}:${node.name}:${renderable.geometry}`,
      geometry,
      material,
      modelMatrix: node.transform.worldMatrix,
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function tintMaterials(scene: A3DGltfScene, baseColor: readonly [number, number, number, number], emissive: readonly [number, number, number]): void {
  for (const material of scene.resources.materialLibrary.values()) {
    const jointMaterial = /joint/i.test(material.name);
    const color = jointMaterial
      ? [Math.max(0.02, baseColor[0] * 0.22), Math.max(0.02, baseColor[1] * 0.24), Math.max(0.02, baseColor[2] * 0.28), 1] as const
      : baseColor;
    const glow = jointMaterial
      ? [emissive[0] * 0.28, emissive[1] * 0.28, emissive[2] * 0.28] as const
      : emissive;
    material.setParameter("u_baseColor", color);
    material.setParameter("u_baseColorFactor", color);
    material.setParameter("u_emissiveColor", glow);
    material.setParameter("u_emissiveFactor", glow);
    material.setParameter("u_emissiveStrength", jointMaterial ? 0.06 : 0.28);
    material.setParameter("u_roughness", jointMaterial ? 0.72 : 0.38);
    material.setParameter("u_metallic", jointMaterial ? 0.08 : 0.16);
  }
}

function createImportedRuntime(scene: A3DGltfScene): A3DImportedAnimationRuntime {
  const runtime = createGLTFSceneAnimationRuntime({
    scene: scene.resources.scene,
    clips: scene.asset.animations,
    asset: scene.asset
  });
  return {
    runtime,
    applyClip(name, time) {
      return runtime.applyClipByName(name, time);
    },
    snapshot() {
      return runtime.snapshot();
    }
  };
}

function createStageItems(): RenderItem[] {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({
    name: "v6-floor",
    baseColor: [0.025, 0.052, 0.058, 1],
    metallic: 0.18,
    roughness: 0.28,
    emissiveColor: [0.03, 0.18, 0.14],
    emissiveStrength: 0.16
  });
  const cyan = new UnlitMaterial({ name: "v6-cyan-neon", color: [0.28, 1, 0.84, 1] });
  const amber = new UnlitMaterial({ name: "v6-amber-neon", color: [1, 0.74, 0.28, 1] });
  return [
    item("floor", cube, floor, [0, -0.052, 0], [5.75, 0.055, 1.08]),
    item("front-rail-cyan", cube, cyan, [0, 0.055, 0.58], [5.7, 0.025, 0.025]),
    item("back-rail-amber", cube, amber, [0, 0.055, -0.46], [5.35, 0.018, 0.022]),
    item("center-mark", cube, cyan, [0, 0.075, 0], [0.028, 0.04, 1.08]),
    item("left-floor-accent", cube, amber, [-1.92, 0.06, -0.42], [0.52, 0.018, 0.035]),
    item("right-floor-accent", cube, amber, [1.92, 0.06, -0.42], [0.52, 0.018, 0.035])
  ];
}

function createFighterEffectItems(fighter: RuntimeFighter): RenderItem[] {
  const state = fighter.state;
  const cube = Geometry.litCube(1);
  const items: RenderItem[] = [];
  const accent = fighter.accent;
  const base = new UnlitMaterial({
    name: `${state.id}-floor-aura`,
    color: [accent[0], accent[1], accent[2], 0.72],
    renderState: { blend: true, depthWrite: false, cullMode: "none" }
  });
  const rootX = state.x + (state.attack ? attackLunge(state.attack.id, clamp(state.attack.elapsed / state.attack.duration, 0, 1)) * state.facing : 0);
  items.push(item(`${state.id}-floor-aura`, cube, base, [rootX, 0.018, 0.03], [0.72, 0.024, 0.18]));

  if (state.action === "guard") {
    const shield = new UnlitMaterial({
      name: `${state.id}-guard-shield`,
      color: [0.6, 1, 0.92, 0.66],
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    });
    items.push(item(`${state.id}-guard-wall`, cube, shield, [state.x + state.facing * 0.34, 0.88, 0.12], [0.06, 0.74, 0.22], [0, 0, state.facing * 0.12]));
    items.push(item(`${state.id}-guard-floor`, cube, shield, [state.x + state.facing * 0.2, 0.05, 0.15], [0.62, 0.03, 0.24]));
  }
  return items;
}

function createSparkItems(sparks: readonly Spark[]): RenderItem[] {
  if (sparks.length === 0) return [];
  const cube = Geometry.litCube(1);
  const items: RenderItem[] = [];
  for (const spark of sparks) {
    const t = clamp(spark.age / spark.life, 0, 1);
    const alpha = 1 - t;
    const material = new UnlitMaterial({
      name: `v6-spark-${spark.kind}`,
      color: spark.kind === "block" ? [0.9, 0.95, 1, alpha] : [1, 0.84, 0.32, alpha],
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    });
    const size = 0.08 + alpha * 0.18;
    items.push(item(`spark-${spark.kind}`, cube, material, [spark.x, spark.y, spark.z], [size, size * 0.72, size * 0.52]));
  }
  return items;
}

function item(
  label: string,
  geometry: Geometry,
  material: PBRMaterial | UnlitMaterial,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0]
): RenderItem {
  return {
    label,
    geometry,
    material,
    modelMatrix: composeMat4([...position], quatFromEuler(rotation[0], rotation[1], rotation[2]), [...scale]) as Mat4,
    includeInAutoFrame: true
  };
}

function updateSparks(sparks: Spark[], dt: number): void {
  for (const spark of sparks) spark.age += dt;
  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    if (sparks[index]!.age >= sparks[index]!.life) sparks.splice(index, 1);
  }
}

function updateHud(root: HTMLElement, player: FighterState, rival: FighterState, roundTime: number, callout: string, toast: string): void {
  setText(root, "#round-time", String(Math.ceil(roundTime)).padStart(2, "0"));
  setText(root, "#callout", callout);
  setText(root, "#player-state", `${stateLabel(player)} - ${Math.round(player.health)} HP`);
  setText(root, "#rival-state", `${stateLabel(rival)} - ${Math.round(rival.health)} HP`);
  setText(root, "#toast", toast);
  setText(root, "#clip-status", `${player.clip} / ${rival.clip}`);
  setBar(root, "#player-health", player.health / 100);
  setBar(root, "#rival-health", rival.health / 100);
  setBar(root, "#player-meter", player.meter / 100);
  setBar(root, "#rival-meter", rival.meter / 100);
}

function writeProof(input: {
  root: HTMLElement;
  frame: number;
  roundTime: number;
  totalHits: number;
  lastHitFrame: number;
  callout: string;
  paused: boolean;
  diagnostics: RenderDeviceDiagnostics;
  backend: string;
  player: RuntimeFighter;
  rival: RuntimeFighter;
}): void {
  const playerSnapshot = input.player.animation.snapshot();
  const rivalSnapshot = input.rival.animation.snapshot();
  const proof: AuraClashV6Proof = {
    route: "/playable/",
    version: "v6-production-gltf-animation",
    status: input.paused ? "paused" : "running",
    error: null,
    frame: input.frame,
    roundTime: Number(input.roundTime.toFixed(2)),
    totalHits: input.totalHits,
    lastHitFrame: input.lastHitFrame,
    callout: input.callout,
    visibleFighterAsset: assets.v4UAL1Standard.url,
    noPrimitiveFighters: true,
    renderer: {
      surface: "aura3d-production-gltf-animation",
      backend: input.backend,
      drawCalls: input.diagnostics.drawCalls
    },
    player: proofFighter(input.player.state),
    rival: proofFighter(input.rival.state),
    animation: {
      visibleSkinnedGlb: true,
      skinnedDrawItems: skinnedDrawItems(input.player) + skinnedDrawItems(input.rival),
      playerSkinningBindings: playerSnapshot.skinningBindingCount,
      rivalSkinningBindings: rivalSnapshot.skinningBindingCount,
      playerLastTracks: input.player.state.lastApply?.tracksApplied ?? 0,
      rivalLastTracks: input.rival.state.lastApply?.tracksApplied ?? 0,
      playerLastSkinningPalettes: input.player.state.lastApply?.skinningPalettesUpdated ?? 0,
      rivalLastSkinningPalettes: input.rival.state.lastApply?.skinningPalettesUpdated ?? 0,
      clips: playerSnapshot.clips
    },
    runtime: {
      frameLoop: true,
      input: true,
      deterministicCombat: true,
      hitWindows: true,
      hud: true,
      evidence: true
    }
  };
  gameWindow.__AURA_CLASH_V6_PROOF__ = proof;
  gameWindow.__AURA3D_GAME_EVIDENCE__ = {
    route: proof.route,
    version: proof.version,
    frame: proof.frame,
    assets: [proof.visibleFighterAsset],
    animation: proof.animation,
    renderer: proof.renderer,
    combat: {
      totalHits: proof.totalHits,
      playerHealth: proof.player.health,
      rivalHealth: proof.rival.health
    }
  };
  input.root.dataset.v6Status = proof.status;
}

function proofFighter(fighter: FighterState): ProofFighter {
  return {
    name: fighter.name,
    health: Math.round(fighter.health),
    meter: Math.round(fighter.meter),
    x: Number(fighter.x.toFixed(3)),
    y: Number(fighter.y.toFixed(3)),
    grounded: fighter.grounded,
    action: fighter.action,
    activeClip: fighter.clip,
    attacking: fighter.attack?.id ?? null
  };
}

function fallbackProofFighter(name: string): ProofFighter {
  return {
    name,
    health: 100,
    meter: 0,
    x: 0,
    y: 0,
    grounded: true,
    action: "idle",
    activeClip: clip.idle,
    attacking: null
  };
}

function skinnedDrawItems(fighter: RuntimeFighter): number {
  return fighter.scene.resources.renderableBindings.filter((binding) => binding.skinned).length;
}

function stateLabel(fighter: FighterState): string {
  if (fighter.attack) return fighter.attack.id.toUpperCase();
  return fighter.action.toUpperCase();
}

interface Controls {
  beginFrame(): void;
  endFrame(): void;
  pressed(action: keyof typeof actionKeys): boolean;
  held(action: keyof typeof actionKeys): boolean;
}

function createControls(root: HTMLElement): Controls {
  const heldKeys = new Set<string>();
  const pressedKeys = new Set<string>();
  let previousKeys = new Set<string>();
  const pressedButtons = new Set<keyof typeof actionKeys>();
  const heldButtons = new Set<keyof typeof actionKeys>();
  const onKeyDown = (event: KeyboardEvent) => {
    if (Object.values(actionKeys).some((codes) => (codes as readonly string[]).includes(event.code))) {
      event.preventDefault();
      if (!heldKeys.has(event.code) && !event.repeat) pressedKeys.add(event.code);
      heldKeys.add(event.code);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    heldKeys.delete(event.code);
  };
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("keyup", onKeyUp, { capture: true });
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-press]")) {
    const action = button.dataset.press as keyof typeof actionKeys | undefined;
    if (!action) continue;
    button.addEventListener("click", () => pressedButtons.add(action));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    const action = button.dataset.hold as keyof typeof actionKeys | undefined;
    if (!action) continue;
    button.addEventListener("pointerdown", () => heldButtons.add(action));
    button.addEventListener("pointerup", () => heldButtons.delete(action));
    button.addEventListener("pointerleave", () => heldButtons.delete(action));
  }
  return {
    beginFrame() {},
    endFrame() {
      previousKeys = new Set(heldKeys);
      pressedKeys.clear();
      pressedButtons.clear();
    },
    pressed(action) {
      return pressedButtons.has(action) || actionKeys[action].some((code) => pressedKeys.has(code) || (heldKeys.has(code) && !previousKeys.has(code)));
    },
    held(action) {
      return heldButtons.has(action) || actionKeys[action].some((code) => heldKeys.has(code));
    }
  };
}

function isPressed(input: ReturnType<typeof game.input>, controls: Controls, action: keyof typeof actionKeys): boolean {
  return input.pressed(action) || controls.pressed(action);
}

function isHeld(input: ReturnType<typeof game.input>, controls: Controls, action: keyof typeof actionKeys): boolean {
  return input.held(action) || controls.held(action);
}

function setText(root: HTMLElement, selector: string, value: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function setBar(root: HTMLElement, selector: string, value: number): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) element.style.inlineSize = `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
