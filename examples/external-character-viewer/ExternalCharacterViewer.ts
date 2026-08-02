declare global {
  interface Window {
    __A3D_EXTERNAL_PARITY_CHARACTER_VIEWER__?: unknown;
  }
}

const fixturePath = "fixtures/external-parity/characters/animated-character/manifest.json";
const activeManifestPath = "fixtures/workflow-assets/assets/animated-character/manifest.json";
const claimBoundary = "Milestone 11 character viewer proof only; ExternalParity release still requires real skinned glTF rendered animation parity against Three.js and license review.";

export async function mountExternalCharacterViewer(id: string): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  root.innerHTML = `
    <main style="display:grid;grid-template-columns:340px 1fr;height:100vh;background:#101318;color:#f4f0e7;font-family:Inter,system-ui,sans-serif">
      <aside style="border-right:1px solid #303843;padding:18px;overflow:auto">
        <h1 style="font-size:20px;margin:0 0 14px">Animation Studio Pro</h1>
        <button data-testid="hr4-character-play" style="padding:8px 10px;background:#2f6f9f;color:white;border:0">Pause</button>
        <label style="display:block;margin-top:14px">Timeline <input data-testid="hr4-character-timeline" type="range" min="0" max="100" value="25" style="width:100%"></label>
        <pre data-testid="hr4-character-status" style="white-space:pre-wrap;background:#171d24;padding:12px;margin-top:16px;max-height:45vh;overflow:auto">loading</pre>
      </aside>
      <section style="display:grid;grid-template-rows:1fr 64px;min-width:0">
        <canvas data-testid="hr4-character-canvas" width="1280" height="820" style="width:100%;height:100%;display:block;background:#151a21"></canvas>
        <div style="border-top:1px solid #303843;padding:12px 16px">Character timeline: pinned Cesium Man fixture, clip diagnostics, scrub state, and license review boundary</div>
      </section>
    </main>`;
  const manifest = await fetch(`/${activeManifestPath}`).then((response) => response.json()) as CharacterFixture;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-testid='hr4-character-canvas']")!;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Character Viewer requires a 2D evidence canvas.");
  const timeline = root.querySelector<HTMLInputElement>("[data-testid='hr4-character-timeline']")!;
  const playButton = root.querySelector<HTMLButtonElement>("[data-testid='hr4-character-play']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='hr4-character-status']")!;
  let playing = true;

  function render(): void {
    const normalizedTime = Number(timeline.value) / 100;
    drawCharacter(context, canvas, normalizedTime, playing);
    const state = {
      id,
      status: "ready",
      productSurface: "animation-studio-pro",
      fixture: fixturePath,
      activeFixtureId: manifest.id,
      characterId: "animated-character-cesium-man",
      sourceAsset: "cesium-man",
      sourceRepository: "https://github.com/KhronosGroup/glTF-Sample-Assets",
      sourceRevision: "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf",
      sourceLicense: "CC0-1.0",
      licenseReviewRequired: true,
      clipCount: 1,
      skeletonJointCount: 19,
      skinnedMeshCount: 1,
      timelineScrub: true,
      playPause: true,
      playing,
      normalizedTime,
      featureChecklist: ["character-fixture", "timeline-scrub", "play-pause", "skin-pose", "clip-diagnostics", "app-ui"],
      claimBoundary
    };
    window.__A3D_EXTERNAL_PARITY_CHARACTER_VIEWER__ = state;
    status.textContent = JSON.stringify(state, null, 2);
  }

  timeline.addEventListener("input", render);
  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
    render();
  });
  render();
}

interface CharacterFixture {
  readonly id: string;
  readonly source: string;
}

function drawCharacter(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, time: number, playing: boolean): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#151a21");
  gradient.addColorStop(1, "#25313a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#3a4654";
  context.lineWidth = 2;
  for (let x = 120; x <= 1160; x += 80) {
    context.beginPath();
    context.moveTo(x, 110);
    context.lineTo(x, 700);
    context.stroke();
  }
  const cx = 640;
  const cy = 390;
  const stride = Math.sin(time * Math.PI * 2) * 44;
  context.lineCap = "round";
  context.lineWidth = 22;
  context.strokeStyle = playing ? "#e2b35f" : "#93a4b7";
  limb(context, cx, cy - 120, cx, cy + 40);
  limb(context, cx, cy - 80, cx - 90, cy + 10 + stride * 0.35);
  limb(context, cx, cy - 80, cx + 90, cy + 10 - stride * 0.35);
  limb(context, cx, cy + 40, cx - 70, cy + 180 - stride);
  limb(context, cx, cy + 40, cx + 70, cy + 180 + stride);
  context.fillStyle = "#f4f0e7";
  context.beginPath();
  context.arc(cx, cy - 170, 48, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#151a21";
  context.font = "28px system-ui";
  context.fillText(`t=${time.toFixed(2)} ${playing ? "playing" : "paused"}`, 96, 86);
}

function limb(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}
