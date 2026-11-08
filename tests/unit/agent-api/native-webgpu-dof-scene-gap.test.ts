import { afterEach, describe, expect, it } from "vitest";
import { effects, material, primitives, scene } from "../../../packages/engine/src/agent-api/index";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess";
import { recordAuthoredPostContext, resetAuthoredPostContext } from "../../../packages/engine/src/agent-api/postBridge";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";

type Gap = { code: string; missing: string[] } | undefined;
const postGap = (createProductionRuntimePostprocess as unknown as Record<symbol, (snapshot: unknown, canvas: unknown, dofGap?: (post: unknown) => Gap) => Gap>)[
  Symbol.for("@aura3d/root-postprocess/webgpu-post-gap/v1")];
const dofGap = (Renderer as unknown as Record<symbol, (post: unknown) => Gap>)[Symbol.for("@aura3d/rendering/webgpu-dof-gap/v1")];
const canvas = { width: 8, height: 8 } as unknown as HTMLCanvasElement;

afterEach(() => resetAuthoredPostContext());

describe("pre-mount native depth-of-field scene gap", () => {
  it("admits opaque unlit primitives and reports anything the native route cannot draw", () => {
    recordAuthoredPostContext({ flags: createTrustedQrFlags({ A3D_QR_POST: true }), options: {} }, { canvas } as never);
    const post = () => scene().add(effects.depthOfField({ focusDistance: 3 })).add(effects.antiAlias({ mode: "off" }))
      .add(effects.vignette({ intensity: 0.3 }));
    const unlit = post().add(primitives.box({ material: material.pbr({ unlit: true, color: "#ff8800" }) })).toJSON();
    expect(postGap(unlit, canvas, dofGap)).toBeUndefined();
    const lit = post().add(primitives.box({ material: material.pbr({ color: "#ff8800" }) })).toJSON();
    expect(postGap(lit, canvas, dofGap)).toEqual({ code: "NATIVE_DOF_SCENE_UNSUPPORTED", missing: ["non-unlit-material"] });
    const noDof = scene().add(effects.antiAlias({ mode: "off" })).add(primitives.box({ material: material.pbr({ color: "#ff8800" }) })).toJSON();
    expect(postGap(noDof, canvas, dofGap)).toBeUndefined();
    const foggy = post().add(effects.fog({ density: 0.02 })).add(primitives.box({ material: material.pbr({ unlit: true, color: "#ff8800" }) })).toJSON();
    expect(postGap(foggy, canvas, dofGap)).toEqual({ code: "NATIVE_DOF_SCENE_UNSUPPORTED", missing: ["effect-fog"] });
  });
});
