/**
 * Lane-01 rows 01-S3 / 01-S4 (?tools=primitive|instance-grid|box-uploads):
 * Aura (0,0) and three r185 (HALF_W,0) render the same primitive with the
 * C-07 default parameters (sphere 64×32, cylinder 48, capsule cap 8 /
 * radial 32, torus 0.43/0.045 64×16) from the same camera; the spec compares
 * page screenshots.
 *
 *   tools=primitive&shape=<s>&look=mask        unlit white on black (IoU, sphere radial)
 *   tools=primitive&shape=cylinder&look=cap&light=top|+x|-x|+z|-z
 *                                              lit matte cylinder, one directional
 *                                              light (top or tilted 30°), operator
 *                                              `none` (cap IoU, luma, normal)
 *   tools=instance-grid                        20×20 instanced boxes, 45° Y + non-uniform
 *                                              scale + size (coverage ±5 % of three)
 *   tools=box-uploads                          1 box vs 685 boxes: live device buffers
 */

import * as THREE from "three";
import { camera, environments, instances, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp, AuraMaterialSpec, AuraSceneNode, AuraTransformSpec, AuraVec3 } from "@aura3d/engine";
import { errorText, HALF_H, HALF_W, mountAura, mountThree, param, placeCanvas, settleAura, settleThree } from "./specKit";

export const SPEC_SHAPES = ["box", "sphere", "plane", "cylinder", "capsule", "torus"] as const;
type SpecShape = (typeof SPEC_SHAPES)[number];

const CAMERA = { fov: 40, position: [1.6, 1.2, 2.2] as [number, number, number] };
const CAP_CAMERA = { fov: 40, position: [0, 1.9, 2.0] as [number, number, number] };
const CAPSULE_SIZE: AuraVec3 = [0.5, 1, 0.5];
const TILT = Math.PI / 6;

/** Light direction (towards the light) for the cap renders. */
export function capLightDirection(light: string): [number, number, number] {
  const s = Math.sin(TILT);
  const c = Math.cos(TILT);
  switch (light) {
    case "+x": return [s, c, 0];
    case "-x": return [-s, c, 0];
    case "+z": return [0, c, s];
    case "-z": return [0, c, -s];
    default: return [0, 1, 0];
  }
}

function threeGeometry(shape: SpecShape): THREE.BufferGeometry {
  switch (shape) {
    case "box": return new THREE.BoxGeometry(1, 1, 1);
    case "sphere": return new THREE.SphereGeometry(0.5, 64, 32);
    case "plane": return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    case "cylinder": return new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 1);
    case "capsule": return new THREE.CapsuleGeometry(CAPSULE_SIZE[0] / 2, CAPSULE_SIZE[1] - CAPSULE_SIZE[0], 8, 32);
    case "torus": return new THREE.TorusGeometry(0.43, 0.045, 16, 64);
  }
}

function auraPrimitive(shape: SpecShape, mat: AuraMaterialSpec): AuraSceneNode {
  const options = { name: `spec-${shape}`, material: mat, ...(shape === "capsule" ? { size: CAPSULE_SIZE } : {}) };
  return primitives[shape](options).toJSON();
}

const WHITE_UNLIT = (): AuraMaterialSpec => material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1 });

export interface PrimitiveToolReport {
  readonly tool: string;
  readonly shape?: string;
  readonly look?: string;
  readonly light?: string;
  readonly setOutputPresent: boolean;
  readonly liveBuffersOne?: number | null;
  readonly liveBuffersMany?: number | null;
  readonly bufferCreatesOne?: number | null;
  readonly bufferCreatesMany?: number | null;
  readonly drawCallsMany?: number | null;
  readonly errors: readonly string[];
}

async function mountPair(
  stage: HTMLElement,
  auraNodes: readonly AuraSceneNode[],
  threeObjects: readonly THREE.Object3D[],
  view: { fov: number; position: [number, number, number] },
  toneMapping: "none"
): Promise<AuraApp> {
  const snapshot = scene()
    .background("#000000")
    .camera(camera.perspective({ fov: view.fov, position: view.position, target: [0, 0, 0] }))
    .addMany(auraNodes)
    .toJSON();
  const app = await mountAura(placeCanvas(stage, 0, 0, HALF_W, HALF_H, "qr-prim-aura"), snapshot);
  app.setOutput?.({ toneMapping, dither: false });
  await settleAura(app, 4);
  const three = await mountThree(placeCanvas(stage, HALF_W, 0, HALF_W, HALF_H, "qr-prim-three"), {
    toneMapping,
    fov: view.fov,
    position: view.position,
    background: "#000000"
  });
  for (const object of threeObjects) three.scene.add(object);
  await settleThree(three);
  return app;
}

async function runPrimitive(stage: HTMLElement): Promise<PrimitiveToolReport> {
  const shape = (param("shape") ?? "box") as SpecShape;
  const look = param("look") ?? "mask";
  const light = param("light") ?? "top";
  if (!SPEC_SHAPES.includes(shape)) throw new Error(`unknown shape ${shape}`);
  let app: AuraApp;
  if (look === "cap") {
    const dir = capLightDirection(light);
    const lightPos: AuraVec3 = [dir[0] * 6, dir[1] * 6, dir[2] * 6];
    const matte = material.pbr({ color: "#cccccc", roughness: 1, metalness: 0 });
    const threeLight = new THREE.DirectionalLight(0xffffff, 1);
    threeLight.position.set(...lightPos);
    const threeMesh = new THREE.Mesh(threeGeometry(shape), new THREE.MeshStandardMaterial({ color: new THREE.Color("#cccccc"), roughness: 1, metalness: 0 }));
    app = await mountPair(
      stage,
      // three's reference has no environment: environments.none() drops the
      // implicit studio IBL an unauthored aura scene gets (cap luma was 1.58x).
      [auraPrimitive(shape, matte), lights.directional({ position: lightPos, intensity: 1, color: "#ffffff" }).toJSON(), environments.none().toJSON()],
      [threeMesh, threeLight],
      CAP_CAMERA,
      "none"
    );
  } else {
    const threeMesh = new THREE.Mesh(threeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    app = await mountPair(stage, [auraPrimitive(shape, WHITE_UNLIT())], [threeMesh], CAMERA, "none");
  }
  return { tool: "primitive", shape, look, light, setOutputPresent: typeof app.setOutput === "function", errors: [...app.diagnostics().errors] };
}

/** 20×20 grid at spacing 0.5, instance 45° about Y, scale [1, 2, 0.5], size 0.2. */
function gridTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  for (let row = 0; row < 20; row += 1) {
    for (let col = 0; col < 20; col += 1) {
      transforms.push({ position: [(col - 9.5) * 0.5, 0, (row - 9.5) * 0.5], rotation: [0, Math.PI / 4, 0], scale: [1, 2, 0.5] });
    }
  }
  return transforms;
}

async function runInstanceGrid(stage: HTMLElement): Promise<PrimitiveToolReport> {
  const transforms = gridTransforms();
  const size = 0.2;
  const node = instances.box({ name: "spec-instance-grid", transforms, size, material: WHITE_UNLIT() }).toJSON();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color: 0xffffff }), transforms.length);
  const dummy = new THREE.Object3D();
  dummy.rotation.order = "ZYX";
  transforms.forEach((t, i) => {
    dummy.position.set(...(t.position as [number, number, number]));
    dummy.rotation.set(...(t.rotation as [number, number, number]));
    dummy.scale.set(...(t.scale as [number, number, number]));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  const app = await mountPair(stage, [node], [mesh], { fov: 45, position: [0, 7, 6] }, "none");
  return { tool: "instance-grid", setOutputPresent: typeof app.setOutput === "function", errors: [...app.diagnostics().errors] };
}

interface Counters { readonly liveBuffers?: number; readonly bufferCreates?: number }

function deviceCounters(app: AuraApp): Counters | null {
  const d = app.diagnostics() as unknown as { frameAllocations?: { device?: Counters | null } };
  return d.frameAllocations?.device ?? null;
}

async function boxScene(stage: HTMLElement, count: number, x: number): Promise<{ counters: Counters | null; drawCalls: number; errors: readonly string[] }> {
  const builder = scene().background("#000000").camera(camera.perspective({ fov: 60, position: [0, 30, 30], target: [0, 0, 0] }));
  for (let i = 0; i < count; i += 1) {
    builder.add(primitives.box({ name: `b${i}`, material: material.pbr({ color: "#888888" }) }).position((i % 27) - 13, 0, Math.floor(i / 27) - 13).scale(0.4));
  }
  builder.add(lights.directional({ position: [3, 5, 2], intensity: 2 }));
  const app = await mountAura(placeCanvas(stage, x, 0, 320, 180, `qr-boxes-${count}`), builder.toJSON());
  await settleAura(app, 6);
  const result = { counters: deviceCounters(app), drawCalls: app.diagnostics().drawCalls, errors: [...app.diagnostics().errors] };
  app.dispose();
  return result;
}

async function runBoxUploads(stage: HTMLElement): Promise<PrimitiveToolReport> {
  const one = await boxScene(stage, 1, 0);
  const many = await boxScene(stage, 685, 330);
  return {
    tool: "box-uploads",
    setOutputPresent: true,
    liveBuffersOne: one.counters?.liveBuffers ?? null,
    liveBuffersMany: many.counters?.liveBuffers ?? null,
    bufferCreatesOne: one.counters?.bufferCreates ?? null,
    bufferCreatesMany: many.counters?.bufferCreates ?? null,
    drawCallsMany: many.drawCalls,
    errors: [...one.errors, ...many.errors]
  };
}

export async function runPrimitiveTool(stage: HTMLElement, tool: string): Promise<PrimitiveToolReport> {
  let report: PrimitiveToolReport;
  try {
    report = tool === "instance-grid" ? await runInstanceGrid(stage) : tool === "box-uploads" ? await runBoxUploads(stage) : await runPrimitive(stage);
  } catch (error) {
    report = { tool, setOutputPresent: false, errors: [errorText(error)] };
  }
  window.__QR_SPEC__ = report;
  return report;
}
