import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { captureFlagList, captureUrlWithFlags } from "../../../tools/quality-rebuild-capture/capture-flags.mjs";

// A games.json-style default list (lane flags + a route flag), as unioned in #626.
const gameDefaults = ["game", "camera", "world", "route.bank_shot"];

function resolvedFromUrl(url: string) {
  const list = new URL(url, "http://x").searchParams.get("a3d-qr");
  return resolveQrFlags({ options: list === null ? [] : [list], env: {} });
}

describe("#626 capture flags: exact mode", () => {
  it("exact `none` yields an empty flag set (no games.json defaults armed)", () => {
    const flags = captureFlagList(gameDefaults, "none", true);
    expect(flags).toEqual(["none"]);
    const resolved = resolvedFromUrl(captureUrlWithFlags("/game/", flags));
    for (const name of ["A3D_QR_GAME", "A3D_QR_CAMERA", "A3D_QR_WORLD", "A3D_QR_ROUTE_BANK_SHOT"]) {
      expect(resolved.on(name as never), name).toBe(false);
    }
  });

  it("exact `route.bank_shot` yields only that route flag", () => {
    const flags = captureFlagList(gameDefaults, "route.bank_shot", true);
    expect(flags).toEqual(["route.bank_shot"]);
    const resolved = resolvedFromUrl(captureUrlWithFlags("/game/?x=1", flags));
    expect(resolved.on("A3D_QR_ROUTE_BANK_SHOT" as never)).toBe(true);
    expect(resolved.on("A3D_QR_GAME" as never)).toBe(false);
    expect(resolved.on("A3D_QR_WORLD" as never)).toBe(false);
    // A3D_QR_CAMERA was promoted to `default-on` (1e0871749, flags.state.ts;
    // §5.3 promotion: on unless a source sets it). Exact mode must not arm it
    // from games.json, so it resolves to its registry default, nothing more.
    const registryDefault = resolveQrFlags({ options: [], env: {} });
    expect(resolved.on("A3D_QR_CAMERA" as never)).toBe(registryDefault.on("A3D_QR_CAMERA" as never));
  });

  it("exact `all` passes through unchanged", () => {
    expect(captureFlagList(gameDefaults, "all", true)).toEqual(["all"]);
  });

  it("default (union) mode keeps the historical games.json union", () => {
    expect(captureFlagList(gameDefaults, "none", false)).toEqual(gameDefaults);
    expect(captureFlagList(gameDefaults, "all", false)).toEqual([...gameDefaults, "all"]);
    expect(captureFlagList(undefined, "none", false)).toEqual([]);
    expect(captureUrlWithFlags("/g/", [])).toBe("/g/");
  });
});
