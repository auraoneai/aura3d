import path from "node:path";
import { test } from "@playwright/test";
import { serve, shootGame, type GameShot } from "./shotsd-lib";

const CFG: GameShot = {"slug":"cross-hop","route":"/apps/showcase-cross-hop/","query":"autostart=1","autoParam":"autoplay=1","keys":[["ArrowUp"],["ArrowUp"],["ArrowLeft"]],"holdMs":400};

test.setTimeout(3_000_000);

test("shotsd cross-hop", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  await shootGame(browser, CFG, origin);
  await close();
});
