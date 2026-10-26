import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { shootGame, type GameShot } from "./shotsd-lib";

// Final screenshot retake for Teleoperator after the art pass (remote only, software WebGL2): same states as the group D capture, served by the example dev server.
const CFG: GameShot = {"slug":"teleoperator","waitGoneText":"LOADING FLEET","route":"/apps/showcase-teleoperator/","modes":[{"name":"fare","click":"#bNextFare"}],"keys":[["KeyW"],["KeyW","KeyD"],["KeyW","KeyA"]],"holdMs":2500,"resultsWaitMs":10000};

test.setTimeout(3_000_000);

test("p1tele shots", async ({ browser }) => {
  const server = await startExampleDevServer();
  try {
    await shootGame(browser, CFG, server.origin);
  } finally {
    await server.close();
  }
});
