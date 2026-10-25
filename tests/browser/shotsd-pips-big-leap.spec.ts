import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"pips-big-leap","route":"/apps/showcase-pips-big-leap/","play":"#aura-btn-play","autoParam":"autoplay=1","modes":[{"name":"atlas","click":"#aura-btn-atlas"}],"keys":[["ArrowRight"],["Space"],["ArrowRight","Space"]]};

test.setTimeout(3_000_000);

test("shotsd pips-big-leap", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
