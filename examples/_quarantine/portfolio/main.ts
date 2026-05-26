type PortfolioExample = {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly tier: "Combined Proof" | "Renderer Proof" | "Runtime Proof" | "Editor Proof" | "Asset Proof";
  readonly summary: string;
  readonly systems: readonly string[];
  readonly proof: string;
  readonly caveat: string;
  readonly screenshotPath?: string;
  readonly knownLimits?: readonly string[];
  readonly visualGate?: {
    readonly status: "blocked-external-parity-visual-quality" | "passed-external-parity-screenshot-audit";
    readonly reportPath: string;
    readonly visualQualityReportPath: string;
    readonly blocker?: string;
  };
};

type LocalReadinessDemo = {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly status: "visual-blocked" | "local-ready" | "achieved" | "external-blocked";
  readonly summary: string;
  readonly proofCommand: string;
  readonly reportPath: string;
  readonly caveat: string;
};

declare global {
  interface Window {
    __AURA3D_PORTFOLIO__?: {
      id: "portfolio";
      status: "ready";
      renderer: "html";
      visualClaim: "bounded-current-capability-example-index";
      knownLimits: readonly string[];
      errors: readonly string[];
      diagnostics: { readonly drawCalls: 0; readonly lastError: null };
      examples: number;
      readinessDemos: readonly {
        readonly id: string;
        readonly status: LocalReadinessDemo["status"];
        readonly reportPath: string;
        readonly proofCommand: string;
      }[];
      hiddenValidationExamples: readonly string[];
      cards: readonly {
        readonly id: string;
        readonly screenshotPath: string;
        readonly knownLimits: readonly string[];
        readonly visualGate: {
          readonly status: "blocked-external-parity-visual-quality" | "passed-external-parity-screenshot-audit";
          readonly reportPath: string;
          readonly visualQualityReportPath: string;
          readonly blocker?: string;
        };
      }[];
      claimBoundary: string;
    };
  }
}

const externalParityScreenshotReportPath = "/tests/reports/external-parity-example-screenshots/manifest.json";
const externalParityVisualQualityReportPath = "/tests/reports/external-parity-visual-quality.json";
const blockedVisualGate = {
  status: "blocked-external-parity-visual-quality",
  reportPath: externalParityScreenshotReportPath,
  visualQualityReportPath: externalParityVisualQualityReportPath,
  blocker: "Current screenshots fail the ExternalParity visual-quality gate and must not be used as PBR, product visual, production rendering, or competitor-parity proof.",
} as const;
const passedScreenshotGate = {
  status: "passed-external-parity-screenshot-audit",
  reportPath: externalParityScreenshotReportPath,
  visualQualityReportPath: externalParityVisualQualityReportPath,
} as const;

const hiddenValidationExamples = [
  "00-basic-triangle",
  "01-basic-scene",
  "02-materials-pbr",
  "03-shadows",
  "04-physics-stack",
  "05-animation-character",
  "06-asset-gltf",
  "07-input-controls",
  "08-audio-spatial",
  "09-editor-runtime",
  "10-particles",
] as const;

const examples: PortfolioExample[] = [
  {
    id: "showcase-world",
    title: "Combined Primitive Scene",
    href: "./11-showcase-world/index.html",
    tier: "Combined Proof",
    summary: "A combined primitive scene using WebGL2 rendering, PBR-ish materials, lights, physics counters, particles, input metrics, audio state, editor-runtime selection, and a tiny glTF mesh.",
    systems: ["WebGL2", "PBR", "Lighting", "Physics", "Particles", "Input", "Audio", "Editor runtime", "glTF"],
    proof: "Browser and visual reports validate ready state, render items, particles, physics bodies, glTF mesh count, and nonblank WebGL pixels.",
    caveat: "This is primitive rendering evidence. It is not a flagship visual demo, not Three.js parity, and not Unity/Unreal for the web.",
  },
  {
    id: "product-configurator",
    title: "ExternalParity Product Configurator",
    href: "./product-configurator/index.html",
    tier: "Renderer Proof",
    summary: "Generated local over-ear headphone glTF with material variants, camera controls, procedural environment lighting, contact-shadow receiver geometry, export state, and diagnostics.",
    systems: ["WebGL2", "Generated glTF", "PBR variants", "Environment lighting", "Contact shadow alternative", "Screenshot export"],
    proof: "The page loads, publishes renderer metrics, and passes the current ExternalParity screenshot-health gate with generated product, lighting, postprocess, and contact-shadow evidence.",
    caveat: "This is still a generated local product fixture. It is not product visual parity, PBR parity, or production commerce output.",
    screenshotPath: "/tests/reports/external-parity-example-screenshots/product-configurator.png",
    visualGate: passedScreenshotGate,
    knownLimits: [
      "Generated local glTF asset, not commercial product art.",
      "Contact shadows are represented by translucent receiver geometry.",
      "Environment lighting is procedural; HDR IBL parity is blocked.",
    ],
  },
  {
    id: "architecture-viewer",
    title: "ExternalParity Architecture Viewer",
    href: "./architecture-viewer/index.html",
    tier: "Renderer Proof",
    summary: "Generated civic-gallery room scene with authored room hierarchy, selectable zones, measurement metadata, orbit/plan/section controls, materials, and contact-shadow decals.",
    systems: ["WebGL2", "Generated room asset", "Room selection", "Measurements", "Camera modes", "Contact shadow alternative"],
    proof: "The page loads, publishes room/material/measurement metrics, passes current screenshot-health gates, and has a regression test for visible orbit/zone camera changes.",
    caveat: "This is still a generated schematic room, not a high-fidelity architecture visualization or CAD/BIM-grade viewer.",
    screenshotPath: "/tests/reports/external-parity-example-screenshots/architecture-viewer.png",
    visualGate: passedScreenshotGate,
    knownLimits: [
      "Generated local civic-gallery fixture, not BIM/IFC import.",
      "Measurements come from authored metadata.",
      "Contact shadows are decal alternatives, not production shadow maps.",
    ],
  },
  {
    id: "game-slice",
    title: "ExternalParity Game Slice",
    href: "./game-slice/index.html",
    tier: "Runtime Proof",
    summary: "Generated local glTF player and arena with physics controller, camera follow, particles, spatial audio state, behavior scripts, objective win/fail loop, and contact-shadow proxy.",
    systems: ["WebGL2", "Generated glTF level", "Character controller", "Camera follow", "Particles", "Spatial audio", "Objective loop"],
    proof: "Runtime controls, objective metrics, generated glTF assets, textured arena surfaces, and the current screenshot-health gate pass.",
    caveat: "Generated block assets and flat staging are not acceptable as Unity, Unreal, or product-quality game rendering evidence.",
    screenshotPath: "/tests/reports/external-parity-example-screenshots/game-slice.png",
    visualGate: passedScreenshotGate,
    knownLimits: [
      "Generated local glTF fixtures, not licensed production art.",
      "Contact-shadow proxy only.",
      "Lit skinning is not claimed.",
    ],
  },
  {
    id: "racing-showcase",
    title: "ExternalParity Racing Showcase",
    href: "./racing-showcase/index.html",
    tier: "Combined Proof",
    summary: "Current-engine procedural sports car and track scene ported from the old racing concepts with metallic paint, carbon fiber, tire tread, HUD telemetry, countdown, checkpoint, lap, and leaderboard evidence.",
    systems: ["WebGL2", "Procedural car", "Generated track", "Seeded textures", "Race telemetry", "Postprocess"],
    proof: "The browser test verifies telemetry, seeded texture evidence, HUD pixels, nonblank WebGL pixels, and the current screenshot-health gate.",
    caveat: "The procedural car and track still need a real art pass before this can count as Unity/Unreal racing-game parity.",
    screenshotPath: "/tests/reports/external-parity-example-screenshots/racing-showcase.png",
    visualGate: passedScreenshotGate,
    knownLimits: [
      "Deterministic local procedural vehicle and track, not commercial vehicle art.",
      "Race telemetry is deterministic browser evidence, not tire/suspension/drivetrain simulation.",
      "Broad Unity/Unreal racing-game parity remains blocked.",
    ],
  },
  {
    id: "asset-viewer",
    title: "glTF Loader Render Proof",
    href: "./asset-viewer/index.html?model=external",
    tier: "Asset Proof",
    summary: "Public asset APIs load glTF/GLB models, create render resources, and submit the loaded scene through the WebGL2 renderer.",
    systems: ["glTF/GLB", "Asset manager", "Render resources", "Metadata diagnostics"],
    proof: "Browser tests load a pinned Khronos model through the asset viewer and verify public API metadata and render resources.",
    caveat: "This is a loader/render proof, not a finished asset viewer. It still needs real inspection tools, thumbnails, animation playback, and broad model-corpus polish.",
  },
  {
    id: "pbr-camera-comparison",
    title: "PBR Camera Comparison",
    href: "./pbr-camera-comparison/index.html",
    tier: "Renderer Proof",
    summary: "Same-page bounded Aura3D WebGL2 PBR scene next to a Three.js reference scene for claim-bounded visual comparison.",
    systems: ["Perspective camera", "PBR", "Environment approximation", "Three.js reference", "Screenshot diff"],
    proof: "PBR comparison reports retain Aura3D/reference/diff screenshots, scene descriptor hash, semantic checks, and claim-boundary exclusions.",
    caveat: "Does not prove production PBR parity, HDR IBL, loader parity, or broad visual superiority.",
  },
  {
    id: "pbr-material-lab",
    title: "PBR Material Lab",
    href: "./pbr-material-lab/index.html",
    tier: "Renderer Proof",
    summary: "Material lab for the current PBR slice, environment-map uniforms, roughness behavior, and bounded BRDF modulation.",
    systems: ["PBR", "Environment texture", "Material matrix", "Diagnostics"],
    proof: "PBR environment validation checks material-lab evidence and known unsupported production-PBR claims.",
    caveat: "HDR IBL, irradiance convolution, calibrated specular prefiltering, and reflection probes remain future work.",
  },
  {
    id: "rendering-large-scene",
    title: "Large Scene Harness",
    href: "./rendering-large-scene/index.html",
    tier: "Renderer Proof",
    summary: "WebGL2 harness for thousands of static meshes and instances through the Aura3D renderer.",
    systems: ["WebGL2", "Large scene", "Instancing", "Frame diagnostics"],
    proof: "Browser tests validate 5,000 static meshes and 10,000 instances through the renderer path.",
    caveat: "This is a harness, not a production world-streaming system.",
  },
  {
    id: "physics-sandbox",
    title: "Physics Sandbox",
    href: "./physics-sandbox/index.html",
    tier: "Runtime Proof",
    summary: "Interactive renderer-backed physics sandbox with debug layers and live physics diagnostics.",
    systems: ["Physics world", "Rigid bodies", "Debug draw", "WebGL2", "Pointer interaction"],
    proof: "Browser tests validate interactivity, WebGL2 rendering, physics debug lines, and runtime state.",
    caveat: "More constraints, sensors, stress scenes, and production-level tooling are still future work.",
  },
  {
    id: "postprocess-lab",
    title: "Postprocess Lab",
    href: "./postprocess-lab/index.html",
    tier: "Renderer Proof",
    summary: "RenderGraph ordering demo for tone mapping, bloom, and FXAA-style postprocess passes.",
    systems: ["RenderGraph", "Tone mapping", "Bloom", "FXAA", "Readback"],
    proof: "Visual and unit coverage checks ordered postprocess behavior and deterministic readback.",
    caveat: "HDR compositing, depth-aware effects, TAA, SSAO, SSR, and DOF are not claimed.",
  },
  {
    id: "shadow-lab",
    title: "Shadow Lab",
    href: "./shadow-lab/index.html",
    tier: "Renderer Proof",
    summary: "Shadow-pass and cascade metadata lab for current directional shadow ownership and diagnostics.",
    systems: ["Shadow pass", "Directional light", "Cascade metadata", "Debug diagnostics"],
    proof: "Shadow browser/unit/visual tests cover projected shadows, caster handling, and cascade split ownership.",
    caveat: "Production filtering, soft shadows, bias UX, and point/spot shadow maps remain limited or unclaimed.",
  },
  {
    id: "animation-state-machine",
    title: "Animation State Machine",
    href: "./animation-state-machine/index.html",
    tier: "Runtime Proof",
    summary: "Animation runtime page for clips, state transitions, mixer behavior, and visible runtime state.",
    systems: ["Animation mixer", "State machine", "Runtime diagnostics"],
    proof: "Animation unit and browser evidence cover mixer, clips, blend/state behavior, and render integration slices.",
    caveat: "Retargeting, humanoid tooling, and production animation authoring are future work.",
  },
  {
    id: "editor-authored-project",
    title: "Editor-Authored Static Project",
    href: "./editor-authored-project/index.html",
    tier: "Editor Proof",
    summary: "Checked-in exported project produced through editor-runtime workflows and runnable without loading the editor app.",
    systems: ["Editor runtime", "Project serialization", "Static export", "Browser smoke"],
    proof: "Integration and browser tests replay the project operation log and load the exported static runtime.",
    caveat: "This proves a bounded browser-first editor workflow, not a general Unity/Unreal replacement.",
  },
];

const featuredExampleIds = new Set(["product-configurator", "architecture-viewer", "game-slice", "racing-showcase"]);
const featuredExamples = examples.filter((example) => featuredExampleIds.has(example.id));

const localReadinessDemos: readonly LocalReadinessDemo[] = [
  {
    id: "product-visual",
    title: "Product Visual Local Proof",
    href: "./product-configurator/index.html",
    status: "local-ready",
    summary: "The live product scene publishes shared ExternalParity preset, generated HDR environment resources, real-scene postprocess readback, directional-shadow evidence, and LOD/product metrics.",
    proofCommand: "pnpm audit:external-parity-product-visual-parity",
    reportPath: "/tests/reports/external-parity-product-visual-parity.json",
    caveat: "Local browser proof now passes the visual-quality gate, but rendered product visual parity still requires real Unity/Unreal same-scene baselines and external reports.",
  },
  {
    id: "pbr",
    title: "PBR Local Proof",
    href: "./material-showroom/index.html",
    status: "local-ready",
    summary: "Material scenes and asset-viewer coverage exercise metallic/roughness, alpha, double-sided, normal/emissive/occlusion, texture transforms, environment response, and extension variants.",
    proofCommand: "pnpm audit:external-parity-pbr-gltf-readiness",
    reportPath: "/tests/reports/external-parity-pbr-gltf-readiness.json",
    caveat: "Local browser proof now passes the visual-quality gate, but full production PBR parity remains blocked by external engine parity and broader material-corpus evidence.",
  },
  {
    id: "hdr-render-target",
    title: "HDR Render-Target Local Proof",
    href: "./hdr-render-target-check/index.html",
    status: "local-ready",
    summary: "The HDR check renders into an HDR-capable target where supported, reads back overbright pixels, and tone maps them into LDR diagnostics.",
    proofCommand: "pnpm audit:external-parity-hdr-render-target-readiness",
    reportPath: "/tests/reports/external-parity-hdr-render-target-readiness.json",
    caveat: "Local HDR render-target checks pass, but production HDR/render-target parity remains blocked by external engine evidence.",
  },
  {
    id: "shadow-map",
    title: "Shadow-Map Local Proof",
    href: "./shadow-lab/index.html",
    status: "local-ready",
    summary: "The shadow lab and flagship scenes publish real directional/cascade/PCF-style shadow-map evidence, caster/receiver counts, and resize/DPR-safe diagnostics.",
    proofCommand: "pnpm audit:external-parity-shadow-map-readiness",
    reportPath: "/tests/reports/external-parity-shadow-map-readiness.json",
    caveat: "Local shadow-map readiness checks pass, but production shadow-map parity remains blocked by external engine evidence and broader scene coverage.",
  },
  {
    id: "postprocess-suite",
    title: "Postprocess Suite Local Proof",
    href: "./postprocess-lab/index.html",
    status: "local-ready",
    summary: "The postprocess lab runs real-scene pixels through tone mapping, exposure, bloom, FXAA, color controls, vignette, sharpening, and other audited pixel effects.",
    proofCommand: "pnpm audit:external-parity-postprocess-suite",
    reportPath: "/tests/reports/external-parity-postprocess-suite.json",
    caveat: "Local postprocess-suite checks pass, but full postprocess-suite parity remains blocked by external engine evidence and broader scene coverage.",
  },
  {
    id: "gltf",
    title: "glTF Parity Guardrail",
    href: "./asset-viewer/index.html?model=external",
    status: "achieved",
    summary: "The glTF loader, material, texture, animation, skinning, morph, compression, and corpus evidence are currently achieved and must stay green.",
    proofCommand: "pnpm audit:external-parity-pbr-gltf-readiness",
    reportPath: "/tests/reports/external-parity-pbr-gltf-readiness.json",
    caveat: "This is achieved today, but any renderer or loader change must preserve it.",
  },
  {
    id: "webgpu",
    title: "WebGPU Claim Boundary",
    href: "./webgpu-capability/index.html",
    status: "achieved",
    summary: "The WebGPU page shows real capability detection, fallback behavior, and explicit compute-claim blocking rather than pretending broad compute parity.",
    proofCommand: "pnpm verify:external-parity-rendering",
    reportPath: "/tests/reports/external-parity-rendering.json",
    caveat: "Broad WebGPU compute is still not claimed unless real hardware compute evidence is added.",
  },
];

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      --bg: #07090c;
      --panel: #101820;
      --line: #263846;
      --text: #f4f7fb;
      --muted: #aebbc7;
      --cyan: #61d5ff;
      --green: #88e0a2;
      --yellow: #ffe08a;
      --pink: #ff7eb6;
      --orange: #ffb067;
    }
    * { box-sizing: border-box; }
    html, body, #app { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { min-width: 320px; }
    a { color: inherit; }
    .portfolio { min-height: 100vh; }
    .hero { min-height: 54vh; display: grid; align-items: end; padding: 5rem clamp(1rem, 4vw, 4rem) 2.5rem; background:
      linear-gradient(120deg, rgba(97,213,255,0.14), transparent 35%),
      radial-gradient(circle at 88% 18%, rgba(255,126,182,0.18), transparent 28%),
      linear-gradient(180deg, #0b1117, #07090c);
      border-bottom: 1px solid var(--line);
    }
    .hero-inner { max-width: 84rem; display: grid; gap: 1.5rem; }
    .eyebrow { margin: 0; color: var(--cyan); font-weight: 800; font-size: 0.82rem; letter-spacing: 0; text-transform: uppercase; }
    h1 { margin: 0; max-width: 14ch; font-size: clamp(3rem, 8vw, 6.8rem); line-height: 0.92; letter-spacing: 0; }
    .hero-copy { margin: 0; max-width: 56rem; color: var(--muted); font-size: 1.08rem; line-height: 1.65; }
    .claim-strip { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 0.5rem; }
    .claim-strip span { border: 1px solid var(--line); background: rgba(16,24,32,0.74); padding: 0.55rem 0.7rem; font-size: 0.86rem; color: #dce6ef; }
    .main { padding: 2rem clamp(1rem, 4vw, 4rem) 4rem; display: grid; gap: 1.5rem; }
    .section-head { max-width: 84rem; display: grid; gap: 0.45rem; }
    .section-head h2 { margin: 0; font-size: 1.55rem; letter-spacing: 0; }
    .section-head p { margin: 0; color: var(--muted); line-height: 1.55; }
    .grid { max-width: 92rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); gap: 1rem; }
    .card { border: 1px solid var(--line); background: var(--panel); border-radius: 6px; overflow: hidden; display: grid; min-height: 26rem; }
    .preview { height: 10.5rem; background: #030609; border-bottom: 1px solid var(--line); position: relative; overflow: hidden; }
    .preview img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: center; background: #030609; }
    .preview::after { content: ""; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03); }
    .body { padding: 1rem; display: grid; align-content: start; gap: 0.8rem; }
    .tier { width: fit-content; color: #071017; background: var(--green); font-weight: 800; font-size: 0.76rem; padding: 0.28rem 0.45rem; }
    .tier-visual-blocked { background: #ff8a8a; color: #220607; }
    .card h3 { margin: 0; font-size: 1.22rem; letter-spacing: 0; }
    .card p { margin: 0; color: var(--muted); line-height: 1.48; }
    .systems { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .systems span { border: 1px solid #334755; color: #dbe7f0; padding: 0.28rem 0.42rem; font-size: 0.76rem; }
    .proof { color: #d8f5dc !important; }
    .caveat { color: #ffd9aa !important; }
    .open { margin-top: 0.2rem; justify-self: start; text-decoration: none; border: 1px solid var(--cyan); color: var(--text); padding: 0.58rem 0.75rem; font-weight: 800; }
    .open:hover { background: rgba(97,213,255,0.12); }
    .readiness-grid { max-width: 92rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 0.85rem; }
    .readiness-card { border: 1px solid var(--line); background: #0c131a; border-radius: 6px; padding: 1rem; display: grid; align-content: start; gap: 0.75rem; min-height: 19rem; }
    .readiness-card h3 { margin: 0; font-size: 1.05rem; letter-spacing: 0; }
    .readiness-card p { margin: 0; color: var(--muted); line-height: 1.48; }
    .status { width: fit-content; font-weight: 800; font-size: 0.72rem; padding: 0.3rem 0.45rem; border: 1px solid var(--line); color: #f6fbff; }
    .status-local-ready { border-color: var(--yellow); color: var(--yellow); }
    .status-achieved { border-color: var(--green); color: var(--green); }
    .status-external-blocked { border-color: var(--orange); color: var(--orange); }
    .status-visual-blocked { border-color: #ff8a8a; color: #ffb6b6; background: rgba(255,138,138,0.08); }
    .command { font: 0.76rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #bfe8ff; overflow-wrap: anywhere; }
    .report { color: #c7e6ff !important; overflow-wrap: anywhere; }
    .retired { max-width: 92rem; border: 1px solid #4a3640; background: #171115; padding: 1rem; color: #f0c8d4; line-height: 1.55; }
    @media (max-width: 720px) {
      .hero { min-height: auto; padding-top: 3rem; }
      h1 { font-size: 3.2rem; }
      .grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.append(style);
}

function render(): void {
  installStyles();
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const main = document.createElement("main");
  main.className = "portfolio";
  main.innerHTML = `
    <section class="hero">
      <div class="hero-inner">
        <p class="eyebrow">Aura3D ExternalParity Flagship Evidence</p>
        <h1>ExternalParity Flagship Demos</h1>
        <p class="hero-copy">
          This page only features the flagship examples with current browser screenshot evidence: product configurator,
          architecture viewer, game slice, and racing showcase. Low-level primitive tutorials remain in the repo, but they are not
          presented here as ExternalParity visual capability.
        </p>
        <div class="claim-strip">
          <span>Current: four screenshot-backed flagship slices</span>
          <span>Allowed: bounded WebGL2/glTF/runtime evidence</span>
          <span>Not true yet: production-ready, Unity/Unreal replacement, broad Three.js superiority</span>
        </div>
      </div>
    </section>
    <section class="main">
      <div class="section-head">
        <h2>Flagship Screenshots</h2>
        <p>Open these pages first when evaluating ExternalParity example visuals. Each card points at the screenshot path generated by the ExternalParity browser audit.</p>
      </div>
      <div class="grid">
          ${featuredExamples.map(renderCard).join("")}
      </div>
      <div class="section-head">
        <h2>Local Renderer Proofs</h2>
        <p>
          These are the pages to open when checking the renderer work directly. They are local implementation evidence, not full
          Unity/Unreal-certified parity unless the card says achieved.
        </p>
      </div>
      <div class="readiness-grid">
          ${localReadinessDemos.map(renderReadinessCard).join("")}
      </div>
      <div class="section-head">
        <h2>Retired From The Portfolio</h2>
        <p class="retired">
          The old numbered validation examples ${hiddenValidationExamples.map((id) => `<code>${id}</code>`).join(", ")}
          are no longer presented as the public examples portfolio. They remain in the repository only as low-level
          verification fixtures until the corresponding PRD and trace rows are migrated to stronger product/lab evidence.
        </p>
      </div>
    </section>
  `;
  root.append(main);
  window.__AURA3D_PORTFOLIO__ = {
    id: "portfolio",
    status: "ready",
    renderer: "html",
    visualClaim: "bounded-current-capability-example-index",
    knownLimits: [
      "The portfolio is an index of current capability evidence, not proof of production readiness or broad competitor superiority.",
      "The featured visual examples pass the automated screenshot-health gate but must not be used as production-quality or competitor-parity proof.",
      "Each linked example must carry its own known limits and browser evidence.",
    ],
    errors: [],
    diagnostics: { drawCalls: 0, lastError: null },
    examples: featuredExamples.length,
    readinessDemos: localReadinessDemos.map((demo) => ({
      id: demo.id,
      status: demo.status,
      reportPath: demo.reportPath,
      proofCommand: demo.proofCommand,
    })),
    hiddenValidationExamples,
    cards: featuredExamples.map((example) => ({
      id: example.id,
      screenshotPath: example.screenshotPath ?? `./portfolio/screenshots/${example.id}.png`,
      knownLimits: example.knownLimits ?? [example.caveat],
      visualGate: example.visualGate ?? blockedVisualGate,
    })),
    claimBoundary: "Portfolio examples are bounded current capability evidence, not production-ready or broad competitor-parity claims.",
  };
}

function renderCard(example: PortfolioExample): string {
  const visualGate = example.visualGate ?? blockedVisualGate;
  const tierClass = "tier";
  return `
    <article class="card" data-example-id="${example.id}">
      <div class="preview">
        <img src="${example.screenshotPath ?? `./portfolio/screenshots/${example.id}.png`}" alt="${example.title} rendered preview" loading="lazy" decoding="async" />
      </div>
      <div class="body">
        <span class="${tierClass}">${example.tier}</span>
        <h3>${example.title}</h3>
        <p>${example.summary}</p>
        <div class="systems">${example.systems.map((system) => `<span>${system}</span>`).join("")}</div>
        <p class="proof">${example.proof}</p>
        <p class="caveat">${visualGate.status}${visualGate.blocker ? `: ${visualGate.blocker}` : ""}</p>
        <p class="caveat">${example.caveat}</p>
        <a class="open" href="${example.href}">Open Example</a>
      </div>
    </article>
  `;
}

function renderReadinessCard(demo: LocalReadinessDemo): string {
  return `
    <article class="readiness-card" data-readiness-id="${demo.id}">
      <span class="status status-${demo.status}">${demo.status}</span>
      <h3>${demo.title}</h3>
      <p>${demo.summary}</p>
      <p class="command">${demo.proofCommand}</p>
      <p class="report">${demo.reportPath}</p>
      <p class="caveat">${demo.caveat}</p>
      <a class="open" href="${demo.href}">Open Live Proof</a>
    </article>
  `;
}

render();
