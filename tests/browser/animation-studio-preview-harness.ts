// Animation Studio preview render harness: loads a real rigged GLB (auraClashPlayerRig), uses the
// @aura3d/animation locomotion kit to pick a clip by speed, samples the skeleton for that clip, and
// renders the skinned character — proving the Studio's speed -> kit -> clip -> skinned 3D render loop
// with skinning palette + cross-clip motion. (No existing test covers kit-driven skinned rendering.)
import { AnimationClip, Bone, Skeleton, buildSkinningPalette, createLocomotionKit, type AnimationValue } from "@aura3d/animation";
import { GLTFLoader, LoadContext, type GLTFMeshAsset } from "@aura3d/assets";
import { Geometry, IndexBuffer, Renderer, SkinnedUnlitMaterial, VertexBuffer, VertexFormat } from "@aura3d/rendering";

interface StudioPreviewFrame {
  speed: number;
  state: string;
  clip: string;
  skinnedPixels: number;
  jointCount: number;
  trackCount: number;
}

interface StudioPreviewProof {
  status: "ready" | "error";
  error?: string;
  assetClips: string[];
  frames: StudioPreviewFrame[];
  changedPixels: number;
}

declare global {
  interface Window {
    __AURA3D_ANIMATION_STUDIO_PREVIEW__?: StudioPreviewProof;
  }
}

const RIG_URL = "/apps/aura-clash-showcase/public/aura-assets/auraClashPlayerRig.d8672924.glb";
const CLIP_MAP = { idle: "Idle_Loop", walk: "Walk_Loop", run: "Sprint_Loop" } as const;

function isVec3(v: AnimationValue): v is readonly [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((e) => typeof e === "number");
}
function isQuat(v: AnimationValue): v is readonly [number, number, number, number] {
  return Array.isArray(v) && v.length === 4 && v.every((e) => typeof e === "number");
}

function sampleSkeleton(skeleton: Skeleton, clip: AnimationClip, time: number): Skeleton {
  const poses = new Map(skeleton.bones.map((b) => [b.name, {
    translation: [...b.translation] as [number, number, number],
    rotation: [...b.rotation] as [number, number, number, number],
    scale: [...b.scale] as [number, number, number]
  }]));
  for (const track of clip.tracks) {
    const sep = track.target.lastIndexOf(".");
    if (sep < 0) continue;
    const bone = track.target.slice(0, sep);
    const path = track.target.slice(sep + 1);
    const pose = poses.get(bone);
    if (!pose) continue;
    const value = track.sample(time);
    if (path === "translation" && isVec3(value)) pose.translation = value;
    else if (path === "rotation" && isQuat(value)) pose.rotation = value;
    else if (path === "scale" && isVec3(value)) pose.scale = value;
  }
  return new Skeleton(skeleton.bones.map((b) => {
    const p = poses.get(b.name)!;
    return new Bone({ name: b.name, parentIndex: b.parentIndex, translation: p.translation, rotation: p.rotation, scale: p.scale, inverseBindMatrix: b.inverseBindMatrix });
  }));
}

function skinnedGeometry(mesh: GLTFMeshAsset): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 1) {
    vertices.setAttribute(i, "position", mesh.positions[i]!);
    vertices.setAttribute(i, "joints", mesh.joints[i] ?? [0, 0, 0, 0]);
    vertices.setAttribute(i, "weights", mesh.weights[i] ?? [0, 0, 0, 0]);
  }
  return new Geometry(vertices, mesh.indices ? new IndexBuffer(mesh.indices, mesh.positions.length) : null, mesh.topology);
}

// Fit a ~1.83-unit-tall Y-up character into NDC (front view).
function displayMatrix(): readonly number[] {
  const s = 0.9;
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, -0.001, 0, 0, -0.81, 0, 1];
}

function readPixels(canvas: HTMLCanvasElement): Uint8Array {
  const gl = canvas.getContext("webgl2")!;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}
function litPixels(pixels: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if ((pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0) > 48) n += 1;
  }
  return n;
}
function changed(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) + Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) + Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0)) > 32) n += 1;
  }
  return n;
}

async function renderFrame(canvasId: string, mesh: GLTFMeshAsset, skeleton: Skeleton, jointCount: number): Promise<Uint8Array> {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
  const geometry = skinnedGeometry(mesh);
  renderer.render([{ geometry, material: new SkinnedUnlitMaterial({ name: "studio-skinning", color: [0.18, 0.9, 0.55, 1] }), modelViewProjectionMatrix: displayMatrix(), skinning: buildSkinningPalette(skeleton, jointCount), label: `studio-${canvasId}` }]);
  const pixels = readPixels(canvas);
  renderer.dispose();
  geometry.dispose();
  return pixels;
}

async function boot(): Promise<void> {
  const asset = await new GLTFLoader().load({ url: new URL(RIG_URL, location.href).toString() }, new LoadContext());
  const mesh = asset.meshes.find((m) => m.skinIndex === 0 && m.joints.length > 0 && m.weights.length > 0);
  const skin = asset.skins[0];
  if (!mesh || !skin) throw new Error("auraClashPlayerRig did not import a skinned mesh + skin");
  const clipByName = new Map(asset.animations.map((c) => [c.name, c]));
  const kit = createLocomotionKit({ idleClip: CLIP_MAP.idle, walkClip: CLIP_MAP.walk, runClip: CLIP_MAP.run, walkSpeed: 1.6, runSpeed: 4.4 });
  const jointCount = Math.min(96, skin.joints.length);

  const frames: StudioPreviewFrame[] = [];
  const pixelSets: Uint8Array[] = [];
  const plan: Array<{ speed: number; canvas: string }> = [
    { speed: 0, canvas: "studio-frame-idle" },
    { speed: 5, canvas: "studio-frame-run" }
  ];
  for (const step of plan) {
    const sample = kit.sample(step.speed);
    const dominant = [...sample.clipWeights].sort((a, b) => b.weight - a.weight)[0]!;
    const clip = clipByName.get(dominant.clip);
    if (!clip) throw new Error(`rig is missing clip "${dominant.clip}"`);
    const skeleton = sampleSkeleton(skin.skeleton, clip, 0.4);
    const pixels = await renderFrame(step.canvas, mesh, skeleton, jointCount);
    pixelSets.push(pixels);
    frames.push({ speed: step.speed, state: sample.state, clip: dominant.clip, skinnedPixels: litPixels(pixels), jointCount, trackCount: clip.tracks.length });
  }

  window.__AURA3D_ANIMATION_STUDIO_PREVIEW__ = {
    status: "ready",
    assetClips: asset.animations.map((c) => c.name),
    frames,
    changedPixels: changed(pixelSets[0]!, pixelSets[1]!)
  };
  document.getElementById("studio-readout")!.textContent = JSON.stringify(window.__AURA3D_ANIMATION_STUDIO_PREVIEW__, null, 2);
}

boot().catch((error) => {
  window.__AURA3D_ANIMATION_STUDIO_PREVIEW__ = { status: "error", error: error instanceof Error ? error.message : String(error), assetClips: [], frames: [], changedPixels: 0 };
});
