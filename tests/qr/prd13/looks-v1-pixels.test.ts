// QR-13: a v1 `{ kind: "look" }` node (all flags on, every v1 contract
// provided) used to carry no children — its HDRI, key light, fog and grade
// were only re-dispatched to lane handlers that record features, so the
// production light/environment path never saw them (looks byte-identical to
// flags-off on an L4). The look must lower into renderable nodes on the same
// flatten every draw-path consumer uses.
import { afterEach, describe, expect, it } from "vitest";
import { looks, resolveQrFlags, scene } from "../../../packages/engine/src";
import { resolveLookExpansion } from "../../../packages/engine/src/lanes/prd13";
import { groups } from "../../../packages/engine/src/agent-api/nodes/groups";
import { flattenSceneNodesV2 } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createProductionRuntimeCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";
import type { AuraSceneNode } from "../../../packages/engine/src";

const ALL = "core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler";
const flags = resolveQrFlags({ url: `http://bench/?a3d-qr=${ALL}` });
const look = looks.list().find((id) => looks.describe(id).v0.hdri !== null) ?? looks.list()[0];
const v1 = (): AuraSceneNode => looks.preset(look, undefined, { flags }) as unknown as AuraSceneNode;
const names = (nodes: readonly AuraSceneNode[]) => nodes.map((n) => `${n.kind}:${(n as { name?: string }).name ?? ""}`);
const prevEnv = process.env.A3D_QR_LOOKS;
afterEach(() => {
  if (prevEnv === undefined) delete process.env.A3D_QR_LOOKS;
  else process.env.A3D_QR_LOOKS = prevEnv;
});

describe("QR-13 v1 look output reaches the draw path", () => {
  it("all flags select the v1 look node", () => {
    expect(resolveLookExpansion({ flags }).expansion).toBe("v1-contracts");
    expect(v1().kind).toBe("look");
  });

  it("legacy and C-06 flatten keep the look node and splice its lowered children", () => {
    const v0Children = names(groups.flatten([looks.preset(look).toJSON()]));
    for (const flat of [groups.flatten([v1()]), flattenSceneNodesV2([v1()])]) {
      expect(flat[0]?.kind).toBe("look");
      expect(names(flat.slice(1))).toEqual(v0Children);
      expect(names(flat)).toContain("light:look key light");
      if (looks.describe(look).v0.hdri !== null) expect(flat.some((n) => n.kind === "environment")).toBe(true);
    }
  });

  it("repeated and mixed flatten paths do not duplicate look children", () => {
    const authored = v1();
    for (const first of [groups.flatten([authored]), flattenSceneNodesV2([authored])]) {
      expect(names(groups.flatten(first))).toEqual(names(first));
      expect(names(flattenSceneNodesV2(first))).toEqual(names(first));
    }
    // Flattening does not mark or mutate the authored input.
    expect(names(groups.flatten([authored]))).toEqual(names(groups.flatten([authored])));
  });

  it("the production light collector draws the look key light, not fallback lights", () => {
    const snapshot = scene().background("#101010").add(v1()).toJSON();
    const lights = createProductionRuntimeCollectedLights(snapshot);
    const v0Lights = createProductionRuntimeCollectedLights(scene().background("#101010").add(looks.preset(look)).toJSON());
    // Same lights as the v0 group draws (ids are positional, so compare shape).
    const shape = (list: typeof lights) => JSON.stringify(list).replace(/"node-\d+"/g, '"node"');
    expect(shape(lights)).toEqual(shape(v0Lights));
    expect(JSON.stringify(lights)).toContain("look key light");
  });

  it("an unset background takes the v1 look's backdrop (flag on)", () => {
    process.env.A3D_QR_LOOKS = "1";
    expect(scene().add(v1()).toJSON().background).toBe(looks.describe(look).v0.background);
  });
});
