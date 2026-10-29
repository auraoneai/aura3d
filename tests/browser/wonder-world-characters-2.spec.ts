/**
 * Wonder World character sheets, part 2 of 3: Sheru (E17 sheru-big-adventure) and GoGo (G02 gogo-train). PRD 02
 * section 2 character approval deliverables (gaps 02:28, 02:29, 02:31/02:128, 02:34); Momo and Lulu are in
 * wonder-world-characters.spec.ts, Lumi and Peeko in wonder-world-characters-3.spec.ts, and
 * wonder-world-capture-lib.ts describes what each sheet holds and asserts.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh characters-2   (about 35 min)
 *
 * Records: WWJSON char-sheru, char-gogo and chars-sheru-gogo-summary; WWSHOT char-<id>-phone,
 * char-<id>-turn-<front|left|back|right>, char-<id>-pose-<neutral|delighted|curious|surprised|waiting|good-bye>.
 */
import { defineCharacterSheetSuite } from "./wonder-world-capture-lib";
import { CHARACTER_STORIES } from "./wonder-world-lib";

defineCharacterSheetSuite({
  title: "Wonder World character sheets (Sheru, GoGo)",
  characters: CHARACTER_STORIES.filter((entry) => entry.character === "sheru" || entry.character === "gogo")
});
