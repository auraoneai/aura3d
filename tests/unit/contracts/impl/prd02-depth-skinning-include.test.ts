// #1141: under A3D_QR_LIGHTING the skinned prd02 depth variant failed to
// compile on the L4 GPU ("'include' : invalid directive name", then
// "'a3dSkinMatrix4' : no matching overloaded function") because the shader
// wrote `#include skinning_common` and the preprocessor only expands
// `#include <name>`. Scene 08-skinned-character rendered no draws.
import { describe, expect, it, vi } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { identityMat4 } from "@aura3d/scene";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { createLeanCoreShaderLibrary } from "../../../../packages/rendering/src/ShaderLibraryCore";
import {
  activeDepthFeatures,
  prd02DepthProgram,
  registerPrd02DepthShader,
  resolvePrd02ShadowCasterVariant
} from "../../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });

describe("#1141 skinned prd02 depth variant", () => {
  it("expands skinning_common so the vertex stage defines a3dSkinMatrix4", () => {
    const skinned = {
      geometry: Geometry.triangle(),
      modelMatrix: identityMat4(),
      label: "skinned caster",
      skinning: { jointCount: 2, matrices: new Float32Array(32) }
    } as RenderItem;
    const features = activeDepthFeatures(FLAGS_ON);
    const key = resolvePrd02ShadowCasterVariant(skinned, FLAGS_ON, QUALITY_TIERS.high, features);
    expect(key.skinning).toBe(4);
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const device = new MockRenderDevice();
    const vertices: string[] = [];
    const create = device.createShaderProgram.bind(device);
    vi.spyOn(device, "createShaderProgram").mockImplementation((descriptor) => {
      vertices.push(descriptor.vertex);
      return create(descriptor);
    });
    prd02DepthProgram(device, library, key, features);
    expect(vertices).toHaveLength(1);
    expect(vertices[0]).not.toMatch(/^\s*#include/m);
    expect(vertices[0]).toContain("mat4 a3dSkinMatrix4(vec4 joints, vec4 weights)");
    expect(vertices[0]).toContain("a3dSkinMatrix4(a_joints, a_weights)");
  });
});
