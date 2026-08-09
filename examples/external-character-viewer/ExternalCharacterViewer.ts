import { camera, createAuraApp, game, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "../../src/aura-assets.js";

declare global {
  interface Window {
    __A3D_EXTERNAL_PARITY_CHARACTER_VIEWER__?: unknown;
  }
}

const characterAsset = assets.showcaseExpressiveRobot;
const clips = characterAsset.metadata?.animationClips ?? [];
const initialClip = clips.includes("Wave") ? "Wave" : clips[0] ?? "";
const claimBoundary = "Root createAuraApp proof for one exact typed, provenance-backed skinned GLB with timeline capture and clip playback; universal Three.js animation parity is not claimed.";

export async function mountExternalCharacterViewer(id: string): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  const stageId = `${id}-character-stage`;
  root.innerHTML = `
    <main style="display:grid;grid-template-columns:340px 1fr;height:100vh;background:#0b1018;color:#edf5ff;font-family:Inter,system-ui,sans-serif">
      <aside style="border-right:1px solid #28364a;padding:18px;overflow:auto">
        <h1 style="font-size:20px;margin:0 0 8px">Animation Studio Pro</h1>
        <p style="margin:0 0 16px;color:#9fb0c4;line-height:1.45">Typed skinned GLB rendered and animated through the root Aura3D API.</p>
        <label style="display:block;margin-bottom:12px">Clip <select data-testid="hr4-character-clip" style="width:100%;margin-top:5px"></select></label>
        <button data-testid="hr4-character-play" style="padding:8px 10px;background:#2f6f9f;color:white;border:0;border-radius:4px">Pause</button>
        <label style="display:block;margin-top:14px">Timeline <input data-testid="hr4-character-timeline" type="range" min="0" max="2" step="0.01" value="0" style="width:100%"></label>
        <pre data-testid="hr4-character-status" style="white-space:pre-wrap;background:#111a27;padding:12px;margin-top:16px;max-height:52vh;overflow:auto">loading typed robot…</pre>
      </aside>
      <section style="display:grid;grid-template-rows:1fr 64px;min-width:0">
        <div id="${stageId}" style="min-height:0"></div>
        <div style="border-top:1px solid #28364a;padding:12px 16px;color:#aebdd0">Root workflow: typed asset, named clips, play/pause, and deterministic timeline capture</div>
      </section>
    </main>`;

  if (!initialClip) throw new Error("The typed expressive robot has no declared clips.");
  const app = createAuraApp(`#${stageId}`, {
    autoStart: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05080d")
      .camera(camera.perspective({ position: [0, 1.35, 5.4], target: [0, 1.12, 0], fov: 38 }))
      .add(lights.ambient({ intensity: 0.42, color: "#dbeafe" }))
      .add(lights.directional({ position: [6, 10, 8], intensity: 2.5, color: "#fff1d6" }))
      .add(primitives.box({ name: "animation floor", material: material.pbr({ color: "#172131", roughness: 0.9 }) }).position(0, -0.08, 0).scale([5.6, 0.16, 3.2]))
      .add(model(characterAsset, { name: "typed expressive robot", scaleMode: "fit", targetHeight: 2.35 })
        .animate({ clip: initialClip, loop: true, speed: 1 })
        .runtime(game.runtimeNode("external-animated-character", { tags: ["typed-asset", "skinned", "animation-studio"] })))
  });
  await app.ready();
  const actor = app.nodes.require("external-animated-character");
  const canvas = root.querySelector<HTMLCanvasElement>(`#${stageId} canvas`);
  if (!canvas) throw new Error("Animation Studio canvas was not created.");
  canvas.dataset.testid = "hr4-character-canvas";
  canvas.style.cssText = "width:100%;height:100%;display:block";
  const timeline = root.querySelector<HTMLInputElement>("[data-testid='hr4-character-timeline']")!;
  const playButton = root.querySelector<HTMLButtonElement>("[data-testid='hr4-character-play']")!;
  const clipSelect = root.querySelector<HTMLSelectElement>("[data-testid='hr4-character-clip']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='hr4-character-status']")!;
  clipSelect.replaceChildren(...clips.map((clip) => new Option(clip, clip, false, clip === initialClip)));
  let activeClip = initialClip;
  let playing = true;
  let sampleTime = 0;
  let frames = 0;
  let previous = performance.now();

  const applyPose = (captureTime?: number) => {
    actor.play(activeClip, { loop: playing, speed: 1, ...(captureTime === undefined ? {} : { captureTime }) });
    app.step(1 / 60);
    publish();
  };
  timeline.addEventListener("input", () => {
    playing = false;
    playButton.textContent = "Play";
    sampleTime = Number(timeline.value);
    applyPose(sampleTime);
  });
  clipSelect.addEventListener("change", () => {
    activeClip = clipSelect.value;
    sampleTime = 0;
    timeline.value = "0";
    applyPose(0);
  });
  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
    applyPose(playing ? undefined : sampleTime);
  });
  applyPose(0);
  requestAnimationFrame(loop);

  function loop(now: number): void {
    const delta = Math.min(0.05, Math.max(0, (now - previous) / 1_000));
    previous = now;
    if (playing) {
      app.step(delta || 1 / 60);
      sampleTime = (sampleTime + delta) % 2;
      timeline.value = String(sampleTime);
    }
    frames += 1;
    if (frames % 6 === 0) publish();
    requestAnimationFrame(loop);
  }

  function publish(): void {
    const diagnostics = app.diagnostics();
    const evidence = actor.importedAssetEvidence();
    const state = {
      id,
      status: "ready",
      productSurface: "animation-studio-pro",
      renderer: diagnostics.backend,
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      characterId: characterAsset.id,
      assetHash: characterAsset.hash,
      sourceLicense: characterAsset.metadata?.provenance?.license ?? characterAsset.license,
      sourceAuthor: characterAsset.metadata?.provenance?.author ?? characterAsset.author,
      licenseReviewRequired: false,
      clipCount: clips.length,
      clipNames: clips,
      activeClip: evidence?.activeClip ?? activeClip,
      skeletonJointCount: characterAsset.metadata?.skeleton?.jointCount ?? 0,
      skinnedMeshCount: characterAsset.metadata?.skeleton?.skinCount ?? 0,
      timelineScrub: true,
      playPause: true,
      playing,
      normalizedTime: Number((sampleTime / 2).toFixed(4)),
      drawCalls: diagnostics.drawCalls,
      litPixels: countLitPixels(canvas),
      featureChecklist: ["typed-character-asset", "timeline-scrub", "play-pause", "root-skinned-animation", "named-clip-diagnostics", "app-ui"],
      claimBoundary
    };
    window.__A3D_EXTERNAL_PARITY_CHARACTER_VIEWER__ = state;
    status.textContent = JSON.stringify(state, null, 2);
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
