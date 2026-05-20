import { expect, test } from "@playwright/test";
import {
  V8_ROUTE_HEALTH_ORIGIN,
  evaluateV8Route,
  type V8RouteLink
} from "../../tools/v8-route-health/index";

test.describe("V8 V7 animation startup truth", () => {
  test("shows visible content quickly and does not claim running before frames exist", async ({ page }) => {
    const route: V8RouteLink = {
      label: "V7 Animation Keyframes",
      href: `${V8_ROUTE_HEALTH_ORIGIN}/apps/v7-animation-keyframes/`,
      path: "/apps/v7-animation-keyframes/",
      declaredStatus: "working"
    };
    const result = await evaluateV8Route(page, route);
    const runtime = await page.evaluate(() => (window as typeof window & {
      __g3dV7AnimationKeyframes?: { readonly status: string; readonly frameCount: number; readonly drawCalls?: number };
    }).__g3dV7AnimationKeyframes);

    expect(result.visible, result.failures.join("\n")).toBe(true);
    expect(result.firstVisibleTimeMs, result.failures.join("\n")).toBeLessThanOrEqual(500);
    expect(result.readyTimeMs, result.failures.join("\n")).toBeLessThanOrEqual(5_000);
    expect(result.status, result.failures.join("\n")).toBe("ready");
    if (runtime?.status === "running") {
      expect(runtime.frameCount).toBeGreaterThan(0);
    }
    expect(runtime?.frameCount ?? 0).toBeGreaterThan(0);
    expect(runtime?.drawCalls ?? 0).toBeGreaterThan(0);
  });
});
