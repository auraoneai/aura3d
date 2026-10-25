import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"dot-dash-3d","route":"/apps/showcase-dot-dash-3d/","play":"#dd-btn-play","autoParam":"autoplay=1","modes":[{"name":"circuit","click":"#dd-btn-circuit"}],"keys":[["ArrowRight"],["ArrowDown"],["ArrowLeft"]]};

test.setTimeout(3_000_000);

test("shotsd dot-dash-3d", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
