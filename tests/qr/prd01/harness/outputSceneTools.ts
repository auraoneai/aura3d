/**
 * Lane-01 row 01-S10, engine half (?tools=output-scene&case=…): the C-05
 * output surface through `createAuraApp` (Aura at 0,0) next to a three r185
 * reference (at HALF_W,0). The spec reads pixels from page screenshots.
 *
 *   case=emissive4  tm=<op>       unlit quad, emissive linear 4.0, dither off
 *   case=bg         toneMapped=0|1 additive=0|1
 *                                  `#336699` background (aces, dither off),
 *                                  optional additive emissive 4.0 quad on top
 *   case=exposure   exp=<n>       operator `linear`, emissive 0.1 → exposure
 *   case=overlay                  `window.__QR_SPEC_APPLY__()` sets a zero
 *                                  overlay and re-renders (bit identity)
 */

import * as THREE from "three";
import { camera, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp, AuraColor, AuraMaterialSpec } from "@aura3d/engine";
import { errorText, HALF_H, HALF_W, mountAura, mountThree, nextFrame, param, placeCanvas, settleAura, settleThree, THREE_TONE_MAPPING } from "./specKit";

declare global {
  interface Window {
    __QR_SPEC_APPLY__?: () => Promise<void>;
  }
}

export interface OutputSceneReport {
  readonly case: string;
  readonly toneMapping: string;
  readonly exposure: number;
  readonly setOutputPresent: boolean;
  readonly overlayResult: unknown;
  readonly output: unknown;
  readonly errors: readonly string[];
}

const CAMERA = { fov: 50, position: [0, 0, 3] as [number, number, number] };

/**
 * Emission only (black albedo, no IBL response), matching three's unlit
 * MeshBasicMaterial reference: a white-albedo PBR quad also received the
 * fallback light rig + default IBL, which AgX resolves (+3 codes at 4.0).
 */
function emissive(intensity: number, extra: Partial<AuraMaterialSpec> = {}): AuraMaterialSpec {
  return {
    ...material.emissive({ color: "#000000", emissive: "#ffffff", emissiveIntensity: intensity, metalness: 0, roughness: 1, envMapIntensity: 0 }),
    ...extra
  } as AuraMaterialSpec;
}

type BackgroundFn = (color: AuraColor, options?: { readonly toneMapped?: boolean }) => unknown;

export async function runOutputSceneTool(stage: HTMLElement): Promise<OutputSceneReport> {
  const errors: string[] = [];
  const which = param("case") ?? "emissive4";
  const toneMapping = param("tm") ?? (which === "exposure" ? "linear" : "aces");
  const exposure = Number(param("exp") ?? "1");
  const toneMapped = param("toneMapped") === "1";
  const additive = param("additive") === "1";
  let setOutputPresent = false;
  let overlayResult: unknown = null;
  let app: AuraApp | null = null;

  try {
    // ---------------- Aura ----------------
    const builder = scene().camera(camera.perspective({ fov: CAMERA.fov, position: CAMERA.position, target: [0, 0, 0] }));
    if (which === "bg") {
      // C-05 `scene().background(color, { toneMapped })` (PR 0a signature).
      (builder.background as unknown as BackgroundFn).call(builder, "#336699", { toneMapped });
      if (additive) {
        builder.add(primitives.box({ name: "additive-quad", material: emissive(4, { blend: "additive" } as Partial<AuraMaterialSpec>), size: [0.8, 0.8, 0.02] }));
      } else {
        // A background-only snapshot never mounts the WebGL renderer
        // (createAuraApp gates the production mount on renderable content), so
        // the C-05 path was not exercised. A small corner anchor mounts it; the
        // spec reads the centre pixel, which stays pure background.
        builder.add(primitives.box({ name: "bg-anchor", material: emissive(0), size: [0.1, 0.1, 0.02] }).position(1.6, 0.9, 0));
      }
    } else {
      builder.background("#000000");
      const level = which === "exposure" ? 0.1 : which === "overlay" ? 0.6 : 4;
      builder.add(primitives.box({ name: "full-quad", material: emissive(level), size: [12, 12, 0.02] }));
    }
    const auraCanvas = placeCanvas(stage, 0, 0, HALF_W, HALF_H, "qr-output-aura");
    app = await mountAura(auraCanvas, builder.toJSON());
    setOutputPresent = typeof app.setOutput === "function";
    app.setOutput?.({ toneMapping: toneMapping as never, exposure, dither: false });
    await settleAura(app, 4);

    if (which === "overlay") {
      const live = app;
      window.__QR_SPEC_APPLY__ = async () => {
        overlayResult = live.setOutputOverlay?.({ flash: [0, 0, 0, 0], vignette: [0, 0, 0, 0], fade: [0, 0, 0, 0] }) ?? "setOutputOverlay missing";
        await settleAura(live, 4);
        (window.__QR_SPEC__ as { overlayResult?: unknown }).overlayResult = overlayResult;
      };
    }

    // ---------------- three r185 ----------------
    const threeCanvas = placeCanvas(stage, HALF_W, 0, HALF_W, HALF_H, "qr-output-three");
    const three = await mountThree(threeCanvas, {
      toneMapping,
      exposure,
      fov: CAMERA.fov,
      position: CAMERA.position,
      background: which === "bg" ? "#336699" : "#000000"
    });
    const linear336699 = new THREE.Color("#336699"); // three converts the sRGB hex to linear working space
    if (which === "bg") {
      if (toneMapped) {
        // three never tone-maps a clear color: the tone-mapped reference is an unlit full-frame plane.
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: linear336699.clone() }));
        plane.position.z = -0.5;
        three.scene.add(plane);
      }
      if (additive) {
        // encode(ACES(linear(#336699) + 4.0)) — the analytic expectation of an additive 4.0 quad.
        const sum = new THREE.Color(linear336699.r + 4, linear336699.g + 4, linear336699.b + 4);
        three.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: sum })));
      }
    } else {
      const level = which === "exposure" ? 0.1 : which === "overlay" ? 0.6 : 4;
      three.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(level, level, level) })));
    }
    three.renderer.toneMapping = THREE_TONE_MAPPING[toneMapping] ?? THREE.NoToneMapping;
    await settleThree(three);
    await nextFrame();
  } catch (error) {
    errors.push(errorText(error));
  }

  const diagnostics = app ? (app.diagnostics() as unknown as { output?: unknown; errors: readonly string[] }) : null;
  if (diagnostics) errors.push(...diagnostics.errors);
  const report: OutputSceneReport = {
    case: which,
    toneMapping,
    exposure,
    setOutputPresent,
    overlayResult,
    output: diagnostics?.output ?? null,
    errors
  };
  window.__QR_SPEC__ = report;
  return report;
}
