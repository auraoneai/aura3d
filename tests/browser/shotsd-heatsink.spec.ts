import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"heatsink","route":"/apps/showcase-heatsink/","modes":[{"name":"volt","click":"[data-drone=\"volt\"]"}],"keys":[["KeyW"],["KeyW","ShiftLeft"],["KeyW","KeyD"]],"holdMs":2500,"resultsWaitMs":10000};

test.setTimeout(3_000_000);

test("shotsd heatsink", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
