import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"teleoperator","waitGoneText":"LOADING FLEET","route":"/apps/showcase-teleoperator/","modes":[{"name":"fare","click":"#bNextFare"}],"keys":[["KeyW"],["KeyW","KeyD"],["KeyW","KeyA"]],"holdMs":2500,"resultsWaitMs":10000};

test.setTimeout(3_000_000);

test("shotsd teleoperator", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
