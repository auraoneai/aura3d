/**
 * PRD-01 §6.9 pixel ratio, app side (#1083 GPU dpr.spec: backing 1.5× CSS at
 * DSF 1/2/3). Under A3D_QR_CORE the engine resolves
 * min(devicePixelRatio, tier.maxPixelRatio) (explicit wins) instead of the
 * production profile's fixed 1.5, and the 320×220 backing minimum is gone.
 * Flag-off keeps the legacy chain.
 */

import { describe, expect, it } from "vitest";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { resolveCanvasPixelRatio } from "../../../../packages/rendering/src/renderer/PixelRatio";
import { appTierMaxPixelRatio, minimumBackingSize, resolveAppPixelRatio } from "../../../../packages/engine/src/agent-api/app/pixelRatio";
import { configureCanvas } from "../../../../packages/engine/src/agent-api/app/canvas";
import { resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";

const PRODUCTION_PROFILE_RATIO = 1.5;
const legacy = () => 1.75;

function app(flagOn: boolean, devicePixelRatio: number, option?: number | { max?: number }) {
  return resolveAppPixelRatio({
    flagOn,
    option: option as never,
    profilePixelRatio: PRODUCTION_PROFILE_RATIO,
    maxPixelRatio: appTierMaxPixelRatio(resolveMountQuality(undefined).tier),
    devicePixelRatio,
    legacyDevicePixelRatio: legacy
  });
}

function stubCanvas(cssWidth: number, cssHeight: number): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    clientWidth: cssWidth,
    clientHeight: cssHeight,
    parentElement: null,
    getBoundingClientRect: () => ({ width: cssWidth, height: cssHeight }),
    hasAttribute: () => false,
    getAttribute: () => null
  } as unknown as HTMLCanvasElement;
}

describe("§6.9 resolveCanvasPixelRatio", () => {
  it.each([[1, 1], [2, 2], [3, 2]])("High tier: dsf %d → %d", (dpr, want) => {
    expect(resolveCanvasPixelRatio({ devicePixelRatio: dpr, tier: QUALITY_TIERS.high })).toBe(want);
  });
  it("Ultra cap 3: no [1, 2] clamp", () => {
    expect(resolveCanvasPixelRatio({ devicePixelRatio: 3, tier: QUALITY_TIERS.ultra })).toBe(3);
  });
});

describe("app pixel ratio (createAuraApp / frameLoop)", () => {
  it("default mount tier is High (cap 2)", () => {
    expect(appTierMaxPixelRatio(resolveMountQuality(undefined).tier)).toBe(2);
  });
  it.each([[1, 1], [2, 2], [3, 2]])("core: dsf %d → %d, not the production profile 1.5", (dpr, want) => {
    expect(app(true, dpr)).toBe(want);
  });
  it("core: explicit pixelRatio (number or { max }) wins", () => {
    expect(app(true, 3, 1.25)).toBe(1.25);
    expect(app(true, 3, { max: 1 })).toBe(1);
  });
  it("flag-off: legacy chain explicit ?? profile ?? device", () => {
    expect(app(false, 1)).toBe(PRODUCTION_PROFILE_RATIO);
    expect(app(false, 3, 1.25)).toBe(1.25);
    expect(resolveAppPixelRatio({ flagOn: false, option: undefined, profilePixelRatio: undefined, maxPixelRatio: 2, devicePixelRatio: 3, legacyDevicePixelRatio: legacy })).toBe(1.75);
  });
  it("core backing for CSS 320×180 at ratio 1 is exactly 320×180 (no 220 minimum)", () => {
    const canvas = stubCanvas(320, 180);
    configureCanvas(canvas, 1, true, minimumBackingSize(true));
    expect([canvas.width, canvas.height]).toEqual([320, 180]);
  });
  it("flag-off keeps the legacy 320×220 minimum", () => {
    const canvas = stubCanvas(320, 180);
    configureCanvas(canvas, 1, true, minimumBackingSize(false));
    expect([canvas.width, canvas.height]).toEqual([320, 220]);
  });
});
