/**
 * GU47 phase 2 (receipt `outline-targets`, toon depth ink): `app.dispose()` releases the custom post passes the app
 * added. The C-13 pass registry is page-global, so before this fix a disposed app's pass stayed registered and the next
 * app on the page that added a pass with the same name threw `REGISTRY_DUPLICATE:prd03.custom.<name>` (the receipt
 * harness mounts one app per variant and adds `effects.toon({ name: "receipt-toon" })` to two of them).
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/engine/src/lanes/prd03";
import { appExtensionsAll } from "../../../../packages/engine/src/contracts/app";
import { Prd03PostSurface } from "../../../../packages/engine/src/agent-api/postBridge";
import { registeredPostPasses } from "../../../../packages/rendering/src/contracts/post";
import type { AuraCustomPostPass } from "../../../../packages/engine/src/contracts/post";

const POST_FLAGS = { on: (name: string) => name === "A3D_QR_POST", any: () => false } as never;

function pass(name: string): AuraCustomPostPass {
  return { name, insertAt: "before-tonemap", fragment: { glsl: "void main() { a3dOut = texture(u_color, v_uv); }" } } as AuraCustomPostPass;
}

const ids = () => registeredPostPasses().map((entry) => entry.id).filter((id) => id.startsWith("prd03.custom.gu47-dispose"));

describe("GU47 phase 2: custom post passes are released on app dispose", () => {
  it("a second surface can add a pass with the same name after the first is disposed", () => {
    const first = new Prd03PostSurface(POST_FLAGS);
    first.addPostPass(pass("gu47-dispose-toon"));
    expect(ids()).toEqual(["prd03.custom.gu47-dispose-toon"]);
    expect(() => new Prd03PostSurface(POST_FLAGS).addPostPass(pass("gu47-dispose-toon"))).toThrow("REGISTRY_DUPLICATE:prd03.custom.gu47-dispose-toon");
    first.dispose();
    expect(ids()).toEqual([]);
    const second = new Prd03PostSurface(POST_FLAGS);
    const release = second.addPostPass(pass("gu47-dispose-toon"));
    expect(ids()).toEqual(["prd03.custom.gu47-dispose-toon"]);
    release();
    second.dispose();
    release();
    expect(ids()).toEqual([]);
  });

  it("a release after dispose does not remove another surface's pass with the same name", () => {
    const first = new Prd03PostSurface(POST_FLAGS);
    const staleRelease = first.addPostPass(pass("gu47-dispose-shared"));
    first.dispose();
    const second = new Prd03PostSurface(POST_FLAGS);
    second.addPostPass(pass("gu47-dispose-shared"));
    staleRelease();
    expect(ids()).toEqual(["prd03.custom.gu47-dispose-shared"]);
    second.dispose();
    expect(ids()).toEqual([]);
  });

  it("the prd03.post app extension disposes its surface", () => {
    const extension = appExtensionsAll().find((entry) => entry.id === "prd03.post");
    expect(extension?.dispose).toBeTypeOf("function");
    const surface = new Prd03PostSurface(POST_FLAGS);
    surface.addPostPass(pass("gu47-dispose-ext"));
    extension!.dispose!(surface as never);
    expect(ids()).toEqual([]);
  });
});
