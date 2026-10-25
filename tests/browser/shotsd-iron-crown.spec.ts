import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"iron-crown","route":"/apps/showcase-iron-crown/","auto":"#ic-autopilot","modes":[{"name":"versus","click":"[data-mode=\"versus\"]"},{"name":"lab","click":"[data-mode=\"lab\"]"}],"keys":[["KeyD"],["KeyJ"],["KeyK"]]};

test.setTimeout(3_000_000);

test("shotsd iron-crown", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
