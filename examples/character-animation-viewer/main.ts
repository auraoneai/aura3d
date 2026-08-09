import { camera, createAuraApp, game, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "../../src/aura-assets.js";

const characterAsset = assets.showcaseExpressiveRobot;
const clipNames = characterAsset.metadata?.animationClips ?? [];
const initialClip = clipNames.includes("Wave") ? "Wave" : clipNames[0] ?? "";

interface CharacterAnimationViewerState {
  readonly id: "character-animation-viewer";
  readonly status: "loading" | "ready" | "error";
  readonly renderer?: string;
  readonly runtimeBackend?: string;
  readonly assetId?: string;
  readonly assetHash?: string;
  readonly clipNames?: readonly string[];
  readonly activeClip?: string;
  readonly playing?: boolean;
  readonly sampleTime?: number;
  readonly drawCalls?: number;
  readonly litPixels?: number;
  readonly frameCount?: number;
  readonly renderPath?: "createAuraApp-root-skinned-gltf";
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_CHARACTER_ANIMATION_VIEWER__?: CharacterAnimationViewerState;
  }
}

installShell();
void boot().catch((error) => {
  window.__AURA3D_CHARACTER_ANIMATION_VIEWER__ = {
    id: "character-animation-viewer",
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
  const status = document.querySelector<HTMLElement>("[data-testid='character-animation-status']");
  if (status) status.textContent = window.__AURA3D_CHARACTER_ANIMATION_VIEWER__.error ?? "Unknown error";
});

async function boot(): Promise<void> {
  if (!initialClip) throw new Error("The typed expressive robot asset has no declared animation clips.");
  const app = createAuraApp("#character-stage", {
    autoStart: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05080d")
      .camera(camera.perspective({ position: [0, 1.35, 5.4], target: [0, 1.12, 0], fov: 38 }))
      .add(lights.ambient({ intensity: 0.42, color: "#dbeafe" }))
      .add(lights.directional({ position: [6, 10, 8], intensity: 2.5, color: "#fff1d6" }))
      .add(primitives.box({ name: "animation floor", material: material.pbr({ color: "#172131", roughness: 0.9 }) }).position(0, -0.08, 0).scale([5.6, 0.16, 3.2]))
      .add(model(characterAsset, { name: "typed expressive robot", scaleMode: "fit", targetHeight: 2.35, castShadow: false, receiveShadow: false })
        .animate({ clip: initialClip, loop: true, speed: 1 })
        .runtime(game.runtimeNode("animated-character", { tags: ["typed-asset", "skinned", "animation-viewer"] })))
  });
  await app.ready();
  const actor = app.nodes.require("animated-character");
  const clipSelect = document.querySelector<HTMLSelectElement>("[data-testid='character-animation-clip']")!;
  const timeInput = document.querySelector<HTMLInputElement>("[data-testid='character-animation-time']")!;
  const speedInput = document.querySelector<HTMLInputElement>("[data-testid='character-animation-speed']")!;
  const playButton = document.querySelector<HTMLButtonElement>("[data-testid='character-animation-play']")!;
  clipSelect.replaceChildren(...clipNames.map((clip) => new Option(clip, clip, false, clip === initialClip)));
  let activeClip = initialClip;
  let playing = true;
  let sampleTime = 0;
  let frameCount = 0;
  let previousTime = performance.now();

  const applyClip = (captureTime?: number) => {
    actor.play(activeClip, { loop: playing, speed: Number(speedInput.value), ...(captureTime === undefined ? {} : { captureTime }) });
    app.step(1 / 60);
    publish();
  };
  clipSelect.addEventListener("change", () => {
    activeClip = clipSelect.value;
    sampleTime = 0;
    timeInput.value = "0";
    applyClip(0);
  });
  timeInput.addEventListener("input", () => {
    playing = false;
    playButton.textContent = "Play";
    sampleTime = Number(timeInput.value);
    applyClip(sampleTime);
  });
  speedInput.addEventListener("input", () => applyClip(playing ? undefined : sampleTime));
  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
    applyClip(playing ? undefined : sampleTime);
  });

  applyClip(0);
  requestAnimationFrame(loop);
  function loop(now: number) {
    const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1_000));
    previousTime = now;
    if (playing) {
      app.step(delta || 1 / 60);
      sampleTime = (sampleTime + delta * Number(speedInput.value)) % 2;
      timeInput.value = String(sampleTime);
    }
    frameCount += 1;
    if (frameCount % 6 === 0) publish();
    requestAnimationFrame(loop);
  }

  function publish() {
    const diagnostics = app.diagnostics();
    const evidence = actor.importedAssetEvidence();
    const canvas = document.querySelector<HTMLCanvasElement>("#character-stage canvas")!;
    const state: CharacterAnimationViewerState = {
      id: "character-animation-viewer",
      status: "ready",
      renderer: diagnostics.backend,
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      assetId: characterAsset.id,
      assetHash: characterAsset.hash,
      clipNames,
      activeClip: evidence?.activeClip ?? activeClip,
      playing,
      sampleTime: Number(sampleTime.toFixed(3)),
      drawCalls: diagnostics.drawCalls,
      litPixels: countLitPixels(canvas),
      frameCount,
      renderPath: "createAuraApp-root-skinned-gltf"
    };
    window.__AURA3D_CHARACTER_ANIMATION_VIEWER__ = state;
    document.querySelector<HTMLElement>("[data-testid='character-animation-status']")!.textContent = [
      `asset ${state.assetId}`,
      `clip ${state.activeClip}`,
      `root runtime ${state.runtimeBackend}`,
      `draw calls ${state.drawCalls}`,
      `lit pixels ${state.litPixels}`
    ].join("\n");
  }
}

function countLitPixels(canvas: HTMLCanvasElement): number {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) return 0;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let lit = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    if ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0) > 54) lit += 1;
  }
  return lit;
}

function installShell(): void {
  document.head.insertAdjacentHTML("beforeend", `<style>
    html, body, #app { margin: 0; min-height: 100%; background: #090e16; color: #edf5ff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .shell { min-height: 100vh; display: grid; grid-template-rows: minmax(34rem, 1fr) auto; }
    #character-stage { position: relative; min-height: 34rem; }
    #character-stage canvas { width: 100%; height: 100%; display: block; }
    .panel { display: grid; grid-template-columns: minmax(11rem, 0.8fr) minmax(15rem, 1fr) minmax(17rem, 1.2fr); gap: 1rem; padding: 1rem 1.25rem; border-top: 1px solid #263347; background: #111a28; }
    .controls { display: grid; gap: .65rem; align-content: start; }
    label { display: grid; gap: .25rem; color: #b9c8dc; font-size: .8rem; }
    select, input, button { accent-color: #5eead4; }
    button { width: max-content; border: 1px solid #4d6b83; border-radius: .45rem; background: #183047; color: white; padding: .48rem .9rem; }
    pre { margin: 0; white-space: pre-wrap; color: #a7f3d0; font: .78rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
    h1 { margin: 0 0 .35rem; font-size: 1.25rem; } p { margin: 0; color: #9fb0c4; line-height: 1.45; }
    @media (max-width: 760px) { .panel { grid-template-columns: 1fr; } }
  </style>`);
  document.querySelector("#app")!.innerHTML = `<main class="shell">
    <section id="character-stage" aria-label="Aura3D animated character viewport"></section>
    <section class="panel">
      <div><h1>Typed Character Animation</h1><p>A real cataloged skinned GLB rendered and animated through the root <code>createAuraApp</code> API.</p></div>
      <div class="controls">
        <label>Clip<select data-testid="character-animation-clip"></select></label>
        <label>Timeline<input data-testid="character-animation-time" type="range" min="0" max="2" step="0.01" value="0"></label>
        <label>Speed<input data-testid="character-animation-speed" type="range" min="0.25" max="2" step="0.05" value="1"></label>
        <button data-testid="character-animation-play" type="button">Pause</button>
      </div>
      <pre data-testid="character-animation-status">loading typed animated asset…</pre>
    </section>
  </main>`;
}
