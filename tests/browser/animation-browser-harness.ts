import { AnimationAction, AnimationClip, AnimationLayer, AnimationMixer, AnimationTrack, Bone, Skeleton, buildSkinningPalette, type AnimationValue, type LoopMode } from "@galileo3d/animation";
import { GLTFLoader, LoadContext, type GLTFMeshAsset } from "@galileo3d/assets";
import { Geometry, IndexBuffer, Renderer, SkinnedUnlitMaterial, UnlitMaterial, VertexBuffer, VertexFormat } from "@galileo3d/rendering";

interface AnimationBrowserResult {
  readonly status: "ready" | "error";
  readonly frameAPixel?: readonly number[];
  readonly frameBPixel?: readonly number[];
  readonly crossfadePixel?: readonly number[];
  readonly additivePixel?: readonly number[];
  readonly additiveOrangePixels?: number;
  readonly skinnedPixel?: readonly number[];
  readonly externalCharacter?: ExternalCharacterBrowserEvidence;
  readonly skeletonRootPixel?: readonly number[];
  readonly skeletonChildPixel?: readonly number[];
  readonly frameAValue?: readonly [number, number, number];
  readonly frameBValue?: readonly [number, number, number];
  readonly crossfadeValue?: number;
  readonly additiveValue?: readonly [number, number, number];
  readonly paletteJointCount?: number;
  readonly paletteChildTranslation?: readonly [number, number, number];
  readonly skinnedDrawCalls?: number;
  readonly controls?: AnimationControlState;
  readonly diagnostics?: {
    readonly frameA: number;
    readonly frameB: number;
    readonly crossfade: number;
    readonly additive: number;
  };
  readonly error?: string;
}

interface ExternalCharacterBrowserEvidence {
  readonly assetId: "cesium-man";
  readonly sourcePath: string;
  readonly meshName: string;
  readonly clipName: string;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly jointCount: number;
  readonly trackCount: number;
  readonly frameAGreenPixels: number;
  readonly frameBGreenPixels: number;
  readonly changedPixels: number;
  readonly drawCalls: readonly [number, number];
}

interface AnimationControlState {
  readonly playing: boolean;
  readonly paused: boolean;
  readonly time: number;
  readonly timeScale: number;
  readonly loopMode: LoopMode;
  readonly crossfadeWeight: number;
  readonly position: readonly [number, number, number];
  readonly pixel: readonly number[];
  readonly drawCalls: number;
  readonly history: readonly string[];
}

declare global {
  interface Window {
    __GALILEO3D_ANIMATION_BROWSER_TEST__?: AnimationBrowserResult;
    __GALILEO3D_ANIMATION_CONTROLS__?: AnimationControlState;
  }
}

async function run(): Promise<void> {
  try {
    const transformClip = new AnimationClip({
      name: "browser-transform-loop",
      duration: 1,
      tracks: [
        new AnimationTrack({
          target: "cube.position",
          valueType: "vector3",
          keyframes: [
            { time: 0, value: [-0.62, 0, 0] },
            { time: 0.5, value: [0.62, 0, 0] },
            { time: 1, value: [-0.62, 0, 0] }
          ]
        })
      ]
    });

    const frameAValue = sampleVector(transformClip, 0.25);
    const frameBValue = sampleVector(transformClip, 0.75);
    const frameA = await renderAnimatedCube("frame-a", frameAValue, [0.95, 0.74, 0.18, 1]);
    const frameB = await renderAnimatedCube("frame-b", frameBValue, [0.14, 0.68, 1, 1]);

    const crossfadeValue = sampleCrossfade();
    const crossfade = await renderAnimatedCube("crossfade", [crossfadeValue, 0, 0], [0.9, 0.25, 0.78, 1]);

    const additiveValue = sampleAdditiveLayer();
    const additive = await renderAnimatedCube("additive", additiveValue, [1, 0.45, 0.1, 1]);

    const skinned = await renderSkinnedTriangle();
    const externalCharacter = await renderExternalSkinnedCharacter();
    const skeletonResult = drawSkeletonDebug();
    const controls = await setupAnimationControls();

    window.__GALILEO3D_ANIMATION_BROWSER_TEST__ = {
      status: "ready",
      frameAPixel: frameA.pixel,
      frameBPixel: frameB.pixel,
      crossfadePixel: crossfade.pixel,
      additivePixel: additive.pixel,
      additiveOrangePixels: additive.orangePixels,
      skinnedPixel: skinned.pixel,
      externalCharacter,
      skeletonRootPixel: skeletonResult.rootPixel,
      skeletonChildPixel: skeletonResult.childPixel,
      frameAValue,
      frameBValue,
      crossfadeValue,
      additiveValue,
      paletteJointCount: skeletonResult.jointCount,
      paletteChildTranslation: skeletonResult.childTranslation,
      skinnedDrawCalls: skinned.drawCalls,
      controls,
      diagnostics: {
        frameA: frameA.drawCalls,
        frameB: frameB.drawCalls,
        crossfade: crossfade.drawCalls,
        additive: additive.drawCalls
      }
    };
  } catch (error) {
    window.__GALILEO3D_ANIMATION_BROWSER_TEST__ = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
  }
}

async function setupAnimationControls(): Promise<AnimationControlState> {
  const values = new Map<string, AnimationValue>();
  const mixer = new AnimationMixer({ setAnimationValue: (target, value) => values.set(target, value) });
  const movementClip = new AnimationClip({
    name: "control-move",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "controlled.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [-0.6, 0, 0] }, { time: 1, value: [0.6, 0, 0] }]
      })
    ]
  });
  const upperClip = new AnimationClip({
    name: "control-upper",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "controlled.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0.42, 0] }, { time: 1, value: [0, 0.42, 0] }]
      })
    ]
  });

  const action = mixer.play(movementClip).pause();
  action.time = 0.25;
  const crossfadeAction = new AnimationAction(upperClip).setWeight(0);
  const history: string[] = [];

  const playButton = requireElement("anim-play", HTMLButtonElement);
  const pauseButton = requireElement("anim-pause", HTMLButtonElement);
  const scrubInput = requireElement("anim-scrub", HTMLInputElement);
  const speedInput = requireElement("anim-speed", HTMLInputElement);
  const loopSelect = requireElement("anim-loop", HTMLSelectElement);
  const crossfadeButton = requireElement("anim-crossfade", HTMLButtonElement);

  let latest = await updateControls(mixer, action, crossfadeAction, values, history, "initial", 0);

  playButton.addEventListener("click", () => {
    action.play();
    void updateControls(mixer, action, crossfadeAction, values, history, "play", 0.25).then((state) => { latest = state; });
  });
  pauseButton.addEventListener("click", () => {
    action.pause();
    void updateControls(mixer, action, crossfadeAction, values, history, "pause", 0).then((state) => { latest = state; });
  });
  scrubInput.addEventListener("input", () => {
    action.time = Number(scrubInput.value);
    action.pause();
    void updateControls(mixer, action, crossfadeAction, values, history, "scrub", 0).then((state) => { latest = state; });
  });
  speedInput.addEventListener("input", () => {
    action.timeScale = Number(speedInput.value);
    crossfadeAction.timeScale = action.timeScale;
    action.play();
    void updateControls(mixer, action, crossfadeAction, values, history, "speed", 0.125).then((state) => { latest = state; });
  });
  loopSelect.addEventListener("change", () => {
    action.loopMode = loopSelect.value as LoopMode;
    void updateControls(mixer, action, crossfadeAction, values, history, "loop", 0).then((state) => { latest = state; });
  });
  crossfadeButton.addEventListener("click", () => {
    crossfadeAction.time = action.time;
    mixer.crossFade(action, crossfadeAction, 0.5);
    void updateControls(mixer, action, crossfadeAction, values, history, "crossfade", 0.25).then((state) => { latest = state; });
  });

  Object.defineProperty(window, "__GALILEO3D_ANIMATION_CONTROLS__", {
    configurable: true,
    get: () => latest
  });

  return latest;
}

async function updateControls(
  mixer: AnimationMixer,
  action: AnimationAction,
  crossfadeAction: AnimationAction,
  values: Map<string, AnimationValue>,
  history: string[],
  label: string,
  delta: number
): Promise<AnimationControlState> {
  history.push(label);
  mixer.update(delta);
  const value = values.get("controlled.position");
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("Animation controls did not sample controlled.position.");
  }
  const position: [number, number, number] = [value[0] as number, value[1] as number, value[2] as number];
  const render = await renderAnimatedCube("controls", position, [0.38, 0.92, 0.62, 1]);
  const state: AnimationControlState = {
    playing: action.playing,
    paused: action.paused,
    time: Number(action.time.toFixed(6)),
    timeScale: action.timeScale,
    loopMode: action.loopMode,
    crossfadeWeight: Number(crossfadeAction.weight.toFixed(6)),
    position,
    pixel: render.pixel,
    drawCalls: render.drawCalls,
    history: [...history]
  };
  const result = window.__GALILEO3D_ANIMATION_BROWSER_TEST__;
  if (result) {
    window.__GALILEO3D_ANIMATION_BROWSER_TEST__ = { ...result, controls: state };
  }
  return state;
}

async function renderSkinnedTriangle(): Promise<{ readonly pixel: readonly number[]; readonly drawCalls: number }> {
  const canvas = requireCanvas("skinned");
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0, 0, 0, 1]
  });
  const skeleton = new Skeleton([
    new Bone({ name: "root", parentIndex: -1, translation: [0, 0, 0] }),
    new Bone({ name: "child", parentIndex: 0, translation: [0.35, 0, 0] })
  ]);
  const skinning = buildSkinningPalette(skeleton);
  const geometry = createSkinnedTriangle();
  const diagnostics = renderer.render([
    {
      geometry,
      material: new SkinnedUnlitMaterial({ color: [0.1, 0.95, 0.45, 1] }),
      skinning,
      label: "browser-skinned-triangle"
    }
  ]);
  const pixel = readPixel(canvas, ndcToPixel(0.35, canvas.width), Math.round(canvas.height / 2));
  renderer.dispose();
  geometry.dispose();
  return { pixel, drawCalls: diagnostics.drawCalls };
}

async function renderExternalSkinnedCharacter(): Promise<ExternalCharacterBrowserEvidence> {
  const sourcePath = "/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb";
  const asset = await new GLTFLoader().load({ url: new URL(sourcePath, location.href).toString() }, new LoadContext());
  const mesh = asset.meshes.find((entry) => entry.skinIndex === 0 && entry.joints.length > 0 && entry.weights.length > 0);
  const skin = asset.skins[0];
  const clip = asset.animations[0];
  if (!mesh || !skin || !clip) {
    throw new Error("Cesium Man fixture did not import a skinned mesh, skin, and animation clip.");
  }

  const frameA = await renderExternalCharacterFrame("external-character-a", mesh, sampleAnimatedSkeleton(skin.skeleton, clip, 0.25));
  const frameB = await renderExternalCharacterFrame("external-character-b", mesh, sampleAnimatedSkeleton(skin.skeleton, clip, 1.25));

  return {
    assetId: "cesium-man",
    sourcePath,
    meshName: mesh.name,
    clipName: clip.name,
    vertexCount: mesh.positions.length,
    indexCount: mesh.indices?.length ?? 0,
    jointCount: skin.joints.length,
    trackCount: clip.tracks.length,
    frameAGreenPixels: frameA.greenPixels,
    frameBGreenPixels: frameB.greenPixels,
    changedPixels: countChangedPixels(frameA.pixels, frameB.pixels),
    drawCalls: [frameA.drawCalls, frameB.drawCalls]
  };
}

async function renderExternalCharacterFrame(
  canvasId: string,
  mesh: GLTFMeshAsset,
  skeleton: Skeleton
): Promise<{ readonly greenPixels: number; readonly pixels: Uint8Array; readonly drawCalls: number }> {
  const canvas = requireCanvas(canvasId);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0, 0, 0, 1]
  });
  const geometry = createSkinnedGLTFGeometry(mesh);
  const diagnostics = renderer.render([
    {
      geometry,
      material: new SkinnedUnlitMaterial({ name: "external-cesium-man-skinning", color: [0.16, 0.92, 0.54, 1] }),
      modelViewProjectionMatrix: cesiumManDisplayMatrix(),
      skinning: buildSkinningPalette(skeleton, 64),
      label: `external-${canvasId}`
    }
  ]);
  const pixels = readPixels(canvas);
  renderer.dispose();
  geometry.dispose();
  return { greenPixels: countGreenPixels(pixels), pixels, drawCalls: diagnostics.drawCalls };
}

function createSkinnedGLTFGeometry(mesh: GLTFMeshAsset): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 1) {
    vertices.setAttribute(index, "position", mesh.positions[index]!);
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

function createSkinnedTriangle(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
  vertices.setAttribute(0, "position", [-0.2, -0.25, 0]);
  vertices.setAttribute(1, "position", [0.2, -0.25, 0]);
  vertices.setAttribute(2, "position", [0, 0.25, 0]);
  for (let index = 0; index < 3; index += 1) {
    vertices.setAttribute(index, "joints", [1, 0, 0, 0]);
    vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
  }
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function sampleVector(clip: AnimationClip, time: number): readonly [number, number, number] {
  const values = new Map<string, AnimationValue>();
  const mixer = new AnimationMixer({ setAnimationValue: (target, value) => values.set(target, value) });
  const action = mixer.play(clip);
  action.time = time;
  mixer.update(0);
  const value = values.get("cube.position");
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("Transform clip did not sample cube.position.");
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function sampleCrossfade(): number {
  const values = new Map<string, AnimationValue>();
  const mixer = new AnimationMixer({ setAnimationValue: (target, value) => values.set(target, value) });
  const idle = new AnimationClip({
    name: "idle-left",
    duration: 1,
    tracks: [new AnimationTrack({ target: "blend.x", valueType: "scalar", keyframes: [{ time: 0, value: -0.5 }, { time: 1, value: -0.5 }] })]
  });
  const run = new AnimationClip({
    name: "run-right",
    duration: 1,
    tracks: [new AnimationTrack({ target: "blend.x", valueType: "scalar", keyframes: [{ time: 0, value: 0.5 }, { time: 1, value: 0.5 }] })]
  });
  const from = mixer.play(idle);
  const to = new AnimationAction(run).setWeight(0);
  mixer.crossFade(from, to, 1);
  mixer.update(0.5);
  const value = values.get("blend.x");
  if (typeof value !== "number") {
    throw new Error("Crossfade did not sample blend.x.");
  }
  return value;
}

function sampleAdditiveLayer(): readonly [number, number, number] {
  const values = new Map<string, AnimationValue>();
  const mixer = new AnimationMixer({ setAnimationValue: (target, value) => values.set(target, value) });
  const base = mixer.play(new AnimationClip({
    name: "additive-base",
    duration: 1,
    tracks: [new AnimationTrack({ target: "cube.position", valueType: "vector3", keyframes: [{ time: 0, value: [-0.45, 0, 0] }] })]
  }));
  const offset = mixer.play(new AnimationClip({
    name: "additive-offset",
    duration: 1,
    tracks: [new AnimationTrack({ target: "cube.position", valueType: "vector3", keyframes: [{ time: 0, value: [0.6, 0.2, 0] }] })]
  }));
  const additiveLayer = new AnimationLayer("browser-additive", { additive: true, weight: 0.5, mask: ["cube"] });
  additiveLayer.add(offset);
  mixer.addLayer(additiveLayer);
  base.setWeight(1);
  offset.setWeight(1);
  mixer.update(0);
  const value = values.get("cube.position");
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("Additive layer did not sample cube.position.");
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

async function renderAnimatedCube(canvasId: string, translation: readonly [number, number, number], color: readonly [number, number, number, number]): Promise<{ readonly pixel: readonly number[]; readonly drawCalls: number; readonly orangePixels: number }> {
  const canvas = requireCanvas(canvasId);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0, 0, 0, 1]
  });
  const geometry = createQuad(translation[0], translation[1], 0.34);
  const diagnostics = renderer.render([{ geometry, material: new UnlitMaterial({ color }), label: `animated-${canvasId}` }]);
  const pixel = readPixel(canvas, ndcToPixel(translation[0], canvas.width), ndcToPixel(translation[1], canvas.height));
  const orangePixels = countOrangePixels(canvas);
  renderer.dispose();
  geometry.dispose();
  return { pixel, drawCalls: diagnostics.drawCalls, orangePixels };
}

function createQuad(centerX: number, centerY: number, size: number): Geometry {
  const half = size / 2;
  const vertices = new VertexBuffer(VertexFormat.P3, 4);
  vertices.setAttribute(0, "position", [centerX - half, centerY - half, 0]);
  vertices.setAttribute(1, "position", [centerX + half, centerY - half, 0]);
  vertices.setAttribute(2, "position", [centerX + half, centerY + half, 0]);
  vertices.setAttribute(3, "position", [centerX - half, centerY + half, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2, 0, 2, 3], 4));
}

function drawSkeletonDebug(): {
  readonly rootPixel: readonly number[];
  readonly childPixel: readonly number[];
  readonly jointCount: number;
  readonly childTranslation: readonly [number, number, number];
} {
  const canvas = requireCanvas("skeleton");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Skeleton debug canvas is unavailable.");
  }

  const skeleton = new Skeleton([
    new Bone({ name: "root", parentIndex: -1, translation: [0, 0, 0] }),
    new Bone({ name: "forearm", parentIndex: 0, translation: [0.75, 0.25, 0] })
  ]);
  const palette = buildSkinningPalette(skeleton);
  const worlds = skeleton.worldMatrices();
  const childTranslation: [number, number, number] = [worlds[1]![12]!, worlds[1]![13]!, worlds[1]![14]!];

  context.fillStyle = "rgb(6, 10, 14)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const root = { x: 42, y: 58 };
  const child = { x: root.x + childTranslation[0] * 96, y: root.y - childTranslation[1] * 96 };

  context.strokeStyle = "rgb(40, 220, 170)";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(root.x, root.y);
  context.lineTo(child.x, child.y);
  context.stroke();

  context.fillStyle = "rgb(248, 246, 210)";
  context.beginPath();
  context.arc(root.x, root.y, 10, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgb(255, 96, 84)";
  context.beginPath();
  context.arc(child.x, child.y, 10, 0, Math.PI * 2);
  context.fill();

  return {
    rootPixel: readCanvasPixel(context, root.x, root.y),
    childPixel: readCanvasPixel(context, child.x, child.y),
    jointCount: palette.jointCount,
    childTranslation
  };
}

function ndcToPixel(value: number, extent: number): number {
  return Math.round(((value + 1) * 0.5) * (extent - 1));
}

function requireCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Missing canvas: ${id}`);
  }
  return canvas;
}

function requireElement<T extends HTMLElement>(id: string, constructor: { new(...args: never[]): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): readonly number[] {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 context unavailable for animation readback.");
  }
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return Array.from(pixel);
}

function readPixels(canvas: HTMLCanvasElement): Uint8Array {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 context unavailable for animation readback.");
  }
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

function countGreenPixels(pixels: Uint8Array): number {
  let matching = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const a = pixels[index + 3] ?? 0;
    if (r > 20 && r < 90 && g > 150 && b > 70 && b < 180 && a === 255) {
      matching += 1;
    }
  }
  return matching;
}

function countChangedPixels(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error("Cannot compare rendered frames with different pixel sizes.");
  }
  let changed = 0;
  for (let index = 0; index < a.length; index += 4) {
    const delta =
      Math.abs((a[index] ?? 0) - (b[index] ?? 0)) +
      Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0)) +
      Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0));
    if (delta > 32) {
      changed += 1;
    }
  }
  return changed;
}

function countOrangePixels(canvas: HTMLCanvasElement): number {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 context unavailable for animation readback.");
  }
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let matching = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const a = pixels[index + 3] ?? 0;
    if (r > 180 && g > 70 && b < 80 && a === 255) {
      matching += 1;
    }
  }
  return matching;
}

function readCanvasPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data);
}

void run();
