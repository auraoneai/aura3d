type PortfolioExample = {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly tier: "Flagship" | "Product" | "Renderer" | "Runtime" | "Editor" | "Assets";
  readonly summary: string;
  readonly systems: readonly string[];
  readonly proof: string;
  readonly caveat: string;
};

declare global {
  interface Window {
    __GALILEO3D_PORTFOLIO__?: {
      status: "ready";
      examples: number;
      hiddenValidationExamples: readonly string[];
      claimBoundary: string;
    };
  }
}

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
    title: "Showcase World",
    href: "./11-showcase-world/index.html",
    tier: "Flagship",
    summary: "A combined scene using WebGL2 rendering, PBR materials, lights, physics bodies, particles, input metrics, audio state, editor-runtime selection, and a glTF mesh in one browser page.",
    systems: ["WebGL2", "PBR", "Lighting", "Physics", "Particles", "Input", "Audio", "Editor runtime", "glTF"],
    proof: "Browser and visual reports validate ready state, render items, particles, physics bodies, glTF mesh count, and nonblank WebGL pixels.",
    caveat: "Still a bounded showcase slice, not production parity with Three.js or a Unity/Unreal replacement.",
  },
  {
    id: "product-configurator",
    title: "Product Configurator",
    href: "./product-configurator/index.html",
    tier: "Product",
    summary: "Renderer-backed product UI with material variant controls, PBR/unlit render items, pointer interaction, and live diagnostics.",
    systems: ["WebGL2", "PBR materials", "Variant UI", "Pointer input", "Diagnostics"],
    proof: "Product browser tests cover ready state, renderer-backed output, pointer cycling, swatch selection, draw calls, and visual/performance product reports.",
    caveat: "Uses procedural demo assets; commercial glTF product assets remain future work.",
  },
  {
    id: "architecture-viewer",
    title: "Architecture Viewer",
    href: "./architecture-viewer/index.html",
    tier: "Product",
    summary: "Architectural zone viewer with selectable spaces, measurement metadata, PBR floor/zone render items, and frame diagnostics.",
    systems: ["WebGL2", "PBR", "Picking-style interaction", "Measurements", "Diagnostics"],
    proof: "Product browser tests validate zone selection, measurements, draw calls, renderer-backed output, and nonblank WebGL pixels.",
    caveat: "Current scene is procedural massing, not a heavy BIM/glTF production model.",
  },
  {
    id: "game-slice",
    title: "Game Slice",
    href: "./game-slice/index.html",
    tier: "Product",
    summary: "Small playable runtime slice combining renderer, physics, animation, input, particles, and audio state in a single loop.",
    systems: ["WebGL2", "Physics", "Animation mixer", "Particles", "Keyboard/pointer input", "Audio state"],
    proof: "Browser tests validate pointer and keyboard interaction while physics bodies, particles, audio state, and draw calls update.",
    caveat: "This is a compact game loop proof, not a complete game framework or level pipeline.",
  },
  {
    id: "asset-viewer",
    title: "Asset Viewer",
    href: "./asset-viewer/index.html",
    tier: "Assets",
    summary: "Public asset APIs load a real external glTF/GLB model and expose loader metadata plus render-resource creation.",
    systems: ["glTF/GLB", "Asset manager", "Render resources", "Metadata diagnostics"],
    proof: "Browser tests load a pinned Khronos model through the asset viewer and verify public API metadata and render resources.",
    caveat: "Broader drag/drop, material inspection, animation playback, and large corpus UX remain future work.",
  },
  {
    id: "pbr-camera-comparison",
    title: "PBR Camera Comparison",
    href: "./pbr-camera-comparison/index.html",
    tier: "Renderer",
    summary: "Same-page bounded Galileo3D WebGL2 PBR scene next to a Three.js reference scene for claim-bounded visual comparison.",
    systems: ["Perspective camera", "PBR", "Environment approximation", "Three.js reference", "Screenshot diff"],
    proof: "PBR comparison reports retain Galileo/reference/diff screenshots, scene descriptor hash, semantic checks, and claim-boundary exclusions.",
    caveat: "Does not prove production PBR parity, HDR IBL, loader parity, or broad visual superiority.",
  },
  {
    id: "pbr-material-lab",
    title: "PBR Material Lab",
    href: "./pbr-material-lab/index.html",
    tier: "Renderer",
    summary: "Material lab for the current PBR slice, environment-map uniforms, roughness behavior, and bounded BRDF modulation.",
    systems: ["PBR", "Environment texture", "Material matrix", "Diagnostics"],
    proof: "PBR environment validation checks material-lab evidence and known unsupported production-PBR claims.",
    caveat: "HDR IBL, irradiance convolution, calibrated specular prefiltering, and reflection probes remain future work.",
  },
  {
    id: "rendering-large-scene",
    title: "Large Scene Harness",
    href: "./rendering-large-scene/index.html",
    tier: "Renderer",
    summary: "WebGL2 harness for thousands of static meshes and instances through the Galileo3D renderer.",
    systems: ["WebGL2", "Large scene", "Instancing", "Frame diagnostics"],
    proof: "Browser tests validate 5,000 static meshes and 10,000 instances through the renderer path.",
    caveat: "This is a harness, not a production world-streaming system.",
  },
  {
    id: "physics-sandbox",
    title: "Physics Sandbox",
    href: "./physics-sandbox/index.html",
    tier: "Runtime",
    summary: "Interactive renderer-backed physics sandbox with debug layers and live physics diagnostics.",
    systems: ["Physics world", "Rigid bodies", "Debug draw", "WebGL2", "Pointer interaction"],
    proof: "Browser tests validate interactivity, WebGL2 rendering, physics debug lines, and runtime state.",
    caveat: "More constraints, sensors, stress scenes, and production-level tooling are still future work.",
  },
  {
    id: "postprocess-lab",
    title: "Postprocess Lab",
    href: "./postprocess-lab/index.html",
    tier: "Renderer",
    summary: "RenderGraph ordering demo for tone mapping, bloom, and FXAA-style postprocess passes.",
    systems: ["RenderGraph", "Tone mapping", "Bloom", "FXAA", "Readback"],
    proof: "Visual and unit coverage checks ordered postprocess behavior and deterministic readback.",
    caveat: "HDR compositing, depth-aware effects, TAA, SSAO, SSR, and DOF are not claimed.",
  },
  {
    id: "shadow-lab",
    title: "Shadow Lab",
    href: "./shadow-lab/index.html",
    tier: "Renderer",
    summary: "Shadow-pass and cascade metadata lab for current directional shadow ownership and diagnostics.",
    systems: ["Shadow pass", "Directional light", "Cascade metadata", "Debug diagnostics"],
    proof: "Shadow browser/unit/visual tests cover projected shadows, caster handling, and cascade split ownership.",
    caveat: "Production filtering, soft shadows, bias UX, and point/spot shadow maps remain limited or unclaimed.",
  },
  {
    id: "animation-state-machine",
    title: "Animation State Machine",
    href: "./animation-state-machine/index.html",
    tier: "Runtime",
    summary: "Animation runtime page for clips, state transitions, mixer behavior, and visible runtime state.",
    systems: ["Animation mixer", "State machine", "Runtime diagnostics"],
    proof: "Animation unit and browser evidence cover mixer, clips, blend/state behavior, and render integration slices.",
    caveat: "Retargeting, humanoid tooling, and production animation authoring are future work.",
  },
  {
    id: "editor-authored-project",
    title: "Editor-Authored Static Project",
    href: "./editor-authored-project/index.html",
    tier: "Editor",
    summary: "Checked-in exported project produced through editor-runtime workflows and runnable without loading the editor app.",
    systems: ["Editor runtime", "Project serialization", "Static export", "Browser smoke"],
    proof: "Integration and browser tests replay the project operation log and load the exported static runtime.",
    caveat: "This proves a bounded browser-first editor workflow, not a general Unity/Unreal replacement.",
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
    .card h3 { margin: 0; font-size: 1.22rem; letter-spacing: 0; }
    .card p { margin: 0; color: var(--muted); line-height: 1.48; }
    .systems { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .systems span { border: 1px solid #334755; color: #dbe7f0; padding: 0.28rem 0.42rem; font-size: 0.76rem; }
    .proof { color: #d8f5dc !important; }
    .caveat { color: #ffd9aa !important; }
    .open { margin-top: 0.2rem; justify-self: start; text-decoration: none; border: 1px solid var(--cyan); color: var(--text); padding: 0.58rem 0.75rem; font-weight: 800; }
    .open:hover { background: rgba(97,213,255,0.12); }
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
        <p class="eyebrow">Galileo3D Current Capability Portfolio</p>
        <h1>Web 3D Engine Examples</h1>
        <p class="hero-copy">
          This page intentionally hides the old numbered validation slices and surfaces the strongest current examples:
          renderer-backed product demos, PBR comparison scenes, large-scene rendering, physics, assets, editor export,
          and runtime systems. These examples show the current maximum capability without claiming broad Three.js,
          Unity, or Unreal parity.
        </p>
        <div class="claim-strip">
          <span>Current: verified internal web 3D engine slices</span>
          <span>Allowed: bounded WebGL2/PBR and workflow evidence</span>
          <span>Not claimed: production-ready, Unity/Unreal replacement, broad Three.js superiority</span>
        </div>
      </div>
    </section>
    <section class="main">
      <div class="section-head">
        <h2>Portfolio</h2>
        <p>Open these pages first when evaluating what the engine can actually do today.</p>
      </div>
      <div class="grid">
        ${examples.map(renderCard).join("")}
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
  window.__GALILEO3D_PORTFOLIO__ = {
    status: "ready",
    examples: examples.length,
    hiddenValidationExamples,
    claimBoundary: "Portfolio examples are bounded current capability evidence, not production-ready or broad competitor-parity claims.",
  };
}

function renderCard(example: PortfolioExample): string {
  return `
    <article class="card" data-example-id="${example.id}">
      <div class="preview">
        <img src="./portfolio/screenshots/${example.id}.png" alt="${example.title} rendered preview" loading="lazy" decoding="async" />
      </div>
      <div class="body">
        <span class="tier">${example.tier}</span>
        <h3>${example.title}</h3>
        <p>${example.summary}</p>
        <div class="systems">${example.systems.map((system) => `<span>${system}</span>`).join("")}</div>
        <p class="proof">${example.proof}</p>
        <p class="caveat">${example.caveat}</p>
        <a class="open" href="${example.href}">Open Example</a>
      </div>
    </article>
  `;
}

render();
