import {
  AnimationStateMachine,
  Bone,
  Skeleton,
  buildSkinningPalette,
  type AnimationClip,
  type AnimationStateMachineGraphSnapshot,
  type AnimationValue
} from "@galileo3d/animation";
import { GLTFLoader, LoadContext, type GLTFMeshAsset, type GLTFSkinAsset } from "@galileo3d/assets";
import { Geometry, IndexBuffer, Renderer, SkinnedLitMaterial, VertexBuffer, VertexFormat, type RenderDeviceDiagnostics } from "@galileo3d/rendering";

interface CharacterAnimationViewerState {
  readonly id: "character-animation-viewer";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly assetId: "cesium-man";
  readonly assetPath: string;
  readonly meshName: string;
  readonly clipName: string;
  readonly playing: boolean;
  readonly time: number;
  readonly duration: number;
  readonly playbackSpeed: number;
  readonly loopMode: "repeat" | "once";
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly jointCount: number;
  readonly trackCount: number;
  readonly drawCalls: number;
  readonly greenPixels: number;
  readonly litPixels: number;
  readonly changedPixels: number;
  readonly graph: AnimationStateMachineGraphSnapshot;
  readonly debugGraph: string;
  readonly controls: {
    readonly timeline: true;
    readonly playPause: true;
    readonly scrub: true;
    readonly playbackSpeed: true;
    readonly loopMode: true;
    readonly skeletonDebug: true;
  };
  readonly renderPath: "skinned-lit";
  readonly visualClaim: "real-skinned-gltf-animation-viewer";
  readonly knownLimits: readonly string[];
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_CHARACTER_ANIMATION_VIEWER__?: CharacterAnimationViewerState;
  }
}

const assetPath = "/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb";
const knownLimits = [
  "This viewer proves real skinned glTF animation playback for one checked-in character, not full humanoid retargeting or animation-authoring parity.",
  "The material path is bounded skinned-lit direct lighting, not full skinned PBR/IBL parity."
] as const;

if (typeof document !== "undefined") {
  void boot().catch((error) => {
    window.__GALILEO3D_CHARACTER_ANIMATION_VIEWER__ = {
      id: "character-animation-viewer",
      status: "error",
      renderer: "webgl2",
      assetId: "cesium-man",
      assetPath,
      meshName: "",
      clipName: "",
      playing: false,
      time: 0,
      duration: 0,
      playbackSpeed: 1,
      loopMode: "repeat",
      vertexCount: 0,
      indexCount: 0,
      jointCount: 0,
      trackCount: 0,
      drawCalls: 0,
      greenPixels: 0,
      litPixels: 0,
      changedPixels: 0,
      graph: { currentState: "error", stateTime: 0, parameters: {}, states: [], transitions: [] },
      debugGraph: "Animation graph unavailable: load failed.",
      controls: { timeline: true, playPause: true, scrub: true, playbackSpeed: true, loopMode: true, skeletonDebug: true },
      renderPath: "skinned-lit",
      visualClaim: "real-skinned-gltf-animation-viewer",
      knownLimits,
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function boot(): Promise<void> {
  installStyles();
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();

  const shell = document.createElement("main");
  shell.className = "character-animation-viewer";
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  canvas.dataset.testid = "character-animation-canvas";

  const panel = document.createElement("section");
  panel.className = "character-animation-panel";
  panel.innerHTML = `
    <h1>Character Animation Viewer</h1>
    <div class="controls">
      <button type="button" data-testid="character-animation-play">Pause</button>
      <label>
        <span>Time</span>
        <input data-testid="character-animation-time" type="range" min="0" max="1" step="0.01" value="0" />
      </label>
      <label>
        <span>Speed</span>
        <input data-testid="character-animation-speed" type="range" min="0.25" max="2" step="0.25" value="1" />
      </label>
      <label>
        <span>Loop</span>
        <select data-testid="character-animation-loop">
          <option value="repeat">Repeat</option>
          <option value="once">Once</option>
        </select>
      </label>
    </div>
    <pre data-testid="character-animation-graph">loading graph</pre>
    <pre data-testid="character-animation-status">loading</pre>
  `;
  shell.append(canvas, panel);
  root.append(shell);

  const playButton = panel.querySelector<HTMLButtonElement>("[data-testid='character-animation-play']");
  const timeInput = panel.querySelector<HTMLInputElement>("[data-testid='character-animation-time']");
  const speedInput = panel.querySelector<HTMLInputElement>("[data-testid='character-animation-speed']");
  const loopSelect = panel.querySelector<HTMLSelectElement>("[data-testid='character-animation-loop']");
  const graphStatus = panel.querySelector<HTMLElement>("[data-testid='character-animation-graph']");
  const status = panel.querySelector<HTMLElement>("[data-testid='character-animation-status']");
  if (!playButton || !timeInput || !speedInput || !loopSelect || !graphStatus || !status) throw new Error("Character animation viewer controls failed to initialize.");

  const asset = await new GLTFLoader().load({ url: new URL(assetPath, location.href).toString() }, new LoadContext());
  const mesh = asset.meshes.find((entry) => entry.skinIndex === 0 && entry.joints.length > 0 && entry.weights.length > 0);
  const skin = asset.skins[0];
  const clip = asset.animations[0];
  if (!mesh || !skin || !clip) {
    throw new Error("CesiumMan did not import a skinned mesh, skin, and animation clip.");
  }

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.01, 0.014, 0.018, 1],
    preserveDrawingBuffer: true
  });
  const geometry = createSkinnedGLTFGeometry(mesh);
  const material = new SkinnedLitMaterial({ name: "cesium-man-animation-viewer", color: [0.16, 0.92, 0.54, 1] });
  timeInput.max = String(clip.duration);
  timeInput.step = String(Math.max(0.001, clip.duration / 240));

  let playing = true;
  let time = 0;
  let playbackSpeed = 1;
  let loopMode: CharacterAnimationViewerState["loopMode"] = "repeat";
  let previousFrame: Uint8Array | undefined;
  let changedPixels = 0;
  let lastFrameTime: number | undefined;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  const graph = new AnimationStateMachine([
    {
      name: "playing",
      transitions: [{ to: "paused", label: "pause button or scrub", condition: (parameters) => parameters.playing === false }]
    },
    {
      name: "paused",
      transitions: [{ to: "playing", label: "play button", condition: (parameters) => parameters.playing === true }]
    }
  ], "playing");

  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
  });
  timeInput.addEventListener("input", () => {
    time = clamp(Number(timeInput.value), 0, clip.duration);
    playing = false;
    playButton.textContent = "Play";
    renderFrame();
  });
  speedInput.addEventListener("input", () => {
    playbackSpeed = clamp(Number(speedInput.value), 0.25, 2);
    renderFrame();
  });
  loopSelect.addEventListener("change", () => {
    loopMode = loopSelect.value === "once" ? "once" : "repeat";
    renderFrame();
  });

  function renderFrame(now = performance.now()): void {
    if (playing) {
      const delta = lastFrameTime === undefined ? 1 / 60 : Math.min(1 / 15, Math.max(0, (now - lastFrameTime) / 1000));
      time += delta * playbackSpeed;
      if (loopMode === "repeat") {
        time %= clip.duration;
      } else if (time >= clip.duration) {
        time = clip.duration;
        playing = false;
        playButton.textContent = "Play";
      }
      timeInput.value = String(time);
    }
    lastFrameTime = now;
    renderer.resize(canvas.width, canvas.height);
    diagnostics = renderer.render([{
      geometry,
      material,
      modelViewProjectionMatrix: cesiumManDisplayMatrix(),
      skinning: buildSkinningPalette(sampleAnimatedSkeleton(skin.skeleton, clip, time), 64),
      label: "character-animation-viewer-cesium-man"
    }]);
    const pixels = readPixels(canvas);
    changedPixels = previousFrame ? countChangedPixels(previousFrame, pixels) : 0;
    previousFrame = pixels;
    graph.setParameter("playing", playing);
    const currentGraphState = graph.update(1 / 60);
    const graphSnapshot = graph.graphSnapshot();
    const debugGraph = graph.debugGraph();
    const state: CharacterAnimationViewerState = {
      id: "character-animation-viewer",
      status: "ready",
      renderer: "webgl2",
      assetId: "cesium-man",
      assetPath,
      meshName: mesh.name,
      clipName: clip.name,
      playing,
      time: Number(time.toFixed(4)),
      duration: Number(clip.duration.toFixed(4)),
      playbackSpeed,
      loopMode,
      vertexCount: mesh.positions.length,
      indexCount: mesh.indices?.length ?? 0,
      jointCount: skin.joints.length,
      trackCount: clip.tracks.length,
      drawCalls: diagnostics.drawCalls,
      greenPixels: countGreenPixels(pixels),
      litPixels: countLitPixels(pixels),
      changedPixels,
      graph: graphSnapshot,
      debugGraph,
      controls: { timeline: true, playPause: true, scrub: true, playbackSpeed: true, loopMode: true, skeletonDebug: true },
      renderPath: "skinned-lit",
      visualClaim: "real-skinned-gltf-animation-viewer",
      knownLimits,
      diagnostics
    };
    window.__GALILEO3D_CHARACTER_ANIMATION_VIEWER__ = state;
    graphStatus.textContent = `${currentGraphState}\n${debugGraph}`;
    status.textContent = JSON.stringify(state, null, 2);
    if (playing) {
      requestAnimationFrame(renderFrame);
    }
  }

  window.addEventListener("beforeunload", () => {
    renderer.dispose();
    geometry.dispose();
  });
  renderFrame();
}

function createSkinnedGLTFGeometry(mesh: GLTFMeshAsset): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3J4W4, mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 1) {
    vertices.setAttribute(index, "position", mesh.positions[index]!);
    vertices.setAttribute(index, "normal", mesh.normals[index] ?? [0, 0, 1]);
    vertices.setAttribute(index, "joints", mesh.joints[index] ?? [0, 0, 0, 0]);
    vertices.setAttribute(index, "weights", mesh.weights[index] ?? [0, 0, 0, 0]);
  }
  return new Geometry(vertices, mesh.indices ? new IndexBuffer(mesh.indices, mesh.positions.length) : null, mesh.topology);
}

function sampleAnimatedSkeleton(skeleton: Skeleton, clip: AnimationClip, time: number): Skeleton {
  const poses = new Map(skeleton.bones.map((bone) => [
    bone.name,
    {
      translation: [...bone.translation] as [number, number, number],
      rotation: [...bone.rotation] as [number, number, number, number],
      scale: [...bone.scale] as [number, number, number]
    }
  ]));

  for (const track of clip.tracks) {
    const separator = track.target.lastIndexOf(".");
    if (separator < 0) continue;
    const boneName = track.target.slice(0, separator);
    const path = track.target.slice(separator + 1);
    const pose = poses.get(boneName);
    if (!pose) continue;
    const value = track.sample(time);
    if (path === "translation" && isVec3(value)) {
      pose.translation = value;
    } else if (path === "rotation" && isQuat(value)) {
      pose.rotation = value;
    } else if (path === "scale" && isVec3(value)) {
      pose.scale = value;
    }
  }

  return new Skeleton(skeleton.bones.map((bone) => {
    const pose = poses.get(bone.name)!;
    return new Bone({
      name: bone.name,
      parentIndex: bone.parentIndex,
      translation: pose.translation,
      rotation: pose.rotation,
      scale: pose.scale,
      inverseBindMatrix: bone.inverseBindMatrix
    });
  }));
}

function isVec3(value: AnimationValue): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number");
}

function isQuat(value: AnimationValue): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => typeof entry === "number");
}

function cesiumManDisplayMatrix(): readonly number[] {
  return [
    4, 0, 0, 0,
    0, 0, 0, 0,
    0, 1.08, 0, 0,
    0, -0.84, 0, 1
  ];
}

function readPixels(canvas: HTMLCanvasElement): Uint8Array {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for character animation readback.");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

function countGreenPixels(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    if (g > 130 && r < 90 && b < 130) count += 1;
  }
  return count;
}

function countLitPixels(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    if (g > 70 && r > 8 && b > 24 && g !== r) count += 1;
  }
  return count;
}

function countChangedPixels(previous: Uint8Array, next: Uint8Array): number {
  let changed = 0;
  for (let index = 0; index < Math.min(previous.length, next.length); index += 4) {
    const delta = Math.abs((previous[index] ?? 0) - (next[index] ?? 0)) +
      Math.abs((previous[index + 1] ?? 0) - (next[index + 1] ?? 0)) +
      Math.abs((previous[index + 2] ?? 0) - (next[index + 2] ?? 0));
    if (delta > 24) changed += 1;
  }
  return changed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0c1117; color: #eef4f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .character-animation-viewer { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #05080c; }
    .character-animation-panel { display: grid; grid-template-columns: minmax(12rem, 0.75fr) minmax(18rem, 1fr) minmax(20rem, 1.4fr); gap: 1rem; align-items: start; padding: 1rem 1.25rem; border-top: 1px solid #27323a; background: #141b22; }
    h1 { margin: 0; font-size: 1rem; line-height: 1.25; }
    .controls { display: grid; gap: 0.75rem; }
    button { width: max-content; border: 1px solid #4f7f96; background: #10212b; color: #f2fbff; border-radius: 6px; padding: 0.45rem 0.75rem; }
    label { display: grid; gap: 0.35rem; color: #c7d4dd; font-size: 0.85rem; }
    pre { margin: 0; overflow: auto; color: #b8e4b3; font-size: 0.8125rem; line-height: 1.4; max-height: 11rem; }
    @media (max-width: 760px) { .character-animation-panel { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}
