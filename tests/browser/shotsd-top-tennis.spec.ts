import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"top-tennis","route":"/apps/showcase-top-tennis/","play":"#aura-btn-play","auto":"#aura-btn-auto","modes":[{"name":"menu","click":"#aura-btn-menu"}],"keys":[["KeyD"],["Space"],["KeyA"]]};

test.setTimeout(3_000_000);

test("shotsd top-tennis", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
