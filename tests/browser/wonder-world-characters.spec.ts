/**
 * Wonder World character sheets, part 1 of 3: Momo (E01 momo-magic-mouth) and Lulu (E06 lulu-dino-dance). PRD 02
 * section 2 character approval deliverables (gaps 02:28 turnaround and 320 px silhouette, 02:29 expression sheet as
 * body poses, 02:31/02:128 talking pulse in browser capture, 02:34 low-motion pass); Sheru and GoGo are in
 * wonder-world-characters-2.spec.ts, Lumi and Peeko in wonder-world-characters-3.spec.ts. What each sheet holds and
 * asserts is described in wonder-world-capture-lib.ts: the phone wide shot with its silhouette check, the four-view
 * turnaround, the six poses, the talking pulse against silence and the reduced-motion pass, all canvas-only crops
 * around the character's nodeRect, with `?models=1&modelWaitMs=180000&manual=1`.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh characters   (about 35 min: one boot, two story loads
 * that wait for their models, about 30 small captures per character; three characters in one file took 49-52 min of
 * the runner's 60, so each file holds two)
 *
 * Records: WWJSON char-momo, char-lulu and chars-momo-lulu-summary; WWSHOT char-<id>-phone,
 * char-<id>-turn-<front|left|back|right>, char-<id>-pose-<neutral|delighted|curious|surprised|waiting|good-bye>.
 */
import { defineCharacterSheetSuite } from "./wonder-world-capture-lib";
import { CHARACTER_STORIES } from "./wonder-world-lib";

defineCharacterSheetSuite({
  title: "Wonder World character sheets (Momo, Lulu)",
  characters: CHARACTER_STORIES.filter((entry) => entry.character === "momo" || entry.character === "lulu")
});
