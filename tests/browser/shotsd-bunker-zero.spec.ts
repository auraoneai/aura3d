import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"bunker-zero","route":"/apps/showcase-bunker-zero/","play":"#bz-btn-play","modes":[{"name":"menu","click":"#bz-btn-menu"}],"keys":[["KeyW"],["KeyD"],["KeyJ"]]};

test.setTimeout(3_000_000);

test("shotsd bunker-zero", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
