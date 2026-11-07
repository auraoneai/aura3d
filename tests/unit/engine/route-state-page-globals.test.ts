import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/engine/src/agent-api/diagnostics", () => ({ snapshotDiagnostics: (d: unknown) => d }));

import { enrollRouteState, markRouteReady, releaseRouteState, updateRouteDiagnostics } from "../../../packages/engine/src/agent-api/app/routeState";
import { registerAuraApp, unregisterAuraApp } from "../../../packages/engine/src/agent-api/app/liveApps";

type Page = { document?: unknown; window?: unknown };
const page = globalThis as unknown as Page & Record<string, unknown>;

function fakePage() {
  const dataset: Record<string, string> = {};
  page.document = { body: { dataset } };
  page.window = page;
  return dataset;
}

const diagnostics = (drawCalls = 3) => ({ drawCalls, renderer: { runtime: { backend: "webgl2" }, rendererMode: "forward" } }) as never;
const snapshot = { nodes: [] } as never;

afterEach(() => {
  delete page.document;
  delete page.window;
  delete page.__AURA3D_ROUTE_READY__;
  delete page.__AURA3D_LIVE_APPS__;
  delete page.__A3D_SHADOW_TAP_TIER__;
});

describe("page-global route state (R-02)", () => {
  it("an app that never enrolled leaves body.dataset and window untouched", () => {
    const dataset = fakePage();
    const d = diagnostics();
    markRouteReady(snapshot, d);
    updateRouteDiagnostics(d);
    expect(dataset).toEqual({});
    expect("__AURA3D_ROUTE_READY__" in page).toBe(false);
  });

  it("an enrolled app publishes, and the last release clears every key", () => {
    const dataset = fakePage();
    const a = diagnostics();
    const b = diagnostics(5);
    enrollRouteState(a);
    enrollRouteState(b);
    markRouteReady(snapshot, a);
    expect(dataset.aura3dReady).toBe("true");
    expect(page.__AURA3D_ROUTE_READY__).toBeDefined();
    releaseRouteState(a);
    expect(dataset.aura3dReady).toBe("true");
    releaseRouteState(b);
    expect(Object.keys(dataset).filter((key) => key.startsWith("aura3d"))).toEqual([]);
    expect("__AURA3D_ROUTE_READY__" in page).toBe(false);
  });

  it("a disposed app cannot write again from a late mount settle", () => {
    const dataset = fakePage();
    const a = diagnostics();
    enrollRouteState(a);
    releaseRouteState(a);
    markRouteReady(snapshot, a);
    expect(dataset).toEqual({});
  });

  it("an opted-out app does not update draw calls published by a legacy app", () => {
    const dataset = fakePage();
    const legacy = diagnostics(2);
    const embedded = diagnostics(99);
    enrollRouteState(legacy);
    markRouteReady(snapshot, legacy);
    updateRouteDiagnostics(embedded);
    expect(dataset.aura3dDrawCalls).toBe("2");
  });
});

describe("live app registry global", () => {
  const app = (name: string) => ({ name }) as never;

  it("publish:false registers without writing globalThis", () => {
    const a = app("a");
    registerAuraApp(a, { publish: false });
    expect("__AURA3D_LIVE_APPS__" in page).toBe(false);
    unregisterAuraApp(a);
  });

  it("removes the registry and compiler evidence globals with the last publishing app", () => {
    const a = app("a");
    const b = app("b");
    registerAuraApp(a);
    registerAuraApp(b);
    page.__A3D_SHADOW_TAP_TIER__ = { tier: 8 };
    unregisterAuraApp(a);
    expect(page.__AURA3D_LIVE_APPS__).toBeDefined();
    expect(page.__A3D_SHADOW_TAP_TIER__).toBeDefined();
    unregisterAuraApp(b);
    expect("__AURA3D_LIVE_APPS__" in page).toBe(false);
    expect("__A3D_SHADOW_TAP_TIER__" in page).toBe(false);
  });
});
