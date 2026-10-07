/* T4.2 (PRD-15 Phase 4) — mountRenderer strict behaviour.
 *
 *   strict on  → a C-29 `Renderer.create` that rejects surfaces as
 *                AuraRuntimeError("renderer-mount-failed") with the original
 *                error as `cause`; the non-production mode branch is skipped.
 *   strict off → the legacy safe-basic fallback still runs.
 *
 * T4.3 (errorOverlay) — the overlay's details contract and DOM attach are
 * covered here against a minimal document double; the browser-level axe /
 * focusability check runs on macos-14 per the PRD.
 */
import "@aura3d/engine";
import { describe, expect, it, vi } from "vitest";
import { AuraRuntimeError } from "../../../../packages/engine/src/agent-api/app/errors";
import { attachErrorOverlay, errorOverlayDetails } from "../../../../packages/engine/src/agent-api/app/errorOverlay";
import { createProductionSceneRenderer } from "../../../../packages/engine/src/agent-api/app/mountRenderer";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/nodes/types";

const MOUNT_FAILURE = new Error("WebGL2 context creation failed");

/* C-29 Renderer.create test double: always rejects. Only members reached
 * before the rejection (create itself) need stubbing — mountRenderer wraps the
 * rejection, so deeper renderer surface is never touched. */
vi.mock("@aura3d/rendering", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aura3d/rendering")>();
  return {
    ...actual,
    Renderer: { ...actual.Renderer, create: async () => { throw MOUNT_FAILURE; } }
  };
});

const FAKE_WEBGL_RENDERER = { kind: "legacy-webgl-fallback", dispose: () => undefined };
vi.mock("../../../../packages/engine/src/agent-api/compiler/webglRuntime", () => ({
  createWebGLSceneRenderer: async () => FAKE_WEBGL_RENDERER
}));

const eligibleSnapshot = (): AuraSceneSnapshot =>
  ({ nodes: [primitives.box({ size: 1 }).toJSON()], camera: { mode: "orbit", position: [0, 0, 5], target: [0, 0, 0] } });
const canvas = () => ({ width: 800, height: 600, getContext: () => null }) as unknown as HTMLCanvasElement;

describe("T4.2 strict renderer mount", () => {
  it("strict: Renderer.create rejection becomes AuraRuntimeError renderer-mount-failed with cause", async () => {
    let thrown: unknown;
    try {
      await createProductionSceneRenderer(canvas(), eligibleSnapshot(), undefined, undefined, resolveQrFlags({}), { strict: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AuraRuntimeError);
    expect((thrown as AuraRuntimeError).code).toBe("renderer-mount-failed");
    expect((thrown as AuraRuntimeError).cause).toBe(MOUNT_FAILURE);
  });

  it("strict: the non-production mode branch is skipped", async () => {
    let thrown: unknown;
    try {
      await createProductionSceneRenderer(
        canvas(),
        eligibleSnapshot(),
        { mode: "webgl" } as never,
        undefined,
        resolveQrFlags({}),
        { strict: true }
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AuraRuntimeError);
    expect((thrown as AuraRuntimeError).code).toBe("renderer-mount-failed");
  });

  it("flag off: the legacy safe-basic fallback still runs", async () => {
    const renderer = await createProductionSceneRenderer(canvas(), eligibleSnapshot(), undefined, undefined, resolveQrFlags({}));
    expect(renderer).toBe(FAKE_WEBGL_RENDERER);
  });

  it("flag off: explicit non-production mode still takes the legacy branch", async () => {
    const renderer = await createProductionSceneRenderer(canvas(), eligibleSnapshot(), { mode: "webgl" } as never, undefined, resolveQrFlags({}));
    expect(renderer).toBe(FAKE_WEBGL_RENDERER);
  });
});

describe("T4.3 errorOverlay", () => {
  it("details carry code, message and the first 5 cause.stack lines", () => {
    const cause = new Error("root cause");
    const err = new AuraRuntimeError("renderer-mount-failed", "mount exploded", { cause });
    const details = errorOverlayDetails(err);
    expect(details.code).toBe("renderer-mount-failed");
    expect(details.message).toBe("mount exploded");
    expect(details.stackLines.length).toBeGreaterThan(0);
    expect(details.stackLines.length).toBeLessThanOrEqual(5);
    expect(details.stackLines[0]).toContain("root cause");
  });

  it("attaches a role=alert overlay with a focusable copy button", () => {
    const elements: FakeElement[] = [];
    const fakeDoc = {
      createElement: (tag: string) => {
        const el = makeFakeElement(tag);
        elements.push(el);
        return el;
      }
    } as unknown as Document;
    const parent = makeFakeElement("div");
    parent.style.position = "static";
    const canvasEl = { parentElement: parent, ownerDocument: fakeDoc } as unknown as HTMLCanvasElement;
    const err = new AuraRuntimeError("renderer-mount-failed", "mount exploded", { cause: new Error("root cause") });

    const overlay = attachErrorOverlay(canvasEl, err, fakeDoc);
    expect(overlay).toBeDefined();
    expect(parent.children.length).toBe(1);
    const el = overlay as unknown as FakeElement;
    expect(el.attributes.get("role")).toBe("alert");
    expect(el.attributes.get("aria-live")).toBe("assertive");
    const button = elements.find((item) => item.tag === "button");
    expect(button).toBeDefined();
    expect(button?.textContent).toBe("Copy details");
    const strong = elements.find((item) => item.tag === "strong");
    expect(strong?.textContent).toContain("renderer-mount-failed");
  });
});

interface FakeElement {
  tag: string;
  type?: string;
  textContent?: string;
  dataset: Record<string, string>;
  style: Record<string, string>;
  attributes: Map<string, string>;
  children: FakeElement[];
  listeners: Map<string, () => void>;
  setAttribute(name: string, value: string): void;
  append(...nodes: FakeElement[]): void;
  addEventListener(name: string, cb: () => void): void;
}

function makeFakeElement(tag: string): FakeElement {
  return {
    tag,
    dataset: {},
    style: {},
    attributes: new Map(),
    children: [],
    listeners: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(name, cb) { this.listeners.set(name, cb); }
  };
}
