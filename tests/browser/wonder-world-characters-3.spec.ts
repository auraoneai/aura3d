/**
 * Wonder World character sheets, part 3 of 3: Lumi (E03 alphabet-zoo) and Peeko (G04 peekaboo-animal-barn; E02 keeps
 * Peeko hidden behind a door in every wide shot). PRD 02 section 2 character approval deliverables (gaps 02:28,
 * 02:29, 02:31/02:128, 02:34); Momo and Lulu are in wonder-world-characters.spec.ts, Sheru and GoGo in
 * wonder-world-characters-2.spec.ts, and wonder-world-capture-lib.ts describes what each sheet holds and asserts.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh characters-3   (about 35 min)
 *
 * Records: WWJSON char-lumi, char-peeko and chars-lumi-peeko-summary; WWSHOT char-<id>-phone,
 * char-<id>-turn-<front|left|back|right>, char-<id>-pose-<neutral|delighted|curious|surprised|waiting|good-bye>.
 */
import { defineCharacterSheetSuite } from "./wonder-world-capture-lib";
import { CHARACTER_STORIES } from "./wonder-world-lib";

defineCharacterSheetSuite({
  title: "Wonder World character sheets (Lumi, Peeko)",
  characters: CHARACTER_STORIES.filter((entry) => entry.character === "lumi" || entry.character === "peeko")
});
